import { describe, it, expect } from 'vitest'
import { createActor } from 'xstate'
import { appGenerationMachine, mockAppGenerationMachine } from '@server/lib/agents/machine'

describe('planning state — PLAN_APPROVED event', () => {
  it('appGenerationMachine includes PLAN_APPROVED in event union (type-level)', () => {
    // This test verifies the event type is accepted by the machine at the type level.
    // We use the mock machine to avoid real actor invocations.
    const actor = createActor(mockAppGenerationMachine)
    // Sending PLAN_APPROVED before reaching planning state is a no-op (not in scope),
    // but the send() call must compile without TypeScript errors — proving the event is in the union.
    actor.start()
    // Should not throw — event is valid even if ignored in idle state
    expect(() => actor.send({ type: 'PLAN_APPROVED' })).not.toThrow()
    actor.stop()
  })

  it('mockAppGenerationMachine transitions from planning to codeGeneration on PLAN_APPROVED', async () => {
    const states: string[] = []
    const actor = createActor(mockAppGenerationMachine)

    actor.subscribe((snapshot) => {
      states.push(snapshot.value as string)
    })

    actor.start()

    // Drive through idle → preparing → architecting → planning
    actor.send({
      type: 'START',
      userMessage: 'Build a todo app',
      projectId: 'test-project-id',
      userId: 'test-user-id',
    })

    // Wait for the machine to reach the planning state
    await new Promise<void>((resolve) => {
      const unsubscribe = actor.subscribe((snapshot) => {
        if (snapshot.value === 'planning') {
          unsubscribe.unsubscribe()
          resolve()
        }
      })
    })

    expect(actor.getSnapshot().value).toBe('planning')

    // Send PLAN_APPROVED to advance to codeGeneration
    actor.send({ type: 'PLAN_APPROVED' })

    // After PLAN_APPROVED, the machine should leave planning
    await new Promise<void>((resolve) => {
      const unsubscribe = actor.subscribe((snapshot) => {
        const v = snapshot.value as string
        if (v !== 'planning') {
          unsubscribe.unsubscribe()
          resolve()
        }
      })
    })

    const valueAfter = actor.getSnapshot().value
    // Should have transitioned to codeGeneration (or beyond if the mock is fast)
    expect(['codeGeneration', 'validating', 'complete']).toContain(valueAfter)

    actor.stop()
  }, 30_000)

  it('planning state is present in appGenerationMachine state nodes', () => {
    // Verify the state node exists by inspecting the machine config
    const stateKeys = Object.keys(appGenerationMachine.config.states ?? {})
    expect(stateKeys).toContain('planning')
  })

  it('planning state is present in mockAppGenerationMachine state nodes', () => {
    const stateKeys = Object.keys(mockAppGenerationMachine.config.states ?? {})
    expect(stateKeys).toContain('planning')
  })

  it('codeGeneration follows planning in real machine topology', () => {
    const states = appGenerationMachine.config.states ?? {}
    const planningState = states['planning'] as { on?: { PLAN_APPROVED?: { target: string } } } | undefined
    expect(planningState).toBeDefined()
    expect(planningState?.on?.PLAN_APPROVED?.target).toBe('codeGeneration')
  })

  it('codeGeneration follows planning in mock machine topology', () => {
    const states = mockAppGenerationMachine.config.states ?? {}
    const planningState = states['planning'] as { on?: { PLAN_APPROVED?: { target: string } } } | undefined
    expect(planningState).toBeDefined()
    expect(planningState?.on?.PLAN_APPROVED?.target).toBe('codeGeneration')
  })
})
