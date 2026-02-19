import { describe, it, expect } from 'vitest'
import { loadCoreRegistry } from '@server/capabilities/catalog/index'
import { assembleCapabilities } from '@server/capabilities/assembler'

describe('Core capability catalog', () => {
  it('loads all 5 core capabilities', () => {
    const registry = loadCoreRegistry()
    expect(registry.list()).toHaveLength(5)
    expect(registry.get('auth')).toBeDefined()
    expect(registry.get('public-website')).toBeDefined()
    expect(registry.get('blog')).toBeDefined()
    expect(registry.get('recipes')).toBeDefined()
    expect(registry.get('portfolio')).toBeDefined()
  })

  it('resolves "recipe website" capabilities', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'recipes', 'auth'])
    expect(resolved.map(c => c.name)).toContain('auth')
    expect(resolved.map(c => c.name)).toContain('public-website')
    expect(resolved.map(c => c.name)).toContain('recipes')
  })

  it('assembles a blog app without errors', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'blog'])
    const result = assembleCapabilities(resolved)
    expect(result.contract.tables.length).toBeGreaterThan(0)
    expect(result.hasAuth).toBe(true)
    expect(result.navEntries.length).toBeGreaterThan(0)
  })

  it('assembles a portfolio app without errors', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'portfolio'])
    const result = assembleCapabilities(resolved)
    expect(result.contract.tables.map(t => t.name)).toContain('projects')
    expect(result.hasAuth).toBe(true)
  })

  it('produces valid SchemaContract from assembled capabilities', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'recipes', 'blog'])
    const result = assembleCapabilities(resolved)
    for (const table of result.contract.tables) {
      const idCol = table.columns.find(c => c.name === 'id')
      expect(idCol, `Table ${table.name} missing id column`).toBeDefined()
    }
  })

  it('no duplicate tables when assembling multiple capabilities that share auth', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['blog', 'recipes', 'public-website'])
    const result = assembleCapabilities(resolved)
    const tableNames = result.contract.tables.map(t => t.name)
    const unique = [...new Set(tableNames)]
    expect(tableNames).toEqual(unique)
  })
})
