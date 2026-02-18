// tests/contract-to-seed.test.ts

import { contractToSeedSQL } from '@server/lib/contract-to-seed'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToSeedSQL', () => {
  it('generates INSERT statements for a simple table', () => {
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
    const sql = contractToSeedSQL(contract, 3)
    expect(sql).toContain('INSERT INTO "items"')
    // 3 rows requested
    const insertCount = (sql.match(/INSERT INTO "items"/g) || []).length
    expect(insertCount).toBe(3)
    // title should have generated text values
    expect(sql).toContain('title')
    // created_at has a default — should NOT appear in INSERT columns
    expect(sql).not.toMatch(/created_at/)
    // No auth preamble when no auth.users references
    expect(sql).not.toContain('INSERT INTO auth.users')
  })

  it('topologically sorts tables so parents are inserted first', () => {
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
    const sql = contractToSeedSQL(contract, 2)
    const postsIdx = sql.indexOf('INSERT INTO "posts"')
    const commentsIdx = sql.indexOf('INSERT INTO "comments"')
    expect(postsIdx).toBeGreaterThan(-1)
    expect(commentsIdx).toBeGreaterThan(-1)
    expect(postsIdx).toBeLessThan(commentsIdx)
  })

  it('uses seed user UUID for auth.users FK references', () => {
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
    const sql = contractToSeedSQL(contract, 1)
    expect(sql).toContain('00000000-0000-4000-a000-0000000005ee')
    // Auth preamble: seeds auth.users + auth.identities so FK constraints pass
    expect(sql).toContain('INSERT INTO auth.users')
    expect(sql).toContain('INSERT INTO auth.identities')
    expect(sql).toContain("crypt('password123', gen_salt('bf'))")
  })

  it('references parent table IDs for inter-table FKs', () => {
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
    const sql = contractToSeedSQL(contract, 2)
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

  it('generates appropriate values for different column types', () => {
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
    const sql = contractToSeedSQL(contract, 2)
    // Integer values (faker.number.int produces random ints in range)
    expect(sql).toMatch(/count.*\b\d+\b/)
    // Numeric values (faker.number.float produces decimals)
    expect(sql).toMatch(/score.*\d+\.\d{2}/)
    // Boolean values
    expect(sql).toMatch(/\b(true|false)\b/)
    // JSONB
    expect(sql).toContain("'{}'::jsonb")
  })

  it('infers realistic text values from column names using faker', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'email', type: 'text', nullable: false },
            { name: 'status', type: 'text', nullable: false },
            { name: 'description', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const sql = contractToSeedSQL(contract, 1)
    // Email should contain @ (faker generates real-looking emails)
    expect(sql).toMatch(/@/)
    // Status should be one of the known enum values
    expect(sql).toMatch(/active|pending|completed|inactive|draft/)
    // Description should contain multi-word text (faker paragraph)
    expect(sql).toMatch(/INSERT INTO "users".*description/)
  })

  it('skips columns with defaults (except PKs)', () => {
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
    const sql = contractToSeedSQL(contract, 1)
    // PK should be present (explicit ID for FK referencing)
    expect(sql).toContain('id')
    // title has no default — should be present
    expect(sql).toContain('title')
    // status has default — should NOT be present
    expect(sql).not.toMatch(/\bstatus\b/)
    // created_at has default — should NOT be present
    expect(sql).not.toMatch(/created_at/)
  })

  it('returns empty-ish SQL for empty contract', () => {
    const contract: SchemaContract = { tables: [] }
    const sql = contractToSeedSQL(contract, 5)
    expect(sql).toContain('Auto-generated seed data')
    expect(sql).not.toContain('INSERT INTO')
  })

  it('generates deterministic UUIDs', () => {
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
    const sql1 = contractToSeedSQL(contract, 3)
    const sql2 = contractToSeedSQL(contract, 3)
    expect(sql1).toBe(sql2)
  })
})
