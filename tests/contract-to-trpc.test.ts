// tests/contract-to-trpc.test.ts
import { describe, expect, it } from 'vitest'
import { contractToTrpc, contractToRootRouter } from '@server/lib/contract-to-trpc'
import type { SchemaContract } from '@server/lib/schema-contract'

describe('contractToTrpc', () => {
  it('generates router files for each table', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'url', type: 'text', nullable: false },
            { name: 'title', type: 'text', nullable: true },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
        {
          name: 'tag',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text', nullable: false },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)

    expect(result).toHaveLength(2)
    expect(result[0].tableName).toBe('bookmark')
    expect(result[0].fileName).toBe('bookmark.ts')
    expect(result[1].tableName).toBe('tag')
    expect(result[1].fileName).toBe('tag.ts')
  })

  it('generates file name in kebab-case for multi-word tables', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark_tag',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'bookmark_id', type: 'uuid', references: { table: 'bookmark', column: 'id' } },
            { name: 'tag_id', type: 'uuid', references: { table: 'tag', column: 'id' } },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)

    expect(result[0].fileName).toBe('bookmark-tag.ts')
  })

  it('includes all CRUD procedures', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    expect(content).toContain('list:')
    expect(content).toContain('getById:')
    expect(content).toContain('create:')
    expect(content).toContain('update:')
    expect(content).toContain('delete:')
  })

  it('uses publicProcedure for tables without user_id', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'tag',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'name', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    expect(content).toContain('publicProcedure')
    expect(content).not.toContain('protectedProcedure')
  })

  it('uses protectedProcedure for tables with user_id referencing auth.users', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
            { name: 'url', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    expect(content).toContain('protectedProcedure')
    expect(content).not.toContain('publicProcedure')
  })

  it('filters by ctx.userId in list for protected tables', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
            { name: 'url', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Check list procedure filters by user_id
    expect(content).toContain('eq(bookmark.user_id, ctx.userId)')
  })

  it('injects userId in create for protected tables', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
            { name: 'url', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Check create procedure injects userId
    expect(content).toContain('userId: ctx.userId')
  })

  it('uses drizzle-orm/zod createInsertSchema', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'description', type: 'text', nullable: true },
            { name: 'priority', type: 'integer', default: '1' },
            { name: 'completed', type: 'boolean', default: 'false' },
            { name: 'due_date', type: 'timestamptz', nullable: true },
            { name: 'metadata', type: 'jsonb', nullable: true },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Check imports drizzle-orm/zod
    expect(content).toContain("import { createInsertSchema } from 'drizzle-orm/zod'")

    // Check schema generation
    expect(content).toContain('const insertTaskSchema = createInsertSchema(task)')

    // Check create uses omit with schema
    expect(content).toContain('insertTaskSchema.omit({ id: true, createdAt: true, updatedAt: true })')

    // Check update uses partial with merge
    expect(content).toContain('insertTaskSchema.partial().omit({ id: true, createdAt: true, updatedAt: true })')
  })

  it('skips user_id in schema omit for owned tables', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
            { name: 'url', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Should omit standard fields in schema
    expect(content).toContain('omit({ id: true, createdAt: true, updatedAt: true })')
    // userId injected by backend, not via schema
    expect(content).toContain('userId: ctx.userId')
  })

  it('includes SLOT marker for custom procedures', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    expect(content).toContain('SLOT: CUSTOM_PROCEDURES')
    expect(content).toMatch(/\/\/\s*{\s*\/\*\s*SLOT:\s*CUSTOM_PROCEDURES/)
  })

  it('uses camelCase for variable names and snake_case for SQL strings', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'user_profile',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'first_name', type: 'text' },
            { name: 'last_name', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Check camelCase in router name
    expect(content).toMatch(/export const userProfileRouter/)

    // Check snake_case in SQL/imports
    expect(content).toContain('user_profile')

    // Check camelCase in sortBy enum (derived from columns)
    expect(content).toContain('firstName')
    expect(content).toContain('lastName')

    // Check schema generation uses PascalCase
    expect(content).toContain('const insertUserProfileSchema = createInsertSchema(user_profile)')
  })

  it('exports router with correct name', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'url', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    expect(content).toContain('export const bookmarkRouter')
  })

  it('imports correct dependencies', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    expect(content).toContain("import { z } from 'zod'")
    expect(content).toContain("import { eq, asc, desc, gt, and } from 'drizzle-orm'")
    expect(content).toContain("import { createInsertSchema } from 'drizzle-orm/zod'")
    expect(content).toMatch(/import.*task.*from.*schema/)
    expect(content).toMatch(/import.*router.*from.*trpc/)
  })

  it('generates cursor-based pagination for list procedure', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Check list input has pagination params
    expect(content).toContain('cursor: z.string().uuid().optional()')
    expect(content).toContain('limit: z.number().int().min(1).max(100).default(20)')

    // Check cursor logic
    expect(content).toContain('if (input.cursor)')
    expect(content).toContain('gt(task.id, input.cursor)')

    // Check return shape
    expect(content).toContain('items: hasMore ? items.slice(0, -1) : items')
    expect(content).toContain('nextCursor: hasMore ? items[input.limit - 1].id : null')
  })

  it('generates sorting parameters for list procedure', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'status', type: 'text' },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Check sortBy enum includes table columns (excluding jsonb)
    expect(content).toMatch(/sortBy: z\.enum\(\[.*'id'.*'title'.*'status'.*'createdAt'.*\]\)/)

    // Check sortOrder enum
    expect(content).toContain("sortOrder: z.enum(['asc', 'desc'])")

    // Check default sort is created_at
    expect(content).toContain(".default('createdAt')")

    // Check sorting logic
    expect(content).toContain('const orderCol = task[input.sortBy]')
    expect(content).toContain("const orderFn = input.sortOrder === 'asc' ? asc : desc")
    expect(content).toContain('.orderBy(orderFn(orderCol))')
  })

  it('defaults to id sorting when no created_at column', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'tag',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'name', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Should default to id when created_at not present
    expect(content).toMatch(/sortBy:.*\.default\('id'\)/)
  })

  it('excludes jsonb columns from sortBy enum', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'document',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'metadata', type: 'jsonb' },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Should include text and timestamp columns
    expect(content).toMatch(/sortBy:.*'title'/)
    expect(content).toMatch(/sortBy:.*'createdAt'/)

    // Should NOT include jsonb column
    expect(content).not.toMatch(/sortBy:.*'metadata'/)
  })

  it('combines user ownership filter with cursor pagination', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
            { name: 'url', type: 'text' },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
      ],
    }

    const result = contractToTrpc(contract)
    const content = result[0].content

    // Should use and() to combine conditions
    expect(content).toContain('const conditions = [')
    expect(content).toContain('eq(bookmark.user_id, ctx.userId)')
    expect(content).toContain('conditions.push(gt(bookmark.id, input.cursor))')
    expect(content).toContain('.where(and(...conditions))')
  })
})

describe('contractToRootRouter', () => {
  it('generates root router with all entity routers', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'url', type: 'text' },
          ],
        },
        {
          name: 'tag',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'name', type: 'text' },
          ],
        },
      ],
    }

    const result = contractToRootRouter(contract)

    // Check imports
    expect(result).toContain("import { bookmarkRouter } from './routers/bookmark'")
    expect(result).toContain("import { tagRouter } from './routers/tag'")

    // Check router definition
    expect(result).toContain('export const appRouter = router({')
    expect(result).toContain('bookmark: bookmarkRouter,')
    expect(result).toContain('tag: tagRouter,')

    // Check type export
    expect(result).toContain('export type AppRouter = typeof appRouter')
  })

  it('imports router factory', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
          ],
        },
      ],
    }

    const result = contractToRootRouter(contract)

    expect(result).toContain("import { router } from '../trpc'")
  })

  it('handles multi-word table names in imports', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark_tag',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
          ],
        },
      ],
    }

    const result = contractToRootRouter(contract)

    // Import uses kebab-case file name
    expect(result).toContain("import { bookmarkTagRouter } from './routers/bookmark-tag'")
    // Router map uses camelCase
    expect(result).toContain('bookmarkTag: bookmarkTagRouter')
  })
})
