# Pipeline B Chat Integration — Design Document

**Date**: 2026-02-21
**Status**: Approved
**Goal**: Wire Pipeline B (LLM full-page generation with closed vocabulary) into the XState machine and render each agent's output as rich Vercel AI Elements in the chat timeline.

## Summary

Replace Pipeline A (section-composition) with Pipeline B (creative director + parallel LLM page generation) as the sole generation path. Each agent in the pipeline gets a named identity and a dedicated UI card in the chat timeline using Vercel AI Elements components.

## Agent Naming

| Old Name | New Name | Agent ID | Purpose |
|----------|----------|----------|---------|
| analystAgent | **Analyst** | `analyst` | Parse user prompt → SchemaContract + PRD |
| designAgent | **Design Agent** | `designer` | Choose theme → ThemeTokens (colors, fonts, style) |
| creativeDirector | **Architect Agent** | `architect` | Produce CreativeSpec (sitemap + visual DNA + section briefs) |
| generatePages() | **Frontend Engineer** | `frontend` | LLM generates each page's .tsx in parallel |
| assembleApp() + file upload | **Backend Engineer** | `backend` | Deterministic assembly + sandbox upload + migration + seed |
| validateGeneratedApp() + tsc + build | **Quality Assurance** | `qa` | Import validation, link integrity, a11y, tsc, build |
| repairAgent | **Repair Agent** | `repair` | Fix validation failures (LLM) |
| reviewAgent | **Code Reviewer** | `reviewer` | 15 deterministic checks + optional LLM review |
| deployment | **Deployer** | `deployer` | Build + deploy to Vercel |
| infrastructure | **Provisioner** | `provisioner` | Supabase + Daytona + GitHub (parallel with analysis) |

## Revised XState Machine

### State Topology

```
idle
  └─ START → preparing (parallel)

preparing (type: 'parallel') [analysis timeout: 3min, infra timeout: 5min]
  ├─ analysis (sub-machine)
  │    ├─ running → invokes runAnalysisActor (analystAgent)
  │    │    ├─ onDone (type='clarification') → awaitingClarification
  │    │    └─ onDone (type='done')          → done (final)
  │    └─ awaitingClarification
  │         └─ USER_ANSWERED → running
  └─ infrastructure (sub-machine)
       └─ provisioning → invokes runProvisioningActor
            └─ onDone → done (final)

  onDone (both branches final) → designing

designing [NEW] [timeout: 60s]
  └─ invokes runDesignActor
       → runDesignAgent(userPrompt, contract, appName, appDescription)
       → returns: { tokens: ThemeTokens, selectedTheme, themeReasoning }
       → emits: design_tokens event
       └─ onDone → architecting
       └─ onError → failed (design is essential)

architecting [NEW] [timeout: 120s]
  └─ invokes runArchitectActor
       → runCreativeDirector(input) with static override for zero-table contracts
       → returns: CreativeSpec { archetype, sitemap, visualDna, auth }
       → emits: architecture_ready event
       └─ onDone → pageGeneration
       └─ onError → failed (architecture is essential)

pageGeneration [RENAMED from generating] [timeout: 300s]
  └─ invokes runPageGenerationActor
       → generatePages({ spec, contract?, imagePool })
       → parallel Promise.all() — one generateText() per page
       → emits per page: page_generating, page_complete
       └─ onDone → assembly
       └─ onError → cleanup

assembly [NEW] [timeout: 120s]
  └─ invokes runAssemblyActor
       → assembleApp({ spec, generatedPages, appName, includeUiKit: true })
       → upload files to Daytona sandbox
       → bun install --frozen-lockfile
       → run SQL migration on Supabase
       → contractToSeedSQL() + apply seed
       → emits per file: file_assembled
       └─ onDone → validating
       └─ onError → cleanup

validating [timeout: 180s]
  └─ invokes runValidationActor
       → validateGeneratedApp({ files, validRoutes, hasSupabase })
       → sandbox: bunx tsc --noEmit
       → sandbox: bunx oxlint src/
       → sandbox: bun run build
       → validateVercelBuild()
       → emits per check: validation_check
       └─ onDone (allPassed=true) → reviewing
       └─ onDone (retryCount<2 AND errors changed) → repairing
       └─ onDone (retryCount>=2 OR errors unchanged) → cleanup

repairing [timeout: 300s]
  └─ invokes runRepairActor (unchanged — boundRepairAgent with sandbox tools)
       └─ onDone → validating (loop)
       └─ onError → cleanup

reviewing [timeout: 180s]
  └─ invokes runCodeReviewActor (unchanged — deterministic + optional LLM)
       └─ onDone (passed=true) → deploying
       └─ onDone (passed=false) → cleanup
       └─ onError → deploying (non-fatal, reviewSkipped=true)

deploying [timeout: 600s]
  └─ invokes runDeploymentActor (unchanged)
       └─ onDone → complete (final)
       └─ onError → cleanup

cleanup [timeout: 120s]
  └─ invokes runCleanupActor
       └─ always → failed (final)

complete (type: 'final')
failed (type: 'final')
```

### States Removed

- `polishing` — Pipeline B doesn't use the polish agent. The LLM generates complete themed pages directly.
- `generating` (old) — Split into `pageGeneration` + `assembly`.

### States Added

- `designing` — Design Agent produces ThemeTokens.
- `architecting` — Architect Agent produces CreativeSpec.
- `assembly` — Backend Engineer assembles files + uploads to sandbox.

### States Split

- `blueprinting` → `designing` + `architecting` (two distinct agents with separate UI cards)
- `generating` → `pageGeneration` + `assembly` (LLM page gen vs deterministic file assembly)

### Context Changes

```typescript
interface MachineContext {
  // Existing (keep all)
  userMessage: string
  projectId: string
  userId: string
  appName: string
  appDescription: string
  contract: SchemaContract
  sandboxId: string
  supabaseProjectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  githubCloneUrl: string
  githubHtmlUrl: string
  repoName: string
  validation: ValidationGateResult | null
  retryCount: number
  reviewResult: ReviewResult | null
  deploymentUrl: string
  totalTokens: number
  error: string

  // NEW for Pipeline B
  tokens: ThemeTokens | null              // from designing
  creativeSpec: CreativeSpec | null        // from architecting
  generatedPages: GeneratedPage[] | null  // from pageGeneration
  assembledFiles: BlueprintFile[] | null   // from assembly
  blueprint: AppBlueprint | null          // assembled blueprint (for persisting)
  prd: string | null                      // analyst's PRD markdown
  imagePool: string[]                     // Unsplash URLs for page gen
}
```

## New SSE Event Types

### `design_tokens`

Emitted when `designing` state completes.

```typescript
type DesignTokensEvent = {
  type: 'design_tokens'
  tokens: {
    name: string
    colors: {
      background: string
      foreground: string
      primary: string
      primaryForeground: string
      secondary: string
      accent: string
      muted: string
      border: string
    }
    fonts: { display: string; body: string; googleFontsUrl: string }
    style: {
      borderRadius: string
      cardStyle: 'flat' | 'bordered' | 'elevated' | 'glass'
      navStyle: 'top-bar' | 'sidebar' | 'editorial' | 'minimal' | 'centered'
      heroLayout: 'fullbleed' | 'split' | 'centered' | 'editorial' | 'none'
      spacing: 'compact' | 'normal' | 'airy'
      motion: 'none' | 'subtle' | 'expressive'
      imagery: 'photography-heavy' | 'illustration' | 'minimal' | 'icon-focused'
    }
    authPosture: 'public' | 'private' | 'hybrid'
    textSlots: {
      hero_headline: string
      hero_subtext: string
      about_paragraph: string
      cta_label: string
      empty_state: string
      footer_tagline: string
    }
  }
}
```

### `architecture_ready`

Emitted when `architecting` state completes.

```typescript
type ArchitectureReadyEvent = {
  type: 'architecture_ready'
  spec: {
    archetype: string
    sitemap: Array<{
      route: string
      componentName: string
      purpose: string
      sections: string[]
      dataRequirements: string
      entities?: string[]
    }>
    auth: { required: boolean }
  }
}
```

### `page_generating` / `page_complete`

Emitted during `pageGeneration` state, per page.

```typescript
type PageGeneratingEvent = {
  type: 'page_generating'
  fileName: string
  route: string
  componentName: string
  pageIndex: number
  totalPages: number
}

type PageCompleteEvent = {
  type: 'page_complete'
  fileName: string
  route: string
  componentName: string
  lineCount: number
  code: string  // first 50 lines for CodeBlock preview
  pageIndex: number
  totalPages: number
}
```

### `file_assembled`

Emitted during `assembly` state, per file.

```typescript
type FileAssembledEvent = {
  type: 'file_assembled'
  path: string
  category: 'config' | 'ui-kit' | 'route' | 'migration' | 'style' | 'wiring'
}
```

### `validation_check`

Emitted during `validating` state, per check.

```typescript
type ValidationCheckEvent = {
  type: 'validation_check'
  name: 'imports' | 'links' | 'accessibility' | 'hardcoded_colors' | 'typescript' | 'lint' | 'build'
  status: 'passed' | 'failed' | 'running'
  errors?: Array<{
    file: string
    line?: number
    message: string
    type: string
  }>
}
```

### Enriched `plan_ready`

```typescript
type PlanReadyEvent = {
  type: 'plan_ready'
  plan: {
    appName: string
    appDescription: string
    tables: string[]
    prd: string  // NEW — full PRD markdown
  }
}
```

## Client UI Components

### Timeline Entry Types

```typescript
type TimelineEntry =
  | { type: 'agent'; agent: AgentStartEvent; status: 'running' | 'complete'; durationMs?: number; ts: number }
  | { type: 'plan'; plan: PlanReadyEvent['plan']; ts: number }
  | { type: 'design_tokens'; tokens: DesignTokensEvent['tokens']; ts: number }
  | { type: 'architecture'; spec: ArchitectureReadyEvent['spec']; ts: number }
  | { type: 'page_progress'; pages: PageProgressState; ts: number }
  | { type: 'file_assembly'; files: FileAssemblyState; ts: number }
  | { type: 'validation'; checks: ValidationCheckState[]; ts: number }
  | { type: 'error'; message: string; ts: number }
  | { type: 'complete'; deploymentUrl?: string; ts: number }
```

### Component 1: Analyst → Plan Card

**AI Element**: `Plan` (existing)

Renders inside the analyst's `agent_complete` card. Shows:
- `PlanTitle`: app name
- `PlanDescription`: app description
- `PlanContent`: PRD markdown (rendered via `MessageResponse` / streamdown) + table list as badges

### Component 2: Design Agent → ThemeTokens Card

**Custom component**: `ThemeTokensCard`

New file: `src/components/ai-elements/theme-tokens-card.tsx`

Props:
```typescript
interface ThemeTokensCardProps {
  tokens: DesignTokensEvent['tokens']
}
```

Renders:
- Theme name as title
- **Color swatches row**: 8 colored squares with labels, using `style={{ backgroundColor: token.colors.primary }}`. Each swatch is a 32x32 rounded square.
- **Font preview**: Display font name rendered in that font (via dynamic `@import url(googleFontsUrl)` in a `<style>` tag). Body font similarly.
- **Style chips**: 6 chips for cardStyle, navStyle, heroLayout, spacing, motion, imagery. Each chip is a `Badge` variant with the value.

### Component 3: Architect Agent → Architecture Card

**Custom component**: `ArchitectureCard`

New file: `src/components/ai-elements/architecture-card.tsx`

Props:
```typescript
interface ArchitectureCardProps {
  spec: ArchitectureReadyEvent['spec']
}
```

Renders:
- Archetype badge at top
- Page count
- Route map: each route as a row with `route` (monospace), `componentName`, and collapsible `sections[]` list
- Uses `Collapsible` from shadcn for each route

### Component 4: Frontend Engineer → Page Progress Card

**AI Element**: `Task` (existing) + custom progress bar

New file: `src/components/ai-elements/page-progress-card.tsx`

Props:
```typescript
interface PageProgressCardProps {
  pages: Array<{
    fileName: string
    route: string
    componentName: string
    status: 'pending' | 'generating' | 'complete' | 'error'
    lineCount?: number
    code?: string
  }>
}
```

Renders:
- Progress bar: `completed / total` with percentage
- File list: each page as a row with status icon (✓, spinning, ○), filename, route, line count
- Clicking a completed file expands a `CodeBlock` with the generated `.tsx` content (first 50 lines)

### Component 5: Backend Engineer → File Assembly Card

**AI Element**: `FileTree` (existing) with category grouping

Renders:
- Files grouped by `category` (config, ui-kit, route, migration, style, wiring)
- Each group is a collapsible folder node
- Each file shows a checkmark as it's assembled
- ui-kit group is collapsed by default (25 files)

### Component 6: QA Agent → Test Results Card

**AI Element**: `TestResults` (existing)

Maps `validation_check` events directly to `TestSuite` + `Test` components:

```typescript
<TestResults summary={{ passed, failed, skipped: 0, total, duration }}>
  <TestResultsHeader>
    <TestResultsSummary />
    <TestResultsDuration />
  </TestResultsHeader>
  <TestResultsProgress />
  <TestResultsContent>
    {checks.map(check => (
      <TestSuite name={check.name} status={check.status} defaultOpen={check.status === 'failed'}>
        {check.errors?.map(err => (
          <Test name={`${err.file}:${err.line}`} status="failed">
            <TestError>
              <TestErrorMessage>{err.message}</TestErrorMessage>
            </TestError>
          </Test>
        ))}
      </TestSuite>
    ))}
  </TestResultsContent>
</TestResults>
```

## Server-Side Changes

### 1. `server/lib/agents/machine.ts`

- Add states: `designing`, `architecting`, `pageGeneration`, `assembly`
- Remove state: `polishing`
- Rename: `generating` → split into `pageGeneration` + `assembly`
- Add context fields: `tokens`, `creativeSpec`, `generatedPages`, `assembledFiles`, `prd`, `imagePool`
- Wire new actors for each state

### 2. `server/lib/agents/orchestrator.ts`

New actor functions:

- `runDesignActor(context)` — calls `runDesignAgent()`, returns `{ tokens, selectedTheme, themeReasoning }`
- `runArchitectActor(context)` — calls `runCreativeDirector()`, returns `CreativeSpec`
- `runPageGenerationActor(context)` — calls `generatePages()` with emit callback for per-page SSE, returns `GeneratedPage[]`
- `runAssemblyActor(context)` — calls `assembleApp()`, uploads to sandbox, runs migration/seed, returns `BlueprintFile[]`
- Replace `runValidationActor` — calls `validateGeneratedApp()` + sandbox tsc/lint/build, emits `validation_check` per step

### 3. `server/routes/agent.ts`

- Update `STATE_PHASES` with new agent IDs and names
- Add SSE emission for new event types in `streamActorStates()`
- Emit `design_tokens` when `designing` completes
- Emit `architecture_ready` when `architecting` completes
- Emit `page_generating` / `page_complete` during `pageGeneration` (requires callback injection into `generatePages`)
- Emit `file_assembled` during `assembly`
- Emit `validation_check` during `validating`

### 4. `server/lib/page-generator.ts`

Add an `onPageProgress` callback parameter to `generatePages()` so the actor can emit SSE events per page:

```typescript
interface PageGeneratorInput {
  spec: CreativeSpec
  contract?: SchemaContract
  imagePool?: string[]
  onPageStart?: (fileName: string, route: string, componentName: string, index: number, total: number) => void
  onPageComplete?: (fileName: string, route: string, componentName: string, lineCount: number, code: string, index: number, total: number) => void
}
```

### 5. `server/lib/page-validator.ts`

Add an `onCheckProgress` callback to `validateGeneratedApp()`:

```typescript
interface ValidatorInput {
  files: Map<string, string>
  validRoutes: string[]
  hasSupabase: boolean
  onCheckStart?: (name: string) => void
  onCheckComplete?: (name: string, status: 'passed' | 'failed', errors?: ValidationError[]) => void
}
```

## Client-Side Changes

### 1. `src/lib/types.ts`

- Add new event types to `StreamEvent` discriminated union
- Add new `TimelineEntry` variants
- Add `PageProgressState`, `FileAssemblyState`, `ValidationCheckState` types

### 2. `src/components/builder-chat.tsx`

- Update `handleGenerationEvent` switch to handle new event types
- Add state: `designTokens`, `architectureSpec`, `pageProgress`, `fileAssembly`, `validationChecks`
- Update timeline rendering to use new card components
- Remove `polishing` handling

### 3. New Components

| File | Component | AI Element Base |
|------|-----------|----------------|
| `src/components/ai-elements/theme-tokens-card.tsx` | `ThemeTokensCard` | Custom (no AI Element) |
| `src/components/ai-elements/architecture-card.tsx` | `ArchitectureCard` | Custom (Collapsible) |
| `src/components/ai-elements/page-progress-card.tsx` | `PageProgressCard` | Task + custom progress |
| `src/components/ai-elements/validation-card.tsx` | `ValidationCard` | TestResults |

### 4. AI Elements to Install

```bash
bun x ai-elements@latest add test-results
bun x ai-elements@latest add code-block
bun x ai-elements@latest add chain-of-thought
bun x ai-elements@latest add terminal
```

Note: `task`, `plan`, `file-tree`, `message`, `conversation` are already installed in the project.

### 5. Mock Pipeline Update

Update `mockAppGenerationMachine` to emit the new event types with realistic mock data for development/testing without external services.

## File Changes Summary

### New Files
- `src/components/ai-elements/theme-tokens-card.tsx`
- `src/components/ai-elements/architecture-card.tsx`
- `src/components/ai-elements/page-progress-card.tsx`
- `src/components/ai-elements/validation-card.tsx`

### Modified Files (Server)
- `server/lib/agents/machine.ts` — revised state topology
- `server/lib/agents/orchestrator.ts` — new actor functions
- `server/routes/agent.ts` — new SSE events + STATE_PHASES
- `server/lib/page-generator.ts` — add progress callbacks
- `server/lib/page-validator.ts` — add progress callbacks
- `server/lib/app-blueprint.ts` — remove Pipeline A path, keep only Pipeline B

### Modified Files (Client)
- `src/lib/types.ts` — new event types + timeline entries
- `src/components/builder-chat.tsx` — new event handling + timeline rendering

### Removed Code
- `polishing` state and `runPolishActor` from machine
- `composeSectionsV2()` call path in `themed-code-engine.ts` (Pipeline A)
- `contractToBlueprintWithDesignAgent()` (replaced by creative pipeline)

## Cost Estimate

Pipeline B per app (static):

| Agent | Model | Tokens (in/out) | Cost |
|-------|-------|-----------------|------|
| Analyst | gpt-5.2 | ~10K/3K | ~$0.05 |
| Design Agent | gpt-5.2 | ~8K/2K | ~$0.04 |
| Architect Agent | gpt-5.2 | ~15K/4K | ~$0.09 |
| Frontend Engineer (8 pages) | gpt-5.2-codex | ~8K/3K per page | ~$0.25-0.40 |
| Backend Engineer | deterministic | 0 | $0.00 |
| QA | deterministic | 0 | $0.00 |
| Deployer | deterministic | 0 | $0.00 |
| **Total** | | | **~$0.43-0.58** |

## Success Criteria

1. Pipeline B is the sole generation path — Pipeline A code removed
2. All 6 agent cards render correctly in the chat timeline
3. ThemeTokens card shows actual color swatches and font previews
4. Architecture card shows full route map with collapsible sections
5. Frontend Engineer card shows real-time progress bar as pages generate
6. QA card renders validation results using TestResults component
7. Mock pipeline emits all new event types for development testing
8. E2E: 8-page static app generates with 0 errors, deploys successfully
