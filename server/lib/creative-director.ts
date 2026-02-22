/**
 * Creative Director Agent
 *
 * Takes an app name and PRD, then produces a CreativeSpec — a complete
 * information architecture contract: sitemap, navigation, and footer.
 *
 * Architecture: Single-stage structured output
 *   One LLM call with structuredOutput: { schema: CreativeSpecSchema }
 */

import { Agent } from '@mastra/core/agent'
import { createAgentModelResolver } from './agents/provider'
import { CreativeSpecSchema, type CreativeSpec } from './agents/schemas'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CreativeDirectorInput {
  appName: string
  prd: string
}

export interface CreativeDirectorResult {
  spec: CreativeSpec
  usage: { inputTokens: number; outputTokens: number }
}

// ---------------------------------------------------------------------------
// Agent instance (singleton — created once, reused across calls)
// ---------------------------------------------------------------------------

const creativeDirectorAgent = new Agent({
  id: 'creative-director',
  name: 'Creative Director',
  model: createAgentModelResolver('creativeDirector'),
  instructions: `You are an information architect for web applications. Given an app name and product requirements document (PRD), you produce a sitemap, navigation, and footer contract.

## Your Responsibilities

### 1. Sitemap Design (1-3 pages)
Build what the user asked for. Match the scope to the request:
- "Build a to-do app" → 1 page: a functional React app with the to-do UI
- "Build a restaurant website" → 2-3 pages: homepage, menu, contact
- "Build a portfolio" → 1-2 pages: homepage with projects, optional about page

NEVER generate auth/login/register routes.
NEVER generate more than 3 pages.
NEVER generate CRUD-style routes like /new, /$id/edit, /admin.

Route naming: use domain language, not generic names.
File naming: follow TanStack Router file-based routing:
  - "/" → routes/index.tsx
  - "/about" → routes/about.tsx
  - "/menu" → routes/menu/index.tsx

### 2. Per-Page Briefs
Each page MUST have a brief with:
- sections: 3-8 descriptive strings (what appears on the page, top to bottom)
- copyDirection: tone and voice for the page content
- keyInteractions: primary user actions (e.g., "scroll and read" for a landing page, "add/complete/delete items" for a to-do app)
- lucideIcons: 3-6 Lucide icon names appropriate for this page
- shadcnComponents: 3-8 shadcn/ui component names used on this page

### 3. Navigation
- Style: sticky-blur | transparent-hero | sidebar | editorial
- Logo: the app name
- Links: one per page in the sitemap
- CTA: optional call-to-action button (use null if none)
- Mobile style: sheet | fullscreen | dropdown

### 4. Footer
- Style: multi-column | minimal | centered | magazine
- Columns with links (for multi-column style)
- Social links (Lucide icon names)
- Copyright text

## Critical Rules
1. Build EXACTLY what the user asked for — a to-do app is a functional app, not a landing page about to-do apps
2. Maximum 3 pages — keep it focused
3. No database, no auth, no API calls — everything runs client-side
4. Be opinionated about section composition — avoid generic "hero + features + CTA" for every app
5. For interactive apps (to-do, calculator, etc.), the keyInteractions should describe the actual app functionality, not just "scroll and read"`,
  defaultOptions: { modelSettings: { temperature: 0.4 } },
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the Creative Director to produce a CreativeSpec.
 *
 * Single-stage structured output — one LLM call returns validated JSON.
 * Throws on invalid output — no fallbacks, no retry loops.
 */
export async function runCreativeDirector(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
  const prompt = `Design the information architecture for this web application.

App Name: ${input.appName}

Product Requirements:
${input.prd}

Produce a complete sitemap (1-3 pages), navigation contract, and footer contract.`

  const result = await creativeDirectorAgent.generate(prompt, {
    structuredOutput: { schema: CreativeSpecSchema },
  })

  const spec = CreativeSpecSchema.parse(result.object ?? result)

  const usage = result.usage ?? { inputTokens: 0, outputTokens: 0 }

  return {
    spec,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    },
  }
}
