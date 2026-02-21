import { describe, it, expect } from 'vitest'
import { getDesignKnowledge, getCondensedDesignRules } from '@server/lib/design-knowledge'

// ---------------------------------------------------------------------------
// getDesignKnowledge()
// ---------------------------------------------------------------------------

describe('getDesignKnowledge', () => {
  it('returns a non-empty string', () => {
    const result = getDesignKnowledge()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains "Typography" section', () => {
    const result = getDesignKnowledge()
    expect(result).toContain('Typography')
  })

  it('contains "Color Theory" section', () => {
    const result = getDesignKnowledge()
    expect(result).toContain('Color Theory')
  })

  it('is idempotent — returns the same string on repeated calls', () => {
    const first = getDesignKnowledge()
    const second = getDesignKnowledge()
    expect(first).toBe(second)
  })

  it('contains layout patterns guidance', () => {
    const result = getDesignKnowledge()
    expect(result).toContain('Layout')
  })

  it('contains auth patterns guidance', () => {
    const result = getDesignKnowledge()
    expect(result).toContain('Auth')
  })

  it('contains footer patterns guidance', () => {
    const result = getDesignKnowledge()
    expect(result).toContain('Footer')
  })

  it('contains sitemap principles', () => {
    const result = getDesignKnowledge()
    expect(result).toContain('Sitemap')
  })
})

// ---------------------------------------------------------------------------
// getCondensedDesignRules()
// ---------------------------------------------------------------------------

describe('getCondensedDesignRules', () => {
  it('returns a non-empty string', () => {
    const result = getCondensedDesignRules()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains "Layout" section', () => {
    const result = getCondensedDesignRules()
    expect(result).toContain('Layout')
  })

  it('contains "Typography" section', () => {
    const result = getCondensedDesignRules()
    expect(result).toContain('Typography')
  })

  it('is idempotent — returns the same string on repeated calls', () => {
    const first = getCondensedDesignRules()
    const second = getCondensedDesignRules()
    expect(first).toBe(second)
  })

  it('contains color usage guidance', () => {
    const result = getCondensedDesignRules()
    expect(result).toContain('Color')
  })

  it('contains card style definitions', () => {
    const result = getCondensedDesignRules()
    expect(result).toContain('Cards')
  })

  it('contains accessibility guidance', () => {
    const result = getCondensedDesignRules()
    expect(result).toContain('Accessibility')
  })
})

// ---------------------------------------------------------------------------
// Relationship between the two functions
// ---------------------------------------------------------------------------

describe('getDesignKnowledge vs getCondensedDesignRules', () => {
  it('full design knowledge is longer than condensed rules', () => {
    const full = getDesignKnowledge()
    const condensed = getCondensedDesignRules()
    expect(full.length).toBeGreaterThan(condensed.length)
  })

  it('condensed rules is meaningfully shorter than the full knowledge base', () => {
    // Full is ~3K tokens (~6K chars), condensed is ~1K tokens (~2K chars)
    // Condensed should be less than 75% of full length
    const full = getDesignKnowledge()
    const condensed = getCondensedDesignRules()
    expect(condensed.length).toBeLessThan(full.length * 0.75)
  })
})
