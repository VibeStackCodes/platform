# Design: @snaplet/seed + Supabase Platform Kit Database Tab

## Context

Generated apps have empty databases. Users need:
1. Realistic seed data populated automatically after generation
2. An embedded database browser (table view, record editing) — not just a link to Supabase Studio

## Feature 1: Replace FakerJS seed generator with @snaplet/seed

### Current state
- `lib/seed-generator.ts` uses hand-rolled FakerJS heuristics (column name → faker method)
- Generates INSERT statements baked into migration SQL via `contractToSQL()`
- Fragile: doesn't understand FK relationships, constraints, or enums

### Proposed
- After `runMigration()` pushes DDL to remote Supabase project, run `@snaplet/seed` against the remote DB
- `@snaplet/seed` introspects the actual schema, generates relationship-aware seed data
- Connection string built from `dbHost` + `dbPassword` already returned by `createSupabaseProject()`

### Flow change in generate/route.ts
```
Before:  contractToSQL() embeds INSERT seed rows → runMigration() pushes everything
After:   contractToSQL() generates DDL only → runMigration() pushes DDL → @snaplet/seed populates data
```

### Why better
- Introspects actual remote schema (FK relationships, constraints, enums)
- Handles relationship graphs automatically (parent rows before children)
- No manual column-name heuristics needed

### What gets removed
- `lib/seed-generator.ts` — replaced entirely
- Seed INSERT generation in `lib/contract-to-sql.ts`
- `@faker-js/faker` dependency

## Feature 2: Embedded Database Tab (Supabase Platform Kit)

### Current state
- Database tab in `builder-preview.tsx` shows a link to external Supabase Studio
- Users leave the app to manage their database

### Proposed
- Cherry-pick the database component from Supabase Platform Kit
- Embed table browser + record editor directly in the Database tab
- Skip SQL editor (Monaco), auth, storage, logs, secrets components

### Components to cherry-pick
```
components/supabase-manager/database.tsx    — table browser + record editor
components/results-table.tsx                — query results display
components/dynamic-form.tsx                 — row edit form
hooks/use-tables.ts                         — fetches table list via Management API
hooks/use-run-query.ts                      — executes SQL queries
lib/pg-meta/index.ts + sql.ts + types.ts    — SQL introspection queries
lib/management-api.ts                       — typed API client (openapi-fetch)
lib/management-api-schema.d.ts              — OpenAPI types for Management API
contexts/SheetNavigationContext.tsx          — sheet navigation for row editing
app/api/supabase-proxy/[...path]/route.ts   — proxy route (keeps SUPABASE_ACCESS_TOKEN server-side)
```

### New dependencies
- `openapi-fetch` — typed fetch client for Management API
- `common-tags` — SQL template literals (used by pg-meta)
- `@tanstack/react-query` — data fetching + caching
- `@tanstack/react-table` — table rendering

### NOT included (intentionally)
- `@monaco-editor/react` — no SQL editor (users have OpenVSCode)
- `sql-editor.tsx` — skipped
- `supabase-manager/auth.tsx` — not needed
- `supabase-manager/storage.tsx` — not needed
- `supabase-manager/logs.tsx` — not needed
- `supabase-manager/secrets.tsx` — not needed
- `supabase-manager/suggestions.tsx` — not needed (AI SQL generation)

### Integration point
`builder-preview.tsx` Database tab: replace the "Open Supabase Studio" link with inline `DatabaseManager` component, passing `projectRef={supabaseProjectId}`.

### API proxy route
Server-side route at `app/api/supabase-proxy/[...path]/route.ts` that:
- Authenticates the user (Supabase auth)
- Verifies the user owns the project being queried
- Forwards requests to `https://api.supabase.com/v1/...` with `SUPABASE_ACCESS_TOKEN`
- Never exposes the Management API token to the client

## Architecture

```
User clicks Database tab
  → DatabaseManager component loads
  → useListTables(projectRef) calls /api/supabase-proxy/v1/projects/{ref}/database/query
  → Proxy route authenticates user, verifies project ownership
  → Forwards to Supabase Management API
  → Returns table list with columns
  → User clicks table → fetches rows via same proxy
  → User edits row → UPDATE via same proxy
```

## PGlite stays unchanged
PGlite validates migration SQL during generation (build-time safety net).
Platform Kit is the user-facing UI for browsing/editing data post-generation.
They are complementary, not replacements.
