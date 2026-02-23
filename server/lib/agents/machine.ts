import { assign, createActor, fromPromise, setup } from 'xstate'
import type { ActorOptions } from 'xstate'
import * as Sentry from '@sentry/node'
import type { AppBlueprint, BlueprintFile } from '../app-blueprint'
import type { DesignSystem } from '../themed-code-engine'
import type { ValidationGateResult } from './validation'
import type { AnalysisResult } from './orchestrator'
import type { CreativeSpec } from './schemas'
import type { GeneratedPage } from '../page-generator'

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

  // Clarification
  clarificationQuestions: unknown[] | null

  // Blueprint (Pipeline A — kept for validating/reviewing/deploying compatibility)
  blueprint: AppBlueprint | null

  // Pipeline B fields
  tokens: DesignSystem | null
  creativeSpec: CreativeSpec | null
  generatedPages: GeneratedPage[] | null
  assembledFiles: BlueprintFile[] | null
  prd: string | null

  // Infrastructure
  sandboxId: string | null
  githubCloneUrl: string | null
  githubHtmlUrl: string | null
  repoName: string | null

  // Validation
  validation: ValidationGateResult | null
  retryCount: number
  previousValidationErrors: ValidationGateResult | null

  // Deploy
  deploymentUrl: string | null

  // Token tracking
  totalTokens: number

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
    }
  | { type: 'CLARIFICATION_NEEDED'; questions: unknown[] }
  | { type: 'BLUEPRINT_DONE'; blueprint: AppBlueprint }
  | {
      type: 'PROVISION_DONE'
      sandboxId: string
      githubCloneUrl: string
      githubHtmlUrl: string
      repoName: string
    }
  | { type: 'SCAFFOLD_DONE' }
  | { type: 'CODEGEN_DONE' }
  | { type: 'VALIDATION_PASS' }
  | { type: 'VALIDATION_FAIL'; validation: ValidationGateResult }
  | { type: 'REPAIR_DONE' }
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
    runArchitectActor: fromPromise(async ({ input }: { input: { appName: string; prd: string } }) => {
      const { runArchitect } = await import('./orchestrator')
      return runArchitect(input)
    }),
    runCodeGenerationActor: fromPromise(async ({ input }: { input: { spec: CreativeSpec; tokens: DesignSystem; appName: string; sandboxId: string } }) => {
      const { runCodeGeneration } = await import('./orchestrator')
      return runCodeGeneration(input)
    }),
    runProvisioningActor: fromPromise(async ({ input }: { input: { appName: string; projectId: string } }) => {
      const { runProvisioning } = await import('./orchestrator')
      return runProvisioning(input)
    }),
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
    runCleanupActor: fromPromise(
      async ({ input }: { input: { sandboxId: string | null } }) => {
        const errors: string[] = []

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
            Sentry.captureException(e, {
              tags: { cleanup_stage: 'sandbox_deletion' },
              extra: { sandboxId: input.sandboxId },
            })
          }
        }

        return { errors }
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
    clarificationQuestions: null,
    blueprint: null,
    tokens: null,
    creativeSpec: null,
    generatedPages: null,
    assembledFiles: null,
    prd: null,
    sandboxId: null,
    githubCloneUrl: null,
    githubHtmlUrl: null,
    repoName: null,
    validation: null,
    retryCount: 0,
    previousValidationErrors: null,
    deploymentUrl: null,
    totalTokens: 0,
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
                      prd: ({ event }) => (event.output as Extract<AnalysisResult, { type: 'done' }>).prd,
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
                }),
                onDone: {
                  target: 'done',
                  actions: assign({
                    sandboxId: ({ event }) => event.output.sandboxId,
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
      onDone: { target: 'architecting' },
    },

    architecting: {
      after: {
        120_000: {
          target: 'failed',
          actions: assign({ error: () => 'Architect timed out' }),
        },
      },
      invoke: {
        src: 'runArchitectActor',
        input: ({ context }) => ({
          appName: context.appName ?? '',
          prd: context.prd ?? '',
        }),
        onDone: {
          target: 'codeGeneration',
          actions: assign({
            creativeSpec: ({ event }) => event.output.spec,
            tokens: ({ event }) => event.output.tokens,
            totalTokens: ({ context, event }) => context.totalTokens + (event.output.tokensUsed ?? 0),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },

    codeGeneration: {
      after: {
        300_000: {
          target: 'cleanup',
          actions: assign({ error: () => 'Code generation timed out' }),
        },
      },
      invoke: {
        src: 'runCodeGenerationActor',
        input: ({ context }) => ({
          spec: context.creativeSpec!,
          tokens: context.tokens!,
          appName: context.appName ?? '',
          sandboxId: context.sandboxId!,
        }),
        onDone: {
          target: 'validating',
          actions: assign({
            generatedPages: ({ event }) => event.output.pages,
            assembledFiles: ({ event }) => event.output.assembledFiles,
            blueprint: ({ event }) => event.output.blueprint,
            totalTokens: ({ context, event }) => context.totalTokens + (event.output.tokensUsed ?? 0),
          }),
        },
        onError: {
          target: 'cleanup',
          actions: assign({ error: ({ event }) => String(event.error) }),
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
            target: 'complete',
            actions: assign({
              validation: ({ event }) => event.output.validation,
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

/** Minimal mock tokens for the mock pipeline */
const MOCK_TOKENS: DesignSystem = {
  name: '',
  colors: {
    background: '#ffffff',
    foreground: '#111111',
    text: '#111111',
    primary: '#2b6cb0',
    primaryForeground: '#ffffff',
    secondary: '#e5e7eb',
    accent: '#f59e0b',
    muted: '#f3f4f6',
    border: '#d1d5db',
  },
  fonts: {
    display: 'Playfair Display',
    body: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600&display=swap',
  },
  style: {
    borderRadius: '0.5rem',
    cardStyle: 'bordered',
    navStyle: 'top-bar',
    heroLayout: 'fullbleed',
    spacing: 'normal',
    motion: 'subtle',
    imagery: 'photography-heavy',
  },
  aestheticDirection: 'warm-neutral' as const,
  layoutStrategy: 'full-bleed' as const,
  signatureDetail: 'Subtle scroll-triggered reveal animations on content sections',
  imageManifest: {},
  authPosture: 'public',
  heroImages: [],
  heroQuery: '',
  textSlots: {
    hero_headline: 'Welcome',
    hero_subtext: 'Your app',
    about_paragraph: 'About us',
    cta_label: 'Get Started',
    empty_state: 'Nothing here yet.',
    footer_tagline: 'Built with VibeStack',
  },
}

/** Minimal mock CreativeSpec for the mock pipeline */
const MOCK_CREATIVE_SPEC: CreativeSpec = {
  sitemap: [
    {
      route: '/',
      fileName: 'routes/index.tsx',
      componentName: 'Homepage',
      purpose: 'A functional to-do app with task management',
      brief: {
        sections: ['Task input form', 'Task list with checkboxes', 'Filter tabs (all/active/completed)'],
        copyDirection: 'Professional and clear',
        keyInteractions: 'Add, complete, and delete tasks',
        lucideIcons: ['Plus', 'CheckCircle', 'Trash2'],
        shadcnComponents: ['Button', 'Input', 'Card', 'Checkbox'],
      },
    },
  ],
  nav: {
    style: 'sticky-blur',
    logo: 'TaskFlow',
    links: [{ label: 'Home', href: '/' }],
    cta: null,
    mobileStyle: 'sheet',
  },
  designSystem: {
    aestheticDirection: 'minimal-swiss',
    layoutStrategy: 'single-column-editorial',
    signatureDetail: 'Subtle grain texture overlay on hero section',
    colorPalette: {
      primary: '#18181b',
      secondary: '#3f3f46',
      accent: '#6366f1',
      background: '#ffffff',
      text: '#18181b',
      primaryForeground: '#ffffff',
      foreground: '#18181b',
      muted: '#f4f4f5',
      border: '#e4e4e7',
    },
    typography: {
      display: 'Syne',
      body: 'Outfit',
    },
    style: {
      borderRadius: '0.5rem',
      cardStyle: 'bordered' as const,
      navStyle: 'top-bar' as const,
      heroLayout: 'fullbleed' as const,
      spacing: 'normal' as const,
      motion: 'subtle' as const,
      imagery: 'photography-heavy' as const,
    },
    imageManifest: {},
  },
  footer: {
    style: 'minimal',
    columns: [],
    showNewsletter: false,
    socialLinks: [],
    copyright: '© 2026 TaskFlow. Built with VibeStack.',
  },
}

/** Mock generated pages for the mock pipeline */
export const MOCK_GENERATED_PAGES: GeneratedPage[] = [
  {
    fileName: 'routes/index.tsx',
    componentName: 'Homepage',
    route: '/',
    content: `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/')({
  component: Homepage,
})

function Homepage() {
  const [tasks, setTasks] = useState<string[]>([])
  const [input, setInput] = useState('')

  return (
    <div className="container mx-auto py-8 max-w-lg">
      <h1 className="text-3xl font-bold mb-6 font-[family-name:var(--font-display)]">TaskFlow</h1>
      <div className="flex gap-2 mb-4">
        <input className="flex-1 border rounded px-3 py-2" value={input} onChange={e => setInput(e.target.value)} placeholder="Add a task..." />
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded" onClick={() => { if (input.trim()) { setTasks([...tasks, input.trim()]); setInput('') } }}>Add</button>
      </div>
      <ul className="space-y-2">
        {tasks.map((t, i) => <li key={i} className="p-3 border rounded">{t}</li>)}
      </ul>
    </div>
  )
}`,
  },
]

/** Mock assembled files for the mock pipeline */
export const MOCK_ASSEMBLED_FILES: BlueprintFile[] = [
  { path: 'src/main.tsx', content: '// mock main.tsx', layer: 0, isLLMSlot: false },
  { path: 'src/routes/__root.tsx', content: '// mock root', layer: 0, isLLMSlot: false },
  { path: 'src/routes/index.tsx', content: MOCK_GENERATED_PAGES[0].content, layer: 1, isLLMSlot: true },
]

/** Mock file paths emitted during assembly (simulates file_start/file_complete) */
export const MOCK_FILE_LIST = MOCK_ASSEMBLED_FILES.map((f) => f.path)

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
        prd: [
          'TaskFlow is a lightweight task management app for individuals and small teams.',
          '- Create, edit, and delete tasks with titles, descriptions, and due dates',
          '- Organize tasks into categories (Work, Personal, Shopping, etc.)',
          '- Set priority levels (Low, Medium, High, Urgent) with color coding',
          '- Filter and sort tasks by category, priority, status, or due date',
          '- Mark tasks as complete with a single click',
          '- Dashboard view showing overdue tasks and upcoming deadlines',
          '- Responsive design for mobile and desktop',
          '- Authentication via Supabase (email/password)',
        ].join('\n'),
        tokensUsed: 3500,
      }
    }),
    runArchitectActor: fromPromise(async () => {
      await delay(1500)
      return {
        spec: MOCK_CREATIVE_SPEC,
        tokens: MOCK_TOKENS,
        tokensUsed: 1200,
      }
    }),
    runCodeGenerationActor: fromPromise(async () => {
      await delay(3000)
      return {
        pages: MOCK_GENERATED_PAGES,
        assembledFiles: MOCK_ASSEMBLED_FILES,
        blueprint: null,
        tokensUsed: 4000,
      }
    }),
    runProvisioningActor: fromPromise(async () => {
      await delay(1500)
      return {
        sandboxId: 'mock-sandbox-001',
        githubCloneUrl: 'https://github.com/mock-org/taskflow.git',
        githubHtmlUrl: 'https://github.com/mock-org/taskflow',
        repoName: 'taskflow',
        tokensUsed: 0,
      }
    }),
    runValidationActor: fromPromise(async () => {
      await delay(1000)
      const passedResult = { passed: true, errors: [] }
      return {
        allPassed: true,
        validation: {
          manifest: passedResult,
          scaffold: passedResult,
          typecheck: passedResult,
          lint: passedResult,
          build: passedResult,
          allPassed: true,
        },
        tokensUsed: 200,
      }
    }),
    runRepairActor: fromPromise(async () => {
      await delay(500)
      return { tokensUsed: 0 }
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
  // Reuse the same state topology as the real machine — only actors are swapped
  id: 'appGeneration',
  initial: 'idle',
  context: {
    userMessage: '',
    projectId: '',
    userId: '',
    appName: '',
    appDescription: '',
    clarificationQuestions: null,
    blueprint: null,
    tokens: null,
    creativeSpec: null,
    generatedPages: null,
    assembledFiles: null,
    prd: null,
    sandboxId: null,
    githubCloneUrl: null,
    githubHtmlUrl: null,
    repoName: null,
    validation: null,
    retryCount: 0,
    previousValidationErrors: null,
    deploymentUrl: null,
    totalTokens: 0,
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
                    prd: ({ event }) => event.output.prd,
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
                }),
                onDone: {
                  target: 'done',
                  actions: assign({
                    sandboxId: ({ event }) => event.output.sandboxId,
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
      onDone: { target: 'architecting' },
    },
    architecting: {
      invoke: {
        src: 'runArchitectActor',
        input: ({ context }) => ({
          appName: context.appName ?? '',
          prd: context.prd ?? '',
        }),
        onDone: {
          target: 'codeGeneration',
          actions: assign({
            creativeSpec: ({ event }) => event.output.spec,
            tokens: ({ event }) => event.output.tokens,
            totalTokens: ({ context, event }) => context.totalTokens + (event.output.tokensUsed ?? 0),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
      },
    },
    codeGeneration: {
      invoke: {
        src: 'runCodeGenerationActor',
        input: ({ context }) => ({
          spec: context.creativeSpec!,
          tokens: context.tokens!,
          appName: context.appName ?? '',
          sandboxId: context.sandboxId!,
        }),
        onDone: {
          target: 'validating',
          actions: assign({
            generatedPages: ({ event }) => event.output.pages,
            assembledFiles: ({ event }) => event.output.assembledFiles,
            blueprint: ({ event }) => event.output.blueprint,
            totalTokens: ({ context, event }) => context.totalTokens + (event.output.tokensUsed ?? 0),
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({ error: ({ event }) => String(event.error) }),
        },
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
            target: 'complete',
            actions: assign({
              validation: ({ event }) => event.output.validation,
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
    complete: { type: 'final' },
    cleanup: {
      invoke: {
        src: 'runCleanupActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId,
        }),
        onDone: { target: 'failed' },
        onError: { target: 'failed' },
      },
    },
    failed: { type: 'final' },
  },
})

/**
 * Create the appropriate actor based on VITE_MOCK_MODE env var.
 * When VITE_MOCK_MODE=true, uses mock actors with fake delays.
 */
export function isMockPipeline(): boolean {
  return process.env.VITE_MOCK_MODE === 'true' || process.env.MOCK_PIPELINE === 'true'
}

export async function createMockOrRealActor(options?: ActorOptions<typeof appGenerationMachine>) {
  if (isMockPipeline()) {
    console.log('[mock-pipeline] Using mock actors — no LLMs or external services')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createActor(mockAppGenerationMachine, options as any)
  }
  return createInspectedActor(options)
}
