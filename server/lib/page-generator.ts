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
import type { CreativeSpec } from './agents/schemas'
import { getStaticDesignRules } from './design-knowledge'
import type { SchemaContract } from './schema-contract'

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
  /** Required for non-static archetypes; omit for static apps */
  contract?: SchemaContract
  /** Unsplash image URLs to use instead of placeholders. Fetched before generation. */
  imagePool?: string[]
  /** Called when a page starts generating */
  onPageStart?: (fileName: string, route: string, componentName: string, index: number, total: number) => void
  /** Called when a page finishes generating */
  onPageComplete?: (fileName: string, route: string, componentName: string, lineCount: number, code: string, index: number, total: number) => void
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
export interface PageGeneratorResult {
  pages: GeneratedPage[]
  usage: { inputTokens: number; outputTokens: number }
}

export async function generatePages(input: PageGeneratorInput): Promise<PageGeneratorResult> {
  const { spec, contract, imagePool, onPageStart, onPageComplete } = input
  const total = spec.sitemap.length

  const results = await Promise.all(
    spec.sitemap.map(async (page, index) => {
      onPageStart?.(page.fileName, page.route, page.componentName, index, total)
      const result = await generateSinglePage(page, spec, contract ?? null, imagePool ?? [])
      const lineCount = result.content.split('\n').length
      const codePreview = result.content.split('\n').slice(0, 50).join('\n')
      onPageComplete?.(result.fileName, page.route, page.componentName, lineCount, codePreview, index, total)
      return result
    }),
  )

  const usage = results.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  )

  return {
    pages: results.map(({ inputTokens: _i, outputTokens: _o, ...page }) => page),
    usage,
  }
}

// ---------------------------------------------------------------------------
// Internal: single page generation
// ---------------------------------------------------------------------------

async function generateSinglePage(
  page: CreativeSpec['sitemap'][number],
  spec: CreativeSpec,
  contract: SchemaContract | null,
  imagePool: string[],
): Promise<GeneratedPage & { inputTokens: number; outputTokens: number }> {
  const systemPrompt = buildPageGenSystemPrompt(spec, imagePool)
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
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Internal: system prompt
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the LLM page generator.
 *
 * Exported so tests can validate the prompt's closed vocabulary, forbidden
 * section, and absence of Supabase / TanStack Query references.
 */
export function buildPageGenSystemPrompt(spec: CreativeSpec, imagePool: string[] = []): string {
  return `You are an expert React developer generating a complete TanStack Router page file (.tsx).

## Output Format
Output ONLY the complete .tsx file content. No markdown, no explanation, no code fences.

## CLOSED VOCABULARY — Allowed Imports (EXHAUSTIVE)

You may ONLY import from the modules listed below. Every allowed export name is listed.
If a module or export is not listed here, you MUST NOT use it.

### React
\`\`\`tsx
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
\`\`\`

### TanStack Router
\`\`\`tsx
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
\`\`\`

### Utility
\`\`\`tsx
import { cn } from '@/lib/utils'
\`\`\`

### Lucide Icons (any icon name — tree-shakeable, all 1000+ icons available)
\`\`\`tsx
import { ArrowRight, Star, Heart, /* any valid lucide icon name */ } from 'lucide-react'
\`\`\`

### shadcn/ui Components (EXACT exports listed — do NOT import sub-exports not listed)
\`\`\`tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
\`\`\`

## FORBIDDEN — Do NOT use any of these

- Any database client, data-fetching library, or server communication library
- Any data-fetching or server-state hook (only useState/useEffect from the CLOSED VOCABULARY)
- Form validation libraries (no schema validators, no form libraries)
- \`fetch()\`, \`window.location\`, \`document.querySelector()\`
- Any npm package not listed in the CLOSED VOCABULARY above
- Custom hooks, custom context providers
- Inline \`<style>\` tags (use Tailwind only)
- Importing from any path not starting with \`@/components/ui/\`, \`@/lib/\`, \`lucide-react\`, \`react\`, or \`@tanstack/react-router\`

ONLY import from the CLOSED VOCABULARY — anything else will cause a build failure.

## STATIC CONTENT RULE

ALL content is static — hardcode text, lists, images, and cards directly in JSX.
Use placeholder text that sounds real (not "Lorem ipsum").
${imagePool.length > 0
    ? `For images, use these Unsplash URLs (cycle through them, reuse as needed):
${imagePool.map((url, i) => `  ${i + 1}. ${url}`).join('\n')}
Add \`?w=800&q=80\` for hero/banner images, \`?w=400&q=80\` for cards/thumbnails.
Always include descriptive alt text.`
    : `For images, use placeholder URLs like \`https://placehold.co/600x400\` with descriptive alt text.`}
No data fetching, no API calls, no database queries.

## Route File Structure
\`\`\`tsx
import { createFileRoute } from '@tanstack/react-router'
// ... other imports from CLOSED VOCABULARY only

export const Route = createFileRoute('{fileRoute}')({
  component: {ComponentName},
})

function {ComponentName}() {
  // component body — static content only
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
${getStaticDesignRules()}

## Mood/Aesthetic
${spec.visualDna.moodBoard}

## Critical Rules
1. Do NOT generate navigation or footer — these are in __root.tsx
2. Use CSS variable colors ONLY (bg-primary, not #hex)
3. All images: alt text required, aspect ratio classes, object-cover
4. Touch targets: min-h-[44px] on all interactive elements
5. Use Link from @tanstack/react-router for internal navigation
6. ALL content is hardcoded — no data fetching, no API calls, no database queries
7. ONLY import from the CLOSED VOCABULARY — anything else will cause a build failure
8. Component function name MUST NOT conflict with any imported icon name. If you import { Home } from lucide-react, do NOT name your function "Home" — use "Homepage" or "{ComponentName}" instead. Rename the icon import if needed: import { Home as HomeIcon } from 'lucide-react'.`
}

// ---------------------------------------------------------------------------
// Internal: user prompt per page
// ---------------------------------------------------------------------------

function buildPageGenUserPrompt(
  page: CreativeSpec['sitemap'][number],
  spec: CreativeSpec,
  _contract: SchemaContract | null,
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
Content: ALL STATIC — hardcode everything directly in JSX
`

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
