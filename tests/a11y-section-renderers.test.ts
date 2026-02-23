/**
 * Accessibility Tests — Section Composition Engine (50 renderers)
 *
 * Every section renderer is a pure function (SectionContext) => SectionOutput
 * that produces { jsx, imports?, hooks? }. This suite runs axe-core against the
 * JSX output of all 50 registered renderers and asserts:
 *
 *   BLOCKING  — zero `critical` or `serious` violations (test fails)
 *   ADVISORY  — `moderate` and `minor` violations are logged as warnings only
 *
 * Sections are grouped by category for readable output:
 *   hero | navigation | grid | detail | content | cta | footer | utility
 *
 * Domain-restaurant sections (domain-menu-archive, domain-menu-category,
 * domain-reservation-form, domain-services-list) are in the `domain-restaurant`
 * describe block and are treated identically.
 *
 * Rules enabled by checkA11y (see tests/helpers/axe-helper.ts):
 *   image-alt, label, heading-order, aria-roles, button-name, link-name,
 *   duplicate-id, list, listitem, aria-required-attr, aria-valid-attr,
 *   aria-valid-attr-value, aria-prohibited-attr, aria-hidden-focus,
 *   role-img-alt, input-button-name, select-name, form-field-multiple-labels
 */

import { describe, it, expect } from 'vitest'

import { SECTION_CATALOG } from '@server/lib/sections/registry'
import { getSectionRenderer } from '@server/lib/sections'
import type { SectionContext, EntityMeta, SectionCategory } from '@server/lib/sections/types'
import type { ThemeTokens } from '@server/lib/themed-code-engine'

import { checkA11y, assertNoViolations } from './helpers/axe-helper'

// ---------------------------------------------------------------------------
// Test context factory
// ---------------------------------------------------------------------------

/**
 * Build a valid SectionContext suitable for any renderer.
 *
 * Entity-bound fields (entityName, entitySlug, etc.) are always populated so
 * renderers that require an entity binding receive a coherent context. Pass
 * `overrides` to adjust for renderer-specific needs.
 */
function makeTestContext(overrides?: Partial<SectionContext>): SectionContext {
  const tokens: ThemeTokens = {
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
      primary: '#2563eb',
      primaryForeground: '#ffffff',
      secondary: '#f3f4f6',
      accent: '#dc2626',
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
    authPosture: 'public',
    heroImages: [
      {
        url: 'https://picsum.photos/1920/1080',
        alt: 'Hero image',
        photographer: 'Test',
      },
    ],
    heroQuery: 'test',
    textSlots: {
      hero_headline: 'Test Headline',
      hero_subtext: 'Test subtitle for accessibility testing.',
      about_paragraph: 'About paragraph text.',
      cta_label: 'Get started',
      empty_state: 'No items yet.',
      footer_tagline: 'Built with care.',
    },
  }

  const testEntity: EntityMeta = {
    tableName: 'recipes',
    pluralKebab: 'recipes',
    singularTitle: 'Recipe',
    pluralTitle: 'Recipes',
    displayColumn: 'title',
    imageColumn: 'image_url',
    metadataColumns: ['category', 'prep_time'],
    isPrivate: false,
  }

  return {
    tokens,
    appName: 'TestApp',
    heroImages: tokens.heroImages,
    hasAuth: false,
    entityName: 'recipes',
    entitySlug: 'recipes',
    tableName: 'recipes',
    displayColumn: 'title',
    imageColumn: 'image_url',
    metadataColumns: ['category', 'prep_time'],
    dataVar: 'recipes',
    itemVar: 'recipe',
    config: {},
    allEntities: [testEntity],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Domain-restaurant context factory
// ---------------------------------------------------------------------------

/**
 * Build a SectionContext tailored to the restaurant domain sections.
 * These sections rely on fixed table names (menu_items, reservations,
 * services_page) regardless of the generic entity fields.
 */
function makeRestaurantContext(overrides?: Partial<SectionContext>): SectionContext {
  return makeTestContext({
    tokens: {
      ...makeTestContext().tokens,
      name: 'canape',
      textSlots: {
        hero_headline: 'A Taste of Excellence',
        hero_subtext: 'Seasonal menus, artisan techniques, warm hospitality.',
        about_paragraph: 'We source the finest local ingredients.',
        cta_label: 'Make a reservation',
        empty_state: 'Menu coming soon.',
        footer_tagline: 'Crafted with passion.',
      },
    },
    entityName: 'menu_items',
    entitySlug: 'menu-items',
    tableName: 'menu_items',
    displayColumn: 'name',
    imageColumn: undefined,
    metadataColumns: ['category', 'price'],
    dataVar: 'menuItems',
    itemVar: 'menuItem',
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Shared assertion helper
// ---------------------------------------------------------------------------

/**
 * Run axe-core on renderer output and assert no critical/serious violations.
 * Logs moderate/minor violations as non-blocking warnings.
 */
async function assertSectionA11y(sectionId: string, jsx: string): Promise<void> {
  const result = await checkA11y(jsx)

  // Log advisory (non-blocking) violations
  const advisory = result.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor',
  )
  if (advisory.length > 0) {
    for (const v of advisory) {
      console.warn(
        `[a11y:${sectionId}] [${v.impact?.toUpperCase() ?? 'UNKNOWN'}] ${v.id}: ${v.description}`,
      )
    }
  }

  // Assert no blocking violations (critical + serious)
  assertNoViolations(result)
}

// ---------------------------------------------------------------------------
// Utility: filter catalog by category
// ---------------------------------------------------------------------------

function sectionsForCategory(cat: SectionCategory) {
  return SECTION_CATALOG.filter((s) => s.category === cat)
}

// ---------------------------------------------------------------------------
// Utility: build context for a section (entity vs non-entity)
// ---------------------------------------------------------------------------

function contextForSection(sectionId: string): SectionContext {
  // Domain-restaurant sections need restaurant-specific context
  if (sectionId.startsWith('domain-')) {
    return makeRestaurantContext()
  }
  return makeTestContext()
}

// ---------------------------------------------------------------------------
// 1. Heroes (6)
// ---------------------------------------------------------------------------

describe('a11y: hero sections', () => {
  const heroSections = sectionsForCategory('hero')

  for (const meta of heroSections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Navigation (4)
// ---------------------------------------------------------------------------

describe('a11y: navigation sections', () => {
  const navSections = sectionsForCategory('navigation')

  for (const meta of navSections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 3. Grid sections (8 generic + 2 domain = 10 total in catalog)
//    The 2 domain grids (domain-menu-archive, domain-menu-category) are
//    categorised as 'grid' in SECTION_CATALOG. They appear here AND in the
//    domain-restaurant group below — covered from both angles.
// ---------------------------------------------------------------------------

describe('a11y: grid sections', () => {
  const gridSections = sectionsForCategory('grid')

  for (const meta of gridSections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 4. Detail sections (5)
// ---------------------------------------------------------------------------

describe('a11y: detail sections', () => {
  const detailSections = sectionsForCategory('detail')

  for (const meta of detailSections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 5. Content sections (8 generic + 1 domain = 9 total in catalog)
//    domain-services-list is categorised as 'content' in SECTION_CATALOG.
// ---------------------------------------------------------------------------

describe('a11y: content sections', () => {
  const contentSections = sectionsForCategory('content')

  for (const meta of contentSections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 6. CTA sections (5 generic + 1 domain = 6 total in catalog)
//    domain-reservation-form is categorised as 'cta' in SECTION_CATALOG.
// ---------------------------------------------------------------------------

describe('a11y: cta sections', () => {
  const ctaSections = sectionsForCategory('cta')

  for (const meta of ctaSections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 7. Footer sections (4)
// ---------------------------------------------------------------------------

describe('a11y: footer sections', () => {
  const footerSections = sectionsForCategory('footer')

  for (const meta of footerSections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 8. Utility sections (6)
// ---------------------------------------------------------------------------

describe('a11y: utility sections', () => {
  const utilitySections = sectionsForCategory('utility')

  for (const meta of utilitySections) {
    it(`${meta.id} — zero critical/serious violations`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }
      const ctx = contextForSection(meta.id)
      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 9. Domain-restaurant sections — dedicated block with restaurant context
//    (domain-menu-archive, domain-menu-category, domain-reservation-form,
//     domain-services-list)
//    These also appear in their category groups (grid, cta, content) above.
//    This dedicated block tests them with the restaurant-appropriate context
//    and verifies domain-specific a11y concerns (form labels, list roles, etc.)
// ---------------------------------------------------------------------------

describe('a11y: domain-restaurant sections', () => {
  const domainSections = SECTION_CATALOG.filter((s) => s.tags.includes('domain-specific'))

  for (const meta of domainSections) {
    it(`${meta.id} — zero critical/serious violations (restaurant context)`, async () => {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        console.warn(`[a11y] renderer not found for "${meta.id}" — skipping`)
        return
      }

      // Build domain-appropriate context per section
      let ctx: SectionContext

      if (meta.id === 'domain-reservation-form') {
        ctx = makeRestaurantContext({
          entityName: 'reservations',
          entitySlug: 'reservations',
          tableName: 'reservations',
          displayColumn: 'name',
          metadataColumns: ['email', 'date'],
          dataVar: 'reservations',
          itemVar: 'reservation',
        })
      } else if (meta.id === 'domain-services-list') {
        ctx = makeRestaurantContext({
          entityName: 'services_page',
          entitySlug: 'services-page',
          tableName: 'services_page',
          displayColumn: 'name',
          metadataColumns: ['url', 'order_index'],
          dataVar: 'servicesPage',
          itemVar: 'service',
        })
      } else if (meta.id === 'domain-menu-category') {
        ctx = makeRestaurantContext({ config: { paramName: 'category' } })
      } else {
        // domain-menu-archive
        ctx = makeRestaurantContext()
      }

      const output = renderer(ctx)
      await assertSectionA11y(meta.id, output.jsx)
    })
  }
})

// ---------------------------------------------------------------------------
// 10. Catalog coverage guard
//     Ensures this test file covers all 50 entries in SECTION_CATALOG.
//     Fails at collection time if new renderers are added without a11y tests.
// ---------------------------------------------------------------------------

describe('a11y: catalog coverage', () => {
  it('SECTION_CATALOG has 50 entries covered by this test suite', () => {
    // The per-category describe blocks above iterate SECTION_CATALOG directly,
    // so every entry in the catalog is exercised. This test validates the total
    // count to catch regressions when renderers are added or removed.
    expect(SECTION_CATALOG).toHaveLength(50)
  })

  it('every catalog entry has a registered renderer', () => {
    const missing: string[] = []
    for (const meta of SECTION_CATALOG) {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) {
        missing.push(meta.id)
      }
    }
    expect(
      missing,
      `The following catalog entries have no registered renderer: ${missing.join(', ')}`,
    ).toHaveLength(0)
  })

  it('every renderer produces a non-empty jsx string without throwing', () => {
    const failed: string[] = []
    for (const meta of SECTION_CATALOG) {
      const renderer = getSectionRenderer(meta.id)
      if (!renderer) continue

      const ctx = meta.id.startsWith('domain-')
        ? makeRestaurantContext()
        : makeTestContext()

      try {
        const output = renderer(ctx)
        if (!output.jsx || output.jsx.trim().length === 0) {
          failed.push(`${meta.id} (empty jsx)`)
        }
      } catch (err) {
        failed.push(`${meta.id} (threw: ${err instanceof Error ? err.message : String(err)})`)
      }
    }

    expect(
      failed,
      `The following renderers failed or produced empty jsx:\n${failed.join('\n')}`,
    ).toHaveLength(0)
  })
})
