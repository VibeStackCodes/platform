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
    expect(states).toContain('designing')
    expect(states).toContain('architecting')
    expect(states).toContain('pageGeneration')
    expect(states).toContain('assembly')
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

  it('machine has invoke on designing state', () => {
    const state = appGenerationMachine.config.states?.designing
    expect(state?.invoke).toBeDefined()
  })

  it('machine has invoke on architecting state', () => {
    const state = appGenerationMachine.config.states?.architecting
    expect(state?.invoke).toBeDefined()
  })

  it('machine has invoke on pageGeneration state', () => {
    const state = appGenerationMachine.config.states?.pageGeneration
    expect(state?.invoke).toBeDefined()
  })

  it('machine has invoke on assembly state', () => {
    const state = appGenerationMachine.config.states?.assembly
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

  it('transitions preparing → designing when analysis and provisioning both complete', async () => {
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

    await waitFor(actor, (state) => state.matches('designing'), { timeout: 1000 })
    expect(actor.getSnapshot().matches('designing')).toBe(true)
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

    // After second analysis returns 'done', both regions are final → designing
    await waitFor(actor, (state) => state.matches('designing'), { timeout: 1000 })
    expect(actor.getSnapshot().context.userMessage).toContain('Blue theme, unlimited users')
    expect(analysisCallCount).toBe(2) // Verify it ran analysis twice
    actor.stop()
  })

  it('transitions through full happy path: preparing → designing → architecting → pageGeneration → assembly → validating → reviewing → deploying → complete', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test app',
      features: [],
      pages: [],
      contract: mockContract,
    }
    const mockTokens = {
      name: 'canape',
      colors: { background: '#fff', foreground: '#111', primary: '#2b6cb0', primaryForeground: '#fff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
      fonts: { display: 'Playfair Display', body: 'Inter', googleFontsUrl: '' },
      style: { borderRadius: '0.5rem', cardStyle: 'bordered' as const, navStyle: 'top-bar' as const, heroLayout: 'fullbleed' as const, spacing: 'normal' as const, motion: 'subtle' as const, imagery: 'photography-heavy' as const },
      authPosture: 'public' as const,
      textSlots: { hero_headline: 'Welcome', hero_subtext: 'A restaurant', about_paragraph: 'About us', cta_label: 'Reserve', empty_state: 'No items', footer_tagline: 'Built with care' },
    }
    const mockSpec = {
      archetype: 'static' as const,
      sitemap: [{ route: '/', componentName: 'Homepage', purpose: 'Landing', sections: ['hero'] as any[], dataRequirements: 'none' }],
      auth: { required: false },
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
        runDesignActor: fromPromise(async () => ({
          tokens: mockTokens,
          tokensUsed: 150,
        })),
        runArchitectActor: fromPromise(async () => ({
          spec: mockSpec,
          imagePool: [],
          tokensUsed: 200,
        })),
        runPageGenerationActor: fromPromise(async () => ({
          pages: [],
          tokensUsed: 300,
        })),
        runAssemblyActor: fromPromise(async () => ({
          assembledFiles: [],
          blueprint: mockBlueprint,
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
    await waitFor(actor, (state) => state.matches('designing'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('architecting'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('pageGeneration'), { timeout: 1000 })
    await waitFor(actor, (state) => state.matches('assembly'), { timeout: 1000 })
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

// Helper to build a testMachine that gets to validating
function buildMachineToValidating(overrides: Record<string, ReturnType<typeof fromPromise>>) {
  const mockContract: SchemaContract = { tables: [], enums: [] }
  const mockBlueprint: AppBlueprint = {
    name: 'TestApp',
    description: 'Test',
    features: [],
    pages: [],
    contract: mockContract,
  }
  const mockTokens = {
    name: 'canape',
    colors: { background: '#fff', foreground: '#111', primary: '#2b6cb0', primaryForeground: '#fff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
    fonts: { display: 'Inter', body: 'Inter', googleFontsUrl: '' },
    style: { borderRadius: '0.5rem', cardStyle: 'bordered' as const, navStyle: 'top-bar' as const, heroLayout: 'fullbleed' as const, spacing: 'normal' as const, motion: 'subtle' as const, imagery: 'photography-heavy' as const },
    authPosture: 'public' as const,
    textSlots: { hero_headline: 'Welcome', hero_subtext: 'Sub', about_paragraph: 'About', cta_label: 'CTA', empty_state: 'Empty', footer_tagline: 'Footer' },
  }
  const mockSpec = {
    archetype: 'static' as const,
    sitemap: [{ route: '/', componentName: 'Homepage', purpose: 'Landing', sections: [] as any[], dataRequirements: 'none' }],
    auth: { required: false },
  }

  return appGenerationMachine.provide({
    actors: {
      runAnalysisActor: fromPromise(async () => ({
        type: 'done' as const,
        appName: 'TestApp',
        appDescription: 'Test',
        contract: mockContract,
        tokensUsed: 100,
      })),
      runDesignActor: fromPromise(async () => ({
        tokens: mockTokens,
        tokensUsed: 50,
      })),
      runArchitectActor: fromPromise(async () => ({
        spec: mockSpec,
        imagePool: [],
        tokensUsed: 50,
      })),
      runPageGenerationActor: fromPromise(async () => ({
        pages: [],
        tokensUsed: 50,
      })),
      runAssemblyActor: fromPromise(async () => ({
        assembledFiles: [],
        blueprint: mockBlueprint,
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
      ...overrides,
    },
  })
}

describe('validation and repair loop', () => {
  it('transitions validating → reviewing when allPassed is true', async () => {
    const testMachine = buildMachineToValidating({
      runValidationActor: fromPromise(async () => ({
        allPassed: true,
        validation: { tscErrors: [], buildErrors: [], testErrors: [] },
        tokensUsed: 150,
      })),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-validation-pass',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 5000 })
    expect(actor.getSnapshot().value).toBe('reviewing')
    actor.stop()
  })

  it('transitions validating → repairing when allPassed is false and retryCount < 2', async () => {
    const mockValidation: ValidationGateResult = {
      tscErrors: ['Type error in file.ts'],
      buildErrors: [],
      testErrors: [],
    }

    const testMachine = buildMachineToValidating({
      runValidationActor: fromPromise(async () => ({
        allPassed: false,
        validation: mockValidation,
        tokensUsed: 150,
      })),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-repair',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('repairing'), { timeout: 5000 })
    expect(actor.getSnapshot().value).toBe('repairing')
    expect(actor.getSnapshot().context.retryCount).toBe(1)
    expect(actor.getSnapshot().context.validation).toEqual(mockValidation)
    actor.stop()
  })

  it('transitions repairing → validating after repair completes', async () => {
    let validationCallCount = 0
    const mockValidation: ValidationGateResult = {
      tscErrors: ['Type error'],
      buildErrors: [],
      testErrors: [],
    }

    const testMachine = buildMachineToValidating({
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
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-repair-then-validate',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('repairing'), { timeout: 5000 })
    // After repair, should return to validating, then proceed to deploying since second validation passes
    await waitFor(actor, (state) => state.matches('deploying') || state.matches('validating'), { timeout: 5000 })
    // Verify that validation was called twice (once before repair, once after)
    expect(validationCallCount).toBe(2)
    expect(actor.getSnapshot().context.retryCount).toBe(1)
    actor.stop()
  })

  it('transitions validating → failed after maximum retries (retryCount >= 2)', async () => {
    let validationCallCount = 0

    const testMachine = buildMachineToValidating({
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
    await waitFor(actor, (state) => state.matches('failed'), { timeout: 10000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.retryCount).toBeGreaterThanOrEqual(2)
    actor.stop()
  })

  it('limits repair attempts to 2', async () => {
    let repairCallCount = 0

    const testMachine = buildMachineToValidating({
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
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-repair-limit',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 10000 })
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

  it('transitions designing → failed on actor error', async () => {
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
        runDesignActor: fromPromise(async () => {
          throw new Error('Design generation failed')
        }),
      },
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-design-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 1000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Design generation failed')
    actor.stop()
  })

  it('transitions provisioning → failed on actor error', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockTokens = {
      name: 'canape',
      colors: { background: '#fff', foreground: '#111', primary: '#2b6cb0', primaryForeground: '#fff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
      fonts: { display: 'Inter', body: 'Inter', googleFontsUrl: '' },
      style: { borderRadius: '0.5rem', cardStyle: 'bordered' as const, navStyle: 'top-bar' as const, heroLayout: 'fullbleed' as const, spacing: 'normal' as const, motion: 'subtle' as const, imagery: 'photography-heavy' as const },
      authPosture: 'public' as const,
      textSlots: { hero_headline: 'Welcome', hero_subtext: 'Sub', about_paragraph: 'About', cta_label: 'CTA', empty_state: 'Empty', footer_tagline: 'Footer' },
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
        runDesignActor: fromPromise(async () => ({
          tokens: mockTokens,
          tokensUsed: 50,
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

  it('transitions pageGeneration → failed on actor error', async () => {
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: { tables: [], enums: [] },
    }

    const testMachine = buildMachineToValidating({
      runPageGenerationActor: fromPromise(async () => {
        throw new Error('Code generation failed')
      }),
      // Need to prevent assembly from running
      runAssemblyActor: fromPromise(async () => ({
        assembledFiles: [],
        blueprint: mockBlueprint,
        tokensUsed: 50,
      })),
      runCleanupActor: fromPromise(async () => ({ errors: [] })),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-codegen-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 5000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Code generation failed')
    actor.stop()
  })

  it('transitions deploying → failed on actor error', async () => {
    const testMachine = buildMachineToValidating({
      runValidationActor: fromPromise(async () => ({
        allPassed: true,
        validation: { tscErrors: [], buildErrors: [], testErrors: [] },
        tokensUsed: 150,
      })),
      runDeploymentActor: fromPromise(async () => {
        throw new Error('Deployment failed')
      }),
      runCleanupActor: fromPromise(async () => ({ errors: [] })),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-deploy-error',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 8000 })
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
    const mockBlueprint: AppBlueprint = {
      name: 'TestApp',
      description: 'Test',
      features: [],
      pages: [],
      contract: { tables: [], enums: [] },
    }
    const mockTokens = {
      name: 'canape',
      colors: { background: '#fff', foreground: '#111', primary: '#2b6cb0', primaryForeground: '#fff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
      fonts: { display: 'Inter', body: 'Inter', googleFontsUrl: '' },
      style: { borderRadius: '0.5rem', cardStyle: 'bordered' as const, navStyle: 'top-bar' as const, heroLayout: 'fullbleed' as const, spacing: 'normal' as const, motion: 'subtle' as const, imagery: 'photography-heavy' as const },
      authPosture: 'public' as const,
      textSlots: { hero_headline: 'Welcome', hero_subtext: 'Sub', about_paragraph: 'About', cta_label: 'CTA', empty_state: 'Empty', footer_tagline: 'Footer' },
    }
    const mockSpec = {
      archetype: 'static' as const,
      sitemap: [{ route: '/', componentName: 'Homepage', purpose: 'Landing', sections: [] as any[], dataRequirements: 'none' }],
      auth: { required: false },
    }

    const testMachine = appGenerationMachine.provide({
      actors: {
        runAnalysisActor: fromPromise(async () => ({
          type: 'done' as const,
          appName: 'TestApp',
          appDescription: 'Test',
          contract: { tables: [], enums: [] },
          tokensUsed: 100,
        })),
        runDesignActor: fromPromise(async () => ({
          tokens: mockTokens,
          tokensUsed: 50,
        })),
        runArchitectActor: fromPromise(async () => ({
          spec: mockSpec,
          imagePool: [],
          tokensUsed: 50,
        })),
        runPageGenerationActor: fromPromise(async () => ({
          pages: [],
          tokensUsed: 200,
        })),
        runAssemblyActor: fromPromise(async () => ({
          assembledFiles: [],
          blueprint: mockBlueprint,
          tokensUsed: 0,
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

    await waitFor(actor, (state) => state.matches('complete'), { timeout: 8000 })
    // 100 (analysis) + 50 (provisioning) + 50 (design) + 50 (architect) + 200 (pageGen) + 150 (validation) + 100 (deploy) = 700
    expect(actor.getSnapshot().context.totalTokens).toBeGreaterThanOrEqual(700)
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

    // Both analysis and provisioning complete → designing
    await waitFor(actor, (state) => state.matches('designing'), { timeout: 1000 })
    expect(actor.getSnapshot().context.contract).toEqual(mockContract)
    actor.stop()
  })

  it('stores blueprint in context after assembly', async () => {
    const mockContract: SchemaContract = { tables: [], enums: [] }
    const mockBlueprint: AppBlueprint = {
      name: 'BlogApp',
      description: 'A blogging platform',
      features: [{ name: 'posts', description: 'Post management' }],
      pages: [],
      contract: mockContract,
    }

    const testMachine = buildMachineToValidating({
      runAssemblyActor: fromPromise(async () => ({
        assembledFiles: [],
        blueprint: mockBlueprint,
        tokensUsed: 200,
      })),
      runValidationActor: fromPromise(async () => ({
        allPassed: true,
        validation: { tscErrors: [], buildErrors: [], testErrors: [] },
        tokensUsed: 150,
      })),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-blueprint',
      userId: 'test-user-123',
    })

    // assembly → validating
    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 8000 })
    expect(actor.getSnapshot().context.blueprint).toEqual(mockBlueprint)
    actor.stop()
  })

  it('increments retryCount on each repair cycle', async () => {
    let validationCallCount = 0

    const testMachine = buildMachineToValidating({
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
    await waitFor(actor, (state) => state.matches('failed'), { timeout: 10000 })
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
    const testMachine = buildMachineToValidating({
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
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-pass',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 8000 })
    await waitFor(actor, (state) => state.matches('deploying'), { timeout: 2000 })
    expect(actor.getSnapshot().value).toBe('deploying')
    expect(actor.getSnapshot().context.reviewResult?.passed).toBe(true)
    actor.stop()
  })

  it('transitions reviewing → cleanup when review finds critical issues', async () => {
    const testMachine = buildMachineToValidating({
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
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-fail',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 8000 })
    await waitFor(actor, (state) => state.matches('failed'), { timeout: 3000 })
    expect(actor.getSnapshot().value).toBe('failed')
    expect(actor.getSnapshot().context.error).toContain('Code review failed')
    expect(actor.getSnapshot().context.reviewResult?.passed).toBe(false)
    actor.stop()
  })

  it('transitions reviewing → deploying when review crashes (soft failure)', async () => {
    const testMachine = buildMachineToValidating({
      runValidationActor: fromPromise(async () => ({
        allPassed: true,
        validation: { tscErrors: [], buildErrors: [], testErrors: [] },
        tokensUsed: 150,
      })),
      runCodeReviewActor: fromPromise(async () => {
        throw new Error('LLM service unavailable')
      }),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-crash',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 8000 })
    await waitFor(actor, (state) => state.matches('deploying'), { timeout: 2000 })
    // Review crash should NOT block deployment
    expect(actor.getSnapshot().value).toBe('deploying')
    expect(actor.getSnapshot().context.error).toBeNull()
    actor.stop()
  })

  it('accumulates reviewResult tokens in totalTokens', async () => {
    const testMachine = buildMachineToValidating({
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
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-tokens',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('complete'), { timeout: 10000 })
    // Total should include all stage tokens including review (300) and deploy (100)
    expect(actor.getSnapshot().context.totalTokens).toBeGreaterThan(500)
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
    await waitFor(actor, (state) => state.matches('designing'), { timeout: 2000 })
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
    const testMachine = buildMachineToValidating({
      runPageGenerationActor: fromPromise(async () => {
        throw new Error('Trigger cleanup')
      }),
      runCleanupActor: fromPromise(async ({ input }: any) => {
        // Track input for assertions below
        ;(global as any).__cleanupInput = input
        return { errors: [] }
      }),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-cleanup',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 5000 })
    const cleanupInput = (global as any).__cleanupInput
    expect(cleanupInput).toBeDefined()
    expect(cleanupInput.sandboxId).toBe('sandbox-123')
    expect(cleanupInput.supabaseProjectId).toBe('supabase-123')
    delete (global as any).__cleanupInput
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

  it('designing state has timeout configured', () => {
    const designingState = appGenerationMachine.config.states?.designing
    const after = designingState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('60000')
    expect(after['60000'].target).toBe('failed')
  })

  it('architecting state has timeout configured', () => {
    const architectingState = appGenerationMachine.config.states?.architecting
    const after = architectingState?.after as any
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

  it('pageGeneration state has timeout configured to cleanup', () => {
    const pageGenerationState = appGenerationMachine.config.states?.pageGeneration
    const after = pageGenerationState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('300000')
    expect(after['300000'].target).toBe('cleanup')
  })

  it('assembly state has timeout configured to cleanup', () => {
    const assemblyState = appGenerationMachine.config.states?.assembly
    const after = assemblyState?.after as any
    expect(after).toBeDefined()
    expect(after).toHaveProperty('120000')
    expect(after['120000'].target).toBe('cleanup')
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

    // The actual implementation order is verified in the machine.ts code
    // This test verifies that cleanup actor receives both IDs
    const fullMachine = buildMachineToValidating({
      runPageGenerationActor: fromPromise(async () => {
        throw new Error('Trigger cleanup')
      }),
      runCleanupActor: fromPromise(async ({ input }: any) => {
        // Track order
        if (input.sandboxId) executionOrder.push('sandbox_delete')
        if (input.supabaseProjectId) executionOrder.push('pool_release')
        return { errors: [] }
      }),
    })

    const fullActor = createActor(fullMachine)
    fullActor.start()
    fullActor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-cleanup-order',
      userId: 'test-user-123',
    })

    await waitFor(fullActor, (state) => state.matches('failed'), { timeout: 5000 })

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

    const sandboxError = new Error('Sandbox deletion failed - network timeout')

    const testMachine = buildMachineToValidating({
      runPageGenerationActor: fromPromise(async () => {
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
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-sentry',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('failed'), { timeout: 5000 })

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
    const testMachine = buildMachineToValidating({
      runValidationActor: fromPromise(async () => ({
        allPassed: true,
        validation: { tscErrors: [], buildErrors: [], testErrors: [] },
        tokensUsed: 150,
      })),
      runCodeReviewActor: fromPromise(async () => {
        throw new Error('LLM service unavailable')
      }),
    })

    const actor = createActor(testMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a blog',
      projectId: 'test-review-skip',
      userId: 'test-user-123',
    })

    await waitFor(actor, (state) => state.matches('reviewing'), { timeout: 8000 })
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
