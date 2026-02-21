import { describe, it, expect } from 'vitest'
import { validateCompositionPlanV2 } from '@server/lib/page-composer'
import type { EntityMeta, PageCompositionPlanV2 } from '@server/lib/sections/types'

const testEntities: EntityMeta[] = [
  {
    tableName: 'recipes',
    pluralKebab: 'recipes',
    singularTitle: 'Recipe',
    pluralTitle: 'Recipes',
    displayColumn: 'title',
    imageColumn: 'image_url',
    metadataColumns: ['category', 'prep_time'],
    isPrivate: false,
  },
]

describe('validateCompositionPlanV2', () => {
  it('accepts valid plan', () => {
    const plan: PageCompositionPlanV2 = {
      globalNav: 'nav-editorial',
      globalFooter: 'footer-multi-column',
      routes: [
        {
          path: '/',
          sections: [
            { sectionId: 'hero-fullbleed', background: 'dark-overlay', spacing: 'generous', showBadges: true, showMetadata: true },
            { sectionId: 'content-featured', entityBinding: 'recipes', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true },
          ],
        },
        {
          path: '/recipes/',
          sections: [
            { sectionId: 'grid-magazine', entityBinding: 'recipes', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true },
          ],
        },
        {
          path: '/recipes/$slug',
          sections: [
            { sectionId: 'detail-article', entityBinding: 'recipes', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true },
          ],
        },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects plan missing homepage', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/recipes/', sections: [{ sectionId: 'grid-cards-3col', entityBinding: 'recipes', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('homepage'))).toBe(true)
  })

  it('rejects section with missing entityBinding when required', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'grid-masonry', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('entityBinding'))).toBe(true)
  })

  it('rejects duplicate hero on same page', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        {
          path: '/',
          sections: [
            { sectionId: 'hero-fullbleed', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true },
            { sectionId: 'hero-split', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true },
          ],
        },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('hero'))).toBe(true)
  })

  it('rejects unknown entityBinding', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'grid-cards-3col', entityBinding: 'nonexistent', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('nonexistent'))).toBe(true)
  })

  it('rejects list page without grid section', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'hero-fullbleed', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true }] },
        { path: '/recipes/', sections: [{ sectionId: 'content-stats', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('grid'))).toBe(true)
  })

  it('rejects detail page without detail section', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'hero-fullbleed', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true }] },
        { path: '/recipes/$slug', sections: [{ sectionId: 'content-stats', background: 'default', spacing: 'normal', showBadges: true, showMetadata: true }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('detail'))).toBe(true)
  })
})
