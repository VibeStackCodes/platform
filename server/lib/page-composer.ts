/**
 * Page Composition Planner — LLM-powered section layout for generated apps.
 *
 * Takes entity shapes + theme tokens and produces a PageCompositionPlan
 * mapping each route path to an ordered list of section slots.
 *
 * Architecture: Two-stage structured output (HN consensus pattern)
 *   Stage 1: Free-form LLM reasoning about what sections fit each page
 *   Stage 2: Cheap model (gpt-5-nano via 'composer' role) formats to JSON Schema
 */
import { Agent } from '@mastra/core/agent'
import { createAgentModelResolver } from './agents/provider'
import { PageCompositionPlanV2Schema } from './agents/schemas'
import type { ThemeTokens } from './themed-code-engine'
import type { EntityMeta, PageCompositionPlan, PageCompositionPlanV2, SectionSlot } from './sections/types'
import { SECTION_CATALOG, buildComposerCatalogPrompt, getSectionMeta } from './sections/registry'

// ---------------------------------------------------------------------------
// V2 Composer agent (singleton — created once, reused across calls)
// ---------------------------------------------------------------------------

const composerAgentV2 = new Agent({
  id: 'page-composer-v2',
  name: 'page-composer-v2',
  instructions: `You are an expert web page layout composer. Given entity shapes, theme style, and a section catalog, you compose a complete app layout as a PageCompositionPlanV2.

## Your Output Format
You return a JSON object with:
- routes: Array of { path, sections[] } — every page in the app
- globalNav: One nav section ID prepended to every route (pick from: nav-topbar, nav-sidebar, nav-editorial, nav-mega)
- globalFooter: One footer section ID appended to every route (pick from: footer-dark-photo, footer-minimal, footer-multi-column, footer-centered)

## Section Visual Specs
Each section has visual properties from closed vocabularies:
- sectionId: exact ID from the catalog (50 options)
- entityBinding: table name for data-driven sections (REQUIRED for grid/detail/content-featured)
- background: "default" | "muted" | "muted-strong" | "accent" | "dark" | "dark-overlay" | "gradient-down" | "gradient-up"
- spacing: "compact" | "normal" | "generous"
- cardVariant: "elevated" | "flat" | "glass" | "image-overlay" (only for card-based sections)
- gridColumns: "2" | "3" | "4" (only for grid sections)
- imageAspect: "video" | "square" | "4/3" | "3/2" | "21/9" (only for image sections)
- showBadges: boolean (show category badges)
- showMetadata: boolean (show dates/counts)
- text: { headline?, subtext?, buttonLabel?, emptyStateMessage? }
- limit: 1-24 (max items for grids)

## Visual Rhythm Rules
1. Alternate backgrounds on the homepage: default → muted → default → accent → default
2. Heroes always use "generous" spacing and "dark-overlay" or "gradient-down" background
3. CTAs use "accent" or "muted" background to stand out
4. Grid sections default to "normal" spacing with "3" columns
5. Detail pages use "compact" spacing for dense info

## Route Architecture
- Use domain language for routes: "/journal/" not "/posts/", "/menu/" not "/menu-items/"
- Homepage: hero + 1-2 content sections + CTA + optional utility
- List pages: utility (search/filter) + grid + optional pagination
- Detail pages: 1 detail section
- Maximum 8 sections per route (excluding globalNav/globalFooter)
- Only 1 hero per route

## Composition Rules
- Every app must have a "/" homepage route
- Each public entity needs a list and detail route
- entityBinding REQUIRED for: all grid-*, detail-*, content-featured, util-category-scroll, util-filter-tabs, util-search-header, util-pagination
- Match section style to theme: editorial themes → editorial sections, data-heavy → table/data-dense sections
- Photography-heavy → masonry/bento grids, image-overlay cards
- Minimal imagery → list-editorial grids, flat cards`,
  model: createAgentModelResolver('composer'),
  defaultOptions: { modelSettings: { temperature: 0.3 } },
})

// ---------------------------------------------------------------------------
// V2 Public API
// ---------------------------------------------------------------------------

/**
 * V2 LLM-driven page composition. Uses gpt-5.2 with closed-vocabulary visual specs.
 * NO FALLBACKS — if LLM fails or output is invalid, this THROWS.
 */
export async function composeSectionsV2(
  entities: EntityMeta[],
  tokens: ThemeTokens,
  appDescription: string,
): Promise<PageCompositionPlanV2> {
  const prompt = buildComposerPromptV2(entities, tokens, appDescription)

  const result = await composerAgentV2.generate(prompt, {
    structuredOutput: { schema: PageCompositionPlanV2Schema },
  })

  // Parse — throws if LLM returned garbage
  const plan = PageCompositionPlanV2Schema.parse(result.object ?? result)

  // Validate — throws if plan violates composition rules
  const validation = validateCompositionPlanV2(plan, entities)
  if (!validation.valid) {
    throw new Error(
      `[page-composer] V2 plan failed validation:\n${validation.errors.join('\n')}`,
    )
  }

  return plan
}

/**
 * Validates a V2 composition plan against known sections and entity names.
 * Returns specific error messages for each violation.
 * Exported for use in tests.
 */
export function validateCompositionPlanV2(
  plan: PageCompositionPlanV2,
  entities: EntityMeta[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const entityNames = new Set(entities.map((e) => e.tableName))
  const catalogIds = new Set(SECTION_CATALOG.map((s) => s.id))

  // Must have homepage
  if (!plan.routes.some((r) => r.path === '/')) {
    errors.push('Plan must include a "/" homepage route')
  }

  for (const route of plan.routes) {
    if (route.sections.length === 0) {
      errors.push(`Route "${route.path}": must have at least 1 section`)
      continue
    }

    let heroCount = 0
    const sectionIdsOnPage: string[] = []

    for (const spec of route.sections) {
      if (!catalogIds.has(spec.sectionId)) {
        errors.push(`Route "${route.path}": unknown section ID "${spec.sectionId}"`)
        continue
      }

      const meta = getSectionMeta(spec.sectionId)
      if (!meta) continue

      if (meta.category === 'hero') heroCount++

      // Validate entity binding
      if (meta.requiresEntity && !spec.entityBinding) {
        errors.push(
          `Route "${route.path}": section "${spec.sectionId}" requires entityBinding but none provided`,
        )
      }
      if (spec.entityBinding && !entityNames.has(spec.entityBinding)) {
        errors.push(
          `Route "${route.path}": section "${spec.sectionId}" entityBinding "${spec.entityBinding}" is not a known entity`,
        )
      }

      sectionIdsOnPage.push(spec.sectionId)
    }

    if (heroCount > 1) {
      errors.push(`Route "${route.path}": ${heroCount} hero sections — only 1 allowed per page`)
    }

    // Check incompatibility constraints
    for (const spec of route.sections) {
      const meta = getSectionMeta(spec.sectionId)
      if (!meta?.incompatibleWith) continue
      for (const incompatId of meta.incompatibleWith) {
        if (sectionIdsOnPage.includes(incompatId)) {
          errors.push(
            `Route "${route.path}": incompatible sections "${spec.sectionId}" and "${incompatId}" on same page`,
          )
        }
      }
    }

    // List pages must have at least 1 grid section
    const isListPage = route.path.endsWith('/') && route.path !== '/'
    if (isListPage) {
      const hasGrid = route.sections.some((s) => {
        const meta = getSectionMeta(s.sectionId)
        return meta?.category === 'grid'
      })
      if (!hasGrid) {
        errors.push(`Route "${route.path}": list page must have at least 1 grid section`)
      }
    }

    // Detail pages must have at least 1 detail section
    const isDetailPage = route.path.includes('/$')
    if (isDetailPage) {
      const hasDetail = route.sections.some((s) => {
        const meta = getSectionMeta(s.sectionId)
        return meta?.category === 'detail'
      })
      if (!hasDetail) {
        errors.push(`Route "${route.path}": detail page must have at least 1 detail section`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// V2 Prompt builder (internal)
// ---------------------------------------------------------------------------

function buildComposerPromptV2(
  entities: EntityMeta[],
  tokens: ThemeTokens,
  appDescription: string,
): string {
  const publicEntities = entities.filter((e) => !e.isPrivate)
  const privateEntities = entities.filter((e) => e.isPrivate)

  const entityLines = publicEntities
    .map((e) => {
      const cols = [`displayColumn: ${e.displayColumn ?? 'id'}`]
      if (e.imageColumn) cols.push(`imageColumn: ${e.imageColumn}`)
      if (e.metadataColumns.length > 0) cols.push(`metadataColumns: [${e.metadataColumns.join(', ')}]`)
      return `  - ${e.tableName} (${e.pluralKebab}/) — ${cols.join(', ')}`
    })
    .join('\n')

  const privateEntityLines =
    privateEntities.length > 0
      ? `\nPrivate entities (admin only, do NOT generate public routes for these):\n${privateEntities.map((e) => `  - ${e.tableName}`).join('\n')}`
      : ''

  const themeStyle = [
    `navStyle: ${tokens.style.navStyle}`,
    `heroLayout: ${tokens.style.heroLayout}`,
    `cardStyle: ${tokens.style.cardStyle}`,
    `imagery: ${tokens.style.imagery}`,
    `spacing: ${tokens.style.spacing}`,
    `motion: ${tokens.style.motion}`,
  ].join(', ')

  const catalogPrompt = buildComposerCatalogPrompt()

  return `## App
${appDescription}

## Theme: ${tokens.name}
Style: ${themeStyle}

## Public Entities
${entityLines || '  (none — homepage only)'}
${privateEntityLines}

${catalogPrompt}

## Required Routes
- "/" — homepage (hero + content + CTA)
${publicEntities.map((e) => `- "/${e.pluralKebab}/" — ${e.pluralTitle} list\n- "/${e.pluralKebab}/$id" — ${e.singularTitle} detail`).join('\n')}

Compose a PageCompositionPlanV2 with globalNav, globalFooter, and routes.
Use domain language for paths. Alternate backgrounds for visual rhythm.
Match section style to theme tokens.`
}

/**
 * Validates a composition plan against known sections and entity names.
 * Returns specific error messages for each violation.
 */
export function validateCompositionPlan(
  plan: PageCompositionPlan,
  entities: EntityMeta[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const entityNames = new Set(entities.map((e) => e.tableName))
  const catalogIds = new Set(SECTION_CATALOG.map((s) => s.id))

  for (const [route, slots] of Object.entries(plan.pages)) {
    if (slots.length === 0) {
      errors.push(`Route "${route}": must have at least 1 section`)
      continue
    }

    if (slots.length > 8) {
      errors.push(`Route "${route}": ${slots.length} sections exceeds maximum of 8`)
    }

    let heroCount = 0
    let footerCount = 0
    const sectionIdsOnPage: string[] = []

    for (const slot of slots) {
      // Validate section ID exists in catalog
      if (!catalogIds.has(slot.sectionId)) {
        errors.push(`Route "${route}": unknown section ID "${slot.sectionId}"`)
        continue
      }

      const meta = getSectionMeta(slot.sectionId)
      // meta is guaranteed non-undefined here — we checked catalogIds.has() above
      if (!meta) continue

      // Count heroes and footers
      if (meta.category === 'hero') heroCount++
      if (meta.category === 'footer') footerCount++

      // Validate entity binding
      if (meta.requiresEntity && !slot.entityBinding) {
        errors.push(
          `Route "${route}": section "${slot.sectionId}" requires entityBinding but none provided`,
        )
      }
      if (slot.entityBinding && !entityNames.has(slot.entityBinding)) {
        errors.push(
          `Route "${route}": section "${slot.sectionId}" entityBinding "${slot.entityBinding}" is not a known entity`,
        )
      }

      sectionIdsOnPage.push(slot.sectionId)
    }

    if (heroCount > 1) {
      errors.push(`Route "${route}": ${heroCount} hero sections — only 1 allowed per page`)
    }
    if (footerCount > 1) {
      errors.push(`Route "${route}": ${footerCount} footer sections — only 1 allowed per page`)
    }

    // Check incompatibility constraints
    for (const slot of slots) {
      const meta = getSectionMeta(slot.sectionId)
      if (!meta?.incompatibleWith) continue
      for (const incompatId of meta.incompatibleWith) {
        if (sectionIdsOnPage.includes(incompatId)) {
          errors.push(
            `Route "${route}": incompatible sections "${slot.sectionId}" and "${incompatId}" on same page`,
          )
        }
      }
    }

    // List pages must have at least 1 grid section
    const isListPage = route.endsWith('/') && route !== '/'
    if (isListPage) {
      const hasGrid = slots.some((s) => {
        const meta = getSectionMeta(s.sectionId)
        return meta?.category === 'grid'
      })
      if (!hasGrid) {
        errors.push(`Route "${route}": list page must have at least 1 grid section`)
      }
    }

    // Detail pages must have at least 1 detail section
    const isDetailPage = route.includes('/$')
    if (isDetailPage) {
      const hasDetail = slots.some((s) => {
        const meta = getSectionMeta(s.sectionId)
        return meta?.category === 'detail'
      })
      if (!hasDetail) {
        errors.push(`Route "${route}": detail page must have at least 1 detail section`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Fixed composition plan for Canape (restaurant) theme.
 * Maps Canape's domain-specific routes to a mix of generic + domain sections.
 * Admin/private CRUD routes are handled separately by the engine.
 */
function canapeCompositionPlan(
  entities: EntityMeta[],
  _tokens: ThemeTokens,
): PageCompositionPlan {
  // Canape has fixed routes regardless of entity names
  // The "primary" entity is the one used for homepage featured content
  const primaryEntity = entities.find((e) => !e.isPrivate)?.tableName ?? 'entities'

  const nav = 'nav-editorial'
  const footer = 'footer-minimal'

  const pages: Record<string, SectionSlot[]> = {
    '/': [
      { sectionId: nav },
      { sectionId: 'hero-fullbleed' },
      { sectionId: 'content-featured', entityBinding: primaryEntity },
      { sectionId: 'content-testimonials-carousel' },
      { sectionId: 'domain-services-list', entityBinding: 'services_page' },
      { sectionId: 'cta-newsletter' },
      { sectionId: footer },
    ],
    '/menu/': [
      { sectionId: nav },
      { sectionId: 'domain-menu-archive', entityBinding: 'menu_items' },
      { sectionId: footer },
    ],
    '/menu/$category': [
      { sectionId: nav },
      { sectionId: 'domain-menu-category', entityBinding: 'menu_items', config: { paramName: 'category' } },
      { sectionId: footer },
    ],
    '/news/': [
      { sectionId: nav },
      { sectionId: 'grid-list-editorial', entityBinding: 'posts' },
      { sectionId: 'util-pagination', entityBinding: 'posts' },
      { sectionId: footer },
    ],
    '/news/$slug': [
      { sectionId: nav },
      { sectionId: 'detail-article', entityBinding: 'posts' },
      { sectionId: footer },
    ],
    '/$slug': [
      { sectionId: nav },
      { sectionId: 'detail-article', entityBinding: 'pages' },
      { sectionId: footer },
    ],
    '/reservations/': [
      { sectionId: nav },
      { sectionId: 'domain-reservation-form', entityBinding: 'reservations' },
      { sectionId: footer },
    ],
  }

  return { pages }
}

/**
 * Deterministic fallback when LLM composition fails.
 * Selects sections based on theme token signals — no randomness.
 */
export function fallbackCompositionPlan(
  entities: EntityMeta[],
  tokens: ThemeTokens,
): PageCompositionPlan {
  // Canape has a fixed route structure — delegate to domain-specific plan
  if (tokens.name === 'canape') {
    return canapeCompositionPlan(entities, tokens)
  }

  const publicEntities = entities.filter((e) => !e.isPrivate)

  const hero: string =
    tokens.style.heroLayout === 'fullbleed'
      ? 'hero-fullbleed'
      : tokens.style.heroLayout === 'split'
        ? 'hero-split'
        : tokens.style.heroLayout === 'editorial'
          ? 'hero-editorial'
          : tokens.style.heroLayout === 'centered'
            ? 'hero-centered'
            : 'hero-gradient'

  const grid: string =
    tokens.style.imagery === 'photography-heavy'
      ? 'grid-masonry'
      : tokens.style.cardStyle === 'glass'
        ? 'grid-cards-3col'
        : tokens.style.navStyle === 'editorial'
          ? 'grid-magazine'
          : 'grid-cards-3col'

  const detail: string =
    tokens.style.imagery === 'photography-heavy'
      ? 'detail-hero-overlay'
      : tokens.style.navStyle === 'editorial'
        ? 'detail-article'
        : 'detail-split-sidebar'

  const nav: string =
    tokens.style.navStyle === 'sidebar'
      ? 'nav-sidebar'
      : tokens.style.navStyle === 'editorial'
        ? 'nav-editorial'
        : 'nav-topbar'

  const footer: string =
    tokens.style.imagery === 'photography-heavy' ? 'footer-dark-photo' : 'footer-minimal'

  const pages: Record<string, SectionSlot[]> = {
    '/': [
      { sectionId: nav },
      { sectionId: hero },
      ...(publicEntities[0]
        ? [{ sectionId: 'content-featured', entityBinding: publicEntities[0].tableName }]
        : []),
      { sectionId: 'cta-newsletter' },
      { sectionId: footer },
    ],
  }

  for (const entity of publicEntities) {
    pages[`/${entity.pluralKebab}/`] = [
      { sectionId: nav },
      { sectionId: 'util-search-header', entityBinding: entity.tableName },
      { sectionId: grid, entityBinding: entity.tableName },
      { sectionId: footer },
    ]
    pages[`/${entity.pluralKebab}/$id`] = [
      { sectionId: nav },
      { sectionId: detail, entityBinding: entity.tableName },
      { sectionId: footer },
    ]
  }

  return { pages }
}

