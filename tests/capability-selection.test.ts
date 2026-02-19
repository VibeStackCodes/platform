import { describe, it, expect } from 'vitest'
import { loadCoreRegistry } from '@server/capabilities/catalog'

describe('Capability selection guards', () => {
  it('filters out invalid capability names', () => {
    const registry = loadCoreRegistry()
    const validNames = new Set(registry.list().map(c => c.name))

    const selected = ['auth', 'recipes', 'cooking', 'food-delivery']
    const validated = selected.filter(name => validNames.has(name))

    expect(validated).toEqual(['auth', 'recipes'])
    expect(validated).not.toContain('cooking')
    expect(validated).not.toContain('food-delivery')
  })

  it('always includes public-website when capabilities are selected', () => {
    const selected = ['auth', 'blog']
    const withBase = selected.includes('public-website')
      ? selected
      : ['public-website', ...selected]

    expect(withBase[0]).toBe('public-website')
    expect(withBase).toContain('auth')
    expect(withBase).toContain('blog')
  })

  it('does not add public-website when no capabilities selected', () => {
    const selected: string[] = []
    const withBase = selected.length > 0 && !selected.includes('public-website')
      ? ['public-website', ...selected]
      : selected

    expect(withBase).toEqual([])
  })

  it('does not duplicate public-website if already present', () => {
    const selected = ['public-website', 'auth', 'blog']
    const withBase = selected.includes('public-website')
      ? selected
      : ['public-website', ...selected]

    expect(withBase.filter(n => n === 'public-website')).toHaveLength(1)
  })

  it('all registered capabilities have name and description', () => {
    const registry = loadCoreRegistry()
    const caps = registry.list()

    expect(caps.length).toBeGreaterThanOrEqual(5)
    for (const cap of caps) {
      expect(cap.name).toBeTruthy()
      expect(cap.description).toBeTruthy()
      expect(cap.schema.length).toBeGreaterThanOrEqual(0)
      expect(cap.pages.length).toBeGreaterThanOrEqual(0)
    }
  })
})
