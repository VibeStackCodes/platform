import { describe, it, expect } from 'vitest'
import { loadCoreRegistry } from '@server/lib/capabilities/catalog'
import { assembleCapabilities } from '@server/lib/capabilities/assembler'
import { analyzeInjection } from '@server/lib/capabilities/inject'
import { computeAdditiveDelta } from '@server/lib/capabilities/additive'

describe('Capability E2E dry run', () => {
  it('generate + inject flow produces correct delta', () => {
    // Step 1-2: Initial generation
    const registry = loadCoreRegistry()
    const initialCaps = registry.resolve(['auth', 'recipes', 'public-website'])
    const initialAssembly = assembleCapabilities(initialCaps)

    expect(initialAssembly.capabilityManifest).toContain('auth')
    expect(initialAssembly.capabilityManifest).toContain('recipes')
    expect(initialAssembly.contract.tables.length).toBeGreaterThan(0)

    // Step 3-4: Verify initial assembly has expected tables
    const tableNames = initialAssembly.contract.tables.map(t => t.name)
    expect(tableNames).toContain('recipes')
    // auth tables come from auth capability
    expect(initialAssembly.hasAuth).toBe(true)

    // Step 5-6: Simulate injection
    const analysis = analyzeInjection(
      ['auth', 'recipes', 'public-website'],
      ['auth', 'recipes', 'public-website', 'blog'],
    )

    expect(analysis.hasChanges).toBe(true)
    expect(analysis.newCapabilities).toEqual(['blog'])
    expect(analysis.mergedManifest).toEqual(['auth', 'recipes', 'public-website', 'blog'])

    // Step 7: Verify full assembly includes blog
    const mergedTableNames = analysis.fullAssembly.contract.tables.map(t => t.name)
    expect(mergedTableNames).toContain('posts') // blog tables are 'posts' and 'categories'
    expect(mergedTableNames).toContain('recipes')

    // Step 8: Verify additive assembly has ONLY blog tables
    expect(analysis.additiveAssembly).not.toBeNull()
    const additiveTableNames = analysis.additiveAssembly!.contract.tables.map(t => t.name)
    expect(additiveTableNames).toContain('posts')
    expect(additiveTableNames).not.toContain('recipes')
  })

  it('no-op injection when requesting existing capabilities', () => {
    const analysis = analyzeInjection(
      ['auth', 'recipes', 'public-website'],
      ['auth', 'recipes', 'public-website'],
    )

    expect(analysis.hasChanges).toBe(false)
    expect(analysis.newCapabilities).toEqual([])
    expect(analysis.additiveAssembly).toBeNull()
  })

  it('additive delta correctly classifies new vs existing files', () => {
    const analysis = analyzeInjection(
      ['auth', 'public-website'],
      ['auth', 'public-website', 'blog'],
    )

    // Simulate existing file paths from initial generation
    const existingPaths = new Set([
      'src/routes/index.tsx',
      'src/routes/__root.tsx',
      'src/routeTree.gen.ts',
      'src/routes/_authenticated/route.tsx',
    ])

    // Create a minimal mock blueprint that represents the merged output
    const mockBlueprint = {
      appName: 'test',
      fileTree: [
        { path: 'src/routes/index.tsx', content: '// home', isLLMSlot: false },
        { path: 'src/routes/__root.tsx', content: '// root with blog nav', isLLMSlot: false },
        { path: 'src/routeTree.gen.ts', content: '// tree with blog', isLLMSlot: false },
        { path: 'src/routes/_authenticated/route.tsx', content: '// auth', isLLMSlot: false },
        { path: 'src/routes/blog/index.tsx', content: '// blog list', isLLMSlot: false },
        { path: 'src/routes/blog/$id.tsx', content: '// blog detail', isLLMSlot: false },
      ],
      meta: {},
    }

    const delta = computeAdditiveDelta(analysis, mockBlueprint as any, existingPaths)

    // New files: blog routes (not in existing paths)
    const newPaths = delta.newFiles.map(f => f.path)
    expect(newPaths).toContain('src/routes/blog/index.tsx')
    expect(newPaths).toContain('src/routes/blog/$id.tsx')
    expect(newPaths).not.toContain('src/routes/index.tsx') // already exists

    // Updated files: always-regenerate set
    const updatedPaths = delta.updatedFiles.map(f => f.path)
    expect(updatedPaths).toContain('src/routes/__root.tsx')
    expect(updatedPaths).toContain('src/routeTree.gen.ts')

    // Additive migration should exist
    expect(delta.additiveMigration).toBeTruthy()
    expect(delta.additiveMigration).toContain('posts')
  })
})
