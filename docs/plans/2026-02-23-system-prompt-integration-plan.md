# System Prompt Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the VibeStack universal system prompt into pipeline-stage-specific prompts, replacing weak existing prompts. Build the image resolver edge function. Replace ThemeTokens with DesignSystem type.

**Architecture:** The system prompt is split across 5 pipeline stages: Creative Director (design decisions + image manifests), Section Renderers (image URLs + implementation rules), Page Assembler (IMAGES data layer), Page Validator (anti-patterns + quality checklist), and a new image resolver edge function at img.vibestack.codes. ThemeTokens is replaced by a richer DesignSystem type with Zod schema.

**Tech Stack:** TypeScript, Zod, Hono, Vercel Edge Functions, Upstash Redis, Unsplash API, Mastra

**Source:** `/Users/ammishra/Downloads/vibestack-system-prompt.md`

---

## Task 1: Define DesignSystem Type + Zod Schema

**Files:**
- Create: `server/lib/design-system.ts`
- Test: `tests/design-system.test.ts`

This is the new single source of truth replacing `ThemeTokens` (currently at `server/lib/themed-code-engine.ts:27-53`).

**Step 1: Write the failing test**

```typescript
// tests/design-system.test.ts
import { describe, it, expect } from 'vitest'
import {
  DesignSystemSchema,
  type DesignSystem,
  type AestheticDirection,
  type LayoutStrategy,
  type PageImageManifest,
  AESTHETIC_DIRECTIONS,
  LAYOUT_STRATEGIES,
} from '@server/lib/design-system'

describe('DesignSystemSchema', () => {
  const validDesignSystem: DesignSystem = {
    name: 'canape',
    colors: {
      primary: '#1a1a2e',
      secondary: '#16213e',
      accent: '#e94560',
      background: '#0f0f0f',
      text: '#f5f5f5',
      primaryForeground: '#ffffff',
      foreground: '#f5f5f5',
      muted: '#2a2a3e',
      border: '#333355',
    },
    fonts: {
      display: 'DM Serif Display',
      body: 'Outfit',
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700&display=swap',
    },
    style: {
      borderRadius: '0.5rem',
      cardStyle: 'bordered',
      navStyle: 'top-bar',
      heroLayout: 'fullbleed',
      spacing: 'normal',
      motion: 'subtle',
      imagery: 'photography-heavy',
    },
    aestheticDirection: 'dark-cinematic',
    layoutStrategy: 'full-bleed',
    signatureDetail: 'Parallax scroll on hero section with gradient that shifts on mouse movement',
    authPosture: 'public',
    heroImages: [{ url: 'https://img.vibestack.codes/s/restaurant-interior-moody-warm-lighting/1600/900', alt: 'Restaurant interior', photographer: 'Unsplash' }],
    heroQuery: 'restaurant interior moody warm lighting',
    textSlots: {
      hero_headline: 'Welcome',
      hero_subtext: 'Fine dining reimagined',
      about_paragraph: 'Our story.',
      cta_label: 'Reserve a table',
      empty_state: 'No items yet.',
      footer_tagline: 'Built with care.',
    },
    imageManifest: {
      '/': {
        hero: { query: 'restaurant interior moody warm lighting candlelit', width: 1600, height: 900, alt: 'Candlelit restaurant interior with warm ambient lighting', role: 'hero', loading: 'eager' },
        testimonial1: { query: 'professional headshot woman natural light confident', width: 200, height: 200, alt: 'Sarah, a regular guest', role: 'testimonial', loading: 'lazy', crop: 'faces' },
      },
    },
  }

  it('parses a valid DesignSystem', () => {
    const result = DesignSystemSchema.parse(validDesignSystem)
    expect(result.aestheticDirection).toBe('dark-cinematic')
    expect(result.layoutStrategy).toBe('full-bleed')
    expect(result.signatureDetail).toBeTruthy()
    expect(result.imageManifest['/']).toBeDefined()
  })

  it('rejects missing aestheticDirection', () => {
    const { aestheticDirection, ...missing } = validDesignSystem
    expect(() => DesignSystemSchema.parse(missing)).toThrow()
  })

  it('rejects "clean and modern" as aesthetic', () => {
    expect(() =>
      DesignSystemSchema.parse({ ...validDesignSystem, aestheticDirection: 'clean-and-modern' })
    ).toThrow()
  })

  it('exports all aesthetic direction and layout strategy enums', () => {
    expect(AESTHETIC_DIRECTIONS.length).toBeGreaterThanOrEqual(15)
    expect(LAYOUT_STRATEGIES.length).toBeGreaterThanOrEqual(9)
  })

  it('validates image manifest entries', () => {
    const badManifest = {
      '/': {
        hero: { query: 'x', width: 1600, height: 900, alt: 'test', role: 'hero', loading: 'eager' },
        // query too short (1 word) — should still parse (validation is soft)
      },
    }
    const result = DesignSystemSchema.parse({ ...validDesignSystem, imageManifest: badManifest })
    expect(result.imageManifest['/']).toBeDefined()
  })

  it('preserves backward-compat fields from ThemeTokens', () => {
    const result = DesignSystemSchema.parse(validDesignSystem)
    expect(result.style.cardStyle).toBe('bordered')
    expect(result.style.motion).toBe('subtle')
    expect(result.heroImages).toHaveLength(1)
    expect(result.textSlots.hero_headline).toBe('Welcome')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/design-system.test.ts`
Expected: FAIL — module `@server/lib/design-system` does not exist

**Step 3: Write the DesignSystem type and Zod schema**

```typescript
// server/lib/design-system.ts
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
  query: z.string().min(1),         // 4-10 word photo researcher query
  width: z.number().int().min(100).max(2400),
  height: z.number().int().min(100).max(2400),
  alt: z.string(),                   // describes what viewer sees, NOT the query
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
    // Backward-compat fields from ThemeTokens
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

  // NEW — from system prompt <design_system>
  aestheticDirection: z.enum(AESTHETIC_DIRECTIONS),
  layoutStrategy: z.enum(LAYOUT_STRATEGIES),
  signatureDetail: z.string().min(1),

  // Image manifest — per route path
  imageManifest: z.record(z.string(), PageImageManifestSchema).default({}),

  // Preserved from ThemeTokens
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
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/design-system.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add server/lib/design-system.ts tests/design-system.test.ts
git commit -m "feat: add DesignSystem type + Zod schema (replaces ThemeTokens)"
```

---

## Task 2: Build Image Resolver Edge Function

**Files:**
- Create: `packages/image-resolver/` (new Vercel project)
  - `packages/image-resolver/package.json`
  - `packages/image-resolver/tsconfig.json`
  - `packages/image-resolver/vercel.json`
  - `packages/image-resolver/api/s/[...params].ts`
  - `packages/image-resolver/api/_lib/unsplash.ts`
  - `packages/image-resolver/api/_lib/fallback-svg.ts`

This is the `img.vibestack.codes` edge function. Uses Upstash Redis for caching.

**Step 1: Create project structure**

```bash
mkdir -p packages/image-resolver/api/s packages/image-resolver/api/_lib
```

**Step 2: Write package.json**

```json
{
  "name": "@vibestack/image-resolver",
  "private": true,
  "type": "module",
  "dependencies": {
    "@upstash/redis": "^1.34.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

**Step 3: Write vercel.json**

```json
{
  "rewrites": [
    { "source": "/s/(.*)", "destination": "/api/s/$1" }
  ],
  "headers": [
    {
      "source": "/s/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Cache-Control", "value": "public, max-age=86400, stale-while-revalidate=604800" }
      ]
    }
  ]
}
```

**Step 4: Write the Unsplash search helper**

```typescript
// packages/image-resolver/api/_lib/unsplash.ts

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY!

export interface UnsplashResult {
  imageUrl: string
  downloadLocation: string
}

export async function searchUnsplash(
  query: string,
  width: number,
  height: number,
): Promise<UnsplashResult | null> {
  const ratio = width / height
  const orientation = ratio > 1.3 ? 'landscape' : ratio < 0.77 ? 'portrait' : 'squarish'

  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', query)
  url.searchParams.set('per_page', '3')
  url.searchParams.set('orientation', orientation)
  url.searchParams.set('content_filter', 'high')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  })

  if (!res.ok) return null

  const data = await res.json()
  if (!data.results?.length) return null

  // Pick best aspect-ratio match
  const targetRatio = width / height
  const best = data.results.reduce(
    (prev: any, curr: any) => {
      const prevRatio = prev.width / prev.height
      const currRatio = curr.width / curr.height
      return Math.abs(currRatio - targetRatio) < Math.abs(prevRatio - targetRatio) ? curr : prev
    },
    data.results[0],
  )

  return {
    imageUrl: `${best.urls.raw}&w=${width}&h=${height}&fit=crop&auto=format&q=80`,
    downloadLocation: best.links.download_location,
  }
}

export function triggerDownload(downloadLocation: string): void {
  // Unsplash API compliance — fire and forget
  fetch(`${downloadLocation}?client_id=${UNSPLASH_ACCESS_KEY}`).catch(() => {})
}
```

**Step 5: Write the SVG fallback**

```typescript
// packages/image-resolver/api/_lib/fallback-svg.ts

export function generateFallbackSVG(w: number, h: number, query: string): string {
  const escaped = query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dy=".3em"
    font-family="system-ui" font-size="14" fill="#475569">${escaped}</text>
</svg>`
}
```

**Step 6: Write the main edge function**

```typescript
// packages/image-resolver/api/s/[...params].ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { searchUnsplash, triggerDownload } from '../_lib/unsplash'
import { generateFallbackSVG } from '../_lib/fallback-svg'

const redis = Redis.fromEnv()
const CACHE_TTL = 86400 // 24 hours

export const config = { runtime: 'edge' }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url!, `https://${req.headers.host}`)
  // Path: /api/s/{query}/{width}/{height}
  const segments = url.pathname.replace('/api/s/', '').split('/')

  if (segments.length < 3) {
    return res.status(400).json({ error: 'Format: /s/{query}/{width}/{height}' })
  }

  const query = decodeURIComponent(segments[0])
  const width = Math.min(Math.max(parseInt(segments[1], 10) || 800, 100), 2400)
  const height = Math.min(Math.max(parseInt(segments[2], 10) || 600, 100), 2400)

  const cacheKey = `img:${query}:${width}:${height}`

  // Check Upstash Redis cache
  const cached = await redis.get<string>(cacheKey)
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
    res.setHeader('X-Cache', 'HIT')
    return res.redirect(302, cached)
  }

  // Query Unsplash
  const result = await searchUnsplash(query, width, height)

  if (!result) {
    // Fallback SVG
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.send(generateFallbackSVG(width, height, query))
  }

  // Cache in Upstash Redis
  await redis.setex(cacheKey, CACHE_TTL, result.imageUrl)

  // Trigger Unsplash download tracking (compliance)
  triggerDownload(result.downloadLocation)

  // Redirect to optimized Unsplash URL
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  res.setHeader('X-Cache', 'MISS')
  return res.redirect(302, result.imageUrl)
}
```

**Step 7: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true
  },
  "include": ["api/**/*.ts"]
}
```

**Step 8: Install dependencies and verify**

Run: `cd packages/image-resolver && bun install`
Run: `cd packages/image-resolver && bunx tsc --noEmit`
Expected: No type errors

**Step 9: Commit**

```bash
git add packages/image-resolver/
git commit -m "feat: add image resolver edge function (img.vibestack.codes)"
```

**Env vars needed for Vercel deployment:**
- `UNSPLASH_ACCESS_KEY` — Unsplash API key
- `UPSTASH_REDIS_REST_URL` — Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis REST token

---

## Task 3: ThemeTokens → DesignSystem Migration

**Files:**
- Modify: `server/lib/themed-code-engine.ts:27-53` — delete ThemeTokens, re-export from design-system.ts
- Modify: `server/lib/app-blueprint.ts` — update imports + types
- Modify: `server/lib/agents/orchestrator.ts` — update DesignResult type
- Modify: `server/lib/agents/machine.ts` — update MachineContext
- Modify: `server/lib/agents/design-agent.ts` — output DesignSystem
- Modify: `server/lib/page-generator.ts` — update import
- Modify: `server/lib/page-assembler.ts` — update import
- Modify: `server/lib/page-composer.ts` — update import
- Modify: `server/lib/deterministic-assembly.ts` — update import
- Modify: `server/lib/sections/types.ts` — update SectionContext
- Modify: `src/components/ai-elements/theme-tokens-card.tsx` — align client type
- Modify: All test files importing ThemeTokens

This is a mechanical find-and-replace with type alignment. The DesignSystem type is a strict superset of ThemeTokens (all old fields preserved, new fields added).

**Step 1: Update themed-code-engine.ts — re-export instead of define**

In `server/lib/themed-code-engine.ts`, replace lines 9-53 (TextSlots + ThemeTokens interface) with:

```typescript
// Re-export from single source of truth
export type {
  DesignSystem as ThemeTokens,  // backward-compat alias
  DesignSystem,
  TextSlots,
  AestheticDirection,
  LayoutStrategy,
  PageImageManifest,
  ImageEntry,
} from './design-system'
export { DEFAULT_TEXT_SLOTS, DesignSystemSchema } from './design-system'
```

The `ThemeTokens` alias means existing imports like `import type { ThemeTokens } from './themed-code-engine'` still work. No other files need to change their import paths yet.

**Step 2: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: Errors where old ThemeTokens shape is missing new required fields (`aestheticDirection`, `layoutStrategy`, `signatureDetail`)

**Step 3: Fix design-agent.ts — add new fields to returned tokens**

In `server/lib/agents/design-agent.ts`, where tokens are constructed (around line 94), add:

```typescript
aestheticDirection: 'warm-neutral',    // default until Creative Director is upgraded
layoutStrategy: 'full-bleed',          // default until Creative Director is upgraded
signatureDetail: 'Subtle scroll-triggered reveal animations on content sections',
imageManifest: {},                     // default until Creative Director is upgraded
```

**Step 4: Fix app-blueprint.ts — add defaults in fallbackThemeTokens**

In `server/lib/app-blueprint.ts`, function `fallbackThemeTokens()` (line 66-98), add the same 4 new fields with sensible defaults.

**Step 5: Fix any remaining type errors**

Run: `bunx tsc --noEmit`
Fix each remaining error. Common pattern: anywhere a ThemeTokens literal is constructed, add the 4 new required fields.

**Step 6: Fix client component**

In `src/components/ai-elements/theme-tokens-card.tsx`, update the local ThemeTokens interface to include `aestheticDirection`, `layoutStrategy`, `signatureDetail`, and render them in the card UI.

**Step 7: Run full test suite**

Run: `bun run test`
Expected: All tests pass (existing tests don't assert on new fields)

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: migrate ThemeTokens → DesignSystem (backward-compat alias)"
```

---

## Task 4: Rewrite Creative Director System Prompt

**Files:**
- Modify: `server/lib/creative-director.ts:37-83` — replace instructions
- Modify: `server/lib/agents/schemas.ts` — update CreativeSpecSchema to include DesignSystem output
- Test: `tests/creative-director.test.ts` (new)

**Step 1: Write the failing test**

```typescript
// tests/creative-director.test.ts
import { describe, it, expect } from 'vitest'
import { CreativeSpecSchema } from '@server/lib/agents/schemas'
import { AESTHETIC_DIRECTIONS, LAYOUT_STRATEGIES } from '@server/lib/design-system'

describe('CreativeSpecSchema with DesignSystem fields', () => {
  it('requires aestheticDirection in valid enum', () => {
    // Minimal valid spec — just testing schema accepts new fields
    const minSpec = {
      sitemap: [],
      nav: {
        style: 'sticky-blur',
        logo: 'TestApp',
        links: [],
        cta: null,
        mobileStyle: 'sheet',
      },
      footer: {
        style: 'minimal',
        columns: [],
        showNewsletter: false,
        socialLinks: [],
        copyright: '© 2026',
      },
      designSystem: {
        aestheticDirection: 'dark-cinematic',
        layoutStrategy: 'full-bleed',
        signatureDetail: 'Parallax hero with gradient shift on mouse movement',
        colorPalette: {
          primary: '#1a1a2e',
          secondary: '#16213e',
          accent: '#e94560',
          background: '#0f0f0f',
          text: '#f5f5f5',
        },
        typography: {
          display: 'DM Serif Display',
          body: 'Outfit',
        },
        imageManifest: {},
      },
    }

    const result = CreativeSpecSchema.parse(minSpec)
    expect(result.designSystem.aestheticDirection).toBe('dark-cinematic')
  })

  it('rejects unknown aesthetic direction', () => {
    const bad = {
      sitemap: [],
      nav: { style: 'sticky-blur', logo: 'X', links: [], cta: null, mobileStyle: 'sheet' },
      footer: { style: 'minimal', columns: [], showNewsletter: false, socialLinks: [], copyright: '©' },
      designSystem: {
        aestheticDirection: 'clean-and-modern',  // INVALID
        layoutStrategy: 'full-bleed',
        signatureDetail: 'test',
        colorPalette: { primary: '#000', secondary: '#111', accent: '#f00', background: '#fff', text: '#000' },
        typography: { display: 'Syne', body: 'Outfit' },
        imageManifest: {},
      },
    }
    expect(() => CreativeSpecSchema.parse(bad)).toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/creative-director.test.ts`
Expected: FAIL — CreativeSpecSchema doesn't have `designSystem` field

**Step 3: Update CreativeSpecSchema**

In `server/lib/agents/schemas.ts`, add a `designSystem` field to `CreativeSpecSchema`:

```typescript
import { AESTHETIC_DIRECTIONS, LAYOUT_STRATEGIES, PageImageManifestSchema } from '../design-system'

// Add this inside CreativeSpecSchema
designSystem: z.object({
  aestheticDirection: z.enum(AESTHETIC_DIRECTIONS),
  layoutStrategy: z.enum(LAYOUT_STRATEGIES),
  signatureDetail: z.string().min(1),
  colorPalette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    text: z.string(),
  }),
  typography: z.object({
    display: z.string(),
    body: z.string(),
  }),
  imageManifest: z.record(z.string(), PageImageManifestSchema).default({}),
}),
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/creative-director.test.ts`
Expected: PASS

**Step 5: Replace Creative Director system prompt**

Replace the `instructions` string in `server/lib/creative-director.ts:37-83` with the full upgraded prompt. The new prompt absorbs `<role>`, `<design_system>`, `<page_type_patterns>`, and image query rules from the system prompt. Here is the complete replacement:

```typescript
instructions: `You are three people in one:
1. A world-class UI/UX designer with 15 years at top studios (Pentagram, IDEO, Instrument)
2. A senior React engineer who has shipped products at scale (Vercel, Stripe, Linear)
3. A brand strategist who understands how visual identity creates trust and conversion

You never produce generic, template-looking output. Every generation is bespoke.

Given an app name and PRD, you produce a creative spec: design system decisions, sitemap, navigation, footer, and image manifest.

## STEP 1: Five Design Decisions (BEFORE anything else)

You MUST commit to these before writing any architecture:

1. **Aesthetic direction** — Pick ONE: editorial, brutalist, soft-organic, luxury, retro-futuristic, playful-bold, minimal-swiss, dark-cinematic, glassmorphic, neo-corporate, hand-drawn, art-deco, cyberpunk, warm-neutral, dashboard-dense. NEVER default to "clean and modern" — that produces AI slop.

2. **Color palette** — Define exactly 5 colors (hex): primary, secondary, accent, background, text. Commit to a dominant color with sharp accents. AVOID: purple-gradient-on-white, blue-gradient-on-white, or any default template palette.

3. **Typography** — Choose a display font and a body font. NEVER use Inter, Roboto, Arial, or system-ui. Prefer distinctive fonts: Space Mono, DM Serif Display, Playfair Display, Instrument Serif, Syne, Clash Display, Outfit, Crimson Pro, Source Serif 4, Libre Baskerville, Geist, Satoshi, General Sans, Cabinet Grotesk.

4. **Layout strategy** — Choose: asymmetric-grid, full-bleed, card-based, sidebar-main, bento-grid, single-column-editorial, split-screen, overlapping-layers, scroll-driven.

5. **Signature detail** — ONE memorable micro-interaction or visual detail: a hover effect revealing hidden content, scroll-triggered counter animation, gradient shifting on mouse movement, decorative SVG pattern, text reveal animation, parallax section, morphing shape, subtle grain texture overlay.

## STEP 2: Sitemap Design (1-3 pages)

Build EXACTLY what the user asked for. Match scope to the request:
- "Build a to-do app" → 1 page: functional React app with to-do UI
- "Build a restaurant website" → 2-3 pages: homepage, menu, contact
- "Build a portfolio" → 1-2 pages: homepage with projects, optional about

NEVER generate auth/login/register routes.
NEVER generate more than 3 pages.
NEVER generate CRUD-style routes like /new, /$id/edit, /admin.

Adapt your page structure to the app type:

LANDING PAGE: Hero + social proof + features + pricing + FAQ + CTA + footer
DASHBOARD/SPA: Sidebar nav + data area + charts + search/filter + modals
E-COMMERCE: Product grid + detail modal + cart + filtering + pricing
PORTFOLIO: Project showcase + about + contact + subtle animations
SIMPLE APP (calculator, tool, game): Focused single-purpose interface + real-time feedback

Route naming: use domain language. File naming: TanStack Router conventions:
  "/" → routes/index.tsx, "/menu" → routes/menu/index.tsx

## STEP 3: Per-Page Briefs

Each page MUST have:
- sections: 3-8 descriptive strings (top to bottom)
- copyDirection: tone and voice (be specific, not "professional and modern")
- keyInteractions: primary user actions
- lucideIcons: 3-6 Lucide icon names
- shadcnComponents: 3-8 shadcn/ui component names

## STEP 4: Image Manifest

For EACH page, generate an image manifest with semantic keys. You are a photo researcher, not a keyword spammer.

IMAGE QUERY RULES:
1. BE SPECIFIC AND SCENIC — "software engineer reviewing code on ultrawide monitor dim lighting" not "technology"
2. INCLUDE ATMOSPHERE AND LIGHTING — lighting is the #1 factor in photo quality
3. SPECIFY COMPOSITION — aerial, close up, portrait, wide angle, flat lay, over the shoulder
4. AVOID GENERIC STOCK — never "happy people", "diverse team", "innovation", "growth", "success"
5. MATCH YOUR AESTHETIC — dark aesthetic → "moody, dramatic lighting"; light → "bright, natural light, airy"
6. SIZE TO CONTAINER — hero: 1600x900, feature: 800x600, avatar: 200x200 (crop=faces), card: 600x400, product: 600x600, background: 1920x1080
7. 4-10 WORDS PER QUERY — too short = generic, too long = no results

SECTION-SPECIFIC:
- HERO: Most cinematic image. Full-bleed 1600x900. Convey emotion, not literal screenshots.
- TESTIMONIALS: 200x200 with crop=faces. Varied queries. NEVER reuse same query.
- FEATURES: 800x600. Illustrate the BENEFIT, not the feature.
- BACKGROUNDS: 1920x1080. Subtle, low-contrast. Always darkened with overlay.
- ABOUT/TEAM: Candid > posed. Natural environments.
- LOGO WALLS: Do NOT use images. Render as styled text.

## STEP 5: Navigation + Footer

Navigation: sticky-blur | transparent-hero | sidebar | editorial
Footer: multi-column | minimal | centered | magazine

## Critical Rules
1. Build EXACTLY what the user asked for
2. Maximum 3 pages
3. No database, no auth, no API calls — client-side only
4. Be opinionated — avoid generic "hero + features + CTA" for every app
5. Every image query is unique — never duplicate on same page
6. For interactive apps, keyInteractions describe actual app functionality`,
```

**Step 6: Run full test suite**

Run: `bunx tsc --noEmit && bun run test`
Expected: All pass

**Step 7: Commit**

```bash
git add server/lib/creative-director.ts server/lib/agents/schemas.ts tests/creative-director.test.ts
git commit -m "feat: rewrite Creative Director with 5 design decisions + image manifests"
```

---

## Task 5: Update Section Renderers — Image System

**Files:**
- Modify: `server/lib/sections/primitives.ts:592-607` — rewrite `imageWithFallback()`
- Create: `server/lib/sections/image-helpers.ts` — new `imageSrc()` + `imageTag()` helpers
- Modify: All section renderers that use `imageWithFallback()` or `picsum.photos`
- Test: `tests/image-helpers.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/image-helpers.test.ts
import { describe, it, expect } from 'vitest'
import { imageSrc, imageTag } from '@server/lib/sections/image-helpers'

describe('imageSrc', () => {
  it('generates img.vibestack.codes URL', () => {
    const url = imageSrc('cozy coffee shop morning light', 800, 600)
    expect(url).toBe('https://img.vibestack.codes/s/cozy%20coffee%20shop%20morning%20light/800/600')
  })

  it('appends crop param', () => {
    const url = imageSrc('professional headshot woman', 200, 200, 'faces')
    expect(url).toContain('?crop=faces')
  })
})

describe('imageTag', () => {
  it('includes alt, loading, onError fallback', () => {
    const tag = imageTag({
      src: 'IMAGES.hero.src',
      alt: 'City skyline at night',
      loading: 'eager',
      className: 'w-full h-[500px] object-cover',
    })
    expect(tag).toContain('alt="City skyline at night"')
    expect(tag).toContain('loading="eager"')
    expect(tag).toContain('onError=')
    expect(tag).toContain('linear-gradient')
    expect(tag).toContain('object-cover')
  })

  it('defaults to lazy loading', () => {
    const tag = imageTag({ src: 'img', alt: 'test' })
    expect(tag).toContain('loading="lazy"')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/image-helpers.test.ts`
Expected: FAIL — module not found

**Step 3: Write image helpers**

```typescript
// server/lib/sections/image-helpers.ts

/**
 * Image URL builder for the img.vibestack.codes resolver.
 * Returns a static URL string (for use in IMAGES data layer).
 */
export function imageSrc(query: string, w: number, h: number, crop?: string): string {
  const encoded = encodeURIComponent(query)
  const base = `https://img.vibestack.codes/s/${encoded}/${w}/${h}`
  return crop ? `${base}?crop=${crop}` : base
}

/**
 * JSX <img> tag builder with onError fallback to CSS gradient.
 * Returns a JSX string for use in section renderers.
 *
 * From system prompt <image_system>:
 * - Every <img> needs: alt, loading, onError fallback
 * - Hero images: loading="eager"
 * - All others: loading="lazy"
 */
export function imageTag(opts: {
  src: string            // JS expression (e.g., 'IMAGES.hero.src') or literal URL
  alt: string
  loading?: 'lazy' | 'eager'
  className?: string
  width?: number
  height?: number
}): string {
  const loading = opts.loading ?? 'lazy'
  const classAttr = opts.className ? ` className="${opts.className}"` : ''
  const sizeAttrs = [
    opts.width ? ` width={${opts.width}}` : '',
    opts.height ? ` height={${opts.height}}` : '',
  ].join('')

  return `<img
    src={${opts.src}}
    alt="${opts.alt}"
    loading="${loading}"${classAttr}${sizeAttrs}
    style={{ objectFit: 'cover' }}
    onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.background = 'linear-gradient(135deg, #1a1a2e, #16213e)'; }}
  />`
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/image-helpers.test.ts`
Expected: PASS

**Step 5: Update primitives.ts — deprecate imageWithFallback, re-export new helpers**

In `server/lib/sections/primitives.ts`, at line 592-607, replace `imageWithFallback` with:

```typescript
// Re-export from image-helpers (new image system)
export { imageSrc, imageTag } from './image-helpers'

/** @deprecated Use imageTag() instead — includes onError fallback + img.vibestack.codes URLs */
export function imageWithFallback(opts: {
  src: string; alt: string; className?: string; loading?: 'lazy' | 'eager'
}): string {
  return imageTag(opts)
}
```

**Step 6: Find and update all picsum.photos references**

Run: `grep -rn 'picsum.photos' server/lib/sections/`

For each occurrence, replace with `imageSrc()` calls using appropriate queries. This is a mechanical replacement — each section renderer that uses `picsum.photos/seed/X/800/600` gets replaced with `imageSrc('descriptive query matching section context', 800, 600)`.

**Step 7: Run full test suite**

Run: `bunx tsc --noEmit && bun run test`
Expected: All pass

**Step 8: Commit**

```bash
git add server/lib/sections/image-helpers.ts tests/image-helpers.test.ts server/lib/sections/primitives.ts server/lib/sections/*.ts
git commit -m "feat: replace picsum fallbacks with img.vibestack.codes resolver URLs"
```

---

## Task 6: Update Page Assembler — IMAGES Data Layer

**Files:**
- Modify: `server/lib/page-assembler.ts` — generate IMAGES const at top of route files
- Test: `tests/page-assembler-images.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/page-assembler-images.test.ts
import { describe, it, expect } from 'vitest'
import { generateImagesBlock } from '@server/lib/page-assembler'
import type { PageImageManifest } from '@server/lib/design-system'

describe('generateImagesBlock', () => {
  it('generates IMAGES const from manifest', () => {
    const manifest: PageImageManifest = {
      hero: {
        query: 'restaurant interior moody warm lighting candlelit',
        width: 1600, height: 900,
        alt: 'Candlelit restaurant interior',
        role: 'hero', loading: 'eager',
      },
      testimonial1: {
        query: 'professional headshot woman natural light',
        width: 200, height: 200,
        alt: 'Sarah, a regular guest',
        role: 'testimonial', loading: 'lazy',
        crop: 'faces',
      },
    }

    const block = generateImagesBlock(manifest)
    expect(block).toContain('const IMAGES = {')
    expect(block).toContain('img.vibestack.codes/s/')
    expect(block).toContain('restaurant%20interior%20moody%20warm%20lighting%20candlelit')
    expect(block).toContain('?crop=faces')
    expect(block).toContain("alt: 'Candlelit restaurant interior'")
  })

  it('returns empty string for empty manifest', () => {
    expect(generateImagesBlock({})).toBe('')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/page-assembler-images.test.ts`
Expected: FAIL — `generateImagesBlock` not exported

**Step 3: Add generateImagesBlock to page-assembler.ts**

```typescript
import { imageSrc } from './sections/image-helpers'
import type { PageImageManifest } from './design-system'

export function generateImagesBlock(manifest: PageImageManifest): string {
  const entries = Object.entries(manifest)
  if (entries.length === 0) return ''

  const lines = entries.map(([key, img]) => {
    const src = imageSrc(img.query, img.width, img.height, img.crop)
    return `  ${key}: {\n    src: '${src}',\n    alt: '${img.alt.replace(/'/g, "\\'")}',\n  }`
  })

  return `const IMAGES = {\n${lines.join(',\n')},\n} as const\n`
}
```

**Step 4: Integrate into buildRouteFile**

In the `buildRouteFile` function (around line 221-263), after the imports block and before the component function, insert:

```typescript
const imagesBlock = generateImagesBlock(
  designSystem?.imageManifest?.[routePath] ?? {}
)
// Insert imagesBlock between imports and Route export
```

This requires threading `designSystem` (or just `imageManifest`) through to `buildRouteFile`. Add it to the function parameters.

**Step 5: Run tests**

Run: `bun run test -- tests/page-assembler-images.test.ts`
Expected: PASS

Run: `bun run test`
Expected: All pass

**Step 6: Commit**

```bash
git add server/lib/page-assembler.ts tests/page-assembler-images.test.ts
git commit -m "feat: generate IMAGES data layer in assembled route files"
```

---

## Task 7: Update Page Validator — Anti-Patterns + Quality Checklist

**Files:**
- Modify: `server/lib/page-validator.ts` — add anti-pattern detection + quality checks
- Test: `tests/page-validator-quality.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/page-validator-quality.test.ts
import { describe, it, expect } from 'vitest'
import { detectAntiPatterns, type AntiPatternViolation } from '@server/lib/page-validator'

describe('detectAntiPatterns', () => {
  it('flags Lorem ipsum', () => {
    const code = '<p>Lorem ipsum dolor sit amet</p>'
    const violations = detectAntiPatterns(code)
    expect(violations.some(v => v.rule === 'placeholder-text')).toBe(true)
  })

  it('flags generic CTA text', () => {
    const code = '<Button>Get Started</Button><Button>Learn More</Button><Button>Get Started</Button>'
    const violations = detectAntiPatterns(code)
    expect(violations.some(v => v.rule === 'generic-cta')).toBe(true)
  })

  it('flags buzzwords', () => {
    const code = '<p>Our seamless cutting-edge revolutionary platform leverages synergy</p>'
    const violations = detectAntiPatterns(code)
    expect(violations.some(v => v.rule === 'buzzword')).toBe(true)
  })

  it('flags empty onClick handlers', () => {
    const code = '<button onClick={() => {}}>Click me</button>'
    const violations = detectAntiPatterns(code)
    expect(violations.some(v => v.rule === 'empty-handler')).toBe(true)
  })

  it('flags missing img alt', () => {
    const code = '<img src="test.jpg" />'
    const violations = detectAntiPatterns(code)
    expect(violations.some(v => v.rule === 'img-missing-alt')).toBe(true)
  })

  it('flags missing img onError', () => {
    const code = '<img src="test.jpg" alt="test" />'
    const violations = detectAntiPatterns(code)
    expect(violations.some(v => v.rule === 'img-missing-onerror')).toBe(true)
  })

  it('passes clean code', () => {
    const code = `
      <section id="hero">
        <img src={IMAGES.hero.src} alt="Hero image" onError={(e) => { e.target.style.display = 'none' }} />
        <h1>Craft Coffee Roasters</h1>
        <p>Small-batch specialty coffee from Brooklyn</p>
        <Button onClick={() => setView('menu')}>View Our Roasts</Button>
      </section>
    `
    const violations = detectAntiPatterns(code)
    expect(violations).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/page-validator-quality.test.ts`
Expected: FAIL — `detectAntiPatterns` not exported

**Step 3: Add detectAntiPatterns function**

In `server/lib/page-validator.ts`, add:

```typescript
export interface AntiPatternViolation {
  rule: string
  message: string
  line?: number
}

const BUZZWORDS = ['seamless', 'cutting-edge', 'revolutionary', 'leverage', 'synergy', 'game-changing', 'disruptive', 'next-generation']
const GENERIC_HEADLINES = ['Welcome to', 'Why Choose Us', 'Get Started Today', 'Our Services', 'What We Do']
const GENERIC_CTAS = ['Get Started', 'Learn More', 'Sign Up Now', 'Contact Us']

export function detectAntiPatterns(code: string): AntiPatternViolation[] {
  const violations: AntiPatternViolation[] = []

  // Placeholder text
  if (/lorem ipsum/i.test(code) || /\[your text here\]/i.test(code) || /\[placeholder\]/i.test(code)) {
    violations.push({ rule: 'placeholder-text', message: 'Contains placeholder text (Lorem ipsum or [Your text here])' })
  }

  // Buzzwords
  for (const word of BUZZWORDS) {
    if (code.toLowerCase().includes(word)) {
      violations.push({ rule: 'buzzword', message: `Contains AI-slop buzzword: "${word}"` })
      break
    }
  }

  // Generic CTAs (flag if 2+ identical generic CTAs)
  for (const cta of GENERIC_CTAS) {
    const matches = code.match(new RegExp(`>${cta}<`, 'g'))
    if (matches && matches.length >= 2) {
      violations.push({ rule: 'generic-cta', message: `Multiple identical generic CTAs: "${cta}"` })
      break
    }
  }

  // Empty onClick handlers
  if (/onClick=\{?\(\)\s*=>\s*\{\s*\}\}?/.test(code)) {
    violations.push({ rule: 'empty-handler', message: 'Empty onClick handler: onClick={() => {}}' })
  }

  // img without alt
  const imgTags = code.match(/<img\b[^>]*\/?>/g) ?? []
  for (const tag of imgTags) {
    if (!/\balt[=\s]/.test(tag)) {
      violations.push({ rule: 'img-missing-alt', message: '<img> without alt attribute' })
    }
    if (!/\bonError[=\s]/.test(tag)) {
      violations.push({ rule: 'img-missing-onerror', message: '<img> without onError fallback' })
    }
  }

  return violations
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/page-validator-quality.test.ts`
Expected: PASS

**Step 5: Integrate into existing validation pipeline**

In the main `validateFiles()` function, call `detectAntiPatterns(fileContent)` for each generated route file and add violations to the warnings array.

**Step 6: Run full test suite**

Run: `bunx tsc --noEmit && bun run test`
Expected: All pass

**Step 7: Commit**

```bash
git add server/lib/page-validator.ts tests/page-validator-quality.test.ts
git commit -m "feat: add anti-pattern detection to page validator"
```

---

## Task 8: Update Client ThemeTokensCard

**Files:**
- Modify: `src/components/ai-elements/theme-tokens-card.tsx` — add aestheticDirection, layoutStrategy, signatureDetail rendering

**Step 1: Read current component**

Read `src/components/ai-elements/theme-tokens-card.tsx` to understand local ThemeTokens interface.

**Step 2: Add new fields to local interface**

Add to the component's local interface:
```typescript
aestheticDirection?: string
layoutStrategy?: string
signatureDetail?: string
```

**Step 3: Add rendering for new fields**

In the card JSX, add a "Design Decisions" section rendering the 3 new fields when present.

**Step 4: Run lint + typecheck**

Run: `bunx tsc --noEmit && bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/ai-elements/theme-tokens-card.tsx
git commit -m "feat: display design decisions in ThemeTokensCard"
```

---

## Task 9: E2E Verification

**Files:**
- No new files — run existing E2E pipeline and verify

**Step 1: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 2: Run linter**

Run: `bun run lint`
Expected: 0 errors

**Step 3: Run full test suite**

Run: `bun run test`
Expected: All pass

**Step 4: Run mock E2E**

Run: `bun run test:e2e:mock`
Expected: Pass (mock pipeline doesn't hit LLMs, but verifies type flow)

**Step 5: Deploy image resolver**

```bash
cd packages/image-resolver
vercel --prod
```

Verify: `curl -I https://img.vibestack.codes/s/cozy%20coffee%20shop%20morning%20light/800/600`
Expected: 302 redirect to Unsplash CDN URL

**Step 6: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: final E2E verification of system prompt integration"
```

---

## Summary

| Task | Description | Est. Complexity |
|------|-------------|----------------|
| 1 | DesignSystem type + Zod schema | Small (new file) |
| 2 | Image resolver edge function | Medium (new project) |
| 3 | ThemeTokens → DesignSystem migration | Large (15-20 files) |
| 4 | Creative Director prompt rewrite | Medium (prompt + schema) |
| 5 | Section renderer image system | Medium (helper + find-replace) |
| 6 | Page assembler IMAGES data layer | Small (new function + integration) |
| 7 | Page validator anti-patterns | Small (new function + integration) |
| 8 | Client ThemeTokensCard update | Small (UI addition) |
| 9 | E2E verification | Small (run commands) |
