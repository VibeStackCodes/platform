# Contract-First Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the generate-then-fix pipeline with contract-first generation where SQL and TypeScript types are deterministically derived from a single schema contract, eliminating LLM fix loops.

**Architecture:** Templates produce `SchemaContract` fragments (structured JSON describing tables, columns, relations). Two pure functions — `contractToSQL()` and `contractToTypes()` — derive correct SQL (topologically sorted) and Supabase-compatible TypeScript types. A DAG runner replaces the imperative route handler for maximum parallelism.

**Tech Stack:** TypeScript, Vitest, PGlite (existing), Handlebars templates (existing)

---

### Task 1: SchemaContract Type Definition

**Files:**
- Create: `lib/schema-contract.ts`
- Test: `tests/schema-contract.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/schema-contract.test.ts
import { describe, it, expect } from 'vitest';
import { validateContract, type SchemaContract } from '@/lib/schema-contract';

describe('validateContract', () => {
  it('accepts a valid contract with tables and relations', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'display_name', type: 'text', nullable: false },
            { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
            { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
          ],
          rlsPolicies: [
            { name: 'Users can view own profile', operation: 'SELECT', using: 'auth.uid() = user_id' },
          ],
        },
      ],
    };
    expect(validateContract(contract)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a contract with duplicate column names in a table', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'items',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'title', type: 'text' }, // duplicate
        ],
      }],
    };
    const result = validateContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('duplicate');
  });

  it('rejects a contract with FK reference to non-existent table', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'comments',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
        ],
      }],
    };
    const result = validateContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('posts');
  });

  it('allows FK references to auth.users (external table)', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'profiles',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
        ],
      }],
    };
    expect(validateContract(contract)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a contract with circular FK dependencies', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'a',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'b_id', type: 'uuid', references: { table: 'b', column: 'id' } },
          ],
        },
        {
          name: 'b',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'a_id', type: 'uuid', references: { table: 'a', column: 'id' } },
          ],
        },
      ],
    };
    const result = validateContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('circular');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/schema-contract.test.ts`
Expected: FAIL — module `@/lib/schema-contract` does not exist

**Step 3: Write minimal implementation**

```typescript
// lib/schema-contract.ts

// SQL column types supported by Supabase/Postgres
export type SQLType =
  | 'uuid'
  | 'text'
  | 'numeric'
  | 'boolean'
  | 'timestamptz'
  | 'jsonb'
  | 'integer'
  | 'bigint';

export interface ColumnDef {
  name: string;
  type: SQLType;
  nullable?: boolean;
  default?: string;
  primaryKey?: boolean;
  unique?: boolean;
  references?: { table: string; column: string };
}

export interface RLSPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using?: string;
  withCheck?: string;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  rlsPolicies?: RLSPolicy[];
}

export interface EnumDef {
  name: string;
  values: string[];
}

export interface SeedRow {
  table: string;
  rows: Record<string, unknown>[];
}

export interface SchemaContract {
  tables: TableDef[];
  enums?: EnumDef[];
  seedData?: SeedRow[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// External tables that are always available (Supabase auth)
const EXTERNAL_TABLES = new Set(['auth.users']);

/**
 * Validate a SchemaContract for correctness:
 * - No duplicate column names within a table
 * - All FK references point to existing tables or external tables
 * - No circular FK dependencies
 */
export function validateContract(contract: SchemaContract): ValidationResult {
  const errors: string[] = [];
  const tableNames = new Set(contract.tables.map(t => t.name));

  for (const table of contract.tables) {
    // Check duplicate columns
    const colNames = new Set<string>();
    for (const col of table.columns) {
      if (colNames.has(col.name)) {
        errors.push(`Table "${table.name}" has duplicate column "${col.name}"`);
      }
      colNames.add(col.name);
    }

    // Check FK references exist
    for (const col of table.columns) {
      if (col.references) {
        const refTable = col.references.table;
        if (!tableNames.has(refTable) && !EXTERNAL_TABLES.has(refTable)) {
          errors.push(`Table "${table.name}" column "${col.name}" references non-existent table "${refTable}"`);
        }
      }
    }
  }

  // Check for circular dependencies via topological sort attempt
  if (errors.length === 0) {
    const cycle = detectCycle(contract.tables);
    if (cycle) {
      errors.push(`Circular FK dependency detected: ${cycle.join(' → ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Detect circular FK dependencies. Returns cycle path or null.
 */
function detectCycle(tables: TableDef[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const t of tables) {
    adj.set(t.name, []);
  }
  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && adj.has(col.references.table)) {
        adj.get(t.name)!.push(col.references.table);
      }
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const name of adj.keys()) color.set(name, WHITE);

  const path: string[] = [];

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    path.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        path.push(neighbor);
        return true; // cycle found
      }
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    path.pop();
    color.set(node, BLACK);
    return false;
  }

  for (const name of adj.keys()) {
    if (color.get(name) === WHITE && dfs(name)) return path;
  }
  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/schema-contract.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add lib/schema-contract.ts tests/schema-contract.test.ts
git commit -m "feat: add SchemaContract type with validation"
```

---

### Task 2: contractToSQL — Deterministic SQL Generation

**Files:**
- Create: `lib/contract-to-sql.ts`
- Test: `tests/contract-to-sql.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/contract-to-sql.test.ts
import { describe, it, expect } from 'vitest';
import { contractToSQL } from '@/lib/contract-to-sql';
import type { SchemaContract } from '@/lib/schema-contract';

describe('contractToSQL', () => {
  it('generates CREATE TABLE with correct column types', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'items',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'title', type: 'text', nullable: false },
          { name: 'count', type: 'numeric' },
          { name: 'active', type: 'boolean', default: 'false' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
      }],
    };
    const sql = contractToSQL(contract);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS items');
    expect(sql).toContain('id UUID DEFAULT gen_random_uuid() PRIMARY KEY');
    expect(sql).toContain('title TEXT NOT NULL');
    expect(sql).toContain('count NUMERIC');
    expect(sql).toContain('active BOOLEAN DEFAULT false');
    expect(sql).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT now()');
  });

  it('topologically sorts tables by FK dependencies', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
          ],
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          ],
        },
      ],
    };
    const sql = contractToSQL(contract);
    const postsIdx = sql.indexOf('CREATE TABLE IF NOT EXISTS posts');
    const commentsIdx = sql.indexOf('CREATE TABLE IF NOT EXISTS comments');
    expect(postsIdx).toBeLessThan(commentsIdx);
  });

  it('generates RLS policies', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'items',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
        ],
        rlsPolicies: [
          { name: 'Users can view own', operation: 'SELECT', using: 'auth.uid() = user_id' },
          { name: 'Users can insert own', operation: 'INSERT', withCheck: 'auth.uid() = user_id' },
        ],
      }],
    };
    const sql = contractToSQL(contract);
    expect(sql).toContain('ALTER TABLE items ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "Users can view own" ON items FOR SELECT USING (auth.uid() = user_id)');
    expect(sql).toContain('CREATE POLICY "Users can insert own" ON items FOR INSERT WITH CHECK (auth.uid() = user_id)');
  });

  it('generates enums before tables', () => {
    const contract: SchemaContract = {
      enums: [{ name: 'status', values: ['active', 'inactive', 'archived'] }],
      tables: [{
        name: 'items',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'status', type: 'text' },
        ],
      }],
    };
    const sql = contractToSQL(contract);
    const enumIdx = sql.indexOf("CREATE TYPE status");
    const tableIdx = sql.indexOf('CREATE TABLE');
    expect(enumIdx).toBeLessThan(tableIdx);
  });

  it('generates seed data INSERTs after tables', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'categories',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'text', nullable: false },
        ],
      }],
      seedData: [{
        table: 'categories',
        rows: [{ name: 'General' }, { name: 'Urgent' }],
      }],
    };
    const sql = contractToSQL(contract);
    const tableIdx = sql.indexOf('CREATE TABLE');
    const insertIdx = sql.indexOf('INSERT INTO categories');
    expect(insertIdx).toBeGreaterThan(tableIdx);
    expect(sql).toContain("'General'");
    expect(sql).toContain("'Urgent'");
  });

  it('generates FK REFERENCES with ON DELETE CASCADE', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'posts',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
        {
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
          ],
        },
      ],
    };
    const sql = contractToSQL(contract);
    expect(sql).toContain('post_id UUID REFERENCES posts(id) ON DELETE CASCADE');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/contract-to-sql.test.ts`
Expected: FAIL — module `@/lib/contract-to-sql` does not exist

**Step 3: Write minimal implementation**

```typescript
// lib/contract-to-sql.ts
import type { SchemaContract, TableDef, ColumnDef } from './schema-contract';

const SQL_TYPE_MAP: Record<string, string> = {
  uuid: 'UUID',
  text: 'TEXT',
  numeric: 'NUMERIC',
  boolean: 'BOOLEAN',
  timestamptz: 'TIMESTAMPTZ',
  jsonb: 'JSONB',
  integer: 'INTEGER',
  bigint: 'BIGINT',
};

/**
 * Generate deterministic Postgres SQL from a SchemaContract.
 * Tables are topologically sorted by FK dependencies — correct by construction.
 */
export function contractToSQL(contract: SchemaContract): string {
  const parts: string[] = [];

  // 1. Enums
  for (const e of contract.enums ?? []) {
    parts.push(`CREATE TYPE ${e.name} AS ENUM (${e.values.map(v => `'${v}'`).join(', ')});`);
  }

  // 2. Tables in topological order
  const sorted = topologicalSort(contract.tables);
  for (const table of sorted) {
    parts.push(generateCreateTable(table));

    // RLS
    if (table.rlsPolicies && table.rlsPolicies.length > 0) {
      parts.push(`ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`);
      for (const policy of table.rlsPolicies) {
        parts.push(generatePolicy(table.name, policy));
      }
    }
  }

  // 3. Seed data
  for (const seed of contract.seedData ?? []) {
    for (const row of seed.rows) {
      const cols = Object.keys(row);
      const vals = Object.values(row).map(v =>
        typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` :
        v === null ? 'NULL' : String(v)
      );
      parts.push(`INSERT INTO ${seed.table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
    }
  }

  return parts.join('\n\n');
}

function generateCreateTable(table: TableDef): string {
  const colDefs = table.columns.map(col => {
    const sqlType = SQL_TYPE_MAP[col.type] ?? col.type.toUpperCase();
    const parts: string[] = [`  ${col.name} ${sqlType}`];

    if (col.default) parts.push(`DEFAULT ${col.default}`);
    if (col.primaryKey) parts.push('PRIMARY KEY');
    if (col.nullable === false && !col.primaryKey) parts.push('NOT NULL');
    if (col.unique) parts.push('UNIQUE');
    if (col.references) {
      parts.push(`REFERENCES ${col.references.table}(${col.references.column}) ON DELETE CASCADE`);
    }

    return parts.join(' ');
  });

  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n${colDefs.join(',\n')}\n);`;
}

function generatePolicy(
  tableName: string,
  policy: { name: string; operation: string; using?: string; withCheck?: string },
): string {
  let sql = `CREATE POLICY "${policy.name}" ON ${tableName} FOR ${policy.operation}`;
  if (policy.using) sql += ` USING (${policy.using})`;
  if (policy.withCheck) sql += ` WITH CHECK (${policy.withCheck})`;
  return sql + ';';
}

/**
 * Topological sort tables by FK dependencies.
 * External tables (auth.users) are excluded from the graph.
 */
function topologicalSort(tables: TableDef[]): TableDef[] {
  const tableMap = new Map(tables.map(t => [t.name, t]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const t of tables) {
    inDegree.set(t.name, 0);
    adj.set(t.name, []);
  }

  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && tableMap.has(col.references.table)) {
        // t depends on col.references.table → edge from ref → t
        adj.get(col.references.table)!.push(t.name);
        inDegree.set(t.name, (inDegree.get(t.name) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue = tables.filter(t => inDegree.get(t.name) === 0).map(t => t.name);
  const result: TableDef[] = [];

  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(tableMap.get(name)!);
    for (const neighbor of adj.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/contract-to-sql.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add lib/contract-to-sql.ts tests/contract-to-sql.test.ts
git commit -m "feat: add contractToSQL with topological sort"
```

---

### Task 3: contractToTypes — Deterministic TypeScript Type Generation

**Files:**
- Create: `lib/contract-to-types.ts`
- Test: `tests/contract-to-types.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/contract-to-types.test.ts
import { describe, it, expect } from 'vitest';
import { contractToTypes } from '@/lib/contract-to-types';
import type { SchemaContract } from '@/lib/schema-contract';

describe('contractToTypes', () => {
  it('generates Supabase Database type with Row/Insert/Update', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'profiles',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'display_name', type: 'text', nullable: false },
          { name: 'bio', type: 'text' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
      }],
    };
    const ts = contractToTypes(contract);

    // Row type has all columns
    expect(ts).toContain('id: string');
    expect(ts).toContain('display_name: string');
    expect(ts).toContain('bio: string | null');
    expect(ts).toContain('created_at: string');

    // Insert type: columns with defaults are optional
    expect(ts).toContain('Insert:');
    expect(ts).toContain('id?: string'); // has default

    // Update type: all optional
    expect(ts).toContain('Update:');

    // Structural checks
    expect(ts).toContain('export type Database =');
    expect(ts).toContain('Tables:');
    expect(ts).toContain('profiles:');
  });

  it('generates enum types', () => {
    const contract: SchemaContract = {
      enums: [{ name: 'status', values: ['active', 'inactive'] }],
      tables: [{
        name: 'items',
        columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
      }],
    };
    const ts = contractToTypes(contract);
    expect(ts).toContain('Enums:');
    expect(ts).toContain("status: 'active' | 'inactive'");
  });

  it('maps SQL types to TypeScript types correctly', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'test',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'count', type: 'numeric' },
          { name: 'active', type: 'boolean' },
          { name: 'data', type: 'jsonb' },
          { name: 'big', type: 'bigint' },
          { name: 'num', type: 'integer' },
        ],
      }],
    };
    const ts = contractToTypes(contract);
    expect(ts).toContain('id: string');       // uuid → string
    expect(ts).toContain('count: number | null');     // numeric → number
    expect(ts).toContain('active: boolean | null');   // boolean → boolean
    expect(ts).toContain('data: Record<string, unknown> | null'); // jsonb → Record
    expect(ts).toContain('big: number | null');       // bigint → number
    expect(ts).toContain('num: number | null');       // integer → number
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/contract-to-types.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// lib/contract-to-types.ts
import type { SchemaContract, ColumnDef } from './schema-contract';

const TS_TYPE_MAP: Record<string, string> = {
  uuid: 'string',
  text: 'string',
  numeric: 'number',
  boolean: 'boolean',
  timestamptz: 'string',
  jsonb: 'Record<string, unknown>',
  integer: 'number',
  bigint: 'number',
};

/**
 * Generate a Supabase-compatible `Database` type from a SchemaContract.
 * Produces Row (all fields), Insert (defaults optional), Update (all optional).
 */
export function contractToTypes(contract: SchemaContract): string {
  const lines: string[] = [
    '// Auto-generated by VibeStack — do not edit manually',
    '',
    'export type Database = {',
    '  public: {',
    '    Tables: {',
  ];

  for (const table of contract.tables) {
    lines.push(`      ${table.name}: {`);

    // Row type — all columns, nullable ones get | null
    lines.push('        Row: {');
    for (const col of table.columns) {
      const tsType = TS_TYPE_MAP[col.type] ?? 'unknown';
      const nullable = col.nullable !== false && !col.primaryKey ? ' | null' : '';
      lines.push(`          ${col.name}: ${tsType}${nullable};`);
    }
    lines.push('        };');

    // Insert type — columns with defaults are optional
    lines.push('        Insert: {');
    for (const col of table.columns) {
      const tsType = TS_TYPE_MAP[col.type] ?? 'unknown';
      const nullable = col.nullable !== false && !col.primaryKey ? ' | null' : '';
      const optional = col.default ? '?' : '';
      lines.push(`          ${col.name}${optional}: ${tsType}${nullable};`);
    }
    lines.push('        };');

    // Update type — all optional
    lines.push('        Update: {');
    for (const col of table.columns) {
      const tsType = TS_TYPE_MAP[col.type] ?? 'unknown';
      const nullable = col.nullable !== false && !col.primaryKey ? ' | null' : '';
      lines.push(`          ${col.name}?: ${tsType}${nullable};`);
    }
    lines.push('        };');

    lines.push('      };');
  }

  lines.push('    };');

  // Enums
  lines.push('    Enums: {');
  for (const e of contract.enums ?? []) {
    lines.push(`      ${e.name}: ${e.values.map(v => `'${v}'`).join(' | ')};`);
  }
  lines.push('    };');

  lines.push('  };');
  lines.push('};');

  return lines.join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/contract-to-types.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add lib/contract-to-types.ts tests/contract-to-types.test.ts
git commit -m "feat: add contractToTypes for Supabase Database type generation"
```

---

### Task 4: Pipeline DAG Runner

**Files:**
- Create: `lib/pipeline-dag.ts`
- Test: `tests/pipeline-dag.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/pipeline-dag.test.ts
import { describe, it, expect } from 'vitest';
import { runDAG, type Stage } from '@/lib/pipeline-dag';

describe('runDAG', () => {
  it('runs stages in dependency order', async () => {
    const order: string[] = [];
    const stages: Stage<{ order: string[] }>[] = [
      { name: 'a', deps: [], run: async (ctx) => { ctx.order.push('a'); } },
      { name: 'b', deps: ['a'], run: async (ctx) => { ctx.order.push('b'); } },
      { name: 'c', deps: ['b'], run: async (ctx) => { ctx.order.push('c'); } },
    ];
    await runDAG(stages, { order });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('runs independent stages in parallel', async () => {
    const timestamps: Record<string, number> = {};
    const stages: Stage<{ ts: Record<string, number> }>[] = [
      {
        name: 'a',
        deps: [],
        run: async (ctx) => {
          ctx.ts['a_start'] = Date.now();
          await new Promise(r => setTimeout(r, 50));
          ctx.ts['a_end'] = Date.now();
        },
      },
      {
        name: 'b',
        deps: [],
        run: async (ctx) => {
          ctx.ts['b_start'] = Date.now();
          await new Promise(r => setTimeout(r, 50));
          ctx.ts['b_end'] = Date.now();
        },
      },
      {
        name: 'c',
        deps: ['a', 'b'],
        run: async (ctx) => { ctx.ts['c'] = Date.now(); },
      },
    ];
    await runDAG(stages, { ts: timestamps });
    // a and b should start within 10ms of each other (parallel)
    expect(Math.abs(timestamps['a_start'] - timestamps['b_start'])).toBeLessThan(20);
    // c should start after both a and b end
    expect(timestamps['c']).toBeGreaterThanOrEqual(timestamps['a_end']);
    expect(timestamps['c']).toBeGreaterThanOrEqual(timestamps['b_end']);
  });

  it('propagates errors from a stage', async () => {
    const stages: Stage<object>[] = [
      { name: 'a', deps: [], run: async () => { throw new Error('boom'); } },
      { name: 'b', deps: ['a'], run: async () => {} },
    ];
    await expect(runDAG(stages, {})).rejects.toThrow('boom');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/pipeline-dag.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// lib/pipeline-dag.ts

export interface Stage<TCtx> {
  name: string;
  deps: string[];
  run: (ctx: TCtx) => Promise<void>;
}

/**
 * Execute a DAG of stages with maximum parallelism.
 * Stages run as soon as all their dependencies complete.
 * Errors propagate immediately — remaining stages are abandoned.
 */
export async function runDAG<TCtx>(stages: Stage<TCtx>[], ctx: TCtx): Promise<void> {
  const completed = new Set<string>();
  const running = new Map<string, Promise<void>>();
  const stageMap = new Map(stages.map(s => [s.name, s]));

  while (completed.size < stages.length) {
    // Find stages ready to run (all deps completed, not running, not completed)
    const ready = stages.filter(s =>
      !completed.has(s.name) &&
      !running.has(s.name) &&
      s.deps.every(d => completed.has(d))
    );

    if (ready.length === 0 && running.size === 0) {
      const remaining = stages.filter(s => !completed.has(s.name)).map(s => s.name);
      throw new Error(`DAG deadlock: stages [${remaining.join(', ')}] have unresolvable dependencies`);
    }

    // Launch ready stages
    for (const stage of ready) {
      const promise = stage.run(ctx).then(() => {
        completed.add(stage.name);
        running.delete(stage.name);
      });
      running.set(stage.name, promise);
    }

    // Wait for any stage to complete (or fail)
    if (running.size > 0) {
      await Promise.race(running.values());
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/pipeline-dag.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add lib/pipeline-dag.ts tests/pipeline-dag.test.ts
git commit -m "feat: add DAG runner for pipeline orchestration"
```

---

### Task 5: Update Templates to Produce SchemaContract Fragments

**Files:**
- Modify: `lib/template-registry.ts`
- Modify: `lib/types.ts`
- Test: `tests/template-registry.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/template-registry.test.ts
import { describe, it, expect } from 'vitest';
import { executeTemplate } from '@/lib/template-registry';

describe('executeTemplate returns SchemaContract fragments', () => {
  it('crud template returns a schema fragment with table definition', () => {
    const result = executeTemplate(
      {
        template: 'crud',
        config: {
          entity: 'task',
          tableName: 'tasks',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'done', type: 'boolean', required: false },
          ],
          belongsTo: [],
        },
      },
      { primaryColor: '#3b82f6', accentColor: '#8b5cf6', fontFamily: 'Inter', spacing: 'comfortable', borderRadius: 'medium' },
    );

    // Should have a schema fragment instead of raw migration SQL
    expect(result.schema).toBeDefined();
    expect(result.schema!.tables).toHaveLength(1);
    expect(result.schema!.tables[0].name).toBe('tasks');
    expect(result.schema!.tables[0].columns.find(c => c.name === 'title')).toBeDefined();
    // migration string should be undefined now (derived from contract later)
    expect(result.migration).toBeUndefined();
  });

  it('crud template with belongsTo adds FK column to schema', () => {
    const result = executeTemplate(
      {
        template: 'crud',
        config: {
          entity: 'comment',
          tableName: 'comments',
          fields: [{ name: 'body', type: 'text', required: true }],
          belongsTo: ['post'],
        },
      },
      { primaryColor: '#3b82f6', accentColor: '#8b5cf6', fontFamily: 'Inter', spacing: 'comfortable', borderRadius: 'medium' },
    );

    const table = result.schema!.tables[0];
    const fkCol = table.columns.find(c => c.name === 'post_id');
    expect(fkCol).toBeDefined();
    expect(fkCol!.references).toEqual({ table: 'posts', column: 'id' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/template-registry.test.ts`
Expected: FAIL — `result.schema` is undefined

**Step 3: Modify implementation**

In `lib/types.ts`, add to `TemplateResult` (which is actually in `lib/template-registry.ts` as a local interface — see line 86-90):

Update `lib/template-registry.ts`:
- Import `SchemaContract` types
- Add `schema?: Partial<SchemaContract>` to `TemplateResult`
- In `executeTemplate`, for `crud` template, build a `SchemaContract` fragment from `task.config` instead of relying on the `.sql.hbs` template
- For `messaging` template, same approach

The key change: instead of letting Handlebars render SQL, build a typed `TableDef` from `EntityConfig` fields.

```typescript
// In lib/template-registry.ts — add after existing imports
import type { SchemaContract, TableDef, ColumnDef, SQLType } from './schema-contract';

// Update TemplateResult interface (line ~86)
interface TemplateResult {
  files: GeneratedFile[];
  migration?: string;     // deprecated — only for templates without schema
  schema?: Partial<SchemaContract>;  // NEW: structured schema fragment
  dependencies: Record<string, string>;
}

// Add helper to convert EntityField type to SQLType
const ENTITY_TO_SQL_TYPE: Record<string, SQLType> = {
  text: 'text',
  number: 'numeric',
  boolean: 'boolean',
  enum: 'text',
  uuid: 'uuid',
  timestamp: 'timestamptz',
  json: 'jsonb',
};

// Add function to build TableDef from template config
function buildTableDefFromConfig(config: Record<string, unknown>): TableDef | null {
  const entity = config.entity as string | undefined;
  const tableName = config.tableName as string | undefined;
  const fields = config.fields as Array<{ name: string; type: string; required: boolean; enumValues?: string[] }> | undefined;
  const belongsTo = config.belongsTo as string[] | undefined;

  if (!entity || !tableName || !fields) return null;

  const columns: ColumnDef[] = [
    { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
  ];

  for (const field of fields) {
    columns.push({
      name: field.name,
      type: ENTITY_TO_SQL_TYPE[field.type] ?? 'text',
      nullable: !field.required,
      default: field.type === 'boolean' ? 'false' :
               field.type === 'json' ? "'{}'" : undefined,
    });
  }

  // belongsTo FK columns
  for (const relation of belongsTo ?? []) {
    columns.push({
      name: `${relation}_id`,
      type: 'uuid',
      nullable: false,
      references: { table: pluralizeTable(relation), column: 'id' },
    });
  }

  // user_id FK (all CRUD tables have it)
  columns.push({
    name: 'user_id',
    type: 'uuid',
    nullable: false,
    references: { table: 'auth.users', column: 'id' },
  });

  // Timestamps
  columns.push(
    { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
    { name: 'updated_at', type: 'timestamptz', nullable: false, default: 'now()' },
  );

  return {
    name: tableName,
    columns,
    rlsPolicies: [
      { name: `Users can view own ${tableName}`, operation: 'SELECT', using: 'auth.uid() = user_id' },
      { name: `Users can insert own ${tableName}`, operation: 'INSERT', withCheck: 'auth.uid() = user_id' },
      { name: `Users can update own ${tableName}`, operation: 'UPDATE', using: 'auth.uid() = user_id' },
      { name: `Users can delete own ${tableName}`, operation: 'DELETE', using: 'auth.uid() = user_id' },
    ],
  };
}
```

Then modify `executeTemplate` (around line 101-130) to:
1. For `crud` and `messaging` templates: build `schema` fragment, skip `.sql.hbs` files
2. For other templates: keep existing behavior

```typescript
// Inside executeTemplate, replace the SQL file handling:
export function executeTemplate(
  task: TemplateTask,
  designTokens: DesignTokens,
): TemplateResult {
  const templateDir = join(getTemplatesDir(), task.template);
  const templates = loadTemplateDir(templateDir);
  const layer = TEMPLATE_LAYERS[task.template] ?? 0;

  const context: Record<string, unknown> = {
    ...task.config,
    ...designTokensToContext(designTokens),
    appName: task.config.appName ?? 'App',
  };

  const files: GeneratedFile[] = [];
  let migration: string | undefined;
  let schema: Partial<SchemaContract> | undefined;

  // Build schema fragment from config (replaces .sql.hbs)
  if (task.template === 'crud') {
    const tableDef = buildTableDefFromConfig(task.config);
    if (tableDef) {
      schema = { tables: [tableDef] };
    }
  } else if (task.template === 'messaging') {
    schema = {
      tables: [{
        name: 'messages',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'content', type: 'text', nullable: false },
          { name: 'channel_id', type: 'text', nullable: false, default: "'default'" },
          { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
        rlsPolicies: [
          { name: 'Users can view messages', operation: 'SELECT', using: 'true' },
          { name: 'Authenticated users can send messages', operation: 'INSERT', withCheck: 'auth.uid() = user_id' },
        ],
      }],
    };
  }

  // Render non-SQL Handlebars templates
  for (const { outputPath, template } of templates) {
    const resolvedPath = Handlebars.compile(outputPath)(context);
    const content = template(context);

    // Skip .sql.hbs files if we built a schema fragment
    if (schema && (resolvedPath.endsWith('.sql') || resolvedPath === 'migration.sql')) {
      continue;
    }

    if (resolvedPath.endsWith('.sql') || resolvedPath === 'migration.sql') {
      migration = migration ? `${migration}\n\n-- ---\n\n${content}` : content;
    } else {
      files.push({ path: resolvedPath, content, layer });
    }
  }

  return { files, migration, schema, dependencies: {} };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/template-registry.test.ts`
Expected: All 2 tests PASS

**Step 5: Commit**

```bash
git add lib/template-registry.ts lib/types.ts tests/template-registry.test.ts
git commit -m "feat: templates produce SchemaContract fragments instead of raw SQL"
```

---

### Task 6: Update Template Pipeline to Merge Contracts

**Files:**
- Modify: `lib/template-pipeline.ts`

**Step 1: Write the failing test**

```typescript
// tests/template-pipeline.test.ts
import { describe, it, expect, vi } from 'vitest';

// We need to test that the scaffold phase merges schema fragments
// and produces merged contract. Mock sandbox operations.
vi.mock('@/lib/sandbox', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));

// Mock Handlebars template loading to avoid filesystem reads in test
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (p: string) => p.includes('templates/') ? false : actual.existsSync(p),
  };
});

import { mergeSchemaContracts } from '@/lib/template-pipeline';
import type { SchemaContract } from '@/lib/schema-contract';

describe('mergeSchemaContracts', () => {
  it('merges multiple contract fragments into one', () => {
    const fragments: Partial<SchemaContract>[] = [
      {
        tables: [{
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text', nullable: false },
          ],
        }],
      },
      {
        tables: [{
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
          ],
        }],
      },
    ];

    const merged = mergeSchemaContracts(fragments);
    expect(merged.tables).toHaveLength(2);
    expect(merged.tables.map(t => t.name)).toContain('posts');
    expect(merged.tables.map(t => t.name)).toContain('comments');
  });

  it('deduplicates tables by name (last wins)', () => {
    const fragments: Partial<SchemaContract>[] = [
      { tables: [{ name: 'items', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] }] },
      { tables: [{ name: 'items', columns: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'title', type: 'text' }] }] },
    ];

    const merged = mergeSchemaContracts(fragments);
    expect(merged.tables).toHaveLength(1);
    expect(merged.tables[0].columns).toHaveLength(2); // last one wins
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/template-pipeline.test.ts`
Expected: FAIL — `mergeSchemaContracts` not exported

**Step 3: Add to `lib/template-pipeline.ts`**

```typescript
// Add to lib/template-pipeline.ts — new export

import type { SchemaContract, TableDef, EnumDef, SeedRow } from './schema-contract';

/**
 * Merge multiple partial SchemaContract fragments into a single contract.
 * Deduplicates tables by name (last occurrence wins).
 */
export function mergeSchemaContracts(
  fragments: Partial<SchemaContract>[],
): SchemaContract {
  const tableMap = new Map<string, TableDef>();
  const enumMap = new Map<string, EnumDef>();
  const seedData: SeedRow[] = [];

  for (const fragment of fragments) {
    for (const table of fragment.tables ?? []) {
      tableMap.set(table.name, table);
    }
    for (const e of fragment.enums ?? []) {
      enumMap.set(e.name, e);
    }
    seedData.push(...(fragment.seedData ?? []));
  }

  return {
    tables: Array.from(tableMap.values()),
    enums: enumMap.size > 0 ? Array.from(enumMap.values()) : undefined,
    seedData: seedData.length > 0 ? seedData : undefined,
  };
}
```

Then update `runScaffoldPhase` to collect schema fragments from template results. Add to the `ScaffoldPhaseResult` interface:

```typescript
// Update ScaffoldPhaseResult
interface ScaffoldPhaseResult {
  scaffoldFiles: GeneratedFile[];
  featureFiles: GeneratedFile[];
  allDeps: Record<string, string>;
  allMigrations: string[];           // kept for backward compat
  schemaContract: SchemaContract | null;  // NEW
}
```

In the `runScaffoldPhase` body, collect schema fragments:

```typescript
// After executeTemplate results loop — collect schema fragments
const schemaFragments: Partial<SchemaContract>[] = [];

for (const result of results) {
  allFiles.push(...result.files);
  if (result.migration) allMigrations.push(result.migration);
  if (result.schema) schemaFragments.push(result.schema);
  Object.assign(allDeps, result.dependencies);
}

// ... after the layer loop, before writing migration file:

// Merge schema fragments (replaces raw SQL concatenation)
const schemaContract = schemaFragments.length > 0
  ? mergeSchemaContracts(schemaFragments)
  : null;
```

Return `schemaContract` in the result.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/template-pipeline.test.ts`
Expected: All 2 tests PASS

**Step 5: Commit**

```bash
git add lib/template-pipeline.ts tests/template-pipeline.test.ts
git commit -m "feat: template pipeline merges SchemaContract fragments"
```

---

### Task 7: Update Route Handler to Use Contract-First + DAG

**Files:**
- Modify: `app/api/projects/generate/route.ts`
- Modify: `lib/local-supabase.ts`
- Modify: `lib/verifier.ts`

This task is larger — it rewires the main pipeline. No unit test (covered by existing E2E tests).

**Step 1: Simplify `lib/local-supabase.ts`**

Remove the LLM fix loop. `applyLocalMigration` becomes a one-shot assertion:

```typescript
// lib/local-supabase.ts — simplified version
// Remove: fixMigrationSQL function entirely
// Remove: MAX_FIX_ATTEMPTS, errorHistory loop
// Keep: runMigrationInPGlite, AUTH_STUBS, getLocalSupabaseCredentials

/**
 * Validate migration SQL via PGlite. One-shot assertion.
 * If this fails, it's a bug in contractToSQL() — not a user-data issue.
 */
export async function validateMigration(
  sandbox: Sandbox,
  migrationSQL: string,
): Promise<void> {
  const error = await runMigrationInPGlite(sandbox, migrationSQL);
  if (error) {
    throw new Error(`Migration validation failed (contractToSQL bug): ${error}`);
  }
  console.log('[local-supabase] Migration validated successfully via PGlite');
}
```

Keep `applyLocalMigration` as an alias for backward compat with mock mode if needed, but the real path calls `validateMigration`.

**Step 2: Reduce `lib/verifier.ts` retries**

Change line 26:

```typescript
const MAX_FIX_RETRIES = 2; // Safety net only — contract-first eliminates most errors
```

**Step 3: Update `route.ts` to use contract-first flow**

The key changes in the real (non-mock) pipeline:

1. After `runScaffoldPhase`, if `schemaContract` exists:
   - Call `contractToSQL(schemaContract)` to get deterministic SQL
   - Call `contractToTypes(schemaContract)` to get TypeScript types
   - Write `database.types.ts` to sandbox
   - Write `001_init.sql` to sandbox
   - Validate SQL via PGlite (one-shot assertion)
2. Remove the LLM fix loop import/call
3. Wire everything through the natural code flow (DAG integration can come later as a refinement)

```typescript
// In route.ts, replace the Stage 2.1 block:

// Stage 2.1: Derive SQL + Types from SchemaContract
if (schemaContract) {
  const { validateContract } = await import("@/lib/schema-contract");
  const { contractToSQL } = await import("@/lib/contract-to-sql");
  const { contractToTypes } = await import("@/lib/contract-to-types");

  // Validate contract
  const validation = validateContract(schemaContract);
  if (!validation.valid) {
    throw new Error(`Schema contract invalid: ${validation.errors.join('; ')}`);
  }

  // Derive SQL (topologically sorted, correct by construction)
  const migrationSQL = contractToSQL(schemaContract);
  const typesTS = contractToTypes(schemaContract);

  // Write to sandbox
  const { uploadFile: upload } = await import("@/lib/sandbox");
  await upload(sandbox, migrationSQL, '/workspace/supabase/migrations/001_init.sql');
  await upload(sandbox, typesTS, '/workspace/src/types/database.types.ts');

  // Update scaffold files for downstream consumers
  const migrationFile = scaffoldFiles.find(f => f.path === 'supabase/migrations/001_init.sql');
  if (migrationFile) migrationFile.content = migrationSQL;
  scaffoldFiles.push({ path: 'src/types/database.types.ts', content: typesTS, layer: 0 });

  // Validate via PGlite (one-shot assertion)
  const { validateMigration } = await import("@/lib/local-supabase");
  await validateMigration(sandbox, migrationSQL);

  // Update allMigrations for downstream (Supabase apply)
  allMigrations.splice(0, allMigrations.length, migrationSQL);

  emit({ type: "checkpoint", label: "Database ready", status: "complete" });
} else if (allMigrations.length > 0) {
  // Fallback: legacy raw SQL path (for templates without schema)
  const migrationContent = allMigrations.join('\n\n-- ---\n\n');
  const { applyLocalMigration } = await import("@/lib/local-supabase");
  const validatedSQL = await applyLocalMigration(sandbox, migrationContent, model);
  allMigrations.splice(0, allMigrations.length, validatedSQL);
  const migrationFile = scaffoldFiles.find(f => f.path === 'supabase/migrations/001_init.sql');
  if (migrationFile) {
    migrationFile.content = validatedSQL;
    const { uploadFile: upload } = await import("@/lib/sandbox");
    await upload(sandbox, validatedSQL, '/workspace/supabase/migrations/001_init.sql');
  }
  emit({ type: "checkpoint", label: "Database ready", status: "complete" });
}
```

**Step 4: Run type-check**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add lib/local-supabase.ts lib/verifier.ts app/api/projects/generate/route.ts
git commit -m "feat: wire contract-first generation into pipeline"
```

---

### Task 8: Run E2E Tests to Validate

**Step 1: Run mock E2E tests (should still pass)**

Run: `NEXT_PUBLIC_MOCK_MODE=true npx playwright test --project=mock`
Expected: All 19 tests pass

**Step 2: Run real E2E test**

Run: `NEXT_PUBLIC_MOCK_MODE=false npx playwright test --project=real`
Expected: Pipeline completes without LLM migration fix loops. Look for:
- "Migration validated successfully via PGlite" (no "fixed after N attempts")
- Build verification passes in fewer attempts (ideally 0-1)

**Step 3: Commit any fixes if needed**

---

### Task 9: DAG Runner Integration (Optional Refinement)

**Files:**
- Modify: `app/api/projects/generate/route.ts`

This task replaces the imperative pipeline in `route.ts` with the DAG runner from Task 4. It's a refactoring task — no behavior change, just cleaner structure.

**Step 1: Define pipeline stages as a DAG**

Define a `PipelineContext` type and extract each stage into a named function. Wire them via `runDAG()`.

This is optional — the imperative flow already works after Tasks 1-8. The DAG runner adds cleaner parallelism and better observability but isn't required for correctness.

**Step 2: Run E2E tests again**

Same as Task 8.

**Step 3: Commit**

```bash
git add app/api/projects/generate/route.ts
git commit -m "refactor: pipeline orchestration via DAG runner"
```

---

## Execution Order Summary

| Task | What | Test File | Estimated Steps |
|------|------|-----------|-----------------|
| 1 | SchemaContract type + validation | `tests/schema-contract.test.ts` | 5 |
| 2 | contractToSQL (topological sort) | `tests/contract-to-sql.test.ts` | 5 |
| 3 | contractToTypes (TS Database type) | `tests/contract-to-types.test.ts` | 5 |
| 4 | DAG runner | `tests/pipeline-dag.test.ts` | 5 |
| 5 | Templates → SchemaContract fragments | `tests/template-registry.test.ts` | 5 |
| 6 | Pipeline merges contracts | `tests/template-pipeline.test.ts` | 5 |
| 7 | Route handler wiring | (type-check) | 5 |
| 8 | E2E validation | (playwright) | 3 |
| 9 | DAG integration (optional) | (playwright) | 3 |

**Tasks 1-4 are independent** — can be implemented in parallel.
**Tasks 5-6 depend on Task 1** (need SchemaContract type).
**Task 7 depends on Tasks 1-6** (wires everything together).
**Task 8 validates the whole thing.**
