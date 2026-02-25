import { describe, it, expect } from 'vitest'
import { createOrchestrator } from '@server/lib/agents/orchestrator'

describe('createOrchestrator', () => {
  it('creates an agent with the correct id and name', () => {
    const agent = createOrchestrator()
    expect(agent.id).toBe('orchestrator')
    expect(agent.name).toBe('Orchestrator')
  })

  it('system prompt contains key instructions', () => {
    const agent = createOrchestrator()
    const instructions = agent.getInstructions({})
    expect(instructions).toContain('world-class app builder')
    expect(instructions).toContain('scaffold')
    expect(instructions).toContain('editFile')
    expect(instructions).toContain('vite build')
  })
})
