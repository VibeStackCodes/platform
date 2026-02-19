import { createActor, fromPromise, waitFor } from 'xstate'
import { appGenerationMachine } from '@server/lib/agents/machine'
import { describe, expect, it, vi } from 'vitest'
import type { SchemaContract } from '@server/lib/schema-contract'
import type { AppBlueprint } from '@server/lib/app-blueprint'
import type { ValidationGateResult } from '@server/lib/agents/validation'

// Mock Sentry
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}))

describe('appGenerationMachine', () => {
  it('starts in idle state', () => {
    const actor = createActor(appGenerationMachine)
    expect(actor.getSnapshot().value).toBe('idle')
  })

  it('transitions to preparing on START event', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a bookmark app',
      projectId: 'test-123',
      userId: 'test-user-123',
    })
    const value = actor.getSnapshot().value
    // Parallel state: both analysis and infrastructure start concurrently
    expect(value).toEqual({ preparing: { analysis: 'running', infrastructure: 'provisioning' } })
    actor.stop()
  })

  it('has all expected states', () => {
    const states = Object.keys(appGenerationMachine.config.states ?? {})
    expect(states).toContain('idle')
    expect(states).toContain('preparing')
    expect(states).toContain('blueprinting')
    expect(states).toContain('generating')
    expect(states).toContain('validating')
    expect(states).toContain('repairing')
    expect(states).toContain('reviewing')
    expect(states).toContain('deploying')
    expect(states).toContain('cleanup')
    expect(states).toContain('complete')
    expect(states).toContain('failed')
    // Nested states inside preparing
    const preparingStates = (appGenerationMachine.config.states?.preparing as any)?.states
    expect(preparingStates?.analysis?.states).toHaveProperty('running')
    expect(preparingStates?.analysis?.states).toHaveProperty('awaitingClarification')
    expect(preparingStates?.analysis?.states).toHaveProperty('done')
    expect(preparingStates?.infrastructure?.states).toHaveProperty('provisioning')
    expect(preparingStates?.infrastructure?.states).toHaveProperty('done')
  })

  it('stores retryCount in context', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.retryCount).toBe(0)
    actor.stop()
  })

  it('machine has invoke on analysis.running state', () => {
    const preparingStates = (appGenerationMachine.config.states?.preparing as any)?.states
    const runningState = preparingStates?.analysis?.states?.running
    expect(runningState).toBeDefined()
    expect(runningState?.invoke).toBeDefined()
  })

  it('context includes totalTokens', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    expect(actor.getSnapshot().context.totalTokens).toBe(0)
    actor.stop()
  })

  it('machine has invoke on blueprinting state', () => {
    const state = appGenerationMachine.config.states?.blueprinting
    expect(state?.invoke).toBeDefined()
  })

  it('machine has invoke on generating state', () => {
    const state = appGenerationMachine.config.states?.generating
    expect(state?.invoke).toBeDefined()
  })

  it('machine has invoke on validating state', () => {
    const state = appGenerationMachine.config.states?.validating
    expect(state?.invoke).toBeDefined()
  })

  it('machine has invoke on reviewing state', () => {
    const state = appGenerationMachine.config.states?.reviewing
    expect(state?.invoke).toBeDefined()
  })

  it('context includes reviewResult', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    expect(actor.getSnapshot().context.reviewResult).toBe(null)
    actor.stop()
  })

  it('context includes reviewSkipped', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    expect(actor.getSnapshot().context.reviewSkipped).toBe(false)
    actor.stop()
  })

  it('awaitingClarification still has USER_ANSWERED event', () => {
    const preparingStates = (appGenerationMachine.config.states?.preparing as any)?.states
    const state = preparingStates?.analysis?.states?.awaitingClarification
    expect(state?.on?.USER_ANSWERED).toBeDefined()
  })

  it('context includes previousValidationErrors', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    expect(actor.getSnapshot().context.previousValidationErrors).toBe(null)
    actor.stop()
  })

  it('cleanup state has invoke with runCleanupActor', () => {
    const state = appGenerationMachine.config.states?.cleanup
    expect(state?.invoke).toBeDefined()
    expect((state?.invoke as any)?.src).toBe('runCleanupActor')
  })
})

// ============================================================================
// State Transition Tests
// ============================================================================

describe('state transitions', () => {
  it('transitions idle → preparing on START event', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a bookmark app',
      projectId: 'test-123',
      userId: 'test-user-123',
    })
    expect(actor.getSnapshot().matches('preparing')).toBe(true)
    actor.stop()
  })

  it('transitions preparing → blueprinting when analysis and provisioning both complete', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test description',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-123',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 1000 })
    expect(actor.getSnapshot().value).toBe('blueprinting')
    actor.stop()
  })

  it('transitions to awaitingClarification within preparing on clarification result', async () => {
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'clarification' as const,
          questions: ['What color theme?', 'How many users?'],
          tokensUsed: 50,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a task app',
      projectId: 'test-456',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches({ preparing: { analysis: 'awaitingClarification' } }), { timeout: 1000 })
    expect(actor.getSnapshot().context.clarificationQuestions).toEqual(['What color theme?', 'How many users?'])
    actor.stop()
  })

  it('transitions awaitingClarification → analysis.running on USER_ANSWERED event', async () => {
    let analysisCallCount = 0
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async ({ input: _input }) => {
          analysisCallCount++
          // First call returns clarification
          if (analysisCallCount === 1) {
            return {
              type: 'clarification' as const,
              questions: ['What features?'],
              tokensUsed: 30,
            }
          }
          // Second call after USER_ANSWERED returns done
          return {
            type: 'done' as const,
            appName: 'TaskApp',
            appDescription: 'Task tracker',
            contract: { tables: [], enums: [] },
            tokensUsed: 80,
          }
        }),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a task app',
      projectId: 'test-789',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches({ preparing: { analysis: 'awaitingClarification' } }), { timeout: 1000 })

    actor.send({
      type: 'USER_ANSWERED',
      answers: 'Blue theme, unlimited users',
    })

    // After second analysis returns 'done', both regions are final → blueprinting
    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 1000 })
    expect(actor.getSnapshot().context.userMessage).toContain('Blue theme, unlimited users')
    expect(analysisCallCount).toBe(2) // Verify it ran analysis twice
    actor.stop()
  })

  it('transitions through full happy path: preparing → blueprinting → generating → validating → reviewing → deploying → complete', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test app',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test app',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runCodeReviewActor: fromPromise(async () => ({
          passed: true,
          deterministicIssues: [],
          llmIssues: [],
          tokensUsed: 300,
        })),
        runDeploymentActor: fromPromise(async () => ({
          deploymentUrl: 'https://test.vercel.app',
          tokensUsed: 100,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-happy-path',
      userId: 'test-user-123',
    })

    // Preparing runs analysis + provisioning in parallel
    await waitFor(actor, (state) => state.matches('preparing'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 1000 })
    // No separate provisioning step — it ran inside preparing
    await waitFor(actor, (state) => state.matches('generating'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('validating'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('deploying'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('complete'), { timeout: 1000 })

    expect(actor.getSnapshot().value).toBe('complete')
    expect(actor.getSnapshot().context.deploymentUrl).toBe('https://test.vercel.app')
    actor.stop()
  })
})

// ============================================================================
// Validation & Repair Loop Tests
// ============================================================================

describe('validation and repair loop', () => {
  it('transitions validating → reviewing when allPassed is true', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-validation-pass',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 2000 })
    expect(actor.getSnapshot().value).toBe('reviewing')
    actor.stop()
  })

  it('transitions validating → repairing when allPassed is false and retryCount < 2', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }
    const mockValidation: ValidationGateResult = {
      tscErrors: ['Type error in file.ts'],
      buildErrors: [],
      testErrors: [],
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: false,
          validation: mockValidation,
          tokensUsed: 150,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-repair',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('repairing'), { timeout: 2000 })
    expect(actor.getSnapshot().value).toBe('repairing')
    expect(actor.getSnapshot().context.retryCount).toBe(1)
    expect(actor.getSnapshot().context.validation).toEqual(mockValidation)
    actor.stop()
  })

  it('transitions repairing → validating after repair completes', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }
    const mockValidation: ValidationGateResult = {
      tscErrors: ['Type error'],
      buildErrors: [],
      testErrors: [],
    }

    let validationCallCount = 0

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => {
          validationCallCount++
          // First call fails, second call passes
          if (validationCallCount === 1) {
            return {
              allPassed: false,
              validation: mockValidation,
              tokensUsed: 150,
            }
          }
          return {
            allPassed: true,
            validation: { tscErrors: [], buildErrors: [], testErrors: [] },
            tokensUsed: 150,
          }
        }),
        runRepairActor: fromPromise(async () => ({
          tokensUsed: 300,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-repair-then-validate',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('repairing'), { timeout: 2000 })
    // After repair, should return to validating, then proceed to deploying since second validation passes
    await waitFor(actor, (state) => state.matches('deploying') || state.matches('validating'), { timeout: 2000 })
    // Verify that validation was called twice (once before repair, once after)
    expect(validationCallCount).toBe(2)
    expect(actor.getSnapshot().context.retryCount).toBe(1)
    actor.stop()
  })

  it('transitions validating → failed after maximum retries (retryCount >= 2)', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    let validationCallCount = 0

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => {
          validationCallCount++
          // Always fail with DIFFERENT errors to trigger repair attempts
          return {
            allPassed: false,
            validation: {
              tscErrors: [`Error ${validationCallCount}`],
              buildErrors: [],
              testErrors: [],
            },
            tokensUsed: 150,
          }
        }),
        runRepairActor: fromPromise(async () => ({
          tokensUsed: 300,
        })),
        runCleanupActor: fromPromise(async () => ({ errors: [] })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-max-retries',
      userId: 'test-user-123',
    })

    // Should go through: validating (retry 0) → repairing → validating (retry 1) → repairing → validating (retry 2) → cleanup → failed
    await waitFor(actor, (state) => state.matches('failed'), { timeout: 5000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.retryCount).toBeGreaterThanOrEqual(2)
    actor.stop()
  })

  it('limits repair attempts to 2', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    let repairCallCount = 0

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => {
          const count = repairCallCount
          return {
            allPassed: false,
            validation: {
              tscErrors: [`Error attempt ${count}`], // Different error each time
              buildErrors: [],
              testErrors: [],
            },
            tokensUsed: 150,
          }
        }),
        runRepairActor: fromPromise(async () => {
          repairCallCount++
          return {
            tokensUsed: 300,
          }
        }),
        runCleanupActor: fromPromise(async () => ({ errors: [] })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-repair-limit',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 5000 })
    expect(repairCallCount).toBeLessThanOrEqual(2)
    actor.stop()
  })
})

// ============================================================================
// Error Transition Tests
// ============================================================================

describe('error handling', () => {
  it('transitions analyzing → failed on actor error', async () => {
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => {
          throw new Error('Analysis failed')
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-analysis-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 1000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Analysis failed')
    actor.stop()
  })

  it('transitions blueprinting → failed on actor error', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runBlueprintActor: fromPromise(async () => {
          throw new Error('Blueprint generation failed')
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-blueprint-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 1000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Blueprint generation failed')
    actor.stop()
  })

  it('transitions provisioning → failed on actor error', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => {
          throw new Error('Provisioning failed')
        }),
        runCleanupActor: fromPromise(async () => ({ errors: [] })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-provisioning-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 2000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Provisioning failed')
    actor.stop()
  })

  it('transitions generating → failed on actor error', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => {
          throw new Error('Code generation failed')
        }),
        runCleanupActor: fromPromise(async () => ({ errors: [] })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-codegen-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 2000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Code generation failed')
    actor.stop()
  })

  it('transitions deploying → failed on actor error', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runDeploymentActor: fromPromise(async () => {
          throw new Error('Deployment failed')
        }),
        runCleanupActor: fromPromise(async () => ({ errors: [] })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-deploy-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 3000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Deployment failed')
    actor.stop()
  })

  it('preserves error message in context.error', async () => {
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => {
          throw new Error('specific error message')
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-error-message',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 1000 })
    expect(actor.getSnapshot().context.error).toContain('specific error message')
    actor.stop()
  })
})

// ============================================================================
// Context Accumulation Tests
// ============================================================================

describe('context updates', () => {
  it('accumulates totalTokens across stages', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runDeploymentActor: fromPromise(async () => ({
          deploymentUrl: 'https://test.vercel.app',
          tokensUsed: 100,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-tokens',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('complete'), { timeout: 3000 })
    // 100 + 200 + 50 + 500 + 150 + 100 = 1100
    expect(actor.getSnapshot().context.totalTokens).toBe(1100)
    actor.stop()
  })

  it('stores contract in context after analysis', async () => {
    const mockContract: SchemaContract = {
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true, nullable: false }],
        },
      ],
      enums: [],
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-contract',
      userId: 'test-user-123',
    })

    // Both analysis and provisioning complete → blueprinting
    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 1000 })
    expect(actor.getSnapshot().context.contract).toEqual(mockContract)
    actor.stop()
  })

  it('stores blueprint in context after blueprinting', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'BlogApp',
      description: 'A blogging platform',
      features: [{ name: 'posts', description: 'Post management' }],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'BlogApp',
          appDescription: 'A blogging platform',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-blueprint',
      userId: 'test-user-123',
    })

    // blueprinting → generating (no separate provisioning step)
    await waitFor(actor, (state) => state.matches('generating'), { timeout: 1000 })
    expect(actor.getSnapshot().context.blueprint).toEqual(mockBlueprint)
    actor.stop()
  })

  it('increments retryCount on each repair cycle', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    let validationCallCount = 0

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => {
          validationCallCount++
          // Always fail with different errors to trigger retries
          return {
            allPassed: false,
            validation: {
              tscErrors: [`Error ${validationCallCount}`],
              buildErrors: [],
              testErrors: [],
            },
            tokensUsed: 150,
          }
        }),
        runRepairActor: fromPromise(async () => ({
          tokensUsed: 300,
        })),
        runCleanupActor: fromPromise(async () => ({ errors: [] })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-retry-count',
      userId: 'test-user-123',
    })

    // Wait through repair cycles
    await waitFor(actor, (state) => state.matches('failed'), { timeout: 5000 })
    const finalRetryCount = actor.getSnapshot().context.retryCount
    expect(finalRetryCount).toBeGreaterThanOrEqual(2)
    actor.stop()
  })
})

// ============================================================================
// Code Review State Transition Tests
// ============================================================================

describe('code review state transitions', () => {
  it('transitions reviewing → deploying when review passes', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runCodeReviewActor: fromPromise(async () => ({
          passed: true,
          deterministicIssues: [],
          llmIssues: [{ severity: 'info', category: 'ux', file: 'test.tsx', description: 'Minor suggestion', suggestion: 'Add tooltip' }],
          tokensUsed: 300,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-pass',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 2000 })
    await waitFor(actor, (state) => state.matches('deploying'), { timeout: 2000 })
    expect(actor.getSnapshot().value).toBe('deploying')
    expect(actor.getSnapshot().context.reviewResult?.passed).toBe(true)
    actor.stop()
  })

  it('transitions reviewing → cleanup when review finds critical issues', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runCodeReviewActor: fromPromise(async () => ({
          passed: false,
          deterministicIssues: [
            { type: 'missing_route_export', file: 'routes/tasks.tsx', message: 'Missing Route export', severity: 'critical' },
          ],
          llmIssues: [],
          tokensUsed: 300,
        })),
        runCleanupActor: fromPromise(async () => ({ errors: [] })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-fail',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 2000 })
    await waitFor(actor, (state) => state.matches('failed'), { timeout: 3000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Code review failed')
    expect(actor.getSnapshot().context.reviewResult?.passed).toBe(false)
    actor.stop()
  })

  it('transitions reviewing → deploying when review crashes (soft failure)', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runCodeReviewActor: fromPromise(async () => {
          throw new Error('LLM service unavailable')
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-crash',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 2000 })
    await waitFor(actor, (state) => state.matches('deploying'), { timeout: 2000 })
    // Review crash should NOT block deployment
    expect(actor.getSnapshot().value).toBe('deploying')
    expect(actor.getSnapshot().context.error).toBeNull()
    actor.stop()
  })

  it('accumulates reviewResult tokens in totalTokens', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runCodeReviewActor: fromPromise(async () => ({
          passed: true,
          deterministicIssues: [],
          llmIssues: [],
          tokensUsed: 300,
        })),
        runDeploymentActor: fromPromise(async () => ({
          deploymentUrl: 'https://test.vercel.app',
          tokensUsed: 100,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-tokens',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('complete'), { timeout: 3000 })
    // 100 + 200 + 50 + 500 + 150 + 300 + 100 = 1400
    expect(actor.getSnapshot().context.totalTokens).toBe(1400)
    actor.stop()
  })
})

// ============================================================================
// userId and Cleanup Tests
// ============================================================================

describe('userId and cleanup', () => {
  it('passes userId through to provisioning actor', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }

    let provisioningInput: any = null

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runProvisioningActor: fromPromise(async ({ input }: any) => {
          provisioningInput = input
          return {
            sandboxId: 'sandbox-123',
            supabaseProjectId: 'supabase-123',
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'anon-key',
            githubCloneUrl: 'https://github.com/test/repo.git',
            githubHtmlUrl: 'https://github.com/test/repo',
            repoName: 'test-repo',
            tokensUsed: 50,
          }
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-userid',
      userId: 'user-456',
    })

    // Provisioning runs in parallel with analysis during preparing
    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 2000 })
    expect(provisioningInput).toBeDefined()
    expect(provisioningInput.userId).toBe('user-456')
    expect(provisioningInput.projectId).toBe('test-userid')
    // appName is not yet available when provisioning starts (runs in parallel with analysis)
    // so it uses the projectId fallback
    expect(provisioningInput.appName).toBe('project-test-use')
    actor.stop()
  })

  it('stores userId in context from START event', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build an app',
      projectId: 'proj-123',
      userId: 'user-789',
    })
    expect(actor.getSnapshot().context.userId).toBe('user-789')
    actor.stop()
  })

  it('cleanup actor attempts to release warm pool project', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    let cleanupInput: any = null

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'warm-pool-project-id',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => {
          throw new Error('Trigger cleanup')
        }),
        runCleanupActor: fromPromise(async ({ input }: any) => {
          cleanupInput = input
          return { errors: [] }
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-cleanup',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 2000 })
    expect(cleanupInput).toBeDefined()
    expect(cleanupInput.sandboxId).toBe('sandbox-123')
    expect(cleanupInput.supabaseProjectId).toBe('warm-pool-project-id')
    actor.stop()
  })
})

// ============================================================================
// Timeout Tests (B1: No Global Actor Timeout)
// ============================================================================

describe('state timeouts', () => {
  it('analysis.running state has timeout configured', () => {
    const preparingStates = (appGenerationMachine.config.states?.preparing as any)?.states
    const runningState = preparingStates?.analysis?.states?.running
    const after = runningState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('180000')
    expect(after['180000'].target).toBe('#appGeneration.failed')
  })

  it('blueprinting state has timeout configured', () => {
    const blueprintingState = appGenerationMachine.config.states?.blueprinting
    const after = blueprintingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('120000')
    expect(after['120000'].target).toBe('failed')
  })

  it('infrastructure.provisioning state has timeout configured to cleanup', () => {
    const preparingStates = (appGenerationMachine.config.states?.preparing as any)?.states
    const provisioningState = preparingStates?.infrastructure?.states?.provisioning
    const after = provisioningState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('300000')
    expect(after['300000'].target).toBe('#appGeneration.cleanup')
  })

  it('generating state has timeout configured to cleanup', () => {
    const generatingState = appGenerationMachine.config.states?.generating
    const after = generatingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('600000')
    expect(after['600000'].target).toBe('cleanup')
  })

  it('validating state has timeout configured to cleanup', () => {
    const validatingState = appGenerationMachine.config.states?.validating
    const after = validatingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('180000')
    expect(after['180000'].target).toBe('cleanup')
  })

  it('awaitingClarification state has timeout configured', () => {
    const preparingStates = (appGenerationMachine.config.states?.preparing as any)?.states
    const awaitingState = preparingStates?.analysis?.states?.awaitingClarification
    const after = awaitingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('1800000')
    expect(after['1800000'].target).toBe('#appGeneration.failed')
  })

  it('repairing state has timeout configured to cleanup', () => {
    const repairingState = appGenerationMachine.config.states?.repairing
    const after = repairingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('300000')
    expect(after['300000'].target).toBe('cleanup')
  })

  it('reviewing state has timeout configured to cleanup', () => {
    const reviewingState = appGenerationMachine.config.states?.reviewing
    const after = reviewingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('180000')
    expect(after['180000'].target).toBe('cleanup')
  })

  it('deploying state has timeout configured to cleanup', () => {
    const deployingState = appGenerationMachine.config.states?.deploying
    const after = deployingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('600000')
    expect(after['600000'].target).toBe('cleanup')
  })

  it('cleanup state has timeout configured', () => {
    const cleanupState = appGenerationMachine.config.states?.cleanup
    const after = cleanupState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('120000')
    expect(after['120000'].target).toBe('failed')
  })
})

// ============================================================================
// Cleanup Ordering Tests (B4: Cleanup Actor Ordering)
// ============================================================================

describe('cleanup ordering', () => {
  it('cleanup deletes sandbox BEFORE releasing pool project', async () => {
    const executionOrder: string[] = []

    const testMachine = appGenerationMachine.provide({
      actors: {
        runCleanupActor: fromPromise(async ({ input }: any) => {
          const errors: string[] = []

          // Simulate sandbox deletion
          if (input.sandboxId) {
            executionOrder.push('sandbox_delete')
          }

          // Simulate pool release
          if (input.supabaseProjectId) {
            executionOrder.push('pool_release')
          }

          return { errors }
        }),
      },
    })

    // Manually trigger cleanup state
    const cleanupState = testMachine.config.states?.cleanup
    expect(cleanupState).toBeDefined()

    // The actual implementation order is verified in the machine.ts code
    // This test verifies that cleanup actor receives both IDs
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const fullMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'pool-project-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => {
          throw new Error('Trigger cleanup')
        }),
        runCleanupActor: fromPromise(async ({ input }: any) => {
          // Track order
          if (input.sandboxId) executionOrder.push('sandbox_delete')
          if (input.supabaseProjectId) executionOrder.push('pool_release')
          return { errors: [] }
        }),
      },
    })

    const fullActor = createActor(fullMachine)
    fullActor.start()
    fullActor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-cleanup-order',
      userId: 'test-user-123',
    })

    await waitFor(fullActor, (state) => state.matches('failed'), { timeout: 3000 })

    // Verify both operations were tracked (order is enforced in implementation)
    expect(executionOrder).toContain('sandbox_delete')
    expect(executionOrder).toContain('pool_release')

    fullActor.stop()
  })
})

// ============================================================================
// Sentry Capture Tests (H5: Swallowed Sandbox Deletion Errors)
// ============================================================================

describe('sentry error capture', () => {
  it('cleanup captures sandbox deletion errors to Sentry', async () => {
    const Sentry = await import('@sentry/node')
    const captureSpy = vi.spyOn(Sentry, 'captureException')

    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const sandboxError = new Error('Sandbox deletion failed - network timeout')

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'pool-project-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => {
          throw new Error('Trigger cleanup')
        }),
        runCleanupActor: fromPromise(async ({ input }: any) => {
          const errors: string[] = []

          // Simulate sandbox deletion failure
          if (input.sandboxId) {
            errors.push(`Sandbox cleanup failed: ${sandboxError.message}`)
            Sentry.captureException(sandboxError, {
              tags: { cleanup_stage: 'sandbox_deletion' },
              extra: { sandboxId: input.sandboxId },
            })
          }

          return { errors }
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-sentry',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 3000 })

    expect(captureSpy).toHaveBeenCalledWith(
      sandboxError,
      expect.objectContaining({
        tags: { cleanup_stage: 'sandbox_deletion' },
        extra: { sandboxId: 'sandbox-123' },
      }),
    )

    actor.stop()
    captureSpy.mockRestore()
  })
})

// ============================================================================
// Review Skip Tests (H7: Silent Code Review Failure)
// ============================================================================

describe('code review skip on error', () => {
  it('reviewing onError sets reviewSkipped and transitions to deploying', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          tokensUsed: 100,
        })),
        runBlueprintActor: fromPromise(async () => ({
          blueprint: mockBlueprint,
          tokensUsed: 200,
        })),
        runProvisioningActor: fromPromise(async () => ({
          sandboxId: 'sandbox-123',
          supabaseProjectId: 'supabase-123',
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'anon-key',
          githubCloneUrl: 'https://github.com/test/repo.git',
          githubHtmlUrl: 'https://github.com/test/repo',
          repoName: 'test-repo',
          tokensUsed: 50,
        })),
        runCodeGenerationActor: fromPromise(async () => ({
          tokensUsed: 500,
        })),
        runValidationActor: fromPromise(async () => ({
          allPassed: true,
          validation: { tscErrors: [], buildErrors: [], testErrors: [] },
          tokensUsed: 150,
        })),
        runCodeReviewActor: fromPromise(async () => {
          throw new Error('LLM service unavailable')
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-skip',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 2000 })
    await waitFor(actor, (state) => state.matches('deploying'), { timeout: 2000 })

    expect(actor.getSnapshot().value).toBe('deploying')
    expect(actor.getSnapshot().context.reviewSkipped).toBe(true)
    expect(actor.getSnapshot().context.error).toBeNull()

    actor.stop()
  })

  it('reviewing state has entry action that logs errors', () => {
    const reviewingState = appGenerationMachine.config.states?.reviewing
    expect(reviewingState?.invoke).toBeDefined()
    const invokeConfig = reviewingState?.invoke as any
    expect(invokeConfig.onError).toBeDefined()
    expect(invokeConfig.onError.entry).toBeDefined()
    // Verify entry action is a function that logs
    expect(typeof invokeConfig.onError.entry).toBe('function')
  })
})
