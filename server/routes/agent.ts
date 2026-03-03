/**
 * POST /api/agent
 * Single Orchestrator SSE endpoint
 *
 * Bridges Mastra agent.stream() fullStream → SSE events.
 *
 * Request: { message: string, projectId: string, model?: string }
 * Response: SSE stream with AgentStreamEvent SSE events
 */

import crypto from 'node:crypto'
import { z } from 'zod'
import { describeRoute, resolver } from 'hono-openapi'
import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { RequestContext } from '@mastra/core/di'
import { traceAgent } from '../sentry'
import { createOrchestrator } from '../lib/agents/orchestrator'
import { createAnalyst, AnalystPlanSchema } from '../lib/agents/analyst'
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
  message: z.string().min(1).describe('User prompt describing the app to build or change'),
  projectId: z.string().uuid().describe('Project ID to run the agent against'),
  model: z
    .string()
    .optional()
    .default('gpt-5.2-codex')
    .describe('Model identifier — gpt-5.2-codex | claude-opus-4-6 | claude-sonnet-4-6'),
  phase: z
    .enum(['analyst', 'build'])
    .optional()
    .default('build')
    .describe('Pipeline phase — analyst produces a plan, build runs the orchestrator'),
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

export const agentRoutes = new Hono()

// Auth middleware on all routes
agentRoutes.use('*', authMiddleware)

/**
 * Bridge Mastra agent.stream() fullStream chunks to SSE events.
 *
 * Mastra fullStream chunk types (Vercel AI SDK flat properties):
 * - text-delta: LLM thinking text → ThinkingEvent
 * - tool-call: Tool invocation started → ToolStartEvent
 * - tool-result: Tool execution completed → ToolCompleteEvent
 * - step-finish: Agent step completed (may have multiple per generation)
 * - finish: Final chunk → triggers flush of any remaining text
 */
async function bridgeStreamToSSE(
  // biome-ignore lint/suspicious/noExplicitAny: Mastra stream types are complex generics
  streamOutput: any,
  emit: (event: AgentStreamEvent | CreditsUsedEvent) => void,
  signal: AbortSignal,
  meta: { projectId: string; userId: string; runId: string },
): Promise<{ totalTokens: number; sandboxId?: string; openaiResponseId?: string }> {
  let totalTokens = 0
  let sandboxId: string | undefined
  let openaiResponseId: string | undefined
  let lastTextChunk = ''
  const toolStartTimes = new Map<string, number>()
  // Track file contents for diff computation (path → last known content)
  const fileContents = new Map<string, string>()
  // Track writeFile content from tool-call args (toolCallId → content)
  const pendingWriteContent = new Map<string, { path: string; content: string }>()
  // Track tool-call args path for readFile/listFiles (toolKey → path)
  const pendingToolPaths = new Map<string, string>()

  const reader = streamOutput.fullStream.getReader()

  try {
    while (true) {
      if (signal.aborted) break

      const { done, value: chunk } = await reader.read()
      if (done) break

      if (!chunk || !chunk.type) continue

      // Mastra fullStream wraps Vercel AI SDK chunks in an envelope:
      //   { type, runId, from, payload: { toolName, args, result, ... } }
      // biome-ignore lint/suspicious/noExplicitAny: envelope shape varies per chunk type
      const payload = (chunk as any).payload ?? chunk

      switch (chunk.type) {
        case 'text-delta': {
          const text = payload.text ?? payload.textDelta ?? chunk.textDelta ?? ''
          if (text) {
            lastTextChunk += text
            // Emit thinking in batches (every ~100 chars) to reduce event frequency
            if (lastTextChunk.length > 100) {
              emit({ type: 'thinking', content: lastTextChunk })
              lastTextChunk = ''
            }
          }
          break
        }

        case 'tool-call': {
          const toolName = payload.toolName ?? chunk.toolName ?? 'unknown'
          const args = payload.args ?? chunk.args ?? {}
          const toolCallId = payload.toolCallId ?? chunk.toolCallId ?? ''
          toolStartTimes.set(toolName + '-' + toolCallId, Date.now())

          // Generate human-readable label for every tool.
          // File-operation verbs omit the path — the client renders a file badge separately.
          const labelFn = TOOL_LABELS[toolName]
          const label = labelFn ? labelFn(args) : toolName

          // Cache writeFile content for diff (available at tool-call time)
          if (toolName === 'writeFile' && args.content && args.path) {
            pendingWriteContent.set(toolName + '-' + toolCallId, {
              path: args.path as string,
              content: args.content as string,
            })
          }

          // Cache file paths from tool args for readFile (tool results don't include path)
          if (toolName === 'readFile' && args.path) {
            pendingToolPaths.set(toolName + '-' + toolCallId, args.path as string)
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
          const startTime = toolStartTimes.get(toolName + '-' + toolCallId)
          const durationMs = startTime ? Date.now() - startTime : undefined

          // Check if tool succeeded
          const success = result?.success !== false && result?.exitCode !== 1
          let resultSummary: string | undefined

          // Detect sandboxId from createSandbox result
          if (toolName === 'createSandbox' && result?.sandboxId) {
            const resolvedSandboxId = result.sandboxId as string
            sandboxId = resolvedSandboxId
            // Persist sandboxId BEFORE emitting sandbox_ready so the client's
            // immediate /sandbox-urls fetch can look it up from the project record.
            await updateProject(meta.projectId, { sandboxId: resolvedSandboxId }, meta.userId).catch(
              () => {},
            )
            emit({ type: 'sandbox_ready', sandboxId: resolvedSandboxId })
          }

          // Persist GitHub repo URL from commitAndPush result
          if (toolName === 'commitAndPush' && result?.repoUrl) {
            await updateProject(
              meta.projectId,
              { githubRepoUrl: result.repoUrl as string },
              meta.userId,
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
            if (filePath) oldContent = fileContents.get(filePath)
            // Get new content from cached tool-call args
            const cached = pendingWriteContent.get(toolName + '-' + toolCallId)
            if (cached) {
              newContent = cached.content
              fileContents.set(cached.path, cached.content)
              pendingWriteContent.delete(toolName + '-' + toolCallId)
            }
          } else if (toolName === 'editFile') {
            filePath = result?.path as string | undefined
            resultSummary = `${filePath ?? 'file'} (${result?.bytesWritten ?? '?'} bytes)`
            // Get old content from tracker
            if (filePath) oldContent = fileContents.get(filePath)
            // Read new content from sandbox after edit
            if (filePath && sandboxId && success) {
              try {
                const sb = await getSandbox(sandboxId)
                const buf = await sb.fs.downloadFile(`/workspace/${filePath}`)
                newContent = buf.toString('utf-8')
                fileContents.set(filePath, newContent)
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
            const readPath = pendingToolPaths.get(toolName + '-' + toolCallId)
            pendingToolPaths.delete(toolName + '-' + toolCallId)
            const readContent = result?.content as string | undefined
            if (readPath && readContent) {
              fileContents.set(readPath, readContent)
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
            totalTokens += usage.totalTokens ?? 0
          }
          // Capture OpenAI response ID for previous_response_id on follow-ups
          const stepResponse = payload.response ?? chunk.response
          if (stepResponse?.id) {
            openaiResponseId = stepResponse.id as string
          }
          break
        }

        case 'finish': {
          // Flush any remaining text
          if (lastTextChunk) {
            emit({ type: 'thinking', content: lastTextChunk })
            lastTextChunk = ''
          }
          break
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  // Get final usage from stream output
  try {
    const usage = await streamOutput.usage
    if (usage?.totalTokens) {
      totalTokens = usage.totalTokens
    }
  } catch {
    // Usage may not be available if stream was aborted
  }

  // Get structured output summary; fall back to last sentence of text on failure
  let summary = 'App built successfully.'
  try {
    const output = await streamOutput.object
    if (output?.summary) {
      summary = output.summary
    }
  } catch {
    // Structured output may fail if stream was aborted — fall back to text
    try {
      const text = await streamOutput.text
      if (text) {
        const sentences = text.split(/[.!]\s/)
        summary = sentences[sentences.length - 1]?.trim() || summary
      }
    } catch {
      // Text may not be available
    }
  }

  // Generation succeeded if we got a sandbox (core requirement for any build)
  const success = !!sandboxId

  emit({
    type: 'done',
    summary,
    success,
    sandboxId,
    tokensUsed: totalTokens,
  })

  return { totalTokens, sandboxId, openaiResponseId }
}

/**
 * Run the Analyst agent and emit a plan_ready event.
 * The analyst is a pure reasoning agent — no tools, just structured output.
 */
async function runAnalystPhase(
  emit: (event: AgentStreamEvent | CreditsUsedEvent) => void,
  signal: AbortSignal,
  meta: {
    message: string
    projectId: string
    userId: string
    model: string
    requestContext: RequestContext
  },
): Promise<{ totalTokens: number }> {
  const agent = createAnalyst()
  agent.__registerMastra(mastra)

  emit({ type: 'thinking', content: '' })

  const streamOutput = await agent.stream(meta.message, {
    requestContext: meta.requestContext,
    memory: {
      thread: meta.projectId,
      resource: meta.userId,
    },
    maxSteps: 1,
    abortSignal: signal,
    structuredOutput: { schema: AnalystPlanSchema },
  })

  // Collect thinking text
  let thinkingText = ''
  const reader = streamOutput.fullStream.getReader()

  try {
    while (true) {
      if (signal.aborted) break
      const { done, value: chunk } = await reader.read()
      if (done) break
      if (!chunk?.type) continue

      // biome-ignore lint/suspicious/noExplicitAny: envelope shape varies per chunk type
      const payload = (chunk as any).payload ?? chunk

      if (chunk.type === 'text-delta') {
        // biome-ignore lint/suspicious/noExplicitAny: envelope shape varies per chunk type
        const text = payload.text ?? payload.textDelta ?? (chunk as any).textDelta ?? ''
        if (text) {
          thinkingText += text
          if (thinkingText.length > 100) {
            emit({ type: 'thinking', content: thinkingText })
            thinkingText = ''
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  // Flush remaining thinking
  if (thinkingText) {
    emit({ type: 'thinking', content: thinkingText })
  }

  // Extract structured plan
  let plan: { projectName: string; features: Array<{ name: string; description: string }> }
  try {
    const output = await streamOutput.object
    plan = AnalystPlanSchema.parse(output)
  } catch {
    // Fallback: try to parse from text
    const text = await streamOutput.text
    plan = { projectName: 'App', features: [{ name: 'Core Features', description: text.slice(0, 200) }] }
  }

  // Emit plan_ready
  emit({ type: 'plan_ready', plan })

  // Get token usage
  let totalTokens = 0
  try {
    const usage = await streamOutput.usage
    if (usage?.totalTokens) totalTokens = usage.totalTokens
  } catch {
    // Usage may not be available
  }

  return { totalTokens }
}

/**
 * POST /api/agent
 * Stream orchestrator execution via SSE
 */
agentRoutes.post(
  '/',
  describeRoute({
    summary: 'Stream AI agent generation via SSE',
    description:
      'Credit-gated SSE endpoint. Streams AgentStreamEvent events as the orchestrator generates app code. Returns text/event-stream.',
    tags: ['agent'],
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['message', 'projectId'],
            properties: {
              message: {
                type: 'string',
                minLength: 1,
                description: 'User prompt describing the app to build or change',
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
              phase: {
                type: 'string',
                enum: ['analyst', 'build'],
                default: 'build',
                description:
                  'Pipeline phase — analyst produces a plan, build runs the orchestrator',
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description:
          'SSE stream of AgentStreamEvent — events: thinking, tool_start, tool_complete, done, agent_error, sandbox_ready, package_installed, credits_used',
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

    let body: {
      message?: string
      projectId?: string
      model?: string
      phase?: string
    }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request body' }, 400)
    }

    const { message, projectId, model = 'gpt-5.2-codex' } = body
    const phase = body.phase ?? 'build'
    agentLog.info(`Generation: project=${projectId} model=${model} phase=${phase}`, { projectId, model, phase })

    if (!message || !projectId) {
      return c.json({ error: 'Missing message or projectId' }, 400)
    }

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

    const runId = crypto.randomUUID()

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
        // ── Analyst phase ────────────────────────────────────────────────────
        if (phase === 'analyst') {
          const result = await traceAgent(`analyst:${model}`, async () => {
            return runAnalystPhase(emit, signal, {
              message,
              projectId,
              userId: user.id,
              model,
              requestContext,
            })
          }) as { totalTokens: number }

          // Settle credits (analyst is cheap)
          const creditsUsed = Math.ceil(result.totalTokens / 1000)
          const settlement = await settleCredits(user.id, CREDIT_RESERVATION, creditsUsed)
          settled = true

          emit({
            type: 'credits_used',
            creditsUsed,
            creditsRemaining: settlement.creditsRemaining,
            tokensTotal: result.totalTokens,
          })
          return
        }

        // ── Build phase (orchestrator) ────────────────────────────────────────
        // Create agent with provider-appropriate web search tool
        const provider = MODEL_CONFIGS[model]?.provider ?? 'openai'

        // Fetch managed prompt from Langfuse — no fallback, fail fast if misconfigured
        let systemPrompt: string | undefined
        const langfuse = getLangfuseClient()
        if (langfuse) {
          const prompt = await langfuse.prompt.get('orchestrator-system-prompt', {
            type: 'text',
            label: 'production',
            cacheTtlSeconds: 300,
            fetchTimeoutMs: 5000,
          })
          systemPrompt = prompt.compile({})
        }

        const agent = createOrchestrator(provider, systemPrompt)
        agent.__registerMastra(mastra)

        // For OpenAI: read last response ID for server-side conversation state
        const previousResponseId =
          provider === 'openai'
            ? ((project.generationState as Record<string, unknown>)?.lastOpenaiResponseId as
                | string
                | undefined)
            : undefined

        // Wrap entire generation in a Sentry AI span for observability
        const result = await traceAgent(`orchestrator:${model}`, async () => {
          const streamOutput = await agent.stream(message, {
            requestContext,
            memory: {
              thread: projectId,
              resource: user.id,
            },
            maxSteps: 50,
            savePerStep: true,
            abortSignal: signal,
            // Pass OpenAI previous_response_id for server-side conversation state
            ...(previousResponseId && {
              providerOptions: {
                openai: { previousResponseId },
              },
            }),
            structuredOutput: {
              schema: z.object({
                summary: z.string().describe('One-line summary of what was built or changed'),
              }),
            },
          })

          // Bridge Mastra stream to SSE
          return bridgeStreamToSSE(streamOutput, emit, signal, {
            projectId,
            userId: user.id,
            runId,
          })
        }) as { totalTokens: number; sandboxId?: string; openaiResponseId?: string }

        // Update project status + persist OpenAI response ID for next turn
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
      } catch (error) {
        if (signal.aborted) {
          agentLog.info('Stream aborted by client', { projectId, runId })
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
