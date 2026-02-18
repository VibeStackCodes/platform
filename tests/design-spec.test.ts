import { describe, it, expect } from 'vitest'
import { deriveDesignSpec, designSpecToFontCSS } from '@server/lib/design-spec'
import type { SchemaContract, DesignPreferences } from '@server/lib/schema-contract'

const BASE_PREFS: DesignPreferences = {
  style: 'modern',
  primaryColor: '#f43f5e',
  fontFamily: 'Inter',
}

function makeContract(tableNames: string[]): SchemaContract {
  return {
    tables: tableNames.map((name) => ({
      name,
      columns: [
        { name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
      ],
    })),
  }
}

describe('deriveDesignSpec', () => {
  it('identifies storefront archetype from recipe entity', () => {
    const spec = deriveDesignSpec(makeContract(['recipe', 'ingredient']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('storefront')
  })

  it('identifies editorial archetype from blog entity', () => {
    const spec = deriveDesignSpec(makeContract(['post', 'author']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('editorial')
  })

  it('identifies dashboard archetype from transaction entity', () => {
    const spec = deriveDesignSpec(makeContract(['transaction', 'account']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('dashboard')
  })

  it('identifies kanban archetype from task entity', () => {
    const spec = deriveDesignSpec(makeContract(['project', 'task']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('kanban')
  })

  it('identifies schedule archetype from appointment entity', () => {
    const spec = deriveDesignSpec(makeContract(['appointment', 'doctor']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('schedule')
  })

  it('falls back to directory archetype for unknown entities', () => {
    const spec = deriveDesignSpec(makeContract(['widget', 'gadget']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('directory')
  })

  it('derives editorial font pair for editorial archetype', () => {
    const spec = deriveDesignSpec(makeContract(['article']), BASE_PREFS)
    expect(spec.fontPair.name).toBe('editorial-serif')
  })

  it('includes entity layouts for each table', () => {
    const spec = deriveDesignSpec(makeContract(['recipe', 'ingredient']), BASE_PREFS)
    expect(spec.entityLayouts).toHaveProperty('recipe')
    expect(spec.entityLayouts).toHaveProperty('ingredient')
  })

  it('storefront archetype uses CardGrid + ProductDetail', () => {
    const spec = deriveDesignSpec(makeContract(['recipe']), BASE_PREFS)
    expect(spec.entityLayouts['recipe'].listSkill).toBe('CardGrid')
    expect(spec.entityLayouts['recipe'].detailSkill).toBe('ProductDetail')
  })

  it('dashboard archetype has hasDashboard=true', () => {
    const spec = deriveDesignSpec(makeContract(['transaction']), BASE_PREFS)
    expect(spec.entityLayouts['transaction'].hasDashboard).toBe(true)
  })

  it('sets heroImageQuery matching archetype', () => {
    const spec = deriveDesignSpec(makeContract(['recipe']), BASE_PREFS)
    expect(spec.heroImageQuery).toBeTruthy()
    expect(typeof spec.heroImageQuery).toBe('string')
  })

  it('ignores tables starting with underscore', () => {
    const spec = deriveDesignSpec(makeContract(['_junction', 'recipe']), BASE_PREFS)
    expect(spec.entityLayouts).not.toHaveProperty('_junction')
    expect(spec.entityLayouts).toHaveProperty('recipe')
  })
})

describe('designSpecToFontCSS', () => {
  it('generates @import + :root CSS for font pair', () => {
    const spec = deriveDesignSpec(makeContract(['article']), BASE_PREFS)
    const css = designSpecToFontCSS(spec)
    expect(css).toContain('@import url(')
    expect(css).toContain('--font-display')
    expect(css).toContain('--font-body')
    expect(css).toContain('Playfair Display')
  })

  it('generates different font CSS for different archetypes', () => {
    const editorialSpec = deriveDesignSpec(makeContract(['article']), BASE_PREFS)
    const dashboardSpec = deriveDesignSpec(makeContract(['transaction']), BASE_PREFS)
    const editorialCSS = designSpecToFontCSS(editorialSpec)
    const dashboardCSS = designSpecToFontCSS(dashboardSpec)
    expect(editorialCSS).not.toEqual(dashboardCSS)
  })
})
