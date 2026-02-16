/**
 * POST /api/agent
 * XState-based agent route that orchestrates app generation via state machine
 *
 * Request body:
 *   { message: string, projectId: string, model?: string }
 *
 * Response:
 *   SSE stream with StreamEvent types from lib/types.ts
 *
 * Credit enforcement:
 *   - Checks credits_remaining before starting
 *   - Returns 402 if insufficient credits
 *   - Deducts credits after completion (1 credit = 1,000 tokens)
 *   - Emits credits_used event to client
 */

import crypto from 'node:crypto'
import { createActor } from 'xstate'
import { Hono } from 'hono'
import { createHeliconeProvider, isAllowedModel } from '../lib/agents/provider'
import { appGenerationMachine } from '../lib/agents/machine'
import type { MachineContext } from '../lib/agents/machine'
import { RequestContext } from '../lib/agents/registry'
import { getUserCredits } from '../lib/db/queries'
import { createSSEStream } from '../lib/sse'
import type { StreamEvent } from '../lib/types'
import { authMiddleware } from '../middleware/auth'

export const agentRoutes = new Hono()

// Apply auth middleware to all routes
agentRoutes.use('*', authMiddleware)

interface ActiveRun {
  // biome-ignore lint/suspicious/noExplicitAny: XState Actor type is complex generic
  actor: any
  userId: string
  projectId: string
  model: string
  createdAt: number
}

const activeRuns = new Map<string, ActiveRun>()

// Cleanup expired runs every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 3600_000 // 1 hour
  for (const [id, entry] of activeRuns) {
    if (entry.createdAt < cutoff) {
      try {
        entry.actor.stop()
      } catch {
        // Already stopped
      }
      activeRuns.delete(id)
    }
  }
}, 1800_000)

/** Map XState states to human-readable phase names */
const STATE_PHASES: Record<string, { name: string; phase: number }> = {
  analyzing: { name: 'Analyzing requirements', phase: 1 },
  awaitingClarification: { name: 'Awaiting clarification', phase: 1 },
  blueprinting: { name: 'Creating blueprint', phase: 2 },
  provisioning: { name: 'Provisioning infrastructure', phase: 3 },
  generating: { name: 'Generating code', phase: 4 },
  validating: { name: 'Validating code', phase: 5 },
  repairing: { name: 'Repairing errors', phase: 5 },
  deploying: { name: 'Deploying application', phase: 6 },
  complete: { name: 'Complete', phase: 7 },
  failed: { name: 'Failed', phase: 7 },
}

/**
 * Subscribe to XState actor and emit SSE events for state transitions.
 * Returns a Promise that resolves when the actor reaches a final state.
 */
function streamActorStates(
  // biome-ignore lint/suspicious/noExplicitAny: XState Actor type is complex generic
  actor: any,
  emit: (event: StreamEvent) => void,
  signal: AbortSignal,
  runId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const subscription = actor.subscribe((snapshot: { value: string; context: MachineContext; status?: string }) => {
      if (signal.aborted) {
        subscription.unsubscribe()
        resolve()
        return
      }

      const state = snapshot.value as string
      const phaseInfo = STATE_PHASES[state]

      if (!phaseInfo) {
        return
      }

      // Emit phase events
      if (state === 'complete') {
        emit({ type: 'stage_update', stage: 'complete' })
        emit({
          type: 'checkpoint',
          label: 'Pipeline complete',
          status: 'complete',
        })
        subscription.unsubscribe()
        resolve()
      } else if (state === 'failed') {
        const errorMsg = snapshot.context.error ?? 'Pipeline failed'
        emit({
          type: 'error',
          message: errorMsg,
          stage: 'error',
        })
        subscription.unsubscribe()
        reject(new Error(errorMsg))
      } else if (state === 'awaitingClarification') {
        // Special handling for clarification state
        const questions = snapshot.context.clarificationQuestions
        if (questions) {
          emit({
            type: 'clarification_request',
            questions: questions as any[],
            runId,
          })
        }
        emit({
          type: 'checkpoint',
          label: phaseInfo.name,
          status: 'active',
        })
      } else {
        // Regular state transition
        emit({
          type: 'stage_update',
          stage: 'generating',
        })
        emit({
          type: 'phase_start',
          phase: phaseInfo.phase,
          phaseName: phaseInfo.name,
          agentCount: 1,
        })
        emit({
          type: 'checkpoint',
          label: phaseInfo.name,
          status: 'active',
        })
      }
    })

    // Clean up subscription on abort
    signal.addEventListener('abort', () => {
      subscription.unsubscribe()
      resolve()
    })
  })
}

/**
 * POST /api/agent
 * Stream agent execution via SSE using XState actor
 */
agentRoutes.post('/', async (c) => {
  // Parse request body
  let body: { message?: string; projectId?: string; model?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { message, projectId, model = 'gpt-5.2' } = body

  // Validate required fields
  if (!message || !projectId) {
    return c.json({ error: 'Missing message or projectId' }, 400)
  }

  // Validate model
  if (!isAllowedModel(model)) {
    return c.json({ error: `Model "${model}" is not available` }, 400)
  }

  // Get authenticated user from middleware
  const user = c.var.user

  // Credit check using Drizzle
  const credits = await getUserCredits(user.id)
  if (!credits || credits.creditsRemaining <= 0) {
    return c.json(
      {
        error: 'insufficient_credits',
        credits_remaining: credits?.creditsRemaining ?? 0,
        credits_reset_at: credits?.creditsResetAt ?? null,
      },
      402,
    )
  }

  // Inject per-request Helicone-proxied model via RequestContext
  const requestContext = new RequestContext()
  requestContext.set(
    'llm',
    createHeliconeProvider({
      userId: user.id,
      projectId,
      sessionId: `${projectId}:${Date.now()}`,
      agentName: 'app-generation',
    })(model),
  )
  requestContext.set('userId', user.id)

  // Create XState actor
  const runId = crypto.randomUUID()
  const actor = createActor(appGenerationMachine)
  activeRuns.set(runId, { actor, userId: user.id, projectId, model, createdAt: Date.now() })

  // Start actor
  actor.start()

  // Return SSE stream
  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' })

      // Send START event to actor
      actor.send({ type: 'START', userMessage: message, projectId })

      // Stream state transitions
      await streamActorStates(actor, emit, signal, runId)

      // For now, emit placeholder credits_used event
      // TODO: Track actual token usage from LLM calls in actor invoke handlers
      emit({
        type: 'credits_used',
        creditsUsed: 1,
        creditsRemaining: credits.creditsRemaining - 1,
        tokensTotal: 1000,
      })
    } catch (error) {
      if (signal.aborted) {
        console.log('[agent] Stream aborted by client')
        return
      }
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent pipeline failed',
        stage: 'error',
      })
    } finally {
      try {
        actor.stop()
      } catch {
        // Already stopped
      }
      activeRuns.delete(runId)
    }
  })
})

/**
 * POST /api/agent/resume
 * Resume a suspended actor with user answers
 */
agentRoutes.post('/resume', async (c) => {
  let body: { runId?: string; answers?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { runId, answers } = body
  if (!runId || !answers) {
    return c.json({ error: 'Missing runId or answers' }, 400)
  }

  const stored = activeRuns.get(runId)
  if (!stored) {
    return c.json({ error: 'Run not found or expired' }, 404)
  }

  const user = c.var.user
  if (stored.userId !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403)
  }

  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      // Send USER_ANSWERED event to actor
      stored.actor.send({ type: 'USER_ANSWERED', answers })

      // Stream state transitions
      await streamActorStates(stored.actor, emit, signal, runId)

      // For now, emit placeholder credits_used event
      emit({
        type: 'credits_used',
        creditsUsed: 1,
        creditsRemaining: 0,
        tokensTotal: 1000,
      })
    } catch (error) {
      if (signal.aborted) return
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Resume failed',
        stage: 'error',
      })
    } finally {
      try {
        stored.actor.stop()
      } catch {
        // Already stopped
      }
      activeRuns.delete(runId)
    }
  })
})
