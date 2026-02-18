// tests/contract-to-sql.test.ts

import { contractToSQL } from '@server/lib/contract-to-sql'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToSQL', () => {
  it('generates CREATE TABLE with correct column types', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'count', type: 'numeric' },
            { name: 'active', type: 'boolean', default: 'false' },
            { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
          ],
        },
      ],
    }
    const sql = contractToSQL(contract)
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "items"')
    expect(sql).toContain('"id" UUID DEFAULT gen_random_uuid() PRIMARY KEY')
    expect(sql).toContain('"title" TEXT NOT NULL')
    expect(sql).toContain('"count" NUMERIC')
    expect(sql).toContain('"active" BOOLEAN DEFAULT false')
    expect(sql).toContain('"created_at" TIMESTAMPTZ NOT NULL DEFAULT now()')
  })

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
    }
    const sql = contractToSQL(contract)
    const postsIdx = sql.indexOf('CREATE TABLE IF NOT EXISTS "posts"')
    const commentsIdx = sql.indexOf('CREATE TABLE IF NOT EXISTS "comments"')
    expect(postsIdx).toBeLessThan(commentsIdx)
  })

  it('generates RLS policies', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          ],
          rlsPolicies: [
            { name: 'Users can view own', operation: 'SELECT', using: 'auth.uid() = user_id' },
            {
              name: 'Users can insert own',
              operation: 'INSERT',
              withCheck: 'auth.uid() = user_id',
            },
          ],
        },
      ],
    }
    const sql = contractToSQL(contract)
    expect(sql).toContain('ALTER TABLE "items" ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain(
      'CREATE POLICY "Users can view own" ON "items" FOR SELECT TO authenticated USING ((select auth.uid()) = user_id)',
    )
    expect(sql).toContain(
      'CREATE POLICY "Users can insert own" ON "items" FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id)',
    )
  })

  it('generates enums before tables', () => {
    const contract: SchemaContract = {
      enums: [{ name: 'status', values: ['active', 'inactive', 'archived'] }],
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'status', type: 'text' },
          ],
        },
      ],
    }
    const sql = contractToSQL(contract)
    const enumIdx = sql.indexOf('CREATE TYPE status')
    const tableIdx = sql.indexOf('CREATE TABLE')
    expect(enumIdx).toBeLessThan(tableIdx)
  })

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
    }
    const sql = contractToSQL(contract)
    expect(sql).toContain('"post_id" UUID REFERENCES "posts"("id") ON DELETE CASCADE')
  })

  it('generates FK indexes for columns with references', () => {
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
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          ],
        },
      ],
    }
    const sql = contractToSQL(contract)
    expect(sql).toContain('CREATE INDEX idx_comments_post_id ON "comments" ("post_id")')
    expect(sql).toContain('CREATE INDEX idx_comments_user_id ON "comments" ("user_id")')
  })

  it('silently skips columns with empty FK references', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'user_profile',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            // Simulate LLM producing empty references (Bug 1 from E2E run)
            { name: 'display_name', type: 'text', references: { table: '', column: '' } },
            { name: 'email', type: 'text', references: { table: '', column: 'id' } },
          ],
        },
      ],
    }
    const sql = contractToSQL(contract)
    // Should NOT produce REFERENCES () or REFERENCES (id)
    expect(sql).not.toContain('REFERENCES')
    // Should NOT produce FK indexes for empty references
    expect(sql).not.toContain('CREATE INDEX')
    // But columns themselves should still be generated
    expect(sql).toContain('"display_name" TEXT')
    expect(sql).toContain('"email" TEXT')
  })

  it('generates updated_at trigger function and per-table triggers', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'updated_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      ],
    }
    const sql = contractToSQL(contract)
    expect(sql).toContain('CREATE OR REPLACE FUNCTION update_updated_at()')
    expect(sql).toContain('SECURITY INVOKER')
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain('CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON "items"')
    expect(sql).toContain('EXECUTE FUNCTION update_updated_at()')
  })
})
