# Bespoke LLM Code Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete the section composition engine and contract-to-* pipeline (~6700 lines), leaving only the LLM page generator + deterministic assembly path that already exists.

**Architecture:** The pipeline already has two paths — "Pipeline A" (old: SchemaContract → contract-to-* → section renderers) and "Pipeline B" (new: CreativeSpec → page-generator.ts → deterministic-assembly.ts). Pipeline B is already wired and working. This plan deletes Pipeline A and all its dead code.

**Tech Stack:** TypeScript, XState, Mastra, Vercel AI SDK, TanStack Router, Tailwind v4, Vitest

**Key Discovery:** `deterministic-assembly.ts` already generates routeTree from CreativeSpec.sitemap, main.tsx without React Query, and __root.tsx with bespoke nav/footer. `page-generator.ts` already generates complete .tsx files via LLM. The orchestrator's `runCodeGeneration()` already calls both correctly. The section composition engine and contract-to-* files are dead code.

---

### Task 1: Delete section composition engine (14 files)

**Files:**
- Delete: `server/lib/sections/types.ts`
- Delete: `server/lib/sections/primitives.ts`
- Delete: `server/lib/sections/registry.ts`
- Delete: `server/lib/sections/index.ts`
- Delete: `server/lib/sections/heroes.ts`
- Delete: `server/lib/sections/navigation.ts`
- Delete: `server/lib/sections/grids.ts`
- Delete: `server/lib/sections/details.ts`
- Delete: `server/lib/sections/content.ts`
- Delete: `server/lib/sections/ctas.ts`
- Delete: `server/lib/sections/footers.ts`
- Delete: `server/lib/sections/utility.ts`
- Delete: `server/lib/sections/domain-restaurant.ts`
- Delete: `server/lib/sections/image-helpers.ts`
- Delete: `server/lib/page-composer.ts`
- Delete: `server/lib/page-assembler.ts`

**Step 1: Delete the files**

```bash
rm -rf server/lib/sections/
rm server/lib/page-composer.ts
rm server/lib/page-assembler.ts
```

**Step 2: Delete tests for deleted files**

```bash
rm tests/section-composition.test.ts
rm tests/a11y-section-renderers.test.ts
rm tests/a11y-assembled-pages.test.ts
rm tests/page-assembler-images.test.ts
rm tests/domain-sections.test.ts
rm tests/page-composer-v2.test.ts
rm tests/composition-v2-schemas.test.ts
rm tests/config-resolvers.test.ts
```

**Step 3: Verify no remaining imports**

```bash
cd /Users/ammishra/VibeStack/platform
grep -r "page-composer\|page-assembler\|sections/\|composeSections\|assemblePagesV2\|getSectionRenderer" server/ --include="*.ts" -l
```

Expected: Only hits in files we'll modify in later tasks (themed-code-engine.ts). Fix any straggling imports.

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: delete section composition engine (16 files, ~3500 lines)"
```

---

### Task 2: Delete contract-to-* pipeline files

**Files:**
- Delete: `server/lib/contract-to-sql.ts`
- Delete: `server/lib/contract-to-sql-functions.ts`
- Delete: `server/lib/contract-to-seed.ts`
- Delete: `server/lib/contract-to-pages.ts`

**Step 1: Delete the files**

```bash
rm server/lib/contract-to-sql.ts
rm server/lib/contract-to-sql-functions.ts
rm server/lib/contract-to-seed.ts
rm server/lib/contract-to-pages.ts
```

**Step 2: Delete tests for deleted files**

```bash
rm tests/contract-to-sql.test.ts
rm tests/contract-to-sql-functions.test.ts
rm tests/contract-to-seed.test.ts
rm tests/contract-to-pages.test.ts
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: delete contract-to-* pipeline (4 files, ~630 lines)"
```

---

### Task 3: Delete feature-schema and theme-specific files

**Files:**
- Delete: `server/lib/agents/feature-schema.ts`
- Delete: `server/lib/theme-schemas/` (entire directory)
- Delete: `server/lib/theme-routes/` (entire directory)
- Delete: `server/lib/agents/theme-selector.ts` (if exists)
- Delete: `server/lib/agents/theme-metadata.ts` (if exists)
- Delete: `server/lib/skills/canape.ts` (if exists)

**Step 1: Delete the files**

```bash
rm server/lib/agents/feature-schema.ts
rm -rf server/lib/theme-schemas/
rm -rf server/lib/theme-routes/
rm -f server/lib/agents/theme-selector.ts
rm -f server/lib/agents/theme-metadata.ts
rm -f server/lib/skills/canape.ts
```

**Step 2: Delete tests**

```bash
rm tests/feature-schema.test.ts
rm -f tests/theme-metadata.test.ts
rm -f tests/theme-selector.test.ts
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: delete feature-schema + theme-specific files (~2200 lines)"
```

---

### Task 4: Delete schema-contract.ts and simplify AppBlueprint

The `AppBlueprint` type has `features: InferredFeatures` and `contract: SchemaContract` fields. These are always set to empty values in Pipeline B (`inferFeatures({ tables: [] })`, `{ tables: [] }`). Remove the dependency.

**Files:**
- Delete: `server/lib/schema-contract.ts`
- Modify: `server/lib/app-blueprint.ts` — remove SchemaContract, InferredFeatures, simplify AppBlueprint
- Modify: `server/lib/agents/orchestrator.ts:647,774` — remove `inferFeatures` import, inline empty values
- Modify: `server/lib/agents/machine.ts:4` — remove unused import if applicable

**Step 1: Delete schema-contract.ts and its tests**

```bash
rm server/lib/schema-contract.ts
rm tests/schema-contract.test.ts
rm tests/schema-contract.property.test.ts
rm tests/column-classifier.test.ts
rm -f server/lib/column-classifier.ts
```

**Step 2: Simplify AppBlueprint type in app-blueprint.ts**

In `server/lib/app-blueprint.ts`, the `AppBlueprint` interface currently requires `features` and `contract`. Replace with a minimal type. Remove all old code (contractToBlueprint, buildBlueprintFromTokens, etc.) — keep only the `AppBlueprint` type, `BlueprintFile` type, and `loadUIKit()`.

The simplified `app-blueprint.ts` should be:

```typescript
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DesignSystem } from './themed-code-engine'

export interface BlueprintFile {
  path: string
  content: string
  layer: number
  isLLMSlot: boolean
}

export interface AppBlueprint {
  meta: {
    appName: string
    appDescription: string
    tokens?: DesignSystem
  }
  fileTree: BlueprintFile[]
}
```

**Step 3: Fix orchestrator.ts — remove inferFeatures imports**

In `server/lib/agents/orchestrator.ts`, lines 647 and 774 import `inferFeatures` from `schema-contract`. Replace both blueprint constructions with:

```typescript
const blueprint: AppBlueprint = {
  meta: { appName: input.appName, appDescription: '' },
  fileTree: allFiles,
}
```

**Step 4: Fix machine.ts — remove `features` and `contract` from type if referenced**

Check if `MachineContext.blueprint` type needs updating after AppBlueprint simplification. The machine imports `AppBlueprint` from `app-blueprint.ts` — the type change propagates automatically.

**Step 5: Run TypeScript to find remaining references**

```bash
bunx tsc --noEmit 2>&1 | head -50
```

Fix all `schema-contract` import errors. Common patterns:
- `import type { SchemaContract }` → delete the import and any usage
- `inferFeatures({ tables: [] })` → delete, simplify AppBlueprint construction
- `features: InferredFeatures` → delete from types

**Step 6: Delete app-blueprint.test.ts (tests the old pipeline)**

```bash
rm tests/app-blueprint.test.ts
```

**Step 7: Commit**

```bash
git add -A && git commit -m "chore: delete schema-contract + simplify AppBlueprint type"
```

---

### Task 5: Clean up themed-code-engine.ts

After the previous tasks, `themed-code-engine.ts` may have broken imports. It currently imports from `schema-contract` and exports `RouteMeta` + `generateThemedApp()` which use section composition.

**Files:**
- Modify: `server/lib/themed-code-engine.ts`

**Step 1: Remove dead code from themed-code-engine.ts**

The file should only export:
- `DesignSystem` type and related types (re-exported from `design-system.ts`)
- `DEFAULT_TEXT_SLOTS` and `DesignSystemSchema` (re-exported from `design-system.ts`)
- `themeCss()` and `buildThemePalette()` for CSS generation

Remove:
- `RouteMeta` type
- `routeMetaToEntityMeta()` function
- `isPrivateByTable()` function
- `generateThemedApp()` function
- All imports from `schema-contract`, `feature-schema`, `page-composer`, `page-assembler`, `naming-utils`

**Step 2: Verify remaining imports**

```bash
grep -r "themed-code-engine" server/ tests/ --include="*.ts" -l
```

Check each consumer still compiles. Main consumers:
- `deterministic-assembly.ts` — imports `DesignSystem` type (still valid)
- `page-generator.ts` — imports `DesignSystem` type (still valid)
- `creative-director.ts` — imports `DesignSystem` type (still valid)

**Step 3: Run tsc**

```bash
bunx tsc --noEmit 2>&1 | head -50
```

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: strip dead code from themed-code-engine.ts"
```

---

### Task 6: Clean up edit-machine.ts references

The edit machine (`server/lib/agents/edit-machine.ts`) imports `SchemaContract` from the now-deleted `schema-contract.ts`. It uses it in context types.

**Files:**
- Modify: `server/lib/agents/edit-machine.ts`
- Modify: `server/lib/agents/edit-agent.ts`

**Step 1: Replace SchemaContract with null in edit-machine context**

The edit machine context has `contract: SchemaContract | null`. Since it's always nullable and we no longer have SchemaContract, change it to `contract: null`. Search for all `SchemaContract` references in these two files and replace with inline types or remove.

**Step 2: Run tsc**

```bash
bunx tsc --noEmit 2>&1 | head -50
```

**Step 3: Commit**

```bash
git add -A && git commit -m "refactor: remove SchemaContract from edit-machine"
```

---

### Task 7: Clean up remaining agent schema references

**Files:**
- Modify: `server/lib/agents/schemas.ts` — remove section composition schemas

**Step 1: Check what schemas reference deleted types**

```bash
grep -n "SectionVisualSpec\|PageCompositionPlan\|SectionIdEnum\|SECTION_IDS" server/lib/agents/schemas.ts
```

Remove any schemas related to section composition: `SectionVisualSpecSchema`, `RouteSpecSchema`, `PageCompositionPlanV2Schema`.

Keep: `AnalystOutputSchema`, `CreativeSpecSchema`, `DesignSystemSchema`, `ThemeSelectorInputSchema`, `ThemeSelectorOutputSchema` (if still used).

**Step 2: Run tsc**

```bash
bunx tsc --noEmit 2>&1 | head -50
```

**Step 3: Commit**

```bash
git add -A && git commit -m "refactor: remove section composition schemas from agents/schemas.ts"
```

---

### Task 8: Run full test suite, fix failures

**Step 1: Run all tests**

```bash
bun run test 2>&1 | tail -40
```

Expected failures: tests that import deleted files. These should already be deleted in Tasks 1-4. If any remain, delete them.

**Step 2: Run lint**

```bash
bun run lint 2>&1 | tail -20
```

Fix any lint errors in modified files.

**Step 3: Run tsc one final time**

```bash
bunx tsc --noEmit
```

Must be zero errors.

**Step 4: Commit any remaining fixes**

```bash
git add -A && git commit -m "fix: resolve test and lint failures after pipeline cleanup"
```

---

### Task 9: Update snapshot package-base.json

**Files:**
- Modify: `snapshot/package-base.json` — remove `@tanstack/react-query` and `@supabase/supabase-js`

**Step 1: Read current package-base.json**

Check what deps are listed and remove:
- `@tanstack/react-query`
- `@supabase/supabase-js`
- `@supabase/ssr` (if present)

**Step 2: Verify no generated code references these**

```bash
grep -r "react-query\|@supabase/supabase-js" server/lib/page-generator.ts server/lib/deterministic-assembly.ts
```

The page-generator's CLOSED VOCABULARY should NOT include these. Verify.

**Step 3: Commit**

```bash
git add snapshot/package-base.json && git commit -m "chore: remove react-query + supabase-js from sandbox snapshot deps"
```

Note: The actual Daytona snapshot rebuild is a separate ops task (requires Docker build + Daytona API). Don't attempt it in this plan.

---

### Task 10: Final verification — typecheck + lint + test

**Step 1: Full typecheck**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Full lint**

```bash
bun run lint
```

Expected: 0 errors (or only pre-existing ones).

**Step 3: Full test suite**

```bash
bun run test
```

Expected: All remaining tests pass.

**Step 4: Count lines deleted**

```bash
git diff --stat main
```

Expected: ~6000+ lines deleted, minimal additions.

**Step 5: Final commit if needed, then push**

```bash
git push
```

---

## Post-Implementation: What's Left for Future Work

These are NOT part of this plan but are natural follow-ups:

1. **Deterministic import validator** (v0-style "LLM Suspense") — strip unauthorized imports from LLM-generated pages before upload
2. **Lucide icon name validator** — check icon names against actual lucide-react exports, fall back to closest match
3. **Rebuild Daytona snapshot** — after package-base.json changes, rebuild and publish new snapshot
4. **E2E validation** — generate 5 diverse apps and verify visual variety + build success
5. **Edit machine modernization** — replace SchemaContract-based context with CreativeSpec
