import { z } from 'zod'
import { SchemaContractSchema } from '../schema-contract'

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
 * Design decisions (colors, fonts, layout) are NOT part of the analyst output.
 * The Design Agent is the sole authority for visual identity.
 */
export const AnalystOutputSchema = z.object({
  appName: z.string().describe('Short application name (e.g., "TaskFlow")'),
  appDescription: z.string().describe('One-line app description'),
  selectedCapabilities: z.array(z.string()).default([]).describe('Capability names selected from the core catalog'),
  contract: SchemaContractSchema.describe('Database schema contract'),
})

export const ThemeSelectorInputSchema = z.object({
  userPrompt: z.string().min(5).describe('User prompt describing the app'),
  appDescription: z.string().optional().describe('App description'),
})

export const ThemeSelectorOutputSchema = z.object({
  themeName: z.string().describe('Selected theme name'),
  reasoning: z.string().describe('Why this theme was selected'),
  shouldMergeTables: z.boolean().describe('Whether to merge theme base tables with user schema'),
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
