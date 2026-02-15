/**
 * POST /api/agent
 * Unified agent route that bridges Mastra appGenerationWorkflow to SSE streaming
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
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { WorkflowStreamEvent } from '@mastra/core/workflows'
import { mastra } from '../../src/mastra/index'
import { createHeliconeProvider, isAllowedModel } from '../lib/agents/provider'
import { RequestContext } from '../lib/agents/registry'
import { db } from '../lib/db/client'
import { getUserCredits } from '../lib/db/queries'
import { createSSEStream } from '../lib/sse'
import type { StreamEvent } from '../lib/types'
import { authMiddleware } from '../middleware/auth'

export const agentRoutes = new Hono()

// Apply auth middleware to all routes
agentRoutes.use('*', authMiddleware)

// biome-ignore lint/suspicious/noExplicitAny: Mastra Run type is complex generic
const activeRuns = new Map<
  string,
  { run: any; userId: string; projectId: string; model: string; createdAt: number }
>()

setInterval(() => {
  const cutoff = Date.now() - 3600_000
  for (const [id, entry] of activeRuns) {
    if (entry.createdAt < cutoff) activeRuns.delete(id)
  }
}, 1800_000)

/** Map workflow step IDs to human-readable phase names */
const STEP_PHASES: Record<string, { name: string; phase: number }> = {
  analyst: { name: 'Analyzing requirements', phase: 1 },
  'prepare-analyst-prompt': { name: 'Preparing analysis', phase: 1 },
  'create-sandbox': { name: 'Creating sandbox', phase: 2 },
  'create-supabase': { name: 'Creating database', phase: 2 },
  'create-github-repo': { name: 'Creating repository', phase: 2 },
  'prepare-infra-input': { name: 'Provisioning infrastructure', phase: 2 },
  'merge-infra': { name: 'Infrastructure ready', phase: 2 },
  'prepare-schema-input': { name: 'Preparing schema', phase: 3 },
  'schema-generation': { name: 'Generating schema', phase: 3 },
  'write-migration': { name: 'Writing migration', phase: 4 },
  'prepare-run-migration': { name: 'Preparing migration', phase: 4 },
  'run-migration': { name: 'Running migration', phase: 4 },
  'prepare-codegen-input': { name: 'Preparing code generation', phase: 5 },
  'code-generation': { name: 'Generating code', phase: 5 },
  'prepare-integration-input': { name: 'Preparing integration', phase: 6 },
  integration: { name: 'Wiring app together', phase: 6 },
  'prepare-qa-input': { name: 'Preparing validation', phase: 7 },
  'final-qa-gate': { name: 'Running QA checks', phase: 7 },
  'assemble-output': { name: 'Assembling results', phase: 8 },
}

async function processWorkflowStream(
  // biome-ignore lint/suspicious/noExplicitAny: WorkflowRunOutput has complex generic type
  output: any,
  emit: (event: StreamEvent) => void,
  signal: AbortSignal,
  user: { id: string },
  projectId: string,
  model: string,
  runId: string,
): Promise<void> {
  for await (const event of output.fullStream) {
    if (signal.aborted) {
      console.log('[agent] Client disconnected, stopping stream')
      break
    }

    const wfEvent = event as WorkflowStreamEvent

    switch (wfEvent.type) {
      case 'workflow-start':
        emit({
          type: 'stage_update',
          stage: 'generating',
        })
        break

      case 'workflow-step-start': {
        const stepId = wfEvent.payload?.id ?? ''
        const phaseInfo = STEP_PHASES[stepId]
        if (phaseInfo) {
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
        break
      }

      case 'workflow-step-finish': {
        const stepId = wfEvent.payload?.id ?? ''
        const phaseInfo = STEP_PHASES[stepId]
        if (phaseInfo) {
          emit({
            type: 'checkpoint',
            label: `${phaseInfo.name} complete`,
            status: 'complete',
          })
          emit({
            type: 'phase_complete',
            phase: phaseInfo.phase,
            phaseName: phaseInfo.name,
          })
        }
        break
      }

      case 'workflow-step-result': {
        const stepId = wfEvent.payload?.id ?? ''
        const status = wfEvent.payload?.status

        if (stepId === 'write-migration' && status === 'success') {
          emit({
            type: 'file_complete',
            path: 'supabase/migrations/001_initial.sql',
            linesOfCode: 0,
          })
        }

        if (stepId === 'final-qa-gate' && wfEvent.payload?.output) {
          const qa = wfEvent.payload.output as {
            typecheckPassed?: boolean
            lintPassed?: boolean
            buildPassed?: boolean
            typecheckOutput?: string
            lintOutput?: string
            buildOutput?: string
          }
          if (!qa.typecheckPassed || !qa.lintPassed || !qa.buildPassed) {
            const errors = []
            if (!qa.typecheckPassed)
              errors.push({
                file: 'tsc',
                message: qa.typecheckOutput ?? 'Type check failed',
                raw: qa.typecheckOutput ?? '',
              })
            if (!qa.lintPassed)
              errors.push({ file: 'lint', message: qa.lintOutput ?? 'Lint failed', raw: qa.lintOutput ?? '' })
            if (!qa.buildPassed)
              errors.push({
                file: 'build',
                message: qa.buildOutput ?? 'Build failed',
                raw: qa.buildOutput ?? '',
              })
            emit({ type: 'build_error', errors })
          }
        }
        break
      }

      case 'workflow-step-output':
        processNestedEvent(wfEvent.payload?.output, emit)
        break

      case 'workflow-step-suspended': {
        const suspendPayload = wfEvent.payload?.suspendPayload
        if (suspendPayload?.questions && Array.isArray(suspendPayload.questions)) {
          emit({
            type: 'clarification_request',
            questions: suspendPayload.questions,
            runId: runId,
          })
        } else {
          emit({
            type: 'plan_ready',
            plan: suspendPayload ?? {},
          })
        }
        break
      }

      case 'workflow-finish': {
        const wfStatus = wfEvent.payload?.workflowStatus
        if (wfStatus === 'success') {
          emit({
            type: 'checkpoint',
            label: 'Pipeline complete',
            status: 'complete',
          })
        } else if (wfStatus === 'failed') {
          // biome-ignore lint/suspicious/noExplicitAny: workflow payload has dynamic structure
          const errorMsg =
            typeof (wfEvent.payload as any)?.error === 'string'
              ? (wfEvent.payload as any).error
              : 'Pipeline failed'
          emit({
            type: 'error',
            message: errorMsg,
            stage: 'error',
          })
        }
        break
      }

      case 'workflow-canceled':
        emit({
          type: 'error',
          message: 'Workflow was canceled',
          stage: 'error',
        })
        break

      default:
        if (process.env.NODE_ENV === 'development') {
          console.log(
            `[agent] Unhandled workflow event: ${wfEvent.type}`,
            JSON.stringify(wfEvent.payload ?? {}).slice(0, 200),
          )
        }
        break
    }
  }

  const usage = await output.usage
  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0)

  if (totalTokens > 0) {
    const creditsUsed = Math.ceil(totalTokens / 1000)

    await db.execute(sql`SELECT deduct_credits(
      ${user.id}::uuid,
      ${creditsUsed}::int,
      ${projectId}::uuid,
      ${model}::text,
      ${'generation'}::text,
      ${usage?.inputTokens ?? 0}::int,
      ${usage?.outputTokens ?? 0}::int,
      ${totalTokens}::int
    )`)

    const updatedCredits = await getUserCredits(user.id)
    emit({
      type: 'credits_used',
      creditsUsed,
      creditsRemaining: updatedCredits?.creditsRemaining ?? 0,
      tokensTotal: totalTokens,
    })
  }

  emit({ type: 'stage_update', stage: 'complete' })
}

/**
 * Process nested agent/tool events from workflow-step-output.
 * When a workflow step runs an agent (e.g., codeGenStep calling pmAgent),
 * the agent's inner events bubble up as nested ChunkType payloads.
 */
function processNestedEvent(
  // biome-ignore lint/suspicious/noExplicitAny: Mastra nested payloads have dynamic structure
  nestedOutput: any,
  emit: (event: StreamEvent) => void,
): void {
  if (!nestedOutput || typeof nestedOutput !== 'object') return

  const type = nestedOutput.type as string | undefined
  // biome-ignore lint/suspicious/noExplicitAny: runtime payload
  const payload = (nestedOutput as any).payload ?? nestedOutput

  switch (type) {
    case 'tool-call':
      emit({
        type: 'agent_artifact',
        agentId: payload.toolName ?? 'pm',
        artifactType: 'tool-start',
        artifactName: payload.toolName ?? 'unknown',
      })
      break

    case 'tool-result': {
      const toolName = payload.toolName as string | undefined
      if (toolName === 'write-file' || toolName === 'write-files') {
        const result = payload.result as Record<string, unknown> | undefined
        emit({
          type: 'file_complete',
          path: (result?.path as string) ?? '',
          linesOfCode: (result?.bytesWritten as number) ?? 0,
        })
      } else {
        emit({
          type: 'agent_artifact',
          agentId: payload.toolName ?? 'pm',
          artifactType: 'tool-result',
          artifactName: toolName ?? 'unknown',
        })
      }
      break
    }

    case 'text-delta':
      if (payload.text) {
        emit({
          type: 'agent_progress',
          agentId: 'code-generation',
          message: payload.text,
        })
      }
      break

    case 'finish':
      // Agent finished generating — no action needed, workflow continues
      break

    default:
      // Recursively check for nested output (NestedWorkflowOutput)
      if (payload?.output) {
        processNestedEvent(payload.output, emit)
      }
      break
  }
}

/**
 * POST /api/agent
 * Stream agent execution via SSE
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

  // Get the workflow and create a run
  const workflow = mastra.getWorkflow('appGeneration')
  const runId = crypto.randomUUID()
  const run = await workflow.createRun({ runId })
  activeRuns.set(runId, { run, userId: user.id, projectId, model, createdAt: Date.now() })

  // Return SSE stream
  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' })
      const output = run.stream({
        inputData: { userMessage: message, projectId },
        requestContext,
      })
      await processWorkflowStream(output, emit, signal, user, projectId, model, runId)
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
      activeRuns.delete(runId)
    }
  })
})

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
      const output = stored.run.resumeStream({
        resumeData: { answers },
        step: 'analyst',
      })

      await processWorkflowStream(output, emit, signal, user, stored.projectId, stored.model, runId)
    } catch (error) {
      if (signal.aborted) return
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Resume failed',
        stage: 'error',
      })
    } finally {
      activeRuns.delete(runId)
    }
  })
})
