import { describe, it, expect } from 'vitest'
import { computeAdditiveDelta } from '@server/capabilities/additive'
import type { InjectAnalysis } from '@server/capabilities/inject'
import type { AppBlueprint } from '@server/lib/app-blueprint'

// Helper to make a minimal InjectAnalysis
function makeAnalysis(overrides: Partial<InjectAnalysis>): InjectAnalysis {
  return {
    newCapabilities: [],
    mergedManifest: [],
    additiveAssembly: null,
    fullAssembly: {
      contract: { tables: [] },
      pages: [],
      components: [],
      navEntries: [],
      npmDependencies: {},
      designHints: {},
      capabilityManifest: [],
      hasAuth: false,
    },
    hasChanges: false,
    ...overrides,
  }
}

// Helper to make a minimal blueprint
function makeBlueprint(files: Array<{ path: string; content: string }>): AppBlueprint {
  return {
    meta: { appName: 'test-app', appDescription: 'test' },
    features: { auth: false, search: false, forms: false, charts: false, profile: false },
    contract: { tables: [] },
    fileTree: files.map(f => ({
      path: f.path,
      content: f.content,
      layer: 1,
      isLLMSlot: false,
    })),
  } as AppBlueprint
}

describe('computeAdditiveDelta', () => {
  it('returns empty when no changes', () => {
    const analysis = makeAnalysis({ hasChanges: false })
    const blueprint = makeBlueprint([])
    const result = computeAdditiveDelta(analysis, blueprint, new Set())

    expect(result.newFiles).toEqual([])
    expect(result.updatedFiles).toEqual([])
    expect(result.additiveMigration).toBeNull()
  })

  it('identifies new files not in existing paths', () => {
    const analysis = makeAnalysis({
      hasChanges: true,
      additiveAssembly: {
        contract: { tables: [{ name: 'blog_posts', columns: [] }] },
        pages: [],
        components: [],
        navEntries: [],
        npmDependencies: {},
        designHints: {},
        capabilityManifest: ['blog'],
        hasAuth: false,
      },
    })

    const blueprint = makeBlueprint([
      { path: 'src/routes/index.tsx', content: '// existing' },
      { path: 'src/routes/blog/index.tsx', content: '// new blog list' },
      { path: 'src/routes/blog/$id.tsx', content: '// new blog detail' },
      { path: 'src/lib/hooks/blog-posts.hooks.ts', content: '// new hooks' },
      { path: 'src/routeTree.gen.ts', content: '// regenerated' },
    ])

    const existingPaths = new Set([
      'src/routes/index.tsx',
    ])

    const result = computeAdditiveDelta(analysis, blueprint, existingPaths)

    // New files: blog routes + hooks (not index.tsx which already exists)
    const newPaths = result.newFiles.map(f => f.path)
    expect(newPaths).toContain('src/routes/blog/index.tsx')
    expect(newPaths).toContain('src/routes/blog/$id.tsx')
    expect(newPaths).toContain('src/lib/hooks/blog-posts.hooks.ts')
    expect(newPaths).not.toContain('src/routes/index.tsx')

    // Updated files: routeTree always regenerated
    const updatedPaths = result.updatedFiles.map(f => f.path)
    expect(updatedPaths).toContain('src/routeTree.gen.ts')
  })

  it('always regenerates navigation-related files', () => {
    const analysis = makeAnalysis({
      hasChanges: true,
      additiveAssembly: {
        contract: { tables: [] },
        pages: [],
        components: [],
        navEntries: [],
        npmDependencies: {},
        designHints: {},
        capabilityManifest: ['blog'],
        hasAuth: false,
      },
    })

    const blueprint = makeBlueprint([
      { path: 'src/routes/__root.tsx', content: '// root with new nav' },
      { path: 'src/routeTree.gen.ts', content: '// new tree' },
    ])

    const existingPaths = new Set([
      'src/routes/__root.tsx',
      'src/routeTree.gen.ts',
    ])

    const result = computeAdditiveDelta(analysis, blueprint, existingPaths)

    // These exist but should be in updatedFiles (always regenerated)
    const updatedPaths = result.updatedFiles.map(f => f.path)
    expect(updatedPaths).toContain('src/routes/__root.tsx')
    expect(updatedPaths).toContain('src/routeTree.gen.ts')

    // Should NOT be in newFiles
    const newPaths = result.newFiles.map(f => f.path)
    expect(newPaths).not.toContain('src/routes/__root.tsx')
  })
})
