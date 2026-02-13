# Contract-First Pipeline Design

**Date:** 2026-02-13
**Status:** Approved
**Goal:** Make every pipeline step deterministic. Eliminate LLM fix loops. Maximize parallelism.

## Problem

The generation pipeline fails on:
1. SQL migrations with wrong FK ordering, duplicate columns — patched by an LLM fix loop (up to 5 retries)
2. TypeScript files that don't type-check — patched by build verifier LLM fix loop (up to 5 retries)
3. These fix loops introduce new errors, creating a cascade

Root cause: templates independently produce SQL and TypeScript that can disagree.

## Solution: Schema-as-Source-of-Truth

Templates produce a structured `SchemaContract` object instead of raw SQL or TS. Two deterministic functions derive both SQL and TypeScript types from the contract. If the contract is valid, everything derived from it is valid.

```
Template → SchemaContract (typed JSON)
             ↓ deterministic
             ├── contractToSQL()  → migration.sql (topologically sorted)
             └── contractToTypes() → database.types.ts
             ↓ then
             → Feature code imports database.types.ts (can't have type errors)
```

### SchemaContract Type

```typescript
interface SchemaContract {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: SQLType;
      nullable?: boolean;
      default?: string;
      primaryKey?: boolean;
      unique?: boolean;
      references?: { table: string; column: string };
    }>;
    rlsPolicies?: Array<{
      name: string;
      operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
      using?: string;
      withCheck?: string;
    }>;
  }>;
  enums?: Array<{ name: string; values: string[] }>;
  seedData?: Array<{ table: string; rows: Record<string, unknown>[] }>;
}
```

### contractToSQL()

1. Build dependency graph from FK references
2. Topological sort tables (error if cycle detected)
3. Emit CREATE TYPE for enums
4. Emit CREATE TABLE in sorted order
5. Emit ALTER TABLE for RLS policies
6. Emit INSERT for seed data

Deterministic — same input always produces same output, with correct FK ordering by construction.

### contractToTypes()

Generate Supabase-compatible `Database` type:

```typescript
export type Database = {
  public: {
    Tables: {
      [tableName]: {
        Row: { ... };
        Insert: { ... };
        Update: { ... };
      };
    };
    Enums: { ... };
  };
};
```

## Pipeline DAG

Replace the imperative `route.ts` with a typed DAG of stages:

```
Stage 1a: provision (sandbox)    Stage 1b: supabase_project
       │                                │
       ▼                                │
Stage 2: scaffold                       │
  (templates → SchemaContract           │
   + scaffold files)                    │
       │                                │
       ├──────────────┐                 │
       ▼              ▼                 │
Stage 3a: derive    Stage 3b: features  │
  (contract → SQL     (write TS files   │
   + types.ts)         to sandbox)      │
       │                   │            │
       ▼                   │            │
Stage 3c: validate         │            │
  (PGlite one-shot)        │            │
       │                   │            │
       ▼                   ▼            │
Stage 4: type-check + live-fix         │
       │                                │
       ▼                                ▼
Stage 5: deploy (parallel)
  ├── apply migration to Supabase (needs 1b + 3c)
  ├── push to GitHub
  └── emit preview URL
       │
       ▼
Stage 6: complete
```

### DAG Runner (~50 lines)

```typescript
type Stage = {
  name: string;
  deps: string[];
  run: (ctx: PipelineContext) => Promise<void>;
};

async function runDAG(stages: Stage[], ctx: PipelineContext) {
  const completed = new Set<string>();
  const running = new Map<string, Promise<void>>();

  while (completed.size < stages.length) {
    const ready = stages.filter(s =>
      !completed.has(s.name) &&
      !running.has(s.name) &&
      s.deps.every(d => completed.has(d))
    );
    for (const stage of ready) {
      running.set(stage.name, stage.run(ctx).then(() => {
        completed.add(stage.name);
        running.delete(stage.name);
      }));
    }
    await Promise.race(running.values());
  }
}
```

## Error Handling

| Error Source | Today | With Contract-First |
|---|---|---|
| SQL FK ordering | LLM fix loop (5 retries) | **Impossible** — topological sort |
| SQL duplicate columns | LLM fix loop | **Impossible** — contract deduplicates |
| TS type errors (wrong DB types) | Build verifier LLM fix | **Eliminated** — types from contract |
| TS import errors | Build verifier LLM fix | **Reduced** — known-good imports |
| TS logic errors (template bugs) | Build verifier LLM fix | **Still possible** — safety net |

- **PGlite validation**: One-shot assertion, not retry loop. Failure = bug in `contractToSQL()`.
- **Build verifier**: Reduced to 2 retries as safety net only.
- **Live fixer**: Unchanged, safety net for HMR errors.

## Files

### New

| File | Purpose |
|---|---|
| `lib/schema-contract.ts` | `SchemaContract` type + validation |
| `lib/contract-to-sql.ts` | Deterministic SQL from contract (topological sort) |
| `lib/contract-to-types.ts` | Deterministic TypeScript types from contract |
| `lib/pipeline-dag.ts` | DAG runner + stage definitions |

### Modified

| File | Change |
|---|---|
| `lib/template-registry.ts` | Templates return `SchemaContract` fragments |
| `lib/template-pipeline.ts` | Collect contracts, derive SQL + types |
| `app/api/projects/generate/route.ts` | Replace imperative flow with DAG |
| `lib/local-supabase.ts` | Remove LLM fix loop, keep PGlite assertion |
| `lib/verifier.ts` | MAX_FIX_RETRIES 5 → 2 |

### Unchanged

- `lib/live-fixer.ts`, `lib/sandbox.ts`, `lib/supabase-mgmt.ts`, `lib/github.ts`

### Deleted code

- `fixMigrationSQL()` in `local-supabase.ts`
- Error history / retry loop in `applyLocalMigration()`
