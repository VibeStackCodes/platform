import { describe, it, expect, vi } from 'vitest'

// Mock mastra module to avoid PostgresStore initialization without DATABASE_URL
vi.mock('@server/lib/agents/mastra', () => ({
  memory: {},
}))

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

  it('system prompt references commitAndPush tool', () => {
    const agent = createOrchestrator()
    const instructions = agent.getInstructions({})
    expect(instructions).toContain('commitAndPush')
  })

  it('system prompt includes working memory section', () => {
    const agent = createOrchestrator()
    const instructions = agent.getInstructions({})
    expect(instructions).toContain('Working Memory')
    expect(instructions).toContain('sandboxId')
    expect(instructions).toContain('repoUrl')
  })
})
