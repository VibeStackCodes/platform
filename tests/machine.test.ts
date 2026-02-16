import { createActor, fromPromise, waitFor } from 'xstate'
import { appGenerationMachine } from '@server/lib/agents/machine'
import { describe, expect, it } from 'vitest'
import type { SchemaContract } from '@server/lib/schema-contract'
import type { AppBlueprint } from '@server/lib/app-blueprint'
import type { ValidationGateResult } from '@server/lib/agents/validation'

describe('appGenerationMachine', () => {
  it('starts in idle state', () => {
    const actor = createActor(appGenerationMachine)
    expect(actor.getSnapshot().value).toBe('idle')
  })

  it('transitions to analyzing on START event', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a bookmark app',
      projectId: 'test-123',
    })
    expect(actor.getSnapshot().value).toBe('analyzing')
    actor.stop()
  })

  it('has all expected states', () => {
    const states = Object.keys(appGenerationMachine.config.states ?? {})
    expect(states).toContain('idle')
    expect(states).toContain('analyzing')
    expect(states).toContain('awaitingClarification')
    expect(states).toContain('blueprinting')
    expect(states).toContain('provisioning')
    expect(states).toContain('generating')
    expect(states).toContain('validating')
    expect(states).toContain('repairing')
    expect(states).toContain('deploying')
    expect(states).toContain('cleanup')
    expect(states).toContain('complete')
    expect(states).toContain('failed')
  })

  it('stores retryCount in context', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.retryCount).toBe(0)
    actor.stop()
  })

  it('machine has invoke on analyzing state', () => {
    const analyzeState = appGenerationMachine.config.states?.analyzing
    expect(analyzeState).toBeDefined()
    expect(analyzeState?.invoke).toBeDefined()
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

  it('awaitingClarification still has USER_ANSWERED event', () => {
    const state = appGenerationMachine.config.states?.awaitingClarification
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
  it('transitions idle → analyzing on START event', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a bookmark app',
      projectId: 'test-123',
    })
    expect(actor.getSnapshot().value).toBe('analyzing')
    actor.stop()
  })

  it('transitions analyzing → blueprinting on successful analysis (type: done)', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test description',
          contract: mockContract,
          designPreferences: null,
          tokensUsed: 100,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-123',
    })

    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 1000 })
    expect(actor.getSnapshot().value).toBe('blueprinting')
    actor.stop()
  })

  it('transitions analyzing → awaitingClarification on clarification result', async () => {
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'clarification' as const,
          questions: ['What color theme?', 'How many users?'],
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
    })

    await waitFor(actor, (state) => state.matches('awaitingClarification'), { timeout: 1000 })
    expect(actor.getSnapshot().value).toBe('awaitingClarification')
    expect(actor.getSnapshot().context.clarificationQuestions).toEqual(['What color theme?', 'How many users?'])
    actor.stop()
  })

  it('transitions awaitingClarification → analyzing on USER_ANSWERED event', async () => {
    let analysisCallCount = 0
    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async ({ input }) => {
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
            designPreferences: null,
            tokensUsed: 80,
          }
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a task app',
      projectId: 'test-789',
    })

    await waitFor(actor, (state) => state.matches('awaitingClarification'), { timeout: 1000 })

    actor.send({
      type: 'USER_ANSWERED',
      answers: 'Blue theme, unlimited users',
    })

    // Machine will go through analyzing and then to blueprinting since second analysis returns 'done'
    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 1000 })
    expect(actor.getSnapshot().context.userMessage).toContain('Blue theme, unlimited users')
    expect(analysisCallCount).toBe(2) // Verify it ran analysis twice
    actor.stop()
  })

  it('transitions through full happy path: analyzing → blueprinting → provisioning → generating → validating → deploying → complete', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test app',
      features: [],
      pages: [],
      contract: mockContract,
      designPreferences: null,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test app',
          contract: mockContract,
          designPreferences: null,
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
      projectId: 'test-happy-path',
    })

    // Wait for each state in sequence
    await waitFor(actor, (state) => state.matches('analyzing'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('blueprinting'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('provisioning'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('generating'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('validating'), { timeout: 1000 })
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
  it('transitions validating → deploying when allPassed is true', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: mockContract,
      designPreferences: null,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
    })

    await waitFor(actor, (state) => state.matches('deploying'), { timeout: 2000 })
    expect(actor.getSnapshot().value).toBe('deploying')
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
      designPreferences: null,
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
          designPreferences: null,
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
      designPreferences: null,
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
          designPreferences: null,
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
      designPreferences: null,
    }

    let validationCallCount = 0

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
      designPreferences: null,
    }

    let repairCallCount = 0

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
          designPreferences: null,
          tokensUsed: 100,
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
      designPreferences: null,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
      designPreferences: null,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
      designPreferences: null,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
      designPreferences: null,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
          designPreferences: null,
          tokensUsed: 100,
        })),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-contract',
    })

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
      designPreferences: null,
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'BlogApp',
          appDescription: 'A blogging platform',
          contract: mockContract,
          designPreferences: null,
          tokensUsed: 100,
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
    })

    await waitFor(actor, (state) => state.matches('provisioning'), { timeout: 1000 })
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
      designPreferences: null,
    }

    let validationCallCount = 0

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: mockContract,
          designPreferences: null,
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
    })

    // Wait through repair cycles
    await waitFor(actor, (state) => state.matches('failed'), { timeout: 5000 })
    const finalRetryCount = actor.getSnapshot().context.retryCount
    expect(finalRetryCount).toBeGreaterThanOrEqual(2)
    actor.stop()
  })
})
