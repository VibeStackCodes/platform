# App Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current LLM-heavy generation pipeline with a deterministic AppBlueprint + tRPC + Drizzle + XState architecture, reducing LLM calls from ~30-50 to ~6-13 and eliminating 15/20 structural bugs.

**Architecture:** SchemaContract → AppBlueprint (deterministic file tree + skeletons) → XState FSM orchestrates provisioning, deterministic code generation, LLM slot-filling, validation, and deployment. tRPC + Drizzle provide compile-time type safety end-to-end. Mastra agents are kept only for LLM calls (analyst, backend custom procedures, frontend JSX, repair).

**Tech Stack:** XState v5, tRPC, Drizzle ORM, Hono, React 19, TanStack Router, Vitest, Zod

---

## Dependencies Between Tasks

```
Task 1 (schema-contract feature inference)
  ↓
Task 2 (contractToDrizzle) ─────┐
Task 3 (contractToTrpc) ────────┤
Task 4 (contractToPages) ───────┤→ Task 5 (AppBlueprint) → Task 6 (blueprintToSandbox)
                                │
Task 7 (validation gate) ───────┤→ Task 9 (XState machine)
Task 8 (repair agent) ──────────┘
  ↓
Task 10 (registry update) → Task 11 (agent route) → Task 12 (mastra index)
  ↓
Task 13 (delete obsolete) → Task 14 (snapshot update)
```

Tasks 2, 3, 4 are independent of each other. Tasks 7, 8 are independent of each other. Task 14 can happen whenever.

---

### Task 1: Add Feature Inference to SchemaContract

**Files:**
- Modify: `server/lib/schema-contract.ts:125-217`
- Test: `tests/schema-contract.test.ts`

**Step 1: Write the failing test**

Add to `tests/schema-contract.test.ts`:

```typescript
import { inferFeatures, type SchemaContract } from '@server/lib/schema-contract'

describe('inferFeatures', () => {
  it('detects auth when any table has user_id FK to auth.users', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
            { name: 'url', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const features = inferFeatures(contract)
    expect(features.auth).toBe(true)
    expect(features.entities).toEqual(['bookmark'])
  })

  it('returns auth=false when no user_id FK exists', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'item',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    }
    const features = inferFeatures(contract)
    expect(features.auth).toBe(false)
  })

  it('lists all table names as entities', () => {
    const contract: SchemaContract = {
      tables: [
        { name: 'bookmark', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] },
        { name: 'tag', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] },
        { name: 'bookmark_tag', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] },
      ],
    }
    const features = inferFeatures(contract)
    expect(features.entities).toEqual(['bookmark', 'tag', 'bookmark_tag'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/schema-contract.test.ts --reporter=verbose`
Expected: FAIL — `inferFeatures` is not exported

**Step 3: Write minimal implementation**

Add to `server/lib/schema-contract.ts` after the existing exports:

```typescript
export interface InferredFeatures {
  auth: boolean
  entities: string[]
}

/**
 * Infer app features from the schema contract.
 * - auth: true if any table has a user_id column referencing auth.users
 * - entities: list of all table names
 */
export function inferFeatures(contract: SchemaContract): InferredFeatures {
  const hasAuth = contract.tables.some((table) =>
    table.columns.some(
      (col) =>
        col.references?.table === 'auth.users' &&
        col.name.endsWith('user_id'),
    ),
  )

  return {
    auth: hasAuth,
    entities: contract.tables.map((t) => t.name),
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/schema-contract.test.ts --reporter=verbose`
Expected: PASS — all existing tests still pass + new inferFeatures tests pass

**Step 5: Commit**

```bash
git add server/lib/schema-contract.ts tests/schema-contract.test.ts
git commit -m "feat: add inferFeatures to SchemaContract — auth detection from user_id FK"
```

---

### Task 2: Create contractToDrizzle Generator

**Files:**
- Create: `server/lib/contract-to-drizzle.ts`
- Test: `tests/contract-to-drizzle.test.ts`

**Context:** This replaces `contract-to-sql.ts` for generated apps. Instead of raw SQL, we emit a Drizzle ORM schema file (`server/db/schema.ts` in the generated app) that provides compile-time types. The existing `contract-to-sql.ts` is still used for Supabase migration SQL — `contractToDrizzle` generates the TypeScript schema only.

**Step 1: Write the failing test**

Create `tests/contract-to-drizzle.test.ts`:

```typescript
import { contractToDrizzle } from '@server/lib/contract-to-drizzle'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToDrizzle', () => {
  it('generates pgTable with correct column types', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'url', type: 'text', nullable: false },
            { name: 'is_read', type: 'boolean', default: 'false' },
            { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
          ],
        },
      ],
    }
    const result = contractToDrizzle(contract)
    expect(result).toContain("import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core'")
    expect(result).toContain("export const bookmark = pgTable('bookmark'")
    expect(result).toContain("id: uuid('id').defaultRandom().primaryKey()")
    expect(result).toContain("title: text('title').notNull()")
    expect(result).toContain("isRead: boolean('is_read').default(false)")
    expect(result).toContain("createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()")
  })

  it('generates FK references between tables', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'post',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' }],
        },
        {
          name: 'comment',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'post_id', type: 'uuid', nullable: false, references: { table: 'post', column: 'id' } },
          ],
        },
      ],
    }
    const result = contractToDrizzle(contract)
    expect(result).toContain("postId: uuid('post_id').notNull().references(() => post.id)")
  })

  it('generates unique constraints', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'user_profile',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'email', type: 'text', nullable: false, unique: true },
          ],
        },
      ],
    }
    const result = contractToDrizzle(contract)
    expect(result).toContain("email: text('email').notNull().unique()")
  })

  it('generates pgEnum for contract enums', () => {
    const contract: SchemaContract = {
      enums: [{ name: 'priority', values: ['low', 'medium', 'high'] }],
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'priority', type: 'text' },
          ],
        },
      ],
    }
    const result = contractToDrizzle(contract)
    expect(result).toContain("export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high'])")
  })

  it('topologically sorts tables (parent before child)', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'comment',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'post', column: 'id' } },
          ],
        },
        {
          name: 'post',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }
    const result = contractToDrizzle(contract)
    const postIdx = result.indexOf("export const post = pgTable")
    const commentIdx = result.indexOf("export const comment = pgTable")
    expect(postIdx).toBeLessThan(commentIdx)
  })

  it('handles integer and bigint columns', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'counter',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'count', type: 'integer', default: '0' },
            { name: 'total', type: 'bigint' },
          ],
        },
      ],
    }
    const result = contractToDrizzle(contract)
    expect(result).toContain("count: integer('count').default(0)")
    expect(result).toContain("total: bigint('total', { mode: 'number' })")
  })

  it('handles jsonb columns', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'item',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'metadata', type: 'jsonb' },
          ],
        },
      ],
    }
    const result = contractToDrizzle(contract)
    expect(result).toContain("metadata: jsonb('metadata')")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/contract-to-drizzle.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/contract-to-drizzle.ts`:

```typescript
import type { SchemaContract, TableDef } from './schema-contract'

/**
 * snake_case → camelCase for Drizzle column names
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * Collect all Drizzle column type imports needed for a contract.
 */
function collectImports(contract: SchemaContract): string[] {
  const imports = new Set<string>(['pgTable'])
  for (const table of contract.tables) {
    for (const col of table.columns) {
      switch (col.type) {
        case 'uuid': imports.add('uuid'); break
        case 'text': imports.add('text'); break
        case 'boolean': imports.add('boolean'); break
        case 'timestamptz': imports.add('timestamp'); break
        case 'jsonb': imports.add('jsonb'); break
        case 'integer': imports.add('integer'); break
        case 'bigint': imports.add('bigint'); break
        case 'numeric': imports.add('numeric'); break
      }
    }
  }
  if (contract.enums?.length) imports.add('pgEnum')
  return [...imports]
}

/**
 * Generate a Drizzle column definition string.
 */
function generateColumn(col: { name: string; type: string; nullable?: boolean; default?: string; primaryKey?: boolean; unique?: boolean; references?: { table: string; column: string } }, tables: Map<string, boolean>): string {
  const camelName = snakeToCamel(col.name)
  const parts: string[] = []

  switch (col.type) {
    case 'uuid':
      parts.push(`uuid('${col.name}')`)
      break
    case 'text':
      parts.push(`text('${col.name}')`)
      break
    case 'boolean':
      parts.push(`boolean('${col.name}')`)
      break
    case 'timestamptz':
      parts.push(`timestamp('${col.name}', { withTimezone: true })`)
      break
    case 'jsonb':
      parts.push(`jsonb('${col.name}')`)
      break
    case 'integer':
      parts.push(`integer('${col.name}')`)
      break
    case 'bigint':
      parts.push(`bigint('${col.name}', { mode: 'number' })`)
      break
    case 'numeric':
      parts.push(`numeric('${col.name}')`)
      break
    default:
      parts.push(`text('${col.name}')`)
  }

  if (col.nullable === false && !col.primaryKey) parts.push('.notNull()')

  // Default handling
  if (col.default) {
    if (col.default === 'gen_random_uuid()') {
      parts.push('.defaultRandom()')
    } else if (col.default === 'now()') {
      parts.push('.defaultNow()')
    } else if (col.default === 'true' || col.default === 'false') {
      parts.push(`.default(${col.default})`)
    } else if (/^\d+$/.test(col.default)) {
      parts.push(`.default(${col.default})`)
    } else {
      parts.push(`.default(sql\`${col.default}\`)`)
    }
  }

  if (col.primaryKey) parts.push('.primaryKey()')
  if (col.unique) parts.push('.unique()')

  // FK reference — only for internal tables (not auth.users)
  if (col.references && tables.has(col.references.table)) {
    parts.push(`.references(() => ${snakeToCamel(col.references.table)}.${snakeToCamel(col.references.column)})`)
  }

  return `  ${camelName}: ${parts.join('')}`
}

/**
 * Topological sort tables by FK dependencies.
 * External tables (auth.users) are excluded.
 */
function topologicalSort(tables: TableDef[]): TableDef[] {
  const tableMap = new Map(tables.map((t) => [t.name, t]))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const t of tables) {
    inDegree.set(t.name, 0)
    adj.set(t.name, [])
  }

  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && tableMap.has(col.references.table)) {
        adj.get(col.references.table)?.push(t.name)
        inDegree.set(t.name, (inDegree.get(t.name) ?? 0) + 1)
      }
    }
  }

  const queue = tables.filter((t) => inDegree.get(t.name) === 0).map((t) => t.name)
  const result: TableDef[] = []

  while (queue.length > 0) {
    const name = queue.shift()!
    const table = tableMap.get(name)
    if (table) result.push(table)
    for (const neighbor of adj.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  return result
}

/**
 * Generate a Drizzle ORM schema file from a SchemaContract.
 * Output is a complete TypeScript module for `server/db/schema.ts` in the generated app.
 */
export function contractToDrizzle(contract: SchemaContract): string {
  const imports = collectImports(contract)
  const internalTables = new Map(contract.tables.map((t) => [t.name, true]))
  const hasSqlDefault = contract.tables.some((t) =>
    t.columns.some((c) =>
      c.default && !['gen_random_uuid()', 'now()', 'true', 'false'].includes(c.default) && !/^\d+$/.test(c.default)
    ),
  )

  const lines: string[] = [
    '// Auto-generated by VibeStack — do not edit manually',
    `import { ${imports.join(', ')} } from 'drizzle-orm/pg-core'`,
  ]

  if (hasSqlDefault) {
    lines.push("import { sql } from 'drizzle-orm'")
  }

  lines.push('')

  // Enums
  for (const e of contract.enums ?? []) {
    lines.push(`export const ${snakeToCamel(e.name)}Enum = pgEnum('${e.name}', [${e.values.map((v) => `'${v}'`).join(', ')}])`)
    lines.push('')
  }

  // Tables in topological order
  const sorted = topologicalSort(contract.tables)
  for (const table of sorted) {
    const columns = table.columns.map((col) => generateColumn(col, internalTables))
    lines.push(`export const ${snakeToCamel(table.name)} = pgTable('${table.name}', {`)
    lines.push(columns.join(',\n'))
    lines.push('})')
    lines.push('')
  }

  return lines.join('\n')
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/contract-to-drizzle.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/contract-to-drizzle.ts tests/contract-to-drizzle.test.ts
git commit -m "feat: add contractToDrizzle — generates Drizzle ORM schema from SchemaContract"
```

---

### Task 3: Create contractToTrpc Generator

**Files:**
- Create: `server/lib/contract-to-trpc.ts`
- Test: `tests/contract-to-trpc.test.ts`

**Context:** Generates tRPC router files for each entity. CRUD operations are fully deterministic. Custom procedures are marked with `{/* SLOT: CUSTOM_PROCEDURES */}` for LLM backend agent to fill.

**Step 1: Write the failing test**

Create `tests/contract-to-trpc.test.ts`:

```typescript
import { contractToTrpc, contractToRootRouter } from '@server/lib/contract-to-trpc'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToTrpc', () => {
  const contract: SchemaContract = {
    tables: [
      {
        name: 'bookmark',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
          { name: 'url', type: 'text', nullable: false },
          { name: 'title', type: 'text' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
      },
      {
        name: 'tag',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'text', nullable: false, unique: true },
        ],
      },
    ],
  }

  it('generates a router file per table', () => {
    const routers = contractToTrpc(contract)
    expect(routers).toHaveLength(2)
    expect(routers[0].fileName).toBe('bookmark.ts')
    expect(routers[1].fileName).toBe('tag.ts')
  })

  it('generates CRUD procedures (list, getById, create, update, delete)', () => {
    const routers = contractToTrpc(contract)
    const bookmarkRouter = routers[0].content
    expect(bookmarkRouter).toContain('.list')
    expect(bookmarkRouter).toContain('.getById')
    expect(bookmarkRouter).toContain('.create')
    expect(bookmarkRouter).toContain('.update')
    expect(bookmarkRouter).toContain('.delete')
  })

  it('uses protectedProcedure for tables with user_id FK', () => {
    const routers = contractToTrpc(contract)
    const bookmarkRouter = routers[0].content
    expect(bookmarkRouter).toContain('protectedProcedure')
    expect(bookmarkRouter).toContain('ctx.userId')
  })

  it('uses publicProcedure for tables without user_id FK', () => {
    const routers = contractToTrpc(contract)
    const tagRouter = routers[1].content
    expect(tagRouter).toContain('publicProcedure')
  })

  it('includes SLOT marker for custom procedures', () => {
    const routers = contractToTrpc(contract)
    expect(routers[0].content).toContain('SLOT: CUSTOM_PROCEDURES')
  })

  it('generates Zod input schemas for create and update', () => {
    const routers = contractToTrpc(contract)
    const bookmarkRouter = routers[0].content
    expect(bookmarkRouter).toContain("z.object({")
    expect(bookmarkRouter).toContain("url: z.string()")
  })

  it('generates root router that merges all entity routers', () => {
    const rootRouter = contractToRootRouter(contract)
    expect(rootRouter).toContain("import { bookmarkRouter } from './routers/bookmark'")
    expect(rootRouter).toContain("import { tagRouter } from './routers/tag'")
    expect(rootRouter).toContain('bookmark: bookmarkRouter')
    expect(rootRouter).toContain('tag: tagRouter')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/contract-to-trpc.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/contract-to-trpc.ts`:

```typescript
import type { SchemaContract, TableDef, ColumnDef } from './schema-contract'

interface RouterFile {
  fileName: string
  tableName: string
  content: string
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function snakeToPascal(str: string): string {
  return str.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/** Check if a table is user-owned (has user_id FK to auth.users) */
function isUserOwned(table: TableDef): boolean {
  return table.columns.some(
    (col) => col.references?.table === 'auth.users' && col.name.endsWith('user_id'),
  )
}

/** Map SQL types to Zod validators */
function colToZod(col: ColumnDef): string {
  switch (col.type) {
    case 'uuid': return 'z.string().uuid()'
    case 'text': return 'z.string()'
    case 'numeric': return 'z.number()'
    case 'boolean': return 'z.boolean()'
    case 'timestamptz': return 'z.string().datetime()'
    case 'jsonb': return 'z.record(z.unknown())'
    case 'integer': return 'z.number().int()'
    case 'bigint': return 'z.number().int()'
    default: return 'z.string()'
  }
}

/** Get user-insertable columns (no id, timestamps, or user_id for owned tables) */
function getInsertColumns(table: TableDef, isOwned: boolean): ColumnDef[] {
  return table.columns.filter((col) => {
    if (col.primaryKey) return false
    if (col.name === 'created_at' || col.name === 'updated_at') return false
    if (isOwned && col.name === 'user_id') return false
    return true
  })
}

function generateRouterFile(table: TableDef): string {
  const owned = isUserOwned(table)
  const procedureType = owned ? 'protectedProcedure' : 'publicProcedure'
  const camelName = snakeToCamel(table.name)
  const insertCols = getInsertColumns(table, owned)

  const createFields = insertCols.map((col) => {
    const zodType = colToZod(col)
    const optional = col.nullable !== false || col.default ? `.optional()` : ''
    return `    ${snakeToCamel(col.name)}: ${zodType}${optional}`
  }).join(',\n')

  const updateFields = insertCols.map((col) => {
    const zodType = colToZod(col)
    return `    ${snakeToCamel(col.name)}: ${zodType}.optional()`
  }).join(',\n')

  const ownerFilter = owned ? `.where(eq(${camelName}.userId, ctx.userId))` : ''
  const ownerInsert = owned ? `userId: ctx.userId, ` : ''

  return `// Auto-generated by VibeStack — do not edit manually
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ${camelName} } from '../../db/schema'
import { router, publicProcedure, protectedProcedure } from '../trpc'

export const ${camelName}Router = router({
  list: ${procedureType}.query(async ({ ctx }) => {
    return ctx.db.select().from(${camelName})${ownerFilter}
  }),

  getById: ${procedureType}
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(${camelName}).where(eq(${camelName}.id, input.id))
      return rows[0] ?? null
    }),

  create: ${procedureType}
    .input(z.object({
${createFields}
    }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.insert(${camelName}).values({ ${ownerInsert}...input }).returning()
      return rows[0]
    }),

  update: ${procedureType}
    .input(z.object({
    id: z.string().uuid(),
${updateFields}
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input
      const rows = await ctx.db.update(${camelName}).set(values).where(eq(${camelName}.id, id)).returning()
      return rows[0]
    }),

  delete: ${procedureType}
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(${camelName}).where(eq(${camelName}.id, input.id))
      return { success: true }
    }),

  // {/* SLOT: CUSTOM_PROCEDURES — LLM backend agent fills search, joins, business logic here */}
})
`
}

/**
 * Generate tRPC router files from a SchemaContract.
 * Returns one router file per table with deterministic CRUD + custom procedure slots.
 */
export function contractToTrpc(contract: SchemaContract): RouterFile[] {
  return contract.tables.map((table) => ({
    fileName: `${table.name.replace(/_/g, '-')}.ts`,
    tableName: table.name,
    content: generateRouterFile(table),
  }))
}

/**
 * Generate the root tRPC router that merges all entity routers.
 */
export function contractToRootRouter(contract: SchemaContract): string {
  const imports = contract.tables.map((t) => {
    const kebab = t.name.replace(/_/g, '-')
    const camel = snakeToCamel(t.name)
    return `import { ${camel}Router } from './routers/${kebab}'`
  }).join('\n')

  const mergeEntries = contract.tables.map((t) => {
    const camel = snakeToCamel(t.name)
    return `  ${camel}: ${camel}Router`
  }).join(',\n')

  return `// Auto-generated by VibeStack — do not edit manually
import { router } from './trpc'
${imports}

export const appRouter = router({
${mergeEntries},
})

export type AppRouter = typeof appRouter
`
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/contract-to-trpc.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/contract-to-trpc.ts tests/contract-to-trpc.test.ts
git commit -m "feat: add contractToTrpc — generates tRPC routers with CRUD + custom slots"
```

---

### Task 4: Create contractToPages Generator

**Files:**
- Create: `server/lib/contract-to-pages.ts`
- Test: `tests/contract-to-pages.test.ts`

**Context:** Generates page skeleton files with all deterministic imports, hooks, and state pre-wired. LLM only fills `{/* SLOT: COMPONENT_BODY */}` JSX sections.

**Step 1: Write the failing test**

Create `tests/contract-to-pages.test.ts`:

```typescript
import { contractToPages } from '@server/lib/contract-to-pages'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToPages', () => {
  const contract: SchemaContract = {
    tables: [
      {
        name: 'bookmark',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
          { name: 'url', type: 'text', nullable: false },
          { name: 'title', type: 'text' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
      },
    ],
  }

  it('generates a list page skeleton per table', () => {
    const pages = contractToPages(contract)
    const listPage = pages.find((p) => p.fileName === 'bookmark.tsx')
    expect(listPage).toBeDefined()
    expect(listPage!.content).toContain("createFileRoute('/_authenticated/bookmarks')")
  })

  it('imports tRPC hooks in list page', () => {
    const pages = contractToPages(contract)
    const listPage = pages.find((p) => p.fileName === 'bookmark.tsx')!
    expect(listPage.content).toContain('trpc.bookmark.list.useQuery()')
    expect(listPage.content).toContain('trpc.bookmark.create.useMutation')
    expect(listPage.content).toContain('trpc.bookmark.delete.useMutation')
  })

  it('includes SLOT marker for JSX body', () => {
    const pages = contractToPages(contract)
    const listPage = pages.find((p) => p.fileName === 'bookmark.tsx')!
    expect(listPage.content).toContain('SLOT: COMPONENT_BODY')
  })

  it('includes deterministic state declarations', () => {
    const pages = contractToPages(contract)
    const listPage = pages.find((p) => p.fileName === 'bookmark.tsx')!
    expect(listPage.content).toContain('useState')
    expect(listPage.content).toContain('isCreateOpen')
  })

  it('generates a detail page skeleton per table', () => {
    const pages = contractToPages(contract)
    const detailPage = pages.find((p) => p.fileName === 'bookmark.$id.tsx')
    expect(detailPage).toBeDefined()
    expect(detailPage!.content).toContain("createFileRoute('/_authenticated/bookmarks/$id')")
    expect(detailPage!.content).toContain('trpc.bookmark.getById.useQuery')
  })

  it('imports shadcn/ui components', () => {
    const pages = contractToPages(contract)
    const listPage = pages.find((p) => p.fileName === 'bookmark.tsx')!
    expect(listPage.content).toContain("from '@/components/ui/button'")
    expect(listPage.content).toContain("from '@/components/ui/card'")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/contract-to-pages.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/contract-to-pages.ts`:

```typescript
import type { SchemaContract, TableDef, ColumnDef } from './schema-contract'

interface PageFile {
  fileName: string
  routePath: string
  content: string
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function snakeToPascal(str: string): string {
  return str.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function snakeToKebab(str: string): string {
  return str.replace(/_/g, '-')
}

function pluralize(str: string): string {
  if (str.endsWith('y')) return str.slice(0, -1) + 'ies'
  if (str.endsWith('s') || str.endsWith('sh') || str.endsWith('ch') || str.endsWith('x')) return str + 'es'
  return str + 's'
}

/** Get display-worthy columns (exclude id, user_id, timestamps) */
function getDisplayColumns(table: TableDef): ColumnDef[] {
  return table.columns.filter((col) => {
    if (col.primaryKey) return false
    if (col.name === 'user_id') return false
    if (col.name === 'created_at' || col.name === 'updated_at') return false
    return true
  })
}

function generateListPage(table: TableDef): string {
  const camel = snakeToCamel(table.name)
  const pascal = snakeToPascal(table.name)
  const pluralPascal = snakeToPascal(pluralize(table.name))
  const pluralKebab = snakeToKebab(pluralize(table.name))

  return `// Auto-generated skeleton by VibeStack — LLM fills SLOT sections
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}ListPage,
})

function ${pascal}ListPage() {
  const ${pluralize(camel)} = trpc.${camel}.list.useQuery()
  const create${pascal} = trpc.${camel}.create.useMutation({
    onSuccess: () => ${pluralize(camel)}.refetch(),
  })
  const delete${pascal} = trpc.${camel}.delete.useMutation({
    onSuccess: () => ${pluralize(camel)}.refetch(),
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // {/* SLOT: COMPONENT_BODY — LLM fills the JSX return here */}
  return null
}
`
}

function generateDetailPage(table: TableDef): string {
  const camel = snakeToCamel(table.name)
  const pascal = snakeToPascal(table.name)
  const pluralKebab = snakeToKebab(pluralize(table.name))

  return `// Auto-generated skeleton by VibeStack — LLM fills SLOT sections
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_authenticated/${pluralKebab}/$id')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  const ${camel} = trpc.${camel}.getById.useQuery({ id })
  const update${pascal} = trpc.${camel}.update.useMutation({
    onSuccess: () => ${camel}.refetch(),
  })
  const [isEditing, setIsEditing] = useState(false)

  // {/* SLOT: COMPONENT_BODY — LLM fills the JSX return here */}
  return null
}
`
}

/**
 * Generate page skeleton files from a SchemaContract.
 * Each table gets a list page and a detail page.
 * All imports, hooks, and state are deterministic — LLM only fills SLOT sections.
 */
export function contractToPages(contract: SchemaContract): PageFile[] {
  const pages: PageFile[] = []

  for (const table of contract.tables) {
    const kebab = snakeToKebab(table.name)
    const pluralKebab = snakeToKebab(pluralize(table.name))

    pages.push({
      fileName: `${kebab}.tsx`,
      routePath: `/_authenticated/${pluralKebab}`,
      content: generateListPage(table),
    })

    pages.push({
      fileName: `${kebab}.$id.tsx`,
      routePath: `/_authenticated/${pluralKebab}/$id`,
      content: generateDetailPage(table),
    })
  }

  return pages
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/contract-to-pages.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/contract-to-pages.ts tests/contract-to-pages.test.ts
git commit -m "feat: add contractToPages — generates page skeletons with deterministic imports + SLOT markers"
```

---

### Task 5: Create AppBlueprint Type and contractToBlueprint

**Files:**
- Create: `server/lib/app-blueprint.ts`
- Test: `tests/app-blueprint.test.ts`

**Context:** The AppBlueprint is the central contract that ties SchemaContract + design preferences into a complete file tree. It calls all three generators (Drizzle, tRPC, Pages) and produces a structured manifest of every file that the generated app must contain.

**Step 1: Write the failing test**

Create `tests/app-blueprint.test.ts`:

```typescript
import { contractToBlueprint, type AppBlueprint } from '@server/lib/app-blueprint'
import type { SchemaContract, DesignPreferences } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToBlueprint', () => {
  const contract: SchemaContract = {
    tables: [
      {
        name: 'bookmark',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
          { name: 'url', type: 'text', nullable: false },
          { name: 'title', type: 'text' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
      },
      {
        name: 'tag',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'text', nullable: false, unique: true },
        ],
      },
    ],
  }

  const designPreferences: DesignPreferences = {
    style: 'modern',
    primaryColor: '#3b82f6',
    fontFamily: 'Inter',
  }

  it('produces a blueprint with meta, features, and fileTree', () => {
    const bp = contractToBlueprint({
      appName: 'MarkNest',
      appDescription: 'A bookmark manager',
      contract,
      designPreferences,
    })

    expect(bp.meta.appName).toBe('MarkNest')
    expect(bp.features.auth).toBe(true)
    expect(bp.features.entities).toContain('bookmark')
    expect(bp.features.entities).toContain('tag')
  })

  it('includes all layer 1 files (Drizzle schema, index.css, index.html)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('server/db/schema.ts')
    expect(paths).toContain('src/index.css')
    expect(paths).toContain('index.html')
  })

  it('includes all layer 2 files (tRPC routers, root router, .env, migration)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('server/trpc/routers/bookmark.ts')
    expect(paths).toContain('server/trpc/routers/tag.ts')
    expect(paths).toContain('server/trpc/router.ts')
    expect(paths).toContain('.env')
    expect(paths).toContain('drizzle/0001_initial.sql')
  })

  it('includes all layer 4 page skeletons', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/routes/_authenticated/bookmark.tsx')
    expect(paths).toContain('src/routes/_authenticated/bookmark.$id.tsx')
    expect(paths).toContain('src/routes/_authenticated/tag.tsx')
  })

  it('includes layer 5 wiring files (main.tsx, app-layout)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/main.tsx')
    expect(paths).toContain('src/components/app-layout.tsx')
  })

  it('marks LLM-filled files with isLLMSlot=true', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const pageFile = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/bookmark.tsx')
    expect(pageFile?.isLLMSlot).toBe(true)

    const schemaFile = bp.fileTree.find((f) => f.path === 'server/db/schema.ts')
    expect(schemaFile?.isLLMSlot).toBe(false)
  })

  it('assigns correct layers to files', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const schemaFile = bp.fileTree.find((f) => f.path === 'server/db/schema.ts')
    expect(schemaFile?.layer).toBe(1)

    const routerFile = bp.fileTree.find((f) => f.path === 'server/trpc/routers/bookmark.ts')
    expect(routerFile?.layer).toBe(2)

    const pageFile = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/bookmark.tsx')
    expect(pageFile?.layer).toBe(4)

    const mainFile = bp.fileTree.find((f) => f.path === 'src/main.tsx')
    expect(mainFile?.layer).toBe(5)
  })

  it('generates index.css with theme variables from designPreferences', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const cssFile = bp.fileTree.find((f) => f.path === 'src/index.css')
    expect(cssFile?.content).toContain('@import "tailwindcss"')
    expect(cssFile?.content).toContain('@theme')
    expect(cssFile?.content).toContain('--color-primary')
  })

  it('generates .env with placeholder Supabase credentials', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const envFile = bp.fileTree.find((f) => f.path === '.env')
    expect(envFile?.content).toContain('DATABASE_URL=')
    expect(envFile?.content).toContain('SUPABASE_URL=')
    expect(envFile?.content).toContain('SUPABASE_ANON_KEY=')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/app-blueprint.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/app-blueprint.ts`:

```typescript
import type { SchemaContract, DesignPreferences } from './schema-contract'
import { inferFeatures, type InferredFeatures } from './schema-contract'
import { contractToDrizzle } from './contract-to-drizzle'
import { contractToTrpc, contractToRootRouter } from './contract-to-trpc'
import { contractToPages } from './contract-to-pages'
import { contractToSQL } from './contract-to-sql'

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
    designPreferences: DesignPreferences
  }
  features: InferredFeatures
  contract: SchemaContract
  fileTree: BlueprintFile[]
}

interface BlueprintInput {
  appName: string
  appDescription: string
  contract: SchemaContract
  designPreferences: DesignPreferences
}

function snakeToPascal(str: string): string {
  return str.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function snakeToKebab(str: string): string {
  return str.replace(/_/g, '-')
}

function pluralize(str: string): string {
  if (str.endsWith('y')) return str.slice(0, -1) + 'ies'
  if (str.endsWith('s') || str.endsWith('sh') || str.endsWith('ch') || str.endsWith('x')) return str + 'es'
  return str + 's'
}

/** Generate Tailwind v4 CSS theme with shadcn/ui color tokens */
function generateIndexCSS(prefs: DesignPreferences): string {
  return `@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.145 0 0);
  --color-popover: oklch(1 0 0);
  --color-popover-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-secondary: oklch(0.97 0 0);
  --color-secondary-foreground: oklch(0.205 0 0);
  --color-muted: oklch(0.97 0 0);
  --color-muted-foreground: oklch(0.556 0 0);
  --color-accent: oklch(0.97 0 0);
  --color-accent-foreground: oklch(0.205 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-destructive-foreground: oklch(0.985 0 0);
  --color-border: oklch(0.922 0 0);
  --color-input: oklch(0.922 0 0);
  --color-ring: oklch(0.708 0 0);
  --radius: 0.625rem;
  --font-sans: '${prefs.fontFamily}', ui-sans-serif, system-ui, sans-serif;
}
`
}

/** Generate index.html for the Vite SPA */
function generateIndexHTML(appName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}

/** Generate main.tsx with providers and router */
function generateMainTSX(features: InferredFeatures): string {
  const authImport = features.auth ? `\nimport { AuthProvider } from '@/lib/auth'` : ''
  const authWrapStart = features.auth ? `\n        <AuthProvider>` : ''
  const authWrapEnd = features.auth ? `\n        </AuthProvider>` : ''

  return `// Auto-generated by VibeStack — do not edit manually
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { trpc, trpcClient } from '@/lib/trpc'
import { routeTree } from './routeTree.gen'
import './index.css'${authImport}

const queryClient = new QueryClient()
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>${authWrapStart}
        <RouterProvider router={router} />${authWrapEnd}
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
)
`
}

/** Generate app-layout.tsx with nav links derived from features */
function generateAppLayout(appName: string, features: InferredFeatures): string {
  const navLinks = features.entities.map((entity) => {
    const plural = pluralize(entity)
    const label = snakeToPascal(plural)
    const kebab = snakeToKebab(plural)
    return `  { to: '/${kebab}', label: '${label}' }`
  }).join(',\n')

  return `// Auto-generated by VibeStack — do not edit manually
import { Link, Outlet } from '@tanstack/react-router'

const navLinks = [
${navLinks},
]

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <nav className="container mx-auto flex items-center gap-6 py-4">
          <Link to="/" className="text-lg font-bold">${appName}</Link>
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: 'text-foreground font-medium' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container mx-auto py-6">
        <Outlet />
      </main>
    </div>
  )
}
`
}

/** Generate .env with placeholder credentials (replaced by infra provisioning) */
function generateDotEnv(): string {
  return `# Auto-generated — values injected by VibeStack infra provisioning
DATABASE_URL=__PLACEHOLDER__
SUPABASE_URL=__PLACEHOLDER__
SUPABASE_ANON_KEY=__PLACEHOLDER__
`
}

/**
 * Generate a complete AppBlueprint from SchemaContract + design preferences.
 * The blueprint contains every file the generated app needs, organized by dependency layer.
 */
export function contractToBlueprint(input: BlueprintInput): AppBlueprint {
  const features = inferFeatures(input.contract)
  const fileTree: BlueprintFile[] = []

  // Layer 1: Schema + CSS + HTML (all independent)
  fileTree.push({
    path: 'server/db/schema.ts',
    content: contractToDrizzle(input.contract),
    layer: 1,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'src/index.css',
    content: generateIndexCSS(input.designPreferences),
    layer: 1,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'index.html',
    content: generateIndexHTML(input.appName),
    layer: 1,
    isLLMSlot: false,
  })

  // Layer 2: tRPC routers, root router, .env, SQL migration (depend on schema)
  const routers = contractToTrpc(input.contract)
  for (const router of routers) {
    fileTree.push({
      path: `server/trpc/routers/${router.fileName}`,
      content: router.content,
      layer: 2,
      isLLMSlot: false,
    })
  }
  fileTree.push({
    path: 'server/trpc/router.ts',
    content: contractToRootRouter(input.contract),
    layer: 2,
    isLLMSlot: false,
  })
  fileTree.push({
    path: '.env',
    content: generateDotEnv(),
    layer: 2,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'drizzle/0001_initial.sql',
    content: contractToSQL(input.contract),
    layer: 2,
    isLLMSlot: false,
  })

  // Layer 3: Auth guard route (if auth is enabled) — deterministic
  if (features.auth) {
    fileTree.push({
      path: 'src/routes/_authenticated/route.tsx',
      content: `// Auto-generated by VibeStack
import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppLayout } from '@/components/app-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    // Auth check handled by tRPC context — if not authenticated, tRPC returns 401
  },
  component: AppLayout,
})
`,
      layer: 3,
      isLLMSlot: false,
    })
  }

  // Layer 4: Page skeletons (LLM fills JSX bodies)
  const pages = contractToPages(input.contract)
  for (const page of pages) {
    fileTree.push({
      path: `src/routes/_authenticated/${page.fileName}`,
      content: page.content,
      layer: 4,
      isLLMSlot: true,
    })
  }

  // Layer 5: Wiring files (depend on routes being defined)
  fileTree.push({
    path: 'src/main.tsx',
    content: generateMainTSX(features),
    layer: 5,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'src/components/app-layout.tsx',
    content: generateAppLayout(input.appName, features),
    layer: 5,
    isLLMSlot: false,
  })

  return {
    meta: {
      appName: input.appName,
      appDescription: input.appDescription,
      designPreferences: input.designPreferences,
    },
    features,
    contract: input.contract,
    fileTree,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/app-blueprint.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/app-blueprint.ts tests/app-blueprint.test.ts
git commit -m "feat: add AppBlueprint — deterministic file tree from SchemaContract + design prefs"
```

---

### Task 6: Create blueprintToSandbox Writer

**Files:**
- Create: `server/lib/blueprint-to-sandbox.ts`
- Test: `tests/blueprint-to-sandbox.test.ts`

**Context:** Writes all blueprint files to a Daytona sandbox, layer by layer. This is a thin wrapper around the sandbox filesystem API. Testing uses a mock sandbox.

**Step 1: Write the failing test**

Create `tests/blueprint-to-sandbox.test.ts`:

```typescript
import { blueprintToSandbox } from '@server/lib/blueprint-to-sandbox'
import type { AppBlueprint, BlueprintFile } from '@server/lib/app-blueprint'
import { describe, expect, it, vi } from 'vitest'

describe('blueprintToSandbox', () => {
  const mockUploadFile = vi.fn().mockResolvedValue(undefined)
  const mockSandbox = {
    fs: { uploadFile: mockUploadFile },
  }

  const blueprint: AppBlueprint = {
    meta: { appName: 'Test', appDescription: '', designPreferences: { style: 'modern', primaryColor: '#000', fontFamily: 'Inter' } },
    features: { auth: false, entities: ['item'] },
    contract: { tables: [] },
    fileTree: [
      { path: 'server/db/schema.ts', content: 'schema content', layer: 1, isLLMSlot: false },
      { path: 'src/routes/_authenticated/item.tsx', content: 'page skeleton', layer: 4, isLLMSlot: true },
      { path: 'src/main.tsx', content: 'main content', layer: 5, isLLMSlot: false },
    ],
  }

  it('writes all non-LLM files to sandbox', async () => {
    mockUploadFile.mockClear()
    const result = await blueprintToSandbox(blueprint, mockSandbox as any)
    // Should write layer 1, 4 (skeleton), and 5 files
    expect(mockUploadFile).toHaveBeenCalledTimes(3)
    expect(result.filesWritten).toBe(3)
  })

  it('writes files in layer order (1 before 4 before 5)', async () => {
    mockUploadFile.mockClear()
    await blueprintToSandbox(blueprint, mockSandbox as any)
    const paths = mockUploadFile.mock.calls.map((call: unknown[]) => (call as [Buffer, string])[1])
    const schemaIdx = paths.findIndex((p: string) => p.includes('schema.ts'))
    const pageIdx = paths.findIndex((p: string) => p.includes('item.tsx'))
    const mainIdx = paths.findIndex((p: string) => p.includes('main.tsx'))
    expect(schemaIdx).toBeLessThan(pageIdx)
    expect(pageIdx).toBeLessThan(mainIdx)
  })

  it('prefixes paths with /workspace/', async () => {
    mockUploadFile.mockClear()
    await blueprintToSandbox(blueprint, mockSandbox as any)
    const firstPath = mockUploadFile.mock.calls[0][1]
    expect(firstPath).toMatch(/^\/workspace\//)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/blueprint-to-sandbox.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/blueprint-to-sandbox.ts`:

```typescript
import type { AppBlueprint } from './app-blueprint'

interface SandboxFS {
  fs: {
    uploadFile(content: Buffer, path: string): Promise<void>
  }
}

interface WriteResult {
  filesWritten: number
  errors: string[]
}

/**
 * Write all blueprint files to a Daytona sandbox, sorted by layer.
 * Layer ordering ensures dependencies are written before dependents.
 */
export async function blueprintToSandbox(
  blueprint: AppBlueprint,
  sandbox: SandboxFS,
): Promise<WriteResult> {
  const sorted = [...blueprint.fileTree].sort((a, b) => a.layer - b.layer)
  const errors: string[] = []
  let filesWritten = 0

  for (const file of sorted) {
    try {
      await sandbox.fs.uploadFile(
        Buffer.from(file.content),
        `/workspace/${file.path}`,
      )
      filesWritten++
    } catch (err) {
      errors.push(`Failed to write ${file.path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { filesWritten, errors }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/blueprint-to-sandbox.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/blueprint-to-sandbox.ts tests/blueprint-to-sandbox.test.ts
git commit -m "feat: add blueprintToSandbox — writes blueprint files to sandbox in layer order"
```

---

### Task 7: Create Validation Gate

**Files:**
- Create: `server/lib/agents/validation.ts`
- Test: `tests/validation-gate.test.ts`

**Context:** Runs after code generation to validate the generated app. Checks: manifest (all files exist), scaffold detection (no placeholder strings), TypeScript, lint, build, boot test. Returns structured errors for the repair agent.

**Step 1: Write the failing test**

Create `tests/validation-gate.test.ts`:

```typescript
import { checkManifest, checkScaffold, type ValidationResult } from '@server/lib/agents/validation'
import type { AppBlueprint, BlueprintFile } from '@server/lib/app-blueprint'
import { describe, expect, it, vi } from 'vitest'

describe('checkManifest', () => {
  it('passes when all blueprint files exist in sandbox', async () => {
    const blueprint: AppBlueprint = {
      meta: { appName: 'Test', appDescription: '', designPreferences: { style: '', primaryColor: '', fontFamily: '' } },
      features: { auth: false, entities: [] },
      contract: { tables: [] },
      fileTree: [
        { path: 'src/main.tsx', content: '', layer: 5, isLLMSlot: false },
        { path: 'server/db/schema.ts', content: '', layer: 1, isLLMSlot: false },
      ],
    }
    const mockListFiles = vi.fn().mockResolvedValue(['src/main.tsx', 'server/db/schema.ts', 'package.json'])
    const result = await checkManifest(blueprint, mockListFiles)
    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails when blueprint files are missing from sandbox', async () => {
    const blueprint: AppBlueprint = {
      meta: { appName: 'Test', appDescription: '', designPreferences: { style: '', primaryColor: '', fontFamily: '' } },
      features: { auth: false, entities: [] },
      contract: { tables: [] },
      fileTree: [
        { path: 'src/main.tsx', content: '', layer: 5, isLLMSlot: false },
        { path: 'server/db/schema.ts', content: '', layer: 1, isLLMSlot: false },
      ],
    }
    const mockListFiles = vi.fn().mockResolvedValue(['src/main.tsx'])
    const result = await checkManifest(blueprint, mockListFiles)
    expect(result.passed).toBe(false)
    expect(result.errors[0]).toContain('server/db/schema.ts')
  })
})

describe('checkScaffold', () => {
  it('detects placeholder strings in file content', () => {
    const files = [
      { path: 'src/App.tsx', content: 'Building your app...' },
      { path: '.env', content: 'SUPABASE_URL=__PLACEHOLDER__' },
    ]
    const result = checkScaffold(files)
    expect(result.passed).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
  })

  it('passes clean files', () => {
    const files = [
      { path: 'src/main.tsx', content: 'import { createRoot } from "react-dom/client"' },
    ]
    const result = checkScaffold(files)
    expect(result.passed).toBe(true)
  })

  it('detects require() in ESM files', () => {
    const files = [
      { path: 'src/hooks.ts', content: 'const x = require("@tanstack/react-query")' },
    ]
    const result = checkScaffold(files)
    expect(result.passed).toBe(false)
    expect(result.errors[0]).toContain('require()')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/validation-gate.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/agents/validation.ts`:

```typescript
import type { AppBlueprint } from '../app-blueprint'

export interface ValidationResult {
  passed: boolean
  errors: string[]
}

export interface ValidationGateResult {
  manifest: ValidationResult
  scaffold: ValidationResult
  typecheck: ValidationResult
  lint: ValidationResult
  build: ValidationResult
  allPassed: boolean
}

const PLACEHOLDER_PATTERNS = [
  /Building your app/i,
  /your_supabase_project/,
  /__PLACEHOLDER__/,
  /TODO:/i,
  /FIXME:/i,
  /placeholder/i,
  /localhost:\d+/,
]

const REQUIRE_PATTERN = /\brequire\s*\(/

/**
 * Check that all files in the blueprint manifest exist in the sandbox.
 */
export async function checkManifest(
  blueprint: AppBlueprint,
  listFiles: () => Promise<string[]>,
): Promise<ValidationResult> {
  const sandboxFiles = new Set(await listFiles())
  const missing = blueprint.fileTree
    .filter((f) => !sandboxFiles.has(f.path))
    .map((f) => `Missing file: ${f.path}`)

  return {
    passed: missing.length === 0,
    errors: missing,
  }
}

/**
 * Check for placeholder/scaffold strings and forbidden patterns.
 * AB-02 from app.build paper — detect template strings that were never replaced.
 */
export function checkScaffold(
  files: Array<{ path: string; content: string }>,
): ValidationResult {
  const errors: string[] = []

  for (const file of files) {
    // Skip non-source files
    if (!file.path.match(/\.(ts|tsx|css|html|json)$/)) continue
    // Skip .env (has intentional placeholders that get replaced by infra)
    if (file.path === '.env') continue

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(file.content)) {
        errors.push(`${file.path}: contains placeholder pattern "${pattern.source}"`)
      }
    }

    // Check for require() in TypeScript/TSX files
    if (file.path.match(/\.(ts|tsx)$/) && REQUIRE_PATTERN.test(file.content)) {
      errors.push(`${file.path}: contains require() — must use ESM import`)
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  }
}

/**
 * Run the full validation gate on a sandbox.
 * Returns structured results for each check.
 */
export async function runValidationGate(
  blueprint: AppBlueprint,
  sandbox: {
    fs: { listFiles(path: string): Promise<string[]>; downloadFile(path: string): Promise<Buffer> }
    process: { executeCommand(cmd: string, cwd: string, env?: Record<string, string>, timeout?: number): Promise<{ exitCode: number; result: string }> }
  },
): Promise<ValidationGateResult> {
  // 1. Manifest check
  const manifest = await checkManifest(blueprint, () => sandbox.fs.listFiles('/workspace'))

  // 2. Scaffold check — read source files and check for placeholders
  const sourceFiles: Array<{ path: string; content: string }> = []
  for (const file of blueprint.fileTree) {
    if (file.path.match(/\.(ts|tsx|css|html)$/)) {
      try {
        const content = await sandbox.fs.downloadFile(`/workspace/${file.path}`)
        sourceFiles.push({ path: file.path, content: content.toString() })
      } catch {
        // File doesn't exist — already caught by manifest check
      }
    }
  }
  const scaffold = checkScaffold(sourceFiles)

  // 3. TypeScript check
  const tscResult = await sandbox.process.executeCommand('tsc --noEmit', '/workspace', undefined, 60)
  const typecheck: ValidationResult = {
    passed: tscResult.exitCode === 0,
    errors: tscResult.exitCode !== 0 ? [tscResult.result] : [],
  }

  // 4. Lint check
  const lintResult = await sandbox.process.executeCommand('bunx biome check --write', '/workspace', undefined, 30)
  const lint: ValidationResult = {
    passed: lintResult.exitCode === 0,
    errors: lintResult.exitCode !== 0 ? [lintResult.result] : [],
  }

  // 5. Build check
  const buildResult = await sandbox.process.executeCommand('bun run build', '/workspace', undefined, 120)
  const build: ValidationResult = {
    passed: buildResult.exitCode === 0,
    errors: buildResult.exitCode !== 0 ? [buildResult.result] : [],
  }

  return {
    manifest,
    scaffold,
    typecheck,
    lint,
    build,
    allPassed: manifest.passed && scaffold.passed && typecheck.passed && lint.passed && build.passed,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/validation-gate.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/validation.ts tests/validation-gate.test.ts
git commit -m "feat: add validation gate — manifest, scaffold, tsc, lint, build checks"
```

---

### Task 8: Create Repair Agent Prompt Builder

**Files:**
- Create: `server/lib/agents/repair.ts`
- Test: `tests/repair-agent.test.ts`

**Context:** Builds structured repair prompts from validation errors. The repair agent receives: the exact failing file, the exact error, and the skeleton it should conform to.

**Step 1: Write the failing test**

Create `tests/repair-agent.test.ts`:

```typescript
import { buildRepairPrompt } from '@server/lib/agents/repair'
import type { ValidationGateResult } from '@server/lib/agents/validation'
import { describe, expect, it } from 'vitest'

describe('buildRepairPrompt', () => {
  it('includes failing file path and error in prompt', () => {
    const errors: ValidationGateResult = {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: true, errors: [] },
      typecheck: {
        passed: false,
        errors: ["src/routes/_authenticated/bookmark.tsx(15,3): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'."],
      },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }
    const skeleton = '// skeleton content\nfunction BookmarkListPage() { ... }'

    const prompt = buildRepairPrompt(errors, [{ path: 'src/routes/_authenticated/bookmark.tsx', content: skeleton }])
    expect(prompt).toContain('bookmark.tsx')
    expect(prompt).toContain('TS2345')
    expect(prompt).toContain('skeleton content')
  })

  it('returns null for non-repairable errors (manifest missing)', () => {
    const errors: ValidationGateResult = {
      manifest: { passed: false, errors: ['Missing file: src/main.tsx'] },
      scaffold: { passed: true, errors: [] },
      typecheck: { passed: true, errors: [] },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }
    const prompt = buildRepairPrompt(errors, [])
    expect(prompt).toBeNull()
  })

  it('limits prompt to first 5 errors', () => {
    const manyErrors = Array.from({ length: 10 }, (_, i) =>
      `file${i}.tsx(1,1): error TS0000: Error ${i}`,
    )
    const errors: ValidationGateResult = {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: true, errors: [] },
      typecheck: { passed: false, errors: manyErrors },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }
    const prompt = buildRepairPrompt(errors, [])
    expect(prompt).toBeDefined()
    // Should mention truncation
    expect(prompt!).toContain('5')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/repair-agent.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/agents/repair.ts`:

```typescript
import type { ValidationGateResult } from './validation'

const MAX_ERRORS_IN_PROMPT = 5

/**
 * Build a structured repair prompt from validation errors.
 * Returns null if errors are not repairable (e.g., missing manifest files).
 */
export function buildRepairPrompt(
  validation: ValidationGateResult,
  skeletons: Array<{ path: string; content: string }>,
): string | null {
  // Manifest errors are not repairable — indicates pipeline bug
  if (!validation.manifest.passed) return null

  const allErrors = [
    ...validation.scaffold.errors.map((e) => `[scaffold] ${e}`),
    ...validation.typecheck.errors.map((e) => `[typecheck] ${e}`),
    ...validation.lint.errors.map((e) => `[lint] ${e}`),
    ...validation.build.errors.map((e) => `[build] ${e}`),
  ]

  if (allErrors.length === 0) return null

  const truncated = allErrors.slice(0, MAX_ERRORS_IN_PROMPT)
  const truncationNote = allErrors.length > MAX_ERRORS_IN_PROMPT
    ? `\n(Showing first ${MAX_ERRORS_IN_PROMPT} of ${allErrors.length} errors — fix these first, the rest may resolve.)`
    : ''

  // Extract file paths from error messages for context
  const errorFilePaths = new Set<string>()
  for (const err of truncated) {
    const match = err.match(/(?:src|server)\/[^\s:(]+/)
    if (match) errorFilePaths.add(match[0])
  }

  // Include relevant skeletons
  const relevantSkeletons = skeletons
    .filter((s) => errorFilePaths.has(s.path))
    .map((s) => `--- ${s.path} ---\n${s.content}`)
    .join('\n\n')

  return `You are a repair agent. Fix the validation errors below in the generated app.

## Errors
${truncated.join('\n')}${truncationNote}

## Rules
1. Only modify files that have errors — do not touch other files
2. Preserve the skeleton structure (imports, hooks, state declarations)
3. Only fix the specific error — do not refactor or add features
4. Use ESM imports (never require())
5. No TODO/FIXME/placeholder comments

${relevantSkeletons ? `## Relevant File Skeletons\n${relevantSkeletons}` : ''}

Fix each error and write the corrected file(s) to the sandbox.`
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/repair-agent.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/repair.ts tests/repair-agent.test.ts
git commit -m "feat: add repair agent prompt builder — structured error context for targeted fixes"
```

---

### Task 9: Create XState Machine Definition

**Files:**
- Create: `server/lib/agents/machine.ts`
- Test: `tests/machine.test.ts`

**Context:** This is the core state machine replacing `appGenerationWorkflow`. Uses XState v5 `fromPromise` actors to invoke Mastra agents and deterministic functions. State is persistable via `getPersistedSnapshot()`.

**Prerequisite:** Install xstate: `bun add xstate`

**Step 1: Install XState**

Run: `bun add xstate`
Expected: xstate added to package.json

**Step 2: Write the failing test**

Create `tests/machine.test.ts`:

```typescript
import { createActor } from 'xstate'
import { appGenerationMachine } from '@server/lib/agents/machine'
import { describe, expect, it } from 'vitest'

describe('appGenerationMachine', () => {
  it('starts in idle state', () => {
    const actor = createActor(appGenerationMachine)
    expect(actor.getSnapshot().value).toBe('idle')
  })

  it('transitions to analyzing on START event', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    actor.send({
      type: 'START',
      userMessage: 'Build a bookmark app',
      projectId: 'test-123',
    })
    expect(actor.getSnapshot().value).toBe('analyzing')
    actor.stop()
  })

  it('has all expected states', () => {
    // Verify the machine definition includes all states from the design
    const states = Object.keys(appGenerationMachine.config.states ?? {})
    expect(states).toContain('idle')
    expect(states).toContain('analyzing')
    expect(states).toContain('awaitingClarification')
    expect(states).toContain('blueprinting')
    expect(states).toContain('provisioning')
    expect(states).toContain('generating')
    expect(states).toContain('validating')
    expect(states).toContain('repairing')
    expect(states).toContain('deploying')
    expect(states).toContain('complete')
    expect(states).toContain('failed')
  })

  it('stores retryCount in context', () => {
    const actor = createActor(appGenerationMachine)
    actor.start()
    const snapshot = actor.getSnapshot()
    expect(snapshot.context.retryCount).toBe(0)
  })
})
```

**Step 2b: Run test to verify it fails**

Run: `bunx vitest run tests/machine.test.ts --reporter=verbose`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `server/lib/agents/machine.ts`:

```typescript
import { setup, assign, fromPromise } from 'xstate'
import type { AppBlueprint } from '../app-blueprint'
import type { SchemaContract, DesignPreferences } from '../schema-contract'
import type { ValidationGateResult } from './validation'

// ============================================================================
// Context type — all data flowing through the machine
// ============================================================================

export interface MachineContext {
  // Input
  userMessage: string
  projectId: string

  // Analyst output
  appName: string
  appDescription: string
  contract: SchemaContract | null
  designPreferences: DesignPreferences | null

  // Clarification
  clarificationQuestions: unknown[] | null

  // Blueprint
  blueprint: AppBlueprint | null

  // Infrastructure
  sandboxId: string | null
  supabaseProjectId: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  githubCloneUrl: string | null
  githubHtmlUrl: string | null
  repoName: string | null

  // Validation
  validation: ValidationGateResult | null
  retryCount: number

  // Deploy
  deploymentUrl: string | null

  // Error
  error: string | null
}

// ============================================================================
// Event types
// ============================================================================

type MachineEvent =
  | { type: 'START'; userMessage: string; projectId: string }
  | { type: 'USER_ANSWERED'; answers: string }
  | { type: 'ANALYST_DONE'; appName: string; appDescription: string; contract: SchemaContract; designPreferences: DesignPreferences }
  | { type: 'CLARIFICATION_NEEDED'; questions: unknown[] }
  | { type: 'BLUEPRINT_DONE'; blueprint: AppBlueprint }
  | { type: 'PROVISION_DONE'; sandboxId: string; supabaseProjectId: string; supabaseUrl: string; supabaseAnonKey: string; githubCloneUrl: string; githubHtmlUrl: string; repoName: string }
  | { type: 'SCAFFOLD_DONE' }
  | { type: 'CODEGEN_DONE' }
  | { type: 'VALIDATION_PASS' }
  | { type: 'VALIDATION_FAIL'; validation: ValidationGateResult }
  | { type: 'REPAIR_DONE' }
  | { type: 'DEPLOY_DONE'; deploymentUrl: string }
  | { type: 'ERROR'; error: string }

// ============================================================================
// Machine definition
// ============================================================================

export const appGenerationMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < 2,
    cannotRetry: ({ context }) => context.retryCount >= 2,
  },
  actions: {
    setAnalystOutput: assign({
      appName: (_, params: { appName: string }) => params.appName,
      appDescription: (_, params: { appDescription: string }) => params.appDescription,
      contract: (_, params: { contract: SchemaContract }) => params.contract,
      designPreferences: (_, params: { designPreferences: DesignPreferences }) => params.designPreferences,
    }),
    setClarification: assign({
      clarificationQuestions: (_, params: { questions: unknown[] }) => params.questions,
    }),
    setBlueprint: assign({
      blueprint: (_, params: { blueprint: AppBlueprint }) => params.blueprint,
    }),
    setInfra: assign({
      sandboxId: (_, params: { sandboxId: string }) => params.sandboxId,
      supabaseProjectId: (_, params: { supabaseProjectId: string }) => params.supabaseProjectId,
      supabaseUrl: (_, params: { supabaseUrl: string }) => params.supabaseUrl,
      supabaseAnonKey: (_, params: { supabaseAnonKey: string }) => params.supabaseAnonKey,
      githubCloneUrl: (_, params: { githubCloneUrl: string }) => params.githubCloneUrl,
      githubHtmlUrl: (_, params: { githubHtmlUrl: string }) => params.githubHtmlUrl,
      repoName: (_, params: { repoName: string }) => params.repoName,
    }),
    setValidationFail: assign({
      validation: (_, params: { validation: ValidationGateResult }) => params.validation,
      retryCount: ({ context }) => context.retryCount + 1,
    }),
    setDeployment: assign({
      deploymentUrl: (_, params: { deploymentUrl: string }) => params.deploymentUrl,
    }),
    setError: assign({
      error: (_, params: { error: string }) => params.error,
    }),
  },
}).createMachine({
  id: 'appGeneration',
  initial: 'idle',
  context: {
    userMessage: '',
    projectId: '',
    appName: '',
    appDescription: '',
    contract: null,
    designPreferences: null,
    clarificationQuestions: null,
    blueprint: null,
    sandboxId: null,
    supabaseProjectId: null,
    supabaseUrl: null,
    supabaseAnonKey: null,
    githubCloneUrl: null,
    githubHtmlUrl: null,
    repoName: null,
    validation: null,
    retryCount: 0,
    deploymentUrl: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        START: {
          target: 'analyzing',
          actions: assign({
            userMessage: ({ event }) => event.userMessage,
            projectId: ({ event }) => event.projectId,
          }),
        },
      },
    },

    analyzing: {
      on: {
        ANALYST_DONE: {
          target: 'blueprinting',
          actions: {
            type: 'setAnalystOutput',
            params: ({ event }) => event,
          },
        },
        CLARIFICATION_NEEDED: {
          target: 'awaitingClarification',
          actions: {
            type: 'setClarification',
            params: ({ event }) => event,
          },
        },
        ERROR: {
          target: 'failed',
          actions: { type: 'setError', params: ({ event }) => event },
        },
      },
    },

    awaitingClarification: {
      on: {
        USER_ANSWERED: {
          target: 'analyzing',
          actions: assign({
            userMessage: ({ context, event }) =>
              `${context.userMessage}\n\nUser's answers:\n${event.answers}`,
          }),
        },
      },
    },

    blueprinting: {
      on: {
        BLUEPRINT_DONE: {
          target: 'provisioning',
          actions: {
            type: 'setBlueprint',
            params: ({ event }) => event,
          },
        },
        ERROR: {
          target: 'failed',
          actions: { type: 'setError', params: ({ event }) => event },
        },
      },
    },

    provisioning: {
      on: {
        PROVISION_DONE: {
          target: 'generating',
          actions: {
            type: 'setInfra',
            params: ({ event }) => event,
          },
        },
        ERROR: {
          target: 'failed',
          actions: { type: 'setError', params: ({ event }) => event },
        },
      },
    },

    generating: {
      on: {
        CODEGEN_DONE: 'validating',
        ERROR: {
          target: 'failed',
          actions: { type: 'setError', params: ({ event }) => event },
        },
      },
    },

    validating: {
      on: {
        VALIDATION_PASS: 'deploying',
        VALIDATION_FAIL: [
          {
            guard: 'canRetry',
            target: 'repairing',
            actions: {
              type: 'setValidationFail',
              params: ({ event }) => event,
            },
          },
          {
            guard: 'cannotRetry',
            target: 'failed',
            actions: assign({
              error: () => 'Validation failed after maximum retries',
            }),
          },
        ],
        ERROR: {
          target: 'failed',
          actions: { type: 'setError', params: ({ event }) => event },
        },
      },
    },

    repairing: {
      on: {
        REPAIR_DONE: 'validating',
        ERROR: {
          target: 'failed',
          actions: { type: 'setError', params: ({ event }) => event },
        },
      },
    },

    deploying: {
      on: {
        DEPLOY_DONE: {
          target: 'complete',
          actions: {
            type: 'setDeployment',
            params: ({ event }) => event,
          },
        },
        ERROR: {
          target: 'failed',
          actions: { type: 'setError', params: ({ event }) => event },
        },
      },
    },

    complete: {
      type: 'final',
    },

    failed: {
      type: 'final',
    },
  },
})
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/machine.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/machine.ts tests/machine.test.ts package.json bun.lockb
git commit -m "feat: add XState appGenerationMachine — FSM replacing Mastra workflow"
```

---

### Task 10: Update Agent Registry (Remove 6 Agents, Add Repair, Scope Down)

**Files:**
- Modify: `server/lib/agents/registry.ts`
- Test: `tests/agent-registry.test.ts`

**Context:** Remove: supervisor, dba, infra, reviewer, qa, devops, pm. Keep: analyst, backend (scoped to custom procedures only), frontend (scoped to JSX slot-filling). Add: repair agent.

**Step 1: Read current test file**

Run: `bunx vitest run tests/agent-registry.test.ts --reporter=verbose` to see current state.

**Step 2: Update registry**

In `server/lib/agents/registry.ts`:

1. Remove imports and exports for: `supervisorAgent`, `infraAgent`, `dbaAgent`, `reviewerAgent`, `qaAgent`, `devOpsAgent`, `pmAgent`
2. Remove the `Memory`, `PgVector`, `ModelRouterEmbeddingModel` imports and supervisor memory config
3. Remove `backendWorkspace` and `frontendWorkspace` (workspace skills remain but are simplified)
4. Update `backendAgent` instructions to focus on custom tRPC procedures only
5. Update `frontendAgent` instructions to focus on filling SLOT sections in page skeletons
6. Add `repairAgent` with targeted error-fixing instructions
7. Remove `contractToHooksTool` and `contractToRoutesTool` from imports and agent tools

**Step 3: Update test file**

Update `tests/agent-registry.test.ts` to verify:
- Only 4 agents exported: `analystAgent`, `backendAgent`, `frontendAgent`, `repairAgent`
- Each agent has correct tools
- Repair agent has `writeFile`, `readFile`, `runCommand` tools

**Step 4: Run tests**

Run: `bunx vitest run tests/agent-registry.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/registry.ts tests/agent-registry.test.ts
git commit -m "feat: reduce agent roster 9→3+1 — keep analyst/backend/frontend, add repair"
```

---

### Task 11: Rewrite Agent Route for XState

**Files:**
- Modify: `server/routes/agent.ts`
- Test: `tests/agent-route.test.ts`

**Context:** Replace Mastra `workflow.createRun()` with XState `createActor(appGenerationMachine)`. The route creates an actor, sends START, and streams state transitions as SSE events. Clarification resume sends USER_ANSWERED event to the same actor.

**Step 1: Read current tests**

Read `tests/agent-route.test.ts` to understand existing assertions.

**Step 2: Rewrite the route**

Key changes:
1. Import `createActor` from 'xstate' and `appGenerationMachine` from machine.ts
2. Replace `mastra.getWorkflow('appGeneration')` with `createActor(appGenerationMachine)`
3. Replace `run.stream()` with actor event subscription
4. Map XState state transitions to SSE `StreamEvent` types
5. Store actor (not run) in `activeRuns` map
6. Resume route sends `{ type: 'USER_ANSWERED', answers }` to actor

**Step 3: Update tests**

**Step 4: Run tests**

Run: `bunx vitest run tests/agent-route.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/agent.ts tests/agent-route.test.ts
git commit -m "feat: rewrite agent route — XState actor replaces Mastra workflow"
```

---

### Task 12: Update Mastra Index

**Files:**
- Modify: `src/mastra/index.ts`

**Context:** Remove deleted agents and workflows. Keep only what's needed for Mastra Studio visibility.

**Step 1: Update the file**

```typescript
import { Mastra } from '@mastra/core'
import { PinoLogger } from '@mastra/loggers'
import {
  analystAgent,
  backendAgent,
  frontendAgent,
  repairAgent,
} from '../../server/lib/agents/registry'

export const mastra = new Mastra({
  agents: {
    analyst: analystAgent,
    backendEngineer: backendAgent,
    frontendEngineer: frontendAgent,
    repair: repairAgent,
  },
  workflows: {},
  logger: new PinoLogger({
    name: 'VibeStack',
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
})
```

**Step 2: Run typecheck**

Run: `bunx tsc -p tsconfig.server.json --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/mastra/index.ts
git commit -m "refactor: slim down Mastra index — 4 agents, 0 workflows (XState replaces)"
```

---

### Task 13: Delete Obsolete Files and Update Tests

**Files:**
- Delete: `server/lib/contract-to-hooks.ts`
- Delete: `server/lib/contract-to-routes.ts`
- Delete: `server/lib/contract-to-types.ts`
- Delete: `tests/contract-to-hooks.test.ts`
- Delete: `tests/contract-to-routes.test.ts`
- Delete: `tests/contract-to-types.test.ts`
- Modify: `server/lib/agents/tools.ts` — remove `contractToHooksTool` and `contractToRoutesTool`

**Step 1: Delete files**

```bash
rm server/lib/contract-to-hooks.ts server/lib/contract-to-routes.ts server/lib/contract-to-types.ts
rm tests/contract-to-hooks.test.ts tests/contract-to-routes.test.ts tests/contract-to-types.test.ts
```

**Step 2: Remove tool imports from tools.ts**

Remove the `contractToHooksTool` and `contractToRoutesTool` definitions and exports.

**Step 3: Update any remaining imports**

Search for imports of deleted modules and update or remove them.

**Step 4: Run full test suite**

Run: `bunx vitest run --reporter=verbose`
Expected: PASS — all remaining tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete contract-to-hooks/routes/types — tRPC + Drizzle replace all three"
```

---

### Task 14: Update Snapshot (package-base.json + Dockerfile)

**Files:**
- Modify: `snapshot/package-base.json`
- Modify: `snapshot/Dockerfile`
- Modify: `snapshot/warmup-scaffold/`

**Context:** Add tRPC, Drizzle, Hono, TanStack Query deps to the snapshot. Update warmup scaffold to use tRPC app structure so Vite and TypeScript caches are pre-built for the new architecture.

**Step 1: Update package-base.json**

Add to dependencies:
```json
{
  "@trpc/client": "^11.0.0",
  "@trpc/server": "^11.0.0",
  "@trpc/react-query": "^11.0.0",
  "@tanstack/react-query": "^5.0.0",
  "drizzle-orm": "^0.45.0",
  "hono": "^4.0.0",
  "@hono/node-server": "^1.0.0",
  "zod": "^4.0.0"
}
```

Add to devDependencies:
```json
{
  "drizzle-kit": "^0.31.0"
}
```

**Step 2: Update warmup scaffold**

Update `snapshot/warmup-scaffold/` files to include:
- `server/index.ts` — Hono entry + tRPC adapter stub
- `server/trpc/trpc.ts` — tRPC init stub
- `server/trpc/context.ts` — tRPC context stub
- `server/db/client.ts` — Drizzle client stub
- `src/lib/trpc.ts` — tRPC client setup
- Updated `vite.config.ts` with API proxy

**Step 3: Verify Dockerfile still builds**

The Dockerfile doesn't need changes — it already runs `bun install` from package-base.json and warms up with the scaffold.

**Step 4: Commit**

```bash
git add snapshot/
git commit -m "feat: update snapshot — add tRPC, Drizzle, Hono deps and server scaffold"
```

---

## Verification After All Tasks

Run the full suite to verify nothing is broken:

```bash
# TypeScript — both client and server
bunx tsc --noEmit
bunx tsc -p tsconfig.server.json --noEmit

# Tests
bunx vitest run --reporter=verbose

# Lint
bun run lint

# Build
bun run build
```

All must pass before merging.

---

## Summary

| Task | Files | LLM Calls | New Tests |
|------|-------|-----------|-----------|
| 1. Feature inference | 1 modify | 0 | 3 |
| 2. contractToDrizzle | 1 create | 0 | 7 |
| 3. contractToTrpc | 1 create | 0 | 7 |
| 4. contractToPages | 1 create | 0 | 6 |
| 5. AppBlueprint | 1 create | 0 | 8 |
| 6. blueprintToSandbox | 1 create | 0 | 3 |
| 7. Validation gate | 1 create | 0 | 5 |
| 8. Repair agent | 1 create | 0 | 3 |
| 9. XState machine | 1 create | 0 | 4 |
| 10. Registry update | 1 modify | 0 | ~3 |
| 11. Agent route | 1 modify | 0 | ~3 |
| 12. Mastra index | 1 modify | 0 | 0 |
| 13. Delete obsolete | 6 delete | 0 | -18 |
| 14. Snapshot update | 3 modify | 0 | 0 |
| **Total** | **~20 files** | **0** | **~52 new** |
