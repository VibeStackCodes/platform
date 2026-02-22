import { describe, it, expect } from 'vitest'
import { getStaticDesignRules } from '@server/lib/design-knowledge'

describe('getStaticDesignRules', () => {
  it('returns a non-empty string', () => {
    const result = getStaticDesignRules()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains Layout section', () => {
    expect(getStaticDesignRules()).toContain('### Layout')
  })

  it('contains Typography section', () => {
    expect(getStaticDesignRules()).toContain('### Typography')
  })

  it('contains Color Usage section', () => {
    expect(getStaticDesignRules()).toContain('### Color Usage')
  })

  it('contains Cards section', () => {
    expect(getStaticDesignRules()).toContain('### Cards')
  })

  it('contains Accessibility guidance', () => {
    expect(getStaticDesignRules()).toContain('### Interaction & Accessibility')
  })

  it('is idempotent', () => {
    expect(getStaticDesignRules()).toBe(getStaticDesignRules())
  })

  it('does NOT contain data loading patterns (static only)', () => {
    const rules = getStaticDesignRules()
    expect(rules).not.toContain('useQuery')
    expect(rules).not.toContain('tanstack/react-query')
    expect(rules).not.toContain('supabase')
  })
})
