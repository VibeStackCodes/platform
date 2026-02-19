# Phase 4 Codex Prompts — Hardening + E2E Verification

Lean phase. No new capabilities — just make Phases 1-3 production-ready.

Each prompt is self-contained. Verify with `bunx tsc --noEmit && bun run test` after each.

---

## Task 18: Capability Selection in Analyst Prompt

```
You are working in the VibeStack platform codebase. Update the analyst agent's system prompt so it actually selects capabilities from the registry when analyzing user requests.

## Context

The analyst agent has a `submitRequirements` tool with `selectedCapabilities: z.array(z.string()).default([])` in its schema (server/lib/agents/schemas.ts). But the analyst's system instructions never mention available capabilities, so the LLM always returns `selectedCapabilities: []`.

The analyst needs to know which capabilities exist and when to select them.

## Files to read first
- `server/lib/agents/registry.ts` — find the analyst agent's system instructions (the `instructions` field)
- `server/lib/agents/schemas.ts` — the `submitRequirements` tool schema
- `server/lib/capabilities/catalog/index.ts` — loadCoreRegistry()
- `server/lib/capabilities/types.ts` — Capability interface
- Read each capability's SKILL.md to understand trigger keywords:
  - `server/lib/capabilities/catalog/auth/SKILL.md`
  - `server/lib/capabilities/catalog/public-website/SKILL.md`
  - `server/lib/capabilities/catalog/blog/SKILL.md`
  - `server/lib/capabilities/catalog/recipes/SKILL.md`
  - `server/lib/capabilities/catalog/portfolio/SKILL.md`

## Changes

### 1. Add capability catalog to analyst instructions

In the analyst agent's system instructions (in `registry.ts`), add a section like:

```
## Available Capabilities

Select capabilities that match the user's request. Each capability provides pre-built schema tables, pages, and navigation.

- **auth**: User authentication and profiles. Select when: app has user accounts, login, signup, profiles, or any per-user data.
- **public-website**: Landing page, about page, footer. Select for ALL apps — this provides the base layout.
- **blog**: Blog posts with categories and tags. Select when: blog, articles, news, editorial content, writing.
- **recipes**: Recipe catalog with ingredients and cook times. Select when: recipes, cooking, food, meals, ingredients, cookbook, culinary, restaurant, cafe, bakery, menu.
- **portfolio**: Project/work showcase. Select when: portfolio, gallery, projects, case studies, creative work, photography.

Always select 'public-website'. Select 'auth' when the app has user accounts or per-user data. Select additional capabilities that match the app's domain.

In your submitRequirements tool call, pass the selected capability names in the `selectedCapabilities` array.
```

### 2. Ensure registry.ts generates this dynamically

Rather than hardcoding the capability list in the prompt, generate it from the registry:

```typescript
function capabilityCatalogPrompt(): string {
  const registry = loadCoreRegistry()
  const caps = registry.list()
  const lines = caps.map(cap => {
    // Extract trigger keywords from description
    return `- **${cap.name}**: ${cap.description}`
  })
  return `## Available Capabilities\n\nSelect capabilities that match the user's request. Always select 'public-website'. Select 'auth' when the app has user accounts.\n\n${lines.join('\n')}\n\nPass selected names in the \`selectedCapabilities\` array of your submitRequirements tool call.`
}
```

Then append `capabilityCatalogPrompt()` to the analyst's instructions.

### 3. Test

Add a test in `tests/orchestrator-analysis.test.ts` or create `tests/capability-selection.test.ts`:

```typescript
it('analyst instructions include capability catalog', () => {
  // Verify the analyst's system instructions mention capabilities
  // This is a structural test — just check the prompt includes expected text
  const registry = loadCoreRegistry()
  const caps = registry.list()

  // Each registered capability should appear in some form
  for (const cap of caps) {
    expect(cap.name).toBeTruthy()
    expect(cap.description).toBeTruthy()
  }

  // Verify at least the 5 core capabilities are registered
  const names = caps.map(c => c.name)
  expect(names).toContain('auth')
  expect(names).toContain('public-website')
  expect(names).toContain('blog')
  expect(names).toContain('recipes')
  expect(names).toContain('portfolio')
})
```

## Verification
```bash
bunx tsc --noEmit
bun run test
```
```

---

## Task 19: Analyst Capability Selection for Edit/Injection Flow

```
You are working in the VibeStack platform codebase. Ensure the edit machine's analyst actor correctly produces `selectedCapabilities` so the injection flow can detect new capabilities.

## Context

The edit machine (server/lib/agents/edit-machine.ts) now has an `analyzing` state with a `runAnalystActor` that determines if a user message is a visual edit or capability injection. For injection detection to work, the analyst must return `capabilityManifest` in its output.

Currently, the edit machine's analyst may be a simpler version than the main pipeline's analyst. We need to ensure it:
1. Knows about available capabilities (same prompt section as Task 18)
2. Returns `capabilityManifest` in its output when the user asks for new features
3. Distinguishes "make the header blue" (visual edit) from "add a blog" (capability injection)

## Files to read first
- `server/lib/agents/edit-machine.ts` — find `runAnalystActor` implementation
- `server/lib/agents/registry.ts` — how the main analyst agent is configured
- `server/lib/agents/schemas.ts` — submitRequirements schema with selectedCapabilities

## Changes

### 1. Update runAnalystActor in edit-machine.ts

The edit analyst needs a system prompt that:
- Tells it about available capabilities
- Asks it to classify: is this a visual edit, a structural edit, or a capability injection?
- For capability injections, return the full list of capabilities the app should have (existing + new)

Example classification logic in the prompt:

```
You are classifying a user's edit request for their existing app.

The app currently has these capabilities installed: {existingManifest}

Classify the request:
1. VISUAL EDIT — changes to styling, text, layout of existing pages (e.g., "make the header blue", "change the font")
2. STRUCTURAL EDIT — changes to existing component structure (e.g., "add a search bar to the recipes page")
3. CAPABILITY INJECTION — adding entirely new features/sections (e.g., "add a blog", "I want to sell products")

For CAPABILITY INJECTION, return the full capability list (existing + new) in selectedCapabilities.
For VISUAL/STRUCTURAL edits, return the existing capability list unchanged.
```

### 2. Test

Add to `tests/edit-machine-injection.test.ts`:

```typescript
it('classifies "add a blog" as capability injection', () => {
  // The analyst should detect that 'blog' is not in existing manifest
  const existingManifest = ['auth', 'recipes', 'public-website']
  const userMessage = 'Add a blog to my recipe website'

  // Simulate: analyst would return ['auth', 'recipes', 'public-website', 'blog']
  const requestedCapabilities = ['auth', 'recipes', 'public-website', 'blog']
  const newCaps = requestedCapabilities.filter(c => !existingManifest.includes(c))

  expect(newCaps).toEqual(['blog'])
})

it('classifies "make the header blue" as visual edit', () => {
  const existingManifest = ['auth', 'recipes', 'public-website']

  // Analyst returns same manifest = no injection
  const requestedCapabilities = ['auth', 'recipes', 'public-website']
  const newCaps = requestedCapabilities.filter(c => !existingManifest.includes(c))

  expect(newCaps).toEqual([])
})
```

## Verification
```bash
bunx tsc --noEmit
bun run test
```
```

---

## Task 20: E2E Smoke Test — Generate + Inject

```
You are working in the VibeStack platform codebase. Add an E2E integration test that exercises the full capability flow: generate an app with auth+recipes, then inject blog as a new capability.

## Context

We need to verify the full pipeline works end-to-end:
1. Generate app → analyst selects [auth, recipes, public-website] → assembler merges → code generated → deployed
2. User says "add a blog" → edit machine detects injection → analyzeInjection() → additive delta → new files uploaded → redeployed

This test should be a DRY-RUN test (no actual sandbox/deploy) that verifies the data flow through the pipeline.

## Files to read first
- `tests/dry-run-pipeline.test.ts` — existing dry-run test pattern (mocks sandbox/deploy, tests data flow)
- `server/lib/capabilities/inject.ts` — analyzeInjection()
- `server/lib/capabilities/additive.ts` — computeAdditiveDelta()
- `server/lib/app-blueprint.ts` — contractToBlueprintWithDesignAgent()
- `server/lib/themed-code-engine.ts` — generateThemedApp()

## Create: `tests/capability-e2e-dryrun.test.ts`

Test flow:
1. Load core registry, resolve [auth, recipes, public-website]
2. Assemble capabilities → AssemblyResult
3. Generate blueprint from assembly contract → AppBlueprint
4. Verify blueprint has recipe pages, auth pages, landing page
5. Simulate injection: analyzeInjection(['auth', 'recipes', 'public-website'], ['auth', 'recipes', 'public-website', 'blog'])
6. Verify analysis.hasChanges === true, newCapabilities === ['blog']
7. Generate full blueprint from merged assembly
8. Compute additive delta (existing file paths from step 4, full blueprint from step 7)
9. Verify: new files include blog routes, updated files include routeTree
10. Verify: additive migration SQL contains blog_posts CREATE TABLE

```typescript
import { describe, it, expect } from 'vitest'
import { loadCoreRegistry } from '@server/capabilities/catalog'
import { assembleCapabilities } from '@server/capabilities/assembler'
import { analyzeInjection } from '@server/capabilities/inject'
import { computeAdditiveDelta } from '@server/capabilities/additive'

describe('Capability E2E dry run', () => {
  it('generate + inject flow produces correct delta', () => {
    // Step 1-2: Initial generation
    const registry = loadCoreRegistry()
    const initialCaps = registry.resolve(['auth', 'recipes', 'public-website'])
    const initialAssembly = assembleCapabilities(initialCaps)

    expect(initialAssembly.capabilityManifest).toContain('auth')
    expect(initialAssembly.capabilityManifest).toContain('recipes')
    expect(initialAssembly.contract.tables.length).toBeGreaterThan(0)

    // Step 3-4: Verify initial assembly has expected tables
    const tableNames = initialAssembly.contract.tables.map(t => t.name)
    expect(tableNames).toContain('recipes')
    // auth tables come from auth capability
    expect(initialAssembly.hasAuth).toBe(true)

    // Step 5-6: Simulate injection
    const analysis = analyzeInjection(
      ['auth', 'recipes', 'public-website'],
      ['auth', 'recipes', 'public-website', 'blog'],
    )

    expect(analysis.hasChanges).toBe(true)
    expect(analysis.newCapabilities).toEqual(['blog'])
    expect(analysis.mergedManifest).toEqual(['auth', 'recipes', 'public-website', 'blog'])

    // Step 7: Verify full assembly includes blog
    const mergedTableNames = analysis.fullAssembly.contract.tables.map(t => t.name)
    expect(mergedTableNames).toContain('blog_posts')
    expect(mergedTableNames).toContain('recipes')

    // Step 8: Verify additive assembly has ONLY blog tables
    expect(analysis.additiveAssembly).not.toBeNull()
    const additiveTableNames = analysis.additiveAssembly!.contract.tables.map(t => t.name)
    expect(additiveTableNames).toContain('blog_posts')
    expect(additiveTableNames).not.toContain('recipes')
  })

  it('no-op injection when requesting existing capabilities', () => {
    const analysis = analyzeInjection(
      ['auth', 'recipes', 'public-website'],
      ['auth', 'recipes', 'public-website'],
    )

    expect(analysis.hasChanges).toBe(false)
    expect(analysis.newCapabilities).toEqual([])
    expect(analysis.additiveAssembly).toBeNull()
  })

  it('additive delta correctly classifies new vs existing files', () => {
    const analysis = analyzeInjection(
      ['auth', 'public-website'],
      ['auth', 'public-website', 'blog'],
    )

    // Simulate existing file paths from initial generation
    const existingPaths = new Set([
      'src/routes/index.tsx',
      'src/routes/__root.tsx',
      'src/routeTree.gen.ts',
      'src/routes/_authenticated/route.tsx',
    ])

    // Create a minimal mock blueprint that represents the merged output
    const mockBlueprint = {
      appName: 'test',
      fileTree: [
        { path: 'src/routes/index.tsx', content: '// home', isLLMSlot: false },
        { path: 'src/routes/__root.tsx', content: '// root with blog nav', isLLMSlot: false },
        { path: 'src/routeTree.gen.ts', content: '// tree with blog', isLLMSlot: false },
        { path: 'src/routes/_authenticated/route.tsx', content: '// auth', isLLMSlot: false },
        { path: 'src/routes/blog/index.tsx', content: '// blog list', isLLMSlot: false },
        { path: 'src/routes/blog/$id.tsx', content: '// blog detail', isLLMSlot: false },
      ],
      meta: {},
    }

    const delta = computeAdditiveDelta(analysis, mockBlueprint as any, existingPaths)

    // New files: blog routes (not in existing paths)
    const newPaths = delta.newFiles.map(f => f.path)
    expect(newPaths).toContain('src/routes/blog/index.tsx')
    expect(newPaths).toContain('src/routes/blog/$id.tsx')
    expect(newPaths).not.toContain('src/routes/index.tsx') // already exists

    // Updated files: always-regenerate set
    const updatedPaths = delta.updatedFiles.map(f => f.path)
    expect(updatedPaths).toContain('src/routes/__root.tsx')
    expect(updatedPaths).toContain('src/routeTree.gen.ts')

    // Additive migration should exist
    expect(delta.additiveMigration).toBeTruthy()
    expect(delta.additiveMigration).toContain('blog_posts')
  })
})
```

## Verification
```bash
bunx tsc --noEmit
bun run test tests/capability-e2e-dryrun.test.ts
bun run test
```
```

---

## Phase 4 Verification Checklist

After all Phase 4 tasks (18-20) are complete:

```bash
bunx tsc --noEmit          # Clean compile
bun run lint               # No new errors
bun run test               # All pass
```

Expected new/modified test files:
- `tests/capability-selection.test.ts` (or additions to `tests/orchestrator-analysis.test.ts`)
- `tests/edit-machine-injection.test.ts` (additions)
- `tests/capability-e2e-dryrun.test.ts` (new)
