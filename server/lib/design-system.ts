import { z } from 'zod'

// ---------------------------------------------------------------------------
// Aesthetic + Layout enums (from system prompt <design_system>)
// ---------------------------------------------------------------------------

export const AESTHETIC_DIRECTIONS = [
  'editorial', 'brutalist', 'soft-organic', 'luxury',
  'retro-futuristic', 'playful-bold', 'minimal-swiss',
  'dark-cinematic', 'glassmorphic', 'neo-corporate',
  'hand-drawn', 'art-deco', 'cyberpunk', 'warm-neutral',
  'dashboard-dense',
] as const

export const LAYOUT_STRATEGIES = [
  'asymmetric-grid', 'full-bleed', 'card-based', 'sidebar-main',
  'bento-grid', 'single-column-editorial', 'split-screen',
  'overlapping-layers', 'scroll-driven',
] as const

export type AestheticDirection = (typeof AESTHETIC_DIRECTIONS)[number]
export type LayoutStrategy = (typeof LAYOUT_STRATEGIES)[number]

// ---------------------------------------------------------------------------
// Image manifest (from system prompt <image_system>)
// ---------------------------------------------------------------------------

export const ImageEntrySchema = z.object({
  query: z.string().min(1),
  width: z.number().int().min(100).max(2400),
  height: z.number().int().min(100).max(2400),
  alt: z.string(),
  role: z.enum(['hero', 'feature', 'testimonial', 'background', 'product', 'about', 'card']),
  loading: z.enum(['eager', 'lazy']),
  crop: z.enum(['faces']).optional(),
})

export type ImageEntry = z.infer<typeof ImageEntrySchema>

export const PageImageManifestSchema = z.record(z.string(), ImageEntrySchema)
export type PageImageManifest = z.infer<typeof PageImageManifestSchema>

// ---------------------------------------------------------------------------
// Text slots (preserved from ThemeTokens)
// ---------------------------------------------------------------------------

export const TextSlotsSchema = z.object({
  hero_headline: z.string(),
  hero_subtext: z.string(),
  about_paragraph: z.string(),
  cta_label: z.string(),
  empty_state: z.string(),
  footer_tagline: z.string(),
})

export type TextSlots = z.infer<typeof TextSlotsSchema>

export const DEFAULT_TEXT_SLOTS: TextSlots = {
  hero_headline: 'Welcome to your new app',
  hero_subtext: 'A modern web application built for speed and simplicity.',
  about_paragraph: 'This app was built with modern web technologies for a seamless experience.',
  cta_label: 'Get started',
  empty_state: 'No items yet. Create your first one to get started.',
  footer_tagline: 'Built with care.',
}

// ---------------------------------------------------------------------------
// DesignSystem (replaces ThemeTokens)
// ---------------------------------------------------------------------------

export const DesignSystemSchema = z.object({
  name: z.string(),

  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    text: z.string(),
    primaryForeground: z.string().default('#ffffff'),
    foreground: z.string().default('#1a1a1a'),
    muted: z.string().default('#f5f5f5'),
    border: z.string().default('#e5e5e5'),
  }),

  fonts: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string().optional(),
    googleFontsUrl: z.string(),
  }),

  style: z.object({
    borderRadius: z.string().default('0.5rem'),
    cardStyle: z.enum(['flat', 'bordered', 'elevated', 'glass']).default('bordered'),
    navStyle: z.enum(['top-bar', 'sidebar', 'editorial', 'minimal', 'centered']).default('top-bar'),
    heroLayout: z.enum(['fullbleed', 'split', 'centered', 'editorial', 'none']).default('fullbleed'),
    spacing: z.enum(['compact', 'normal', 'airy']).default('normal'),
    motion: z.enum(['none', 'subtle', 'expressive']).default('subtle'),
    imagery: z.enum(['photography-heavy', 'illustration', 'minimal', 'icon-focused']).default('photography-heavy'),
  }),

  aestheticDirection: z.enum(AESTHETIC_DIRECTIONS),
  layoutStrategy: z.enum(LAYOUT_STRATEGIES),
  signatureDetail: z.string().min(1),

  imageManifest: z.record(z.string(), PageImageManifestSchema).default({}),

  authPosture: z.enum(['public', 'private', 'hybrid']).default('public'),
  heroImages: z.array(z.object({
    url: z.string(),
    alt: z.string(),
    photographer: z.string().default('Unsplash'),
  })).default([]),
  heroQuery: z.string().default(''),
  textSlots: TextSlotsSchema.default(DEFAULT_TEXT_SLOTS),
})

export type DesignSystem = z.infer<typeof DesignSystemSchema>
