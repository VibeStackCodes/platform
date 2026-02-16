# App Wiring Design: Deterministic Blueprint + tRPC + XState

**Date:** 2026-02-16
**Status:** Approved
**Problem:** 20+ bugs in first successful generation run (MarkNest) — all traced to lack of a file-tree contract and LLMs making structural decisions they shouldn't.

## Problem Analysis

The current pipeline has 3 missing abstractions:

1. **No AppBlueprint (file tree contract)** — `SchemaContract` defines data (tables, columns, FKs) but nothing defines the app topology (files, imports, providers, routes). Agents guess file paths, import paths, and what hooks exist.
2. **No scaffold layer** — Snapshot has warmup `App.tsx`, no `.gitignore`, no `vercel.json`, no `git init`, no Tailwind theme, no shadcn/ui components. These are 100% deterministic files.
3. **No dependency-ordered file writing** — Frontend agents write route files importing hooks that backend agents haven't written yet. No validation that "if file A imports from file B, file B exists."

Bug classification from MarkNest report:
- 8/20 = scaffold issues (missing static files)
- 7/20 = deterministic generation bugs (wrong imports, missing hooks, broken wiring)
- 5/20 = LLM content bugs (component behavior, missing labels)

## Design Decisions

### D1: Switch generated apps to tRPC + Drizzle

**Rationale:** app.build (Neon) proved 86.7% viability with this stack across 3000+ apps. The key insight: tRPC provides compile-time type safety between server routers and client calls. `trpc.bookmark.list.useQuery()` is verified by TypeScript — if the router doesn't have `bookmark.list`, `tsc` fails. This eliminates the entire class of "missing hook" and "wrong import path" bugs.

**What changes:**
- Generated apps get a Hono + tRPC server (not just static SPA)
- Drizzle ORM replaces raw SQL for schema definition
- tRPC client replaces Supabase JS `.from()` calls
- Supabase remains for: Auth, database hosting, realtime (optional)
- Deploy: Vercel serverless functions (not just static)

**Reference:** [app.build paper (SANER 2026)](https://arxiv.org/html/2509.03310), [Design decisions blog](https://neon.com/blog/design-decisions-behind-app-build)

### D2: XState for pipeline orchestration

**Rationale:** XState provides formal state machines with explicit states, transitions, guards, parallel regions, and built-in persistence. Mastra's `createWorkflow` is a DAG pipeline without formal state semantics — error recovery, retry guards, and human-in-the-loop are bolted on. XState models these natively.

**What changes:**
- `appGenerationWorkflow` (Mastra) → `appGenerationMachine` (XState)
- Mastra agents invoked as XState `fromPromise` actors
- Machine state persisted via `getPersistedSnapshot()` → `projects` table
- Human-in-the-loop (clarification questions) = proper `awaitingClarification` state

### D3: AppBlueprint for scaffold + UI specs

**Rationale:** tRPC handles type safety for data flow (server ↔ client). AppBlueprint handles everything TypeScript can't verify: scaffold files, route structure, page component specs, nav links, provider wrapping order, Tailwind theme, shadcn/ui component selection.

**What it contains:**
- `meta`: appName, description, designPreferences
- `features`: auth (inferred from user_id FK), entities (from tables)
- `scaffold`: all static files (.gitignore, vercel.json, etc.)
- `drizzleSchema`: deterministic from SchemaContract
- `trpcRouters`: deterministic CRUD + slots for custom procedures
- `routes`: deterministic from features
- `pageSkeletons`: deterministic imports/hooks + slots for JSX bodies
- `componentSpecs`: behavioral requirements for LLM to follow

### D4: Skeleton files with LLM slots

**Rationale:** Instead of LLMs deciding file structure, imports, and exports (which they get wrong ~35% of the time per our bug report), the blueprint generates complete file skeletons with all deterministic parts pre-written. LLMs only fill marked `{/* SLOT */}` sections.

**Skeleton anatomy:**
```
[deterministic imports — all verified to exist]
[deterministic route/component definition]
[deterministic hook calls — tRPC queries pre-wired]
[deterministic state declarations — from componentSpec]
{/* SLOT: LLM writes JSX body here */}
```

### D5: Agent roster reduction (9 → 3 + 1)

**Rationale:** app.build's paper proved "improving the environment matters more than scaling the model." By making 80% of the pipeline deterministic, we eliminate 6 agents.

| Old Agent | New Status | Replacement |
|-----------|-----------|-------------|
| Supervisor/PM | REMOVED | XState machine |
| Analyst | KEPT | 1 LLM call — extracts SchemaContract |
| DBA | REMOVED | `contractToDrizzleSchema()` — deterministic |
| Infra | REMOVED | Deterministic API calls (sandbox + supabase + github) |
| Backend | KEPT (scoped down) | Fills custom procedure slots (search, joins, business logic) |
| Frontend | KEPT | Fills JSX body slots in page skeletons |
| Reviewer | REMOVED | tsc + custom linter rules + manifest check |
| QA | REMOVED | `tsc --noEmit` + `bun run build` — deterministic |
| DevOps | REMOVED | Deterministic git + push + Vercel deploy |
| Repair Agent | NEW (conditional) | Fixes validation failures with targeted context |

**LLM calls per generation:** ~6-13 (down from ~30-50)

### D6: Iterative repair with structured feedback

**Rationale:** app.build's paper shows repair loops with specific error context work. Max 2 retries. Repair agent receives: the exact failing file, the exact error message, and the skeleton it should conform to.

## Architecture

### Pipeline (XState FSM)

```
IDLE
  ↓ START
ANALYZING (1 LLM — analyst agent)
  ↓ ANALYST_DONE / → AWAITING_CLARIFICATION → USER_ANSWERED → ANALYZING
BLUEPRINTING (0 LLM — contractToBlueprint)
  ↓ BLUEPRINT_DONE
PROVISIONING (parallel, 0 LLM)
  ├── SCAFFOLD: write layers 0-2 to sandbox
  └── INFRA: create sandbox + supabase + github
  ↓ onDone (both complete)
GENERATING (N LLM — backend + frontend actors in parallel)
  ↓ CODEGEN_DONE
VALIDATING (0 LLM — tsc + lint + build + manifest check)
  ↓ VALIDATION_PASS → DEPLOYING
  ↓ VALIDATION_FAIL + canRetry → REPAIRING (1 LLM, max 2×) → VALIDATING
  ↓ VALIDATION_FAIL + !canRetry → FAILED
DEPLOYING (0 LLM — git + push + vercel)
  ↓ DEPLOY_DONE
COMPLETE
```

### Generated App Structure

```
src/                        # Frontend (Vite + React SPA)
  routes/                   # TanStack Router file-based routes
  components/               # React components
    ui/                     # shadcn/ui (pre-vendored in snapshot)
  lib/
    trpc.ts                # tRPC client (in snapshot)
    auth.ts                # Supabase Auth client (in snapshot)
    utils.ts               # cn() helper (in snapshot)
  main.tsx                 # Generated: providers + router
  index.css                # Generated: Tailwind theme from designPreferences
server/                     # Backend (Hono + tRPC)
  index.ts                 # Hono entry + tRPC adapter (in snapshot)
  trpc/
    router.ts              # Generated: merges all entity routers
    context.ts             # tRPC context (in snapshot)
    trpc.ts                # tRPC init + procedures (in snapshot)
    routers/
      bookmark.ts          # Generated: CRUD deterministic + custom slots
      tag.ts
  db/
    schema.ts              # Generated: Drizzle schema from contract
    client.ts              # Drizzle client (in snapshot)
drizzle/
  0001_initial.sql         # Generated: from drizzle-kit
vite.config.ts             # In snapshot
drizzle.config.ts          # In snapshot
vercel.json                # In snapshot
.gitignore                 # In snapshot
package.json               # In snapshot
tsconfig.json              # In snapshot
```

### File Layer System

| Layer | Contents | Generated By | Parallelizable |
|-------|----------|-------------|----------------|
| 0 | Snapshot files (.gitignore, vercel.json, shadcn/ui, configs) | Snapshot (baked) | N/A |
| 1 | index.html, index.css, Drizzle schema | Blueprint (deterministic) | Yes (all independent) |
| 2 | tRPC routers, root router, .env, SQL migration | Blueprint (deterministic) | Yes (all independent) |
| 3 | Root route, auth guard route | Blueprint (deterministic) | Yes |
| 4 | Page routes, custom components | **LLM** (frontend actors fill slots) | Yes (per page) |
| 4 | Custom tRPC procedures | **LLM** (backend actors fill slots) | Yes (per entity) |
| 5 | main.tsx, app-layout.tsx | Blueprint (deterministic, depends on routes) | Sequential after layer 4 |

### Validation Gate

Runs after CODEGEN, before DEPLOY:

1. **Manifest check** — every file in blueprint.fileTree exists in sandbox
2. **Scaffold check** — no warmup/placeholder strings in generated files (AB-02 from paper)
3. **TypeScript** — `tsc --noEmit` (catches import errors, type mismatches)
4. **Lint** — `biome check --write` + custom LLM-failure rules:
   - No `require()` in ESM files
   - No hardcoded localhost/placeholder URLs
   - No TODO/FIXME/placeholder comments
   - All tRPC procedures have input validation
5. **Build** — `bun run build` (catches runtime bundling issues)
6. **Boot test** — start dev server, verify it responds on / (AB-01 from paper)

### XState + Mastra Integration

```typescript
// XState actors invoke Mastra agents via fromPromise
function mastraActor(agentFn, buildPrompt) {
  return fromPromise(async ({ input }) => {
    const agent = await agentFn()
    return agent.generate(buildPrompt(input), { maxSteps: 25 })
  })
}

// State persistence for long-running workflows
const snapshot = getPersistedSnapshot(actor)
await db.update(projects).set({ machineState: snapshot }).where(eq(projects.id, id))

// Resume on user input
const actor = createActor(machine, { snapshot: savedSnapshot })
actor.start()
actor.send({ type: 'USER_ANSWERED', answers })
```

## Snapshot Contents (Never Regenerated)

Baked into Daytona snapshot Docker image:

- `node_modules/` — all deps (tRPC, Drizzle, React, Hono, shadcn peer deps, TanStack Router)
- `src/components/ui/` — all shadcn/ui components
- `src/lib/trpc.ts` — tRPC client setup
- `src/lib/auth.ts` — Supabase Auth client
- `src/lib/utils.ts` — cn() helper
- `server/index.ts` — Hono entry + tRPC adapter
- `server/trpc/context.ts` — tRPC context (auth + db)
- `server/trpc/trpc.ts` — tRPC init, publicProcedure, protectedProcedure
- `server/db/client.ts` — Drizzle client
- `vite.config.ts`, `tsconfig.json`, `tsconfig.server.json`
- `drizzle.config.ts`, `biome.json`
- `.gitignore`, `vercel.json`, `package.json`
- `.git/` — git init already done
- `.vite/` — Vite dep pre-bundle cache
- `tsbuildinfo` — TypeScript incremental build cache

## app.build Patterns Adopted

| Pattern | Adoption |
|---------|----------|
| Actor isolation (file ownership) | Yes — blueprint assigns files to actors |
| Iterative repair with structured feedback | Yes — max 2 retries with specific error context |
| Restricted file paths | Yes — actors can only write to assigned skeleton files |
| Custom linter rules for LLM failures | Yes — require(), placeholders, hardcoded URLs |
| Validation at every step | Yes — tsc + lint + build + manifest + boot |
| Parallel actors | Yes — frontend actors (1/page) + backend actors (1/entity) |
| Serialized FSM state | Yes — XState getPersistedSnapshot() |
| tRPC + Drizzle stack | Yes — end-to-end type safety |
| Template/scaffold detection (AB-02) | Yes — manifest check for placeholder strings |
| Scope limitation (CRUD focus) | Yes — don't try to be general-purpose |
| Error analysis feedback loop | Planned (phase 2) — log failures, analyze patterns |

## Key Metrics (Expected)

| Metric | Current | Target |
|--------|---------|--------|
| LLM calls per generation | ~30-50 | ~6-13 |
| Structural bugs (wrong imports, missing files) | 15/20 | 0 (deterministic) |
| Content bugs (bad JSX, wrong behavior) | 5/20 | ~2-3 (LLM scope reduced) |
| Generation latency | ~10-12 min | ~5-7 min (fewer LLM calls) |
| Token cost per app | ~$3-5 | ~$1-2 |

## New Files to Create

1. `server/lib/app-blueprint.ts` — AppBlueprint type + `contractToBlueprint()`
2. `server/lib/contract-to-drizzle.ts` — SchemaContract → Drizzle schema string
3. `server/lib/contract-to-trpc.ts` — SchemaContract → tRPC router skeletons with CRUD + slots
4. `server/lib/contract-to-pages.ts` — SchemaContract → page skeletons with JSX slots
5. `server/lib/blueprint-to-sandbox.ts` — writes all blueprint files to sandbox
6. `server/lib/agents/machine.ts` — XState state machine definition
7. `server/lib/agents/validation.ts` — validation gate (tsc + lint + build + manifest + boot)
8. `server/lib/agents/repair.ts` — repair agent prompt builder
9. `snapshot/Dockerfile` — updated snapshot with tRPC + Drizzle + shadcn/ui baked in
10. `snapshot/warmup-scaffold/` — updated warmup with tRPC app structure

## Files to Modify

1. `server/lib/agents/registry.ts` — remove 6 agents, add repair agent, update backend/frontend agents
2. `server/lib/agents/workflows.ts` — remove all Mastra workflow definitions (replaced by XState)
3. `server/routes/agent.ts` — use XState actor instead of Mastra workflow
4. `server/lib/schema-contract.ts` — add feature inference (auth detection from user_id FK)
5. `snapshot/package-base.json` — add tRPC, Drizzle, Hono deps

## Files to Delete

1. `server/lib/contract-to-hooks.ts` — tRPC replaces hooks
2. `server/lib/contract-to-routes.ts` — blueprint generates route skeletons directly
3. `server/lib/contract-to-types.ts` — Drizzle infers types from schema

## Non-Goals (Explicitly Out of Scope)

- Realtime features (WebSocket/Supabase Realtime) — phase 2
- File upload / storage — phase 2
- Multi-tenant / team-based auth — phase 2
- Custom domain setup — phase 2
- E2E test generation (paper proved E2E tests hurt viability by +16.7pp false rejections)

## References

- [app.build paper (SANER 2026)](https://arxiv.org/html/2509.03310) — environment scaffolding framework
- [app.build design decisions](https://neon.com/blog/design-decisions-behind-app-build) — FSM actors, validation pipeline
- [app.build open source agent](https://github.com/neondatabase/appdotbuild-agent) — reference implementation
- [XState v5 docs](https://stately.ai/docs/xstate) — state machine library
- [tRPC docs](https://trpc.io/docs) — end-to-end type-safe APIs
- [Drizzle ORM docs](https://orm.drizzle.team/docs/overview) — TypeScript SQL toolkit
