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
import * as Sentry from '@sentry/node'
import { createHeliconeProvider, isAllowedModel } from '../lib/agents/provider'
import { appGenerationMachine } from '../lib/agents/machine'
import type { MachineContext } from '../lib/agents/machine'
import { editMachine } from '../lib/agents/edit-machine'
import type { EditMachineContext } from '../lib/agents/edit-machine'
import { RequestContext } from '../lib/agents/registry'
import { getUserCredits, getProjectGenerationState, updateProject } from '../lib/db/queries'
import { reserveCredits, settleCredits } from '../lib/credits'
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
  reservedCredits: number
  settled: boolean
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

/** Map XState states to DB status values for project updates */
const STATE_TO_DB_STATUS: Record<string, string> = {
  analyzing: 'planning',
  awaitingClarification: 'planning',
  blueprinting: 'planning',
  provisioning: 'generating',
  generating: 'generating',
  validating: 'verifying',
  repairing: 'verifying',
  reviewing: 'verifying',
  deploying: 'deploying',
  complete: 'deployed',
  failed: 'error',
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
  projectId: string,
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

      // Update project status in DB based on state transition (fire-and-forget)
      const dbStatus = STATE_TO_DB_STATUS[state]
      if (dbStatus) {
        updateProject(projectId, { status: dbStatus }).catch((err) => {
          console.error('[agent] Failed to update project status:', err)
        })
      }

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
        Sentry.captureMessage(errorMsg, {
          level: 'error',
          tags: { operation: 'state_machine', state: 'failed' },
        })
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

  // Reserve credits atomically to prevent race conditions
  const CREDIT_RESERVATION = 50 // Minimum reservation amount
  const reserved = await reserveCredits(user.id, CREDIT_RESERVATION)
  if (!reserved) {
    // Check current credits for detailed error message
    const credits = await getUserCredits(user.id)
    return c.json(
      {
        error: 'insufficient_credits',
        message: 'Not enough credits to start generation',
        credits_remaining: credits?.creditsRemaining ?? 0,
        credits_reset_at: credits?.creditsResetAt ?? null,
      },
      402,
    )
  }

  // M4: Check concurrent generation limit (max 3 per user)
  const userRuns = [...activeRuns.values()].filter((r) => r.userId === user.id).length
  if (userRuns >= 3) {
    // Refund the reservation we just made
    await settleCredits(user.id, CREDIT_RESERVATION, 0)
    return c.json(
      {
        error: 'concurrent_limit',
        message: 'Maximum 3 concurrent generations',
      },
      429,
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

  // H1: Create XState actor with error handling to refund credits on failure
  const runId = crypto.randomUUID()
  let actor: any
  try {
    actor = createActor(appGenerationMachine)
    activeRuns.set(runId, {
      actor,
      userId: user.id,
      projectId,
      model,
      createdAt: Date.now(),
      reservedCredits: CREDIT_RESERVATION,
      settled: false,
    })
    actor.start()
  } catch (error) {
    // Refund reserved credits if actor creation fails
    await settleCredits(user.id, CREDIT_RESERVATION, 0)
    Sentry.captureException(error, {
      tags: { route: '/api/agent', operation: 'actor_creation' },
      extra: { projectId, model, userId: user.id },
    })
    return c.json(
      {
        error: 'actor_creation_failed',
        message: 'Failed to initialize generation pipeline',
      },
      500,
    )
  }

  // Return SSE stream
  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    let generationFailed = false
    try {
      emit({ type: 'stage_update', stage: 'generating' })

      // Send START event to actor
      actor.send({ type: 'START', userMessage: message, projectId, userId: user.id })

      // Stream state transitions
      await streamActorStates(actor, emit, signal, runId, projectId)

      // Get final snapshot to read totalTokens from machine context
      const finalSnapshot = actor.getSnapshot()
      const totalTokens = finalSnapshot.context.totalTokens
      const creditsUsed = Math.ceil(totalTokens / 1000) // 1 credit = 1,000 tokens

      // B2: Check settled flag to prevent double-settlement
      const activeRun = activeRuns.get(runId)
      if (activeRun && !activeRun.settled) {
        // Settle reserved credits with actual usage
        const settlement = await settleCredits(user.id, CREDIT_RESERVATION, creditsUsed)
        activeRun.settled = true

        // Emit real credit usage with settled remaining balance
        emit({
          type: 'credits_used',
          creditsUsed,
          creditsRemaining: settlement.creditsRemaining,
          tokensTotal: totalTokens,
        })
      }
    } catch (error) {
      generationFailed = true
      if (signal.aborted) {
        console.log('[agent] Stream aborted by client')
        // Refund reserved credits on abort (check settled flag)
        const activeRun = activeRuns.get(runId)
        if (activeRun && !activeRun.settled) {
          await settleCredits(user.id, CREDIT_RESERVATION, 0)
          activeRun.settled = true
        }
        return
      }
      // Refund reserved credits on error (check settled flag)
      const activeRun = activeRuns.get(runId)
      if (activeRun && !activeRun.settled) {
        await settleCredits(user.id, CREDIT_RESERVATION, 0)
        activeRun.settled = true
      }
      Sentry.captureException(error, {
        tags: { route: '/api/agent', operation: 'generation' },
        extra: { projectId, model, userId: user.id },
      })
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
    let generationFailed = false
    try {
      // Send USER_ANSWERED event to actor
      stored.actor.send({ type: 'USER_ANSWERED', answers })

      // Stream state transitions
      await streamActorStates(stored.actor, emit, signal, runId, stored.projectId)

      // Get final snapshot to read totalTokens from machine context
      const finalSnapshot = stored.actor.getSnapshot()
      const totalTokens = finalSnapshot.context.totalTokens
      const creditsUsed = Math.ceil(totalTokens / 1000) // 1 credit = 1,000 tokens

      // B2: Check settled flag to prevent double-settlement
      if (!stored.settled) {
        // Settle reserved credits with actual usage (from initial reservation)
        const settlement = await settleCredits(user.id, stored.reservedCredits, creditsUsed)
        stored.settled = true

        // Emit real credit usage with settled remaining balance
        emit({
          type: 'credits_used',
          creditsUsed,
          creditsRemaining: settlement.creditsRemaining,
          tokensTotal: totalTokens,
        })
      }
    } catch (error) {
      generationFailed = true
      if (signal.aborted) {
        console.log('[agent] Resume stream aborted by client')
        // Refund reserved credits on abort (check settled flag)
        if (!stored.settled) {
          await settleCredits(user.id, stored.reservedCredits, 0)
          stored.settled = true
        }
        return
      }
      // Refund reserved credits on error (check settled flag)
      if (!stored.settled) {
        await settleCredits(user.id, stored.reservedCredits, 0)
        stored.settled = true
      }
      Sentry.captureException(error, {
        tags: { route: '/api/agent/resume', operation: 'resume' },
        extra: { runId },
      })
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

/**
 * POST /api/agent/edit
 * Apply an iterative edit to an existing generated project
 */
agentRoutes.post('/edit', async (c) => {
  let body: {
    message?: string
    projectId?: string
    model?: string
    targetElement?: {
      fileName: string
      lineNumber: number
      columnNumber: number
      tagName: string
      className: string
      textContent: string
      tailwindClasses: string[]
      rect: { x: number; y: number; width: number; height: number }
    } | null
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { message, projectId, targetElement = null } = body

  if (!message || !projectId) {
    return c.json({ error: 'Missing message or projectId' }, 400)
  }

  const user = c.var.user

  // Verify project has generation state
  const project = await getProjectGenerationState(projectId, user.id)
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }
  if (!project.generationState || typeof project.generationState !== 'object') {
    return c.json(
      { error: 'Project has no generation state — generate the app first' },
      404,
    )
  }

  // Reserve fewer credits for edits (10 instead of 50)
  const EDIT_CREDIT_RESERVATION = 10
  const reserved = await reserveCredits(user.id, EDIT_CREDIT_RESERVATION)
  if (!reserved) {
    const credits = await getUserCredits(user.id)
    return c.json(
      {
        error: 'insufficient_credits',
        message: 'Not enough credits for edit',
        credits_remaining: credits?.creditsRemaining ?? 0,
      },
      402,
    )
  }

  // Create edit machine actor
  const runId = crypto.randomUUID()
  let actor: any
  try {
    actor = createActor(editMachine)
    activeRuns.set(runId, {
      actor,
      userId: user.id,
      projectId,
      model: body.model || 'gpt-5.2',
      createdAt: Date.now(),
      reservedCredits: EDIT_CREDIT_RESERVATION,
      settled: false,
    })
    actor.start()
  } catch (error) {
    await settleCredits(user.id, EDIT_CREDIT_RESERVATION, 0)
    Sentry.captureException(error, {
      tags: { route: '/api/agent/edit', operation: 'actor_creation' },
    })
    return c.json({ error: 'Failed to initialize edit pipeline' }, 500)
  }

  // Map edit machine states to SSE phases
  const EDIT_STATE_PHASES: Record<string, { name: string; phase: number }> = {
    loading: { name: 'Loading project state', phase: 1 },
    reconnecting: { name: 'Reconnecting sandbox', phase: 2 },
    editing: { name: 'Applying edit', phase: 3 },
    validating: { name: 'Validating changes', phase: 4 },
    persisting: { name: 'Persisting changes', phase: 5 },
    complete: { name: 'Complete', phase: 6 },
    failed: { name: 'Failed', phase: 6 },
  }

  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' })

      // Send START event with element context
      actor.send({
        type: 'START',
        userMessage: message,
        projectId,
        userId: user.id,
        targetElement,
      })

      // Stream edit machine states
      await new Promise<void>((resolve, reject) => {
        const subscription = actor.subscribe(
          (snapshot: { value: string; context: EditMachineContext }) => {
            if (signal.aborted) {
              subscription.unsubscribe()
              resolve()
              return
            }

            const state = snapshot.value as string
            const phaseInfo = EDIT_STATE_PHASES[state]
            if (!phaseInfo) return

            if (state === 'complete') {
              emit({ type: 'stage_update', stage: 'complete' })
              emit({ type: 'checkpoint', label: 'Edit complete', status: 'complete' })
              subscription.unsubscribe()
              resolve()
            } else if (state === 'failed') {
              const errorMsg = snapshot.context.error ?? 'Edit failed'
              emit({ type: 'error', message: errorMsg, stage: 'error' })
              subscription.unsubscribe()
              reject(new Error(errorMsg))
            } else {
              emit({ type: 'stage_update', stage: 'generating' })
              emit({
                type: 'phase_start',
                phase: phaseInfo.phase,
                phaseName: phaseInfo.name,
                agentCount: 1,
              })
              emit({ type: 'checkpoint', label: phaseInfo.name, status: 'active' })
            }
          },
        )

        signal.addEventListener('abort', () => {
          subscription.unsubscribe()
          resolve()
        })
      })

      // Settle credits
      const finalSnapshot = actor.getSnapshot()
      const totalTokens = finalSnapshot.context.totalTokens
      const creditsUsed = Math.ceil(totalTokens / 1000)

      const activeRun = activeRuns.get(runId)
      if (activeRun && !activeRun.settled) {
        const settlement = await settleCredits(user.id, EDIT_CREDIT_RESERVATION, creditsUsed)
        activeRun.settled = true
        emit({
          type: 'credits_used',
          creditsUsed,
          creditsRemaining: settlement.creditsRemaining,
          tokensTotal: totalTokens,
        })
      }
    } catch (error) {
      const activeRun = activeRuns.get(runId)
      if (activeRun && !activeRun.settled) {
        await settleCredits(user.id, EDIT_CREDIT_RESERVATION, 0)
        activeRun.settled = true
      }
      if (!signal.aborted) {
        Sentry.captureException(error, {
          tags: { route: '/api/agent/edit', operation: 'edit' },
        })
        emit({
          type: 'error',
          message: error instanceof Error ? error.message : 'Edit pipeline failed',
          stage: 'error',
        })
      }
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
