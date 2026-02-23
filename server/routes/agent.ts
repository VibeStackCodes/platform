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
import { createMockOrRealActor, isMockPipeline, MOCK_FILE_LIST, MOCK_GENERATED_PAGES } from '../lib/agents/machine'
import type { MachineContext } from '../lib/agents/machine'
import { editMachine } from '../lib/agents/edit-machine'
import type { EditMachineContext } from '../lib/agents/edit-machine'
import { RequestContext } from '../lib/agents/registry'
import { getProject, getUserCredits, getProjectGenerationState, updateProject, insertChatMessage } from '../lib/db/queries'
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

// TODO: Move to Redis/Vercel KV for cross-instance state in multi-instance deployments.
// In-memory Map works for single-instance but won't share state across Vercel cold starts.
const activeRuns = new Map<string, ActiveRun>()

// Note: In Vercel serverless, setInterval is a no-op across cold starts.
// activeRuns cleanup happens in the `finally` block of each request handler.
// This interval only helps during long-running dev server sessions.
if (process.env.NODE_ENV !== 'production') {
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
}

/** Map XState states to human-readable phase names + agent identifiers */
const STATE_PHASES: Record<string, { name: string; phase: number; agentId?: string; agentName?: string }> = {
  analyzing:            { name: 'Analyzing requirements',      phase: 1, agentId: 'analyst',     agentName: 'Analyst' },
  awaitingClarification:{ name: 'Awaiting clarification',     phase: 1 },
  provisioning:         { name: 'Provisioning infrastructure', phase: 1, agentId: 'provisioner', agentName: 'DevOps Agent' },
  architecting:         { name: 'Designing & architecting',    phase: 2, agentId: 'architect',   agentName: 'Architect Agent' },
  codeGeneration:       { name: 'Generating code',             phase: 3, agentId: 'codegen',     agentName: 'Code Agent' },
  validating:           { name: 'Validating code',             phase: 4, agentId: 'qa',          agentName: 'Quality Assurance' },
  repairing:            { name: 'Repairing errors',            phase: 4, agentId: 'repair',      agentName: 'Repair Agent' },
  complete:             { name: 'Complete',                    phase: 5 },
  failed:               { name: 'Failed',                      phase: 5 },
}

// Map parallel sub-state paths to STATE_PHASES keys
const PARALLEL_STATE_MAP: Record<string, Record<string, string>> = {
  analysis: {
    running: 'analyzing',
    awaitingClarification: 'awaitingClarification',
    done: '', // skip
  },
  infrastructure: {
    provisioning: 'provisioning',
    done: '', // skip
  },
}

/** Map XState states to DB status values for project updates */
const STATE_TO_DB_STATUS: Record<string, string> = {
  analyzing: 'planning',
  awaitingClarification: 'planning',
  provisioning: 'generating',
  architecting: 'planning',
  codeGeneration: 'generating',
  validating: 'verifying',
  repairing: 'verifying',
  complete: 'complete',
  failed: 'error',
}

/**
 * Subscribe to XState actor and emit SSE events for state transitions.
 * Emits rich events: agent_start/complete with duration, file events during
 * generating phase, plan_ready on blueprint→generating transition.
 * Returns a Promise that resolves when the actor reaches a final state.
 */
function streamActorStates(
  // biome-ignore lint/suspicious/noExplicitAny: XState Actor type is complex generic
  actor: any,
  emit: (event: StreamEvent) => void,
  signal: AbortSignal,
  runId: string,
  projectId: string,
  userId: string,
  mockMode = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Track when each agent-state was entered for duration calculation
    const stateEntryTimes = new Map<string, number>()
    let previousState: string | null = null
    let fileEventsEmitted = false
    let previousParallelSubStates = new Set<string>()

    const subscription = actor.subscribe((snapshot: { value: string; context: MachineContext; status?: string }) => {
      if (signal.aborted) {
        subscription.unsubscribe()
        resolve()
        return
      }

      const state = snapshot.value as string
      const phaseInfo = STATE_PHASES[state]

      // Handle parallel state (preparing): snapshot.value is an object, not a string
      if (typeof snapshot.value === 'object' && snapshot.value !== null) {
        const currentSubStates = new Set<string>()
        const stateObj = snapshot.value as Record<string, Record<string, string>>

        for (const [branch, subStateMap] of Object.entries(PARALLEL_STATE_MAP)) {
          const subVal = stateObj.preparing?.[branch]
          if (typeof subVal === 'string') {
            const mappedKey = subStateMap[subVal]
            if (mappedKey) currentSubStates.add(mappedKey)
          }
        }

        // Emit agent_complete for sub-states that just finished
        for (const prev of previousParallelSubStates) {
          if (!currentSubStates.has(prev)) {
            const prevPhase = STATE_PHASES[prev]
            if (prevPhase?.agentId) {
              const entryTime = stateEntryTimes.get(prev)
              const durationMs = entryTime ? Date.now() - entryTime : 0
              emit({ type: 'agent_complete', agentId: prevPhase.agentId, tokensUsed: 0, durationMs })
            }
          }
        }

        // Emit agent_start for newly appeared sub-states
        for (const curr of currentSubStates) {
          if (!previousParallelSubStates.has(curr)) {
            stateEntryTimes.set(curr, Date.now())
            const phase = STATE_PHASES[curr]
            if (phase) {
              emit({ type: 'phase_start', phase: phase.phase, phaseName: phase.name, agentCount: 1 })
              if (phase.agentId && phase.agentName) {
                emit({ type: 'agent_start', agentId: phase.agentId, agentName: phase.agentName, phase: phase.phase })
              }
              // Emit initial progress for provisioner
              if (phase.agentId === 'provisioner') {
                emit({ type: 'agent_progress', agentId: 'provisioner', message: 'Booting sandbox...' })
              }
            }
          }
        }

        previousParallelSubStates = currentSubStates
        return // Skip the flat-string logic below
      }

      // Reset parallel tracking when leaving parallel state
      if (previousParallelSubStates.size > 0) {
        for (const prev of previousParallelSubStates) {
          const prevPhase = STATE_PHASES[prev]
          if (prevPhase?.agentId) {
            const entryTime = stateEntryTimes.get(prev)
            const durationMs = entryTime ? Date.now() - entryTime : 0
            emit({ type: 'agent_complete', agentId: prevPhase.agentId, tokensUsed: 0, durationMs })
          }
        }
        previousParallelSubStates = new Set()
      }

      // Update project status in DB based on state transition (fire-and-forget)
      // Skip DB updates in mock mode
      if (!mockMode) {
        const dbStatus = STATE_TO_DB_STATUS[state]
        if (dbStatus) {
          updateProject(projectId, { status: dbStatus }, userId).catch((err) => {
            console.error('[agent] Failed to update project status:', err)
          })
        }
      }

      if (!phaseInfo) {
        return
      }

      // ── Emit agent_complete for the previous state ──
      if (previousState && previousState !== state) {
        const prevPhase = STATE_PHASES[previousState]
        if (prevPhase?.agentId) {
          const entryTime = stateEntryTimes.get(previousState)
          const durationMs = entryTime ? Date.now() - entryTime : 0
          emit({
            type: 'agent_complete',
            agentId: prevPhase.agentId,
            tokensUsed: 0,
            durationMs,
          })
          // Mark the previous checkpoint complete
          emit({
            type: 'checkpoint',
            label: prevPhase.name,
            status: 'complete',
          })
        }

        // Emit design_tokens when transitioning FROM architecting
        // Creative Director now produces both spec and tokens in one step
        if (previousState === 'architecting') {
          const tokens = snapshot.context.tokens
          if (tokens) {
            emit({ type: 'design_tokens', tokens: tokens as unknown as Record<string, unknown> })
          }
        }

        // Pipeline B: emit architecture_ready when transitioning FROM architecting
        // context.creativeSpec is added by the Pipeline B machine rewrite
        if (previousState === 'architecting') {
          // biome-ignore lint/suspicious/noExplicitAny: Pipeline B context field not yet on MachineContext
          const creativeSpec = (snapshot.context as any).creativeSpec
          if (creativeSpec) {
            const spec = {
              archetype: creativeSpec.archetype as string,
              sitemap: (creativeSpec.sitemap as Array<Record<string, unknown>>).map((p) => ({
                route: p.route as string,
                componentName: p.componentName as string,
                purpose: p.purpose as string,
                sections: (p.brief as { sections?: string[] } | undefined)?.sections ?? [],
                dataRequirements: (p.dataRequirements as string | undefined) ?? 'none',
              })),
              auth: creativeSpec.auth as boolean,
            }
            emit({ type: 'architecture_ready', spec })
          }
        }

        // When leaving 'codeGeneration', emit page_complete + file_assembled events
        if (previousState === 'codeGeneration') {
          // Emit page_complete for each generated page
          const pages = snapshot.context.generatedPages ?? []
          const totalPages = pages.length
          for (let i = 0; i < totalPages; i++) {
            const page = pages[i]
            emit({
              type: 'page_complete',
              fileName: page.fileName,
              route: page.route,
              componentName: page.componentName,
              lineCount: page.content.split('\n').length,
              code: page.content.split('\n').slice(0, 50).join('\n'),
              pageIndex: i,
              totalPages,
            })
          }
          // Emit file_assembled for deterministic files (filter out ui-kit)
          const assembledFiles = (snapshot.context.assembledFiles ?? [])
            .filter((f: { path: string }) => !f.path.includes('components/ui/'))
          for (const file of assembledFiles) {
            const category = file.path.includes('routes/') ? 'route' as const
              : file.path.includes('vite.config') || file.path.includes('main.tsx') || file.path.includes('__root') ? 'config' as const
              : 'wiring' as const
            emit({ type: 'file_assembled', path: file.path, category })
          }
        }

        // When leaving 'validating', emit validation_check events (populates QA card)
        if (previousState === 'validating' && snapshot.context.validation) {
          const validation = snapshot.context.validation
          const checkNames = ['typecheck', 'lint', 'build'] as const
          for (const checkName of checkNames) {
            const check = validation[checkName]
            if (check) {
              emit({
                type: 'validation_check',
                name: checkName,
                status: check.passed ? 'passed' : 'failed',
              })
            }
          }
        }

        // When leaving 'repairing', emit progress for repair agent card
        if (previousState === 'repairing') {
          emit({ type: 'agent_progress', agentId: 'repair', message: 'Repair cycle complete — re-validating...' })
        }
      }

      // Track entry time for duration calculation
      if (state !== previousState) {
        stateEntryTimes.set(state, Date.now())
      }
      previousState = state

      // ── Emit phase events ──
      if (state === 'complete') {
        // Persist generation state to DB for later edits/deploys (fire-and-forget, skip in mock mode)
        if (!mockMode) {
          const ctx = snapshot.context
          updateProject(
            projectId,
            {
              status: 'complete',
              sandboxId: ctx.sandboxId,
              githubRepoUrl: ctx.githubHtmlUrl,
              generationState: {
                contract: null,
                blueprint: ctx.blueprint,
                sandboxId: ctx.sandboxId,
                tokens: ctx.tokens,
                creativeSpec: ctx.creativeSpec,
                appName: ctx.appName,
                appDescription: ctx.appDescription,
              },
            },
            userId,
          ).catch((err) => {
            console.error('[agent] Failed to persist generation state:', err)
          })
        }

        emit({ type: 'stage_update', stage: 'complete' })
        emit({
          type: 'complete',
          projectId,
          urls: { deploy: snapshot.context.deploymentUrl ?? undefined },
          requirementResults: [],
        })
        subscription.unsubscribe()
        resolve()
      } else if (state === 'failed') {
        const errorMsg = snapshot.context.error ?? 'Pipeline failed'
        if (!mockMode) {
          Sentry.captureMessage(errorMsg, {
            level: 'error',
            tags: { operation: 'state_machine', state: 'failed' },
          })
        }
        emit({
          type: 'error',
          message: errorMsg,
          stage: 'error',
        })
        subscription.unsubscribe()
        reject(new Error(errorMsg))
      } else if (state === 'awaitingClarification') {
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

        // Emit sandbox_ready when entering architecting (provisioning is complete)
        if (state === 'architecting' && snapshot.context.sandboxId) {
          emit({ type: 'agent_progress', agentId: 'provisioner', message: 'Sandbox ready' })
          emit({ type: 'sandbox_ready', sandboxId: snapshot.context.sandboxId })
          // Persist sandboxId to DB for page reloads (fire-and-forget, skip in mock mode)
          if (!mockMode) {
            updateProject(projectId, { sandboxId: snapshot.context.sandboxId }, userId).catch((err) => {
              console.error('[agent] Failed to persist sandboxId:', err)
            })
          }
        }

        // Emit plan_ready when entering architecting (Analyst PRD is ready)
        if (state === 'architecting') {
          emit({
            type: 'plan_ready',
            plan: {
              appName: snapshot.context.appName,
              appDescription: snapshot.context.appDescription,
              prd: snapshot.context.prd ?? '',
            },
          })
        }

        // Emit progress when entering repairing state
        if (state === 'repairing') {
          const errorCount = snapshot.context.validation?.typecheck?.errors?.length
            ?? snapshot.context.validation?.build?.errors?.length
            ?? 0
          emit({
            type: 'agent_progress',
            agentId: 'repair',
            message: `Fixing ${errorCount} error${errorCount !== 1 ? 's' : ''}...`,
          })
        }

        // Emit agent_start for states that have an agent
        if (phaseInfo.agentId && phaseInfo.agentName) {
          emit({
            type: 'agent_start',
            agentId: phaseInfo.agentId,
            agentName: phaseInfo.agentName,
            phase: phaseInfo.phase,
          })

          // In mock mode, emit descriptive agent_progress so cards aren't empty
          if (mockMode) {
            const mockProgress: Record<string, string[]> = {
              analyst:     ['Parsing user requirements...', 'Extracting features...', 'Building product requirements...'],
              provisioner: ['Booting sandbox...', 'Setting up GitHub repo...'],
              designer:    ['Selecting theme...', 'Generating color palette...', 'Choosing typography...'],
              architect:   ['Analyzing app structure...', 'Creating sitemap...', 'Planning page sections...'],
              codegen:     ['Generating pages...', 'Assembling config files...', 'Uploading to sandbox...', 'Installing dependencies...'],
              qa:          ['Running TypeScript check...', 'Running linter...', 'Building app...'],
              repair:      ['Analyzing errors...', 'Fixing import issues...', 'Retrying build...'],
            }
            const progressMessages = mockProgress[phaseInfo.agentId]
            if (progressMessages && progressMessages.length > 0) {
              emit({ type: 'agent_progress', agentId: phaseInfo.agentId, message: progressMessages[0] })
            }
          }
        }

        // Emit file events during codeGeneration state (mock: emit from blueprint file list)
        if (state === 'codeGeneration' && !fileEventsEmitted) {
          fileEventsEmitted = true
          const files = mockMode
            ? MOCK_FILE_LIST
            : snapshot.context.blueprint?.fileTree?.map((f: { path: string }) => f.path) ?? []

          // Emit file_start for all files immediately
          for (const filePath of files) {
            emit({ type: 'file_start', path: filePath, layer: 0 })
          }

          // In mock mode, schedule file_complete events with staggered delays
          if (mockMode) {
            for (let i = 0; i < files.length; i++) {
              setTimeout(() => {
                emit({
                  type: 'file_complete',
                  path: files[i],
                  linesOfCode: 20 + Math.floor(Math.random() * 80),
                })
              }, 200 * (i + 1))
            }
          }

          // Mock mode: emit per-page progress events (page_generating → page_complete)
          if (mockMode) {
            const pages = MOCK_GENERATED_PAGES
            const total = pages.length
            for (let i = 0; i < total; i++) {
              const page = pages[i]
              // Stagger: page_generating at 300ms intervals, page_complete 400ms later
              setTimeout(() => {
                emit({
                  type: 'page_generating',
                  fileName: page.fileName,
                  route: page.route,
                  componentName: page.componentName,
                  pageIndex: i,
                  totalPages: total,
                })
              }, 300 * i)
              setTimeout(() => {
                const lineCount = page.content.split('\n').length
                emit({
                  type: 'page_complete',
                  fileName: page.fileName,
                  route: page.route,
                  componentName: page.componentName,
                  lineCount,
                  code: page.content.split('\n').slice(0, 50).join('\n'),
                  pageIndex: i,
                  totalPages: total,
                })
              }, 300 * i + 400)
            }
          }
        }

        // Mock mode: emit validation_check events during validating state
        if (state === 'validating' && mockMode) {
          const checks = ['typecheck', 'lint', 'build'] as const
          for (let i = 0; i < checks.length; i++) {
            // Emit 'running' then 'passed' with stagger
            setTimeout(() => {
              emit({ type: 'validation_check', name: checks[i], status: 'running' })
            }, 200 * i)
            setTimeout(() => {
              emit({ type: 'validation_check', name: checks[i], status: 'passed' })
            }, 200 * i + 150)
          }
        }
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
  console.log('[agent] POST /api/agent received')
  // Parse request body
  let body: { message?: string; projectId?: string; model?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { message, projectId, model = 'gpt-5.2-codex' } = body
  console.log('[agent] projectId:', projectId, 'model:', model, 'message:', message?.slice(0, 50))

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

  // Verify project ownership before starting generation
  const ownedProject = await getProject(projectId, user.id)
  if (!ownedProject) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const mockMode = isMockPipeline()

  // M4: Check concurrent generation limit FIRST (before reserving credits)
  const userRuns = [...activeRuns.values()].filter((r) => r.userId === user.id).length
  if (userRuns >= 3) {
    return c.json(
      {
        error: 'concurrent_limit',
        message: 'Maximum 3 concurrent generations',
      },
      429,
    )
  }

  // Skip credit reservation in mock mode
  const CREDIT_RESERVATION = 50 // Minimum reservation amount
  if (!mockMode) {
    console.log('[agent] Reserving credits for user:', user.id, 'amount:', CREDIT_RESERVATION)
    const reserved = await reserveCredits(user.id, CREDIT_RESERVATION)
    console.log('[agent] Reservation result:', reserved)
    if (!reserved) {
      // Check current credits for detailed error message
      const credits = await getUserCredits(user.id)
      console.log('[agent] getUserCredits result:', credits)
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
  }

  // Inject per-request Helicone context via RequestContext (skip in mock mode).
  if (!mockMode) {
    const heliconeContext = {
      userId: user.id,
      projectId,
      sessionId: `${projectId}:${Date.now()}`,
    }
    const requestContext = new RequestContext()
    requestContext.set('heliconeContext', heliconeContext)
    requestContext.set(
      'llm',
      createHeliconeProvider({ ...heliconeContext, agentName: 'app-generation' })(model),
    )
    requestContext.set('userId', user.id)
  }

  // H1: Create XState actor with error handling to refund credits on failure
  const runId = crypto.randomUUID()
  let actor: any
  try {
    actor = await createMockOrRealActor()
    activeRuns.set(runId, {
      actor,
      userId: user.id,
      projectId,
      model,
      createdAt: Date.now(),
      reservedCredits: mockMode ? 0 : CREDIT_RESERVATION,
      settled: mockMode, // Mock mode: already settled (no credits to settle)
    })
    actor.start()
  } catch (error) {
    // Refund reserved credits if actor creation fails (skip in mock mode)
    if (!mockMode) {
      await settleCredits(user.id, CREDIT_RESERVATION, 0)
    }
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
    try {
      // Persist user message to DB (fire-and-forget, skip in mock mode)
      if (!mockMode) {
        insertChatMessage(`user-${runId}`, projectId, 'user', [{ text: message }]).catch((err) => {
          console.error('[agent] Failed to save user message:', err)
        })
      }

      emit({ type: 'stage_update', stage: 'generating' })

      // Subscribe BEFORE sending START to avoid missing initial state transitions.
      // XState's subscribe() only fires on future snapshot changes, so if START
      // triggers synchronous transitions (idle → preparing → parallel sub-states),
      // subscribing after send() would miss the initial agent_start events.
      const streamPromise = streamActorStates(actor, emit, signal, runId, projectId, user.id, mockMode)

      // Now send START — the subscription above will catch all transitions
      actor.send({ type: 'START', userMessage: message, projectId, userId: user.id })

      // Wait for actor to reach final state
      await streamPromise

      // Get final snapshot to read totalTokens from machine context
      const finalSnapshot = actor.getSnapshot()
      const totalTokens = finalSnapshot.context.totalTokens
      const creditsUsed = Math.ceil(totalTokens / 1000) // 1 credit = 1,000 tokens

      // Persist assistant message to DB (fire-and-forget, skip in mock mode)
      if (!mockMode) {
        const appName = finalSnapshot.context.appName || 'App'
        const appDesc = finalSnapshot.context.appDescription || ''
        const assistantText = appDesc
          ? `I'll build **${appName}** — ${appDesc}`
          : `Building ${appName}...`
        insertChatMessage(`assistant-${runId}`, projectId, 'assistant', [{ text: assistantText }]).catch((err) => {
          console.error('[agent] Failed to save assistant message:', err)
        })
      }

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
      } else if (mockMode) {
        // In mock mode, emit synthetic credits_used event
        emit({
          type: 'credits_used',
          creditsUsed: 0,
          creditsRemaining: 999,
          tokensTotal: totalTokens,
        })
      }
    } catch (error) {
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
        message: 'Agent pipeline failed — please try again',
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
      // Subscribe BEFORE sending event to avoid missing state transitions
      const streamPromise = streamActorStates(stored.actor, emit, signal, runId, stored.projectId, stored.userId)

      // Send USER_ANSWERED event to actor
      stored.actor.send({ type: 'USER_ANSWERED', answers })

      // Wait for actor to reach final state
      await streamPromise

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
        message: 'Resume failed — please try again',
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
      model: body.model || 'gpt-5.2-codex',
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
    analyzing: { name: 'Analyzing request', phase: 2 },
    injecting: { name: 'Adding capabilities', phase: 2 },
    injectionUploading: { name: 'Uploading new files', phase: 3 },
    injectionMigrating: { name: 'Running migration', phase: 4 },
    injectionValidating: { name: 'Validating changes', phase: 5 },
    injectionRepairing: { name: 'Repairing errors', phase: 5 },
    injectionDeploying: { name: 'Deploying update', phase: 6 },
    editing: { name: 'Applying edit', phase: 3 },
    validating: { name: 'Validating changes', phase: 4 },
    persisting: { name: 'Persisting changes', phase: 5 },
    complete: { name: 'Complete', phase: 6 },
    failed: { name: 'Failed', phase: 6 },
  }

  // Define status mapping for edit machine states
  const EDIT_STATE_TO_DB_STATUS: Record<string, string> = {
    loading: 'planning',
    reconnecting: 'planning',
    analyzing: 'planning',
    injecting: 'generating',
    injectionUploading: 'generating',
    injectionMigrating: 'generating',
    injectionValidating: 'verifying',
    injectionRepairing: 'verifying',
    injectionDeploying: 'deploying',
    editing: 'generating',
    validating: 'verifying',
    persisting: 'deploying',
    complete: 'deployed',
    failed: 'error',
  }

  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' })

      // Subscribe BEFORE sending START to avoid missing initial state transitions
      const editStreamPromise = new Promise<void>((resolve, reject) => {
        const subscription = actor.subscribe(
          (snapshot: { value: string; context: EditMachineContext }) => {
            if (signal.aborted) {
              subscription.unsubscribe()
              resolve()
              return
            }

            const state = snapshot.value as string
            const phaseInfo = EDIT_STATE_PHASES[state]

            // Update project status in DB based on state transition
            const dbStatus = EDIT_STATE_TO_DB_STATUS[state]
            if (dbStatus) {
              updateProject(projectId, { status: dbStatus }, user.id).catch((err) => {
                console.error('[agent:edit] Failed to update project status:', err)
              })
            }

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

      // Now send START — the subscription above catches all transitions
      actor.send({
        type: 'START',
        userMessage: message,
        projectId,
        userId: user.id,
        targetElement,
      })

      // Wait for edit stream to complete
      await editStreamPromise

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
          message: 'Edit pipeline failed — please try again',
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
