# Static Page Pipeline — Design Document

**Date**: 2026-02-21
**Status**: Approved
**Goal**: Generate reliable, beautiful, fully-static React + Tailwind pages via LLM with zero build failures.

## Problem Statement

The current LLM full-page pipeline (experiment branch) generates raw `.tsx` files via gpt-5.2-codex. The LLM produces valid TypeScript but imports components and packages that don't exist in the sandbox:

- shadcn components not in `snapshot/ui-kit/` (alert-dialog, aspect-ratio)
- npm packages not in `snapshot/package-base.json` (@hookform/resolvers/zod)
- Custom hooks the LLM invents
- Supabase/TanStack Query code when not needed

Result: 0 TypeScript errors but the app can't render — every route returns 500 from Vite due to missing imports.

## Scope

**In scope**: Static, NO-CRUD pages only. Landing pages, portfolios, brochure sites, restaurant websites, blogs — all with hardcoded content. No database, no Supabase, no data fetching. Even content-heavy apps like blogs have all content baked into the JSX.

**Out of scope (future work)**: CRUD pages, data-driven content, form handling, authentication flows.

## Solution: Closed Import Vocabulary

The LLM continues to generate raw JSX (it's fluent at this), but with a strict closed import vocabulary:

1. The system prompt lists **every import the LLM is allowed to use** — exhaustive, explicit
2. The system prompt **explicitly forbids** anything outside the vocabulary
3. The validator **catches violations** as errors (not warnings)
4. Assembly **copies all ui-kit files** so everything referenced is available

### Allowed Imports (Exhaustive)

| Module | Allowed Exports |
|--------|----------------|
| `react` | `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`, `Fragment` |
| `@tanstack/react-router` | `createFileRoute`, `Link`, `useNavigate` |
| `@/lib/utils` | `cn` |
| `lucide-react` | Any icon name (tree-shakeable, all 1000+ icons available) |
| `@/components/ui/accordion` | `Accordion`, `AccordionContent`, `AccordionItem`, `AccordionTrigger` |
| `@/components/ui/alert` | `Alert`, `AlertDescription`, `AlertTitle` |
| `@/components/ui/avatar` | `Avatar`, `AvatarFallback`, `AvatarImage` |
| `@/components/ui/badge` | `Badge` |
| `@/components/ui/button` | `Button` |
| `@/components/ui/card` | `Card`, `CardContent`, `CardDescription`, `CardFooter`, `CardHeader`, `CardTitle` |
| `@/components/ui/carousel` | `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselNext`, `CarouselPrevious` |
| `@/components/ui/checkbox` | `Checkbox` |
| `@/components/ui/collapsible` | `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` |
| `@/components/ui/dialog` | `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle`, `DialogTrigger` |
| `@/components/ui/dropdown-menu` | `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger` |
| `@/components/ui/input` | `Input` |
| `@/components/ui/label` | `Label` |
| `@/components/ui/progress` | `Progress` |
| `@/components/ui/scroll-area` | `ScrollArea` |
| `@/components/ui/select` | `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` |
| `@/components/ui/separator` | `Separator` |
| `@/components/ui/sheet` | `Sheet`, `SheetContent`, `SheetTrigger` |
| `@/components/ui/skeleton` | `Skeleton` |
| `@/components/ui/switch` | `Switch` |
| `@/components/ui/tabs` | `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` |
| `@/components/ui/textarea` | `Textarea` |
| `@/components/ui/tooltip` | `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` |
| `@/components/ui/table` | `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` |

### Explicitly Forbidden

- `@supabase/supabase-js`, `@tanstack/react-query`, `react-hook-form`, `zod`
- `fetch()`, `window.location`, `document.querySelector()`
- Any npm package not listed above
- Custom hooks, custom context providers
- Inline `<style>` tags (use Tailwind only)
- Importing from paths that don't start with `@/components/ui/`, `@/lib/`, `lucide-react`, `react`, or `@tanstack/react-router`

## Pipeline (4 Phases)

```
User Prompt → "Build a real estate landing page"
    │
    ▼
┌──────────────────────────────┐
│ Phase 1: Creative Director    │  gpt-5.2, two-stage structured output
│ Input: prompt + PRD + tokens  │
│ Output: CreativeSpec           │  (~15K input tokens, ~4K output)
│ (already built — no changes)  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 2: Page Generator       │  gpt-5.2-codex, parallel Promise.all()
│ Input: CreativeSpec per page  │
│ Output: raw .tsx per page     │  (~8K input, ~3K output per page)
│                               │
│ CHANGE: Closed vocabulary     │
│ prompt replaces current       │
│ system prompt                 │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 3: Assembly             │  deterministic, zero LLM
│ - Copy snapshot/ui-kit/ →     │
│   src/components/ui/          │
│ - Generate __root.tsx         │
│ - Generate routeTree.gen.ts   │
│ - Generate index.css          │
│ - Generate main.tsx           │
│ - Generate utils.ts           │
│ - Generate vite.config.ts     │
│ - Skip Supabase client        │
│ - Skip auth routes            │
│                               │
│ CHANGE: add ui-kit copy       │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Phase 4: Validation           │  deterministic, zero LLM
│ - Import validation (strict)  │
│ - Link integrity              │
│ - Accessibility checks        │
│ - Hardcoded color detection   │
│ - tsc --noEmit                │
│                               │
│ CHANGE: sync VALID_SHADCN     │
│ with actual ui-kit contents   │
└──────────────────────────────┘
```

## Changes Required

### 1. `page-generator.ts` — Replace system prompt

Replace the current `buildPageGenSystemPrompt()` with a static-page-focused prompt:

- Remove ALL Supabase/TanStack Query references
- Add complete CLOSED VOCABULARY section (every allowed import with exact syntax)
- Add FORBIDDEN section
- Instruct: "All content is static — hardcode text, lists, cards directly in JSX"
- Keep: visual system rules (CSS variables, semantic colors, tw-animate-css)
- Keep: design rules from `getCondensedDesignRules()`
- Keep: "Do NOT generate nav or footer"

Also remove `contract` and `supabaseUrl`/`supabaseAnonKey` from the input since static pages don't need them.

### 2. `deterministic-assembly.ts` — Add ui-kit copy

Add a function that reads all `.tsx` files from `snapshot/ui-kit/` and includes them in the assembly output as `src/components/ui/{name}.tsx` + `src/lib/utils.ts`.

For production (Daytona sandbox): ui-kit is already in the image, skip copy.
For experiment (local /tmp): copy is required.

Add an `includeUiKit?: boolean` option to `AssemblyInput`.

### 3. `page-validator.ts` — Sync component list

Update `VALID_SHADCN_COMPONENTS` to match the actual 33 components in `snapshot/ui-kit/`:

**Add** (in ui-kit but not in validator): `avatar`, `button-group`, `carousel`, `command`, `hover-card`, `input-group`, `radio-group`, `sonner`, `spinner`

**Remove** (in validator but not in ui-kit): `breadcrumb`, `calendar`, `navigation-menu`, `pagination`, `slider`, `toggle`

Also update `VALID_PACKAGES` to include `clsx`, `tailwind-merge`, `class-variance-authority` since shadcn components import from these.

### 4. `creative-director.ts` — Force static archetype

For the static pipeline, add a system prompt instruction to:
- Always set `archetype: 'static'`
- Always set `dataRequirements: 'none'` for all sitemap entries
- Skip entity references in page briefs
- Focus entirely on copy/layout/visual decisions

### 5. `scripts/llm-fullpage-experiment.ts` — Update for static

- Change default prompt to a static page (e.g., "Build a real estate agency landing page")
- Copy `snapshot/ui-kit/` to output directory (replace current src/components/ui copy)
- Remove Supabase placeholder from generated .env
- Skip contract/entity logging for static apps

## Cost Estimate

| Phase | Model | Tokens (in/out) | Cost |
|-------|-------|-----------------|------|
| Creative Director | gpt-5.2 | ~20K/4K | ~$0.09 |
| Page gen (5-8 pages) | gpt-5.2-codex | ~8K/3K per page | ~$0.25-0.40 |
| Assembly | deterministic | 0 | $0.00 |
| Validation | deterministic | 0 | $0.00 |
| **Total** | | | **~$0.35-0.50** |

## Success Criteria

1. Generated app builds with `tsc --noEmit` — 0 errors
2. Generated app runs with `vite dev` — no 500s, no white screens, all pages render
3. All nav links and CTAs resolve to valid routes
4. Import validator reports 0 errors
5. No hardcoded colors (all use semantic CSS variables)
6. Consecutive runs produce different visual styles (no aesthetic convergence)
