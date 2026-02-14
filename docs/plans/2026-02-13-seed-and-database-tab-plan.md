# Seed Data + Database Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hand-rolled FakerJS seed generator with @snaplet/seed, and embed Supabase Platform Kit's database browser in the Database tab.

**Architecture:** After DDL migrations are pushed to the remote Supabase project via Management API, @snaplet/seed connects to the remote Postgres to introspect the schema and insert realistic seed data. The Database tab replaces the external Studio link with cherry-picked Platform Kit components (table browser + record editor) that talk to the Management API through a server-side proxy route.

**Tech Stack:** @snaplet/seed, Supabase Management API, openapi-fetch, @tanstack/react-query, @tanstack/react-table, common-tags

---

### Task 1: Install new dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Platform Kit dependencies + @snaplet/seed**

Run:
```bash
bun add openapi-fetch common-tags @tanstack/react-query @tanstack/react-table @snaplet/seed
bun add -d @types/common-tags
```

**Step 2: Remove @faker-js/faker**

Run:
```bash
bun remove @faker-js/faker
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: May have errors from seed-generator.ts imports — that's expected, we'll remove it next.

**Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: swap faker for snaplet/seed, add platform kit deps"
```

---

### Task 2: Remove FakerJS seed generator and clean up seed INSERT generation

**Files:**
- Delete: `lib/seed-generator.ts`
- Delete: `tests/seed-generator.test.ts`
- Modify: `lib/template-registry.ts:9,203,223,239` — remove `generateSeedData` imports and calls
- Modify: `lib/template-pipeline.ts:246,255,300` — remove `seedData` concatenation
- Modify: `lib/schema-contract.ts:42-50` — remove `SeedRow` type and `seedData` field from `SchemaFragment`
- Modify: `lib/contract-to-sql.ts` — remove any seed INSERT generation if present

**Step 1: Delete seed-generator files**

```bash
rm lib/seed-generator.ts tests/seed-generator.test.ts
```

**Step 2: Remove generateSeedData from template-registry.ts**

Remove the import on line 9:
```typescript
// DELETE: import { generateSeedData } from './seed-generator';
```

Remove `seedData` from all schema assignments (lines 203, 223, 239). Change from:
```typescript
schema = { tables: [tableDef], seedData: [generateSeedData(tableDef, 5, [])] };
```
To:
```typescript
schema = { tables: [tableDef] };
```

**Step 3: Remove seedData from template-pipeline.ts**

Remove the `seedData` array declaration (line 246), the push (line 255), and the spread into the final object (line 300). The `SchemaFragment` type will no longer have `seedData`.

**Step 4: Remove SeedRow from schema-contract.ts**

Delete the `SeedRow` interface (lines 42-48) and remove `seedData?: SeedRow[]` from `SchemaFragment` (line 50).

**Step 5: Verify build + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass (seed-generator tests gone, no more references to SeedRow)

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove FakerJS seed generator (replaced by @snaplet/seed)"
```

---

### Task 3: Add @snaplet/seed integration for remote DB seeding

**Files:**
- Create: `lib/seed-remote.ts`
- Create: `tests/seed-remote.test.ts`
- Modify: `app/api/projects/generate/route.ts:248-258` — add seed step after migration

**Step 1: Write lib/seed-remote.ts**

```typescript
/**
 * Remote Database Seeder
 *
 * Uses @snaplet/seed to introspect a remote Supabase Postgres schema
 * and populate it with realistic seed data.
 */

import type { SupabaseProject } from './types';

/**
 * Build a Postgres connection string from Supabase project credentials.
 */
export function buildConnectionString(project: SupabaseProject): string {
  // Supabase Postgres is at: postgresql://postgres:[password]@[host]:5432/postgres
  const host = project.dbHost;
  const password = encodeURIComponent(project.dbPassword);
  return `postgresql://postgres:${password}@${host}:5432/postgres`;
}

/**
 * Seed a remote Supabase database with realistic data using @snaplet/seed.
 *
 * @param project - Supabase project with DB credentials
 * @param tableNames - Tables to seed (from SchemaContract)
 * @param rowsPerTable - Number of rows per table (default 5)
 */
export async function seedRemoteDatabase(
  project: SupabaseProject,
  tableNames: string[],
  rowsPerTable: number = 5,
): Promise<{ tablesSeeded: number; rowsInserted: number }> {
  const connectionString = buildConnectionString(project);

  // Dynamic import to avoid bundling in client
  const { createSeedClient } = await import('@snaplet/seed');

  const seed = await createSeedClient({
    databaseUrl: connectionString,
  });

  let totalRows = 0;

  // Seed each table — @snaplet/seed handles FK ordering automatically
  for (const tableName of tableNames) {
    try {
      // @snaplet/seed uses the introspected schema to generate data
      // The client has methods named after tables
      const tableMethod = (seed as any)[tableName];
      if (typeof tableMethod === 'function') {
        await tableMethod((x: any) => x(rowsPerTable));
        totalRows += rowsPerTable;
      }
    } catch (error) {
      // Table might not be seedable (e.g., junction tables with unique constraints)
      console.warn(`[seed-remote] Skipped ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { tablesSeeded: tableNames.length, rowsInserted: totalRows };
}
```

**Step 2: Write test**

Create `tests/seed-remote.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildConnectionString } from '../lib/seed-remote';
import type { SupabaseProject } from '../lib/types';

describe('seed-remote', () => {
  describe('buildConnectionString', () => {
    it('builds a valid postgres connection string', () => {
      const project: SupabaseProject = {
        id: 'test-id',
        name: 'test',
        orgId: 'org-1',
        region: 'us-east-1',
        dbHost: 'db.test-id.supabase.co',
        dbPassword: 'my-pass!@#',
        anonKey: 'anon-key',
        serviceRoleKey: 'service-key',
        url: 'https://test-id.supabase.co',
      };
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:my-pass!%40%23@db.test-id.supabase.co:5432/postgres');
    });

    it('handles simple passwords', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.x.supabase.co', dbPassword: 'simple',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      expect(buildConnectionString(project)).toContain('simple@');
    });
  });
});
```

**Step 3: Run test**

Run: `npx vitest run tests/seed-remote.test.ts`
Expected: PASS

**Step 4: Wire into generate route**

In `app/api/projects/generate/route.ts`, after the migration block (line ~258), add:

```typescript
// Seed database with realistic data
emit({ type: "checkpoint", label: "Seeding database", status: "active" });
try {
  const { seedRemoteDatabase } = await import("@/lib/seed-remote");
  const tableNames = schemaContract
    ? schemaContract.tables.map(t => t.name)
    : [];
  if (tableNames.length > 0) {
    const seedResult = await seedRemoteDatabase(sp, tableNames);
    console.log(`[generate] Seeded ${seedResult.tablesSeeded} tables (${seedResult.rowsInserted} rows)`);
  }
} catch (seedError) {
  // Seeding is non-fatal — app works without seed data
  console.warn(`[generate] Seeding failed (non-fatal):`, seedError);
}
emit({ type: "checkpoint", label: "Seeding database", status: "complete" });
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/seed-remote.ts tests/seed-remote.test.ts app/api/projects/generate/route.ts
git commit -m "feat: seed remote DB with @snaplet/seed after migration"
```

---

### Task 4: Create Supabase Management API proxy route

**Files:**
- Create: `app/api/supabase-proxy/[...path]/route.ts`

**Step 1: Write the proxy route**

```typescript
/**
 * Supabase Management API Proxy
 *
 * Forwards requests to api.supabase.com/v1 with server-side auth token.
 * Authenticates the user and verifies project ownership before proxying.
 */

import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_API_BASE = 'https://api.supabase.com';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, await params, 'POST');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, await params, 'GET');
}

async function proxyRequest(
  req: NextRequest,
  { path }: { path: string[] },
  method: string,
) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Authenticate user
  const { createClient } = await import('@/lib/supabase-server');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Extract project ref from path (e.g., /v1/projects/{ref}/database/query)
  const fullPath = path.join('/');
  const projectRefMatch = fullPath.match(/projects\/([^/]+)/);
  if (projectRefMatch) {
    const projectRef = projectRefMatch[1];
    // Verify user owns this project
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('supabase_project_id', projectRef)
      .eq('user_id', user.id)
      .single();
    if (!project) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Forward to Supabase Management API
  const targetUrl = `${SUPABASE_API_BASE}/${fullPath}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };
  if (method === 'POST') {
    fetchOptions.body = await req.text();
  }

  const response = await fetch(targetUrl, fetchOptions);
  const data = await response.text();

  return new NextResponse(data, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add app/api/supabase-proxy/
git commit -m "feat: add supabase management API proxy route"
```

---

### Task 5: Cherry-pick Platform Kit database components

**Files:**
- Create: `lib/management-api.ts` — typed API client
- Create: `lib/management-api-schema.d.ts` — OpenAPI types (download from Supabase repo)
- Create: `lib/pg-meta/index.ts` — SQL introspection queries
- Create: `lib/pg-meta/sql.ts` — raw SQL for table/column listing
- Create: `lib/pg-meta/types.ts` — PG meta types
- Create: `components/supabase-manager/database.tsx` — table browser + record editor
- Create: `components/results-table.tsx` — query results table
- Create: `components/dynamic-form.tsx` — row edit form
- Create: `contexts/SheetNavigationContext.tsx` — sheet navigation

**Step 1: Download source files from Supabase repo**

Fetch each file from `https://raw.githubusercontent.com/supabase/supabase/master/apps/ui-library/registry/default/platform/platform-kit-nextjs/`. Adapt import paths from `@/registry/default/platform/platform-kit-nextjs/` to `@/` and from `@/registry/default/components/ui/` to `@/components/ui/`.

Key adaptations:
- `management-api.ts`: Change `baseUrl` to `/api/supabase-proxy`
- All UI imports: `@/registry/default/components/ui/X` → `@/components/ui/X`
- Hook imports: `@/registry/default/platform/platform-kit-nextjs/hooks/X` → `@/hooks/X` or inline

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS (may need to install missing shadcn components)

**Step 3: Commit**

```bash
git add lib/management-api.ts lib/management-api-schema.d.ts lib/pg-meta/ components/supabase-manager/ components/results-table.tsx components/dynamic-form.tsx contexts/
git commit -m "feat: cherry-pick Platform Kit database components"
```

---

### Task 6: Add QueryClientProvider to app layout

**Files:**
- Modify: `app/layout.tsx` or create `components/providers.tsx`

**Step 1: Create providers wrapper**

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

**Step 2: Wrap app layout with Providers**

In `app/layout.tsx`, wrap `{children}` with `<Providers>`.

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add components/providers.tsx app/layout.tsx
git commit -m "feat: add QueryClientProvider for react-query"
```

---

### Task 7: Wire DatabaseManager into the Database tab

**Files:**
- Modify: `components/builder-preview.tsx:119-146`
- Modify: `components/project-layout.tsx` — pass `supabaseProjectId` prop
- Modify: `app/project/[id]/page.tsx` — pass `supabaseProjectId` from DB

**Step 1: Add supabaseProjectId to ProjectLayout props**

In `project-layout.tsx`, add `initialSupabaseProjectId?: string` to `ProjectLayoutProps`. Track it with state + realtime subscription (same pattern as other fields).

**Step 2: Pass from page.tsx**

In `app/project/[id]/page.tsx`, add `initialSupabaseProjectId={project.supabase_project_id}` to `<ProjectLayout>`.

**Step 3: Replace Database tab content in builder-preview.tsx**

Replace lines 119-146 with:

```tsx
{/* Database Tab */}
<TabsContent value="database" className="h-[calc(100%-4rem)] p-0">
  {supabaseProjectId ? (
    <DatabaseManager projectRef={supabaseProjectId} />
  ) : (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="text-center">
        <p className="text-sm">Database will appear here once the project is generated</p>
      </div>
    </div>
  )}
</TabsContent>
```

Import `DatabaseManager` from `@/components/supabase-manager/database`.

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add components/builder-preview.tsx components/project-layout.tsx app/project/[id]/page.tsx
git commit -m "feat: embed Platform Kit database browser in Database tab"
```

---

### Task 8: Update tests

**Files:**
- Modify: `tests/contract-to-sql.test.ts` — remove seed-related assertions if any
- Modify: `tests/template-pipeline.test.ts` — remove seedData assertions
- Create: `tests/supabase-proxy.test.ts` — proxy route tests (optional, E2E covers this)

**Step 1: Clean up existing tests**

Remove any assertions about `seedData`, `SeedRow`, or `generateSeedInserts` from existing tests.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add tests/
git commit -m "test: update tests for seed/database tab changes"
```

---

### Task 9: Final verification

**Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 2: Full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 3: Build**

Run: `bun run build`
Expected: Clean build

**Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for seed + database tab feature"
```
