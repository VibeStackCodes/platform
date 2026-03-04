/**
 * POST /api/agent
 * Single Orchestrator SSE endpoint — workflow suspend/resume
 *
 * New generation (no runId):
 *   POST { message, projectId, model? }
 *   → Analyst step runs, workflow suspends at approve-plan
 *   → Emits plan_ready + workflow_suspended with runId
 *
 * Resume after approval (runId present):
 *   POST { runId, approved: true }  → Build step runs, emits done
 *   POST { runId, approved: false, feedback? } → Workflow bailed, no build
 *
 * Response: SSE stream with AgentStreamEvent SSE events
 */

import crypto from 'node:crypto'
import { z } from 'zod'
import { describeRoute, resolver } from 'hono-openapi'
import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { RequestContext } from '@mastra/core/di'
import { traceAgent } from '../sentry'
import { mastra } from '../lib/agents/mastra'
import { isAllowedModel, MODEL_CONFIGS } from '../lib/agents/provider'
import { getProject, getUserCredits, updateProject } from '../lib/db/queries'
import { projects } from '../lib/db/schema'
import { reserveCredits, settleCredits } from '../lib/credits'
import { getSandbox } from '../lib/sandbox'
import { createSSEStream } from '../lib/sse'
import type { AgentStreamEvent, CreditsUsedEvent } from '../lib/types'
import { authMiddleware } from '../middleware/auth'
import { log } from '../lib/logger'
import { getLangfuseClient } from '../lib/agents/langfuse-client'
import { TOOL_LABELS } from '../lib/tool-labels'

// ---------------------------------------------------------------------------
// Request / response schemas
// ---------------------------------------------------------------------------

const AgentRequest = z.object({
  message: z
    .string()
    .min(1)
    .optional()
    .describe('User prompt describing the app to build or change (required for new generation)'),
  projectId: z.string().uuid().describe('Project ID to run the agent against'),
  model: z
    .string()
    .optional()
    .default('gpt-5.2-codex')
    .describe('Model identifier — gpt-5.2-codex | claude-opus-4-6 | claude-sonnet-4-6'),
  runId: z.string().uuid().optional().describe('Workflow run ID for resume'),
  approved: z.boolean().optional().describe('Plan approval (only with runId)'),
  feedback: z.string().optional().describe('User feedback on rejection'),
})

const ErrorResponse = z.object({
  error: z.string().describe('Human-readable error message'),
})

const InsufficientCreditsResponse = z.object({
  error: z.literal('insufficient_credits'),
  message: z.string().describe('Explanation of why the request was rejected'),
  credits_remaining: z.number().int().describe('Credits remaining in the user account'),
})

// ---------------------------------------------------------------------------
// Stream bridge state
// ---------------------------------------------------------------------------

interface StreamBridgeState {
  totalTokens: number
  sandboxId?: string
  openaiResponseId?: string
  lastTextChunk: string
  toolStartTimes: Map<string, number>
  fileContents: Map<string, string>
  pendingWriteContent: Map<string, { path: string; content: string }>
  pendingToolPaths: Map<string, string>
  projectId: string
  userId: string
  runId: string
}

// ---------------------------------------------------------------------------

export const agentRoutes = new Hono()

// Auth middleware on all routes
agentRoutes.use('*', authMiddleware)

/**
 * Process a single fullStream chunk and emit SSE events.
 *
 * Mastra fullStream chunk types (Vercel AI SDK flat properties):
 * - text-delta: LLM thinking text → ThinkingEvent
 * - tool-call: Tool invocation started → ToolStartEvent
 * - tool-result: Tool execution completed → ToolCompleteEvent
 * - step-finish: Agent step completed (may have multiple per generation)
 * - finish: Final chunk → triggers flush of any remaining text
 */
async function processStreamChunk(
  // biome-ignore lint/suspicious/noExplicitAny: Mastra stream chunk types are complex generics
  chunk: any,
  emit: (event: AgentStreamEvent | CreditsUsedEvent) => void,
  state: StreamBridgeState,
): Promise<void> {
  if (!chunk || !chunk.type) return

  // Mastra fullStream wraps Vercel AI SDK chunks in an envelope:
  //   { type, runId, from, payload: { toolName, args, result, ... } }
  // biome-ignore lint/suspicious/noExplicitAny: envelope shape varies per chunk type
  const payload = (chunk as any).payload ?? chunk

  switch (chunk.type) {
    case 'text-delta': {
      const text = payload.text ?? payload.textDelta ?? chunk.textDelta ?? ''
      if (text) {
        state.lastTextChunk += text
        // Emit thinking in batches (every ~100 chars) to reduce event frequency
        if (state.lastTextChunk.length > 100) {
          emit({ type: 'thinking', content: state.lastTextChunk })
          state.lastTextChunk = ''
        }
      }
      break
    }

    case 'tool-call': {
      const toolName = payload.toolName ?? chunk.toolName ?? 'unknown'
      const args = payload.args ?? chunk.args ?? {}
      const toolCallId = payload.toolCallId ?? chunk.toolCallId ?? ''
      state.toolStartTimes.set(toolName + '-' + toolCallId, Date.now())

      // Generate human-readable label for every tool.
      // File-operation verbs omit the path — the client renders a file badge separately.
      const labelFn = TOOL_LABELS[toolName]
      const label = labelFn ? labelFn(args) : toolName

      // Cache writeFile content for diff (available at tool-call time)
      if (toolName === 'writeFile' && args.content && args.path) {
        state.pendingWriteContent.set(toolName + '-' + toolCallId, {
          path: args.path as string,
          content: args.content as string,
        })
      }

      // Cache file paths from tool args for readFile (tool results don't include path)
      if (toolName === 'readFile' && args.path) {
        state.pendingToolPaths.set(toolName + '-' + toolCallId, args.path as string)
      }

      // Don't send full file content to client in args (wasteful)
      const leanArgs =
        toolName === 'writeFile' || toolName === 'editFile'
          ? { path: args.path, sandboxId: args.sandboxId }
          : args

      emit({ type: 'tool_start', tool: toolName, label, args: leanArgs })
      break
    }

    case 'tool-result': {
      const toolName = payload.toolName ?? chunk.toolName ?? 'unknown'
      const result = payload.result ?? chunk.result
      const toolCallId = payload.toolCallId ?? chunk.toolCallId ?? ''
      const startTime = state.toolStartTimes.get(toolName + '-' + toolCallId)
      const durationMs = startTime ? Date.now() - startTime : undefined

      // Check if tool succeeded
      const success = result?.success !== false && result?.exitCode !== 1
      let resultSummary: string | undefined

      // Detect sandboxId from createSandbox result
      if (toolName === 'createSandbox' && result?.sandboxId) {
        const resolvedSandboxId = result.sandboxId as string
        state.sandboxId = resolvedSandboxId
        // Persist sandboxId BEFORE emitting sandbox_ready so the client's
        // immediate /sandbox-urls fetch can look it up from the project record.
        await updateProject(state.projectId, { sandboxId: resolvedSandboxId }, state.userId).catch(
          () => {},
        )
        emit({ type: 'sandbox_ready', sandboxId: resolvedSandboxId })
      }

      // Persist GitHub repo URL from commitAndPush result
      if (toolName === 'commitAndPush' && result?.repoUrl) {
        await updateProject(
          state.projectId,
          { githubRepoUrl: result.repoUrl as string },
          state.userId,
        ).catch(() => {})
      }

      // Detect package installs
      if (toolName === 'installPackage' && result?.success) {
        emit({ type: 'package_installed', packages: result.output ?? '' })
      }

      // Build result summary and diff data per tool type
      let filePath: string | undefined
      let oldContent: string | undefined
      let newContent: string | undefined

      if (toolName === 'runBuild') {
        resultSummary = success
          ? 'Build passed'
          : `Build failed: ${result?.output?.slice(0, 200) ?? ''}`
      } else if (toolName === 'writeFile') {
        filePath = result?.path as string | undefined
        resultSummary = `${filePath ?? 'file'} (${result?.bytesWritten ?? '?'} bytes)`
        // Get old content from tracker (undefined if new file)
        if (filePath) oldContent = state.fileContents.get(filePath)
        // Get new content from cached tool-call args
        const cached = state.pendingWriteContent.get(toolName + '-' + toolCallId)
        if (cached) {
          newContent = cached.content
          state.fileContents.set(cached.path, cached.content)
          state.pendingWriteContent.delete(toolName + '-' + toolCallId)
        }
      } else if (toolName === 'editFile') {
        filePath = result?.path as string | undefined
        resultSummary = `${filePath ?? 'file'} (${result?.bytesWritten ?? '?'} bytes)`
        // Get old content from tracker
        if (filePath) oldContent = state.fileContents.get(filePath)
        // Read new content from sandbox after edit
        if (filePath && state.sandboxId && success) {
          try {
            const sb = await getSandbox(state.sandboxId)
            const buf = await sb.fs.downloadFile(`/workspace/${filePath}`)
            newContent = buf.toString('utf-8')
            state.fileContents.set(filePath, newContent)
          } catch {
            // Couldn't read — skip diff data
          }
        }
      } else if (toolName === 'writeFiles') {
        const paths = result?.paths as string[] | undefined
        resultSummary = paths?.length
          ? `Wrote ${paths.join(', ')}`
          : `Wrote ${result?.filesWritten ?? '?'} files`
      } else if (toolName === 'readFile') {
        // Resolve path from cached tool-call args (readFile result doesn't include path)
        const readPath = state.pendingToolPaths.get(toolName + '-' + toolCallId)
        state.pendingToolPaths.delete(toolName + '-' + toolCallId)
        const readContent = result?.content as string | undefined
        if (readPath && readContent) {
          state.fileContents.set(readPath, readContent)
        }
        // Send file path + content so the client can display it in code view
        filePath = readPath
        resultSummary = readContent
      } else if (toolName === 'listFiles') {
        const files = result?.files as string[] | undefined
        resultSummary = files?.length
          ? `${files.length} files:\n${files.join('\n')}`
          : `${result?.count ?? 0} files`
      } else if (toolName === 'runCommand') {
        resultSummary = result?.stdout as string | undefined
      }

      emit({
        type: 'tool_complete',
        tool: toolName,
        success,
        result: resultSummary,
        filePath,
        oldContent,
        newContent,
        durationMs,
      })
      break
    }

    case 'step-finish': {
      // Accumulate token usage from each step
      const usage = payload.usage ?? chunk.usage
      if (usage) {
        state.totalTokens += usage.totalTokens ?? 0
      }
      // Capture OpenAI response ID for previous_response_id on follow-ups
      const stepResponse = payload.response ?? chunk.response
      if (stepResponse?.id) {
        state.openaiResponseId = stepResponse.id as string
      }
      break
    }

    case 'finish': {
      // Flush any remaining text
      if (state.lastTextChunk) {
        emit({ type: 'thinking', content: state.lastTextChunk })
        state.lastTextChunk = ''
      }
      break
    }
  }
}

/**
 * Bridge a workflow stream (async iterable of workflow events) to SSE events.
 *
 * Iterates `for await` over the workflow stream. For `workflow-step-output`
 * events from the build step, delegates each payload chunk to
 * processStreamChunk(). For `workflow-step-result` from the build step,
 * extracts final token/sandboxId/openaiResponseId values from the step result.
 */
async function bridgeWorkflowStreamToSSE(
  // biome-ignore lint/suspicious/noExplicitAny: Mastra workflow stream shape varies
  workflowStream: AsyncIterable<any>,
  emit: (event: AgentStreamEvent | CreditsUsedEvent) => void,
  signal: AbortSignal,
  meta: { projectId: string; userId: string; runId: string },
): Promise<{ totalTokens: number; sandboxId?: string; openaiResponseId?: string }> {
  const state: StreamBridgeState = {
    totalTokens: 0,
    sandboxId: undefined,
    openaiResponseId: undefined,
    lastTextChunk: '',
    toolStartTimes: new Map(),
    fileContents: new Map(),
    pendingWriteContent: new Map(),
    pendingToolPaths: new Map(),
    projectId: meta.projectId,
    userId: meta.userId,
    runId: meta.runId,
  }

  for await (const event of workflowStream) {
    if (signal.aborted) break

    // biome-ignore lint/suspicious/noExplicitAny: workflow event payload shapes vary
    const e = event as any

    if (e.type === 'workflow-step-output') {
      // Build step pipes fullStream chunks through outputWriter — delegate to processStreamChunk
      // StepOutputPayload wraps chunks in { output: chunk }
      const chunk = e.payload?.output ?? e.payload
      if (chunk) await processStreamChunk(chunk, emit, state)
    }

    if (e.type === 'workflow-step-result' && e.payload?.id === 'build') {
      // Extract final metrics from the build step's structured output
      // biome-ignore lint/suspicious/noExplicitAny: step output shape depends on workflow output schema
      const stepOutput = e.payload?.output as any
      if (stepOutput?.totalTokens) state.totalTokens = stepOutput.totalTokens
      if (stepOutput?.sandboxId) state.sandboxId = stepOutput.sandboxId
      if (stepOutput?.openaiResponseId) state.openaiResponseId = stepOutput.openaiResponseId
    }

    if (e.type === 'workflow-finish') {
      // Flush remaining text
      if (state.lastTextChunk) {
        emit({ type: 'thinking', content: state.lastTextChunk })
        state.lastTextChunk = ''
      }

      const success = !!state.sandboxId
      const summary = success ? 'App built successfully.' : 'Generation failed.'

      emit({
        type: 'done',
        summary,
        success,
        sandboxId: state.sandboxId,
        tokensUsed: state.totalTokens,
      })
    }
  }

  return {
    totalTokens: state.totalTokens,
    sandboxId: state.sandboxId,
    openaiResponseId: state.openaiResponseId,
  }
}

/**
 * POST /api/agent
 * Stream orchestrator execution via SSE
 */
agentRoutes.post(
  '/',
  describeRoute({
    summary: 'Stream AI agent generation via SSE (workflow suspend/resume)',
    description:
      'Credit-gated SSE endpoint. New generation: POST { message, projectId, model? } — analyst runs, workflow suspends, emits workflow_suspended with runId. Resume: POST { runId, approved, feedback? } — build runs or bails. Returns text/event-stream.',
    tags: ['agent'],
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['projectId'],
            properties: {
              message: {
                type: 'string',
                minLength: 1,
                description:
                  'User prompt describing the app to build or change (required for new generation, omit on resume)',
              },
              projectId: {
                type: 'string',
                format: 'uuid',
                description: 'Project ID to run the agent against',
              },
              model: {
                type: 'string',
                default: 'gpt-5.2-codex',
                description:
                  'Model identifier — gpt-5.2-codex | claude-opus-4-6 | claude-sonnet-4-6',
              },
              runId: {
                type: 'string',
                format: 'uuid',
                description: 'Workflow run ID for resume (omit for new generation)',
              },
              approved: {
                type: 'boolean',
                description: 'Plan approval decision (only with runId)',
              },
              feedback: {
                type: 'string',
                description: 'User feedback on rejection (only with runId + approved: false)',
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description:
          'SSE stream of AgentStreamEvent — events: thinking, tool_start, tool_complete, done, agent_error, sandbox_ready, package_installed, credits_used, plan_ready, workflow_suspended',
        content: {
          'text/event-stream': {
            schema: resolver(z.string().describe('Server-Sent Events stream')),
          },
        },
      },
      400: {
        description: 'Missing or invalid request body',
        content: {
          'application/json': { schema: resolver(ErrorResponse) },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': { schema: resolver(ErrorResponse) },
        },
      },
      402: {
        description: 'Insufficient credits',
        content: {
          'application/json': { schema: resolver(InsufficientCreditsResponse) },
        },
      },
      404: {
        description: 'Project not found',
        content: {
          'application/json': { schema: resolver(ErrorResponse) },
        },
      },
    },
  }),
  async (c) => {
    const agentLog = log.child({ module: 'agent' })

    let body: z.infer<typeof AgentRequest>
    try {
      body = AgentRequest.parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    const { message, projectId, model = 'gpt-5.2-codex', runId, approved, feedback } = body

    if (!projectId) {
      return c.json({ error: 'Missing projectId' }, 400)
    }

    // New generation requires a message; resume requires a runId + approved
    if (!runId && !message) {
      return c.json({ error: 'Missing message' }, 400)
    }
    if (runId && approved === undefined) {
      return c.json({ error: 'approved is required when resuming a workflow' }, 400)
    }

    agentLog.info(
      `Generation: project=${projectId} model=${model} ${runId ? `resume runId=${runId}` : 'new'}`,
      { projectId, model, runId: runId ?? null },
    )

    if (!isAllowedModel(model)) {
      return c.json({ error: `Model "${model}" is not available` }, 400)
    }

    const user = c.var.user

    // Verify project ownership
    const project = await getProject(projectId, user.id)
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    // Credit reservation
    const CREDIT_RESERVATION = 50
    const reserved = await reserveCredits(user.id, CREDIT_RESERVATION)
    if (!reserved) {
      const credits = await getUserCredits(user.id)
      return c.json(
        {
          error: 'insufficient_credits',
          message: 'Not enough credits to start generation',
          credits_remaining: credits?.creditsRemaining ?? 0,
        },
        402,
      )
    }

    const thisRunId = runId ?? crypto.randomUUID()

    // Set up Mastra request context for model routing + observability metadata
    const requestContext = new RequestContext()
    requestContext.set('selectedModel', model)
    requestContext.set('userId', user.id)
    requestContext.set('projectId', projectId)
    requestContext.set('model', model)
    requestContext.set('provider', MODEL_CONFIGS[model]?.provider ?? 'openai')

    return createSSEStream<AgentStreamEvent | CreditsUsedEvent>(async (emit, signal) => {
      let settled = false

      try {
        // ── Resume path: runId provided ────────────────────────────────────────
        if (runId) {
          const workflow = mastra.getWorkflow('generation')
          // biome-ignore lint/suspicious/noExplicitAny: Mastra workflow run types are complex
          const run = await (workflow as any).createRun({ runId })

          if (approved) {
            // Resume build step — stream orchestrator events to client
            const result = await traceAgent(`orchestrator:${model}`, async () => {
              // biome-ignore lint/suspicious/noExplicitAny: Mastra resumeStream return type
              const resumeOutput: any = run.resumeStream({
                step: 'approve-plan',
                resumeData: { approved: true },
                requestContext,
              })

              return bridgeWorkflowStreamToSSE(resumeOutput.fullStream, emit, signal, {
                projectId,
                userId: user.id,
                runId,
              })
            }) as { totalTokens: number; sandboxId?: string; openaiResponseId?: string }

            // Update project status + persist OpenAI response ID
            const projectUpdate: Record<string, unknown> = {
              status: result.sandboxId ? 'complete' : 'error',
              sandboxId: result.sandboxId,
            }
            if (result.openaiResponseId) {
              const existingState = (project.generationState as Record<string, unknown>) || {}
              projectUpdate.generationState = {
                ...existingState,
                lastOpenaiResponseId: result.openaiResponseId,
              }
            }
            updateProject(
              projectId,
              projectUpdate as Partial<typeof projects.$inferInsert>,
              user.id,
            ).catch(() => {})

            // Settle credits
            const creditsUsed = Math.ceil(result.totalTokens / 1000)
            const settlement = await settleCredits(user.id, CREDIT_RESERVATION, creditsUsed)
            settled = true

            // Score the trace in Langfuse (fire-and-forget)
            const langfuse = getLangfuseClient()
            if (langfuse) {
              const traceMetadata = { userId: user.id, projectId, model, runId }
              langfuse.score.create({
                name: 'build-success',
                traceId: runId,
                value: result.sandboxId ? 1 : 0,
                dataType: 'BOOLEAN',
                comment: result.sandboxId ? 'Build passed' : 'Generation failed',
                metadata: traceMetadata,
              })
              langfuse.score.create({
                name: 'token-efficiency',
                traceId: runId,
                value: Math.max(0, 1 - result.totalTokens / 500_000),
                dataType: 'NUMERIC',
                comment: `${result.totalTokens} tokens used`,
                metadata: traceMetadata,
              })
              langfuse.score.flush().catch(() => {})
            }

            emit({
              type: 'credits_used',
              creditsUsed,
              creditsRemaining: settlement.creditsRemaining,
              tokensTotal: result.totalTokens,
            })
          } else {
            // Rejection — bail the workflow (no build happens)
            await run.resume({
              step: 'approve-plan',
              resumeData: { approved: false, feedback },
            })

            // Settle credits to 0 (no build happened)
            await settleCredits(user.id, CREDIT_RESERVATION, 0)
            settled = true
          }
          return
        }

        // ── New generation path ────────────────────────────────────────────────
        const workflow = mastra.getWorkflow('generation')
        // biome-ignore lint/suspicious/noExplicitAny: Mastra workflow run types are complex
        const run = await (workflow as any).createRun()

        // Set previousResponseId on requestContext for OpenAI follow-ups
        const provider = MODEL_CONFIGS[model]?.provider ?? 'openai'
        const previousResponseId =
          provider === 'openai'
            ? ((project.generationState as Record<string, unknown>)?.lastOpenaiResponseId as
                | string
                | undefined)
            : undefined
        if (previousResponseId) {
          requestContext.set('previousResponseId', previousResponseId)
        }

        // biome-ignore lint/suspicious/noExplicitAny: Mastra workflow stream return type
        const workflowOutput: any = run.stream({
          inputData: { message: message ?? '', projectId, userId: user.id, model },
          requestContext,
          closeOnSuspend: true,
        })

        // Bridge workflow stream events — collect plan from analyst step
        let analystTokens = 0
        let capturedPlan: {
          projectName: string
          features: Array<{ name: string; description: string }>
        } = { projectName: 'App', features: [] }

        const analystBridgeState: StreamBridgeState = {
          totalTokens: 0,
          lastTextChunk: '',
          toolStartTimes: new Map(),
          fileContents: new Map(),
          pendingWriteContent: new Map(),
          pendingToolPaths: new Map(),
          projectId,
          userId: user.id,
          runId: '',
        }

        for await (const event of workflowOutput.fullStream) {
          if (signal.aborted) break

          // biome-ignore lint/suspicious/noExplicitAny: workflow event payload shapes vary
          const e = event as any

          if (e.type === 'workflow-step-output') {
            // Analyst step pipes fullStream chunks — forward all events
            // (text-delta, tool-call, tool-result, etc.) to the client
            // StepOutputPayload wraps chunks in { output: chunk }
            const chunk = e.payload?.output ?? e.payload
            if (chunk) await processStreamChunk(chunk, emit, analystBridgeState)
          }

          if (
            e.type === 'workflow-step-result' &&
            e.payload?.id === 'analyst'
          ) {
            // biome-ignore lint/suspicious/noExplicitAny: step result shape depends on outputSchema
            const stepOutput = e.payload?.output as any
            if (stepOutput?.plan) {
              capturedPlan = stepOutput.plan
              emit({ type: 'plan_ready', plan: stepOutput.plan })
              analystTokens = stepOutput.totalTokens ?? 0
            }
          }
        }

        // Workflow stream closed because workflow suspended at approve-plan step
        // Emit workflow_suspended with runId so client can show HITL UI
        const workflowRunId = String(run.runId ?? '')
        if (!workflowRunId) {
          throw new Error('Workflow run did not return a runId after suspension')
        }

        emit({
          type: 'workflow_suspended',
          runId: workflowRunId,
          plan: capturedPlan,
        })

        // Settle analyst credits
        const creditsUsed = Math.ceil(analystTokens / 1000)
        const settlement = await settleCredits(user.id, CREDIT_RESERVATION, creditsUsed)
        settled = true

        // Persist workflow runId in project's generationState for resume
        const existingState = (project.generationState as Record<string, unknown>) || {}
        updateProject(
          projectId,
          {
            generationState: { ...existingState, workflowRunId },
          } as Partial<typeof projects.$inferInsert>,
          user.id,
        ).catch(() => {})

        emit({
          type: 'credits_used',
          creditsUsed,
          creditsRemaining: settlement.creditsRemaining,
          tokensTotal: analystTokens,
        })
      } catch (error) {
        if (signal.aborted) {
          agentLog.info('Stream aborted by client', { projectId, runId: thisRunId })
          if (!settled) {
            await settleCredits(user.id, CREDIT_RESERVATION, 0)
            settled = true
          }
          return
        }

        if (!settled) {
          await settleCredits(user.id, CREDIT_RESERVATION, 0)
          settled = true
        }

        Sentry.captureException(error, {
          tags: { route: '/api/agent' },
          extra: { projectId, model, userId: user.id },
        })

        emit({
          type: 'agent_error',
          message: error instanceof Error ? error.message : 'Generation failed',
        })
      }
    })
  },
)
