/**
 * page-generator.ts
 *
 * Parallel React route file (.tsx) generator.
 *
 * Takes a CreativeSpec + SchemaContract and generates all page route files
 * concurrently using generateText() from the Vercel AI SDK. Each page is
 * an independent stateless text generation call — safe for Promise.all().
 *
 * Architecture notes:
 * - Uses raw generateText() (NOT Mastra Agent) for parallel execution safety.
 * - Each page gets its own provider instance with per-call Helicone tracking.
 * - No rate limiting applied — OpenAI handles concurrency internally.
 * - Static pages (dataRequirements === 'none') never include Supabase/Query code.
 */

import { generateText } from 'ai'
import { createHeliconeProvider, PIPELINE_MODELS } from './agents/provider'
import { getCondensedDesignRules } from './design-knowledge'
import type { SchemaContract } from './schema-contract'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisualDna {
  typography: {
    displayFont: string
    bodyFont: string
    googleFontsUrl: string
    headlineStyle: string
    bodyStyle: string
  }
  palette: {
    background: string
    foreground: string
    primary: string
    primaryForeground: string
    accent: string
    muted: string
    mutedForeground: string
    border: string
    card: string
    destructive: string
  }
  motionPreset: 'none' | 'subtle' | 'expressive'
  borderRadius: string
  cardStyle: 'elevated' | 'flat' | 'glass' | 'bordered'
  imagery: 'photography-heavy' | 'illustration' | 'minimal' | 'icon-focused'
  visualTexture: string
  moodBoard: string
}

export interface SitemapEntry {
  route: string
  fileName: string
  componentName: string
  purpose: string
  dataRequirements: 'none' | 'read-only' | 'read-write'
  entities?: string[]
  brief: {
    sections: string[]
    copyDirection: string
    keyInteractions: string
    lucideIcons: string[]
    shadcnComponents: string[]
  }
}

export interface NavConfig {
  style: string
  logo: string
  links: Array<{ label: string; href: string }>
  cta?: { label: string; href: string }
  mobileStyle: string
}

export interface FooterConfig {
  style: string
  columns?: Array<{ heading: string; links: Array<{ label: string; href: string }> }>
  showNewsletter: boolean
  socialLinks: string[]
  copyright: string
}

export interface AuthConfig {
  required: boolean
  publicRoutes: string[]
  privateRoutes: string[]
  loginRoute: string
}

export interface CreativeSpec {
  archetype: 'static' | 'content' | 'crud'
  visualDna: VisualDna
  sitemap: SitemapEntry[]
  nav: NavConfig
  footer: FooterConfig
  auth: AuthConfig
}

export interface GeneratedPage {
  /** e.g. "routes/index.tsx" */
  fileName: string
  /** e.g. "Homepage" */
  componentName: string
  /** Complete .tsx file content */
  content: string
  /** URL path e.g. "/" */
  route: string
}

export interface PageGeneratorInput {
  spec: CreativeSpec
  contract: SchemaContract
  /** Placeholder Supabase URL for queries */
  supabaseUrl: string
  /** Placeholder anon key */
  supabaseAnonKey: string
}

// ---------------------------------------------------------------------------
// Model constant
// ---------------------------------------------------------------------------

const PAGE_GEN_MODEL = PIPELINE_MODELS.pageGen

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate all page route files in parallel.
 * Each page in spec.sitemap becomes one GeneratedPage with a complete .tsx file.
 */
export async function generatePages(input: PageGeneratorInput): Promise<GeneratedPage[]> {
  const { spec, contract } = input

  const results = await Promise.all(
    spec.sitemap.map((page) => generateSinglePage(page, spec, contract)),
  )

  return results
}

// ---------------------------------------------------------------------------
// Internal: single page generation
// ---------------------------------------------------------------------------

async function generateSinglePage(
  page: SitemapEntry,
  spec: CreativeSpec,
  contract: SchemaContract,
): Promise<GeneratedPage> {
  const systemPrompt = buildPageGenSystemPrompt(spec)
  const userPrompt = buildPageGenUserPrompt(page, spec, contract)

  const provider = createHeliconeProvider({ userId: 'pipeline', agentName: 'page-gen' })

  const result = await generateText({
    model: provider(PAGE_GEN_MODEL),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 8000,
  })

  const content = extractTsxContent(result.text)

  return {
    fileName: page.fileName,
    componentName: page.componentName,
    content,
    route: page.route,
  }
}

// ---------------------------------------------------------------------------
// Internal: system prompt
// ---------------------------------------------------------------------------

function buildPageGenSystemPrompt(spec: CreativeSpec): string {
  return `You are an expert React developer generating a complete TanStack Router page file (.tsx).

## Output Format
Output ONLY the complete .tsx file content. No markdown, no explanation, no code fences.

## Technical Stack
- React 19 with TypeScript
- TanStack Router (createFileRoute)
- TanStack Query (useQuery) for data fetching — ONLY if dataRequirements !== 'none'
- shadcn/ui components (import from @/components/ui/{name})
- Lucide React icons (import from lucide-react)
- Tailwind CSS with tw-animate-css animation classes
- Supabase JS client (import supabase from @/lib/supabase)

## Route File Structure
\`\`\`tsx
import { createFileRoute } from '@tanstack/react-router'
// ... other imports

export const Route = createFileRoute('{fileRoute}')({
  component: {ComponentName},
})

function {ComponentName}() {
  // component body
  return (...)
}
\`\`\`

## Visual System (use these EXACTLY)
- Font classes: display font via font-[family-name:var(--font-display)], body font is default
- Colors: ONLY use Tailwind semantic colors — bg-background, text-foreground, bg-primary, text-primary-foreground, bg-accent, bg-muted, text-muted-foreground, border-border, bg-card, bg-destructive
- NEVER use hardcoded colors like #2b6cb0 or bg-blue-500
- Border radius: use rounded-[var(--radius)] or the Tailwind rounded-lg/rounded-xl classes
- Card style: ${spec.visualDna.cardStyle}
- Motion: ${spec.visualDna.motionPreset} — if not 'none', use tw-animate-css classes (animate-in, fade-in, slide-in-from-bottom-4, duration-500)

## Design Rules
${getCondensedDesignRules()}

## Mood/Aesthetic
${spec.visualDna.moodBoard}

## Critical Rules
1. Do NOT generate navigation or footer — these are in __root.tsx
2. Use CSS variable colors ONLY (bg-primary, not #hex)
3. For data pages: always include loading skeleton and empty state
4. All images: alt text required, aspect ratio classes, object-cover
5. Touch targets: min-h-[44px] on all interactive elements
6. Use Link from @tanstack/react-router for internal navigation
7. Supabase queries go through the imported supabase client:
   const { data, isLoading } = useQuery({
     queryKey: ['{table}'],
     queryFn: async () => {
       const { data, error } = await supabase.from('{table}').select('{columns}').order('created_at', { ascending: false })
       if (error) throw error
       return data
     },
   })`
}

// ---------------------------------------------------------------------------
// Internal: user prompt per page
// ---------------------------------------------------------------------------

function buildPageGenUserPrompt(
  page: SitemapEntry,
  spec: CreativeSpec,
  contract: SchemaContract,
): string {
  // Derive the createFileRoute path: normalise trailing slashes but preserve
  // the root "/" and TanStack Router's dynamic segment convention ($param).
  const fileRoutePath = deriveFileRoutePath(page.route)

  let prompt = `Generate the complete .tsx file for this route:

Route: ${page.route}
File: src/${page.fileName}
Component: ${page.componentName}
createFileRoute path: '${fileRoutePath}'

Purpose: ${page.purpose}
Data: ${page.dataRequirements}
`

  if (page.entities?.length && page.dataRequirements !== 'none') {
    prompt += `\nDatabase Tables:\n`
    for (const entityName of page.entities) {
      const table = contract.tables.find((t) => t.name === entityName)
      if (table) {
        const cols = table.columns
          .map(
            (c) =>
              `${c.name} (${c.type}${c.references ? ` → ${c.references.table}` : ''})`,
          )
          .join(', ')
        prompt += `- ${table.name}: ${cols}\n`
      }
    }
  }

  prompt += `
Sections to include:
${page.brief.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Copy direction: ${page.brief.copyDirection}
Key interactions: ${page.brief.keyInteractions}
Use these Lucide icons: ${page.brief.lucideIcons.join(', ')}
Use these shadcn components: ${page.brief.shadcnComponents.join(', ')}

Available internal links (for Link components):
${spec.sitemap.map((p) => `- ${p.route} — ${p.purpose}`).join('\n')}
`

  return prompt
}

// ---------------------------------------------------------------------------
// Internal: helpers
// ---------------------------------------------------------------------------

/**
 * Derive the TanStack Router createFileRoute path from a URL route string.
 *
 * Rules:
 * - "/" stays as "/"
 * - "/about" stays as "/about"
 * - "/recipes/" stays as "/recipes/" (trailing slash preserved for list routes)
 * - "/recipes/$id" stays as "/recipes/$id" (dynamic params preserved)
 */
function deriveFileRoutePath(route: string): string {
  // Root stays as-is
  if (route === '/') return '/'

  // Dynamic param segments and trailing slashes are already in TanStack Router convention.
  // No transformation needed — the sitemap is expected to be spec-correct.
  return route
}

/**
 * Extract .tsx content from the model response.
 * If the model ignored instructions and wrapped output in code fences, strip them.
 * Otherwise return the text as-is.
 */
function extractTsxContent(text: string): string {
  // Match ``` optionally followed by language identifier, then capture body
  const fenceMatch = text.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*\n([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()

  return text.trim()
}
