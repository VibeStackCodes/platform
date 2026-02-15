import { describe, expect, it } from 'vitest'
import { generateZodSchema, getPrimaryKeys } from '@/components/supabase-manager/database'
import { listTablesSql } from '@/lib/platform-kit/pg-meta'
import { postgresTableSchema } from '@/lib/platform-kit/pg-meta/types'

const mockTable = {
  id: 54321,
  schema: 'public',
  name: 'tasks',
  rls_enabled: true,
  rls_forced: false,
  replica_identity: 'DEFAULT' as const,
  bytes: 8192,
  size: '8 kB',
  live_rows_estimate: 42,
  dead_rows_estimate: 0,
  comment: null,
  columns: [
    {
      table_id: 54321,
      schema: 'public',
      table: 'tasks',
      id: '54321.1',
      ordinal_position: 1,
      name: 'id',
      default_value: 'gen_random_uuid()',
      data_type: 'uuid',
      format: 'uuid',
      is_identity: false,
      identity_generation: null,
      is_generated: true,
      is_nullable: false,
      is_updatable: false,
      is_unique: true,
      enums: [],
      check: null,
      comment: null,
    },
    {
      table_id: 54321,
      schema: 'public',
      table: 'tasks',
      id: '54321.2',
      ordinal_position: 2,
      name: 'title',
      default_value: null,
      data_type: 'text',
      format: 'text',
      is_identity: false,
      identity_generation: null,
      is_generated: false,
      is_nullable: false,
      is_updatable: true,
      is_unique: false,
      enums: [],
      check: null,
      comment: null,
    },
    {
      table_id: 54321,
      schema: 'public',
      table: 'tasks',
      id: '54321.3',
      ordinal_position: 3,
      name: 'priority',
      default_value: null,
      data_type: 'integer',
      format: 'int4',
      is_identity: false,
      identity_generation: null,
      is_generated: false,
      is_nullable: true,
      is_updatable: true,
      is_unique: false,
      enums: [],
      check: null,
      comment: null,
    },
    {
      table_id: 54321,
      schema: 'public',
      table: 'tasks',
      id: '54321.4',
      ordinal_position: 4,
      name: 'status',
      default_value: null,
      data_type: 'USER-DEFINED',
      format: 'task_status',
      is_identity: false,
      identity_generation: null,
      is_generated: false,
      is_nullable: false,
      is_updatable: true,
      is_unique: false,
      enums: ['todo', 'in_progress', 'done'],
      check: null,
      comment: null,
    },
  ],
  primary_keys: [{ schema: 'public', table_name: 'tasks', name: 'id', table_id: 54321 }],
  relationships: [],
}

describe('pg-meta SQL and schema validation', () => {
  it('listTablesSql generates SQL containing the schema filter', () => {
    const sql = listTablesSql(['public', 'auth'])
    expect(sql).toContain("where schema in ('public','auth')")
  })

  it('postgresTableSchema successfully parses a valid table object', () => {
    const result = postgresTableSchema.safeParse(mockTable)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('tasks')
      expect(result.data.columns).toHaveLength(4)
      expect(result.data.primary_keys).toHaveLength(1)
    }
  })

  it('postgresTableSchema rejects invalid data', () => {
    const invalidTable = {
      id: 'not-a-number',
      schema: 'public',
      name: 'tasks',
      rls_enabled: true,
    }
    const result = postgresTableSchema.safeParse(invalidTable)
    expect(result.success).toBe(false)
  })
})

describe('Zod schema generation from columns', () => {
  it('generateZodSchema excludes generated/non-updatable columns', () => {
    const schema = generateZodSchema(mockTable)
    const shape = schema.shape
    expect(shape.id).toBeUndefined()
  })

  it('generateZodSchema includes updatable columns', () => {
    const schema = generateZodSchema(mockTable)
    const shape = schema.shape
    expect(shape.title).toBeDefined()
    expect(shape.priority).toBeDefined()
    expect(shape.status).toBeDefined()
  })

  it('generated schema validates correct form data', () => {
    const schema = generateZodSchema(mockTable)
    const validData = {
      title: 'Complete the report',
      priority: 1,
      status: 'todo',
    }
    const result = schema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('generated schema rejects invalid enum values', () => {
    const schema = generateZodSchema(mockTable)
    const invalidData = {
      title: 'Complete the report',
      priority: 1,
      status: 'invalid_status',
    }
    const result = schema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  it('generated schema handles nullable columns', () => {
    const schema = generateZodSchema(mockTable)
    const dataWithNull = {
      title: 'Complete the report',
      priority: null,
      status: 'todo',
    }
    const result = schema.safeParse(dataWithNull)
    expect(result.success).toBe(true)
  })

  it('generated schema handles numeric type coercion', () => {
    const schema = generateZodSchema(mockTable)
    const dataWithNumber = {
      title: 'Complete the report',
      priority: 5,
      status: 'in_progress',
    }
    const result = schema.safeParse(dataWithNumber)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(typeof result.data.priority).toBe('number')
    }
  })
})

describe('Primary key extraction', () => {
  it('getPrimaryKeys returns single primary key', () => {
    const pks = getPrimaryKeys(mockTable)
    expect(pks).toEqual(['id'])
  })

  it('getPrimaryKeys returns composite primary keys', () => {
    const tableWithCompositePK = {
      ...mockTable,
      primary_keys: [
        { schema: 'public', table_name: 'tasks', name: 'user_id', table_id: 54321 },
        { schema: 'public', table_name: 'tasks', name: 'task_id', table_id: 54321 },
      ],
    }
    const pks = getPrimaryKeys(tableWithCompositePK)
    expect(pks).toEqual(['user_id', 'task_id'])
  })

  it('getPrimaryKeys returns empty array for missing primary_keys', () => {
    const tableWithoutPK = {
      ...mockTable,
      primary_keys: [],
    }
    const pks = getPrimaryKeys(tableWithoutPK)
    expect(pks).toEqual([])
  })
})

describe('Edit row pipeline', () => {
  it('full pipeline: generate schema, validate form data, extract PKs, construct UPDATE query', () => {
    const schema = generateZodSchema(mockTable)
    const formData = {
      title: 'Updated task title',
      priority: 2,
      status: 'in_progress',
    }
    const validationResult = schema.safeParse(formData)
    expect(validationResult.success).toBe(true)

    const pks = getPrimaryKeys(mockTable)
    expect(pks).toEqual(['id'])

    const existingRow = {
      id: 'abc-123',
      title: 'Old title',
      priority: 1,
      status: 'todo',
    }

    const changedFields = Object.entries(formData).filter(
      ([key, value]) => JSON.stringify(existingRow[key]) !== JSON.stringify(value),
    )
    expect(changedFields).toHaveLength(3)

    const setClauses = changedFields
      .map(([key, value]) => {
        const formattedValue = typeof value === 'string' ? `'${value}'` : value
        return `"${key}" = ${formattedValue}`
      })
      .join(', ')

    expect(setClauses).toContain('"title" = \'Updated task title\'')
    expect(setClauses).toContain('"priority" = 2')
    expect(setClauses).toContain('"status" = \'in_progress\'')

    const whereClauses = pks
      .map((pk) => {
        const v = existingRow[pk]
        return `"${pk}" = ${typeof v === 'string' ? `'${v}'` : v}`
      })
      .join(' AND ')

    expect(whereClauses).toBe('"id" = \'abc-123\'')

    const updateSql = `UPDATE public."${mockTable.name}" SET ${setClauses} WHERE ${whereClauses};`
    expect(updateSql).toContain('UPDATE public."tasks"')
    expect(updateSql).toContain('WHERE "id" = \'abc-123\'')
  })
})
