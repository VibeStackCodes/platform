/**
 * Creative Director Agent
 *
 * Takes analyst output (SchemaContract + PRD metadata) and produces a
 * CreativeSpec — a complete visual identity + sitemap contract for the app.
 *
 * Architecture: Two-stage structured output (HN consensus pattern)
 *   Stage 1: Free-form LLM reasoning about visual identity, archetype, and sitemap
 *   Stage 2: Cheap model formats reasoning into validated CreativeSpec JSON
 *
 * The Creative Director ENHANCES the theme tokens selected by the Design Agent.
 * It never contradicts chosen fonts or colors — it only adds depth (moodboard,
 * motion preset, per-page briefs, nav/footer contracts, auth config).
 */

import { Agent } from '@mastra/core/agent'
import { createAgentModelResolver } from './agents/provider'
import { CreativeSpecSchema, type CreativeSpec } from './agents/schemas'
import { getDesignKnowledge } from './design-knowledge'
import type { SchemaContract } from './schema-contract'
import type { ThemeTokens } from './themed-code-engine'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreativeDirectorInput {
  userPrompt: string
  appName: string
  appDescription: string
  contract: SchemaContract
  tokens: ThemeTokens
}

// ---------------------------------------------------------------------------
// Agent instances (singletons — created once, reused across calls)
// ---------------------------------------------------------------------------

const creativeDirectorAgent = new Agent({
  id: 'creative-director',
  name: 'Creative Director',
  model: createAgentModelResolver('creativeDirector'),
  instructions: `You are an elite creative director designing complete web application experiences.

Your job is to take a user's app description, database schema, and pre-selected theme tokens,
then produce a detailed CreativeSpec that covers:
1. App archetype classification (static/content/crud)
2. Full visual DNA — typography, color palette, motion, card style, texture
3. Complete sitemap with per-page generation briefs
4. Consistent nav and footer contracts
5. Auth configuration

${getDesignKnowledge()}

## Your Core Responsibilities

### 1. Archetype Classification
- static: No database involvement. All content hardcoded inline. Only static routes.
- content: Read-only DB access. Users browse entities, no write forms on public pages.
- crud: Full create/read/update/delete. Requires auth. Private routes for mutations.

Classify by checking: does the schema have tables? Are users expected to create/edit data?

### 2. Visual DNA
The theme tokens (fonts, colors, card style, motion) have ALREADY been chosen by the Design Agent.
You MUST use those tokens as the foundation. Your job is to:
- Preserve the chosen display and body fonts exactly as provided
- Preserve the primary, accent, background, and foreground colors
- Add the missing palette entries: mutedForeground, card, destructive
- Define headlineStyle and bodyStyle Tailwind classes matching the font pair
- Write a moodBoard: 2-3 sentences describing the aesthetic direction
- Choose a visualTexture: "grain overlay", "gradient mesh", "subtle noise", or "none"
- Pick motionPreset matching the app domain (data-heavy→none, lifestyle→subtle, creative→expressive)

### 3. Sitemap Design
Every app MUST include:
- "/" → homepage (always)
- "/about" → about page (almost always, skip only for pure admin apps)

For content/crud archetypes:
- One list route per public entity (domain-specific name, e.g. /menu/ not /menu-items/)
- One detail route per public entity (e.g. /menu/$slug)
- For crud: add /new and /$id/edit routes per entity

For crud archetype:
- "/auth/login" and "/auth/register" routes

Route naming: use domain language, not generic CRUD names.
File naming: follow TanStack Router file-based routing exactly.
  - "/" → routes/index.tsx
  - "/about" → routes/about.tsx
  - "/menu/" → routes/menu/index.tsx
  - "/menu/$slug" → routes/menu/$slug.tsx

### 4. Per-Page Briefs
Each page in the sitemap MUST have a brief with:
- sections: array of 3-8 descriptive strings (what appears on the page)
- copyDirection: tone and voice for copy on this page
- keyInteractions: the primary user action on this page
- lucideIcons: 3-6 Lucide icon names appropriate for this page
- shadcnComponents: 3-8 shadcn component names used on this page

### 5. Nav Contract
Define the full navigation:
- Style: sticky-blur | transparent-hero | sidebar | editorial
- Links array: label + href for each main navigation link
- Optional CTA button (e.g. "Book a table", "Get started")
- Mobile style: sheet | fullscreen | dropdown

### 6. Footer Contract
Define the footer:
- Style: multi-column | minimal | centered | magazine
- Columns with links (for multi-column)
- Social links (Lucide icon names)
- Copyright text

### 7. Auth Configuration
Based on the authPosture from theme tokens:
- public → all routes public, privateRoutes empty
- hybrid → list/detail public, mutation routes private
- private → all routes private except /auth/*

## Critical Rules

1. NEVER contradict theme token fonts or colors — enhance, don't replace
2. Use domain-specific route names — /journal/ not /posts/, /menu/ not /menu-items/
3. Every page MUST have at least 3 sections in its brief
4. Static apps: dataRequirements="none" for all pages
5. Content apps: dataRequirements="read-only" for entity pages
6. CRUD apps: dataRequirements="read-write" for new/edit pages
7. Reasoning must be thorough — explain WHY for every visual and structural choice
8. Be opinionated — avoid safe/generic choices, embrace the domain's personality`,
  defaultOptions: { modelSettings: { temperature: 0.4 } },
})

const creativeSpecFormatterAgent = new Agent({
  id: 'creative-spec-formatter',
  name: 'Creative Spec Formatter',
  model: createAgentModelResolver('composer'),
  instructions: `You are a precise JSON formatter. You receive creative direction text and format it exactly into the CreativeSpec JSON schema. Preserve all details from the reasoning — do not add, remove, or reinterpret any information. Extract exact values for all required fields.`,
  defaultOptions: { modelSettings: { temperature: 0.1 } },
})

// ---------------------------------------------------------------------------
// Prompt builder (internal)
// ---------------------------------------------------------------------------

function buildUserPrompt(input: CreativeDirectorInput): string {
  const { userPrompt, appName, appDescription, contract, tokens } = input

  const tableLines = contract.tables
    .map((t) => {
      const cols = t.columns
        .map((c) => `${c.name} (${c.type})`)
        .join(', ')
      return `  ${t.name}: ${cols}`
    })
    .join('\n')

  // Static override: when no tables exist, force static archetype
  const staticOverride = contract.tables.length === 0
    ? `\n\nIMPORTANT — STATIC APP OVERRIDE:
This app has ZERO database tables. You MUST:
- Set archetype to "static"
- Set dataRequirements to "none" for ALL pages
- Set auth.required to false
- Set publicRoutes to all routes
- Do NOT include any /auth/* routes
- ALL content will be hardcoded in JSX — no database, no API calls`
    : ''

  return `App Name: ${appName}
App Description: ${appDescription}
User Request: ${userPrompt}

Database Schema (tables):
${tableLines || '  (no tables — static app)'}${staticOverride}

Theme Tokens (already selected — use as foundation):
- Fonts: ${tokens.fonts.display} / ${tokens.fonts.body}
- Colors: primary=${tokens.colors.primary}, accent=${tokens.colors.accent}, bg=${tokens.colors.background}, fg=${tokens.colors.foreground}
- Style: card=${tokens.style.cardStyle}, nav=${tokens.style.navStyle}, hero=${tokens.style.heroLayout}
- Motion: ${tokens.style.motion}
- Auth: ${tokens.authPosture}

Produce a complete CreativeSpec with:
1. Archetype classification (static/content/crud) — choose based on schema tables and user intent
2. Visual DNA: use the theme tokens as your foundation.
   - displayFont MUST be "${tokens.fonts.display}" — DO NOT change it
   - bodyFont MUST be "${tokens.fonts.body}" — DO NOT change it
   - googleFontsUrl: provide the full Google Fonts import URL for both fonts (e.g. "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+3:wght@400;600&display=swap")
   - background MUST be "${tokens.colors.background}", foreground MUST be "${tokens.colors.foreground}"
   - primary MUST be "${tokens.colors.primary}", accent MUST be "${tokens.colors.accent}"
   - Fill in: primaryForeground (white or black for contrast), muted (subtle bg tint), mutedForeground (#6b7280), border (subtle separator), card (slightly off-bg), destructive (#ef4444)
   - Add headlineStyle, bodyStyle Tailwind classes, moodBoard, visualTexture, borderRadius
3. Complete sitemap: every route the app needs, with per-page briefs (sections, copyDirection, keyInteractions, lucideIcons, shadcnComponents). Cap at 15 routes maximum.
4. Nav contract: style, logo text, links array, optional CTA (use null if none), mobile style
5. Footer contract: style, columns (as a JSON array of {heading, links} objects), socialLinks (Lucide icon names), copyright text
6. Auth configuration: based on authPosture="${tokens.authPosture}"

CRITICAL RULES:
- NEVER use Inter, Roboto, Arial, or system fonts for displayFont/bodyFont — use the fonts from the theme tokens above
- NEVER leave palette values empty — every color MUST have a valid hex value
- footer.columns MUST be a JSON array, NOT a text string
- nav.cta MUST be a JSON object {label, href} or null, NOT a text string

Think through the visual identity and every page thoroughly before settling on your decisions.`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the Creative Director to produce a CreativeSpec.
 *
 * Uses a two-stage structured output pattern:
 *   Stage 1: Free-form reasoning about visual identity and sitemap
 *   Stage 2: Format reasoning into validated CreativeSpec JSON
 *
 * Throws on invalid output — no fallbacks, no retry loops.
 */
export interface CreativeDirectorResult {
  spec: CreativeSpec
  usage: { inputTokens: number; outputTokens: number }
}

export async function runCreativeDirector(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
  const userMessage = buildUserPrompt(input)

  // Stage 1: Free-form reasoning — let the agent think deeply
  const stage1 = await creativeDirectorAgent.generate(userMessage)

  const stage1Text = stage1.text ?? ''
  if (!stage1Text) {
    throw new Error('[creative-director] Stage 1 returned empty reasoning')
  }

  // Stage 2: Format reasoning into CreativeSpec JSON schema
  const formatPrompt = `Format this creative direction into a CreativeSpec JSON object. Extract and structure all the details precisely — do not invent anything not present in the reasoning below.

CREATIVE DIRECTION:
${stage1Text}

FORMAT INTO: CreativeSpec with fields: archetype, visualDna (typography, palette, motionPreset, borderRadius, cardStyle, imagery, visualTexture, moodBoard), sitemap (array of pages with route, fileName, componentName, purpose, dataRequirements, entities, brief), nav (style, logo, links, cta, mobileStyle), footer (style, columns, showNewsletter, socialLinks, copyright), auth (required, publicRoutes, privateRoutes, loginRoute).`

  const stage2 = await creativeSpecFormatterAgent.generate(formatPrompt, {
    structuredOutput: { schema: CreativeSpecSchema },
  })

  // Parse — throws if LLM returned invalid structure
  const spec = CreativeSpecSchema.parse(stage2.object ?? stage2)

  // Aggregate token usage from both stages
  const s1u = stage1.usage ?? { inputTokens: 0, outputTokens: 0 }
  const s2u = stage2.usage ?? { inputTokens: 0, outputTokens: 0 }

  return {
    spec,
    usage: {
      inputTokens: (s1u.inputTokens ?? 0) + (s2u.inputTokens ?? 0),
      outputTokens: (s1u.outputTokens ?? 0) + (s2u.outputTokens ?? 0),
    },
  }
}
