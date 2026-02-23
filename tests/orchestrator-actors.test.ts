import { describe, it, expect } from 'vitest'

describe('pipeline B orchestrator exports', () => {
  it('exports runArchitect (Creative Director — single design authority)', async () => {
    const mod = await import('@server/lib/agents/orchestrator')
    expect(typeof mod.runArchitect).toBe('function')
  })
  it('does not export runDesign (removed — Design Agent merged into Creative Director)', async () => {
    const mod = await import('@server/lib/agents/orchestrator')
    expect((mod as Record<string, unknown>).runDesign).toBeUndefined()
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
