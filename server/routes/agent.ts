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
import { describeRoute } from 'hono-openapi'
import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { RequestContext } from '@mastra/core/di'
import { createOrchestrator } from '../lib/agents/orchestrator'
import { mastra } from '../lib/agents/mastra'
import { isAllowedModel, MODEL_CONFIGS } from '../lib/agents/provider'
import {
  getProject,
  getUserCredits,
  updateProject,
} from '../lib/db/queries'
import { reserveCredits, settleCredits } from '../lib/credits'
import { getSandbox } from '../lib/sandbox'
import { createSSEStream } from '../lib/sse'
import type { AgentStreamEvent, CreditsUsedEvent } from '../lib/types'
import { authMiddleware } from '../middleware/auth'
import { log } from '../lib/logger'

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
): Promise<{ totalTokens: number; sandboxId?: string }> {
  let totalTokens = 0
  let sandboxId: string | undefined
  let lastTextChunk = ''
  const toolStartTimes = new Map<string, number>()
  // Track file contents for diff computation (path → last known content)
  const fileContents = new Map<string, string>()
  // Track writeFile content from tool-call args (toolCallId → content)
  const pendingWriteContent = new Map<string, { path: string; content: string }>()

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
          const text = payload.textDelta ?? chunk.textDelta ?? ''
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

          // Generate human-readable label
          let label: string | undefined
          if (toolName === 'writeFile' || toolName === 'editFile') {
            label = `Editing ${args.path ?? 'file'}`
          } else if (toolName === 'createSandbox') {
            label = 'Provisioning sandbox'
          } else if (toolName === 'runBuild') {
            label = 'Building app'
          } else if (toolName === 'installPackage') {
            label = `Installing ${args.packages ?? 'packages'}`
          } else if (toolName === 'webSearch' || toolName === 'web_search_tool') {
            label = `Searching: ${args.query ?? ''}`
          }

          // Cache writeFile content for diff (available at tool-call time)
          if (toolName === 'writeFile' && args.content && args.path) {
            pendingWriteContent.set(toolName + '-' + toolCallId, {
              path: args.path as string,
              content: args.content as string,
            })
          }

          // Don't send full file content to client in args (wasteful)
          const leanArgs = (toolName === 'writeFile' || toolName === 'editFile')
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
            emit({ type: 'sandbox_ready', sandboxId: resolvedSandboxId })
            // Update project with sandboxId
            updateProject(meta.projectId, { sandboxId: resolvedSandboxId }, meta.userId).catch(() => {})
          }

          // Detect package installs
          if (toolName === 'installPackage' && result?.success) {
            emit({ type: 'package_installed', packages: result.output ?? '' })
          }

          // Build result summary (lean — file names only, no content)
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
            // Track file content from readFile for future diffs
            const readPath = result?.path as string | undefined
            const readContent = result?.content as string | undefined
            if (readPath && readContent) {
              fileContents.set(readPath, readContent)
            }
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

  emit({
    type: 'done',
    summary,
    sandboxId,
    tokensUsed: totalTokens,
  })

  return { totalTokens, sandboxId }
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
    responses: {
      200: { description: 'SSE stream of AgentStreamEvent (text/event-stream)' },
      400: { description: 'Missing or invalid request body' },
      401: { description: 'Unauthorized' },
      402: { description: 'Insufficient credits' },
      404: { description: 'Project not found' },
    },
  }),
  async (c) => {
  const agentLog = log.child({ module: 'agent' })

  let body: {
    message?: string
    projectId?: string
    model?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { message, projectId, model = 'gpt-5.2-codex' } = body
  agentLog.info(`Generation: project=${projectId} model=${model}`, { projectId, model })

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

  // Set up Mastra request context for model routing
  const requestContext = new RequestContext()
  requestContext.set('selectedModel', model)

  return createSSEStream<AgentStreamEvent | CreditsUsedEvent>(async (emit, signal) => {
    let settled = false

    try {
      // Create agent with provider-appropriate web search tool
      const provider = MODEL_CONFIGS[model]?.provider ?? 'openai'
      const agent = createOrchestrator(provider)
      agent.__registerMastra(mastra)

      const streamOutput = await agent.stream(message, {
        requestContext,
        memory: {
          thread: projectId,
          resource: user.id,
        },
        maxSteps: 50,
        savePerStep: true,
        abortSignal: signal,
        structuredOutput: {
          schema: z.object({
            summary: z.string().describe('One-line summary of what was built or changed'),
          }),
        },
      })

      // Bridge Mastra stream to SSE
      const result = await bridgeStreamToSSE(streamOutput, emit, signal, {
        projectId,
        userId: user.id,
        runId,
      })

      // Update project status
      updateProject(
        projectId,
        {
          status: 'complete',
          sandboxId: result.sandboxId,
        },
        user.id,
      ).catch(() => {})

      // Settle credits
      const creditsUsed = Math.ceil(result.totalTokens / 1000)
      const settlement = await settleCredits(user.id, CREDIT_RESERVATION, creditsUsed)
      settled = true

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
