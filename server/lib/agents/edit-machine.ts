import { assign, fromPromise, setup } from 'xstate'
import type { AppBlueprint } from '../app-blueprint'

// ============================================================================
// Context type
// ============================================================================

export interface ElementContext {
  fileName: string      // Source file path, e.g. "src/components/Form.tsx"
  lineNumber: number    // Line number in source file
  columnNumber: number  // Column number in source file
  tagName: string
  className: string
  textContent: string
  tailwindClasses: string[]
  rect: { x: number; y: number; width: number; height: number }
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface EditMachineContext {
  projectId: string
  userId: string
  userMessage: string
  // Loaded from generationState
  contract: Record<string, unknown> | null
  blueprint: AppBlueprint | null
  fileManifest: Record<string, string> | null
  sandboxId: string | null
  supabaseProjectId: string | null
  githubRepo: string | null
  // Edit-specific
  targetFile: string | null
  targetElement: ElementContext | null
  editTier: 1 | 2 | null
  editResult: { filePath: string; newContent: string } | null
  conversationHistory: ChatMessage[]
  error: string | null
  repairAttempts: number
  totalTokens: number
}

// ============================================================================
// Event types
// ============================================================================

type EditMachineEvent =
  | {
      type: 'START'
      userMessage: string
      projectId: string
      userId: string
      targetElement: ElementContext | null
    }
  | { type: 'LOADED' /* data loaded from DB */ }
  | { type: 'CONNECTED'; sandboxId: string }
  | { type: 'EDITED'; filePath: string; newContent: string; tokensUsed: number }
  | { type: 'VALID' }
  | { type: 'INVALID'; error: string }
  | { type: 'ERROR'; error: string }

// ============================================================================
// Result types for actors
// ============================================================================

export interface LoadResult {
  contract: Record<string, unknown> | null
  blueprint: AppBlueprint | null
  fileManifest: Record<string, string> | null
  sandboxId: string | null
  supabaseProjectId: string | null
  githubRepo: string | null
  conversationHistory: ChatMessage[]
}

export interface ReconnectResult {
  sandboxId: string
}

export interface EditResult {
  filePath: string
  newContent: string
  tokensUsed: number
  tier: 1 | 2
}

export interface ValidateResult {
  valid: boolean
  error?: string
}

// ============================================================================
// Machine definition
// ============================================================================

export const editMachine = setup({
  types: {
    context: {} as EditMachineContext,
    events: {} as EditMachineEvent,
  },
  actors: {
    runAnalystActor: fromPromise(
      async ({
        input,
      }: {
        input: { userMessage: string; projectId: string }
      }) => {
        const { runAnalysis } = await import('./orchestrator')

        return runAnalysis({
          userMessage: input.userMessage,
          projectId: input.projectId,
        })
      },
    ),
    loadProjectActor: fromPromise(
      async ({ input }: { input: { projectId: string; userId: string } }) => {
        const { getProjectGenerationState, getProjectMessages } = await import('../db/queries')

        const project = await getProjectGenerationState(input.projectId, input.userId)
        if (!project) throw new Error('Project not found')
        if (!project.generationState || typeof project.generationState !== 'object') {
          throw new Error('Project has no generation state — run greenfield generation first')
        }

        const genState = project.generationState as Record<string, unknown>
        const messages = await getProjectMessages(input.projectId)

        return {
          contract: (genState.contract as Record<string, unknown>) ?? null,
          blueprint: (genState.blueprint as AppBlueprint) ?? null,
          fileManifest: (genState.fileManifest as Record<string, string>) ?? null,
          sandboxId: project.sandboxId ?? (genState.sandboxId as string) ?? null,
          supabaseProjectId: project.supabaseProjectId ?? null,
          githubRepo: project.githubRepoUrl ?? (genState.githubRepo as string) ?? null,
          conversationHistory: messages.map((m) => ({
            role: (m.role === 'system' ? 'assistant' : m.role) as 'user' | 'assistant',
            content: Array.isArray(m.parts)
              ? m.parts.map((p: any) => p.text || '').filter(Boolean).join('')
              : '',
          })),
        } satisfies LoadResult
      },
    ),
    reconnectSandboxActor: fromPromise(
      async ({
        input,
      }: {
        input: { sandboxId: string | null; projectId: string; githubRepo: string | null }
      }) => {
        const { findSandboxByProject, getSandbox, createSandbox, runCommand } = await import(
          '../sandbox'
        )

        // Try existing sandbox first
        if (input.sandboxId) {
          try {
            const sandbox = await getSandbox(input.sandboxId)
            console.log(`[edit] Reconnected to existing sandbox: ${sandbox.id}`)
            return { sandboxId: sandbox.id } satisfies ReconnectResult
          } catch {
            console.warn(`[edit] Sandbox ${input.sandboxId} not found, looking by project label...`)
          }
        }

        // Try finding by project label
        const found = await findSandboxByProject(input.projectId)
        if (found) {
          console.log(`[edit] Found sandbox by project label: ${found.id}`)
          return { sandboxId: found.id } satisfies ReconnectResult
        }

        // Last resort: create new sandbox and clone from GitHub
        console.log('[edit] Creating new sandbox and cloning from GitHub...')
        const sandbox = await createSandbox({
          language: 'typescript',
          autoStopInterval: 60,
          labels: { project: input.projectId },
        })

        if (input.githubRepo) {
          await runCommand(sandbox, `git clone ${input.githubRepo} /workspace`, 'git-clone', {
            timeout: 60,
          })
          await runCommand(sandbox, 'bun install', 'bun-install', {
            cwd: '/workspace',
            timeout: 120,
          })
        }

        return { sandboxId: sandbox.id } satisfies ReconnectResult
      },
    ),
    applyEditActor: fromPromise(
      async ({
        input,
      }: {
        input: {
          sandboxId: string
          userMessage: string
          targetElement: ElementContext | null
          contract: Record<string, unknown> | null
          conversationHistory: ChatMessage[]
          fileManifest: Record<string, string> | null
        }
      }) => {
        // Determine target file from element context
        let targetFile: string | null = null
        if (input.targetElement?.fileName) {
          targetFile = input.targetElement.fileName
        }

        if (!targetFile) {
          // No element selected — Tier 2 only, need to determine file from message
          // For now, this is an error state that requires element selection
          throw new Error('No target element selected — click an element in the preview first')
        }

        // Try Tier 1 (deterministic Tailwind edit) first
        try {
          const { tryTailwindEdit } = await import('./tailwind-edit')
          const tier1Result = tryTailwindEdit(input.userMessage, input.targetElement!)
          if (tier1Result) {
            // Read file from sandbox, apply class change
            const { getSandbox } = await import('../sandbox')
            const sandbox = await getSandbox(input.sandboxId)
            const fileBuffer = await sandbox.fs.downloadFile(`/workspace/${targetFile}`)
            const fileContent = fileBuffer.toString('utf-8')

            // Find the line and replace className
            const lines = fileContent.split('\n')
            const lineNum = input.targetElement!.lineNumber - 1
            if (lineNum >= 0 && lineNum < lines.length) {
              const line = lines[lineNum]
              // Replace className in this line
              const updated = line.replace(
                /className="([^"]*)"/,
                `className="${tier1Result.newClasses}"`,
              )
              lines[lineNum] = updated
              const newContent = lines.join('\n')

              // Write back to sandbox
              await sandbox.fs.uploadFile(Buffer.from(newContent), `/workspace/${targetFile}`)

              return {
                filePath: targetFile,
                newContent,
                tokensUsed: 0,
                tier: 1 as const,
              } satisfies EditResult
            }
          }
        } catch {
          // Tier 1 failed or not applicable — fall through to Tier 2
        }

        // Tier 2: LLM-assisted edit
        const { runLLMEdit } = await import('./edit-agent')
        const result = await runLLMEdit({
          sandboxId: input.sandboxId,
          targetFile,
          targetElement: input.targetElement,
          userMessage: input.userMessage,
          contract: input.contract,
          conversationHistory: input.conversationHistory,
        })

        return {
          filePath: targetFile,
          newContent: result.newContent,
          tokensUsed: result.tokensUsed,
          tier: 2 as const,
        } satisfies EditResult
      },
    ),
    validateEditActor: fromPromise(
      async ({ input }: { input: { sandboxId: string; tier: 1 | 2 } }) => {
        // Tier 1 edits (class changes) can't break types — skip validation
        if (input.tier === 1) {
          return { valid: true } satisfies ValidateResult
        }

        // Tier 2: run tsc --noEmit
        const { getSandbox, runCommand } = await import('../sandbox')
        const sandbox = await getSandbox(input.sandboxId)
        const result = await runCommand(sandbox, 'bunx tsc --noEmit', 'tsc-validate', {
          cwd: '/workspace',
          timeout: 60,
        })

        if (result.exitCode === 0) {
          return { valid: true } satisfies ValidateResult
        }

        return {
          valid: false,
          error: result.stdout?.slice(-2000) || result.stderr?.slice(-1000) || 'Type check failed',
        } satisfies ValidateResult
      },
    ),
    runPersistActor: fromPromise(async ({ input }: { input: { projectId: string; context: EditMachineContext } }) => {
      const { updateProject } = await import('../db/queries')

      if (input.context.editResult) {
        // Update single file hash after visual edit
        const newFileManifest = { ...input.context.fileManifest }
        const { filePath, newContent } = input.context.editResult
        const hash = `${newContent.length}:${Buffer.from(newContent).toString('base64').slice(0, 16)}`
        newFileManifest[filePath] = hash

        await updateProject(input.projectId, {
          generationState: {
            contract: input.context.contract,
            blueprint: input.context.blueprint,
            sandboxId: input.context.sandboxId,
            supabaseProjectId: input.context.supabaseProjectId,
            githubRepo: input.context.githubRepo,
            fileManifest: newFileManifest,
            lastEditedAt: new Date().toISOString(),
          },
        })
      }
      return { success: true }
    }),
  },
  guards: {
    canRetry: ({ context }) => context.repairAttempts < 2,
  },
}).createMachine({
  id: 'editMachine',
  initial: 'idle',
  context: {
    projectId: '',
    userId: '',
    userMessage: '',
    contract: null,
    blueprint: null,
    fileManifest: null,
    sandboxId: null,
    supabaseProjectId: null,
    githubRepo: null,
    targetFile: null,
    targetElement: null,
    editTier: null,
    editResult: null,
    conversationHistory: [],
    error: null,
    repairAttempts: 0,
    totalTokens: 0,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'loading',
          actions: assign({
            userMessage: ({ event }) => event.userMessage,
            projectId: ({ event }) => event.projectId,
            userId: ({ event }) => event.userId,
            targetElement: ({ event }) => event.targetElement,
          }),
        },
      },
    },

    loading: {
      after: {
        30_000: {
          target: 'failed',
          actions: assign({ error: () => 'Loading project state timed out' }),
        },
      },
      invoke: {
        src: 'loadProjectActor',
        input: ({ context }) => ({
          projectId: context.projectId,
          userId: context.userId,
        }),
        onDone: {
          target: 'reconnecting',
          actions: assign({
            contract: ({ event }) => event.output.contract,
            blueprint: ({ event }) => event.output.blueprint,
            fileManifest: ({ event }) => event.output.fileManifest,
            sandboxId: ({ event }) => event.output.sandboxId,
            supabaseProjectId: ({ event }) => event.output.supabaseProjectId,
            githubRepo: ({ event }) => event.output.githubRepo,
            conversationHistory: ({ event }) => event.output.conversationHistory,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },

    reconnecting: {
      after: {
        120_000: {
          target: 'failed',
          actions: assign({ error: () => 'Sandbox reconnection timed out' }),
        },
      },
      invoke: {
        src: 'reconnectSandboxActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId,
          projectId: context.projectId,
          githubRepo: context.githubRepo,
        }),
        onDone: {
          target: 'analyzing',
          actions: assign({
            sandboxId: ({ event }) => event.output.sandboxId,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },

    analyzing: {
      after: {
        60_000: {
          target: 'failed',
          actions: assign({ error: () => 'Analysis timed out' }),
        },
      },
      invoke: {
        src: 'runAnalystActor',
        input: ({ context }) => ({
          userMessage: context.userMessage,
          projectId: context.projectId,
        }),
        onDone: {
          target: 'editing',
          actions: assign({
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },

    editing: {
      after: {
        180_000: {
          target: 'failed',
          actions: assign({ error: () => 'Edit timed out after 3 minutes' }),
        },
      },
      invoke: {
        src: 'applyEditActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId!,
          userMessage: context.userMessage,
          targetElement: context.targetElement,
          contract: context.contract,
          conversationHistory: context.conversationHistory,
          fileManifest: context.fileManifest,
        }),
        onDone: {
          target: 'validating',
          actions: assign({
            editResult: ({ event }) => ({
              filePath: event.output.filePath,
              newContent: event.output.newContent,
            }),
            editTier: ({ event }) => event.output.tier,
            totalTokens: ({ context, event }) => context.totalTokens + event.output.tokensUsed,
          }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },

    validating: {
      after: {
        60_000: {
          target: 'failed',
          actions: assign({ error: () => 'Validation timed out' }),
        },
      },
      invoke: {
        src: 'validateEditActor',
        input: ({ context }) => ({
          sandboxId: context.sandboxId!,
          tier: context.editTier!,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.valid,
            target: 'persisting',
          },
          {
            guard: 'canRetry',
            target: 'editing',
            actions: assign({
              repairAttempts: ({ context }) => context.repairAttempts + 1,
              // Append error to message for context-aware retry
              userMessage: ({ context, event }) =>
                `${context.userMessage}\n\n[PREVIOUS ATTEMPT FAILED]\nTypeScript errors:\n${event.output.error}`,
            }),
          },
          {
            target: 'failed',
            actions: assign({
              error: ({ event }) => `Validation failed after max retries: ${event.output.error}`,
            }),
          },
        ],
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },

    persisting: {
      invoke: {
        src: 'runPersistActor',
        input: ({ context }) => ({
          projectId: context.projectId,
          context,
        }),
        onDone: { target: 'complete' },
        onError: {
          target: 'failed',
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },

    complete: {
      type: 'final',
    },

    failed: {
      type: 'final',
    },
  },
})
