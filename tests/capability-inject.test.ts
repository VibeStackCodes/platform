import { describe, it, expect } from 'vitest'
import { analyzeInjection } from '@server/lib/capabilities/inject'

describe('analyzeInjection', () => {
  it('identifies new capabilities not in existing manifest', () => {
    const result = analyzeInjection(
      ['auth', 'recipes', 'public-website'],
      ['auth', 'recipes', 'blog', 'public-website'],
    )

    expect(result.newCapabilities).toEqual(['blog'])
    expect(result.hasChanges).toBe(true)
    expect(result.mergedManifest).toEqual(['auth', 'recipes', 'public-website', 'blog'])
  })

  it('returns hasChanges=false when no new capabilities', () => {
    const result = analyzeInjection(
      ['auth', 'recipes'],
      ['auth', 'recipes'],
    )

    expect(result.newCapabilities).toEqual([])
    expect(result.hasChanges).toBe(false)
    expect(result.additiveAssembly).toBeNull()
  })

  it('handles empty existing manifest (fresh app)', () => {
    const result = analyzeInjection(
      [],
      ['auth', 'blog'],
    )

    expect(result.newCapabilities).toEqual(['auth', 'blog'])
    expect(result.mergedManifest).toEqual(['auth', 'blog'])
    expect(result.hasChanges).toBe(true)
  })

  it('resolves dependencies for new capabilities', () => {
    // blog depends on auth — if auth is already installed,
    // only blog is new but fullAssembly includes both
    const result = analyzeInjection(
      ['auth', 'public-website'],
      ['auth', 'public-website', 'blog'],
    )

    expect(result.newCapabilities).toEqual(['blog'])
    expect(result.fullAssembly.capabilityManifest).toContain('auth')
    expect(result.fullAssembly.capabilityManifest).toContain('blog')
    // Additive assembly only has blog tables
    expect(result.additiveAssembly).not.toBeNull()
    const additiveTableNames = result.additiveAssembly!.contract.tables.map(t => t.name)
    expect(additiveTableNames).toContain('posts')
  })

  it('preserves existing manifest order', () => {
    const result = analyzeInjection(
      ['recipes', 'auth', 'public-website'],
      ['blog', 'recipes', 'auth', 'public-website'],
    )

    // Existing order preserved, new appended
    expect(result.mergedManifest).toEqual(['recipes', 'auth', 'public-website', 'blog'])
  })

  it('fullAssembly includes all tables from merged set', () => {
    const result = analyzeInjection(
      ['auth'],
      ['auth', 'blog', 'recipes'],
    )

    const tableNames = result.fullAssembly.contract.tables.map(t => t.name)
    // Should have tables from auth, blog, and recipes
    expect(tableNames).toContain('posts')
    expect(tableNames).toContain('recipes')
  })
})
