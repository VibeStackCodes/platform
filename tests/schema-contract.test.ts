// tests/schema-contract.test.ts

import { type SchemaContract, validateContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('validateContract', () => {
  it('accepts a valid contract with tables and relations', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'display_name', type: 'text', nullable: false },
            {
              name: 'user_id',
              type: 'uuid',
              nullable: false,
              references: { table: 'auth.users', column: 'id' },
            },
            { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
          ],
          rlsPolicies: [
            {
              name: 'Users can view own profile',
              operation: 'SELECT',
              using: 'auth.uid() = user_id',
            },
          ],
        },
      ],
    }
    expect(validateContract(contract)).toEqual({ valid: true, errors: [] })
  })

  it('rejects a contract with duplicate column names in a table', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'title', type: 'text' }, // duplicate
          ],
        },
      ],
    }
    const result = validateContract(contract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('duplicate')
  })

  it('rejects a contract with FK reference to non-existent table', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
          ],
        },
      ],
    }
    const result = validateContract(contract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('posts')
  })

  it('allows FK references to auth.users (external table)', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          ],
        },
      ],
    }
    expect(validateContract(contract)).toEqual({ valid: true, errors: [] })
  })

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
    }
    const result = validateContract(contract)
    expect(result.valid).toBe(false)
    expect(result.errors[0].toLowerCase()).toContain('circular')
  })
})
