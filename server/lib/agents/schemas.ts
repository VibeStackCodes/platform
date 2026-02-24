import { z } from 'zod'
import { AESTHETIC_DIRECTIONS, LAYOUT_STRATEGIES } from '../design-system'

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
  complexity: z.enum(['simple', 'moderate', 'ambitious']).describe(
    'How complex is this app to build? Judge by the number of distinct features, pages, and interactions the user is asking for — not by the domain.',
  ),
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
    .max(8)
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

  designSystem: z.object({
    aestheticDirection: z.enum(AESTHETIC_DIRECTIONS),
    layoutStrategy: z.enum(LAYOUT_STRATEGIES),
    signatureDetail: z.string().min(1),
    colorPalette: z.object({
      primary: z.string().describe('Hex color for primary buttons and links'),
      secondary: z.string().describe('Hex color for secondary/muted surfaces'),
      accent: z.string().describe('Hex color for accent highlights and badges'),
      background: z.string().describe('Hex color for page background'),
      text: z.string().describe('Hex color for body text'),
      primaryForeground: z.string().default('#ffffff').describe('Hex color for text on primary buttons'),
      foreground: z.string().default('#1a1a1a').describe('Hex color for body text (alias for text)'),
      muted: z.string().default('#f5f5f5').describe('Hex color for muted backgrounds'),
      border: z.string().default('#e5e5e5').describe('Hex color for borders and dividers'),
    }),
    typography: z.object({
      display: z.string().describe('Google Font name for headings'),
      body: z.string().describe('Google Font name for body text'),
      googleFontsUrl: z.string().optional().describe('Google Fonts CSS import URL'),
    }),
    style: z.preprocess(
      (val) => {
        // LLMs sometimes return style as "cardStyle: elevated; navStyle: editorial; ..." string
        if (typeof val === 'string') {
          const obj: Record<string, string> = {}
          for (const part of val.split(';')) {
            const [k, ...rest] = part.split(':')
            if (k && rest.length) obj[k.trim()] = rest.join(':').trim()
          }
          return obj
        }
        return val
      },
      z.object({
        borderRadius: z.string().default('0.5rem').describe('CSS border-radius, e.g. "0.5rem"'),
        cardStyle: z.enum(['flat', 'bordered', 'elevated', 'glass']).default('bordered'),
        navStyle: z.enum(['top-bar', 'sidebar', 'editorial', 'minimal', 'centered']).default('top-bar'),
        heroLayout: z.enum(['fullbleed', 'split', 'centered', 'editorial', 'none']).default('fullbleed'),
        spacing: z.enum(['compact', 'normal', 'airy']).default('normal'),
        motion: z.enum(['none', 'subtle', 'expressive']).default('subtle'),
        imagery: z.enum(['photography-heavy', 'illustration', 'minimal', 'icon-focused']).default('photography-heavy'),
      }),
    ).default({
      borderRadius: '0.5rem',
      cardStyle: 'bordered',
      navStyle: 'top-bar',
      heroLayout: 'fullbleed',
      spacing: 'normal',
      motion: 'subtle',
      imagery: 'photography-heavy',
    }),
    imageManifest: z.any().default({}),
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
