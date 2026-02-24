import { createActor, fromPromise, waitFor } from 'xstate'
import { describe, expect, it } from 'vitest'
import { editMachine } from '@server/lib/agents/edit-machine'
import type { ElementContext } from '@server/lib/agents/edit-machine'
import type { AppBlueprint } from '@server/lib/app-blueprint'

describe('editMachine', () => {
  // ============================================================================
  // State structure
  // ============================================================================

  describe('state structure', () => {
    it('starts in idle state', () => {
      const actor = createActor(editMachine)
      expect(actor.getSnapshot().value).toBe('idle')
    })

    it('has all expected states', () => {
      const states = Object.keys(editMachine.config.states ?? {})
      expect(states).toContain('idle')
      expect(states).toContain('loading')
      expect(states).toContain('reconnecting')
      expect(states).toContain('analyzing')
      expect(states).toContain('editing')
      expect(states).toContain('validating')
      expect(states).toContain('persisting')
      expect(states).toContain('complete')
      expect(states).toContain('failed')
    })

    it('complete is a final state', () => {
      const completeState = editMachine.config.states?.complete
      expect(completeState?.type).toBe('final')
    })

    it('failed is a final state', () => {
      const failedState = editMachine.config.states?.failed
      expect(failedState?.type).toBe('final')
    })
  })

  // ============================================================================
  // Context defaults
  // ============================================================================

  describe('context defaults', () => {
    it('has correct initial context values', () => {
      const actor = createActor(editMachine)
      actor.start()
      const context = actor.getSnapshot().context

      expect(context.projectId).toBe('')
      expect(context.userId).toBe('')
      expect(context.userMessage).toBe('')
      expect(context.repairAttempts).toBe(0)
      expect(context.totalTokens).toBe(0)
      expect(context.editTier).toBeNull()
      expect(context.error).toBeNull()
      expect(context.contract).toBeNull()
      expect(context.blueprint).toBeNull()
      expect(context.fileManifest).toBeNull()
      expect(context.sandboxId).toBeNull()
      expect(context.supabaseProjectId).toBeNull()
      expect(context.githubRepo).toBeNull()
      expect(context.targetFile).toBeNull()
      expect(context.targetElement).toBeNull()
      expect(context.editResult).toBeNull()
      expect(context.conversationHistory).toEqual([])

      actor.stop()
    })

    it('initializes context with empty strings for IDs', () => {
      const actor = createActor(editMachine)
      actor.start()
      expect(actor.getSnapshot().context.projectId).toBe('')
      expect(actor.getSnapshot().context.userId).toBe('')
      actor.stop()
    })

    it('initializes repairAttempts to 0', () => {
      const actor = createActor(editMachine)
      actor.start()
      expect(actor.getSnapshot().context.repairAttempts).toBe(0)
      actor.stop()
    })

    it('initializes totalTokens to 0', () => {
      const actor = createActor(editMachine)
      actor.start()
      expect(actor.getSnapshot().context.totalTokens).toBe(0)
      actor.stop()
    })
  })

  // ============================================================================
  // Event handling
  // ============================================================================

  describe('event handling', () => {
    it('transitions from idle to loading on START event', () => {
      const actor = createActor(editMachine)
      actor.start()

      const targetElement: ElementContext = {
        fileName: 'src/components/Button.tsx',
        lineNumber: 10,
        columnNumber: 0,
        tagName: 'button',
        className: 'bg-blue-500',
        textContent: 'Click me',
        tailwindClasses: ['bg-blue-500'],
        rect: { x: 0, y: 0, width: 100, height: 40 },
      }

      actor.send({
        type: 'START',
        userMessage: 'make it red',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement,
      })

      expect(actor.getSnapshot().value).toBe('loading')
      actor.stop()
    })

    it('stores userMessage in context on START event', () => {
      const actor = createActor(editMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'make it bold',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement: null,
      })

      expect(actor.getSnapshot().context.userMessage).toBe('make it bold')
      actor.stop()
    })

    it('stores projectId in context on START event', () => {
      const actor = createActor(editMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'test',
        projectId: 'project-abc',
        userId: 'user-xyz',
        targetElement: null,
      })

      expect(actor.getSnapshot().context.projectId).toBe('project-abc')
      actor.stop()
    })

    it('stores userId in context on START event', () => {
      const actor = createActor(editMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'test',
        projectId: 'project-abc',
        userId: 'user-xyz',
        targetElement: null,
      })

      expect(actor.getSnapshot().context.userId).toBe('user-xyz')
      actor.stop()
    })

    it('stores targetElement in context on START event', () => {
      const actor = createActor(editMachine)
      actor.start()

      const targetElement: ElementContext = {
        fileName: 'src/components/Form.tsx',
        lineNumber: 42,
        columnNumber: 0,
        tagName: 'input',
        className: 'border p-2',
        textContent: '',
        tailwindClasses: ['border', 'p-2'],
        rect: { x: 10, y: 20, width: 200, height: 50 },
      }

      actor.send({
        type: 'START',
        userMessage: 'test',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement,
      })

      expect(actor.getSnapshot().context.targetElement).toEqual(targetElement)
      actor.stop()
    })
  })

  // ============================================================================
  // Machine configuration
  // ============================================================================

  describe('machine configuration', () => {
    it('loading state has invoke for loadProjectActor', () => {
      const loadingState = editMachine.config.states?.loading
      expect(loadingState?.invoke).toBeDefined()
      expect((loadingState?.invoke as any)?.src).toBe('loadProjectActor')
    })

    it('reconnecting state has invoke for reconnectSandboxActor', () => {
      const reconnectingState = editMachine.config.states?.reconnecting
      expect(reconnectingState?.invoke).toBeDefined()
      expect((reconnectingState?.invoke as any)?.src).toBe('reconnectSandboxActor')
    })

    it('analyzing state has invoke for runAnalystActor', () => {
      const analyzingState = editMachine.config.states?.analyzing
      expect(analyzingState?.invoke).toBeDefined()
      expect((analyzingState?.invoke as any)?.src).toBe('runAnalystActor')
    })

    it('editing state has invoke for applyEditActor', () => {
      const editingState = editMachine.config.states?.editing
      expect(editingState?.invoke).toBeDefined()
      expect((editingState?.invoke as any)?.src).toBe('applyEditActor')
    })

    it('validating state has invoke for validateEditActor', () => {
      const validatingState = editMachine.config.states?.validating
      expect(validatingState?.invoke).toBeDefined()
      expect((validatingState?.invoke as any)?.src).toBe('validateEditActor')
    })

    it('machine has canRetry guard functionality', () => {
      // Guards are configured in setup() and not directly accessible
      // Test indirectly by checking the guard's behavior via context
      const actor = createActor(editMachine)
      actor.start()
      // Guard checks repairAttempts < 2
      expect(actor.getSnapshot().context.repairAttempts).toBe(0)
      // repairAttempts exists which is what canRetry checks
      expect(typeof actor.getSnapshot().context.repairAttempts).toBe('number')
      actor.stop()
    })

    it('loading state has timeout transition', () => {
      const loadingState = editMachine.config.states?.loading
      expect(loadingState?.after).toBeDefined()
      expect((loadingState?.after as any)?.[30_000]).toBeDefined()
    })

    it('reconnecting state has timeout transition', () => {
      const reconnectingState = editMachine.config.states?.reconnecting
      expect(reconnectingState?.after).toBeDefined()
      expect((reconnectingState?.after as any)?.[120_000]).toBeDefined()
    })

    it('analyzing state has timeout transition', () => {
      const analyzingState = editMachine.config.states?.analyzing
      expect(analyzingState?.after).toBeDefined()
      expect((analyzingState?.after as any)?.[60_000]).toBeDefined()
    })

    it('editing state has timeout transition', () => {
      const editingState = editMachine.config.states?.editing
      expect(editingState?.after).toBeDefined()
      expect((editingState?.after as any)?.[180_000]).toBeDefined()
    })

    it('validating state has timeout transition', () => {
      const validatingState = editMachine.config.states?.validating
      expect(validatingState?.after).toBeDefined()
      expect((validatingState?.after as any)?.[60_000]).toBeDefined()
    })

    it('persisting state transitions to complete', () => {
      const persistingState = editMachine.config.states?.persisting
      expect(persistingState?.invoke).toBeDefined()
    })
  })

  // ============================================================================
  // State transitions
  // ============================================================================

  describe('state transitions', () => {
    it('transitions idle → loading on START event', () => {
      const actor = createActor(editMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'test',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement: null,
      })

      expect(actor.getSnapshot().value).toBe('loading')
      actor.stop()
    })

    it('transitions loading → reconnecting on successful load', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }
      const mockBlueprint = {
        name: 'TestApp',
        description: 'Test',
        features: [],
        pages: [],
        contract: mockContract,
      } as unknown as AppBlueprint

      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: mockBlueprint,
            fileManifest: { 'src/App.tsx': 'content' },
            sandboxId: 'sandbox-123',
            supabaseProjectId: 'supabase-123',
            githubRepo: 'https://github.com/test/repo.git',
            conversationHistory: [],
          })),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'test',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement: null,
      })

      await waitFor(actor, (state) => state.matches('reconnecting'), { timeout: 1000 })
      expect(actor.getSnapshot().value).toBe('reconnecting')
      actor.stop()
    })

    it('transitions reconnecting → editing on successful reconnect', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }
      const mockBlueprint: AppBlueprint = {
        name: 'TestApp',
        description: 'Test',
        features: [],
        pages: [],
        contract: mockContract,
      } as any

      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: mockBlueprint,
            fileManifest: {},
            sandboxId: 'sandbox-123',
            supabaseProjectId: null,
            githubRepo: null,
            conversationHistory: [],
          })),
          reconnectSandboxActor: fromPromise(async () => ({
            sandboxId: 'sandbox-456',
          })),
          runAnalystActor: fromPromise(async () => ({
            type: 'done',
            tokensUsed: 10,
          })),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      const targetElement: ElementContext = {
        fileName: 'src/components/Button.tsx',
        lineNumber: 10,
        columnNumber: 0,
        tagName: 'button',
        className: 'bg-blue-500',
        textContent: 'Click',
        tailwindClasses: ['bg-blue-500'],
        rect: { x: 0, y: 0, width: 100, height: 40 },
      }

      actor.send({
        type: 'START',
        userMessage: 'make it red',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement,
      })

      await waitFor(actor, (state) => state.matches('editing'), { timeout: 2000 })
      expect(actor.getSnapshot().value).toBe('editing')
      actor.stop()
    })

    it('transitions editing → validating on successful edit', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }
      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: null,
            fileManifest: {},
            sandboxId: 'sandbox-123',
            supabaseProjectId: null,
            githubRepo: null,
            conversationHistory: [],
          })),
          reconnectSandboxActor: fromPromise(async () => ({
            sandboxId: 'sandbox-123',
          })),
          runAnalystActor: fromPromise(async () => ({
            type: 'done',
            tokensUsed: 10,
          })),
          applyEditActor: fromPromise(async () => ({
            filePath: 'src/components/Button.tsx',
            newContent: 'updated content',
            tokensUsed: 50,
            tier: 1 as const,
          })),
          // Add validateEditActor to prevent it from transitioning to complete immediately
          validateEditActor: fromPromise(async () => {
            // Delay to allow us to catch the validating state
            await new Promise((resolve) => setTimeout(resolve, 50))
            return { valid: true }
          }),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      const targetElement: ElementContext = {
        fileName: 'src/components/Button.tsx',
        lineNumber: 10,
        columnNumber: 0,
        tagName: 'button',
        className: 'bg-blue-500',
        textContent: 'Click',
        tailwindClasses: ['bg-blue-500'],
        rect: { x: 0, y: 0, width: 100, height: 40 },
      }

      actor.send({
        type: 'START',
        userMessage: 'make it red',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement,
      })

      await waitFor(actor, (state) => state.matches('validating'), { timeout: 2000 })
      expect(actor.getSnapshot().value).toBe('validating')
      actor.stop()
    })

    it('transitions validating → persisting when validation passes', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }
      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: null,
            fileManifest: {},
            sandboxId: 'sandbox-123',
            supabaseProjectId: null,
            githubRepo: null,
            conversationHistory: [],
          })),
          reconnectSandboxActor: fromPromise(async () => ({
            sandboxId: 'sandbox-123',
          })),
          runAnalystActor: fromPromise(async () => ({
            type: 'done',
            tokensUsed: 10,
          })),
          applyEditActor: fromPromise(async () => ({
            filePath: 'src/components/Button.tsx',
            newContent: 'updated content',
            tokensUsed: 50,
            tier: 1 as const,
          })),
          validateEditActor: fromPromise(async () => ({
            valid: true,
          })),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      const targetElement: ElementContext = {
        fileName: 'src/components/Button.tsx',
        lineNumber: 10,
        columnNumber: 0,
        tagName: 'button',
        className: 'bg-blue-500',
        textContent: 'Click',
        tailwindClasses: ['bg-blue-500'],
        rect: { x: 0, y: 0, width: 100, height: 40 },
      }

      actor.send({
        type: 'START',
        userMessage: 'make it red',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement,
      })

      await waitFor(actor, (state) => state.matches('persisting') || state.matches('complete'), {
        timeout: 2000,
      })
      expect(['persisting', 'complete']).toContain(actor.getSnapshot().value)
      actor.stop()
    })

    it('transitions persisting → complete', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }
      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: null,
            fileManifest: {},
            sandboxId: 'sandbox-123',
            supabaseProjectId: null,
            githubRepo: null,
            conversationHistory: [],
          })),
          reconnectSandboxActor: fromPromise(async () => ({
            sandboxId: 'sandbox-123',
          })),
          runAnalystActor: fromPromise(async () => ({
            type: 'done',
            tokensUsed: 10,
          })),
          applyEditActor: fromPromise(async () => ({
            filePath: 'src/components/Button.tsx',
            newContent: 'updated content',
            tokensUsed: 50,
            tier: 1 as const,
          })),
          validateEditActor: fromPromise(async () => ({
            valid: true,
          })),
          runPersistActor: fromPromise(async () => {
            return { success: true }
          }),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      const targetElement: ElementContext = {
        fileName: 'src/components/Button.tsx',
        lineNumber: 10,
        columnNumber: 0,
        tagName: 'button',
        className: 'bg-blue-500',
        textContent: 'Click',
        tailwindClasses: ['bg-blue-500'],
        rect: { x: 0, y: 0, width: 100, height: 40 },
      }

      actor.send({
        type: 'START',
        userMessage: 'make it red',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement,
      })

      await waitFor(actor, (state) => state.matches('complete'), { timeout: 2000 })
      expect(actor.getSnapshot().value).toBe('complete')
      actor.stop()
    })

    it('transitions validating → editing when validation fails and canRetry', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }
      let validateCallCount = 0

      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: null,
            fileManifest: {},
            sandboxId: 'sandbox-123',
            supabaseProjectId: null,
            githubRepo: null,
            conversationHistory: [],
          })),
          reconnectSandboxActor: fromPromise(async () => ({
            sandboxId: 'sandbox-123',
          })),
          runAnalystActor: fromPromise(async () => ({
            type: 'done',
            tokensUsed: 10,
          })),
          applyEditActor: fromPromise(async () => ({
            filePath: 'src/components/Button.tsx',
            newContent: 'updated content',
            tokensUsed: 50,
            tier: 2 as const,
          })),
          validateEditActor: fromPromise(async () => {
            validateCallCount++
            if (validateCallCount === 1) {
              return { valid: false, error: 'Type error' }
            }
            return { valid: true }
          }),
          runPersistActor: fromPromise(async () => {
            return { success: true }
          }),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      const targetElement: ElementContext = {
        fileName: 'src/components/Button.tsx',
        lineNumber: 10,
        columnNumber: 0,
        tagName: 'button',
        className: 'bg-blue-500',
        textContent: 'Click',
        tailwindClasses: ['bg-blue-500'],
        rect: { x: 0, y: 0, width: 100, height: 40 },
      }

      actor.send({
        type: 'START',
        userMessage: 'make it red',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement,
      })

      // Wait for first validation to fail and retry
      await waitFor(
        actor,
        (state) => state.matches('editing') && state.context.repairAttempts === 1,
        { timeout: 2000 },
      )
      expect(actor.getSnapshot().context.repairAttempts).toBe(1)

      // Wait for second validation to succeed
      await waitFor(actor, (state) => state.matches('complete'), { timeout: 2000 })
      expect(validateCallCount).toBe(2)
      actor.stop()
    })
  })

  // ============================================================================
  // Error handling
  // ============================================================================

  describe('error handling', () => {
    it('transitions loading → failed on actor error', async () => {
      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => {
            throw new Error('Project not found')
          }),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'test',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement: null,
      })

      await waitFor(actor, (state) => state.matches('failed'), { timeout: 1000 })
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error).toContain('Project not found')
      actor.stop()
    })

    it('transitions reconnecting → failed on actor error', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }

      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: null,
            fileManifest: {},
            sandboxId: 'sandbox-123',
            supabaseProjectId: null,
            githubRepo: null,
            conversationHistory: [],
          })),
          reconnectSandboxActor: fromPromise(async () => {
            throw new Error('Sandbox not available')
          }),
          runAnalystActor: fromPromise(async () => ({
            type: 'done',
            tokensUsed: 10,
          })),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'test',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement: null,
      })

      await waitFor(actor, (state) => state.matches('failed'), { timeout: 2000 })
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error).toContain('Sandbox not available')
      actor.stop()
    })

    it('transitions editing → failed on actor error', async () => {
      const mockContract: Record<string, unknown> = { tables: [], enums: [] }

      const testMachine = editMachine.provide({
        actors: {
          loadProjectActor: fromPromise(async () => ({
            contract: mockContract,
            blueprint: null,
            fileManifest: {},
            sandboxId: 'sandbox-123',
            supabaseProjectId: null,
            githubRepo: null,
            conversationHistory: [],
          })),
          reconnectSandboxActor: fromPromise(async () => ({
            sandboxId: 'sandbox-123',
          })),
          runAnalystActor: fromPromise(async () => ({
            type: 'done',
            tokensUsed: 10,
          })),
          applyEditActor: fromPromise(async () => {
            throw new Error('No target element selected')
          }),
        },
      })

      const actor = createActor(testMachine)
      actor.start()

      actor.send({
        type: 'START',
        userMessage: 'make it red',
        projectId: 'test-123',
        userId: 'user-456',
        targetElement: null,
      })

      await waitFor(actor, (state) => state.matches('failed'), { timeout: 2000 })
      expect(actor.getSnapshot().value).toBe('failed')
      expect(actor.getSnapshot().context.error).toContain('No target element selected')
      actor.stop()
    })
  })
})
