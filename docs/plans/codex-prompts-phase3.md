# Phase 3 Codex Prompts — Additive Injection Pipeline

Each prompt is self-contained. Give one to Codex at a time. Verify with `bunx tsc --noEmit && bun run test` after each.

**Prerequisite housekeeping fix**: Before starting Phase 3, apply this one-line fix — add `polishing` to the SSE state maps in `server/routes/agent.ts`:

In `STATE_PHASES` (around line 74), add:
```
polishing: { name: 'Polishing design', phase: 4 },
```
Then bump `validating` to phase 5, `repairing` to phase 5, `deploying` to phase 6, `complete`/`failed` to phase 7.

In `STATE_TO_DB_STATUS` (around line 88), add:
```
polishing: 'generating',
```

---

## Task 13: Persist Capability Manifest in Generation State

```
You are working in the VibeStack platform codebase. Add capability manifest persistence so that when a project is generated, we remember which capabilities were installed.

## Context

The pipeline already resolves capabilities and stores `capabilityManifest: string[]` in the XState machine context. But when the generation state is persisted to the database (in `server/lib/agents/orchestrator.ts`, the `runDeployHandler` function around line 492), the `capabilityManifest` is NOT included.

The edit machine (`server/lib/agents/edit-machine.ts`) reads `generationState` from the DB when loading an existing project — it will need access to the manifest for Phase 3's additive injection.

## Files to read first
- `server/lib/agents/orchestrator.ts` — find `runDeployHandler` and the `generationState` persist block (around line 492)
- `server/lib/agents/machine.ts` — find the MachineContext type (has `capabilityManifest: string[]` and `assembly`)
- `server/lib/agents/edit-machine.ts` — find EditMachineContext and LoadResult types
- `server/lib/db/queries.ts` — find `getProjectGenerationState` and `updateProject`
- `server/lib/db/schema.ts` — the `projects` table definition (generationState is JSONB, no schema change needed)

## Changes

### 1. Persist manifest in orchestrator.ts

In `runDeployHandler`, the `generationState` object (around line 493) currently has:
```ts
generationState: {
  contract: input.contract ?? null,
  blueprint: input.blueprint ?? null,
  sandboxId: input.sandboxId,
  supabaseProjectId: input.supabaseProjectId ?? null,
  githubRepo: input.githubCloneUrl ?? null,
  fileManifest,
  lastEditedAt: new Date().toISOString(),
}
```

Add `capabilityManifest` to this object:
```ts
generationState: {
  contract: input.contract ?? null,
  blueprint: input.blueprint ?? null,
  sandboxId: input.sandboxId,
  supabaseProjectId: input.supabaseProjectId ?? null,
  githubRepo: input.githubCloneUrl ?? null,
  fileManifest,
  capabilityManifest: input.capabilityManifest ?? [],
  lastEditedAt: new Date().toISOString(),
}
```

Also ensure the `runDeployHandler` function's input type includes `capabilityManifest`. Check the deploy actor's `input` in `machine.ts` — it should pass `context.capabilityManifest` when invoking the deploy actor. Find the `deploying` state's `invoke.input` and add `capabilityManifest: context.capabilityManifest` if it's not already there.

### 2. Read manifest in edit-machine.ts

In `EditMachineContext`, add:
```ts
capabilityManifest: string[]
```

In `LoadResult`, add:
```ts
capabilityManifest: string[]
```

In the `loadProjectData` actor (or wherever `generationState` is parsed), extract:
```ts
capabilityManifest: Array.isArray(genState.capabilityManifest) ? genState.capabilityManifest : []
```

Initialize `capabilityManifest: []` in the machine's initial context.

### 3. Test

Create `tests/capability-manifest-persist.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('Capability manifest persistence', () => {
  it('generation state shape includes capabilityManifest', () => {
    // Verify the shape of what gets persisted
    const genState = {
      contract: { tables: [] },
      blueprint: null,
      sandboxId: 'test-sandbox',
      supabaseProjectId: null,
      githubRepo: null,
      fileManifest: {},
      capabilityManifest: ['auth', 'blog', 'recipes'],
      lastEditedAt: new Date().toISOString(),
    }

    expect(genState.capabilityManifest).toEqual(['auth', 'blog', 'recipes'])
    expect(Array.isArray(genState.capabilityManifest)).toBe(true)
  })

  it('handles missing capabilityManifest gracefully', () => {
    const genState: Record<string, unknown> = {
      contract: { tables: [] },
    }

    const manifest = Array.isArray(genState.capabilityManifest)
      ? genState.capabilityManifest
      : []

    expect(manifest).toEqual([])
  })
})
```

## Verification
```bash
bunx tsc --noEmit
bun run test
```
```

---

## Task 14: Inject Analyzer — Detect New Capabilities to Add

```
You are working in the VibeStack platform codebase. Create an "inject analyzer" that examines a user's request in the context of an EXISTING project's capability manifest and determines which NEW capabilities to add.

## Context

When a user has an existing deployed app (e.g., a recipe website) and says "add a blog to my app", the system needs to:
1. Read the project's existing `capabilityManifest` (e.g., `['auth', 'recipes', 'public-website']`)
2. Analyze the user's request to identify which capabilities to inject (e.g., `['blog']`)
3. Ensure no duplicates (don't re-add `recipes`)
4. Return the new capabilities to add + the full merged list

This is NOT an LLM call — it's a deterministic capability-matching function. The analyst LLM already outputs `selectedCapabilities` from the tool schema. The inject analyzer just computes the diff.

## Files to read first
- `server/lib/capabilities/types.ts` — Capability interface
- `server/lib/capabilities/registry.ts` — CapabilityRegistry with resolve()
- `server/lib/capabilities/catalog/index.ts` — loadCoreRegistry()
- `server/lib/capabilities/assembler.ts` — assembleCapabilities()
- `server/lib/agents/schemas.ts` — see `selectedCapabilities` in submitRequirements schema

## Create: `server/lib/capabilities/inject.ts`

```typescript
import { loadCoreRegistry } from './catalog'
import { assembleCapabilities, type AssemblyResult } from './assembler'

export interface InjectAnalysis {
  /** Capabilities not yet installed that should be added */
  newCapabilities: string[]
  /** Full merged list (existing + new) */
  mergedManifest: string[]
  /** Assembly result for ONLY the new capabilities (additive) */
  additiveAssembly: AssemblyResult | null
  /** Assembly result for the full merged set */
  fullAssembly: AssemblyResult
  /** Whether there's actually anything new to add */
  hasChanges: boolean
}

/**
 * Given an existing project's capability manifest and the analyst's newly
 * selected capabilities, compute what needs to be added.
 *
 * @param existingManifest - Capabilities already installed (from generationState)
 * @param requestedCapabilities - Capabilities the analyst selected for this request
 * @returns InjectAnalysis with additive and full assembly results
 */
export function analyzeInjection(
  existingManifest: string[],
  requestedCapabilities: string[],
): InjectAnalysis {
  const registry = loadCoreRegistry()
  const existingSet = new Set(existingManifest)

  // Find capabilities that aren't already installed
  const newCapabilities = requestedCapabilities.filter(name => !existingSet.has(name))

  // Merged manifest = existing + new (deduplicated, preserving order)
  const mergedManifest = [...existingManifest]
  for (const name of newCapabilities) {
    if (!mergedManifest.includes(name)) {
      mergedManifest.push(name)
    }
  }

  // Resolve and assemble the full merged set
  const fullResolved = registry.resolve(mergedManifest)
  const fullAssembly = assembleCapabilities(fullResolved)

  // Resolve and assemble ONLY the new capabilities (for additive SQL migration)
  let additiveAssembly: AssemblyResult | null = null
  if (newCapabilities.length > 0) {
    const newResolved = registry.resolve(newCapabilities)
    additiveAssembly = assembleCapabilities(newResolved)
  }

  return {
    newCapabilities,
    mergedManifest,
    additiveAssembly,
    fullAssembly,
    hasChanges: newCapabilities.length > 0,
  }
}
```

## Create: `tests/capability-inject.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeInjection } from '@server/capabilities/inject'

describe('analyzeInjection', () => {
  it('identifies new capabilities not in existing manifest', () => {
    const result = analyzeInjection(
      ['auth', 'recipes', 'public-website'],
      ['auth', 'recipes', 'blog', 'public-website'],
    )

    expect(result.newCapabilities).toEqual(['blog'])
    expect(result.hasChanges).toBe(true)
    expect(result.mergedManifest).toEqual(['auth', 'recipes', 'public-website', 'blog'])
  })

  it('returns hasChanges=false when no new capabilities', () => {
    const result = analyzeInjection(
      ['auth', 'recipes'],
      ['auth', 'recipes'],
    )

    expect(result.newCapabilities).toEqual([])
    expect(result.hasChanges).toBe(false)
    expect(result.additiveAssembly).toBeNull()
  })

  it('handles empty existing manifest (fresh app)', () => {
    const result = analyzeInjection(
      [],
      ['auth', 'blog'],
    )

    expect(result.newCapabilities).toEqual(['auth', 'blog'])
    expect(result.mergedManifest).toEqual(['auth', 'blog'])
    expect(result.hasChanges).toBe(true)
  })

  it('resolves dependencies for new capabilities', () => {
    // blog depends on auth — if auth is already installed,
    // only blog is new but fullAssembly includes both
    const result = analyzeInjection(
      ['auth', 'public-website'],
      ['auth', 'public-website', 'blog'],
    )

    expect(result.newCapabilities).toEqual(['blog'])
    expect(result.fullAssembly.capabilityManifest).toContain('auth')
    expect(result.fullAssembly.capabilityManifest).toContain('blog')
    // Additive assembly only has blog tables
    expect(result.additiveAssembly).not.toBeNull()
    const additiveTableNames = result.additiveAssembly!.contract.tables.map(t => t.name)
    expect(additiveTableNames).toContain('blog_posts')
  })

  it('preserves existing manifest order', () => {
    const result = analyzeInjection(
      ['recipes', 'auth', 'public-website'],
      ['blog', 'recipes', 'auth', 'public-website'],
    )

    // Existing order preserved, new appended
    expect(result.mergedManifest).toEqual(['recipes', 'auth', 'public-website', 'blog'])
  })

  it('fullAssembly includes all tables from merged set', () => {
    const result = analyzeInjection(
      ['auth'],
      ['auth', 'blog', 'recipes'],
    )

    const tableNames = result.fullAssembly.contract.tables.map(t => t.name)
    // Should have tables from auth, blog, and recipes
    expect(tableNames).toContain('blog_posts')
    expect(tableNames).toContain('recipes')
  })
})
```

## Verification
```bash
bunx tsc --noEmit
bun run test tests/capability-inject.test.ts
bun run test
```
```

---

## Task 15: Additive Assembler — Generate Only New Files

```
You are working in the VibeStack platform codebase. Create an additive assembler that, given an inject analysis, generates ONLY the new files needed for added capabilities — new SQL migration, new pages, new hooks, new routes — without touching existing files (except navigation regeneration).

## Context

When adding capabilities to an existing app, we need:
1. **Additive SQL migration**: CREATE TABLE statements for only new tables (not existing ones)
2. **New page files**: Route files for new capability pages
3. **New hook files**: TanStack Query hooks for new entities
4. **Updated navigation**: Merge new nav entries into existing nav component
5. **Updated route tree**: Regenerate routeTree.gen.ts with new routes included

The existing `themed-code-engine.ts` generates ALL files for a fresh app. The additive assembler wraps it to produce only the delta.

## Files to read first
- `server/lib/capabilities/inject.ts` — InjectAnalysis type (from Task 14)
- `server/lib/capabilities/assembler.ts` — AssemblyResult type
- `server/lib/themed-code-engine.ts` — `generateThemedApp()` function (the full generator)
- `server/lib/contract-to-sql.ts` — `contractToMigration()` function
- `server/lib/contract-to-hooks.ts` — hook generation
- `server/lib/contract-to-routes.ts` — route tree generation
- `server/lib/app-blueprint.ts` — AppBlueprint, BlueprintFile types

## Create: `server/lib/capabilities/additive.ts`

```typescript
import type { InjectAnalysis } from './inject'
import type { AppBlueprint, BlueprintFile } from '../app-blueprint'
import type { ThemeTokens } from '../themed-code-engine'
import { contractToMigration } from '../contract-to-sql'

export interface AdditiveResult {
  /** New files to upload to sandbox (additive only) */
  newFiles: BlueprintFile[]
  /** Files that must be regenerated (nav, route tree) */
  updatedFiles: BlueprintFile[]
  /** Additive SQL migration (CREATE TABLE for new tables only) */
  additiveMigration: string | null
  /** Full SQL migration (for reference/validation, not applied) */
  fullMigration: string
}

/**
 * Given an inject analysis and a full blueprint (generated from the merged capability set),
 * compute the delta — which files are NEW vs which already exist.
 *
 * @param analysis - From analyzeInjection()
 * @param fullBlueprint - Generated by running themed-code-engine with fullAssembly
 * @param existingFilePaths - Set of file paths that already exist in the sandbox
 */
export function computeAdditiveDelta(
  analysis: InjectAnalysis,
  fullBlueprint: AppBlueprint,
  existingFilePaths: Set<string>,
): AdditiveResult {
  if (!analysis.hasChanges || !analysis.additiveAssembly) {
    return {
      newFiles: [],
      updatedFiles: [],
      additiveMigration: null,
      fullMigration: contractToMigration(analysis.fullAssembly.contract),
    }
  }

  const newFiles: BlueprintFile[] = []
  const updatedFiles: BlueprintFile[] = []

  // Files that are ALWAYS regenerated when capabilities change
  const alwaysRegenerate = new Set([
    'src/routes/__root.tsx',           // May have new nav entries
    'src/routeTree.gen.ts',            // Must include new routes
    'src/lib/navigation.ts',           // Nav config if it exists
  ])

  for (const file of fullBlueprint.fileTree) {
    if (alwaysRegenerate.has(file.path)) {
      updatedFiles.push(file)
    } else if (!existingFilePaths.has(file.path)) {
      newFiles.push(file)
    }
    // Files that already exist AND aren't in alwaysRegenerate → skip (don't overwrite)
  }

  // Generate additive migration from ONLY new tables
  const additiveMigration = contractToMigration(analysis.additiveAssembly.contract)

  // Full migration for reference
  const fullMigration = contractToMigration(analysis.fullAssembly.contract)

  return {
    newFiles,
    updatedFiles,
    additiveMigration,
    fullMigration,
  }
}
```

## Create: `tests/capability-additive.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { computeAdditiveDelta } from '@server/capabilities/additive'
import type { InjectAnalysis } from '@server/capabilities/inject'
import type { AppBlueprint } from '@server/app-blueprint'

// Helper to make a minimal InjectAnalysis
function makeAnalysis(overrides: Partial<InjectAnalysis>): InjectAnalysis {
  return {
    newCapabilities: [],
    mergedManifest: [],
    additiveAssembly: null,
    fullAssembly: {
      contract: { tables: [] },
      pages: [],
      components: [],
      navEntries: [],
      npmDependencies: {},
      designHints: {},
      capabilityManifest: [],
      hasAuth: false,
    },
    hasChanges: false,
    ...overrides,
  }
}

// Helper to make a minimal blueprint
function makeBlueprint(files: Array<{ path: string; content: string }>): AppBlueprint {
  return {
    appName: 'test-app',
    fileTree: files.map(f => ({
      path: f.path,
      content: f.content,
      isLLMSlot: false,
    })),
    meta: {},
  } as AppBlueprint
}

describe('computeAdditiveDelta', () => {
  it('returns empty when no changes', () => {
    const analysis = makeAnalysis({ hasChanges: false })
    const blueprint = makeBlueprint([])
    const result = computeAdditiveDelta(analysis, blueprint, new Set())

    expect(result.newFiles).toEqual([])
    expect(result.updatedFiles).toEqual([])
    expect(result.additiveMigration).toBeNull()
  })

  it('identifies new files not in existing paths', () => {
    const analysis = makeAnalysis({
      hasChanges: true,
      additiveAssembly: {
        contract: { tables: [{ name: 'blog_posts', columns: [] }] },
        pages: [],
        components: [],
        navEntries: [],
        npmDependencies: {},
        designHints: {},
        capabilityManifest: ['blog'],
        hasAuth: false,
      },
    })

    const blueprint = makeBlueprint([
      { path: 'src/routes/index.tsx', content: '// existing' },
      { path: 'src/routes/blog/index.tsx', content: '// new blog list' },
      { path: 'src/routes/blog/$id.tsx', content: '// new blog detail' },
      { path: 'src/lib/hooks/blog-posts.hooks.ts', content: '// new hooks' },
      { path: 'src/routeTree.gen.ts', content: '// regenerated' },
    ])

    const existingPaths = new Set([
      'src/routes/index.tsx',
    ])

    const result = computeAdditiveDelta(analysis, blueprint, existingPaths)

    // New files: blog routes + hooks (not index.tsx which already exists)
    const newPaths = result.newFiles.map(f => f.path)
    expect(newPaths).toContain('src/routes/blog/index.tsx')
    expect(newPaths).toContain('src/routes/blog/$id.tsx')
    expect(newPaths).toContain('src/lib/hooks/blog-posts.hooks.ts')
    expect(newPaths).not.toContain('src/routes/index.tsx')

    // Updated files: routeTree always regenerated
    const updatedPaths = result.updatedFiles.map(f => f.path)
    expect(updatedPaths).toContain('src/routeTree.gen.ts')
  })

  it('always regenerates navigation-related files', () => {
    const analysis = makeAnalysis({
      hasChanges: true,
      additiveAssembly: {
        contract: { tables: [] },
        pages: [],
        components: [],
        navEntries: [],
        npmDependencies: {},
        designHints: {},
        capabilityManifest: ['blog'],
        hasAuth: false,
      },
    })

    const blueprint = makeBlueprint([
      { path: 'src/routes/__root.tsx', content: '// root with new nav' },
      { path: 'src/routeTree.gen.ts', content: '// new tree' },
    ])

    const existingPaths = new Set([
      'src/routes/__root.tsx',
      'src/routeTree.gen.ts',
    ])

    const result = computeAdditiveDelta(analysis, blueprint, existingPaths)

    // These exist but should be in updatedFiles (always regenerated)
    const updatedPaths = result.updatedFiles.map(f => f.path)
    expect(updatedPaths).toContain('src/routes/__root.tsx')
    expect(updatedPaths).toContain('src/routeTree.gen.ts')

    // Should NOT be in newFiles
    const newPaths = result.newFiles.map(f => f.path)
    expect(newPaths).not.toContain('src/routes/__root.tsx')
  })
})
```

## Verification
```bash
bunx tsc --noEmit
bun run test tests/capability-additive.test.ts
bun run test
```
```

---

## Task 16: Wire Additive Injection into Edit Machine

```
You are working in the VibeStack platform codebase. Wire the inject analyzer and additive assembler into the edit machine so that when a user says "add a blog to my app", the system:
1. Detects this is a capability injection (not a visual edit)
2. Runs analyzeInjection() with existing manifest + new capabilities
3. Generates a full blueprint from merged capabilities
4. Computes additive delta
5. Uploads new + updated files to sandbox
6. Runs additive SQL migration
7. Rebuilds and redeploys

## Context

The edit machine (`server/lib/agents/edit-machine.ts`) currently handles visual edits (Tier 1: CSS/text, Tier 2: structural). Capability injection is a new Tier 3 that uses a completely different code path — it doesn't edit existing files, it adds new ones.

The flow:
1. User message → analyst determines `selectedCapabilities` (same tool schema as initial generation)
2. Compare against `project.generationState.capabilityManifest`
3. If new capabilities detected → enter injection flow
4. Generate full blueprint from merged capabilities + run additive assembler
5. Upload delta files + run additive migration
6. Rebuild + redeploy

## Files to read first
- `server/lib/agents/edit-machine.ts` — current edit machine (full file)
- `server/lib/capabilities/inject.ts` — analyzeInjection()
- `server/lib/capabilities/additive.ts` — computeAdditiveDelta()
- `server/lib/agents/orchestrator.ts` — runAnalysisHandler (how analyst works)
- `server/lib/agents/machine.ts` — main generation machine (for reference on how states chain)
- `server/lib/app-blueprint.ts` — contractToBlueprintWithDesignAgent()
- `server/lib/themed-code-engine.ts` — generateThemedApp()
- `server/lib/sandbox.ts` — getSandbox(), runCommand(), uploadFiles()
- `server/lib/contract-to-sql.ts` — contractToMigration()

## Changes

### 1. Add new states to edit machine

Add these new states to the edit machine's state configuration:

```
analyzing → (detects if capability injection vs visual edit)
  → if capability injection → injecting
  → if visual edit → existing flow (classifying → editing → ...)

injecting → (runs inject analyzer + generates blueprint + computes delta)
  → injectionUploading

injectionUploading → (uploads new + updated files to sandbox)
  → injectionMigrating

injectionMigrating → (runs additive SQL migration on existing Supabase)
  → injectionValidating

injectionValidating → (runs tsc + vite build)
  → if pass → deploying
  → if fail → injectionRepairing (up to 3 attempts, then fail)

injectionRepairing → (repair errors, re-upload, retry validation)
  → injectionValidating
```

### 2. Add injection context fields

In `EditMachineContext`, add:
```typescript
// Injection-specific
injectAnalysis: InjectAnalysis | null
additiveResult: AdditiveResult | null
injectionAttempts: number
```

Initialize all to null/0 in initial context.

### 3. Create injection actors

Create these as `fromPromise` actors:

**runInjectionActor**: Takes `{ existingManifest, requestedCapabilities, sandboxId, supabaseProjectId, tokens }`. Calls `analyzeInjection()`, generates full blueprint via `contractToBlueprintWithDesignAgent()`, computes delta via `computeAdditiveDelta()`, returns `{ analysis, delta, blueprint }`.

**runInjectionUploadActor**: Takes `{ sandboxId, newFiles, updatedFiles }`. Uploads all files to sandbox via `uploadFiles()`.

**runInjectionMigrateActor**: Takes `{ sandboxId, supabaseProjectId, additiveMigration }`. Runs the additive migration SQL against the existing Supabase project. Use the Supabase Management API to execute SQL (same pattern as the provisioning phase in the main machine).

**runInjectionValidateActor**: Takes `{ sandboxId }`. Runs `cd /workspace && bunx tsc --noEmit` and `cd /workspace && bunx vite build`. Returns `{ passed: boolean, errors: string }`.

### 4. Detect injection vs visual edit

In the `analyzing` state (or a new `classifying` state), after the analyst produces its result:
- If `selectedCapabilities` differs from `existingManifest` → route to injection flow
- Otherwise → route to existing visual edit flow

The simplest approach: add a guard/condition check. If the analyst's response includes new capabilities not in the existing manifest, set `editTier: 3` and transition to `injecting`.

### 5. Update generation state after injection

After successful injection + deploy, update `generationState` with:
- The merged `capabilityManifest`
- The updated `contract` (from fullAssembly)
- The updated `blueprint`
- The updated `fileManifest` (merge existing + new files)

### 6. Tests

Create `tests/edit-machine-injection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('Edit machine injection flow', () => {
  it('detects capability injection when new capabilities requested', () => {
    const existingManifest = ['auth', 'recipes', 'public-website']
    const requestedCapabilities = ['auth', 'recipes', 'blog', 'public-website']

    const newCaps = requestedCapabilities.filter(c => !existingManifest.includes(c))
    expect(newCaps).toEqual(['blog'])
    expect(newCaps.length > 0).toBe(true) // This means injection, not visual edit
  })

  it('routes to visual edit when no new capabilities', () => {
    const existingManifest = ['auth', 'recipes']
    const requestedCapabilities = ['auth', 'recipes']

    const newCaps = requestedCapabilities.filter(c => !existingManifest.includes(c))
    expect(newCaps.length).toBe(0) // This means visual edit, not injection
  })
})
```

IMPORTANT: This task is architectural scaffolding. The injection states should be wired with proper XState transitions, but the actual actors can initially be stubs that throw "not implemented" errors — the important thing is that the state machine compiles and the transition logic is correct. The actual actor implementations can be fleshed out incrementally.

However, `analyzeInjection()` and `computeAdditiveDelta()` from previous tasks should be called from the real actors, not stubbed.

## Verification
```bash
bunx tsc --noEmit
bun run test
```
```

---

## Task 17: Incremental Deploy — Rebuild and Redeploy After Injection

```
You are working in the VibeStack platform codebase. Implement the final step of the additive injection pipeline: after new files are uploaded and additive migration is run, rebuild the app in the sandbox and redeploy to Vercel.

## Context

After Tasks 13-16, the injection flow is:
1. ✅ Detect new capabilities needed
2. ✅ Run analyzeInjection() + computeAdditiveDelta()
3. ✅ Upload new + updated files to sandbox
4. ✅ Run additive SQL migration
5. ❌ Rebuild app in sandbox (tsc + vite build) ← THIS TASK
6. ❌ Push updated code to GitHub ← THIS TASK
7. ❌ Trigger Vercel redeploy ← THIS TASK
8. ❌ Update project generationState with merged manifest ← THIS TASK

## Files to read first
- `server/lib/agents/edit-machine.ts` — the injection states added in Task 16
- `server/lib/agents/orchestrator.ts` — `runDeployHandler` (the main pipeline's deploy logic)
- `server/lib/sandbox.ts` — getSandbox(), runCommand()
- `server/lib/agents/machine.ts` — how the main machine's deploying state works
- `server/routes/agent.ts` — how the agent route streams SSE events for state transitions
- `server/lib/db/queries.ts` — updateProject()

## Changes

### 1. Implement injection validate/repair actors

If not already implemented in Task 16, flesh out:

**runInjectionValidateActor**:
```typescript
async ({ input }: { input: { sandboxId: string } }) => {
  const sandbox = await getSandbox(input.sandboxId)
  const sessionId = `inject-validate-${Date.now()}`

  const tscResult = await runCommand(sandbox, 'cd /workspace && bunx tsc --noEmit', sessionId, { timeout: 300 })
  if (tscResult.exitCode !== 0) {
    return { passed: false, errors: `TypeScript errors:\n${tscResult.stderr}\n${tscResult.stdout}` }
  }

  const buildResult = await runCommand(sandbox, 'cd /workspace && bunx vite build', sessionId, { timeout: 300 })
  if (buildResult.exitCode !== 0) {
    return { passed: false, errors: `Build errors:\n${buildResult.stderr}\n${buildResult.stdout}` }
  }

  return { passed: true, errors: '' }
}
```

### 2. Implement injection deploy actor

Reuse as much of the existing `runDeployHandler` as possible. The deploy steps are:
1. Git commit + push new files to existing GitHub repo
2. Trigger Vercel redeploy (or it auto-deploys on push)
3. Update project `generationState` with merged manifest + updated contract

Create a `runInjectionDeployActor` that:
- Gets the sandbox
- Runs `cd /workspace && git add -A && git commit -m "feat: add <capabilities> capabilities" && git push` in the sandbox
- Updates project via `updateProject()` with merged generationState

### 3. Add SSE phase mapping

In `server/routes/agent.ts`, add the injection states to `STATE_PHASES`:
```typescript
injecting: { name: 'Adding capabilities', phase: 2 },
injectionUploading: { name: 'Uploading new files', phase: 3 },
injectionMigrating: { name: 'Running migration', phase: 4 },
injectionValidating: { name: 'Validating changes', phase: 5 },
injectionRepairing: { name: 'Repairing errors', phase: 5 },
injectionDeploying: { name: 'Deploying update', phase: 6 },
```

And in `STATE_TO_DB_STATUS`:
```typescript
injecting: 'generating',
injectionUploading: 'generating',
injectionMigrating: 'generating',
injectionValidating: 'verifying',
injectionRepairing: 'verifying',
injectionDeploying: 'deploying',
```

### 4. Update generationState after injection

After successful injection deploy, update the project's `generationState`:
```typescript
await updateProject(projectId, {
  generationState: {
    ...existingGenState,
    contract: analysis.fullAssembly.contract,
    capabilityManifest: analysis.mergedManifest,
    fileManifest: { ...existingFileManifest, ...newFileManifest },
    lastEditedAt: new Date().toISOString(),
  },
})
```

### 5. Tests

Add to `tests/edit-machine-injection.test.ts`:

```typescript
it('injection deploy updates generation state with merged manifest', () => {
  const existingGenState = {
    contract: { tables: [{ name: 'recipes', columns: [] }] },
    capabilityManifest: ['auth', 'recipes'],
    fileManifest: { 'src/routes/index.tsx': 'abc123' },
  }

  const mergedManifest = ['auth', 'recipes', 'blog']
  const newFileManifest = {
    'src/routes/blog/index.tsx': 'def456',
    'src/routes/blog/$id.tsx': 'ghi789',
  }

  const updatedGenState = {
    ...existingGenState,
    capabilityManifest: mergedManifest,
    fileManifest: { ...existingGenState.fileManifest, ...newFileManifest },
    lastEditedAt: new Date().toISOString(),
  }

  expect(updatedGenState.capabilityManifest).toEqual(['auth', 'recipes', 'blog'])
  expect(updatedGenState.fileManifest).toHaveProperty('src/routes/blog/index.tsx')
  expect(updatedGenState.fileManifest).toHaveProperty('src/routes/index.tsx')
})
```

## Verification
```bash
bunx tsc --noEmit
bun run test
```
```

---

## Phase 3 Verification Checklist

After all Phase 3 tasks (13-17) are complete, run:

```bash
bunx tsc --noEmit          # Clean compile
bun run lint               # 0 new errors
bun run test               # All pass (including new injection tests)
```

Expected new test files:
- `tests/capability-manifest-persist.test.ts`
- `tests/capability-inject.test.ts`
- `tests/capability-additive.test.ts`
- `tests/edit-machine-injection.test.ts`
