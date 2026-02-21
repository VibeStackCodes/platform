# Creative Contract Pipeline — Design Document

**Date**: 2026-02-21
**Status**: Proposed
**Goal**: Replace the deterministic section-composition pipeline with an LLM-driven page generation pipeline that produces hand-crafted quality UI for any prompt — from single-page landing pages to full CRUD apps.

## Problem Statement

The current pipeline generates apps in two modes:

1. **Section Composition** (production): 50 deterministic renderers produce generic SaaS copy regardless of domain. A recipe app gets "Fast & Reliable" headings. Quality: 3/10.
2. **LLM Full-Page** (experiment): gpt-5.2-codex generates complete .tsx files per route. Domain-aware copy, creative layouts. But: broken links, no CRUD, aesthetic convergence to white/blue, 40-80s per page. Quality: 7/10.
3. **Hand-crafted prototype** (target): Iterative human+LLM design. Warm palettes, editorial layouts, domain-specific everything. Quality: 10/10.

The gap between 7/10 and 10/10 is: (a) aesthetic convergence — LLMs default to "clean tech blue", (b) no shared contract between pages — broken links, inconsistent nav, (c) no design knowledge — LLMs don't know Laws of UX or accessibility rules.

## Key Constraint: Not Every App Needs CRUD

Many prompts produce apps with zero database tables:

| Prompt | Tables | CRUD? |
|--------|--------|-------|
| "Real estate landing page" | 0 | No |
| "SaaS landing page with pricing" | 0 | No |
| "Portfolio site" | 0 | No |
| "Restaurant website" | 5-9 | Light |
| "Recipe management app" | 4-6 | Full |
| "Project management tool" | 6-10 | Heavy |

The pipeline must handle the full spectrum gracefully. Static sites skip Supabase provisioning entirely.

## Architecture: Creative Contract Pipeline

```
User Prompt
    │
    ▼
┌─────────────────────────────┐
│  Phase 1: Analyst           │  (existing, unchanged)
│  LLM → SchemaContract + PRD │  gpt-5.2, ~8K tokens
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Phase 2: Creative Director │  (NEW — single LLM call)
│  LLM → CreativeSpec         │  gpt-5.2, ~15K tokens
│                             │
│  System prompt includes:    │
│  - Laws of UX (21 laws)     │
│  - /frontend-design rules   │
│  - Page Design Guide MCP    │
│  - Accessibility rules      │
│  - shadcn component catalog │
│  - Lucide icon catalog      │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Phase 3: Parallel Pages    │  (NEW — N parallel LLM calls)
│  Promise.all(pages.map(...))│  gpt-5.2-codex, ~3K tokens/page
│                             │
│  Each page gen receives:    │
│  - CreativeSpec (shared)    │
│  - Page-specific brief      │
│  - Entity schema (if any)   │
│  - Condensed design rules   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Phase 4: Assembly          │  (deterministic — no LLM)
│  - Generate routeTree.gen   │
│  - Inject CSS variables     │
│  - Validate imports         │
│  - Generate index.css       │
│  - Generate __root.tsx      │
│  - Generate auth routes     │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  Phase 5: Validation        │  (deterministic — no LLM)
│  - TypeScript check (tsc)   │
│  - Axe-core a11y audit      │
│  - Link integrity check     │
│  - Import resolution        │
│  Optional repair (LLM) for  │
│  any validation failures    │
└─────────────────────────────┘
```

## Phase 2: Creative Director — Design Knowledge Delivery

### What the Creative Director receives (system prompt)

Four knowledge sources are pre-compiled into the system prompt:

1. **Laws of UX** (~3K tokens): 21 evidence-based UX laws distilled from lawsofux.com. Pre-compiled at build time into a reference document. Covers Fitts's Law (touch targets), Hick's Law (choice reduction), Peak-End Rule (hero/CTA quality), Jakob's Law (familiar patterns), Miller's Law (chunking), Aesthetic-Usability Effect, Doherty Threshold (animation timing), Law of Proximity, Law of Common Region.

2. **/frontend-design rules** (~1K tokens): Anti-convergence aesthetic rules. Bold typography, dominant colors with sharp accents, scroll-triggered reveals, unexpected layouts, gradient meshes, noise textures. "Never converge on common choices across themes."

3. **Page Design Guide** (~10K tokens): Pre-fetched from page-design-guide MCP server at pipeline startup (13 tool calls in parallel, ~2s). Covers: layout patterns, typography guidance, color guidance, animation timing (micro 100-200ms, small 200-300ms, medium 300-500ms), component specs (Card shadow-lg, rounded-xl, p-6), nav specs (sticky, backdrop-blur, 72px), hero specs (min-h-screen, gradient overlay), footer specs (4-col grid), responsive breakpoints, accessibility (4.5:1 contrast, focus-visible rings).

4. **Accessibility rules** (~1K tokens): WCAG 2.1 AA requirements. Semantic HTML, heading hierarchy, alt text, aria-labels, focus management, color contrast ratios. Axe-core rule IDs for automated validation.

**Why system prompt, not Mastra tools**: These are static guidelines the Creative Director needs for EVERY decision. Tool calls would add 2-5s per round-trip for content that never changes. The Creative Director makes one pass and encodes all design decisions into the CreativeSpec. Downstream page gen agents don't need raw design knowledge — they get the CreativeSpec.

**Cost**: ~15K extra input tokens = ~$0.04 per pipeline run (negligible).

### What the Creative Director produces: CreativeSpec

```typescript
interface CreativeSpec {
  // App classification
  archetype: 'static' | 'content' | 'crud'

  // Visual DNA — shared across ALL pages
  visualDna: {
    typography: {
      displayFont: string      // e.g. "Playfair Display"
      bodyFont: string         // e.g. "Source Sans 3"
      googleFontsUrl: string
      headlineStyle: string    // e.g. "text-5xl font-bold tracking-tight"
      bodyStyle: string        // e.g. "text-base leading-relaxed"
    }
    palette: {
      background: string      // OKLCH or hex
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
    borderRadius: string       // e.g. "0.75rem"
    cardStyle: 'elevated' | 'flat' | 'glass' | 'bordered'
    imagery: 'photography-heavy' | 'illustration' | 'minimal' | 'icon-focused'
    visualTexture: string      // e.g. "grain overlay", "gradient mesh", "none"
    moodBoard: string          // 2-3 sentence aesthetic direction
  }

  // Sitemap — complete route contract
  sitemap: {
    route: string              // e.g. "/", "/menu/", "/menu/$slug"
    fileName: string           // e.g. "routes/index.tsx"
    componentName: string      // e.g. "Homepage"
    purpose: string            // 1-2 sentence description
    dataRequirements: 'none' | 'read-only' | 'read-write'
    entities?: string[]        // table names if data-driven
    brief: {
      sections: string[]       // e.g. ["hero", "featured grid", "testimonials", "CTA"]
      copyDirection: string    // e.g. "warm, inviting, 'Your table awaits'"
      keyInteractions: string  // e.g. "category filter tabs, reservation form"
      lucideIcons: string[]    // e.g. ["UtensilsCrossed", "Clock", "MapPin"]
      shadcnComponents: string[] // e.g. ["Card", "Badge", "Button", "Tabs"]
    }
  }[]

  // Navigation contract — consistent across all pages
  nav: {
    style: 'sticky-blur' | 'transparent-hero' | 'sidebar' | 'editorial'
    logo: string               // App name or text
    links: { label: string; href: string }[]
    cta?: { label: string; href: string }
    mobileStyle: 'sheet' | 'fullscreen' | 'dropdown'
  }

  // Footer contract
  footer: {
    style: 'multi-column' | 'minimal' | 'centered' | 'magazine'
    columns?: { heading: string; links: { label: string; href: string }[] }[]
    showNewsletter: boolean
    socialLinks: string[]      // icon names
    copyright: string
  }

  // Auth requirements
  auth: {
    required: boolean
    publicRoutes: string[]
    privateRoutes: string[]
    loginRoute: string
  }
}
```

### Why CreativeSpec solves the 7→10 quality gap

| Problem (7/10 LLM output) | CreativeSpec solution |
|---|---|
| Aesthetic convergence (white/blue) | `visualDna.palette` + `moodBoard` enforce a specific aesthetic |
| Broken links between pages | `sitemap` is a shared contract; all `nav.links` reference existing routes |
| Inconsistent nav across pages | `nav` contract is shared; page gen agents don't generate nav |
| No visual rhythm | `brief.sections` defines section order; `visualDna.motionPreset` controls animation |
| Hardcoded colors | `palette` → CSS variables; page gen agents use `bg-primary`, not `#2b6cb0` |
| Generic copy | `brief.copyDirection` gives domain-specific tone for each page |
| Missing icons | `brief.lucideIcons` specifies exact icons per page |
| No loading/empty states | Page gen agent instructions mandate Skeleton + empty states for data pages |

## Phase 3: Parallel Page Generation

Each page is generated by an independent `generateText()` call using gpt-5.2-codex. All pages run in parallel via `Promise.all()`.

### Page gen agent receives

1. **CreativeSpec** (shared across all pages — ~4K tokens)
2. **Page-specific brief** from `sitemap[i]` (~500 tokens)
3. **Entity schema** for data-driven pages (~200-500 tokens per entity)
4. **Condensed design rules** (~2K tokens — essential patterns only, not full design knowledge)
5. **shadcn component reference** (~1K tokens — available components with usage examples)
6. **Shared modules reference** — the nav component file path, the Supabase client path, the CSS variable names

### Page gen agent produces

A complete, self-contained `.tsx` file that:
- Imports from `@tanstack/react-router` (`createFileRoute`)
- Imports shadcn components from `@/components/ui/*`
- Imports Lucide icons from `lucide-react`
- Imports `@tanstack/react-query` hooks for data-driven pages
- Uses CSS variable-based Tailwind classes (not hardcoded colors)
- Uses `tw-animate-css` animation classes (not custom keyframes)
- Includes loading skeletons and empty states for data pages
- Does NOT generate nav or footer (injected by __root.tsx)

### What it does NOT produce

- **No nav/footer**: These come from `__root.tsx` (deterministic from CreativeSpec)
- **No CSS files**: Theme CSS variables are deterministic from `visualDna.palette`
- **No routeTree.gen.ts**: Deterministic from `sitemap`
- **No vite.config.ts**: Deterministic template
- **No package.json**: Deterministic template

## Phase 4: Deterministic Assembly

From the CreativeSpec + generated page files, these are produced deterministically (no LLM):

1. **`src/routes/__root.tsx`** — Root layout with nav + footer from CreativeSpec contracts
2. **`src/routeTree.gen.ts`** — Generated from `sitemap` routes
3. **`src/index.css`** — CSS variables from `visualDna.palette` + font imports
4. **`src/main.tsx`** — Standard TanStack Router + QueryClient boilerplate
5. **`src/lib/supabase.ts`** — Supabase client (only if `archetype !== 'static'`)
6. **`src/routes/auth/login.tsx`** — Auth page (only if `auth.required`)
7. **`vite.config.ts`** — Standard Vite + React + Tailwind config
8. **`package.json`** — Dependencies based on archetype

## Phase 5: Validation

Deterministic quality gates (no LLM unless repair needed):

1. **Import resolution**: Check all imports in generated .tsx files resolve to existing files
2. **Link integrity**: Check all `<Link to="...">` and `href="..."` values exist in sitemap
3. **TypeScript**: `tsc --noEmit` on the assembled project
4. **Axe-core**: Static HTML analysis for critical/serious a11y violations
5. **OxLint**: Lint check scoped to `src/`

If validation fails → repair agent (gpt-5.2-codex) fixes specific errors. Single repair pass, not a retry loop.

## Cost Analysis

| Phase | Model | Tokens (in/out) | Cost |
|-------|-------|-----------------|------|
| Analyst | gpt-5.2 | ~5K/3K | ~$0.04 |
| Creative Director | gpt-5.2 | ~20K/4K | ~$0.09 |
| Page gen (per page, ~8 pages avg) | gpt-5.2-codex | ~8K/3K per page | ~$0.18 total |
| Assembly | deterministic | 0 | $0.00 |
| Validation | deterministic | 0 | $0.00 |
| Repair (if needed, ~30% of runs) | gpt-5.2-codex | ~5K/2K | ~$0.02 |
| **Total** | | | **~$0.30-0.35** |

Compared to:
- Current section composition: ~$0.02-0.04
- LLM experiment (sequential): ~$0.50-1.50
- Hand-crafted (human time): priceless

## Latency

| Phase | Duration |
|-------|----------|
| Analyst | ~15s |
| Creative Director | ~20s |
| Page gen (parallel) | ~30-40s (wall time, regardless of page count) |
| Assembly | ~1s |
| Validation | ~5s |
| Repair (conditional) | ~10s |
| **Total** | **~70-90s** |

Same ballpark as current pipeline (~92s avg). Key win: parallel page gen means adding more pages doesn't increase latency.

## What Changes vs Current Pipeline

### Removed
- `server/lib/sections/` — All 50 section renderers (7,377 lines)
- `server/lib/page-composer.ts` — Section composition planner
- `server/lib/page-assembler.ts` — Section assembly logic
- `server/lib/sections/registry.ts` — Section catalog

### Added
- `server/lib/creative-director.ts` — Creative Director agent + CreativeSpec schema
- `server/lib/design-knowledge.ts` — Pre-compiled design knowledge (Laws of UX, frontend-design, page-design-guide, a11y rules)
- `server/lib/page-generator.ts` — Parallel page generation via generateText()
- `server/lib/page-validator.ts` — Import resolution, link integrity, axe-core
- `server/lib/deterministic-assembly.ts` — Root layout, route tree, CSS, config files

### Modified
- `server/lib/app-blueprint.ts` — Wire Creative Director → page gen → assembly → validation
- `server/lib/agents/provider.ts` — Add `creative-director` role to PIPELINE_MODELS
- `server/lib/themed-code-engine.ts` — Replace section-composition call path with creative contract call path

### Unchanged
- `server/lib/schema-contract.ts` — SchemaContract (source of truth)
- `server/lib/contract-to-sql.ts` — SQL generation
- `server/lib/contract-to-seed.ts` — Seed data generation
- `server/lib/agents/design-agent.ts` — Theme selection + tokens
- `server/lib/sandbox.ts` — Daytona sandbox lifecycle
- All Supabase provisioning, GitHub push, Vercel deploy

## Route Archetypes

The Creative Director classifies the app and adjusts generation accordingly:

### Static (0 tables)
- No Supabase client generated
- No auth routes
- No TanStack Query
- All content hardcoded in JSX
- Skip Supabase provisioning phase entirely
- Examples: landing pages, portfolios, brochure sites

### Content (1-5 tables)
- Supabase client + TanStack Query for reads
- Optional simple forms (contact, reservation)
- No full CRUD admin
- Auth optional
- Examples: restaurant websites, blogs, galleries

### CRUD (3-10+ tables)
- Full Supabase client + TanStack Query
- List/detail/create/edit routes per entity
- Auth required
- Admin functionality
- Examples: management systems, dashboards, trackers

## Design Principles

1. **One source of truth**: CreativeSpec is the contract. Every page gen agent reads from it. No page generates its own nav, footer, or color scheme.
2. **Parallel by default**: Page generation is embarrassingly parallel. `Promise.all()` reduces wall time to the slowest single page.
3. **Deterministic where possible**: Assembly, validation, CSS, route tree — all deterministic from CreativeSpec. LLM is only used where creativity is needed (page content).
4. **Knowledge injection, not tool calls**: Design knowledge goes into system prompts, not Mastra tools. Static knowledge doesn't benefit from tool-call indirection.
5. **Archetype-aware**: A landing page generates 1 page with 0 queries. A management app generates 15 pages with full CRUD. Same pipeline, different CreativeSpec.
6. **Fail fast**: Validation catches broken links, missing imports, a11y violations before the user sees the app. Single repair pass, not retry loops.
