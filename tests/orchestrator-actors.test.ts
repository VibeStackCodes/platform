import { describe, it, expect } from 'vitest'

describe('pipeline B orchestrator exports', () => {
  it('exports runDesign', async () => {
    const mod = await import('@server/lib/agents/orchestrator')
    expect(typeof mod.runDesign).toBe('function')
  })
  it('exports runArchitect', async () => {
    const mod = await import('@server/lib/agents/orchestrator')
    expect(typeof mod.runArchitect).toBe('function')
  })
  it('exports runPageGeneration', async () => {
    const mod = await import('@server/lib/agents/orchestrator')
    expect(typeof mod.runPageGeneration).toBe('function')
  })
  it('exports runAssembly', async () => {
    const mod = await import('@server/lib/agents/orchestrator')
    expect(typeof mod.runAssembly).toBe('function')
  })
})
