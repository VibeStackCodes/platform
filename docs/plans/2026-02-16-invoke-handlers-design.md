# Invoke Handlers + Hybrid Code Generation Design

**Date:** 2026-02-16
**Status:** Proposed
**Depends on:** [App Wiring Design](2026-02-16-app-wiring-design.md) (Approved)

## Problem

The XState machine (`machine.ts`) defines 11 states with proper transitions and guards, but **zero invoke handlers**. States wait for external events that nothing sends. The machine is a skeleton — it cannot drive actual app generation.

Additionally, the current code generation approach (LLM fills `{/* SLOT */}` markers via tool-calling agents) has no structured output, no validation per-file, and no assembly strategy. The frontend/backend agents are told to "fill slots" but have no schema constraining their output.

## Goals

1. Wire every XState state to an `invoke` handler (via `fromPromise`) so the machine is self-executing
2. Implement Hybrid Code Generation (Approach 3) for frontend pages — structured feature analysis + deterministic assembly + minimal LLM cell renderers
3. Connect the validation gate + repair loop as invoke handlers
4. Track token usage per-invoke for credit deduction
5. Rebuild Daytona snapshot with updated scaffold files

## Non-Goals

- Realtime features, file uploads, multi-tenant auth (phase 2)
- E2E test generation (paper proved +16.7pp false rejections)
- Custom component library beyond shadcn/ui
- State persistence/resume across server restarts (phase 2)

## Design

### Section 1: Invoke Handler Architecture

**New file: `server/lib/agents/orchestrator.ts`**

Each XState state maps to an async function. The machine uses `fromPromise` actors to invoke them. When the promise resolves, the machine auto-transitions via `onDone`. On rejection, it transitions via `onError` → `failed`.

```
State             → Invoke Handler         → Output Event
─────────────────────────────────────────────────────────
analyzing         → runAnalysis()          → ANALYST_DONE | CLARIFICATION_NEEDED
blueprinting      → runBlueprint()         → BLUEPRINT_DONE
provisioning      → runProvisioning()      → PROVISION_DONE
generating        → runCodeGeneration()    → CODEGEN_DONE
validating        → runValidation()        → VALIDATION_PASS | VALIDATION_FAIL
repairing         → runRepair()            → REPAIR_DONE
deploying         → runDeploy()            → DEPLOY_DONE
```

Each handler receives `MachineContext` as input and returns the event payload. The machine assigns the output via `onDone.actions: assign(...)`.

**Token tracking:** Each handler returns `{ ...payload, tokensUsed: number }`. Machine accumulates in `context.totalTokens`. Credit deduction happens once in `complete` state's `entry` action.

### Section 2: Hybrid Code Generation (Approach 3)

The `generating` state runs `runCodeGeneration()`, which does three phases:

**Phase 1: Structured Feature Analysis (1 LLM call per entity)**

For each entity table, one LLM call with `structuredOutput` produces a `PageFeatureSpec`:

```typescript
const PageFeatureSchema = z.object({
  entityName: z.string(),
  listPage: z.object({
    columns: z.array(z.object({
      field: z.string(),           // must match a column name from contract
      label: z.string(),           // human-readable header
      format: z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean']),
    })),
    searchFields: z.array(z.string()),  // columns to search across
    sortDefault: z.string(),            // default sort column
    sortDirection: z.enum(['asc', 'desc']),
    createFormFields: z.array(z.object({
      field: z.string(),
      label: z.string(),
      inputType: z.enum(['text', 'textarea', 'number', 'select', 'date', 'email', 'url', 'checkbox']),
      placeholder: z.string().optional(),
      options: z.array(z.string()).optional(), // for select inputs, from enum values
    })),
    emptyStateMessage: z.string(),
  }),
  detailPage: z.object({
    headerField: z.string(),       // which field to use as page title
    sections: z.array(z.object({
      title: z.string(),
      fields: z.array(z.object({
        field: z.string(),
        label: z.string(),
        format: z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean', 'json']),
      })),
    })),
    editFormFields: z.array(z.object({
      field: z.string(),
      label: z.string(),
      inputType: z.enum(['text', 'textarea', 'number', 'select', 'date', 'email', 'url', 'checkbox']),
    })),
  }),
})
```

All values are **closed enums** or **references to contract columns**. The LLM cannot invent field names — they must match `contract.tables[i].columns[j].name`. Validation rejects any field not in the contract.

**Phase 2: Deterministic Component Assembly (0 LLM calls)**

Functions `assembleListPage(spec, contract)` and `assembleDetailPage(spec, contract)` produce complete React components from the feature spec. These are pure TypeScript functions — no LLM involved.

Assembly uses a component library of **renderers** (deterministic JSX template strings):

| Format | Renderer |
|--------|----------|
| `text` | `<span>{value}</span>` |
| `date` | `<span>{new Date(value).toLocaleDateString()}</span>` |
| `badge` | `<Badge variant="secondary">{value}</Badge>` |
| `currency` | `<span>${Number(value).toFixed(2)}</span>` |
| `link` | `<a href={value} target="_blank">{value}</a>` |
| `boolean` | `<Badge variant={value ? "default" : "outline"}>{value ? "Yes" : "No"}</Badge>` |
| `json` | `<pre className="text-xs">{JSON.stringify(value, null, 2)}</pre>` |

Input types map to shadcn/ui form components:

| InputType | Component |
|-----------|-----------|
| `text` | `<Input type="text" />` |
| `textarea` | `<Textarea />` |
| `number` | `<Input type="number" />` |
| `select` | `<Select><SelectTrigger>...` |
| `date` | `<Input type="date" />` |
| `email` | `<Input type="email" />` |
| `url` | `<Input type="url" />` |
| `checkbox` | `<Checkbox />` |

The assembled page is a **complete, valid React component** — no SLOT markers, no LLM needed. This replaces the current approach of page skeletons with `{/* SLOT: COMPONENT_BODY */}`.

**Phase 3: Backend Custom Procedures (1 LLM call per entity)**

For backend tRPC routers, the `// {/* SLOT: CUSTOM_PROCEDURES */}` markers are filled by the backend agent with `structuredOutput`:

```typescript
const CustomProcedureSchema = z.object({
  procedures: z.array(z.object({
    name: z.string(),              // procedure name (camelCase)
    type: z.enum(['query', 'mutation']),
    access: z.enum(['public', 'protected']),
    description: z.string(),
    inputFields: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'string[]']),
      optional: z.boolean(),
    })),
    implementation: z.string(),    // TypeScript function body (the one LLM-generated code string)
  })),
})
```

The implementation string is validated by:
1. Checking it doesn't contain `require()` or `process.env`
2. Wrapping it in a procedure template and type-checking with the full project context

**Why not fully deterministic backend?** Business logic (search across specific fields, join conditions, computed aggregations) genuinely requires semantic understanding. But the procedure shape is constrained — only the function body is LLM-generated.

### Section 3: File Generation Flow

```
Per entity (parallel via Promise.allSettled):
  |-- Feature Analysis (1 LLM call) -> PageFeatureSpec
  |     |-- assembleListPage() -> complete list component (0 LLM)
  |     +-- assembleDetailPage() -> complete detail component (0 LLM)
  +-- Custom Procedures (1 LLM call) -> procedure bodies
        +-- assembleProcedures() -> patched tRPC router (0 LLM)
```

Total LLM calls for `generating` state: **2 x N entities** (down from N x maxSteps per agent).

File assembly writes directly to sandbox via `sandbox.fs.uploadFile()`. No intermediate tool-calling step.

### Section 4: Validation + Repair Loop

The `validating` state invoke runs `runValidationGate()` (already implemented in `validation.ts`).

If validation fails and `canRetry` guard passes (retryCount < 2):
1. Machine transitions to `repairing`
2. `runRepair()` invoke handler calls `buildRepairPrompt()` (from `repair.ts`)
3. Repair agent uses tool-calling (readFile, writeFile, runCommand) — NOT structured output
4. On completion, machine transitions back to `validating`
5. Max 2 repair cycles

**Why tool-calling for repair?** Repair is inherently exploratory — the agent needs to read the failing file, understand the error context, and make targeted fixes. Structured output can't express "read line 47, the import is wrong, change it to X."

### Section 5: Other Invoke Handlers

**`runAnalysis()`** — Calls `analystAgent.generate()`. Parses tool call result:
- If `submitRequirements` tool was called -> extract appName, contract, designPreferences -> `ANALYST_DONE`
- If `askClarifyingQuestions` tool was called -> extract questions -> `CLARIFICATION_NEEDED`
- Uses existing AI SDK v5 content-part extraction pattern (from MEMORY.md)

**`runBlueprint()`** — Pure function, no LLM. Calls `contractToBlueprint()` from `app-blueprint.ts`. Returns the full `AppBlueprint`.

**`runProvisioning()`** — Three parallel async operations:
1. Create Daytona sandbox from snapshot -> `sandboxId`
2. Create Supabase project via Management API -> `supabaseProjectId`, `supabaseUrl`, `supabaseAnonKey`
3. Create GitHub repo -> `githubCloneUrl`, `githubHtmlUrl`, `repoName`

Then: write blueprint files to sandbox via `blueprintToSandbox()`, run SQL migration, inject real credentials into `.env`.

**`runDeploy()`** — Sequential:
1. `git add . && git commit -m "Initial commit"` in sandbox
2. `git push` to GitHub
3. Deploy to Vercel via API
4. Return `deploymentUrl`

### Section 6: Token Usage Tracking

Each invoke handler that calls an LLM returns `tokensUsed`:
- `runAnalysis()`: `result.totalUsage?.totalTokens ?? 0`
- `runCodeGeneration()`: sum of all feature analysis + custom procedure calls
- `runRepair()`: `result.totalUsage?.totalTokens ?? 0`

Machine context gets `totalTokens: number` field. Accumulated via `assign` in each `onDone` action. Credit deduction in `complete` state's `entry` action.

### Section 7: Snapshot Rebuild

Update `snapshot/warmup-scaffold/` to include Layer 0 files that match the generated app structure. Update `snapshot/Dockerfile` if needed. Rebuild and push new snapshot to Daytona.

Layer 0 files already in snapshot (confirmed):
- `server/index.ts` — Hono entry + tRPC adapter
- `server/trpc/trpc.ts` — tRPC init + procedures
- `server/trpc/context.ts` — tRPC context
- `server/trpc/router.ts` — placeholder root router (overwritten by blueprint)
- `server/db/client.ts` — Drizzle client
- `src/lib/trpc.ts` — tRPC React client
- `src/lib/utils.ts` — cn() helper
- `vite.config.ts` — Vite + proxy config

Layer 0 files to add:
- `src/lib/auth.ts` — Supabase Auth client
- `.gitignore`
- `vercel.json`
- `drizzle.config.ts`
- `biome.json`
- `tsconfig.json` + `tsconfig.server.json`
- `src/components/ui/*` — shadcn/ui components (Button, Card, Input, Dialog, Table, Badge, Select, Textarea, Checkbox, Label, Separator)

## LLM Call Budget

| Phase | Calls | Model | Purpose |
|-------|-------|-------|---------|
| Analysis | 1 | gpt-5.2 | Extract SchemaContract from user prompt |
| Feature Analysis | N (per entity) | gpt-5.2 | Structured PageFeatureSpec |
| Custom Procedures | N (per entity) | gpt-5.2 | Structured procedure bodies |
| Repair (if needed) | 1-2 | gpt-5.2 | Tool-calling fix cycle |

**Total: 1 + 2N + (0-2) calls.** For a 3-entity app: 7-9 calls. For a 5-entity app: 11-13 calls.

## Migration from Current Architecture

**Files to create:**
1. `server/lib/agents/orchestrator.ts` — all invoke handler functions
2. `server/lib/agents/assembler.ts` — deterministic component assembly (assembleListPage, assembleDetailPage, assembleProcedures)
3. `server/lib/agents/feature-schema.ts` — PageFeatureSchema, CustomProcedureSchema, validation

**Files to modify:**
1. `server/lib/agents/machine.ts` — add `invoke` clauses to every state, add `fromPromise` actors, add `totalTokens` to context
2. `server/routes/agent.ts` — remove manual event sending (machine is now self-executing), update credit deduction
3. `server/lib/contract-to-pages.ts` — remove SLOT markers (pages are now fully assembled, not skeleton+LLM)
4. `snapshot/warmup-scaffold/` — add missing Layer 0 files

**Files to delete:**
- None (all deletions already happened in Batch 4)

**Files unchanged:**
- `server/lib/app-blueprint.ts` — still generates the file tree, but Layer 4 files become assembly targets instead of SLOT skeletons
- `server/lib/agents/validation.ts` — already implemented
- `server/lib/agents/repair.ts` — already implemented
- `server/lib/agents/registry.ts` — agents stay the same, but frontend/backend agents are now called differently (structured output instead of tool-calling for codegen)

## Key Risk: LLM Structured Output Quality

The biggest risk is that `gpt-5.2` returns field names that don't match the contract (e.g., `"userName"` instead of `"user_name"`). Mitigation:

1. **Prompt includes exact column names** from the contract — no guessing
2. **Zod refinement** validates every field reference against `contract.tables[].columns[].name`
3. **Retry once** on validation failure with the specific error (not a full repair cycle — just re-call structured output with error context)
4. **Fallback:** If structured output fails twice, generate a basic table with all columns in text format (degraded but functional)

## drizzle-orm/zod Usage

Since `drizzle-zod` is deprecated (merged into `drizzle-orm` itself as of `1.0.0-beta.15`), use:

```typescript
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod'
```

This provides Zod schemas derived from the Drizzle schema at runtime. However, our generated apps use **build-time code generation** (not runtime schema derivation), so `drizzle-orm/zod` is useful for:
- Input validation in tRPC procedures (generated code can import from `drizzle-orm/zod`)
- NOT for our assembly pipeline (which produces static TypeScript strings)

We do NOT depend on `drizzle-trpc-zod` (stale, 3 years old). Our `contractToTrpc()` generator handles tRPC router generation.
