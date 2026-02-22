import { z } from 'zod'

/**
 * Zod schemas for agent structured output.
 *
 * Only schemas actively used by agents are defined here.
 * Removed unused schemas from earlier agent network architecture (2026-02-16 audit).
 */

/**
 * Analyst output — the structured result of requirements extraction.
 * Used as the inputSchema for the submitRequirements tool so the analyst
 * can produce structured output via tool calling (allowing it to also call
 * askClarifyingQuestions in the same generate() invocation).
 *
 * The analyst produces a short PRD (product requirements document) — NOT a database
 * schema. Downstream agents (Design, Architect, Page Generator) use the PRD to
 * inform page generation. An empty SchemaContract is created automatically.
 */
export const AnalystOutputSchema = z.object({
  appName: z.string().describe('Short application name (e.g., "TaskFlow")'),
  appDescription: z.string().describe('One-line app description'),
  prd: z.string().describe('Short PRD: 2-line introduction followed by 5 bullet points of key requirements'),
})

// ---------------------------------------------------------------------------
// Section Composition — Page Composer output schemas
// ---------------------------------------------------------------------------

export const SectionSlotSchema = z.object({
  sectionId: z.string().min(1).describe('Section renderer ID (e.g., "hero-fullbleed", "grid-masonry")'),
  entityBinding: z.string().optional().describe('Entity table name this section displays (e.g., "recipes")'),
  config: z.record(z.string(), z.unknown()).optional().describe('Per-section overrides (headline, limit, etc.)'),
})

export const PageCompositionPlanSchema = z.object({
  pages: z.record(
    z.string().describe('Route path (e.g., "/", "/recipes", "/recipes/$slug")'),
    z.array(SectionSlotSchema).min(1).describe('Ordered list of sections on this page'),
  ).describe('Map of route path → section slots'),
})

// ---------------------------------------------------------------------------
// Section Composition V2 — LLM-driven visual specs (closed vocabulary)
// ---------------------------------------------------------------------------

/** All 50 section renderer IDs */
export const SectionIdEnum = z.enum([
  'hero-fullbleed', 'hero-split', 'hero-centered', 'hero-video', 'hero-gradient', 'hero-editorial',
  'nav-topbar', 'nav-sidebar', 'nav-editorial', 'nav-mega',
  'grid-masonry', 'grid-bento', 'grid-magazine', 'grid-cards-3col',
  'grid-horizontal', 'grid-table', 'grid-image-overlay', 'grid-list-editorial',
  'detail-hero-overlay', 'detail-split-sidebar', 'detail-article', 'detail-data-dense', 'detail-gallery',
  'content-featured', 'content-testimonials-carousel', 'content-testimonials-wall',
  'content-stats', 'content-timeline', 'content-faq', 'content-features', 'content-team',
  'cta-newsletter', 'cta-newsletter-split', 'cta-pricing', 'cta-download', 'cta-contact',
  'footer-dark-photo', 'footer-minimal', 'footer-multi-column', 'footer-centered',
  'util-category-scroll', 'util-breadcrumb', 'util-search-header',
  'util-filter-tabs', 'util-empty-state', 'util-pagination',
  'domain-menu-archive', 'domain-menu-category', 'domain-reservation-form', 'domain-services-list',
]).describe('Exact section renderer ID from our 50-section catalog.')

export const SectionBgEnum = z.enum([
  'default',        // bg-background
  'muted',          // bg-muted/30
  'muted-strong',   // bg-muted/50
  'accent',         // bg-primary/10
  'dark',           // bg-foreground text-background
  'dark-overlay',   // image + bg-black/70 overlay
  'gradient-down',  // bg-gradient-to-b from-background to-muted/30
  'gradient-up',    // bg-gradient-to-t from-muted/30 to-background
]).describe('Section background style. "default"=base bg, "muted"=subtle grey, "dark"=inverted, "dark-overlay"=image+scrim, "gradient-*"=directional.')

export const SpacingEnum = z.enum([
  'compact',   // py-8 md:py-12
  'normal',    // py-12 md:py-16
  'generous',  // py-16 md:py-24 lg:py-32
]).describe('Vertical padding. "compact" for data-dense, "generous" for heroes/CTAs.')

export const CardVariantEnum = z.enum([
  'elevated',      // shadow-lg hover:shadow-xl rounded-xl
  'flat',          // border border-border rounded-lg
  'glass',         // bg-card/70 backdrop-blur-md border-border/50
  'image-overlay', // image fills card, text on gradient
]).describe('Card visual style. Only for grid/detail/content sections with cards.')

export const GridColumnsEnum = z.enum(['2', '3', '4'])
  .describe('Desktop grid columns (lg breakpoint). Always 1 mobile, 2 tablet.')

export const ImageAspectEnum = z.enum(['video', 'square', '4/3', '3/2', '21/9'])
  .describe('Image aspect ratio. video=16:9, square=1:1, 21/9=cinematic.')

const TextConfigSchema = z.object({
  headline: z.string().max(80).optional().describe('Section headline. Max 80 chars.'),
  subtext: z.string().max(200).optional().describe('Supporting paragraph. Max 200 chars.'),
  buttonLabel: z.string().max(30).optional().describe('CTA button text. Max 30 chars.'),
  emptyStateMessage: z.string().max(100).optional().describe('Message when list is empty. Max 100 chars.'),
}).describe('Copywriting overrides — the only free-form text fields.')

export const SectionVisualSpecSchema = z.object({
  sectionId: SectionIdEnum,
  entityBinding: z.string().optional().describe('Entity table name (e.g. "recipes"). REQUIRED for grid/detail/content-featured/utility.'),
  background: SectionBgEnum.default('default'),
  spacing: SpacingEnum.default('normal'),
  cardVariant: CardVariantEnum.optional().describe('Card style. Only for sections that render cards.'),
  gridColumns: GridColumnsEnum.optional().describe('Desktop grid columns. Only for grid sections.'),
  imageAspect: ImageAspectEnum.optional().describe('Image aspect ratio. Only for image-bearing sections.'),
  showBadges: z.boolean().default(true).describe('Show category/tag badges on cards.'),
  showMetadata: z.boolean().default(true).describe('Show metadata line (date, time, etc.) on cards.'),
  text: TextConfigSchema.optional().describe('Copywriting overrides.'),
  limit: z.number().int().min(1).max(24).optional().describe('Max items in grid/list. 3-12 typical.'),
})

export const RouteSpecSchema = z.object({
  path: z.string().min(1).describe('Route path. Examples: "/", "/recipes/", "/recipes/$slug"'),
  sections: z.array(SectionVisualSpecSchema).min(1).max(10).describe('Ordered sections. First=top, last=bottom.'),
})

export const PageCompositionPlanV2Schema = z.object({
  routes: z.array(RouteSpecSchema).min(1).describe('All app routes. Must include "/" homepage.'),
  globalNav: SectionIdEnum.optional().describe('Nav section auto-prepended to every route.'),
  globalFooter: SectionIdEnum.optional().describe('Footer section auto-appended to every route.'),
})

// ---------------------------------------------------------------------------
// CreativeSpec — Creative Director agent output
// Sitemap + navigation + footer for a generated app.
// Visual identity (colors, fonts, styles) is handled by Design Agent tokens.
// ---------------------------------------------------------------------------

/** Coerce a value to a string array. LLMs sometimes return a bare string instead of an array. */
const toStringArray = (val: unknown): unknown =>
  typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : val

/** Parse stringified JSON. LLMs sometimes return nested structures as escaped strings. */
const tryParseJson = (val: unknown): unknown => {
  if (typeof val !== 'string') return val
  try { return JSON.parse(val) } catch { return val }
}

export const CreativeSpecSchema = z.object({
  sitemap: z
    .array(
      z.object({
        route: z.string().describe('URL path e.g. "/", "/menu/", "/menu/$slug"'),
        fileName: z.string().describe('TanStack Router file path e.g. "routes/index.tsx"'),
        componentName: z.string().describe('React component name e.g. "Homepage"'),
        purpose: z.string().describe('1-2 sentence page description'),
        brief: z.object({
          sections: z.array(z.string()).describe('Section descriptions for this page'),
          copyDirection: z.string().describe('Tone/voice for copy on this page'),
          keyInteractions: z.string().describe('Key UI interactions'),
          lucideIcons: z
            .preprocess(toStringArray, z.array(z.string()))
            .describe('Lucide icon names to use'),
          shadcnComponents: z
            .preprocess(toStringArray, z.array(z.string()))
            .describe('shadcn component names to use'),
        }),
      }),
    )
    .max(3)
    .describe('Complete sitemap with per-page generation briefs'),

  nav: z.object({
    style: z.enum(['sticky-blur', 'transparent-hero', 'sidebar', 'editorial']).describe('Navigation style'),
    logo: z.string().describe('App name or logo text'),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.string(),
        }),
      )
      .describe('Navigation links'),
    cta: z.preprocess(
      tryParseJson,
      z
        .object({
          label: z.string(),
          href: z.string(),
        })
        .nullable()
        .default(null)
        .describe('Optional CTA button in nav — null if none'),
    ),
    mobileStyle: z.enum(['sheet', 'fullscreen', 'dropdown']).describe('Mobile navigation style'),
  }),

  footer: z.object({
    style: z.enum(['multi-column', 'minimal', 'centered', 'magazine']).describe('Footer layout style'),
    columns: z.preprocess(
      tryParseJson,
      z
        .array(
          z.object({
            heading: z.string(),
            links: z.array(
              z.object({
                label: z.string(),
                href: z.string(),
              }),
            ),
          }),
        )
        .default([])
        .describe('Footer columns with links'),
    ),
    showNewsletter: z.boolean().describe('Whether to show newsletter signup'),
    socialLinks: z
      .preprocess(toStringArray, z.array(z.string()))
      .describe('Lucide icon names for social links'),
    copyright: z.string().describe('Copyright text'),
  }),
})

export type CreativeSpec = z.infer<typeof CreativeSpecSchema>
