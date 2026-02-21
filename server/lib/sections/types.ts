/**
 * Section Composition Engine — Shared Types
 *
 * Every section renderer is a pure function: (SectionContext) => SectionOutput
 * producing self-contained JSX fragments that the page assembler composes
 * into complete route files.
 */
import type { ThemeTokens } from '../themed-code-engine'
import type { z } from 'zod'
import type {
  SectionVisualSpecSchema,
  RouteSpecSchema,
  PageCompositionPlanV2Schema,
} from '../agents/schemas'

// ---------------------------------------------------------------------------
// Entity metadata (lighter than full RouteMeta — only what sections need)
// ---------------------------------------------------------------------------

export interface EntityMeta {
  tableName: string
  pluralKebab: string
  singularTitle: string
  pluralTitle: string
  displayColumn: string | null
  imageColumn: string | null
  metadataColumns: string[]
  isPrivate: boolean
}

// ---------------------------------------------------------------------------
// Section context — everything a renderer needs
// ---------------------------------------------------------------------------

export interface SectionContext {
  tokens: ThemeTokens
  appName: string
  heroImages: Array<{ url: string; alt: string; photographer: string }>
  hasAuth: boolean

  /** Entity this section is bound to (from composer's entityBinding) */
  entityName?: string
  entitySlug?: string
  tableName?: string
  displayColumn?: string
  imageColumn?: string
  metadataColumns?: string[]

  /** Variable name for data array in JSX template (e.g., "recipes") */
  dataVar?: string
  /** Variable name for single item in .map() (e.g., "recipe") */
  itemVar?: string

  /** Per-section overrides from composer (headline, limit, etc.) */
  config: Record<string, unknown>

  /** All entities in the app — for cross-entity references (homepage featuring multiple entities) */
  allEntities: EntityMeta[]
}

// ---------------------------------------------------------------------------
// Section output — what a renderer returns
// ---------------------------------------------------------------------------

export interface SectionOutput {
  /** JSX fragment string — the <section>...</section> block */
  jsx: string
  /** Extra import lines this section needs (beyond standard supabase/router) */
  imports?: string[]
  /** Extra hook/variable declarations before the return statement */
  hooks?: string[]
}

// ---------------------------------------------------------------------------
// Section renderer function signature
// ---------------------------------------------------------------------------

export type SectionRenderer = (ctx: SectionContext) => SectionOutput

// ---------------------------------------------------------------------------
// Section metadata — for the registry
// ---------------------------------------------------------------------------

export type SectionCategory =
  | 'hero'
  | 'navigation'
  | 'grid'
  | 'detail'
  | 'content'
  | 'cta'
  | 'footer'
  | 'utility'

export interface SectionMeta {
  id: string
  category: SectionCategory
  description: string
  /** Does this section require an entity binding? */
  requiresEntity: boolean
  /** Column types this section needs (e.g., image column for gallery grids) */
  requiredColumns?: ('image' | 'text' | 'date' | 'number')[]
  /** Incompatible with these section IDs on the same page */
  incompatibleWith?: string[]
  /** Tags for LLM composer prompt (e.g., "editorial", "minimal", "data-dense") */
  tags: string[]
}

// ---------------------------------------------------------------------------
// Page composition plan — output of the LLM composer
// ---------------------------------------------------------------------------

export interface SectionSlot {
  sectionId: string
  entityBinding?: string
  config?: Record<string, unknown>
}

export interface PageCompositionPlan {
  pages: Record<string, SectionSlot[]>
}

// ---------------------------------------------------------------------------
// Section IDs — canonical constants
// ---------------------------------------------------------------------------

export const SECTION_IDS = {
  // Heroes (6)
  HERO_FULLBLEED: 'hero-fullbleed',
  HERO_SPLIT: 'hero-split',
  HERO_CENTERED: 'hero-centered',
  HERO_VIDEO: 'hero-video',
  HERO_GRADIENT: 'hero-gradient',
  HERO_EDITORIAL: 'hero-editorial',

  // Navigation (4)
  NAV_TOPBAR: 'nav-topbar',
  NAV_SIDEBAR: 'nav-sidebar',
  NAV_EDITORIAL: 'nav-editorial',
  NAV_MEGA: 'nav-mega',

  // Entity Grids (8)
  GRID_MASONRY: 'grid-masonry',
  GRID_BENTO: 'grid-bento',
  GRID_MAGAZINE: 'grid-magazine',
  GRID_CARDS_3COL: 'grid-cards-3col',
  GRID_HORIZONTAL: 'grid-horizontal',
  GRID_TABLE: 'grid-table',
  GRID_IMAGE_OVERLAY: 'grid-image-overlay',
  GRID_LIST_EDITORIAL: 'grid-list-editorial',

  // Entity Detail (5)
  DETAIL_HERO_OVERLAY: 'detail-hero-overlay',
  DETAIL_SPLIT_SIDEBAR: 'detail-split-sidebar',
  DETAIL_ARTICLE: 'detail-article',
  DETAIL_DATA_DENSE: 'detail-data-dense',
  DETAIL_GALLERY: 'detail-gallery',

  // Content Blocks (8)
  CONTENT_FEATURED: 'content-featured',
  CONTENT_TESTIMONIALS_CAROUSEL: 'content-testimonials-carousel',
  CONTENT_TESTIMONIALS_WALL: 'content-testimonials-wall',
  CONTENT_STATS: 'content-stats',
  CONTENT_TIMELINE: 'content-timeline',
  CONTENT_FAQ: 'content-faq',
  CONTENT_FEATURES: 'content-features',
  CONTENT_TEAM: 'content-team',

  // CTAs (5)
  CTA_NEWSLETTER: 'cta-newsletter',
  CTA_NEWSLETTER_SPLIT: 'cta-newsletter-split',
  CTA_PRICING: 'cta-pricing',
  CTA_DOWNLOAD: 'cta-download',
  CTA_CONTACT: 'cta-contact',

  // Footers (4)
  FOOTER_DARK_PHOTO: 'footer-dark-photo',
  FOOTER_MINIMAL: 'footer-minimal',
  FOOTER_MULTI_COLUMN: 'footer-multi-column',
  FOOTER_CENTERED: 'footer-centered',

  // Utility (6)
  UTIL_CATEGORY_SCROLL: 'util-category-scroll',
  UTIL_BREADCRUMB: 'util-breadcrumb',
  UTIL_SEARCH_HEADER: 'util-search-header',
  UTIL_FILTER_TABS: 'util-filter-tabs',
  UTIL_EMPTY_STATE: 'util-empty-state',
  UTIL_PAGINATION: 'util-pagination',

  // Domain: Restaurant (4)
  DOMAIN_MENU_ARCHIVE: 'domain-menu-archive',
  DOMAIN_MENU_CATEGORY: 'domain-menu-category',
  DOMAIN_RESERVATION_FORM: 'domain-reservation-form',
  DOMAIN_SERVICES_LIST: 'domain-services-list',
} as const

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS]

// ---------------------------------------------------------------------------
// V2 composition types — inferred from Zod schemas in agents/schemas.ts
// ---------------------------------------------------------------------------

export type SectionVisualSpec = z.infer<typeof SectionVisualSpecSchema>
export type RouteSpec = z.infer<typeof RouteSpecSchema>
export type PageCompositionPlanV2 = z.infer<typeof PageCompositionPlanV2Schema>
