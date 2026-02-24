import { describe, it, expect } from 'vitest'
import { createV2Orchestrator, V2_ORCHESTRATOR_TOOLS } from '@server/lib/agents/v2-orchestrator'

describe('createV2Orchestrator', () => {
  it('creates an agent with the correct tool belt', () => {
    const agent = createV2Orchestrator()
    expect(agent.id).toBe('v2-orchestrator')
    expect(agent.name).toBe('V2 Orchestrator')
  })

  it('has all expected tools', () => {
    const toolNames = Object.keys(V2_ORCHESTRATOR_TOOLS)
    expect(toolNames).toContain('createSandbox')
    expect(toolNames).toContain('writeFile')
    expect(toolNames).toContain('writeFiles')
    expect(toolNames).toContain('readFile')
    expect(toolNames).toContain('editFile')
    expect(toolNames).toContain('listFiles')
    expect(toolNames).toContain('runCommand')
    expect(toolNames).toContain('runBuild')
    expect(toolNames).toContain('installPackage')
    expect(toolNames).toContain('searchWeb')
    expect(toolNames).toContain('getPreviewUrl')
  })

  it('system prompt contains key instructions', () => {
    const agent = createV2Orchestrator()
    // getInstructions() is the public API — returns the system prompt string synchronously
    const instructions = agent.getInstructions({})
    expect(instructions).toContain('world-class app builder')
    expect(instructions).toContain('scaffold')
    expect(instructions).toContain('editFile')
    expect(instructions).toContain('vite build')
  })
})
