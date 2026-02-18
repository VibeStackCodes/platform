// lib/design-spec.ts
//
// Deterministic DesignSpec derivation from SchemaContract + DesignPreferences.
// No LLM calls — archetype detection is keyword-based pattern matching.

import type { SchemaContract, DesignPreferences } from './schema-contract'

export type LayoutArchetype =
  | 'editorial'   // magazines, blogs, articles, travel
  | 'storefront'  // recipes, menus, products, catalogs, watches
  | 'dashboard'   // finance, analytics, CRM, inventory
  | 'kanban'      // projects, tasks, pipelines, deals
  | 'schedule'    // appointments, bookings, events, slots
  | 'portfolio'   // photography, galleries, artwork
  | 'directory'   // default/fallback

export type NavStyle = 'sticky-glass' | 'editorial' | 'sidebar' | 'minimal'

export interface FontPair {
  name: string
  displayFamily: string
  bodyFamily: string
  googleFontsUrl: string
}

export interface EntityLayout {
  listSkill: string    // e.g., 'CardGrid', 'TransactionFeed', 'DataTable'
  detailSkill: string  // e.g., 'ProductDetail', 'ArticleReader', 'FormSheet'
  heroSkill?: string
  hasDashboard: boolean
}

export interface HeroImage {
  url: string
  alt: string
  photographer: string
}

export interface DesignSpec {
  layoutArchetype: LayoutArchetype
  navStyle: NavStyle
  fontPair: FontPair
  motionIntensity: 'none' | 'subtle' | 'expressive'
  entityLayouts: Record<string, EntityLayout>
  heroImageQuery?: string
  heroImages: HeroImage[]
}

// Ordered rules: first match wins per table. Keywords match against table name.
const ARCHETYPE_RULES: Array<{ keywords: string[]; archetype: LayoutArchetype }> = [
  {
    keywords: ['recipe', 'dish', 'menu', 'food', 'ingredient', 'meal', 'cuisine', 'watch', 'book', 'product', 'catalog', 'item', 'listing'],
    archetype: 'storefront',
  },
  {
    keywords: ['article', 'post', 'blog', 'author', 'destination', 'travel', 'journal', 'story', 'entry', 'newsletter'],
    archetype: 'editorial',
  },
  {
    keywords: ['transaction', 'budget', 'expense', 'income', 'account', 'invoice', 'payment', 'ledger', 'finance', 'spending'],
    archetype: 'dashboard',
  },
  {
    keywords: ['project', 'task', 'deliverable', 'deal', 'lead', 'ticket', 'issue', 'sprint', 'milestone', 'pipeline', 'stage'],
    archetype: 'kanban',
  },
  {
    keywords: ['appointment', 'booking', 'slot', 'event', 'session', 'reservation', 'schedule', 'meeting', 'class'],
    archetype: 'schedule',
  },
  {
    keywords: ['photo', 'image', 'gallery', 'portfolio', 'artwork', 'illustration', 'design', 'shot'],
    archetype: 'portfolio',
  },
]

function detectArchetype(tableNames: string[]): LayoutArchetype {
  const scores: Partial<Record<LayoutArchetype, number>> = {}
  for (const tableName of tableNames) {
    const lower = tableName.toLowerCase()
    for (const rule of ARCHETYPE_RULES) {
      if (rule.keywords.some((kw) => lower.includes(kw))) {
        scores[rule.archetype] = (scores[rule.archetype] ?? 0) + 1
        break
      }
    }
  }
  let best: LayoutArchetype = 'directory'
  let bestScore = 0
  for (const [arch, score] of Object.entries(scores) as [LayoutArchetype, number][]) {
    if (score > bestScore) {
      bestScore = score
      best = arch
    }
  }
  return best
}

const FONT_PAIRS: Record<LayoutArchetype, FontPair> = {
  editorial: {
    name: 'editorial-serif',
    displayFamily: 'Playfair Display',
    bodyFamily: 'Source Serif 4',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Source+Serif+4:wght@300;400;600&display=swap',
  },
  storefront: {
    name: 'luxury-serif',
    displayFamily: 'Cormorant Garamond',
    bodyFamily: 'Lato',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Lato:wght@300;400;700&display=swap',
  },
  dashboard: {
    name: 'geometric-clean',
    displayFamily: 'DM Sans',
    bodyFamily: 'DM Sans',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap',
  },
  kanban: {
    name: 'modern-sans',
    displayFamily: 'Inter',
    bodyFamily: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  },
  schedule: {
    name: 'geometric-clean',
    displayFamily: 'DM Sans',
    bodyFamily: 'DM Sans',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap',
  },
  portfolio: {
    name: 'expressive-display',
    displayFamily: 'Syne',
    bodyFamily: 'DM Mono',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400&display=swap',
  },
  directory: {
    name: 'modern-sans',
    displayFamily: 'Inter',
    bodyFamily: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  },
}

const LIST_SKILLS: Record<LayoutArchetype, string> = {
  editorial: 'MagazineGrid',
  storefront: 'CardGrid',
  dashboard: 'TransactionFeed',
  kanban: 'CardGrid',
  schedule: 'CardGrid',
  portfolio: 'CardGrid',
  directory: 'DataTable',
}

const DETAIL_SKILLS: Record<LayoutArchetype, string> = {
  editorial: 'ArticleReader',
  storefront: 'ProductDetail',
  dashboard: 'FormSheet',
  kanban: 'FormSheet',
  schedule: 'AppointmentCard',
  portfolio: 'ProductDetail',
  directory: 'FormSheet',
}

const DASHBOARD_ARCHETYPES = new Set<LayoutArchetype>(['dashboard'])

function buildEntityLayouts(tableNames: string[], archetype: LayoutArchetype): Record<string, EntityLayout> {
  const layouts: Record<string, EntityLayout> = {}
  for (const name of tableNames) {
    layouts[name] = {
      listSkill: LIST_SKILLS[archetype],
      detailSkill: DETAIL_SKILLS[archetype],
      hasDashboard: DASHBOARD_ARCHETYPES.has(archetype),
    }
  }
  return layouts
}

const NAV_STYLES: Record<LayoutArchetype, NavStyle> = {
  editorial: 'editorial',
  storefront: 'minimal',
  dashboard: 'sidebar',
  kanban: 'sidebar',
  schedule: 'sticky-glass',
  portfolio: 'minimal',
  directory: 'sticky-glass',
}

const MOTION_INTENSITY: Record<LayoutArchetype, 'none' | 'subtle' | 'expressive'> = {
  editorial: 'expressive',
  storefront: 'subtle',
  dashboard: 'none',
  kanban: 'subtle',
  schedule: 'subtle',
  portfolio: 'expressive',
  directory: 'none',
}

const HERO_QUERIES: Record<LayoutArchetype, string> = {
  editorial: 'magazine editorial photography',
  storefront: 'product food photography lifestyle',
  dashboard: 'modern office data analytics',
  kanban: 'team workspace productivity',
  schedule: 'calendar planning schedule',
  portfolio: 'art gallery photography portfolio',
  directory: 'people community directory',
}

/**
 * Deterministically derive a DesignSpec from contract + design preferences.
 * No LLM calls.
 */
export function deriveDesignSpec(contract: SchemaContract, _prefs: DesignPreferences): DesignSpec {
  const entityTableNames = contract.tables
    .filter((t) => !t.name.startsWith('_'))
    .map((t) => t.name)

  const archetype = detectArchetype(entityTableNames)
  const fontPair = FONT_PAIRS[archetype]
  const navStyle = NAV_STYLES[archetype]
  const motionIntensity = MOTION_INTENSITY[archetype]
  const entityLayouts = buildEntityLayouts(entityTableNames, archetype)
  const heroImageQuery = HERO_QUERIES[archetype]

  return {
    layoutArchetype: archetype,
    navStyle,
    fontPair,
    motionIntensity,
    entityLayouts,
    heroImageQuery,
    heroImages: [],
  }
}

/**
 * Generate CSS @import + :root font custom properties for index.css.
 */
export function designSpecToFontCSS(spec: DesignSpec): string {
  return `@import url('${spec.fontPair.googleFontsUrl}');

:root {
  --font-display: '${spec.fontPair.displayFamily}', serif;
  --font-body: '${spec.fontPair.bodyFamily}', sans-serif;
}`
}
