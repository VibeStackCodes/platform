import { createActor } from 'xstate'
import { appGenerationMachine } from '@server/lib/agents/machine'
import { describe, expect, it } from 'vitest'

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
    expect(states).toContain('complete')
    expect(states).toContain('failed')
  })

  it('stores retryCount in context', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.retryCount).toBe(0)
  })
})
