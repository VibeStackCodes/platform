// tests/theme-metadata.test.ts
import { describe, it, expect } from 'vitest'
import {
  getThemeMetadata,
  findThemeByName,
  isThemeSuitableFor,
} from '@server/lib/agents/theme-metadata'

describe('theme-metadata', () => {
  it('returns theme metadata with use case and design type', () => {
    const metadata = getThemeMetadata()

    // Canape: website template
    const canape = metadata.find(t => t.name === 'canape')
    expect(canape).toBeDefined()
    expect(canape?.designType).toBe('website')
    expect(canape?.useCases).toContain('restaurant-website')
    expect(canape?.baseTables.length).toBeGreaterThan(0)

    // Dashboard: admin template
    const dashboard = metadata.find(t => t.name === 'dashboard')
    expect(dashboard).toBeDefined()
    expect(dashboard?.designType).toBe('admin')
    expect(dashboard?.useCases).toContain('management-system')
  })

  it('metadata is used by theme selector to avoid mismatches', () => {
    const metadata = getThemeMetadata()
    expect(metadata.length).toBeGreaterThan(0)

    // Every theme must have required fields
    metadata.forEach(theme => {
      expect(theme.name).toBeDefined()
      expect(theme.description).toBeDefined()
      expect(theme.designType).toMatch(/^(website|admin|hybrid)$/)
      expect(Array.isArray(theme.useCases)).toBe(true)
      expect(Array.isArray(theme.baseTables)).toBe(true)
    })
  })

  it('findThemeByName returns theme when found', () => {
    const canape = findThemeByName('canape')
    expect(canape).toBeDefined()
    expect(canape?.name).toBe('canape')
  })

  it('findThemeByName returns undefined for unknown theme', () => {
    const unknown = findThemeByName('nonexistent')
    expect(unknown).toBeUndefined()
  })

  it('isThemeSuitableFor returns true when theme is suitable', () => {
    const suitable = isThemeSuitableFor('canape', 'restaurant-website')
    expect(suitable).toBe(true)
  })

  it('isThemeSuitableFor returns false when theme is NOT suitable', () => {
    const notSuitable = isThemeSuitableFor('canape', 'staff-management')
    expect(notSuitable).toBe(false)
  })

  it('isThemeSuitableFor returns false for unknown theme', () => {
    const unknown = isThemeSuitableFor('nonexistent', 'any-intent')
    expect(unknown).toBe(false)
  })
})
