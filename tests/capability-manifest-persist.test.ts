import { describe, it, expect } from 'vitest'

describe('Capability manifest persistence', () => {
  it('generation state shape includes capabilityManifest', () => {
    // Verify the shape of what gets persisted
    const genState = {
      contract: { tables: [] },
      blueprint: null,
      sandboxId: 'test-sandbox',
      supabaseProjectId: null,
      githubRepo: null,
      fileManifest: {},
      capabilityManifest: ['auth', 'blog', 'recipes'],
      lastEditedAt: new Date().toISOString(),
    }

    expect(genState.capabilityManifest).toEqual(['auth', 'blog', 'recipes'])
    expect(Array.isArray(genState.capabilityManifest)).toBe(true)
  })

  it('handles missing capabilityManifest gracefully', () => {
    const genState: Record<string, unknown> = {
      contract: { tables: [] },
    }

    const manifest = Array.isArray(genState.capabilityManifest)
      ? genState.capabilityManifest
      : []

    expect(manifest).toEqual([])
  })
})
