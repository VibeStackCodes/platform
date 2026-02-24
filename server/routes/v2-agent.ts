/**
 * POST /api/v2/agent
 * V2 Single Orchestrator SSE endpoint
 *
 * Bridges Mastra agent.stream() fullStream → SSE events.
 * Replaces the XState-based agent.ts route for v2 pipeline.
 *
 * Request: { message: string, projectId: string, model?: string, sandboxId?: string }
 * Response: SSE stream with V2StreamEvent SSE events
 */

import crypto from 'node:crypto'
import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { RequestContext } from '../lib/agents/registry'
import { createV2Orchestrator } from '../lib/agents/v2-orchestrator'
import { isAllowedModel } from '../lib/agents/provider'
import {
  getProject,
  getUserCredits,
  updateProject,
  insertChatMessage,
} from '../lib/db/queries'
import { reserveCredits, settleCredits } from '../lib/credits'
import { createSSEStream } from '../lib/sse'
import type { V2StreamEvent, CreditsUsedEvent } from '../lib/types'
import { authMiddleware } from '../middleware/auth'
import { log } from '../lib/logger'

export const v2AgentRoutes = new Hono()

// Auth middleware on all routes
v2AgentRoutes.use('*', authMiddleware)

/**
 * Bridge Mastra agent.stream() fullStream chunks to our V2 SSE events.
 *
 * Mastra fullStream chunk types (Vercel AI SDK flat properties):
 * - text-delta: LLM thinking text → V2ThinkingEvent
 * - tool-call: Tool invocation started → V2ToolStartEvent
 * - tool-result: Tool execution completed → V2ToolCompleteEvent
 * - step-finish: Agent step completed (may have multiple per generation)
 * - finish: Final chunk → triggers flush of any remaining text
 */
async function bridgeStreamToSSE(
  // biome-ignore lint/suspicious/noExplicitAny: Mastra stream types are complex generics
  streamOutput: any,
  emit: (event: V2StreamEvent | CreditsUsedEvent) => void,
  signal: AbortSignal,
  meta: { projectId: string; userId: string; runId: string },
): Promise<{ totalTokens: number; sandboxId?: string }> {
  let totalTokens = 0
  let sandboxId: string | undefined
  let lastTextChunk = ''
  const toolStartTimes = new Map<string, number>()

  const reader = streamOutput.fullStream.getReader()

  try {
    while (true) {
      if (signal.aborted) break

      const { done, value: chunk } = await reader.read()
      if (done) break

      if (!chunk || !chunk.type) continue

      switch (chunk.type) {
        case 'text-delta': {
          const text = chunk.textDelta ?? ''
          if (text) {
            lastTextChunk += text
            // Emit thinking in batches (every ~100 chars) to reduce event frequency
            if (lastTextChunk.length > 100) {
              emit({ type: 'v2_thinking', content: lastTextChunk })
              // Fire-and-forget persistence
              insertChatMessage(
                `thinking-${meta.runId}-${Date.now()}`,
                meta.projectId,
                'assistant',
                [{ text: lastTextChunk }],
                'thinking',
              ).catch(() => {})
              lastTextChunk = ''
            }
          }
          break
        }

        case 'tool-call': {
          const toolName = chunk.toolName ?? 'unknown'
          const args = chunk.args ?? {}
          toolStartTimes.set(toolName + '-' + (chunk.toolCallId ?? ''), Date.now())

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
          } else if (toolName === 'searchWeb') {
            label = `Searching: ${args.query ?? ''}`
          }

          emit({ type: 'v2_tool_start', tool: toolName, label, args })
          break
        }

        case 'tool-result': {
          const toolName = chunk.toolName ?? 'unknown'
          const result = chunk.result
          const toolCallId = chunk.toolCallId ?? ''
          const startTime = toolStartTimes.get(toolName + '-' + toolCallId)
          const durationMs = startTime ? Date.now() - startTime : undefined

          // Check if tool succeeded
          const success = result?.success !== false && result?.exitCode !== 1
          let resultSummary: string | undefined

          // Detect sandboxId from createSandbox result
          if (toolName === 'createSandbox' && result?.sandboxId) {
            const resolvedSandboxId = result.sandboxId as string
            sandboxId = resolvedSandboxId
            emit({ type: 'v2_sandbox_ready', sandboxId: resolvedSandboxId })
            // Update project with sandboxId
            updateProject(meta.projectId, { sandboxId: resolvedSandboxId }, meta.userId).catch(() => {})
          }

          // Detect package installs
          if (toolName === 'installPackage' && result?.success) {
            emit({ type: 'v2_package_installed', packages: result.output ?? '' })
          }

          // Build result summary
          if (toolName === 'runBuild') {
            resultSummary = success
              ? 'Build passed'
              : `Build failed: ${result?.output?.slice(0, 200) ?? ''}`
          } else if (toolName === 'writeFile' || toolName === 'editFile') {
            resultSummary = `${result?.path ?? 'file'} updated`
          }

          emit({
            type: 'v2_tool_complete',
            tool: toolName,
            success,
            result: resultSummary,
            durationMs,
          })
          break
        }

        case 'step-finish': {
          // Accumulate token usage from each step
          const usage = chunk.usage
          if (usage) {
            totalTokens += usage.totalTokens ?? 0
          }
          break
        }

        case 'finish': {
          // Flush any remaining text
          if (lastTextChunk) {
            emit({ type: 'v2_thinking', content: lastTextChunk })
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

  // Get final text as summary
  let summary = 'App built successfully.'
  try {
    const text = await streamOutput.text
    if (text) {
      // Extract last sentence as summary
      const sentences = text.split(/[.!]\s/)
      summary = sentences[sentences.length - 1]?.trim() || summary
    }
  } catch {
    // Text may not be available
  }

  emit({
    type: 'v2_done',
    summary,
    sandboxId,
    tokensUsed: totalTokens,
  })

  return { totalTokens, sandboxId }
}

/**
 * POST /api/v2/agent
 * Stream orchestrator execution via SSE
 */
v2AgentRoutes.post('/', async (c) => {
  const agentLog = log.child({ module: 'v2-agent' })

  let body: {
    message?: string
    projectId?: string
    model?: string
    sandboxId?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { message, projectId, model = 'gpt-5.2-codex', sandboxId } = body
  agentLog.info(`V2 generation: project=${projectId} model=${model}`, { projectId, model })

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

  // Set up Mastra request context for model routing + Helicone
  const requestContext = new RequestContext()
  requestContext.set('selectedModel', model)
  requestContext.set('heliconeContext', {
    userId: user.id,
    projectId,
    sessionId: `${projectId}:${Date.now()}`,
    agentName: 'v2-orchestrator',
  })

  return createSSEStream<V2StreamEvent | CreditsUsedEvent>(async (emit, signal) => {
    let settled = false

    try {
      // Persist user message
      insertChatMessage(`user-${runId}`, projectId, 'user', [{ text: message }]).catch(() => {})

      // Build the user message with context
      let fullMessage = message
      if (sandboxId) {
        fullMessage = `[Existing sandbox: ${sandboxId}]\n\n${message}`
      }

      // Create agent and stream
      const agent = createV2Orchestrator()
      const streamOutput = await agent.stream(fullMessage, {
        requestContext,
        maxSteps: 50,
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

      // Persist assistant message
      insertChatMessage(
        `assistant-${runId}`,
        projectId,
        'assistant',
        [{ text: `Generation complete. Tokens: ${result.totalTokens}` }],
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
        agentLog.info('V2 stream aborted by client', { projectId, runId })
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
        tags: { route: '/api/v2/agent' },
        extra: { projectId, model, userId: user.id },
      })

      emit({
        type: 'v2_error',
        message: error instanceof Error ? error.message : 'Generation failed',
      })
    }
  })
})
