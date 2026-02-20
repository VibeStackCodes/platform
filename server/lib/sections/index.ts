/**
 * Section Composition Engine — Barrel / Registry
 *
 * Imports every section renderer, builds a RENDERERS lookup keyed by the
 * canonical section ID string, and exports getSectionRenderer() for use by
 * the page assembler.
 */

import { SECTION_IDS } from './types'
import type { SectionRenderer } from './types'

// ---------------------------------------------------------------------------
// Hero renderers
// ---------------------------------------------------------------------------

import {
  heroFullbleed,
  heroSplit,
  heroCentered,
  heroVideo,
  heroGradient,
  heroEditorial,
} from './heroes'

// ---------------------------------------------------------------------------
// Navigation renderers
// ---------------------------------------------------------------------------

import { navTopbar, navSidebar, navEditorial, navMega } from './navigation'

// ---------------------------------------------------------------------------
// Grid renderers
// ---------------------------------------------------------------------------

import {
  gridMasonry,
  gridBento,
  gridMagazine,
  gridCards3col,
  gridHorizontal,
  gridTable,
  gridImageOverlay,
  gridListEditorial,
} from './grids'

// ---------------------------------------------------------------------------
// Detail renderers
// ---------------------------------------------------------------------------

import {
  detailHeroOverlay,
  detailSplitSidebar,
  detailArticle,
  detailDataDense,
  detailGallery,
} from './details'

// ---------------------------------------------------------------------------
// Content renderers
// ---------------------------------------------------------------------------

import {
  contentFeatured,
  contentTestimonialsCarousel,
  contentTestimonialsWall,
  contentStats,
  contentTimeline,
  contentFaq,
  contentFeatures,
  contentTeam,
} from './content'

// ---------------------------------------------------------------------------
// CTA renderers
// ---------------------------------------------------------------------------

import {
  ctaNewsletter,
  ctaNewsletterSplit,
  ctaPricing,
  ctaDownload,
  ctaContact,
} from './ctas'

// ---------------------------------------------------------------------------
// Footer renderers
// ---------------------------------------------------------------------------

import {
  footerDarkPhoto,
  footerMinimal,
  footerMultiColumn,
  footerCentered,
} from './footers'

// ---------------------------------------------------------------------------
// Utility renderers
// ---------------------------------------------------------------------------

import {
  utilCategoryScroll,
  utilBreadcrumb,
  utilSearchHeader,
  utilFilterTabs,
  utilEmptyState,
  utilPagination,
} from './utility'

// ---------------------------------------------------------------------------
// RENDERERS map — keyed by canonical section ID
// ---------------------------------------------------------------------------

const RENDERERS: Record<string, SectionRenderer> = {
  // Heroes
  [SECTION_IDS.HERO_FULLBLEED]: heroFullbleed,
  [SECTION_IDS.HERO_SPLIT]: heroSplit,
  [SECTION_IDS.HERO_CENTERED]: heroCentered,
  [SECTION_IDS.HERO_VIDEO]: heroVideo,
  [SECTION_IDS.HERO_GRADIENT]: heroGradient,
  [SECTION_IDS.HERO_EDITORIAL]: heroEditorial,

  // Navigation
  [SECTION_IDS.NAV_TOPBAR]: navTopbar,
  [SECTION_IDS.NAV_SIDEBAR]: navSidebar,
  [SECTION_IDS.NAV_EDITORIAL]: navEditorial,
  [SECTION_IDS.NAV_MEGA]: navMega,

  // Grids
  [SECTION_IDS.GRID_MASONRY]: gridMasonry,
  [SECTION_IDS.GRID_BENTO]: gridBento,
  [SECTION_IDS.GRID_MAGAZINE]: gridMagazine,
  [SECTION_IDS.GRID_CARDS_3COL]: gridCards3col,
  [SECTION_IDS.GRID_HORIZONTAL]: gridHorizontal,
  [SECTION_IDS.GRID_TABLE]: gridTable,
  [SECTION_IDS.GRID_IMAGE_OVERLAY]: gridImageOverlay,
  [SECTION_IDS.GRID_LIST_EDITORIAL]: gridListEditorial,

  // Details
  [SECTION_IDS.DETAIL_HERO_OVERLAY]: detailHeroOverlay,
  [SECTION_IDS.DETAIL_SPLIT_SIDEBAR]: detailSplitSidebar,
  [SECTION_IDS.DETAIL_ARTICLE]: detailArticle,
  [SECTION_IDS.DETAIL_DATA_DENSE]: detailDataDense,
  [SECTION_IDS.DETAIL_GALLERY]: detailGallery,

  // Content
  [SECTION_IDS.CONTENT_FEATURED]: contentFeatured,
  [SECTION_IDS.CONTENT_TESTIMONIALS_CAROUSEL]: contentTestimonialsCarousel,
  [SECTION_IDS.CONTENT_TESTIMONIALS_WALL]: contentTestimonialsWall,
  [SECTION_IDS.CONTENT_STATS]: contentStats,
  [SECTION_IDS.CONTENT_TIMELINE]: contentTimeline,
  [SECTION_IDS.CONTENT_FAQ]: contentFaq,
  [SECTION_IDS.CONTENT_FEATURES]: contentFeatures,
  [SECTION_IDS.CONTENT_TEAM]: contentTeam,

  // CTAs
  [SECTION_IDS.CTA_NEWSLETTER]: ctaNewsletter,
  [SECTION_IDS.CTA_NEWSLETTER_SPLIT]: ctaNewsletterSplit,
  [SECTION_IDS.CTA_PRICING]: ctaPricing,
  [SECTION_IDS.CTA_DOWNLOAD]: ctaDownload,
  [SECTION_IDS.CTA_CONTACT]: ctaContact,

  // Footers
  [SECTION_IDS.FOOTER_DARK_PHOTO]: footerDarkPhoto,
  [SECTION_IDS.FOOTER_MINIMAL]: footerMinimal,
  [SECTION_IDS.FOOTER_MULTI_COLUMN]: footerMultiColumn,
  [SECTION_IDS.FOOTER_CENTERED]: footerCentered,

  // Utility
  [SECTION_IDS.UTIL_CATEGORY_SCROLL]: utilCategoryScroll,
  [SECTION_IDS.UTIL_BREADCRUMB]: utilBreadcrumb,
  [SECTION_IDS.UTIL_SEARCH_HEADER]: utilSearchHeader,
  [SECTION_IDS.UTIL_FILTER_TABS]: utilFilterTabs,
  [SECTION_IDS.UTIL_EMPTY_STATE]: utilEmptyState,
  [SECTION_IDS.UTIL_PAGINATION]: utilPagination,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a section renderer by its canonical section ID string.
 * Returns undefined when the ID is not registered.
 */
export function getSectionRenderer(id: string): SectionRenderer | undefined {
  return RENDERERS[id]
}

// Re-export everything from types and registry so consumers can import from
// a single barrel instead of reaching into sub-modules.
export * from './types'
export * from './registry'
