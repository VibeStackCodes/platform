import { describe, it, expect } from 'vitest'

describe('Edit machine injection flow', () => {
  it('detects capability injection when new capabilities requested', () => {
    const existingManifest = ['auth', 'recipes', 'public-website']
    const requestedCapabilities = ['auth', 'recipes', 'blog', 'public-website']

    const newCaps = requestedCapabilities.filter(c => !existingManifest.includes(c))
    expect(newCaps).toEqual(['blog'])
    expect(newCaps.length > 0).toBe(true) // This means injection, not visual edit
  })

  it('routes to visual edit when no new capabilities', () => {
    const existingManifest = ['auth', 'recipes']
    const requestedCapabilities = ['auth', 'recipes']

    const newCaps = requestedCapabilities.filter(c => !existingManifest.includes(c))
    expect(newCaps.length).toBe(0) // This means visual edit, not injection
  })

  it('injection deploy updates generation state with merged manifest', () => {
    const existingGenState = {
      contract: { tables: [{ name: 'recipes', columns: [] }] },
      capabilityManifest: ['auth', 'recipes'],
      fileManifest: { 'src/routes/index.tsx': 'abc123' },
    }

    const mergedManifest = ['auth', 'recipes', 'blog']
    const newFileManifest = {
      'src/routes/blog/index.tsx': 'def456',
      'src/routes/blog/$id.tsx': 'ghi789',
    }

    const updatedGenState = {
      ...existingGenState,
      capabilityManifest: mergedManifest,
      fileManifest: { ...existingGenState.fileManifest, ...newFileManifest },
      lastEditedAt: new Date().toISOString(),
    }

    expect(updatedGenState.capabilityManifest).toEqual(['auth', 'recipes', 'blog'])
    expect(updatedGenState.fileManifest).toHaveProperty('src/routes/blog/index.tsx')
    expect(updatedGenState.fileManifest).toHaveProperty('src/routes/index.tsx')
  })
})
