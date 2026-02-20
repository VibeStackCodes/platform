/**
 * Section Registry — catalog of all 46 composable page sections.
 *
 * Provides lookup helpers and an LLM-ready prompt builder so the composer
 * agent can select sections by ID without needing to know implementation
 * details.
 */
import type { SectionCategory, SectionMeta } from './types'

// ---------------------------------------------------------------------------
// Incompatibility groups — computed once, referenced in each entry
// ---------------------------------------------------------------------------

const HERO_IDS = [
  'hero-fullbleed',
  'hero-split',
  'hero-centered',
  'hero-video',
  'hero-gradient',
  'hero-editorial',
] as const

const FOOTER_IDS = [
  'footer-dark-photo',
  'footer-minimal',
  'footer-multi-column',
  'footer-centered',
] as const

/** All hero IDs except the one being defined */
function otherHeroes(self: string): string[] {
  return HERO_IDS.filter((id) => id !== self)
}

/** All footer IDs except the one being defined */
function otherFooters(self: string): string[] {
  return FOOTER_IDS.filter((id) => id !== self)
}

// ---------------------------------------------------------------------------
// Full catalog
// ---------------------------------------------------------------------------

export const SECTION_CATALOG: SectionMeta[] = [
  // -------------------------------------------------------------------------
  // Heroes (6)
  // -------------------------------------------------------------------------
  {
    id: 'hero-fullbleed',
    category: 'hero',
    description: 'Full-screen image hero with dark overlay and centered text.',
    requiresEntity: false,
    tags: ['editorial', 'dramatic', 'photography-heavy'],
    incompatibleWith: otherHeroes('hero-fullbleed'),
  },
  {
    id: 'hero-split',
    category: 'hero',
    description: 'Split layout — text+CTA left, image right.',
    requiresEntity: false,
    tags: ['corporate', 'balanced', 'professional'],
    incompatibleWith: otherHeroes('hero-split'),
  },
  {
    id: 'hero-centered',
    category: 'hero',
    description: 'Centered headline with image below, generous spacing.',
    requiresEntity: false,
    tags: ['soft', 'minimal', 'warm'],
    incompatibleWith: otherHeroes('hero-centered'),
  },
  {
    id: 'hero-video',
    category: 'hero',
    description: 'Video background hero with overlay text.',
    requiresEntity: false,
    tags: ['dramatic', 'modern', 'immersive'],
    incompatibleWith: otherHeroes('hero-video'),
  },
  {
    id: 'hero-gradient',
    category: 'hero',
    description: 'Animated gradient background with large headline.',
    requiresEntity: false,
    tags: ['tech', 'modern', 'saas'],
    incompatibleWith: otherHeroes('hero-gradient'),
  },
  {
    id: 'hero-editorial',
    category: 'hero',
    description: 'Large serif headline with editorial magazine feel.',
    requiresEntity: false,
    tags: ['editorial', 'magazine', 'sophisticated'],
    incompatibleWith: otherHeroes('hero-editorial'),
  },

  // -------------------------------------------------------------------------
  // Navigation (4)
  // -------------------------------------------------------------------------
  {
    id: 'nav-topbar',
    category: 'navigation',
    description: 'Horizontal top navigation bar with logo and links.',
    requiresEntity: false,
    tags: ['standard', 'corporate', 'universal'],
    incompatibleWith: ['nav-sidebar'],
  },
  {
    id: 'nav-sidebar',
    category: 'navigation',
    description: 'Fixed vertical sidebar with icon+label links.',
    requiresEntity: false,
    tags: ['dashboard', 'admin', 'data-dense'],
    incompatibleWith: ['nav-topbar'],
  },
  {
    id: 'nav-editorial',
    category: 'navigation',
    description: 'Minimal editorial nav — logo left, few links right.',
    requiresEntity: false,
    tags: ['editorial', 'minimal', 'magazine'],
    incompatibleWith: ['nav-mega'],
  },
  {
    id: 'nav-mega',
    category: 'navigation',
    description: 'Mega menu with categorized dropdown sections.',
    requiresEntity: false,
    tags: ['corporate', 'e-commerce', 'content-rich'],
    incompatibleWith: ['nav-editorial'],
  },

  // -------------------------------------------------------------------------
  // Entity Grids (8)
  // -------------------------------------------------------------------------
  {
    id: 'grid-masonry',
    category: 'grid',
    description: 'Masonry/Pinterest-style grid with varying heights.',
    requiresEntity: true,
    requiredColumns: ['text', 'image'],
    tags: ['gallery', 'photography', 'creative'],
  },
  {
    id: 'grid-bento',
    category: 'grid',
    description: 'Bento box asymmetric layout — 1 large + smaller items.',
    requiresEntity: true,
    requiredColumns: ['text', 'image'],
    tags: ['editorial', 'featured', 'modern'],
  },
  {
    id: 'grid-magazine',
    category: 'grid',
    description: 'Two-column magazine layout with large first item.',
    requiresEntity: true,
    requiredColumns: ['text'],
    tags: ['editorial', 'blog', 'news'],
  },
  {
    id: 'grid-cards-3col',
    category: 'grid',
    description: 'Standard 3-column card grid with image, title, description.',
    requiresEntity: true,
    requiredColumns: ['text'],
    tags: ['standard', 'universal', 'corporate'],
  },
  {
    id: 'grid-horizontal',
    category: 'grid',
    description: 'Horizontal scrolling card row.',
    requiresEntity: true,
    requiredColumns: ['text'],
    tags: ['modern', 'mobile-friendly', 'compact'],
  },
  {
    id: 'grid-table',
    category: 'grid',
    description: 'Compact table/data-grid layout with inline actions.',
    requiresEntity: true,
    requiredColumns: ['text'],
    tags: ['dashboard', 'admin', 'data-dense'],
  },
  {
    id: 'grid-image-overlay',
    category: 'grid',
    description: 'Edge-to-edge images with title overlay on hover.',
    requiresEntity: true,
    requiredColumns: ['text', 'image'],
    tags: ['gallery', 'minimal', 'photography'],
  },
  {
    id: 'grid-list-editorial',
    category: 'grid',
    description: 'Vertical list with large images, editorial layout.',
    requiresEntity: true,
    requiredColumns: ['text'],
    tags: ['editorial', 'blog', 'longform'],
  },

  // -------------------------------------------------------------------------
  // Entity Detail (5)
  // -------------------------------------------------------------------------
  {
    id: 'detail-hero-overlay',
    category: 'detail',
    description: 'Full-width image header with title overlay.',
    requiresEntity: true,
    requiredColumns: ['image'],
    tags: ['editorial', 'dramatic', 'photography'],
  },
  {
    id: 'detail-split-sidebar',
    category: 'detail',
    description: 'Content left, metadata sidebar right.',
    requiresEntity: true,
    tags: ['corporate', 'structured', 'data-rich'],
  },
  {
    id: 'detail-article',
    category: 'detail',
    description: 'Full-width article-style centered content (max-w-3xl).',
    requiresEntity: true,
    tags: ['editorial', 'blog', 'longform'],
  },
  {
    id: 'detail-data-dense',
    category: 'detail',
    description: 'Compact data card sections with key-value pairs.',
    requiresEntity: true,
    tags: ['dashboard', 'admin', 'technical'],
  },
  {
    id: 'detail-gallery',
    category: 'detail',
    description: 'Image gallery slideshow with content below.',
    requiresEntity: true,
    requiredColumns: ['image'],
    tags: ['gallery', 'photography', 'creative'],
  },

  // -------------------------------------------------------------------------
  // Content Blocks (8)
  // -------------------------------------------------------------------------
  {
    id: 'content-featured',
    category: 'content',
    description: 'Featured entity spotlight — 1 large card with excerpt.',
    requiresEntity: true,
    tags: ['editorial', 'homepage'],
  },
  {
    id: 'content-testimonials-carousel',
    category: 'content',
    description: 'Horizontal testimonial carousel with quotes.',
    requiresEntity: false,
    tags: ['social-proof', 'warm', 'marketing'],
  },
  {
    id: 'content-testimonials-wall',
    category: 'content',
    description: 'Grid of testimonial quote cards.',
    requiresEntity: false,
    tags: ['social-proof', 'dense', 'corporate'],
  },
  {
    id: 'content-stats',
    category: 'content',
    description: 'Animated statistics/counters bar.',
    requiresEntity: false,
    tags: ['corporate', 'data', 'impressive'],
  },
  {
    id: 'content-timeline',
    category: 'content',
    description: 'Vertical timeline with alternating content.',
    requiresEntity: false,
    tags: ['about', 'history', 'storytelling'],
  },
  {
    id: 'content-faq',
    category: 'content',
    description: 'Accordion FAQ section.',
    requiresEntity: false,
    tags: ['support', 'informational', 'utility'],
  },
  {
    id: 'content-features',
    category: 'content',
    description: 'Feature icons/images grid with descriptions.',
    requiresEntity: false,
    tags: ['marketing', 'saas', 'features'],
  },
  {
    id: 'content-team',
    category: 'content',
    description: 'Team member grid with photos and roles.',
    requiresEntity: false,
    tags: ['about', 'corporate', 'people'],
  },

  // -------------------------------------------------------------------------
  // CTAs (5)
  // -------------------------------------------------------------------------
  {
    id: 'cta-newsletter',
    category: 'cta',
    description: 'Centered newsletter signup with email input.',
    requiresEntity: false,
    tags: ['marketing', 'engagement', 'simple'],
  },
  {
    id: 'cta-newsletter-split',
    category: 'cta',
    description: 'Split layout — text left, email input right.',
    requiresEntity: false,
    tags: ['marketing', 'editorial', 'balanced'],
  },
  {
    id: 'cta-pricing',
    category: 'cta',
    description: 'Pricing tier cards (3 columns).',
    requiresEntity: false,
    tags: ['saas', 'monetization', 'comparison'],
  },
  {
    id: 'cta-download',
    category: 'cta',
    description: 'Download/install banner with CTA button.',
    requiresEntity: false,
    tags: ['saas', 'product', 'conversion'],
  },
  {
    id: 'cta-contact',
    category: 'cta',
    description: 'Contact form with name, email, message fields.',
    requiresEntity: false,
    tags: ['business', 'support', 'communication'],
  },

  // -------------------------------------------------------------------------
  // Footers (4)
  // -------------------------------------------------------------------------
  {
    id: 'footer-dark-photo',
    category: 'footer',
    description: 'Dark footer with background photo overlay.',
    requiresEntity: false,
    tags: ['dramatic', 'editorial', 'photography'],
    incompatibleWith: otherFooters('footer-dark-photo'),
  },
  {
    id: 'footer-minimal',
    category: 'footer',
    description: 'Simple border-top with copyright and links.',
    requiresEntity: false,
    tags: ['minimal', 'clean', 'universal'],
    incompatibleWith: otherFooters('footer-minimal'),
  },
  {
    id: 'footer-multi-column',
    category: 'footer',
    description: 'Multi-column footer with categorized links.',
    requiresEntity: false,
    tags: ['corporate', 'content-rich', 'organized'],
    incompatibleWith: otherFooters('footer-multi-column'),
  },
  {
    id: 'footer-centered',
    category: 'footer',
    description: 'Centered footer with stacked links and tagline.',
    requiresEntity: false,
    tags: ['simple', 'soft', 'minimal'],
    incompatibleWith: otherFooters('footer-centered'),
  },

  // -------------------------------------------------------------------------
  // Domain: Restaurant (4)
  // -------------------------------------------------------------------------
  {
    id: 'domain-menu-archive',
    category: 'grid',
    description: 'Menu items grouped by category with prices — restaurant theme.',
    requiresEntity: true,
    requiredColumns: ['text'],
    tags: ['restaurant', 'food', 'menu', 'domain-specific'],
  },
  {
    id: 'domain-menu-category',
    category: 'grid',
    description: 'Menu items filtered by URL category parameter — restaurant theme.',
    requiresEntity: true,
    requiredColumns: ['text'],
    tags: ['restaurant', 'food', 'menu', 'domain-specific'],
  },
  {
    id: 'domain-reservation-form',
    category: 'cta',
    description: 'Table reservation form with party size, date, time — restaurant theme.',
    requiresEntity: true,
    tags: ['restaurant', 'booking', 'form', 'domain-specific'],
  },
  {
    id: 'domain-services-list',
    category: 'content',
    description: 'Services/offerings list with links — restaurant theme.',
    requiresEntity: true,
    tags: ['restaurant', 'services', 'domain-specific'],
  },

  // -------------------------------------------------------------------------
  // Utility (6)
  // -------------------------------------------------------------------------
  {
    id: 'util-category-scroll',
    category: 'utility',
    description: 'Horizontal scrolling category/tag chips.',
    requiresEntity: true,
    tags: ['filtering', 'browsing', 'discovery'],
  },
  {
    id: 'util-breadcrumb',
    category: 'utility',
    description: 'Breadcrumb navigation trail.',
    requiresEntity: false,
    tags: ['navigation', 'utility', 'wayfinding'],
  },
  {
    id: 'util-search-header',
    category: 'utility',
    description: 'Search input with heading.',
    requiresEntity: true,
    tags: ['search', 'utility', 'filtering'],
  },
  {
    id: 'util-filter-tabs',
    category: 'utility',
    description: 'Horizontal filter tab bar.',
    requiresEntity: true,
    tags: ['filtering', 'browsing', 'organization'],
  },
  {
    id: 'util-empty-state',
    category: 'utility',
    description: 'Empty state illustration and message.',
    requiresEntity: false,
    tags: ['feedback', 'ux', 'placeholder'],
  },
  {
    id: 'util-pagination',
    category: 'utility',
    description: 'Numbered pagination with prev/next buttons.',
    requiresEntity: true,
    tags: ['navigation', 'browsing', 'utility'],
  },
]

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Look up a section by its string ID. Returns undefined if not found. */
export function getSectionMeta(id: string): SectionMeta | undefined {
  return SECTION_CATALOG.find((s) => s.id === id)
}

/** Return all sections belonging to a given category. */
export function getSectionsByCategory(cat: SectionCategory): SectionMeta[] {
  return SECTION_CATALOG.filter((s) => s.category === cat)
}

/** Return all sections that include `tag` in their tags array. */
export function getSectionsByTag(tag: string): SectionMeta[] {
  return SECTION_CATALOG.filter((s) => s.tags.includes(tag))
}

// ---------------------------------------------------------------------------
// LLM prompt builder
// ---------------------------------------------------------------------------

/** Human-readable category headings for the composer prompt */
const CATEGORY_LABELS: Record<SectionCategory, string> = {
  hero: 'Heroes (pick at most 1)',
  navigation: 'Navigation (pick at most 1 style)',
  grid: 'Entity Grids (requires entityBinding)',
  detail: 'Entity Detail (requires entityBinding)',
  content: 'Content Blocks',
  cta: 'CTAs',
  footer: 'Footers (pick at most 1)',
  utility: 'Utility',
}

/** Ordered list of categories for deterministic output */
const CATEGORY_ORDER: SectionCategory[] = [
  'hero',
  'navigation',
  'grid',
  'detail',
  'content',
  'cta',
  'footer',
  'utility',
]

/**
 * Build a compact text catalog suitable for inclusion in an LLM composer
 * prompt.  Format:
 *
 *   ## Available Sections
 *
 *   ### Heroes (pick at most 1)
 *   - hero-fullbleed: Full-screen image hero with dark overlay [editorial, dramatic]
 *   - hero-split: Split text+image layout [corporate, balanced] (needs image column)
 *   ...
 */
export function buildComposerCatalogPrompt(): string {
  const lines: string[] = ['## Available Sections', '']

  for (const cat of CATEGORY_ORDER) {
    const sections = getSectionsByCategory(cat)
    if (sections.length === 0) continue

    lines.push(`### ${CATEGORY_LABELS[cat]}`)

    for (const s of sections) {
      const tagList = `[${s.tags.join(', ')}]`
      const columnNote =
        s.requiredColumns && s.requiredColumns.length > 0
          ? ` (needs ${s.requiredColumns.join(', ')} column)`
          : ''
      const entityNote = s.requiresEntity ? ' *(entityBinding required)*' : ''
      lines.push(`- ${s.id}: ${s.description} ${tagList}${columnNote}${entityNote}`)
    }

    lines.push('')
  }

  // Trim trailing blank line
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }

  return lines.join('\n')
}
