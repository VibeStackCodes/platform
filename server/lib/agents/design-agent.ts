import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { type DesignSystem, DEFAULT_TEXT_SLOTS } from '../themed-code-engine'
import { createAgentModelResolver } from './provider'

const designOutputSchema = z.object({
  colors: z.object({
    background: z.string().describe('Hex color for page background, e.g. #ffffff'),
    foreground: z.string().describe('Hex color for body text, e.g. #111111'),
    primary: z.string().describe('Hex color for primary buttons and links'),
    primaryForeground: z.string().describe('Hex color for text on primary buttons'),
    secondary: z.string().describe('Hex color for secondary/muted surfaces'),
    accent: z.string().describe('Hex color for accent highlights and badges'),
    muted: z.string().describe('Hex color for muted backgrounds like sidebars'),
    border: z.string().describe('Hex color for borders and dividers'),
  }),
  fonts: z.object({
    display: z.string().describe('Google Font name for headings, e.g. "Playfair Display"'),
    body: z.string().describe('Google Font name for body text, e.g. "Source Sans 3"'),
  }),
  style: z.object({
    borderRadius: z.string().describe('CSS border-radius value, e.g. "0.5rem"'),
    cardStyle: z.enum(['flat', 'bordered', 'elevated', 'glass']),
    navStyle: z.enum(['top-bar', 'sidebar', 'editorial', 'minimal', 'centered']),
    heroLayout: z.enum(['fullbleed', 'split', 'centered', 'editorial', 'none']),
    spacing: z.enum(['compact', 'normal', 'airy']),
    motion: z.enum(['none', 'subtle', 'expressive']),
    imagery: z.enum(['photography-heavy', 'illustration', 'minimal', 'icon-focused']),
  }),
})

const designAgent = new Agent({
  id: 'design-agent',
  name: 'Design Agent',
  model: createAgentModelResolver('orchestrator'),
  instructions: `You are a visual designer for web applications. Given an app description, output a cohesive color palette, font pairing, and page style tokens.

COLOR RULES:
- Output hex colors (#rrggbb format).
- background + foreground must have WCAG AA contrast (4.5:1 minimum).
- primary is the brand color — used for buttons, links, active states.
- primaryForeground must contrast against primary (usually white or very dark).
- secondary is a subtle surface color (slightly tinted background).
- accent is a highlight color — badges, notifications, callouts. Can be vibrant.
- muted is a desaturated background for sidebars, table headers, disabled states.
- border is a subtle line color between sections.
- Avoid pure black (#000000) for foreground — use a tinted near-black.
- Avoid pure white (#ffffff) for background when the design calls for warmth — use off-whites.

FONT RULES:
- Pick fonts available on Google Fonts.
- display font: distinctive, characterful — used for h1-h3. Can be serif, sans-serif, or display.
- body font: highly readable — used for paragraphs and UI text. Usually sans-serif.
- Avoid overused defaults: Inter, Roboto, Open Sans, Lato, Montserrat.
- Good pairings contrast: serif display + sans body, geometric display + humanist body.

STYLE RULES:
- cardStyle: "flat" (no shadow/border), "bordered" (subtle border), "elevated" (shadow), "glass" (translucent blur)
- navStyle: "top-bar" (horizontal nav), "sidebar" (vertical), "editorial" (minimal top), "minimal" (just logo + links), "centered" (logo center, links around)
- heroLayout: "fullbleed" (full-width image), "split" (text left, image right), "centered" (centered text over image), "editorial" (text-heavy, minimal image), "none" (no hero)
- spacing: "compact" (dense), "normal" (standard), "airy" (generous whitespace)
- motion: "none" (static), "subtle" (fade-in, hover effects), "expressive" (scroll animations, parallax)
- imagery: "photography-heavy" (full-bleed photos), "illustration" (custom art), "minimal" (sparse images), "icon-focused" (icons over photos)
- borderRadius: use "0" for brutalist, "0.375rem" for standard, "0.75rem" for soft, "1rem" for very rounded

Match the visual tone to the app's domain and audience. A law firm wants "elevated" cards, serif fonts, and muted colors. A kids' app wants rounded corners, playful fonts, and vibrant accents.`,
  defaultOptions: { modelSettings: { temperature: 0.7 } },
})

export async function runDesignAgent(
  appName: string,
  prd: string,
): Promise<{
  tokens: DesignSystem
  tokensUsed: number
}> {
  const prompt = `Design the visual identity for this web application.

App name: ${appName}

Product requirements:
${prd}`

  const result = await designAgent.generate(prompt, {
    structuredOutput: { schema: designOutputSchema },
  })

  const output = designOutputSchema.parse(result.object ?? result)

  const displayEncoded = encodeURIComponent(output.fonts.display).replace(/%20/g, '+')
  const bodyEncoded = encodeURIComponent(output.fonts.body).replace(/%20/g, '+')
  const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${displayEncoded}:wght@400;500;600;700&family=${bodyEncoded}:wght@300;400;500;600&display=swap`

  const tokens: DesignSystem = {
    name: '',
    fonts: {
      display: output.fonts.display,
      body: output.fonts.body,
      googleFontsUrl,
    },
    colors: {
      ...output.colors,
      text: output.colors.foreground,
    },
    style: output.style,
    aestheticDirection: 'warm-neutral' as const,
    layoutStrategy: 'full-bleed' as const,
    signatureDetail: 'Subtle scroll-triggered reveal animations on content sections',
    imageManifest: {},
    authPosture: 'public',
    heroImages: [],
    heroQuery: '',
    textSlots: { ...DEFAULT_TEXT_SLOTS },
  }

  return {
    tokens,
    tokensUsed: result.totalUsage?.totalTokens ?? 0,
  }
}
