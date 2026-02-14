# Agent-First Codebase Design

**Date**: 2026-02-14
**Status**: Approved
**Scope**: General principles for structuring any codebase for optimal AI agent (Claude Code) efficiency

## Core Thesis

Agent-first codebases optimize for **search, locality, and self-containment** — not for human mental models.

The core equation:

> **Minimize tokens read per task, not total lines in codebase.**

Human-optimized codebases minimize files and repetition. Agent-optimized codebases minimize context tokens consumed per task and files touched per change.

| Metric | Human-Optimized | Agent-Optimized |
|--------|----------------|-----------------|
| Files read per task | 5-15 | 1-3 |
| Tokens consumed per task | High (large files, shared abstractions) | Low (small files, self-contained) |
| Naming | Concise (`create()`, `utils.ts`) | Verbose, greppable (`createSandboxFromSnapshot()`) |
| DRY | Aggressively deduplicated | Duplicated within boundaries |
| Abstractions | Layers of indirection | Flat, explicit |
| Organization | By type (`components/`, `utils/`) | By capability (`sandbox-lifecycle/`, `schema-pipeline/`) |
| Documentation | Comments for humans | Machine-readable manifests |

---

## The 12 Principles

| # | Principle | Human Convention It Replaces |
|---|-----------|---------------------------|
| 1 | Organize by capability, not by type | `components/`, `utils/`, `hooks/` directories |
| 2 | One exported function per file | Multi-function modules |
| 3 | Max ~150 lines per file | "Keep related code together" in large files |
| 4 | Verbose, globally-unique names | Concise names with context from file path |
| 5 | Duplicate types across module boundaries | Single shared `types.ts` |
| 6 | No barrel exports (`index.ts`) | Re-export patterns for clean imports |
| 7 | Co-locate tests with implementation | Separate `tests/` directory tree |
| 8 | Flat control flow, no abstraction layers | Middleware chains, base classes, mixins |
| 9 | `MODULE.md` manifest per capability | Human-readable READMEs |
| 10 | `CODEBASE.yaml` global map at root | Architecture docs in Confluence/Notion |
| 11 | `CLAUDE.md` as agent runbook, not README | Developer onboarding guides |
| 12 | Module boundaries = concurrency boundaries | Locking, coordination protocols |

---

## Principle 1: Module-Per-Capability Structure

Organize by **what the code does** (capability), not by **what it is** (type). Each capability gets its own directory with everything an agent needs.

### Anatomy of a capability module

```
capabilities/
  sandbox-lifecycle/
    MODULE.md              # Machine-readable manifest (read FIRST)
    contract.ts            # Types + function signatures — ONLY cross-module import
    create-sandbox.ts      # One function, one file
    destroy-sandbox.ts     # One function, one file
    poll-sandbox-ready.ts  # One function, one file
    create-sandbox.test.ts # Test co-located next to implementation
    destroy-sandbox.test.ts
```

### Why this beats conventional structure

**Conventional** (organized by type):
```
lib/types.ts          # 400 lines, 30 types from 10 different domains
lib/sandbox.ts        # 600 lines, 5 functions mixed together
lib/utils.ts          # Grab bag of unrelated helpers
tests/sandbox.test.ts # Far from implementation
```

Agent asked to "fix the sandbox polling timeout" reads ~1200 tokens of irrelevant context.

**Agent-first** (organized by capability):
```
capabilities/sandbox-lifecycle/
  MODULE.md             -> agent reads this first, knows to open poll-sandbox-ready.ts
  poll-sandbox-ready.ts -> ~60 lines, self-contained
  poll-sandbox-ready.test.ts -> right there
```

Agent reads ~100 tokens. 10x more efficient.

### Rules

1. One exported function per file — file name = function name in kebab-case
2. Max ~150 lines per file — if longer, split it
3. Co-locate tests — `foo.ts` next to `foo.test.ts`
4. No barrel `index.ts` — import directly: `from './sandbox-lifecycle/create-sandbox'`
5. `contract.ts` is the only file other modules may import
6. Inline small types — if used in only one file, define it there

---

## Principle 2: The Manifest Layer

Two manifest files make the system work. They're how agents orient before reading code.

### `CODEBASE.yaml` — The Global Map

Lives at project root. Agent's **first read** for any task. Answers: "Where do I go?"

```yaml
name: my-project
description: "AI-powered app builder"

modules:
  sandbox-lifecycle:
    path: capabilities/sandbox-lifecycle/
    purpose: "Create, poll, and destroy Daytona sandboxes"
    exports: [createSandbox, destroySandbox, pollSandboxReady]
    depends_on: [schema-pipeline, supabase-mgmt]
    consumed_by: [api-generate]

  schema-pipeline:
    path: capabilities/schema-pipeline/
    purpose: "SchemaContract -> SQL migration, TypeScript types, seed data"
    exports: [extractSchemaContract, contractToSql, contractToTypes]
    depends_on: [local-validation]
    consumed_by: [api-generate, sandbox-lifecycle]

routes:
  - path: routes/api-generate/
    method: POST
    auth: required
    streams: true (SSE)
```

### `MODULE.md` — The Local Manifest

Every capability directory has one. Agent's **second read**. Answers: "Which file do I open?"

```markdown
# sandbox-lifecycle

## Purpose
Creates, polls, and destroys Daytona sandboxes for generated apps.

## Files
| File | Function | Lines |
|------|----------|-------|
| create-sandbox.ts | createSandbox(config) -> SandboxResult | 85 |
| destroy-sandbox.ts | destroySandbox(id) -> void | 35 |
| poll-sandbox-ready.ts | pollSandboxReady(id, opts) -> SandboxResult | 62 |
| contract.ts | SandboxConfig, SandboxResult types | 28 |

## Dependencies
- `daytona-sdk` (external)
- `schema-pipeline/contract.ts` — SchemaContract type

## Error Modes
- DaytonaTimeoutError: sandbox not ready within polling window
- SnapshotNotFoundError: DAYTONA_SNAPSHOT_ID invalid

## Gotchas
- d.list() returns lightweight objects — MUST use d.get(id) for executeCommand()
- Signed preview URLs expire in 1 hour
- Polling window is 20s (10x2s) — shorter causes duplicate sandbox creation

## Quick Verification
  pnpm test capabilities/sandbox-lifecycle/

## Recent Changes
- 2026-02-10: Increased polling window from 8s to 20s
```

### Agent navigation flow

```
Task: "Fix the sandbox polling timeout"
1. Read CODEBASE.yaml -> find "sandbox-lifecycle" module
2. Read capabilities/sandbox-lifecycle/MODULE.md -> see poll-sandbox-ready.ts
3. Read poll-sandbox-ready.ts -> make the fix
4. Read poll-sandbox-ready.test.ts -> update test
Total files read: 4. Irrelevant tokens: ~0.
```

---

## Principle 3: Naming Conventions — Grep-Optimized

Every name should return exactly one result when grepped. Agents find code by searching — names are search queries.

### File naming

```
# Bad (human-optimized)
lib/sandbox.ts
components/Preview.tsx

# Good (agent-optimized)
capabilities/sandbox-lifecycle/create-sandbox-from-snapshot.ts
routes/api-generate/handle-generation-sse-stream.ts
```

File name = verb-noun phrase describing the single thing the file does.

### Function naming

```typescript
// Bad — collides with dozens of results
export function create(config: Config) { ... }

// Good — globally unique, one grep result
export function createDaytonaSandboxFromSnapshot(config: SandboxConfig) { ... }
```

### Error naming

```typescript
// Bad
throw new Error("timeout")

// Good — greppable, unique, diagnostic
throw new DaytonaSandboxPollingTimeoutError(
  `Sandbox ${sandboxId} not ready after ${pollingWindowMs}ms (${attempts} attempts)`
)
```

### The litmus test

| Grep result count | Verdict |
|-------------------|---------|
| 1 | Perfect |
| 2-3 | Acceptable (definition + call sites) |
| 10+ | Too generic — rename |

---

## Principle 4: Self-Containment — Anti-DRY at Boundaries

Within a module, DRY is fine. Across modules, **duplication is preferred over coupling**.

### Duplicate across modules

```typescript
// Each module defines what it needs in its own contract.ts
// capabilities/sandbox-lifecycle/contract.ts
export type SandboxConfig = {
  snapshotId: string
  projectId: string
  labels: Record<string, string>
}
```

### Share via import (exceptions)

| Duplicate Across Modules | Share Via Import |
|-------------------------|------------------|
| Type definitions | External SDK clients |
| Constants (timeouts) | Database connection setup |
| Small utilities (<10 lines) | Auth middleware |
| Error class definitions | Logging infrastructure |

### Why

**Coupling tax** (shared types): Agent reads 400-line types.ts, parallel agents conflict on types.ts.

**Copy tax** (duplicated types): Slightly more total lines, but zero irrelevant reads.

For agents, **tokens read per task** > **total lines in codebase**.

---

## Principle 5: Code Style — Flat, Explicit, No Magic

### No clever abstractions

```typescript
// Bad: agent must read withAuth, withRateLimit, withLogging
export const POST = withAuth(withRateLimit(withLogging(handler)))

// Good: inline, flat, obvious
export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session) return new Response("Unauthorized", { status: 401 })

  const rateLimitResult = await checkRateLimit(session.userId, "generate", 10)
  if (!rateLimitResult.allowed) return new Response("Rate limited", { status: 429 })

  logApiCall("POST /api/generate", session.userId)
  // ... handler logic
}
```

### No magic registries

```typescript
// Bad: auto-discover features from filesystem
const features = await discoverFeatures("./features/")

// Good: explicit, greppable
import { applyAuthFeature } from "./features/apply-auth-feature"
import { applyCrudFeature } from "./features/apply-crud-feature"

const featureAppliers = { auth: applyAuthFeature, crud: applyCrudFeature } as const
```

### No deep inheritance

```typescript
// Bad: agent must read 4 files
class SandboxManager extends BaseManager<Sandbox> { ... }

// Good: standalone function, self-contained
export async function createDaytonaSandbox(config: SandboxConfig): Promise<SandboxResult> {
  // Everything visible right here. 80 lines.
}
```

### Prefer explicit control flow

```typescript
// Bad
const url = preview?.url ?? (await getSignedUrl(id)) || fallbackUrl

// Good
let url: string
if (preview?.url) {
  url = preview.url
} else {
  const signedUrl = await getDaytonaSignedPreviewUrl(sandboxId)
  url = signedUrl ? signedUrl : fallbackUrl
}
```

### The guiding question

> "Can an agent understand this function by reading only this file, top to bottom, once?"

---

## Principle 6: CLAUDE.md as Agent Runbook

CLAUDE.md is a **runbook**, not a README. It tells agents how to execute tasks, not what the project is.

### Structure

```markdown
# Project: my-app

## Task Execution Protocol
1. Read CODEBASE.yaml to find the relevant module
2. Read that module's MODULE.md to find the right file
3. Read the file + its co-located test
4. Make the change
5. Run the test: pnpm test <path-to-test>
6. Update MODULE.md if you changed exports, deps, or error modes

## Module Structure
capabilities/<name>/ contains:
- MODULE.md — read FIRST
- contract.ts — ONLY file other modules import
- <function-name>.ts — one function per file
- <function-name>.test.ts — co-located test

## Naming Rules
- Files: verb-noun kebab-case matching exported function
- Functions: camelCase, globally unique, domain-qualified
- Types: PascalCase, domain-qualified

## When Modifying Code
- NEVER import from another module's internal files — only contract.ts
- ALWAYS run co-located test after changes
- ALWAYS update MODULE.md when changing exports, deps, error modes
- Inline types used in only ONE file — not in contract.ts

## Gotchas
[Project-specific landmines that agents must know]
```

---

## Principle 7: Testing — Co-located, Behavior-Only

### Co-location

```
capabilities/sandbox-lifecycle/
  create-sandbox.ts           # Implementation
  create-sandbox.test.ts      # Test — RIGHT HERE
```

### Behavior, not implementation

```typescript
// Bad — tests implementation details
it("calls daytona.create with snapshotId", () => {
  expect(mockDaytona.create).toHaveBeenCalledWith({ snapshot: "snap-123" })
})

// Good — tests observable behavior
it("returns sandbox with valid preview URL", async () => {
  const result = await createDaytonaSandbox({ snapshotId: "snap-123", projectId: "proj-456" })
  expect(result.sandboxId).toBeTruthy()
  expect(result.previewUrl).toMatch(/^https:\/\//)
})
```

### Contract compatibility tests

```typescript
// contract.compat.test.ts — type-level check that contracts stay compatible
import type { SchemaContract } from "../schema-pipeline/contract"
it("SandboxConfig is compatible with SchemaContract consumers", () => {
  const contract: SchemaContract = createTestSchemaContract()
  const config: SandboxConfig = { contract, snapshotId: "x", projectId: "y" }
  expect(config).toBeDefined()
})
```

---

## Principle 8: Parallel Agent Safety

Module boundaries ARE the concurrency primitive.

### One function per file = no file conflicts

```
Agent A modifies: capabilities/sandbox-lifecycle/create-sandbox.ts
Agent B modifies: capabilities/sandbox-lifecycle/poll-sandbox-ready.ts
Zero overlap. Zero conflicts.
```

### Rules

1. One function per file — two agents rarely touch the same file
2. `contract.ts` is append-only — add new exports, never modify existing
3. `MODULE.md` is append-only — add rows, update own entries
4. `CODEBASE.yaml` changes require the lead agent only

### Cross-module changes

```markdown
If your change modifies a contract.ts that other modules import:
1. Grep for all importers: Grep("from.*<module>/contract")
2. Update all importing modules in the same commit
3. Run tests for ALL affected modules
```

### Git worktrees map to modules

```bash
git worktree add .worktrees/sandbox-create -b fix/sandbox-retry
git worktree add .worktrees/sandbox-poll -b fix/poll-timeout
# Merges are trivially clean — files don't overlap
```

---

## Automation

Every rule is enforceable by a hook, script, or agent instruction — never by human discipline.

### Layer 1: Git Hooks (Pre-commit)

```bash
# Validate:
# - No file in capabilities/ exceeds 150 lines
# - Every capabilities/ directory has MODULE.md
# - No cross-module imports except from contract.ts
```

### Layer 2: Golden Types + Sync Script

```
shared/golden-types/              # Single source of truth
  sandbox-types.golden.ts         # Canonical type definitions

capabilities/sandbox-lifecycle/
  contract.ts                     # Contains COPY with @synced-from annotation
```

Each copied type has a stamp:

```typescript
/**
 * @synced-from shared/golden-types/sandbox-types.golden.ts
 * @synced-at 2026-02-14T10:30:00Z
 * @checksum abc123
 */
export type SandboxConfig = { ... }
```

Sync script (`pnpm sync-types`):
1. Reads all `*.golden.ts` files
2. Finds `contract.ts` files with `@synced-from` annotations
3. Compares checksums, overwrites drifted copies
4. Deterministic script, not LLM — copies bytes

### Layer 3: Claude Code Hooks

Post-edit hook validates MODULE.md accuracy. CLAUDE.md instructs agents to:
1. Run `pnpm validate-module capabilities/<name>/` after changes
2. Update MODULE.md if stale
3. Run `pnpm sync-types` if contract.ts changed

### Layer 4: CI Pipeline

```yaml
steps:
  - validate-module-structure    # MODULE.md exists, file table accurate
  - check-import-boundaries      # No cross-module imports except contract.ts
  - check-type-sync              # @synced-from types match golden source
  - validate-codebase-yaml       # All modules listed, paths exist
  - check-naming-conventions     # File names match exported function names
```

### Layer 5: The `shared/` Exception

Truly shared infrastructure follows DRY:

```
shared/
  golden-types/           # Canonical type definitions
  database-connection.ts  # Imported directly (no duplication)
  auth-middleware.ts
  logging.ts
  MODULE.md
```

Rules for shared/:
- Files change rarely (infrastructure, not business logic)
- Changes trigger ALL module tests
- Keep small (~10 files max)

### Automation summary

| What | How | When |
|------|-----|------|
| File size limits | Pre-commit hook | Every commit |
| MODULE.md exists | Pre-commit hook | Every commit |
| Import boundaries | Pre-commit hook + CI | Every commit + PR |
| Type sync | Sync script + CI | On demand + PR |
| MODULE.md accuracy | Post-edit hook + CI | After edit + PR |
| CODEBASE.yaml accuracy | CI | Every PR |
| Naming conventions | CI | Every PR |

---

## When to Break These Rules

- **Tiny projects (<500 lines)**: One flat directory is fine. MODULE.md overhead isn't worth it until 3+ modules.
- **Shared infrastructure** (DB, auth, logging): Lives in `shared/`, follows normal DRY.
- **Performance-critical hot paths**: If inlining causes bugs (e.g., security check duplication), keep the shared abstraction.

---

## Summary

The agent-first codebase is optimized for a world where humans rarely read the code. Every convention serves one goal: **an agent completes any task by reading 1-3 small, self-contained files, guided by machine-readable manifests, with zero coordination overhead for parallel work.**

The architecture maintains itself through hooks, scripts, and CI — not human discipline.
