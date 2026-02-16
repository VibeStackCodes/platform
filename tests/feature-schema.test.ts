import { describe, expect, it } from 'vitest'
import {
  PageFeatureSchema,
  CustomProcedureSchema,
  validateFeatureSpec,
} from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

const testContract: SchemaContract = {
  tables: [
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'status', type: 'text', nullable: false, default: "'pending'" },
        { name: 'due_date', type: 'timestamptz', nullable: true },
        { name: 'is_complete', type: 'boolean', nullable: false, default: 'false' },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

describe('PageFeatureSchema', () => {
  it('parses a valid feature spec', () => {
    const input = {
      entityName: 'task',
      listPage: {
        columns: [
          { field: 'title', label: 'Title', format: 'text' },
          { field: 'status', label: 'Status', format: 'badge' },
          { field: 'due_date', label: 'Due Date', format: 'date' },
        ],
        searchFields: ['title', 'description'],
        sortDefault: 'created_at',
        sortDirection: 'desc',
        createFormFields: [
          { field: 'title', label: 'Title', inputType: 'text' },
          { field: 'description', label: 'Description', inputType: 'textarea' },
        ],
        emptyStateMessage: 'No tasks yet. Create your first task!',
      },
      detailPage: {
        headerField: 'title',
        sections: [
          {
            title: 'Details',
            fields: [
              { field: 'status', label: 'Status', format: 'badge' },
              { field: 'due_date', label: 'Due Date', format: 'date' },
              { field: 'is_complete', label: 'Complete', format: 'boolean' },
            ],
          },
        ],
        editFormFields: [
          { field: 'title', label: 'Title', inputType: 'text' },
          { field: 'description', label: 'Description', inputType: 'textarea' },
          { field: 'status', label: 'Status', inputType: 'select' },
        ],
      },
    }

    const result = PageFeatureSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects invalid format enum', () => {
    const input = {
      entityName: 'task',
      listPage: {
        columns: [{ field: 'title', label: 'Title', format: 'rainbow' }],
        searchFields: [],
        sortDefault: 'id',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'title',
        sections: [],
        editFormFields: [],
      },
    }

    const result = PageFeatureSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('CustomProcedureSchema', () => {
  it('parses valid custom procedures', () => {
    const input = {
      procedures: [
        {
          name: 'search',
          type: 'query',
          access: 'protected',
          description: 'Search tasks by title',
          inputFields: [
            { name: 'query', type: 'string', optional: false },
          ],
          implementation: 'return ctx.db.query.task.findMany({ where: ilike(task.title, `%${input.query}%`) })',
        },
      ],
    }

    const result = CustomProcedureSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe('validateFeatureSpec', () => {
  it('returns valid for correct field references', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'task',
      listPage: {
        columns: [{ field: 'title', label: 'Title', format: 'text' }],
        searchFields: ['title'],
        sortDefault: 'created_at',
        sortDirection: 'asc',
        createFormFields: [{ field: 'title', label: 'Title', inputType: 'text' }],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'title',
        sections: [{ title: 'Info', fields: [{ field: 'title', label: 'Title', format: 'text' }] }],
        editFormFields: [{ field: 'title', label: 'Title', inputType: 'text' }],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects field not in contract', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'task',
      listPage: {
        columns: [{ field: 'nonexistent_field', label: 'Bad', format: 'text' }],
        searchFields: [],
        sortDefault: 'id',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'title',
        sections: [],
        editFormFields: [],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('nonexistent_field')
  })

  it('rejects entity not in contract', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'nonexistent_table',
      listPage: {
        columns: [],
        searchFields: [],
        sortDefault: 'id',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'id',
        sections: [],
        editFormFields: [],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('nonexistent_table')
  })

  it('validates filter fields reference valid columns (E4)', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'task',
      listPage: {
        columns: [{ field: 'title', label: 'Title', format: 'text' }],
        searchFields: [],
        sortDefault: 'created_at',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
        filters: [
          { field: 'status', label: 'Status', type: 'select', options: ['pending', 'done'] },
          { field: 'is_complete', label: 'Complete', type: 'boolean' },
        ],
      },
      detailPage: {
        headerField: 'title',
        sections: [],
        editFormFields: [],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects invalid filter field (E4)', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'task',
      listPage: {
        columns: [],
        searchFields: [],
        sortDefault: 'id',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
        filters: [
          { field: 'invalid_column', label: 'Invalid', type: 'search' },
        ],
      },
      detailPage: {
        headerField: 'title',
        sections: [],
        editFormFields: [],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('invalid_column')
  })
})
