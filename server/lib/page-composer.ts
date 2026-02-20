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
import { PageCompositionPlanSchema } from './agents/schemas'
import type { ThemeTokens } from './themed-code-engine'
import type { EntityMeta, PageCompositionPlan, SectionSlot } from './sections/types'
import { SECTION_CATALOG, buildComposerCatalogPrompt, getSectionMeta } from './sections/registry'

// ---------------------------------------------------------------------------
// Composer agent (singleton — created once, reused across calls)
// ---------------------------------------------------------------------------

const composerAgent = new Agent({
  id: 'page-composer',
  name: 'page-composer',
  instructions: `You are a page layout composer for a web application generator.
Given entity shapes, theme style, and a section catalog, compose pages by selecting
which sections appear on each route and in what order.

Rules:
- Every app needs a homepage ("/") with: 1 hero, 1-2 content sections, 1 footer
- Each public entity needs a list page ("/{entity}/") and detail page ("/{entity}/$id")
- List pages: optional search/filter utility + 1 grid section + footer
- Detail pages: 1 detail section + footer
- Pick sections that match the theme style (editorial themes → editorial sections, etc.)
- Maximum 8 sections per page
- Only 1 hero per page, only 1 footer per page
- entityBinding is required for grid, detail, and content-featured sections
- Navigation sections (nav-topbar, nav-sidebar, nav-editorial) appear first on every page`,
  model: createAgentModelResolver('composer'),
  defaultOptions: { modelSettings: { temperature: 0.3 } },
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Uses LLM to compose pages — which sections appear on which routes and in
 * what order. Falls back to deterministic plan if LLM call fails or the
 * resulting plan fails validation.
 */
export async function composeSections(
  entities: EntityMeta[],
  tokens: ThemeTokens,
  appDescription: string,
): Promise<PageCompositionPlan> {
  const prompt = buildComposerPrompt(entities, tokens, appDescription)

  try {
    const result = await composerAgent.generate(prompt, {
      structuredOutput: { schema: PageCompositionPlanSchema },
    })

    const raw = PageCompositionPlanSchema.safeParse(result.object ?? result)
    if (!raw.success) {
      console.warn('[page-composer] LLM output failed schema parse — using fallback', raw.error.format())
      return fallbackCompositionPlan(entities, tokens)
    }

    const plan = raw.data
    const validation = validateCompositionPlan(plan, entities)
    if (!validation.valid) {
      console.warn('[page-composer] LLM plan failed validation — using fallback', validation.errors)
      return fallbackCompositionPlan(entities, tokens)
    }

    return plan
  } catch (err) {
    console.error('[page-composer] LLM call failed — using fallback', err)
    return fallbackCompositionPlan(entities, tokens)
  }
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

// ---------------------------------------------------------------------------
// Prompt builder (internal)
// ---------------------------------------------------------------------------

function buildComposerPrompt(
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

  return `## App Description
${appDescription}

## Theme: ${tokens.name}
Style tokens: ${themeStyle}

## Public Entities (generate list + detail routes for each)
${entityLines || '  (none — homepage only)'}
${privateEntityLines}

${catalogPrompt}

## Your Task
Compose a PageCompositionPlan with routes and ordered section slots.

Required routes:
- "/" — homepage
${publicEntities.map((e) => `- "/${e.pluralKebab}/" — ${e.pluralTitle} list page\n- "/${e.pluralKebab}/$id" — ${e.singularTitle} detail page`).join('\n')}

Follow the composition rules strictly:
1. Every page starts with exactly 1 navigation section
2. Homepages have: nav + hero + 1-2 content sections + cta + footer (max 8 total)
3. List pages have: nav + optional utility + 1 grid section + footer
4. Detail pages have: nav + 1 detail section + footer
5. Pick sections whose style tags match the theme (e.g., navStyle=editorial → nav-editorial)
6. Set entityBinding on all grid, detail, and content-featured sections`
}
