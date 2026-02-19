# Phase 2 Codex Prompts — Polish Agent + Skill Restructure

Each prompt is self-contained. Give one to Codex at a time. Verify with `bunx tsc --noEmit && bun run test` after each.

---

## Task 8: Restructure Capabilities as Mastra Skill Folders + Migrate Design Knowledge

```
You are working in the VibeStack platform codebase. Restructure capability contracts into Mastra-compatible skill folders, absorbing the design knowledge from the old WordPress-theme skill system.

## Background

The codebase has TWO skill systems that need to become ONE:

1. OLD: `server/lib/skills/catalog/` — WordPress-theme-derived SKILL.md files (theme-tavola, theme-inkwell, theme-aperture, etc.). Each is a visual identity description (fonts, colors, layout hints). The old `VibeStackSkill` interface in `server/lib/skills/types.ts` has `applyToSchema()`, `generateRoutes()`, etc. — but only one skill (editorial-glamorama) has an actual `index.ts` implementation. The rest are just SKILL.md files parsed by `catalog-loader.ts` and fed to the design agent LLM.

2. NEW: `server/lib/capabilities/catalog/` — TypeScript capability contracts (auth, blog, recipes, portfolio, public-website) from Phase 1. These define schema, pages, nav, deps — but have NO design knowledge.

## Target: Unified structure

Each capability becomes a Mastra skill folder with BOTH structured contract AND design knowledge:

```
server/lib/capabilities/catalog/
  auth/
    SKILL.md              ← Mastra skill: design guidance for polish agent
    contract.ts           ← Capability contract for assembler
  public-website/
    SKILL.md              ← Landing page, hero, footer design guidance
    contract.ts
  blog/
    SKILL.md              ← Editorial design: serif typography, reading layout
    contract.ts
  recipes/
    SKILL.md              ← Food photography, warm tones, media-heavy cards
    contract.ts
  portfolio/
    SKILL.md              ← Gallery-style, dramatic imagery, minimal chrome
    contract.ts
```

## What to do

### Step 1: Move contract files into subfolders

Rename each flat contract to a subfolder:
- `server/lib/capabilities/catalog/auth.ts` → `server/lib/capabilities/catalog/auth/contract.ts`
- `server/lib/capabilities/catalog/public-website.ts` → `server/lib/capabilities/catalog/public-website/contract.ts`
- `server/lib/capabilities/catalog/blog.ts` → `server/lib/capabilities/catalog/blog/contract.ts`
- `server/lib/capabilities/catalog/recipes.ts` → `server/lib/capabilities/catalog/recipes/contract.ts`
- `server/lib/capabilities/catalog/portfolio.ts` → `server/lib/capabilities/catalog/portfolio/contract.ts`

Do NOT change the content of any contract.ts file.

### Step 2: Create SKILL.md for each capability

Each SKILL.md follows the agentskills.io format (used by Mastra Workspace). The design knowledge comes from absorbing the relevant old theme SKILL.md files.

**Map of old themes → new capabilities:**
- theme-tavola, theme-canape (restaurant-food) → recipes/SKILL.md
- theme-inkwell (blog-editorial) → blog/SKILL.md
- theme-aperture, theme-folio (photography-art, portfolio-creative) → portfolio/SKILL.md
- theme-stratton (business-corporate) → public-website/SKILL.md
- No old theme for auth → auth/SKILL.md is minimal

#### `auth/SKILL.md`

```markdown
---
name: auth
description: >
  Authentication and user profiles using Supabase Auth.
  Provides login, signup, and profile management.
version: 1.0.0
tags:
  - core
  - authentication
---

# Auth Capability

## Design Guidance

Auth pages use Supabase Auth UI components. The polish agent should NOT rewrite auth pages.

### Profile Page
If a profile page exists, style it with:
- Centered card layout (max-w-md mx-auto)
- Avatar circle at top
- Display name in heading font
- Clean form for profile editing
```

#### `public-website/SKILL.md`

```markdown
---
name: public-website
description: >
  Landing page, about page, and site footer for public-facing web apps.
  Use when the app needs a marketing homepage and informational pages.
version: 1.0.0
tags:
  - core
  - marketing
  - landing
---

# Public Website Capability

## Design Guidance

### Landing Page (/)
- **Hero section**: Full-width, use the app's hero image. Display font for headline, body font for subtext. CTA button with primary color.
- **Featured section**: Show 3-6 items from the app's primary entity in a card grid. Use the capability's card style (media-heavy for visual content, text-first for articles).
- **Footer**: Site name, tagline, and navigation links. Subtle border-top or muted background.

### About Page (/about)
- **Layout**: Centered content, max-w-3xl, generous vertical spacing.
- **Content**: App description paragraph, optional team/mission section.
- **Style**: Reading-focused — body font, comfortable line height (1.7-1.8).

### Typography Defaults
- **Headings**: Display font, semibold to bold weight
- **Body**: Body font, regular weight, 1.6-1.8 line height
- **Navigation**: Display font, uppercase optional, tracking-wide

### Color Defaults
- Use CSS custom properties from index.css (--background, --foreground, --primary, etc.)
- Hero overlays: bg-black/40 to bg-black/60 over images
- Card backgrounds: var(--card) or white with subtle border
```

#### `blog/SKILL.md`

Absorb design knowledge from theme-inkwell (blog-editorial category):

```markdown
---
name: blog
description: >
  Blog with posts, categories, and editorial reading experience.
  Use when app mentions: blog, articles, journal, writing, newsletter,
  magazine, content, stories, editorial.
version: 1.0.0
tags:
  - content
  - editorial
  - blog
---

# Blog Capability

## Design Guidance

### Visual Identity (Editorial)
Inspired by literary magazines and long-form storytelling.

**Typography**:
- Headings: Serif display font (Newsreader, Playfair Display, or Cormorant Garamond)
- Body: Serif body font for reading comfort (Source Serif 4, Lora, or Merriweather)
- Reading line-height: 1.8, max-width: 65ch for optimal readability

**Color Palette**:
- Warm paper tones: cream/ivory background (#faf9f6 to #fdfbf7)
- Rich text: near-black (#1a1a1a)
- Accent: warm amber or terracotta for links and highlights
- Muted: warm grey for metadata and secondary text

### Blog List Page (/blog)
- **Layout**: 2-column editorial grid on desktop, single column on mobile
- **Cards**: Text-first with optional featured image. Show: title (serif, large), excerpt (2-3 lines), date, category badge, author name
- **Featured post**: First post gets larger treatment — full-width card with hero image
- **Empty state**: "No posts yet. Start writing your first article."

### Blog Detail Page (/blog/$slug)
- **Layout**: Article-style centered content (max-w-prose or max-w-3xl)
- **Header**: Title in display font (text-4xl+), author + date + category below, optional hero image (full-width above title)
- **Body**: Comfortable reading typography — serif font, 1.8 line height, generous paragraph spacing
- **Navigation**: "← Back to blog" link at top, previous/next post links at bottom
```

#### `recipes/SKILL.md`

Absorb design knowledge from theme-tavola and theme-canape (restaurant-food category):

```markdown
---
name: recipes
description: >
  Recipe catalog with ingredients, cook times, and food photography.
  Use when app mentions: recipes, cooking, food, meals, ingredients,
  cookbook, culinary, restaurant, cafe, bakery, menu, kitchen, chef.
version: 1.0.0
tags:
  - content
  - food
  - recipes
---

# Recipes Capability

## Design Guidance

### Visual Identity (Warm & Inviting)
Inspired by upscale dining and food editorial photography.

**Typography**:
- Headings: Elegant serif (Cormorant Garamond, Playfair Display)
- Body: Clean sans-serif (Lato, Inter) for recipe instructions
- Recipe titles should feel warm and inviting, not clinical

**Color Palette**:
- Warm cream background (#fdfbf7 to #fffbeb)
- Deep warm brown/charcoal text (#292524)
- Accent: amber, burnt orange, or warm red (#d97706, #9a3412)
- Muted: warm sand tones for card backgrounds

### Recipe List Page (/recipes)
- **Layout**: Media-heavy card grid — 2-3 columns, large aspect-ratio images (4:3)
- **Cards**: Photo-forward with image taking 60%+ of card. Title in serif, metadata badges below (cook time, servings, difficulty). Hover: subtle scale(1.02) + shadow elevation.
- **Featured recipe**: First item gets hero treatment — full-width with dark overlay text
- **Search/filter**: By tag, difficulty, cook time

### Recipe Detail Page (/recipes/$id)
- **Layout**: Full-width hero image (max-height 60vh) → recipe title in display font → structured content below
- **Metadata**: Prep time, cook time, servings, difficulty as icon+text badges in a row
- **Ingredients**: Sidebar on desktop (sticky), or collapsible section on mobile. Checklist style.
- **Instructions**: Numbered steps with generous spacing. Clean, readable.
- **Photography**: Use Unsplash food imagery. Search query: specific to the recipe type.

### Card Style
Media-heavy: image takes up most of the card. Rounded corners (0.75rem). Warm shadow on hover.
```

#### `portfolio/SKILL.md`

Absorb design knowledge from theme-aperture and theme-folio (photography-art, portfolio-creative):

```markdown
---
name: portfolio
description: >
  Portfolio showcase with projects, skills, and testimonials.
  Use when app mentions: portfolio, projects, work, showcase, gallery,
  photography, art, creative, freelancer, agency.
version: 1.0.0
tags:
  - creative
  - portfolio
  - gallery
---

# Portfolio Capability

## Design Guidance

### Visual Identity (Gallery / Dramatic)
Inspired by fine art galleries and photographer portfolios.

**Typography**:
- Headings: Bold sans-serif (Syne, Space Grotesk, or Inter Tight) — all caps optional for nav
- Body: Clean sans-serif (Work Sans, Inter) — minimal, let images speak
- Keep text minimal — this is a visual-first layout

**Color Palette**:
- Option A (Dark): Near-black background (#111111), white text (#fafafa), minimal accent
- Option B (Light): Clean white background, dark text, high-contrast images
- Let the photography provide the color — keep UI chrome minimal
- Borders: subtle or none — use spacing to separate elements

### Project List Page (/work)
- **Layout**: Full-bleed image grid, minimal chrome. Masonry or uniform grid (columns-2 md:columns-3).
- **Cards**: Image-only with hover overlay revealing title + category. No card borders or shadows.
- **Interaction**: Hover reveals text on semi-transparent dark overlay (bg-black/60, text-white). Smooth transition.
- **Search**: Minimal or hidden — category filter tabs preferred.

### Project Detail Page (/work/$id)
- **Layout**: Full-width hero image (100vh or 70vh) → project title below → description in clean sans-serif → optional image gallery
- **Metadata**: Minimal — project type, year, technologies used. Displayed as subtle tags.
- **Navigation**: Back arrow or "All Projects" link. Previous/next project navigation at bottom.

### Testimonials
- **Style**: Large quote text in italic display font. Author name + title below. Clean card with generous padding.
- **Layout**: Single column, centered, or 2-column grid on desktop.
```

### Step 3: Update the registry loader

Update `server/lib/capabilities/catalog/index.ts`:

```typescript
import { CapabilityRegistry } from '../registry'
import { auth } from './auth/contract'
import { publicWebsite } from './public-website/contract'
import { blog } from './blog/contract'
import { recipes } from './recipes/contract'
import { portfolio } from './portfolio/contract'
import { join } from 'node:path'

export function loadCoreRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(auth)
  registry.register(publicWebsite)
  registry.register(blog)
  registry.register(recipes)
  registry.register(portfolio)
  return registry
}

/** Absolute path to capability catalog — pass to Mastra Workspace skills config */
export function getCapabilitySkillsPath(): string {
  return join(import.meta.dirname, 'catalog')
}
```

### Step 4: Delete the old skill system

These files/folders are no longer needed (the capability system replaces them):

DELETE:
- `server/lib/skills/types.ts` (old VibeStackSkill interface)
- `server/lib/skills/index.ts`
- `server/lib/skills/list.ts`
- `server/lib/skills/detail.ts`
- `server/lib/skills/canape.ts`
- `server/lib/skills/catalog/editorial-glamorama/` (entire folder)
- `server/lib/skills/catalog/function-hotel-booking/` (entire folder)
- `server/lib/skills/catalog/layout-saas-dashboard/` (entire folder)
- All `server/lib/skills/catalog/*/theme-*/SKILL.md` files (the 12 curated themes)

KEEP:
- `server/lib/skills/catalog-loader.ts` — KEEP this file but REWRITE it to load SKILL.md files from the NEW capability catalog path (`server/lib/capabilities/catalog/`) instead of the old skills path. The design-agent.ts imports `buildSkillCatalogPrompt` and `resolveThemeSkillPath` from it.

### Step 5: Update design-agent.ts imports

The design agent (`server/lib/agents/design-agent.ts`) currently imports:
- `buildSkillCatalogPrompt` from `../skills/catalog-loader`
- `resolveThemeSkillPath` from `../skills/catalog-loader`
- `getThemeBaseSchema`, `isThemeSpecificSchema` from `../theme-schemas`
- `createThemeSelectorTool` from `./theme-selector`

Update `catalog-loader.ts` so `buildSkillCatalogPrompt()` reads from `server/lib/capabilities/catalog/*/SKILL.md` and `resolveThemeSkillPath()` resolves to the new paths. The function names can stay the same for backward compat, or rename to `buildCapabilityCatalogPrompt()` / `resolveCapabilitySkillPath()` and update the import in design-agent.ts.

### Step 6: Fix any remaining imports

Search the codebase for any imports from `../skills/types`, `../skills/index`, `../skills/list`, `../skills/detail`, `../skills/canape` — remove or redirect them.

Also check for imports from deleted theme-schemas or theme-routes that reference the old theme system.

## Verification

Run: `bunx tsc --noEmit` — must compile cleanly
Run: `bun run test` — all tests pass
Run: `ls server/lib/capabilities/catalog/*/SKILL.md` — should list 5 SKILL.md files
Run: `ls server/lib/capabilities/catalog/*/contract.ts` — should list 5 contract.ts files

## Rules
- Do NOT change contract.ts content — only move files
- Do NOT delete catalog-loader.ts — rewrite it to point at new paths
- SKILL.md must follow agentskills.io frontmatter (name, description, version, tags)
- The design guidance in SKILL.md is for the polish agent LLM — make it specific and actionable, not vague
```

---

## Task 9: Create the Polish Agent

```
You are working in the VibeStack platform codebase. Create the polish agent that rewrites public-facing pages using Mastra Agent + Workspace.

## Context

Read these files first:
- `server/lib/capabilities/catalog/recipes/SKILL.md` — capability skill with design guidance (created in Task 8)
- `server/lib/capabilities/catalog/index.ts` — `getCapabilitySkillsPath()` (created in Task 8)
- `server/lib/capabilities/types.ts` — PageDef, DesignHints
- `server/lib/capabilities/assembler.ts` — AssemblyResult
- `server/lib/themed-code-engine.ts` — first 55 lines (ThemeTokens interface)
- `server/lib/agents/provider.ts` — `createAgentModelResolver()` and `PIPELINE_MODELS`
- `server/lib/app-blueprint.ts` — `AppBlueprint`, `BlueprintFile` types
- `server/lib/sandbox.ts` — Daytona sandbox SDK patterns (getSandbox, executeCommand)

Mastra Workspace reference: https://mastra.ai/docs/workspace/skills
- `Workspace({ filesystem, skills: [path] })` loads SKILL.md files as agent context
- Workspace provides tools: `mastra_workspace_read_file`, `mastra_workspace_write_file`, `mastra_workspace_execute_command`
- Skills are surfaced in agent system messages automatically

## What to create

### File: `server/lib/agents/polish-agent.ts`

```typescript
import { Agent } from '@mastra/core/agent'
import { Workspace, LocalFilesystem } from '@mastra/core/workspace'
import type { AssemblyResult } from '../capabilities/assembler'
import type { ThemeTokens } from '../themed-code-engine'
import type { AppBlueprint, BlueprintFile } from '../app-blueprint'
import { createAgentModelResolver } from './provider'
import { getCapabilitySkillsPath } from '../capabilities/catalog'
```

#### The `runPolish` function

```typescript
export interface PolishInput {
  sandboxId: string
  blueprint: AppBlueprint
  assembly: AssemblyResult | null
  tokens: ThemeTokens
  tokenBudget?: number  // Default 50000
}

export interface PolishResult {
  rewrittenFiles: Array<{ path: string; content: string }>
  tokensUsed: number
  polishApplied: boolean  // false if skipped or failed
}

export async function runPolish(input: PolishInput): Promise<PolishResult>
```

#### Logic:

1. If `input.assembly` is null, return immediately: `{ rewrittenFiles: [], tokensUsed: 0, polishApplied: false }`

2. Identify polishable files from the blueprint:
   - Files where `isLLMSlot: true`
   - OR files whose path matches a `public-list` or `public-detail` page from `assembly.pages`
   - NEVER: files in `src/lib/`, files ending in `.hooks.ts`, files in `src/components/ui/`, SQL files, config files

3. Create a Mastra Agent:
   - `id: 'polish-agent'`
   - `model: createAgentModelResolver('codegen')`
   - System instructions (see below)
   - Temperature: 0.7 (creative but not wild)

4. Create a Mastra Workspace:
   - `filesystem: new LocalFilesystem({ basePath: '/tmp/polish-workspace' })` (or Daytona adapter if available)
   - `skills: [getCapabilitySkillsPath()]` — loads capability SKILL.md files

5. For each polishable file:
   - Build a prompt with: the current file content, the ThemeTokens (CSS vars, fonts, colors), design hints from assembly, the file's role (public-list, public-detail, homepage)
   - Call `agent.generate()` asking the agent to rewrite the JSX
   - Track token usage; stop if exceeding budget

6. Return all rewritten files

#### System Instructions for the Polish Agent:

```
You are a senior frontend designer for VibeStack. You rewrite React page components to be visually stunning and unique.

You receive scaffold pages (working but generic) and rewrite their JSX to match the design guidance from the capability's SKILL.md.

## What you CAN do:
- Rewrite JSX structure, layout, and Tailwind classes in public-facing pages
- Add CSS animations using Tailwind (animate-*, transition-*)
- Create new visual patterns (grids, masonry, overlays, cards)
- Adjust typography (font sizes, weights, line heights via Tailwind)
- Add decorative elements (dividers, gradients, background patterns)

## What you MUST preserve:
- All React imports (keep all existing imports, add new ones if needed)
- The `createFileRoute()` export and its path string — DO NOT change the route path
- All `useQuery` / `useSuspenseQuery` / `useMutation` hooks and their return variables
- All `supabase.from()` calls — data fetching logic is immutable
- Component function name and default export
- TypeScript types — do not add `any` or remove type annotations

## What you CANNOT do:
- Modify files outside of public pages (no hooks, no types, no SQL, no config)
- Add new npm dependencies (only use what's in package.json)
- Change Supabase queries or TanStack Query hook calls
- Remove existing data display (if the scaffold shows a field, your rewrite must show it too)
- Use inline styles — Tailwind only

## Design System
Use CSS custom properties from index.css. Available variables:
--background, --foreground, --primary, --primary-foreground, --secondary, --accent, --muted, --border
--font-display (heading font), --font-body (body font)
--radius (border radius)

Apply them via Tailwind: bg-[var(--background)], text-[var(--primary)], font-[family-name:var(--font-display)], etc.

## Output Format
Return the COMPLETE rewritten file content. Do not return diffs or partial code. Include ALL imports.
```

### File: `tests/polish-agent.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('Polish Agent', () => {
  it('returns early when assembly is null', async () => {
    const { runPolish } = await import('@server/agents/polish-agent')
    const result = await runPolish({
      sandboxId: 'test',
      blueprint: { meta: { appName: 'Test', appDescription: 'Test' }, features: {} as any, contract: { tables: [] }, fileTree: [] },
      assembly: null,
      tokens: {} as any,
    })
    expect(result.polishApplied).toBe(false)
    expect(result.rewrittenFiles).toEqual([])
    expect(result.tokensUsed).toBe(0)
  })

  it('identifies polishable files from blueprint', async () => {
    // Test that only public page files are selected for polishing
    // Mock the agent to avoid real LLM calls
  })

  it('respects token budget', async () => {
    // Mock agent to return usage above budget
    // Verify polish stops and returns partial results
  })

  it('system instructions contain boundary rules', async () => {
    // Verify the agent instructions mention all boundary constraints
  })
})
```

## Verification

Run: `bunx tsc --noEmit` — must compile
Run: `bunx vitest run tests/polish-agent.test.ts` — tests pass

## Important notes
- The Mastra Workspace loads SKILL.md from `getCapabilitySkillsPath()` — this makes design guidance automatically available to the agent
- Do NOT create custom Mastra tools — use Workspace's built-in filesystem tools
- Disable Workspace tools we don't need (search, index) — we only need read_file, write_file, execute_command
- If `@mastra/core/workspace` doesn't export `LocalFilesystem`, check the actual exports: `import { Workspace } from '@mastra/core/workspace'` and read the type definitions
- For the Daytona sandbox filesystem, check if Mastra has a remote filesystem adapter. If not, create a thin adapter that uses Daytona SDK. Read `server/lib/sandbox.ts` for patterns.
```

---

## Task 10: Add `polishing` State to XState Machine

```
You are working in the VibeStack platform codebase. Add a "polishing" state to the XState pipeline machine.

## Context

Read these files first:
- `server/lib/agents/machine.ts` — full file, understand the state machine
- `server/lib/agents/orchestrator.ts` — handler functions
- `server/lib/agents/polish-agent.ts` — `runPolish()` function and types (created in Task 9)

## Current pipeline states

```
idle → preparing (parallel) → blueprinting → generating → validating → [repairing] → reviewing → deploying → cleanup
```

## New pipeline

```
idle → preparing → blueprinting → generating → POLISHING → validating → [repairing] → reviewing → deploying → cleanup
```

## What to change

### 1. Add `polishing` state in machine.ts

Between `generating` and `validating`:

```typescript
polishing: {
  invoke: {
    src: 'runPolishActor',
    input: ({ context }) => ({
      sandboxId: context.sandboxId!,
      blueprint: context.blueprint!,
      assembly: context.assembly,
      tokens: context.blueprint!.meta,  // ThemeTokens are stored in blueprint
    }),
    onDone: {
      target: 'validating',
      actions: assign({
        totalTokens: ({ context, event }) =>
          context.totalTokens + (event.output?.tokensUsed ?? 0),
      }),
    },
    onError: {
      // Polish failure is NON-FATAL — serve scaffold without polish
      target: 'validating',
    },
  },
},
```

### 2. Add `runPolishActor` to actors

```typescript
runPolishActor: fromPromise(async ({ input }) => {
  const { runPolish } = await import('./polish-agent')
  return runPolish(input)
}),
```

### 3. Update `generating` state transition

Change the `generating` state's success transition from `'validating'` to `'polishing'`.

Search for the generating state definition and change its `onDone.target` or the transition after code generation completes.

### 4. Add to MachineContext

```typescript
polishTokens: number  // Initialize to 0
```

Update the polishing onDone to also set `polishTokens`.

## Verification

Run: `bunx tsc --noEmit` — must compile
Run: `bun run test` — all tests pass
Run: `bunx vitest run tests/machine.test.ts` — machine tests pass

## Critical rules
- Polish `onError` target MUST be `'validating'` (NOT `'failed'`) — polish failure is graceful degradation
- Do NOT change any other state transitions
- If assembly is null, the polish actor should return immediately (handled inside runPolish)
```

---

## Task 11: Polish Agent Validation + Self-Repair Loop

```
You are working in the VibeStack platform codebase. Add a validation gate and self-repair loop to the polish agent.

## Context

Read these files:
- `server/lib/agents/polish-agent.ts` — the polish agent (created in Task 9)
- `server/lib/sandbox.ts` — Daytona sandbox exec patterns

## What to add

In `server/lib/agents/polish-agent.ts`, after the polish agent rewrites files:

1. Upload rewritten files to the Daytona sandbox (overwrite the scaffold versions)
2. Run `bunx tsc --noEmit` in the sandbox
3. Run `bunx vite build` in the sandbox
4. If build passes → return rewritten files (success)
5. If build fails → feed errors back to the polish agent, ask it to fix
6. Retry up to 3 times
7. If all retries fail → return empty array (fallback to scaffold)

```typescript
async function validatePolishedFiles(
  sandboxId: string,
  files: Array<{ path: string; content: string }>,
  agent: Agent,
  maxRetries: number = 3,
): Promise<Array<{ path: string; content: string }>> {
  let current = files

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Upload files to sandbox
    const sandbox = await getSandbox(sandboxId)
    for (const file of current) {
      await uploadFile(sandbox, file.path, file.content)
    }

    // Run tsc
    const tscResult = await execInSandbox(sandbox, 'bunx tsc --noEmit')
    if (tscResult.exitCode !== 0) {
      current = await repairFiles(agent, current, tscResult.stderr, 'TypeScript errors')
      continue
    }

    // Run vite build
    const buildResult = await execInSandbox(sandbox, 'bunx vite build')
    if (buildResult.exitCode !== 0) {
      current = await repairFiles(agent, current, buildResult.stderr, 'Build errors')
      continue
    }

    // Both passed
    return current
  }

  // All retries exhausted — fallback to scaffold
  return []
}
```

Use the existing sandbox helpers from `server/lib/sandbox.ts` — read that file to see `getSandbox()`, `uploadFile()`, `execInSandbox()` patterns.

### Tests

Add to `tests/polish-agent.test.ts`:
1. Validation passes first attempt → returns files
2. Validation fails, repair succeeds → returns repaired files
3. All 3 retries fail → returns empty array

Mock sandbox exec and agent generate.

## Verification

Run: `bunx tsc --noEmit`
Run: `bunx vitest run tests/polish-agent.test.ts`
```

---

## Task 12: E2E Verification

```
You are working in the VibeStack platform codebase. Run full verification.

## Steps

1. TypeScript: `bunx tsc --noEmit` — 0 errors
2. Lint: `bun run lint` — report any errors (may have pre-existing issues)
3. Tests: `bun run test` — all pass
4. Verify structure:
   - `ls server/lib/capabilities/catalog/*/SKILL.md` — should list 5 files
   - `ls server/lib/capabilities/catalog/*/contract.ts` — should list 5 files
5. Verify old skills deleted:
   - `ls server/lib/skills/types.ts` — should NOT exist
   - `ls server/lib/skills/catalog/editorial-glamorama/` — should NOT exist
6. Report: new file count, test count, any warnings

## If tests fail

Fix root causes. Do NOT disable tests. Common issues:
- Imports from deleted skills files → update to new paths
- catalog-loader.ts pointing at old paths → update to capabilities/catalog/
- design-agent.ts broken by skill path changes → update imports
```
