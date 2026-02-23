/**
 * Section Composition Engine — Comprehensive Tests
 *
 * Covers:
 *   1. Section Registry         (~8 tests)
 *   2. Section Renderers        (~10 tests)
 *   3. Composition Plan Validation (~6 tests)
 *   4. Page Assembler           (~5 tests)
 *   5. Fallback Plan            (~3 tests)
 */

import { describe, it, expect } from 'vitest'

// Registry
import {
  SECTION_CATALOG,
  getSectionMeta,
  getSectionsByCategory,
  getSectionsByTag,
  buildComposerCatalogPrompt,
} from '@server/lib/sections/registry'

// Types & IDs
import { SECTION_IDS } from '@server/lib/sections/types'
import type { SectionContext, EntityMeta } from '@server/lib/sections/types'
import type { ThemeTokens } from '@server/lib/themed-code-engine'

// Renderer lookup
import { getSectionRenderer } from '@server/lib/sections'

// Composition plan validation + fallback
import {
  validateCompositionPlan,
  fallbackCompositionPlan,
} from '@server/lib/page-composer'

// Page assembler
import { assemblePages } from '@server/lib/page-assembler'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseTokens: ThemeTokens = {
  name: 'test-theme',
  fonts: {
    display: 'Playfair Display',
    body: 'Inter',
    googleFontsUrl: '',
  },
  colors: {
    background: '#ffffff',
    foreground: '#000000',
    text: '#000000',
    primary: '#3b82f6',
    primaryForeground: '#ffffff',
    secondary: '#6b7280',
    accent: '#f59e0b',
    muted: '#f3f4f6',
    border: '#e5e7eb',
  },
  style: {
    borderRadius: '0.5rem',
    cardStyle: 'elevated',
    navStyle: 'top-bar',
    heroLayout: 'fullbleed',
    spacing: 'normal',
    motion: 'subtle',
    imagery: 'photography-heavy',
  },
  aestheticDirection: 'warm-neutral' as const,
  layoutStrategy: 'full-bleed' as const,
  signatureDetail: 'Subtle scroll-triggered reveal animations on content sections',
  imageManifest: {},
  authPosture: 'hybrid',
  heroImages: [{ url: 'https://picsum.photos/1920/1080', alt: 'Hero', photographer: 'Test' }],
  heroQuery: 'food',
  textSlots: {
    hero_headline: 'Welcome',
    hero_subtext: 'A great app',
    about_paragraph: 'About us',
    cta_label: 'Get Started',
    empty_state: 'No items yet',
    footer_tagline: 'Built with care',
  },
}

const baseEntities: EntityMeta[] = [
  {
    tableName: 'recipes',
    pluralKebab: 'recipes',
    singularTitle: 'Recipe',
    pluralTitle: 'Recipes',
    displayColumn: 'title',
    imageColumn: 'image_url',
    metadataColumns: ['prep_time', 'difficulty'],
    isPrivate: false,
  },
  {
    tableName: 'categories',
    pluralKebab: 'categories',
    singularTitle: 'Category',
    pluralTitle: 'Categories',
    displayColumn: 'name',
    imageColumn: null,
    metadataColumns: [],
    isPrivate: false,
  },
]

/** Base section context for non-entity sections */
const baseCtx: SectionContext = {
  tokens: baseTokens,
  appName: 'TestApp',
  heroImages: [{ url: 'https://picsum.photos/1920/1080', alt: 'Hero', photographer: 'Test' }],
  hasAuth: true,
  config: {},
  allEntities: baseEntities,
}

/** Entity-bound section context (bound to recipes) */
const entityCtx: SectionContext = {
  ...baseCtx,
  entityName: 'recipes',
  entitySlug: 'recipes',
  tableName: 'recipes',
  displayColumn: 'title',
  imageColumn: 'image_url',
  metadataColumns: ['prep_time', 'difficulty'],
  dataVar: 'recipes',
  itemVar: 'recipe',
}

// ---------------------------------------------------------------------------
// 1. Section Registry
// ---------------------------------------------------------------------------

describe('Section Registry', () => {
  it('SECTION_CATALOG has 50 entries', () => {
    expect(SECTION_CATALOG).toHaveLength(50)
  })

  it('every section has required fields that are non-empty', () => {
    for (const section of SECTION_CATALOG) {
      expect(section.id, `section ${section.id} — id must be non-empty`).toBeTruthy()
      expect(section.category, `section ${section.id} — category must be non-empty`).toBeTruthy()
      expect(section.description, `section ${section.id} — description must be non-empty`).toBeTruthy()
      expect(Array.isArray(section.tags), `section ${section.id} — tags must be an array`).toBe(true)
      expect(section.tags.length, `section ${section.id} — tags must not be empty`).toBeGreaterThan(0)
    }
  })

  it('getSectionMeta returns correct metadata for hero-fullbleed', () => {
    const meta = getSectionMeta('hero-fullbleed')
    expect(meta).toBeDefined()
    expect(meta?.id).toBe('hero-fullbleed')
    expect(meta?.category).toBe('hero')
    expect(meta?.requiresEntity).toBe(false)
    expect(meta?.tags).toContain('editorial')
    expect(meta?.tags).toContain('photography-heavy')
  })

  it('getSectionMeta returns correct metadata for grid-masonry', () => {
    const meta = getSectionMeta('grid-masonry')
    expect(meta).toBeDefined()
    expect(meta?.id).toBe('grid-masonry')
    expect(meta?.category).toBe('grid')
    expect(meta?.requiresEntity).toBe(true)
    expect(meta?.requiredColumns).toContain('image')
  })

  it('getSectionsByCategory returns correct groups', () => {
    const heroes = getSectionsByCategory('hero')
    const grids = getSectionsByCategory('grid')
    const navs = getSectionsByCategory('navigation')
    const details = getSectionsByCategory('detail')
    const content = getSectionsByCategory('content')
    const ctas = getSectionsByCategory('cta')
    const footers = getSectionsByCategory('footer')
    const utils = getSectionsByCategory('utility')

    expect(heroes).toHaveLength(6)
    expect(grids).toHaveLength(10) // 8 generic + 2 domain-restaurant (menu-archive, menu-category)
    expect(navs).toHaveLength(4)
    expect(details).toHaveLength(5)
    expect(content).toHaveLength(9) // 8 generic + 1 domain-restaurant (services-list)
    expect(ctas).toHaveLength(6) // 5 generic + 1 domain-restaurant (reservation-form)
    expect(footers).toHaveLength(4)
    expect(utils).toHaveLength(6)
  })

  it("getSectionsByTag('editorial') finds multiple sections", () => {
    const editorial = getSectionsByTag('editorial')
    expect(editorial.length).toBeGreaterThanOrEqual(3)
    // Should include hero-editorial, nav-editorial, grid-magazine at minimum
    const ids = editorial.map((s) => s.id)
    expect(ids).toContain('hero-editorial')
  })

  it('all SECTION_IDS constants are present in catalog', () => {
    const catalogIds = new Set(SECTION_CATALOG.map((s) => s.id))
    for (const [key, id] of Object.entries(SECTION_IDS)) {
      expect(catalogIds.has(id), `SECTION_IDS.${key} = "${id}" must be in catalog`).toBe(true)
    }
  })

  it('incompatibleWith references only valid section IDs', () => {
    const allIds = new Set(SECTION_CATALOG.map((s) => s.id))
    for (const section of SECTION_CATALOG) {
      for (const incompatId of section.incompatibleWith ?? []) {
        expect(
          allIds.has(incompatId),
          `section "${section.id}" incompatibleWith "${incompatId}" — ID not in catalog`,
        ).toBe(true)
      }
    }
  })

  it('buildComposerCatalogPrompt produces non-empty string containing section IDs', () => {
    const prompt = buildComposerCatalogPrompt()
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(200)
    // Spot-check that the prompt includes known section IDs
    expect(prompt).toContain('hero-fullbleed')
    expect(prompt).toContain('grid-masonry')
    expect(prompt).toContain('footer-minimal')
    // And the heading
    expect(prompt).toContain('## Available Sections')
  })
})

// ---------------------------------------------------------------------------
// 2. Section Renderers
// ---------------------------------------------------------------------------

describe('Section Renderers', () => {
  it('all 46 section renderers are registered', () => {
    for (const [key, id] of Object.entries(SECTION_IDS)) {
      const renderer = getSectionRenderer(id)
      expect(renderer, `SECTION_IDS.${key} = "${id}" must have a registered renderer`).toBeDefined()
      expect(typeof renderer).toBe('function')
    }
  })

  it('hero-fullbleed produces valid JSX with hero image and headline', () => {
    const renderer = getSectionRenderer('hero-fullbleed')
    expect(renderer).toBeDefined()
    const output = renderer?.(baseCtx)
    expect(output?.jsx).toBeTruthy()
    // Must contain the full-screen height classes
    expect(output?.jsx).toMatch(/h-\[70vh\]|min-h-/)
    // Must include the hero image URL
    expect(output?.jsx).toContain('https://picsum.photos/1920/1080')
    // Must include the headline text
    expect(output?.jsx).toContain('Welcome')
  })

  it('hero-split produces two-column grid layout', () => {
    const renderer = getSectionRenderer('hero-split')
    expect(renderer).toBeDefined()
    const output = renderer?.(baseCtx)
    // Must contain a two-column grid breakpoint class
    expect(output?.jsx).toMatch(/md:grid-cols-2|grid-cols-2/)
  })

  it('grid-masonry produces CSS columns layout', () => {
    const renderer = getSectionRenderer('grid-masonry')
    expect(renderer).toBeDefined()
    const output = renderer?.(entityCtx)
    expect(output?.jsx).toMatch(/columns-2|columns-3|md:columns-3/)
    // Must produce hooks with useQuery
    expect(output?.hooks).toBeDefined()
    expect((output?.hooks ?? []).length).toBeGreaterThan(0)
    const hooksStr = (output?.hooks ?? []).join('\n')
    expect(hooksStr).toContain('useQuery')
  })

  it('grid-cards-3col produces 3-column grid', () => {
    const renderer = getSectionRenderer('grid-cards-3col')
    expect(renderer).toBeDefined()
    const output = renderer?.(entityCtx)
    expect(output?.jsx).toMatch(/grid-cols-3|lg:grid-cols-3/)
  })

  it('detail-article produces max-w-3xl centered content', () => {
    const renderer = getSectionRenderer('detail-article')
    expect(renderer).toBeDefined()
    const output = renderer?.(entityCtx)
    expect(output?.jsx).toContain('max-w-3xl')
  })

  it('content-featured includes useQuery hook', () => {
    const renderer = getSectionRenderer('content-featured')
    expect(renderer).toBeDefined()
    const output = renderer?.(entityCtx)
    expect(output?.hooks).toBeDefined()
    expect((output?.hooks ?? []).length).toBeGreaterThan(0)
    const hooksStr = (output?.hooks ?? []).join('\n')
    expect(hooksStr).toContain('useQuery')
  })

  it('footer-minimal includes copyright expression', () => {
    const renderer = getSectionRenderer('footer-minimal')
    expect(renderer).toBeDefined()
    const output = renderer?.(baseCtx)
    // Must contain the copyright symbol or the appName
    expect(output?.jsx).toMatch(/©|&copy;|TestApp/)
  })

  it('nav-topbar includes skip-to-content link for accessibility', () => {
    const renderer = getSectionRenderer('nav-topbar')
    expect(renderer).toBeDefined()
    const output = renderer?.(baseCtx)
    // Must contain skip-to-content or sr-only
    expect(output?.jsx).toMatch(/Skip to content|sr-only/)
  })

  it('non-entity sections work when entity fields are undefined', () => {
    // These sections must not throw when called without entity binding fields
    const nonEntitySections = [
      'hero-fullbleed',
      'hero-split',
      'hero-centered',
      'hero-gradient',
      'footer-minimal',
      'footer-centered',
      'cta-newsletter',
      'cta-contact',
      'content-stats',
      'content-faq',
    ] as const

    for (const id of nonEntitySections) {
      const renderer = getSectionRenderer(id)
      expect(renderer, `renderer for "${id}" must exist`).toBeDefined()
      if (renderer) {
        expect(
          () => renderer(baseCtx),
          `renderer for "${id}" must not throw with no entity fields`,
        ).not.toThrow()
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Composition Plan Validation
// ---------------------------------------------------------------------------

describe('Composition Plan Validation', () => {
  it('valid plan passes validation', () => {
    const plan = {
      pages: {
        '/': [
          { sectionId: 'nav-topbar' },
          { sectionId: 'hero-fullbleed' },
          { sectionId: 'content-featured', entityBinding: 'recipes' },
          { sectionId: 'footer-minimal' },
        ],
        '/recipes/': [
          { sectionId: 'nav-topbar' },
          { sectionId: 'grid-cards-3col', entityBinding: 'recipes' },
          { sectionId: 'footer-minimal' },
        ],
        '/recipes/$id': [
          { sectionId: 'nav-topbar' },
          { sectionId: 'detail-article', entityBinding: 'recipes' },
          { sectionId: 'footer-minimal' },
        ],
      },
    }

    const result = validateCompositionPlan(plan, baseEntities)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('unknown section ID fails validation with descriptive error', () => {
    const plan = {
      pages: {
        '/': [
          { sectionId: 'nav-topbar' },
          { sectionId: 'nonexistent-section' },
          { sectionId: 'footer-minimal' },
        ],
      },
    }

    const result = validateCompositionPlan(plan, baseEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => e.includes('nonexistent-section'))).toBe(true)
  })

  it('unknown entity binding fails validation with descriptive error', () => {
    const plan = {
      pages: {
        '/products/': [
          { sectionId: 'nav-topbar' },
          { sectionId: 'grid-cards-3col', entityBinding: 'nonexistent_table' },
          { sectionId: 'footer-minimal' },
        ],
      },
    }

    const result = validateCompositionPlan(plan, baseEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('nonexistent_table'))).toBe(true)
  })

  it('two heroes on same page fails validation', () => {
    const plan = {
      pages: {
        '/': [
          { sectionId: 'hero-fullbleed' },
          { sectionId: 'hero-split' },
          { sectionId: 'footer-minimal' },
        ],
      },
    }

    const result = validateCompositionPlan(plan, baseEntities)
    expect(result.valid).toBe(false)
    // Either the hero count error or the incompatible error should fire
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('two footers on same page fails validation', () => {
    const plan = {
      pages: {
        '/': [
          { sectionId: 'hero-fullbleed' },
          { sectionId: 'footer-minimal' },
          { sectionId: 'footer-centered' },
        ],
      },
    }

    const result = validateCompositionPlan(plan, baseEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fallbackCompositionPlan produces a valid plan for given entities', () => {
    const plan = fallbackCompositionPlan(baseEntities, baseTokens)
    const result = validateCompositionPlan(plan, baseEntities)

    if (!result.valid) {
      // Helpful diagnostic on unexpected failures
      console.error('[test] fallback plan validation errors:', result.errors)
    }

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 4. Page Assembler
// ---------------------------------------------------------------------------

describe('Page Assembler', () => {
  const plan = fallbackCompositionPlan(baseEntities, baseTokens)
  const assembled = assemblePages(plan, baseEntities, baseTokens, 'TestApp')

  it('assemblePages produces files for all plan routes', () => {
    const expectedFiles = [
      'src/routes/index.tsx',
      'src/routes/recipes/index.tsx',
      'src/routes/recipes/$id.tsx',
      'src/routes/categories/index.tsx',
      'src/routes/categories/$id.tsx',
    ]

    for (const expected of expectedFiles) {
      expect(
        assembled,
        `expected assembled output to contain "${expected}"`,
      ).toHaveProperty(expected)
    }
  })

  it('route files contain valid createFileRoute calls', () => {
    for (const [filePath, content] of Object.entries(assembled)) {
      expect(
        content,
        `"${filePath}" must contain createFileRoute`,
      ).toContain('createFileRoute')
    }
  })

  it('route files have deduplicated import lines', () => {
    for (const [filePath, content] of Object.entries(assembled)) {
      const lines = content.split('\n')
      const importLines = lines.filter((l) => l.startsWith('import '))
      const uniqueImportLines = new Set(importLines)
      expect(
        importLines.length,
        `"${filePath}" must not have duplicate import lines (found ${importLines.length}, unique ${uniqueImportLines.size})`,
      ).toBe(uniqueImportLines.size)
    }
  })

  it('homepage file contains hero JSX', () => {
    const homepage = assembled['src/routes/index.tsx']
    expect(homepage).toBeDefined()
    // The fallback plan places a hero section on the homepage
    // hero-fullbleed emits 'h-[70vh]', hero-split emits 'md:grid-cols-2', etc.
    expect(homepage).toMatch(/h-\[70vh\]|hero|min-h-|hero_headline|Welcome/)
  })

  it('entity list files contain supabase query', () => {
    const recipesPage = assembled['src/routes/recipes/index.tsx']
    expect(recipesPage).toBeDefined()
    // All grid sections emit a supabase.from() call in their hooks
    expect(recipesPage).toContain('supabase')
    expect(recipesPage).toMatch(/supabase\.from\(|from\('recipes'\)/)
  })
})

// ---------------------------------------------------------------------------
// 5. Fallback Plan Variants
// ---------------------------------------------------------------------------

describe('Fallback Plan Variants', () => {
  it('editorial theme tokens produce editorial sections in fallback', () => {
    const editorialTokens: ThemeTokens = {
      ...baseTokens,
      style: {
        ...baseTokens.style,
        navStyle: 'editorial',
        heroLayout: 'editorial',
        imagery: 'photography-heavy',
      },
    }

    const plan = fallbackCompositionPlan(baseEntities, editorialTokens)

    // Homepage should have nav-editorial
    const homeSlots = plan.pages['/'] ?? []
    const slotIds = homeSlots.map((s) => s.sectionId)
    expect(slotIds).toContain('nav-editorial')
    // Editorial heroLayout → hero-editorial
    expect(slotIds).toContain('hero-editorial')
  })

  it('photography-heavy imagery produces masonry grid for list pages', () => {
    const photographyTokens: ThemeTokens = {
      ...baseTokens,
      style: {
        ...baseTokens.style,
        imagery: 'photography-heavy',
      },
    }

    const plan = fallbackCompositionPlan(baseEntities, photographyTokens)

    // List page for recipes should contain grid-masonry
    const recipesSlots = plan.pages['/recipes/'] ?? []
    const gridSlot = recipesSlots.find((s) => s.sectionId.startsWith('grid-'))
    expect(gridSlot).toBeDefined()
    expect(gridSlot?.sectionId).toBe('grid-masonry')
  })

  it('sidebar navStyle produces nav-sidebar in fallback', () => {
    const dashboardTokens: ThemeTokens = {
      ...baseTokens,
      style: {
        ...baseTokens.style,
        navStyle: 'sidebar',
        heroLayout: 'split',
      },
    }

    const plan = fallbackCompositionPlan(baseEntities, dashboardTokens)

    // Every page should have nav-sidebar as first-or-early slot
    for (const [route, slots] of Object.entries(plan.pages)) {
      const slotIds = slots.map((s) => s.sectionId)
      expect(
        slotIds,
        `route "${route}" should contain nav-sidebar for sidebar navStyle`,
      ).toContain('nav-sidebar')
    }
  })
})
