# Pipeline B Chat Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire Pipeline B (LLM full-page generation with closed vocabulary) into the XState machine and render each agent as a rich Vercel AI Elements card in the chat timeline.

**Architecture:** Replace Pipeline A's actors inside the existing XState machine (keep state topology, swap internals). Split `blueprinting` into `designing` + `architecting`, split `generating` into `pageGeneration` + `assembly`, remove `polishing`. Add new SSE event types for each agent's output. Build 4 custom UI components for the chat timeline.

**Tech Stack:** XState 5, Mastra agents, Hono SSE, React 19, Vercel AI Elements (shadcn-based), Tailwind v4, TanStack Query

**Design Doc:** `docs/plans/2026-02-21-pipeline-b-chat-integration-design.md`

---

## Task 1: Add New SSE Event Types to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts:271-455`

**Step 1: Write failing test**

Create: `tests/stream-event-types.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import type {
  StreamEvent,
  DesignTokensEvent,
  ArchitectureReadyEvent,
  PageGeneratingEvent,
  PageCompleteEvent,
  FileAssembledEvent,
  ValidationCheckEvent,
  TimelineEntry,
} from '@/lib/types'

describe('new SSE event types', () => {
  it('DesignTokensEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = {
      type: 'design_tokens',
      tokens: {
        name: 'canape',
        colors: { background: '#fff', foreground: '#111', primary: '#2b6cb0', primaryForeground: '#fff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
        fonts: { display: 'Playfair Display', body: 'Inter', googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter&family=Playfair+Display' },
        style: { borderRadius: '0.5rem', cardStyle: 'bordered', navStyle: 'top-bar', heroLayout: 'fullbleed', spacing: 'normal', motion: 'subtle', imagery: 'photography-heavy' },
        authPosture: 'public',
        textSlots: { hero_headline: 'Welcome', hero_subtext: 'A restaurant', about_paragraph: 'About us', cta_label: 'Reserve', empty_state: 'No items', footer_tagline: 'Built with care' },
      },
    }
    expect(event.type).toBe('design_tokens')
  })

  it('ArchitectureReadyEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = {
      type: 'architecture_ready',
      spec: {
        archetype: 'static',
        sitemap: [{ route: '/', componentName: 'Homepage', purpose: 'Landing page', sections: ['hero', 'grid'], dataRequirements: 'none' }],
        auth: { required: false },
      },
    }
    expect(event.type).toBe('architecture_ready')
  })

  it('PageGeneratingEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'page_generating', fileName: 'index.tsx', route: '/', componentName: 'Homepage', pageIndex: 0, totalPages: 8 }
    expect(event.type).toBe('page_generating')
  })

  it('PageCompleteEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'page_complete', fileName: 'index.tsx', route: '/', componentName: 'Homepage', lineCount: 142, code: '// first 50 lines', pageIndex: 0, totalPages: 8 }
    expect(event.type).toBe('page_complete')
  })

  it('FileAssembledEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'file_assembled', path: 'vite.config.ts', category: 'config' }
    expect(event.type).toBe('file_assembled')
  })

  it('ValidationCheckEvent is assignable to StreamEvent', () => {
    const event: StreamEvent = { type: 'validation_check', name: 'imports', status: 'passed' }
    expect(event.type).toBe('validation_check')
  })

  it('new TimelineEntry variants exist', () => {
    const entries: TimelineEntry[] = [
      { type: 'design_tokens', tokens: {} as any, ts: Date.now() },
      { type: 'architecture', spec: {} as any, ts: Date.now() },
      { type: 'page_progress', pages: [], ts: Date.now() },
      { type: 'file_assembly', files: [], ts: Date.now() },
      { type: 'validation', checks: [], ts: Date.now() },
    ]
    expect(entries).toHaveLength(5)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/stream-event-types.test.ts`
Expected: FAIL — types don't exist yet

**Step 3: Add event type interfaces to `src/lib/types.ts`**

After the existing event interfaces (around line 444), add the 6 new event interfaces. Add them to the `StreamEvent` union (line 271-294). Add new variants to `TimelineEntry` (line 450-455). Add `PageProgressEntry`, `FileAssemblyEntry`, `ValidationCheckEntry` types.

Refer to design doc § "New SSE Event Types" for exact type definitions.

Also enrich `PlanReadyEvent` (line 430-433) to include `prd: string` in the plan shape.

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/stream-event-types.test.ts`
Expected: PASS

**Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 6: Commit**

```bash
git add src/lib/types.ts tests/stream-event-types.test.ts
git commit -m "feat: add Pipeline B SSE event types — design_tokens, architecture_ready, page_*, file_assembled, validation_check"
```

---

## Task 2: Add Progress Callbacks to `page-generator.ts` and `page-validator.ts`

**Files:**
- Modify: `server/lib/page-generator.ts:34-41,61-80,86-114`
- Modify: `server/lib/page-validator.ts:30-37,571-576`
- Test: `tests/page-generator-callbacks.test.ts`

**Step 1: Write failing test for page-generator callbacks**

Create: `tests/page-generator-callbacks.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { PageGeneratorInput } from '@server/page-generator'

describe('page-generator callbacks', () => {
  it('PageGeneratorInput accepts onPageStart and onPageComplete callbacks', () => {
    const input: PageGeneratorInput = {
      spec: { archetype: 'static', sitemap: [], visualDna: {} as any, auth: { required: false }, publicRoutes: [] },
      onPageStart: vi.fn(),
      onPageComplete: vi.fn(),
    }
    expect(input.onPageStart).toBeDefined()
    expect(input.onPageComplete).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/page-generator-callbacks.test.ts`
Expected: FAIL — `onPageStart` and `onPageComplete` not in the type

**Step 3: Add callback fields to `PageGeneratorInput`**

In `server/lib/page-generator.ts`, add to `PageGeneratorInput` interface (lines 34-41):

```typescript
export interface PageGeneratorInput {
  spec: CreativeSpec
  contract?: SchemaContract
  imagePool?: string[]
  onPageStart?: (fileName: string, route: string, componentName: string, index: number, total: number) => void
  onPageComplete?: (fileName: string, route: string, componentName: string, lineCount: number, code: string, index: number, total: number) => void
}
```

In `generatePages()` (line 63-65), call `onPageStart` before each `generateSinglePage` and `onPageComplete` after:

```typescript
export async function generatePages(input: PageGeneratorInput): Promise<PageGeneratorResult> {
  const { spec, contract, imagePool, onPageStart, onPageComplete } = input
  const total = spec.sitemap.length

  const results = await Promise.all(
    spec.sitemap.map(async (page, index) => {
      onPageStart?.(page.fileName ?? `${page.componentName}.tsx`, page.route, page.componentName, index, total)
      const result = await generateSinglePage(page, spec, contract ?? null, imagePool ?? [])
      const lineCount = result.content.split('\n').length
      const codePreview = result.content.split('\n').slice(0, 50).join('\n')
      onPageComplete?.(result.fileName, page.route, page.componentName, lineCount, codePreview, index, total)
      return result
    }),
  )
  // ... rest unchanged
}
```

**Step 4: Add `onCheckStart`/`onCheckComplete` callbacks to `ValidatorInput`**

In `server/lib/page-validator.ts`, add to `ValidatorInput` (lines 30-37):

```typescript
interface ValidatorInput {
  files: Map<string, string>
  validRoutes: string[]
  hasSupabase: boolean
  onCheckStart?: (name: string) => void
  onCheckComplete?: (name: string, status: 'passed' | 'failed', errors?: ValidationError[]) => void
}
```

In `validateGeneratedApp()` (line 571+), wrap each check group (imports, links, accessibility, hardcoded colors) with callbacks:

```typescript
input.onCheckStart?.('imports')
// ... existing checkImports() calls
const importErrors = errors.filter(e => e.type === 'missing_import' || e.type === 'invalid_import')
input.onCheckComplete?.('imports', importErrors.length === 0 ? 'passed' : 'failed', importErrors)
```

**Step 5: Run tests**

Run: `bun run test -- tests/page-generator-callbacks.test.ts`
Expected: PASS

**Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 7: Commit**

```bash
git add server/lib/page-generator.ts server/lib/page-validator.ts tests/page-generator-callbacks.test.ts
git commit -m "feat: add progress callbacks to page-generator and page-validator for SSE streaming"
```

---

## Task 3: Create New Orchestrator Actor Functions

**Files:**
- Modify: `server/lib/agents/orchestrator.ts:181-285`
- Test: `tests/orchestrator-actors.test.ts`

**Step 1: Write failing test**

Create: `tests/orchestrator-actors.test.ts`

```typescript
import { describe, it, expect } from 'vitest'

describe('pipeline B orchestrator exports', () => {
  it('exports runDesign', async () => {
    const mod = await import('@server/agents/orchestrator')
    expect(typeof mod.runDesign).toBe('function')
  })
  it('exports runArchitect', async () => {
    const mod = await import('@server/agents/orchestrator')
    expect(typeof mod.runArchitect).toBe('function')
  })
  it('exports runPageGeneration', async () => {
    const mod = await import('@server/agents/orchestrator')
    expect(typeof mod.runPageGeneration).toBe('function')
  })
  it('exports runAssembly', async () => {
    const mod = await import('@server/agents/orchestrator')
    expect(typeof mod.runAssembly).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/orchestrator-actors.test.ts`
Expected: FAIL — functions don't exist

**Step 3: Implement 4 new actor functions in `orchestrator.ts`**

After the existing `runBlueprint()` function (line 190), add:

**`runDesign()`**: Calls `runDesignAgent()` from `design-agent.ts`. Returns `{ tokens, selectedTheme, themeReasoning, tokensUsed }`.

**`runArchitect()`**: Calls `runCreativeDirector()` from `creative-director.ts`. Returns `{ spec: CreativeSpec, tokensUsed }`.

**`runPageGeneration()`**: Calls `generatePages()` from `page-generator.ts` with progress callbacks. Returns `{ pages: GeneratedPage[], tokensUsed }`.

**`runAssembly()`**: Calls `assembleApp()` from `deterministic-assembly.ts`, then uploads files to Daytona sandbox, runs `bun install`, applies SQL migration via `runMigration()`, applies seed SQL. Returns `{ assembledFiles, tokensUsed: 0 }`. This is a refactored version of the existing `runCodeGeneration()` (lines 196-285) with the blueprint replaced by `assembledFiles + generatedPages`.

Refer to:
- `server/lib/agents/design-agent.ts:138` for `runDesignAgent()` signature
- `server/lib/creative-director.ts` for `runCreativeDirector()` signature
- `server/lib/page-generator.ts:61` for `generatePages()` signature
- `server/lib/deterministic-assembly.ts` for `assembleApp()` signature
- `server/lib/agents/orchestrator.ts:196-285` for existing `runCodeGeneration()` (the upload/install/migrate logic to reuse in `runAssembly`)

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/orchestrator-actors.test.ts`
Expected: PASS

**Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 6: Commit**

```bash
git add server/lib/agents/orchestrator.ts tests/orchestrator-actors.test.ts
git commit -m "feat: add Pipeline B orchestrator actors — runDesign, runArchitect, runPageGeneration, runAssembly"
```

---

## Task 4: Rewire XState Machine — States + Actors

**Files:**
- Modify: `server/lib/agents/machine.ts:16-62,103-760,865-1255`

This is the largest single change. It modifies the MachineContext, the actor definitions in `setup()`, and the state topology in `createMachine()`.

**Step 1: Update MachineContext** (lines 16-62)

Add new fields:
```typescript
tokens: ThemeTokens | null        // from designing
creativeSpec: CreativeSpec | null  // from architecting
generatedPages: GeneratedPage[] | null  // from pageGeneration
assembledFiles: BlueprintFile[] | null  // from assembly
prd: string | null                // analyst PRD
imagePool: string[]               // Unsplash URLs
```

Remove: `polishTokens: number` (line 58)

Set defaults in `context:` (around line 230-247): `tokens: null, creativeSpec: null, generatedPages: null, assembledFiles: null, prd: null, imagePool: []`

**Step 2: Update actor definitions in `setup()`** (lines 103-215)

Remove: `runPolishActor` (lines 133-138)

Add:
```typescript
runDesignActor: fromPromise(async ({ input }) => {
  const { runDesign } = await import('./orchestrator')
  return runDesign(input)
}),
runArchitectActor: fromPromise(async ({ input }) => {
  const { runArchitect } = await import('./orchestrator')
  return runArchitect(input)
}),
runPageGenerationActor: fromPromise(async ({ input }) => {
  const { runPageGeneration } = await import('./orchestrator')
  return runPageGeneration(input)
}),
runAssemblyActor: fromPromise(async ({ input }) => {
  const { runAssembly } = await import('./orchestrator')
  return runAssembly(input)
}),
```

**Step 3: Update state topology** (lines 248-759)

Change `preparing.onDone` target from `'blueprinting'` to `'designing'`

Replace `blueprinting` state (lines 394-433) with:

```typescript
designing: {
  after: { 60_000: { target: 'failed', actions: assign({ error: 'Design timed out' }) } },
  invoke: {
    src: 'runDesignActor',
    input: ({ context }) => ({
      userPrompt: context.userMessage,
      contract: context.contract!,
      appName: context.appName ?? '',
      appDescription: context.appDescription ?? '',
    }),
    onDone: {
      target: 'architecting',
      actions: assign({
        tokens: ({ event }) => event.output.tokens,
        totalTokens: ({ context, event }) => context.totalTokens + (event.output.tokensUsed ?? 0),
      }),
    },
    onError: { target: 'failed', actions: assign({ error: ({ event }) => String(event.error) }) },
  },
},
architecting: {
  after: { 120_000: { target: 'failed', actions: assign({ error: 'Architect timed out' }) } },
  invoke: {
    src: 'runArchitectActor',
    input: ({ context }) => ({
      userPrompt: context.userMessage,
      appName: context.appName ?? '',
      appDescription: context.appDescription ?? '',
      contract: context.contract!,
      tokens: context.tokens!,
    }),
    onDone: {
      target: 'pageGeneration',
      actions: assign({
        creativeSpec: ({ event }) => event.output.spec,
        imagePool: ({ event }) => event.output.imagePool ?? [],
        totalTokens: ({ context, event }) => context.totalTokens + (event.output.tokensUsed ?? 0),
      }),
    },
    onError: { target: 'failed', actions: assign({ error: ({ event }) => String(event.error) }) },
  },
},
```

Replace `generating` state (lines 435-473) with:

```typescript
pageGeneration: {
  after: { 300_000: { target: 'cleanup', actions: assign({ error: 'Page generation timed out' }) } },
  invoke: {
    src: 'runPageGenerationActor',
    input: ({ context }) => ({
      spec: context.creativeSpec!,
      contract: context.contract,
      imagePool: context.imagePool,
    }),
    onDone: {
      target: 'assembly',
      actions: assign({
        generatedPages: ({ event }) => event.output.pages,
        totalTokens: ({ context, event }) => context.totalTokens + (event.output.tokensUsed ?? 0),
      }),
    },
    onError: { target: 'cleanup', actions: assign({ error: ({ event }) => String(event.error) }) },
  },
},
assembly: {
  after: { 120_000: { target: 'cleanup', actions: assign({ error: 'Assembly timed out' }) } },
  invoke: {
    src: 'runAssemblyActor',
    input: ({ context }) => ({
      spec: context.creativeSpec!,
      generatedPages: context.generatedPages!,
      appName: context.appName ?? '',
      contract: context.contract!,
      sandboxId: context.sandboxId!,
      supabaseProjectId: context.supabaseProjectId!,
      supabaseUrl: context.supabaseUrl!,
      supabaseAnonKey: context.supabaseAnonKey!,
    }),
    onDone: {
      target: 'validating',
      actions: assign({
        assembledFiles: ({ event }) => event.output.assembledFiles,
        blueprint: ({ event }) => event.output.blueprint,
      }),
    },
    onError: { target: 'cleanup', actions: assign({ error: ({ event }) => String(event.error) }) },
  },
},
```

Remove: `polishing` state (lines 475-528)

**Step 4: Update mock machine similarly** (lines 865-1255)

Mirror the same state topology changes in `mockAppGenerationMachine`. Use `fromPromise` with `delay()` + mock data for `runDesignActor`, `runArchitectActor`, `runPageGenerationActor`, `runAssemblyActor`. Remove mock `polishing`. Add mock `ThemeTokens`, mock `CreativeSpec`, mock `GeneratedPage[]` data.

**Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 6: Commit**

```bash
git add server/lib/agents/machine.ts
git commit -m "feat: rewire XState machine for Pipeline B — designing, architecting, pageGeneration, assembly states"
```

---

## Task 5: Update `STATE_PHASES` and SSE Bridge in `agent.ts`

**Files:**
- Modify: `server/routes/agent.ts:74-87,103-116,124-387`

**Step 1: Update STATE_PHASES** (lines 74-87)

Replace with:
```typescript
const STATE_PHASES: Record<string, { name: string; phase: number; agentId?: string; agentName?: string }> = {
  analyzing:      { name: 'Analyzing requirements',      phase: 1, agentId: 'analyst',      agentName: 'Analyst' },
  awaitingClarification: { name: 'Awaiting clarification', phase: 1 },
  provisioning:   { name: 'Provisioning infrastructure',  phase: 1, agentId: 'provisioner',  agentName: 'Provisioner' },
  designing:      { name: 'Designing theme',              phase: 2, agentId: 'designer',     agentName: 'Design Agent' },
  architecting:   { name: 'Architecting app',             phase: 2, agentId: 'architect',    agentName: 'Architect Agent' },
  pageGeneration: { name: 'Generating pages',             phase: 3, agentId: 'frontend',     agentName: 'Frontend Engineer' },
  assembly:       { name: 'Assembling app',               phase: 3, agentId: 'backend',      agentName: 'Backend Engineer' },
  validating:     { name: 'Validating code',              phase: 4, agentId: 'qa',           agentName: 'Quality Assurance' },
  repairing:      { name: 'Repairing errors',             phase: 4, agentId: 'repair',       agentName: 'Repair Agent' },
  reviewing:      { name: 'Reviewing code',               phase: 5, agentId: 'reviewer',     agentName: 'Code Reviewer' },
  deploying:      { name: 'Deploying app',                phase: 6, agentId: 'deployer',     agentName: 'Deployer' },
  complete:       { name: 'Complete',                     phase: 7 },
  failed:         { name: 'Failed',                       phase: 7 },
}
```

**Step 2: Update STATE_TO_DB_STATUS** (lines 103-116)

Remove `polishing`. Add `designing`, `architecting`, `pageGeneration`, `assembly`. Map them to appropriate DB statuses (`designing` → `'planning'`, `architecting` → `'planning'`, `pageGeneration` → `'generating'`, `assembly` → `'generating'`).

**Step 3: Add SSE emissions for new events in `streamActorStates()`**

In the state transition handler (around lines 160-325), add special-case emissions:

- When entering `designing` and exiting: emit `design_tokens` with `context.tokens`
- When entering `architecting` and exiting: emit `architecture_ready` with `context.creativeSpec`
- When in `pageGeneration`: the per-page events come via the actor's progress callbacks — emit `page_generating` and `page_complete` from inside the actor. In `streamActorStates`, just do `agent_start`/`agent_complete` normally.
- When in `assembly`: similarly, `file_assembled` events come from the actor callback.
- When in `validating`: `validation_check` events come from the actor callback.

For the mock pipeline: update `mockProgress` map (lines 338-348) to include the new agent IDs with appropriate mock messages.

**Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```bash
git add server/routes/agent.ts
git commit -m "feat: update STATE_PHASES and SSE bridge for Pipeline B agent names and events"
```

---

## Task 6: Build ThemeTokensCard Component

**Files:**
- Create: `src/components/ai-elements/theme-tokens-card.tsx`
- Test: `tests/theme-tokens-card.test.tsx`

**Step 1: Write failing test**

Create: `tests/theme-tokens-card.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'

const mockTokens = {
  name: 'canape',
  colors: { background: '#ffffff', foreground: '#111111', primary: '#2b6cb0', primaryForeground: '#ffffff', secondary: '#e5e7eb', accent: '#f59e0b', muted: '#f3f4f6', border: '#d1d5db' },
  fonts: { display: 'Playfair Display', body: 'Inter', googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter&family=Playfair+Display' },
  style: { borderRadius: '0.5rem', cardStyle: 'bordered' as const, navStyle: 'top-bar' as const, heroLayout: 'fullbleed' as const, spacing: 'normal' as const, motion: 'subtle' as const, imagery: 'photography-heavy' as const },
  authPosture: 'public' as const,
  textSlots: { hero_headline: 'Welcome', hero_subtext: 'Test', about_paragraph: 'About', cta_label: 'CTA', empty_state: 'Empty', footer_tagline: 'Footer' },
}

describe('ThemeTokensCard', () => {
  it('renders theme name', () => {
    render(<ThemeTokensCard tokens={mockTokens} />)
    expect(screen.getByText('canape')).toBeDefined()
  })

  it('renders 8 color swatches', () => {
    const { container } = render(<ThemeTokensCard tokens={mockTokens} />)
    const swatches = container.querySelectorAll('[data-testid^="swatch-"]')
    expect(swatches.length).toBe(8)
  })

  it('renders font names', () => {
    render(<ThemeTokensCard tokens={mockTokens} />)
    expect(screen.getByText(/Playfair Display/)).toBeDefined()
    expect(screen.getByText(/Inter/)).toBeDefined()
  })

  it('renders style chips', () => {
    render(<ThemeTokensCard tokens={mockTokens} />)
    expect(screen.getByText('bordered')).toBeDefined()
    expect(screen.getByText('top-bar')).toBeDefined()
    expect(screen.getByText('fullbleed')).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/theme-tokens-card.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement ThemeTokensCard**

Create `src/components/ai-elements/theme-tokens-card.tsx`:

- Import `Badge` from `@/components/ui/badge`, `Card`/`CardContent`/`CardHeader`/`CardTitle` from `@/components/ui/card`
- **Colors section**: Row of 8 `div` elements, each 32x32px rounded square with `style={{ backgroundColor: color }}` and a label below. Use `data-testid="swatch-{key}"`.
- **Fonts section**: Two lines — "Display: {name}" rendered with `style={{ fontFamily: name }}`, same for Body. Include a `<style>` tag with `@import url(googleFontsUrl)` to load the fonts dynamically.
- **Style section**: Row of `Badge` components for each style property: cardStyle, navStyle, heroLayout, spacing, motion, imagery. Label above each badge.

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/theme-tokens-card.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ai-elements/theme-tokens-card.tsx tests/theme-tokens-card.test.tsx
git commit -m "feat: ThemeTokensCard component — color swatches, font previews, style chips"
```

---

## Task 7: Build ArchitectureCard Component

**Files:**
- Create: `src/components/ai-elements/architecture-card.tsx`
- Test: `tests/architecture-card.test.tsx`

**Step 1: Write failing test**

Create: `tests/architecture-card.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchitectureCard } from '@/components/ai-elements/architecture-card'

const mockSpec = {
  archetype: 'static',
  sitemap: [
    { route: '/', componentName: 'Homepage', purpose: 'Landing page', sections: ['hero-fullbleed', 'grid-card'], dataRequirements: 'none' },
    { route: '/menu/', componentName: 'MenuPage', purpose: 'Restaurant menu', sections: ['category-tabs', 'menu-grid'], dataRequirements: 'none' },
    { route: '/contact/', componentName: 'ContactPage', purpose: 'Contact form', sections: ['form', 'map'], dataRequirements: 'none' },
  ],
  auth: { required: false },
}

describe('ArchitectureCard', () => {
  it('renders archetype badge', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText('static')).toBeDefined()
  })

  it('renders page count', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText(/3 pages/)).toBeDefined()
  })

  it('renders all route paths', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText('/')).toBeDefined()
    expect(screen.getByText('/menu/')).toBeDefined()
    expect(screen.getByText('/contact/')).toBeDefined()
  })

  it('renders component names', () => {
    render(<ArchitectureCard spec={mockSpec} />)
    expect(screen.getByText('Homepage')).toBeDefined()
    expect(screen.getByText('MenuPage')).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/architecture-card.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement ArchitectureCard**

Create `src/components/ai-elements/architecture-card.tsx`:

- Import `Badge`, `Card`, `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`
- Top: archetype badge + `{sitemap.length} pages`
- Route map: each route as a row with monospace route path, component name, and a collapsible trigger to show sections list
- Each section in the sections array rendered as a small chip inside the collapsible content

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/architecture-card.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ai-elements/architecture-card.tsx tests/architecture-card.test.tsx
git commit -m "feat: ArchitectureCard component — route map with collapsible section briefs"
```

---

## Task 8: Build PageProgressCard Component

**Files:**
- Create: `src/components/ai-elements/page-progress-card.tsx`
- Test: `tests/page-progress-card.test.tsx`

**Step 1: Write failing test**

Create: `tests/page-progress-card.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageProgressCard } from '@/components/ai-elements/page-progress-card'

const mockPages = [
  { fileName: 'index.tsx', route: '/', componentName: 'Homepage', status: 'complete' as const, lineCount: 142, code: '// code' },
  { fileName: 'menu/index.tsx', route: '/menu/', componentName: 'MenuPage', status: 'generating' as const },
  { fileName: 'contact.tsx', route: '/contact/', componentName: 'ContactPage', status: 'pending' as const },
]

describe('PageProgressCard', () => {
  it('renders progress fraction', () => {
    render(<PageProgressCard pages={mockPages} />)
    expect(screen.getByText(/1\/3/)).toBeDefined()
  })

  it('renders each file name', () => {
    render(<PageProgressCard pages={mockPages} />)
    expect(screen.getByText('index.tsx')).toBeDefined()
    expect(screen.getByText('menu/index.tsx')).toBeDefined()
    expect(screen.getByText('contact.tsx')).toBeDefined()
  })

  it('shows line count for complete files', () => {
    render(<PageProgressCard pages={mockPages} />)
    expect(screen.getByText(/142/)).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/page-progress-card.test.tsx`
Expected: FAIL

**Step 3: Implement PageProgressCard**

Create `src/components/ai-elements/page-progress-card.tsx`:

- Progress bar at top: `{completed}/{total}` with percentage, using a `div` with `bg-primary` width calculated as percentage
- File list: each page as a row with status icon (CheckCircle2 green for complete, Loader2 spinning for generating, Circle muted for pending), fileName, route in muted text, lineCount if complete
- Clicking a completed file toggles a `Collapsible` containing a `CodeBlock` with the `code` prop (first 50 lines)
- Import `CodeBlock` from `@/components/ai-elements/code-block`, `Collapsible` from `@/components/ui/collapsible`

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/page-progress-card.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ai-elements/page-progress-card.tsx tests/page-progress-card.test.tsx
git commit -m "feat: PageProgressCard component — progress bar with CodeBlock previews"
```

---

## Task 9: Build ValidationCard Component

**Files:**
- Create: `src/components/ai-elements/validation-card.tsx`
- Test: `tests/validation-card.test.tsx`

**Step 1: Write failing test**

Create: `tests/validation-card.test.tsx`

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ValidationCard } from '@/components/ai-elements/validation-card'

const mockChecks = [
  { name: 'imports', status: 'passed' as const },
  { name: 'links', status: 'failed' as const, errors: [{ file: 'src/routes/blog/$slug.tsx', line: 42, message: 'Link "/authors/$id" has no matching route', type: 'broken_link' }] },
  { name: 'typescript', status: 'passed' as const },
  { name: 'build', status: 'running' as const },
]

describe('ValidationCard', () => {
  it('renders check names', () => {
    render(<ValidationCard checks={mockChecks} />)
    expect(screen.getByText('imports')).toBeDefined()
    expect(screen.getByText('links')).toBeDefined()
    expect(screen.getByText('typescript')).toBeDefined()
    expect(screen.getByText('build')).toBeDefined()
  })

  it('renders summary counts', () => {
    render(<ValidationCard checks={mockChecks} />)
    // 2 passed, 1 failed, 1 running
    expect(screen.getByText(/2 passed/)).toBeDefined()
    expect(screen.getByText(/1 failed/)).toBeDefined()
  })

  it('renders error details for failed checks', () => {
    render(<ValidationCard checks={mockChecks} />)
    expect(screen.getByText(/no matching route/)).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/validation-card.test.tsx`
Expected: FAIL

**Step 3: Implement ValidationCard**

Create `src/components/ai-elements/validation-card.tsx`:

- Import `TestResults`, `TestResultsHeader`, `TestResultsSummary`, `TestResultsDuration`, `TestResultsProgress`, `TestResultsContent`, `TestSuite`, `Test`, `TestError`, `TestErrorMessage` from `@/components/ai-elements/test-results`
- Compute `summary` from `checks`: count passed/failed/running
- Render `TestResults` with `summary` prop
- For each check: `TestSuite` with `name` and `status`
- For failed checks with errors: nested `Test` with `TestError` + `TestErrorMessage`

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/validation-card.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ai-elements/validation-card.tsx tests/validation-card.test.tsx
git commit -m "feat: ValidationCard component — TestResults with per-check error details"
```

---

## Task 10: Wire New Event Handling + Timeline Rendering in `builder-chat.tsx`

**Files:**
- Modify: `src/components/builder-chat.tsx:212-228,316-425,656,732-875`

**Step 1: Add new state variables** (after line 228)

```typescript
const [designTokens, setDesignTokens] = useState<DesignTokensEvent['tokens'] | null>(null)
const [architectureSpec, setArchitectureSpec] = useState<ArchitectureReadyEvent['spec'] | null>(null)
const [pageProgress, setPageProgress] = useState<PageProgressEntry[]>([])
const [fileAssembly, setFileAssembly] = useState<FileAssemblyEntry[]>([])
const [validationChecks, setValidationChecks] = useState<ValidationCheckEntry[]>([])
```

**Step 2: Add new cases to `handleGenerationEvent` switch** (lines 316-425)

Add after existing cases:

```typescript
case 'design_tokens':
  setDesignTokens(event.tokens)
  pushTimeline({ type: 'design_tokens', tokens: event.tokens, ts: now })
  break

case 'architecture_ready':
  setArchitectureSpec(event.spec)
  pushTimeline({ type: 'architecture', spec: event.spec, ts: now })
  break

case 'page_generating':
  setPageProgress(prev => {
    const updated = [...prev]
    const idx = updated.findIndex(p => p.fileName === event.fileName)
    if (idx === -1) updated.push({ fileName: event.fileName, route: event.route, componentName: event.componentName, status: 'generating' })
    else updated[idx] = { ...updated[idx], status: 'generating' }
    return updated
  })
  break

case 'page_complete':
  setPageProgress(prev => prev.map(p =>
    p.fileName === event.fileName
      ? { ...p, status: 'complete', lineCount: event.lineCount, code: event.code }
      : p
  ))
  break

case 'file_assembled':
  setFileAssembly(prev => [...prev, { path: event.path, category: event.category }])
  break

case 'validation_check':
  setValidationChecks(prev => {
    const updated = [...prev]
    const idx = updated.findIndex(c => c.name === event.name)
    if (idx === -1) updated.push({ name: event.name, status: event.status, errors: event.errors })
    else updated[idx] = { name: event.name, status: event.status, errors: event.errors }
    return updated
  })
  break
```

**Step 3: Update timeline rendering** (lines 732-875)

Add new cases to the `timelineEvents.map(...)` switch for:
- `'design_tokens'` → render `<ThemeTokensCard tokens={entry.tokens} />`
- `'architecture'` → render `<ArchitectureCard spec={entry.spec} />`
- `'page_progress'` → render `<PageProgressCard pages={pageProgress} />`
- `'file_assembly'` → render `<FileTree>` with files grouped by category
- `'validation'` → render `<ValidationCard checks={validationChecks} />`

For the `'agent'` case (lines 736-769): update the codegen-specific file tree logic to also handle `frontend` and `backend` agent IDs. When `agentId === 'frontend'`, render `<PageProgressCard>` inside `TaskContent`. When `agentId === 'backend'`, render the categorized file tree.

**Step 4: Import new components** (top of file)

```typescript
import { ThemeTokensCard } from '@/components/ai-elements/theme-tokens-card'
import { ArchitectureCard } from '@/components/ai-elements/architecture-card'
import { PageProgressCard } from '@/components/ai-elements/page-progress-card'
import { ValidationCard } from '@/components/ai-elements/validation-card'
```

**Step 5: Typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: 0 errors

**Step 6: Commit**

```bash
git add src/components/builder-chat.tsx
git commit -m "feat: wire Pipeline B events into chat timeline — 6 agent cards with rich AI Elements"
```

---

## Task 11: Update Mock Pipeline for Development Testing

**Files:**
- Modify: `server/lib/agents/machine.ts` (mock machine section, lines 865-1255)

**Step 1: Add mock data generators**

Create mock `ThemeTokens`, mock `CreativeSpec` with 4-page sitemap, mock `GeneratedPage[]` with dummy `.tsx` content. Use these in the mock actors for `runDesignActor`, `runArchitectActor`, `runPageGenerationActor`, `runAssemblyActor`.

**Step 2: Wire mock actors to emit new events**

The mock actors should return the same shape as the real ones. The `streamActorStates` function will emit `agent_start`/`agent_complete` automatically based on `STATE_PHASES`.

For per-page and per-file events: the mock `runPageGenerationActor` should call the progress callbacks with staggered delays (200ms per page). The mock `runAssemblyActor` should emit `file_assembled` events.

For `validation_check` events: the mock `runValidationActor` should call `onCheckStart`/`onCheckComplete` with all checks passing.

**Step 3: Test with mock mode**

Run: `MOCK_PIPELINE=true bun run dev`
Navigate to a project, submit a prompt. Verify:
- All 6 agent cards appear in sequence
- ThemeTokensCard shows color swatches
- ArchitectureCard shows route map
- PageProgressCard shows progress bar updating
- ValidationCard shows all checks passing
- Completion banner appears

**Step 4: Commit**

```bash
git add server/lib/agents/machine.ts
git commit -m "feat: update mock pipeline with Pipeline B events for development testing"
```

---

## Task 12: Remove Pipeline A Code

**Files:**
- Modify: `server/lib/agents/orchestrator.ts:181-190` — change `runBlueprint()` to error ("Pipeline A removed")
- Modify: `server/lib/app-blueprint.ts:658-665` — remove `contractToBlueprintWithDesignAgent()`

**Step 1: Remove `contractToBlueprintWithDesignAgent()`**

In `app-blueprint.ts`, remove the function at lines 658-665. Keep `contractToBlueprintCreative()` (lines 667-840) — it remains as the reference implementation but is no longer called by the machine directly (the machine now calls the split actors).

**Step 2: Update `runBlueprint()` in orchestrator**

Change `runBlueprint()` (lines 181-190) to throw an error directing callers to the new actors:

```typescript
export async function runBlueprint(): Promise<never> {
  throw new Error('Pipeline A removed. Use runDesign() + runArchitect() + runPageGeneration() + runAssembly() instead.')
}
```

**Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors (nothing should be calling the removed function since the machine now uses the new actors)

**Step 4: Lint**

Run: `bun run lint`
Expected: 0 errors

**Step 5: Run full test suite**

Run: `bun run test`
Expected: All tests pass. If any tests called `contractToBlueprintWithDesignAgent()` or `runBlueprint()` directly, update them to use the new functions.

**Step 6: Commit**

```bash
git add server/lib/agents/orchestrator.ts server/lib/app-blueprint.ts
git commit -m "refactor: remove Pipeline A code — contractToBlueprintWithDesignAgent, runBlueprint"
```

---

## Task 13: Final Verification

**Step 1: Full typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 2: Full lint**

Run: `bun run lint`
Expected: 0 errors

**Step 3: Full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 4: Mock mode E2E**

Run: `MOCK_PIPELINE=true bun run dev`
Submit a prompt. Verify all 6 agent cards render with correct content:
1. Analyst → Plan card with PRD
2. Design Agent → ThemeTokensCard with swatches + fonts
3. Architect Agent → ArchitectureCard with route map
4. Frontend Engineer → PageProgressCard with progress bar
5. Backend Engineer → FileTree with categories
6. QA → ValidationCard with TestResults

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: final verification fixes for Pipeline B integration"
```
