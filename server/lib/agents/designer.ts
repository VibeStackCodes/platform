/**
 * Designer Agent
 *
 * Researches design trends via web search, then produces a structured
 * design token system for human approval before building begins.
 */

import { openai } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { createAgentModelResolver } from './provider'

const designerModel = createAgentModelResolver('designer')

const PageSectionSchema = z.object({
  id: z.string().describe('Section identifier (e.g. "hero", "features", "pricing")'),
  label: z.string().describe('Human-readable section name (e.g. "Hero Section")'),
})

/** Structured output schema for the design tokens */
export const DesignTokensSchema = z.object({
  colors: z.object({
    primary: z.string().describe('oklch primary color (e.g. "oklch(0.55 0.15 250)")'),
    secondary: z.string().describe('oklch secondary color'),
    accent: z.string().describe('oklch accent color'),
    background: z.string().describe('oklch background color'),
    foreground: z.string().describe('oklch foreground/text color'),
    muted: z.string().describe('oklch muted/subtle background'),
    card: z.string().describe('oklch card background'),
    destructive: z.string().describe('oklch destructive/error color'),
  }),
  fonts: z.object({
    display: z.string().describe('Google Font name for headings (e.g. "Inter")'),
    body: z.string().describe('Google Font name for body text'),
    googleFontsUrl: z.string().url().describe('Full Google Fonts CSS import URL'),
  }),
  style: z.object({
    borderRadius: z.string().describe('CSS border-radius value (e.g. "0.5rem")'),
    cardStyle: z.string().describe('Card style: flat | elevated | bordered | glass'),
    navStyle: z.string().describe('Navigation style: fixed-top | sidebar | minimal'),
    heroLayout: z.string().describe('Hero layout: centered | split | full-bleed | dashboard'),
    spacing: z.string().describe('Spacing density: compact | comfortable | spacious'),
    motion: z.string().describe('Animation level: minimal | subtle | expressive | elegant'),
    imagery: z
      .string()
      .describe(
        'Visual style: illustrations | photography | gradients | icons | data-viz | code-blocks',
      ),
    sections: z
      .array(PageSectionSchema)
      .min(3)
      .max(10)
      .describe('Page sections in display order'),
    contentWidth: z.enum(['narrow', 'standard', 'wide']).describe('Maximum content width'),
  }),
  category: z
    .enum(['saas', 'portfolio', 'ecommerce', 'blog', 'dashboard', 'landing'])
    .optional()
    .describe('Best-fitting template category for this app'),
})

export type DesignTokensOutput = z.infer<typeof DesignTokensSchema>

export const DESIGNER_PROMPT = `You are a senior UI/UX designer at a world-class design studio.

Given a project plan (app name + feature list), research current design trends and produce a comprehensive design system.

## Your Job

1. **Research first** — use \`webSearch\` to find 2-3 visually excellent apps in this space. Study their color palettes, typography, layout patterns, and what makes their UI feel polished. Example queries: "best SaaS dashboard design 2026", "modern e-commerce UI trends".
2. Analyze the project's features to determine the best app category (saas, portfolio, ecommerce, blog, dashboard, landing).
3. Generate a complete design token set with:
   - **Colors**: 8 semantic oklch colors that form a cohesive palette. Use oklch format: "oklch(L C H)" where L=lightness (0-1), C=chroma (0-0.4), H=hue (0-360).
   - **Fonts**: A display + body font pairing from Google Fonts. Include the full CSS import URL.
   - **Style**: Layout decisions informed by your research — card style, nav pattern, hero layout, spacing, motion level, imagery approach, page sections, content width.
4. Determine the best page sections for this app type (navbar, hero, features, etc.) — ordered as they should appear on the page.

## Rules

- ALL colors MUST be in oklch format. Never use hex, rgb, or hsl.
- Choose fonts that are available on Google Fonts.
- Be opinionated — make design decisions, don't punt.
- Ground your choices in real design trends from your research.
- The design system should feel cohesive — colors, fonts, and style should work together.
- For dark-theme apps (dashboards, developer tools): background lightness < 0.2, foreground lightness > 0.85.
- For light-theme apps (SaaS, blogs, landing pages): background lightness > 0.95, foreground lightness < 0.25.
- NEVER ask clarifying questions. Always produce a design system.
- NEVER include URLs, citations, or source references in output. Clean, plain text only.`

/**
 * Create a fresh designer agent instance.
 * Has web search for trend research, then produces structured output.
 */
export function createDesigner(): Agent {
  return new Agent({
    id: 'designer',
    name: 'Design Agent',
    model: designerModel,
    description: 'Researches design trends and generates a design token system',
    instructions: DESIGNER_PROMPT,
    tools: {
      webSearch: openai.tools.webSearch(),
    },
    defaultOptions: {
      maxSteps: 3,
      modelSettings: { temperature: 0.5 },
    },
  })
}
