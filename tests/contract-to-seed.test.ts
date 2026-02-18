// tests/contract-to-seed.test.ts
// Tests for LLM-based seed generation.
// Since LLM content values are non-deterministic, tests focus on:
//   - SQL structure (correct tables, correct row counts)
//   - Deterministic IDs (PKs, FK references)
//   - Auth stubs (auth.users preamble)
//   - Column type handling (fallback values for unlisted columns)

import { contractToSeedSQL } from '@server/lib/contract-to-seed'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the 'ai' package so tests don't hit the real OpenAI API
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: { tables: [] }, // empty → triggers fallback value path
  }),
}))

describe('contractToSeedSQL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates INSERT statements for a simple table', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
          ],
        },
      ],
    }
    const sql = await contractToSeedSQL(contract, 3)
    expect(sql).toContain('INSERT INTO "items"')
    // 3 rows requested
    const insertCount = (sql.match(/INSERT INTO "items"/g) || []).length
    expect(insertCount).toBe(3)
    // title should appear in columns
    expect(sql).toContain('title')
    // created_at has a default — should NOT appear in INSERT columns
    expect(sql).not.toMatch(/created_at/)
    // No auth preamble when no auth.users references
    expect(sql).not.toContain('INSERT INTO auth.users')
  })

  it('topologically sorts tables so parents are inserted first', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
            { name: 'body', type: 'text', nullable: false },
          ],
        },
        {
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const sql = await contractToSeedSQL(contract, 2)
    const postsIdx = sql.indexOf('INSERT INTO "posts"')
    const commentsIdx = sql.indexOf('INSERT INTO "comments"')
    expect(postsIdx).toBeGreaterThan(-1)
    expect(commentsIdx).toBeGreaterThan(-1)
    expect(postsIdx).toBeLessThan(commentsIdx)
  })

  it('uses seed user UUID for auth.users FK references', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            {
              name: 'user_id',
              type: 'uuid',
              nullable: false,
              references: { table: 'auth.users', column: 'id' },
            },
            { name: 'display_name', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const sql = await contractToSeedSQL(contract, 1)
    expect(sql).toContain('00000000-0000-4000-a000-0000000005ee')
    // Auth preamble: seeds auth.users + auth.identities so FK constraints pass
    expect(sql).toContain('INSERT INTO auth.users')
    expect(sql).toContain('INSERT INTO auth.identities')
    expect(sql).toContain("crypt('password123', gen_salt('bf'))")
  })

  it('references parent table IDs for inter-table FKs', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'categories',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text', nullable: false },
          ],
        },
        {
          name: 'products',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            {
              name: 'category_id',
              type: 'uuid',
              references: { table: 'categories', column: 'id' },
            },
            { name: 'name', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const sql = await contractToSeedSQL(contract, 2)
    // Products should reference the category IDs generated for the categories table
    // Category IDs (table 0): 00000000-0000-4000-8000-000000000001, 00000000-0000-4000-8000-000000000002
    expect(sql).toContain("'00000000-0000-4000-8000-000000000001'")
    // Check that products reference a category id
    const productLines = sql.split('\n').filter((l) => l.includes('INSERT INTO "products"'))
    expect(productLines.length).toBe(2)
    for (const line of productLines) {
      expect(line).toMatch(/00000000-0000-4000-8000-00000000000[12]/)
    }
  })

  it('uses SELECT...WHERE EXISTS form for FK-dependent rows to guard against missing parents', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
          ],
        },
        {
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
            { name: 'body', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const sql = await contractToSeedSQL(contract, 2)
    // posts have no inter-table FKs → plain VALUES form
    const postLines = sql.split('\n').filter((l) => l.includes('INSERT INTO "posts"'))
    for (const line of postLines) {
      expect(line).toContain('VALUES')
      expect(line).not.toContain('WHERE EXISTS')
    }
    // comments have FK to posts → SELECT...WHERE EXISTS form
    const commentLines = sql.split('\n').filter((l) => l.includes('INSERT INTO "comments"'))
    expect(commentLines.length).toBe(2)
    for (const line of commentLines) {
      expect(line).toContain('SELECT')
      expect(line).toContain('WHERE EXISTS')
      expect(line).toContain('"posts"')
      expect(line).toContain('ON CONFLICT DO NOTHING')
    }
  })

  it('generates appropriate fallback values for different column types when LLM returns empty', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'metrics',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'label', type: 'text', nullable: false },
            { name: 'count', type: 'integer', nullable: false },
            { name: 'score', type: 'numeric', nullable: false },
            { name: 'active', type: 'boolean', nullable: false },
            { name: 'metadata', type: 'jsonb', nullable: false },
          ],
        },
      ],
    }
    // LLM mock returns empty tables → all columns use fallback values
    const sql = await contractToSeedSQL(contract, 2)
    // Integer fallback: row index
    expect(sql).toMatch(/\b\d+\b/)
    // Numeric fallback: decimal
    expect(sql).toMatch(/\d+\.\d{2}/)
    // Boolean fallback
    expect(sql).toMatch(/\b(true|false)\b/)
    // JSONB fallback
    expect(sql).toContain("'{}'::jsonb")
  })

  it('uses LLM-provided values when the LLM returns data', async () => {
    const { generateObject } = await import('ai')
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        tables: [
          {
            name: 'watches',
            rows: [
              { name: 'Rolex Submariner', brand: 'Rolex', price_cents: 1250000 },
              { name: 'Omega Seamaster', brand: 'Omega', price_cents: 750000 },
            ],
          },
        ],
      },
    } as any)

    const contract: SchemaContract = {
      tables: [
        {
          name: 'watches',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text', nullable: false },
            { name: 'brand', type: 'text', nullable: false },
            { name: 'price_cents', type: 'integer', nullable: false },
          ],
        },
      ],
    }
    const sql = await contractToSeedSQL(contract, 2)
    expect(sql).toContain('Rolex Submariner')
    expect(sql).toContain('Omega Seamaster')
    expect(sql).toContain('1250000')
  })

  it('skips columns with defaults (except PKs)', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'events',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'status', type: 'text', default: "'pending'" },
            { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
            { name: 'updated_at', type: 'timestamptz', nullable: false, default: 'now()' },
          ],
        },
      ],
    }
    const sql = await contractToSeedSQL(contract, 1)
    // PK should be present (explicit ID for FK referencing)
    expect(sql).toContain('id')
    // title has no default — should be present
    expect(sql).toContain('title')
    // status has default — should NOT be present
    expect(sql).not.toMatch(/\bstatus\b/)
    // created_at has default — should NOT be present
    expect(sql).not.toMatch(/created_at/)
  })

  it('returns comment-only SQL for empty contract', async () => {
    const contract: SchemaContract = { tables: [] }
    const sql = await contractToSeedSQL(contract, 5)
    expect(sql).toContain('Auto-generated seed data')
    expect(sql).not.toContain('INSERT INTO')
  })

  it('generates deterministic PKs regardless of LLM output', async () => {
    // The LLM may return different content each time, but PKs are always deterministic
    const contract: SchemaContract = {
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'name', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const sql1 = await contractToSeedSQL(contract, 3)
    const sql2 = await contractToSeedSQL(contract, 3)
    // Extract just the UUID values from both runs
    const uuidPattern = /00000000-0000-4000-[0-9a-f]{4}-[0-9a-f]{12}/g
    const uuids1 = sql1.match(uuidPattern) ?? []
    const uuids2 = sql2.match(uuidPattern) ?? []
    expect(uuids1).toEqual(uuids2)
    // Should have 3 deterministic PKs
    expect(uuids1.filter(u => u.startsWith('00000000-0000-4000-8')).length).toBe(3)
  })
})
