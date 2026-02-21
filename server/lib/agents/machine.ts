import { assign, createActor, fromPromise, setup } from 'xstate'
import type { ActorOptions } from 'xstate'
import * as Sentry from '@sentry/node'
import type { AppBlueprint } from '../app-blueprint'
import type { SchemaContract } from '../schema-contract'
import type { AssemblyResult } from '../capabilities/assembler'
import type { ThemeTokens } from '../themed-code-engine'
import type { ValidationGateResult } from './validation'
import type { CodeReviewResult } from './code-review'
import type { AnalysisResult } from './orchestrator'

// ============================================================================
// Context type — all data flowing through the machine
// ============================================================================

export interface MachineContext {
  // Input
  userMessage: string
  projectId: string
  userId: string

  // Analyst output
  appName: string
  appDescription: string
  contract: SchemaContract | null
  capabilityManifest: string[]
  assembly: AssemblyResult | null

  // Clarification
  clarificationQuestions: unknown[] | null

  // Blueprint
  blueprint: AppBlueprint | null

  // Infrastructure
  sandboxId: string | null
  supabaseProjectId: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  githubCloneUrl: string | null
  githubHtmlUrl: string | null
  repoName: string | null

  // Validation
  validation: ValidationGateResult | null
  retryCount: number
  previousValidationErrors: ValidationGateResult | null

  // Code Review
  reviewResult: CodeReviewResult | null
  reviewSkipped: boolean

  // Deploy
  deploymentUrl: string | null

  // Token tracking
  totalTokens: number
  polishTokens: number

  // Error
  error: string | null
}

// ============================================================================
// Event types
// ============================================================================

type MachineEvent =
  | { type: 'START'; userMessage: string; projectId: string; userId: string }
  | { type: 'USER_ANSWERED'; answers: string }
  | {
      type: 'ANALYST_DONE'
      appName: string
      appDescription: string
      contract: SchemaContract
    }
  | { type: 'CLARIFICATION_NEEDED'; questions: unknown[] }
  | { type: 'BLUEPRINT_DONE'; blueprint: AppBlueprint }
  | {
      type: 'PROVISION_DONE'
      sandboxId: string
      supabaseProjectId: string
      supabaseUrl: string
      supabaseAnonKey: string
      githubCloneUrl: string
      githubHtmlUrl: string
      repoName: string
    }
  | { type: 'SCAFFOLD_DONE' }
  | { type: 'CODEGEN_DONE' }
  | { type: 'VALIDATION_PASS' }
  | { type: 'VALIDATION_FAIL'; validation: ValidationGateResult }
  | { type: 'REPAIR_DONE' }
  | { type: 'REVIEW_PASS' }
  | { type: 'REVIEW_FAIL' }
  | { type: 'DEPLOY_DONE'; deploymentUrl: string }
  | { type: 'ERROR'; error: string }

// ============================================================================
// Machine definition
// ============================================================================

export const appGenerationMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
  },
  actors: {
    runAnalysisActor: fromPromise(async ({ input }: { input: { userMessage: string; projectId: string } }) => {
      const { runAnalysis } = await import('./orchestrator')
      return runAnalysis(input)
    }),
    runBlueprintActor: fromPromise(
      async ({
        input,
      }: {
        input: { userPrompt?: string; appName: string; appDescription: string; contract: SchemaContract; assembly?: AssemblyResult | null }
      }) => {
        const { runBlueprint } = await import('./orchestrator')
        return runBlueprint(input)
      },
    ),
    runProvisioningActor: fromPromise(async ({ input }: { input: { appName: string; projectId: string; userId: string } }) => {
      const { runProvisioning } = await import('./orchestrator')
      return runProvisioning(input)
    }),
    runCodeGenerationActor: fromPromise(
      async ({ input }: { input: { blueprint: AppBlueprint; contract: SchemaContract; sandboxId: string; supabaseProjectId: string; supabaseUrl: string; supabaseAnonKey: string } }) => {
        const { runCodeGeneration } = await import('./orchestrator')
        return runCodeGeneration(input)
      },
    ),
    runPolishActor: fromPromise(
      async ({ input }: { input: { sandboxId: string; blueprint: AppBlueprint; assembly: AssemblyResult | null; tokens: ThemeTokens } }) => {
        const { runPolish } = await import('./polish-agent')
        return runPolish(input)
      },
    ),
    runValidationActor: fromPromise(async ({ input }: { input: { blueprint: AppBlueprint; sandboxId: string } }) => {
      const { runValidation } = await import('./orchestrator')
      return runValidation(input)
    }),
    runRepairActor: fromPromise(
      async ({ input }: { input: { blueprint: AppBlueprint; validation: ValidationGateResult; sandboxId: string } }) => {
        const { runRepair } = await import('./orchestrator')
        return runRepair(input)
      },
    ),
    runDeploymentActor: fromPromise(
      async ({
        input,
      }: {
        input: {
          sandboxId: string
          projectId: string
          contract?: SchemaContract | null
          blueprint?: AppBlueprint | null
          capabilityManifest?: string[] | null
          supabaseProjectId?: string | null
          githubCloneUrl?: string | null
        }
      }) => {
        const { runDeployment } = await import('./orchestrator')
        return runDeployment(input)
      },
    ),
    runCleanupActor: fromPromise(
      async ({ input }: { input: { sandboxId: string | null; supabaseProjectId: string | null } }) => {
        const errors: string[] = []

        // Delete sandbox FIRST (before releasing pool project)
        if (input.sandboxId) {
          try {
            const { getDaytonaClient, getSandbox } = await import('../sandbox')
            const daytona = getDaytonaClient()
            const sandbox = await getSandbox(input.sandboxId)
            await daytona.delete(sandbox)
            console.log(`[cleanup] Deleted sandbox: ${input.sandboxId}`)
          } catch (e) {
            const errorMsg = `Sandbox cleanup failed: ${e instanceof Error ? e.message : String(e)}`
            errors.push(errorMsg)
            // Capture sandbox deletion errors to Sentry
            Sentry.captureException(e, {
              tags: { cleanup_stage: 'sandbox_deletion' },
              extra: { sandboxId: input.sandboxId },
            })
          }
        }

        // Try to release warm pool project back to pool (after sandbox deletion)
        if (input.supabaseProjectId) {
          try {
            const { releaseProject } = await import('../supabase-pool')
            await releaseProject(input.supabaseProjectId)
            console.log(`[cleanup] Released warm pool project: ${input.supabaseProjectId}`)
          } catch (releaseError) {
            // Release failed — project may not be from warm pool
            // Just log, don't add to errors since Supabase project still works
            console.warn(`[cleanup] Could not release to pool (may not be warm project): ${releaseError}`)
          }
        }

        return { errors }
      },
    ),
    runCodeReviewActor: fromPromise(
      async ({ input }: { input: { blueprint: AppBlueprint; contract: SchemaContract; sandboxId: string } }) => {
        const { runCodeReview } = await import('./code-review')
        return runCodeReview(input)
      },
    ),
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < 2,
    cannotRetry: ({ context }) => context.retryCount >= 2,
  },
}).createMachine({
  id: 'appGeneration',
  initial: 'idle',
  context: {
    userMessage: '',
    projectId: '',
    userId: '',
    appName: '',
    appDescription: '',
    contract: null,
    capabilityManifest: [],
    assembly: null,
    clarificationQuestions: null,
    blueprint: null,
    sandboxId: null,
    supabaseProjectId: null,
    supabaseUrl: null,
    supabaseAnonKey: null,
    githubCloneUrl: null,
    githubHtmlUrl: null,
    repoName: null,
    validation: null,
    retryCount: 0,
    previousValidationErrors: null,
    reviewResult: null,
    reviewSkipped: false,
    deploymentUrl: null,
    totalTokens: 0,
    polishTokens: 0,
    error: null,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'preparing',
          actions: assign({
            userMessage: ({ event }) => event.userMessage,
            projectId: ({ event }) => event.projectId,
            userId: ({ event }) => event.userId,
          }),
        },
      },
    },

    // ── Parallel state: analysis + provisioning run concurrently ──
    preparing: {
      type: 'parallel',
      states: {
        analysis: {
          initial: 'running',
          states: {
            running: {
              after: {
                180_000: {
                  target: '#appGeneration.failed',
                  actions: assign({
                    error: () => 'Analysis timed out after 3 minutes',
                  }),
                },
              },
              invoke: {
                src: 'runAnalysisActor',
                input: ({ context }) => ({
                  userMessage: context.userMessage,
                  projectId: context.projectId,
                }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.type === 'clarification',
                    target: 'awaitingClarification',
                    actions: assign({
                      clarificationQuestions: ({ event }) => (event.output as Extract<AnalysisResult, { type: 'clarification' }>).questions,
                      totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
                    }),
                  },
                  {
                    target: 'done',
                    actions: assign({
                      appName: ({ event }) => (event.output as Extract<AnalysisResult, { type: 'done' }>).appName,
                      appDescription: ({ event }) => (event.output as Extract<AnalysisResult, { type: 'done' }>).appDescription,
                      contract: ({ event }) => (event.output as Extract<AnalysisResult, { type: 'done' }>).contract,
                      capabilityManifest: ({ event }) => (event.output as Extract<AnalysisResult, { type: 'done' }>).capabilityManifest ?? [],
                      assembly: ({ event }) => (event.output as Extract<AnalysisResult, { type: 'done' }>).assembly ?? null,
                      totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
                    }),
                  },
                ],
                onError: {
                  target: '#appGeneration.failed',
                  actions: assign({
                    error: ({ event }) => {
                      const err = event.error
                      if (err instanceof Error) {
                        return `${err.message}${err.stack ? `\n${err.stack}` : ''}`
                      }
                      return String(err)
                    },
                  }),
                },
              },
            },
            awaitingClarification: {
              after: {
                1_800_000: {
                  target: '#appGeneration.failed',
                  actions: assign({
                    error: () => 'Awaiting clarification timed out after 30 minutes',
                  }),
                },
              },
              on: {
                USER_ANSWERED: {
                  target: 'running',
                  actions: assign({
                    userMessage: ({ context, event }) =>
                      `${context.userMessage}\n\nUser's answers:\n${event.answers}`,
                  }),
                },
              },
            },
            done: { type: 'final' as const },
          },
        },
        infrastructure: {
          initial: 'provisioning',
          states: {
            provisioning: {
              after: {
                300_000: {
                  target: '#appGeneration.cleanup',
                  actions: assign({
                    error: () => 'Provisioning timed out after 5 minutes',
                  }),
                },
              },
              invoke: {
                src: 'runProvisioningActor',
                input: ({ context }) => ({
                  appName: context.appName || `project-${context.projectId.slice(0, 8)}`,
                  projectId: context.projectId,
                  userId: context.userId,
                }),
                onDone: {
                  target: 'done',
                  actions: assign({
                    sandboxId: ({ event }) => event.output.sandboxId,
                    supabaseProjectId: ({ event }) => event.output.supabaseProjectId,
                    supabaseUrl: ({ event }) => event.output.supabaseUrl,
                    supabaseAnonKey: ({ event }) => event.output.supabaseAnonKey,
                    githubCloneUrl: ({ event }) => event.output.githubCloneUrl,
                    githubHtmlUrl: ({ event }) => event.output.githubHtmlUrl,
                    repoName: ({ event }) => event.output.repoName,
                    totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
                  }),
                },
                onError: {
                  target: '#appGeneration.cleanup',
                  actions: assign({
                    error: ({ event }) => {
                      const err = event.error
                      if (err instanceof Error) {
                        return `${err.message}${err.stack ? `\n${err.stack}` : ''}`
                      }
                      return String(err)
                    },
                  }),
                },
              },
            },
            done: { type: 'final' as const },
          },
        },
      },
      onDone: { target: 'blueprinting' },
    },

    blueprinting: {
      after: {
        120_000: {
          target: 'failed',
          actions: assign({
            error: () => 'Blueprinting timed out after 2 minutes',
          }),
        },
      },
      invoke: {
        src: 'runBlueprintActor',
        input: ({ context }) => ({
          userPrompt: context.userMessage,
          appName: context.appName ?? '',
          appDescription: context.appDescription ?? '',
          contract: context.contract!,
          assembly: context.assembly,
        }),
        onDone: {
          target: 'generating',
          actions: assign({
            blueprint: ({ event }) => event.output.blueprint,
            contract: ({ event }) => event.output.blueprint.contract,
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) => {
              const err = event.error
              if (err instanceof Error) {
                return `${err.message}${err.stack ? `\n${err.stack}` : ''}`
              }
              return String(err)
            },
          }),
        },
      },
    },

    generating: {
      after: {
        600_000: {
          target: 'cleanup',
          actions: assign({
            error: () => 'Code generation timed out after 10 minutes',
          }),
        },
      },
      invoke: {
        src: 'runCodeGenerationActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          contract: context.contract!,
          sandboxId: context.sandboxId!,
          supabaseProjectId: context.supabaseProjectId!,
          supabaseUrl: context.supabaseUrl!,
          supabaseAnonKey: context.supabaseAnonKey!,
        }),
        onDone: {
          target: 'polishing',
          actions: assign({
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'cleanup',
          actions: assign({
            error: ({ event }) => {
              const err = event.error
              if (err instanceof Error) {
                return `${err.message}${err.stack ? `\n${err.stack}` : ''}`
              }
              return String(err)
            },
          }),
        },
      },
    },

    polishing: {
      invoke: {
        src: 'runPolishActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId!,
          blueprint: context.blueprint!,
          assembly: context.assembly,
          tokens: (context.blueprint?.meta as { tokens?: ThemeTokens } | undefined)?.tokens ?? {
            name: 'public-website',
            fonts: { display: 'Inter', body: 'Inter', googleFontsUrl: '' },
            colors: {
              background: '#ffffff',
              foreground: '#111111',
              primary: '#2b6cb0',
              primaryForeground: '#ffffff',
              secondary: '#e5e7eb',
              accent: '#f59e0b',
              muted: '#f3f4f6',
              border: '#d1d5db',
            },
            style: {
              borderRadius: '0.5rem',
              cardStyle: 'elevated',
              navStyle: 'top-bar',
              heroLayout: 'split',
              spacing: 'normal',
              motion: 'subtle',
              imagery: 'minimal',
            },
            authPosture: 'hybrid',
            heroImages: [],
            heroQuery: 'modern web app',
            textSlots: {
              hero_headline: 'Welcome',
              hero_subtext: 'Generated app',
              about_paragraph: 'Generated app experience.',
              cta_label: 'Get started',
              empty_state: 'No items yet.',
              footer_tagline: 'Built with care.',
            },
          },
        }),
        onDone: {
          target: 'validating',
          actions: assign({
            totalTokens: ({ context, event }) => context.totalTokens + (event.output?.tokensUsed ?? 0),
            polishTokens: ({ context, event }) => context.polishTokens + (event.output?.tokensUsed ?? 0),
          }),
        },
        onError: {
          target: 'validating',
        },
      },
    },

    validating: {
      after: {
        180_000: {
          target: 'cleanup',
          actions: assign({
            error: () => 'Validation timed out after 3 minutes',
          }),
        },
      },
      invoke: {
        src: 'runValidationActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          sandboxId: context.sandboxId!,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.allPassed,
            target: 'reviewing',
            actions: assign({
              totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
            }),
          },
          {
            guard: ({ context, event }) => {
              // Can retry AND errors have changed (or first attempt)
              if (context.retryCount >= 2) return false
              const currentErrors = JSON.stringify(event.output.validation)
              const previousErrors = context.previousValidationErrors ? JSON.stringify(context.previousValidationErrors) : null
              return currentErrors !== previousErrors
            },
            target: 'repairing',
            actions: assign({
              validation: ({ event }) => event.output.validation,
              previousValidationErrors: ({ event }) => event.output.validation,
              retryCount: ({ context }) => context.retryCount + 1,
              totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
            }),
          },
          {
            target: 'cleanup',
            actions: assign({
              error: ({ context }) =>
                context.previousValidationErrors
                  ? 'Validation errors unchanged after repair - halting retry loop'
                  : 'Validation failed after maximum retries',
            }),
          },
        ],
        onError: {
          target: 'cleanup',
          actions: assign({
            error: ({ event }) => {
              const err = event.error
              if (err instanceof Error) {
                return `${err.message}${err.stack ? `\n${err.stack}` : ''}`
              }
              return String(err)
            },
          }),
        },
      },
    },

    repairing: {
      after: {
        300_000: {
          target: 'cleanup',
          actions: assign({
            error: () => 'Repair timed out after 5 minutes',
          }),
        },
      },
      invoke: {
        src: 'runRepairActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          validation: context.validation!,
          sandboxId: context.sandboxId!,
        }),
        onDone: {
          target: 'validating',
          actions: assign({
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'cleanup',
          actions: assign({
            error: ({ event }) => {
              const err = event.error
              if (err instanceof Error) {
                return `${err.message}${err.stack ? `\n${err.stack}` : ''}`
              }
              return String(err)
            },
          }),
        },
      },
    },

    reviewing: {
      after: {
        180_000: {
          target: 'cleanup',
          actions: assign({
            error: () => 'Code review timed out after 3 minutes',
          }),
        },
      },
      invoke: {
        src: 'runCodeReviewActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          contract: context.contract!,
          sandboxId: context.sandboxId!,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.passed,
            target: 'deploying',
            actions: assign({
              reviewResult: ({ event }) => event.output,
              totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
            }),
          },
          {
            // Review found critical issues — fail the pipeline
            target: 'cleanup',
            actions: assign({
              reviewResult: ({ event }) => event.output,
              totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
              error: ({ event }) => {
                const criticals = [
                  ...event.output.deterministicIssues.filter((i: any) => i.severity === 'critical'),
                  ...event.output.llmIssues.filter((i: any) => i.severity === 'critical'),
                ]
                return `Code review failed with ${criticals.length} critical issue(s): ${criticals.map((i: any) => i.message || i.description).join('; ')}`
              },
            }),
          },
        ],
        onError: {
          // Review failure should NOT block deployment — it's a quality gate, not a hard gate
          // Log the error but proceed to deploying
          target: 'deploying',
          actions: assign({
            reviewSkipped: () => true,
            totalTokens: ({ context }) => context.totalTokens,
          }),
          entry: ({ event }: { event: { error: unknown } }) => {
            console.error('[machine] Code review crashed, skipping and proceeding to deployment:', event.error)
          },
        },
      },
    },

    deploying: {
      after: {
        600_000: {
          target: 'cleanup',
          actions: assign({
            error: () => 'Deployment timed out after 10 minutes',
          }),
        },
      },
      invoke: {
        src: 'runDeploymentActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId!,
          projectId: context.projectId,
          contract: context.contract,
          blueprint: context.blueprint,
          capabilityManifest: context.capabilityManifest,
          supabaseProjectId: context.supabaseProjectId,
          githubCloneUrl: context.githubCloneUrl,
        }),
        onDone: {
          target: 'complete',
          actions: assign({
            deploymentUrl: ({ event }) => event.output.deploymentUrl,
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'cleanup',
          actions: assign({
            error: ({ event }) => {
              const err = event.error
              if (err instanceof Error) {
                return `${err.message}${err.stack ? `\n${err.stack}` : ''}`
              }
              return String(err)
            },
          }),
        },
      },
    },

    complete: {
      type: 'final',
    },

    cleanup: {
      after: {
        120_000: {
          target: 'failed',
          actions: assign({
            error: ({ context }) =>
              context.error
                ? `${context.error}\n\nCleanup timed out after 2 minutes`
                : 'Cleanup timed out after 2 minutes',
          }),
        },
      },
      invoke: {
        src: 'runCleanupActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId,
          supabaseProjectId: context.supabaseProjectId,
        }),
        onDone: { target: 'failed' },
        onError: { target: 'failed' }, // Cleanup failure shouldn't block failure reporting
      },
    },

    failed: {
      type: 'final',
    },
  },
})

// ============================================================================
// Inspector-aware actor factory
// ============================================================================

let _inspector: { inspect: any; stop: () => void } | null = null

/**
 * Creates an XState actor with optional Stately Inspector.
 * Set XSTATE_INSPECT=true to stream state transitions to stately.ai/inspect.
 */
export async function createInspectedActor(options?: ActorOptions<typeof appGenerationMachine>) {
  if (process.env.XSTATE_INSPECT === 'true' && !_inspector) {
    const { createSkyInspector } = await import('@statelyai/inspect')
    _inspector = createSkyInspector({
      onerror: (err) => console.error('[xstate-inspect] Error:', err.message),
    })
    console.log('[xstate-inspect] Inspector started — view at https://stately.ai/inspect')
  }

  return createActor(appGenerationMachine, {
    ...options,
    inspect: _inspector?.inspect ?? options?.inspect,
  })
}

/** Stop the inspector (call at process exit) */
export function stopInspector() {
  _inspector?.stop()
  _inspector = null
}

// ============================================================================
// Mock pipeline — MOCK_PIPELINE=true bypasses all real actors
// ============================================================================

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Minimal todo-app contract for mock pipeline */
const MOCK_CONTRACT: SchemaContract = {
  tables: [
    {
      name: 'categories',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'color', type: 'text', default: "'#3b82f6'" },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
    {
      name: 'todos',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'description', type: 'text' },
        { name: 'completed', type: 'boolean', default: 'false' },
        { name: 'priority', type: 'text', default: "'medium'" },
        { name: 'category_id', type: 'uuid', references: { table: 'categories', column: 'id' } },
        { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
        { name: 'due_date', type: 'timestamptz' },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
    {
      name: 'profiles',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, references: { table: 'auth.users', column: 'id' } },
        { name: 'display_name', type: 'text' },
        { name: 'avatar_url', type: 'text' },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

/** Minimal blueprint for mock pipeline */
const MOCK_BLUEPRINT: AppBlueprint = {
  meta: {
    appName: 'TaskFlow',
    appDescription: 'A modern task management app with categories, priorities, and due dates',
  },
  features: { auth: true, crud: true, realtime: false, rls: true, search: false, imageUpload: false },
  contract: MOCK_CONTRACT,
  fileTree: [
    { path: 'src/main.tsx', content: '', layer: 0, isLLMSlot: false },
    { path: 'src/routes/__root.tsx', content: '', layer: 0, isLLMSlot: false },
    { path: 'src/routes/index.tsx', content: '', layer: 1, isLLMSlot: false },
    { path: 'src/routes/_authenticated/route.tsx', content: '', layer: 1, isLLMSlot: false },
    { path: 'src/routes/_authenticated/dashboard.tsx', content: '', layer: 2, isLLMSlot: false },
    { path: 'src/routes/_authenticated/todos/index.tsx', content: '', layer: 2, isLLMSlot: true },
    { path: 'src/routes/_authenticated/todos/$id.tsx', content: '', layer: 2, isLLMSlot: true },
    { path: 'src/routes/_authenticated/categories/index.tsx', content: '', layer: 2, isLLMSlot: true },
    { path: 'src/lib/supabase.ts', content: '', layer: 0, isLLMSlot: false },
    { path: 'src/lib/hooks.ts', content: '', layer: 1, isLLMSlot: false },
    { path: 'src/components/ui/button.tsx', content: '', layer: 0, isLLMSlot: false },
    { path: 'src/components/ui/input.tsx', content: '', layer: 0, isLLMSlot: false },
    { path: 'src/components/ui/card.tsx', content: '', layer: 0, isLLMSlot: false },
  ],
}

/** Mock files emitted during code generation (simulates file_start/file_complete) */
export const MOCK_FILE_LIST = MOCK_BLUEPRINT.fileTree.map((f) => f.path)

export const mockAppGenerationMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
  },
  actors: {
    runAnalysisActor: fromPromise(async () => {
      await delay(2000)
      return {
        type: 'done' as const,
        appName: 'TaskFlow',
        appDescription: 'A modern task management app with categories, priorities, and due dates',
        contract: MOCK_CONTRACT,
        capabilityManifest: ['auth', 'crud', 'rls'],
        assembly: null,
        tokensUsed: 3500,
      }
    }),
    runBlueprintActor: fromPromise(async () => {
      await delay(1000)
      return { blueprint: MOCK_BLUEPRINT, tokensUsed: 1200 }
    }),
    runProvisioningActor: fromPromise(async () => {
      await delay(1500)
      return {
        sandboxId: 'mock-sandbox-001',
        supabaseProjectId: 'mock-supabase-001',
        supabaseUrl: 'https://mock-project.supabase.co',
        supabaseAnonKey: 'mock-anon-key-xxxx',
        githubCloneUrl: 'https://github.com/mock-org/taskflow.git',
        githubHtmlUrl: 'https://github.com/mock-org/taskflow',
        repoName: 'taskflow',
        tokensUsed: 0,
      }
    }),
    runCodeGenerationActor: fromPromise(async () => {
      await delay(3000)
      return { tokensUsed: 5000 }
    }),
    runPolishActor: fromPromise(async () => {
      await delay(1000)
      return { tokensUsed: 500 }
    }),
    runValidationActor: fromPromise(async () => {
      await delay(1000)
      return { allPassed: true, validation: null, tokensUsed: 200 }
    }),
    runRepairActor: fromPromise(async () => {
      await delay(500)
      return { tokensUsed: 0 }
    }),
    runCodeReviewActor: fromPromise(async () => {
      await delay(1000)
      return {
        passed: true,
        tokensUsed: 300,
        deterministicIssues: [],
        llmIssues: [],
        summary: 'Mock review — all checks passed',
      }
    }),
    runDeploymentActor: fromPromise(async () => {
      await delay(2000)
      return { deploymentUrl: 'https://taskflow-mock.vercel.app', tokensUsed: 0 }
    }),
    runCleanupActor: fromPromise(async () => {
      return { errors: [] }
    }),
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < 2,
    cannotRetry: ({ context }) => context.retryCount >= 2,
  },
}).createMachine({
  // Reuse the exact same machine definition — only actors are swapped
  id: 'appGeneration',
  initial: 'idle',
  context: {
    userMessage: '',
    projectId: '',
    userId: '',
    appName: '',
    appDescription: '',
    contract: null,
    capabilityManifest: [],
    assembly: null,
    clarificationQuestions: null,
    blueprint: null,
    sandboxId: null,
    supabaseProjectId: null,
    supabaseUrl: null,
    supabaseAnonKey: null,
    githubCloneUrl: null,
    githubHtmlUrl: null,
    repoName: null,
    validation: null,
    retryCount: 0,
    previousValidationErrors: null,
    reviewResult: null,
    reviewSkipped: false,
    deploymentUrl: null,
    totalTokens: 0,
    polishTokens: 0,
    error: null,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'preparing',
          actions: assign({
            userMessage: ({ event }) => event.userMessage,
            projectId: ({ event }) => event.projectId,
            userId: ({ event }) => event.userId,
          }),
        },
      },
    },
    preparing: {
      type: 'parallel',
      states: {
        analysis: {
          initial: 'running',
          states: {
            running: {
              invoke: {
                src: 'runAnalysisActor',
                input: ({ context }) => ({
                  userMessage: context.userMessage,
                  projectId: context.projectId,
                }),
                onDone: {
                  target: 'done',
                  actions: assign({
                    appName: ({ event }) => event.output.appName,
                    appDescription: ({ event }) => event.output.appDescription,
                    contract: ({ event }) => event.output.contract,
                    capabilityManifest: ({ event }) => event.output.capabilityManifest ?? [],
                    assembly: ({ event }) => event.output.assembly ?? null,
                    totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
                  }),
                },
                onError: {
                  target: '#appGeneration.failed',
                  actions: assign({ error: ({ event }) => String(event.error) }),
                },
              },
            },
            awaitingClarification: {
              on: {
                USER_ANSWERED: {
                  target: 'running',
                  actions: assign({
                    userMessage: ({ context, event }) =>
                      `${context.userMessage}\n\nUser's answers:\n${event.answers}`,
                  }),
                },
              },
            },
            done: { type: 'final' as const },
          },
        },
        infrastructure: {
          initial: 'provisioning',
          states: {
            provisioning: {
              invoke: {
                src: 'runProvisioningActor',
                input: ({ context }) => ({
                  appName: context.appName || `project-${context.projectId.slice(0, 8)}`,
                  projectId: context.projectId,
                  userId: context.userId,
                }),
                onDone: {
                  target: 'done',
                  actions: assign({
                    sandboxId: ({ event }) => event.output.sandboxId,
                    supabaseProjectId: ({ event }) => event.output.supabaseProjectId,
                    supabaseUrl: ({ event }) => event.output.supabaseUrl,
                    supabaseAnonKey: ({ event }) => event.output.supabaseAnonKey,
                    githubCloneUrl: ({ event }) => event.output.githubCloneUrl,
                    githubHtmlUrl: ({ event }) => event.output.githubHtmlUrl,
                    repoName: ({ event }) => event.output.repoName,
                    totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
                  }),
                },
                onError: {
                  target: '#appGeneration.failed',
                  actions: assign({ error: ({ event }) => String(event.error) }),
                },
              },
            },
            done: { type: 'final' as const },
          },
        },
      },
      onDone: { target: 'blueprinting' },
    },
    blueprinting: {
      invoke: {
        src: 'runBlueprintActor',
        input: ({ context }) => ({
          appName: context.appName ?? '',
          appDescription: context.appDescription ?? '',
          contract: context.contract!,
        }),
        onDone: {
          target: 'generating',
          actions: assign({
            blueprint: ({ event }) => event.output.blueprint,
            contract: ({ event }) => event.output.blueprint.contract,
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    generating: {
      invoke: {
        src: 'runCodeGenerationActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          contract: context.contract!,
          sandboxId: context.sandboxId!,
          supabaseProjectId: context.supabaseProjectId!,
          supabaseUrl: context.supabaseUrl!,
          supabaseAnonKey: context.supabaseAnonKey!,
        }),
        onDone: {
          target: 'polishing',
          actions: assign({
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    polishing: {
      invoke: {
        src: 'runPolishActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId!,
          blueprint: context.blueprint!,
          assembly: context.assembly,
          tokens: (context.blueprint?.meta as { tokens?: ThemeTokens } | undefined)?.tokens ?? {
            name: 'public-website',
            fonts: { display: 'Inter', body: 'Inter', googleFontsUrl: '' },
            colors: {
              background: '#ffffff', foreground: '#111111', primary: '#2b6cb0',
              primaryForeground: '#ffffff', secondary: '#e5e7eb', accent: '#f59e0b',
              muted: '#f3f4f6', border: '#d1d5db',
            },
            style: {
              borderRadius: '0.5rem', cardStyle: 'elevated', navStyle: 'top-bar',
              heroLayout: 'split', spacing: 'normal', motion: 'subtle', imagery: 'minimal',
            },
            authPosture: 'hybrid',
            heroImages: [],
            heroQuery: 'modern web app',
            textSlots: {
              hero_headline: 'Welcome', hero_subtext: 'Generated app',
              about_paragraph: 'Generated app experience.', cta_label: 'Get started',
              empty_state: 'No items yet.', footer_tagline: 'Built with care.',
            },
          },
        }),
        onDone: {
          target: 'validating',
          actions: assign({
            totalTokens: ({ context, event }) => context.totalTokens + (event.output?.tokensUsed ?? 0),
            polishTokens: ({ context, event }) => context.polishTokens + (event.output?.tokensUsed ?? 0),
          }),
        },
        onError: { target: 'validating' },
      },
    },
    validating: {
      invoke: {
        src: 'runValidationActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          sandboxId: context.sandboxId!,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.allPassed,
            target: 'reviewing',
            actions: assign({
              totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
            }),
          },
          {
            target: 'failed',
            actions: assign({ error: () => 'Mock validation failed' }),
          },
        ],
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    repairing: {
      invoke: {
        src: 'runRepairActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          validation: context.validation!,
          sandboxId: context.sandboxId!,
        }),
        onDone: {
          target: 'validating',
          actions: assign({
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    reviewing: {
      invoke: {
        src: 'runCodeReviewActor',
        input: ({ context }) => ({
          blueprint: context.blueprint!,
          contract: context.contract!,
          sandboxId: context.sandboxId!,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.passed,
            target: 'deploying',
            actions: assign({
              reviewResult: ({ event }) => event.output,
              totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
            }),
          },
          {
            target: 'failed',
            actions: assign({ error: () => 'Mock review failed' }),
          },
        ],
        onError: {
          target: 'deploying',
          actions: assign({ reviewSkipped: () => true }),
        },
      },
    },
    deploying: {
      invoke: {
        src: 'runDeploymentActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId!,
          projectId: context.projectId,
        }),
        onDone: {
          target: 'complete',
          actions: assign({
            deploymentUrl: ({ event }) => event.output.deploymentUrl,
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    complete: { type: 'final' },
    cleanup: {
      invoke: {
        src: 'runCleanupActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId,
          supabaseProjectId: context.supabaseProjectId,
        }),
        onDone: { target: 'failed' },
        onError: { target: 'failed' },
      },
    },
    failed: { type: 'final' },
  },
})

/**
 * Create the appropriate actor based on MOCK_PIPELINE env var.
 * When MOCK_PIPELINE=true, uses mock actors with fake delays.
 */
export function isMockPipeline(): boolean {
  return process.env.MOCK_PIPELINE === 'true'
}

export async function createMockOrRealActor(options?: ActorOptions<typeof appGenerationMachine>) {
  if (isMockPipeline()) {
    console.log('[mock-pipeline] Using mock actors — no LLMs or external services')
    return createActor(mockAppGenerationMachine, options)
  }
  return createInspectedActor(options)
}
