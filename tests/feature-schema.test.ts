import { describe, expect, it, vi } from 'vitest'
import {
  PageConfigSchema,
  PageFeatureSchema,
  derivePageFeatureSpec,
  validateFeatureSpec,
  validatePageConfig,
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
        { name: 'metadata', type: 'jsonb', nullable: true },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'profiles', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

// Suppress coercion warnings in tests
vi.spyOn(console, 'warn').mockImplementation(() => {})

// ============================================================================
// PageConfigSchema — simplified LLM output target (~10 fields)
// ============================================================================

describe('PageConfigSchema', () => {
  it('parses a valid config', () => {
    const input = {
      entityName: 'task',
      listColumns: ['title', 'status', 'due_date'],
      headerField: 'title',
      enumFields: [
        { field: 'status', options: ['pending', 'active', 'done'] },
      ],
      detailSections: [
        { title: 'Details', fields: ['title', 'description', 'status'] },
        { title: 'Metadata', fields: ['due_date', 'is_complete'] },
      ],
    }

    const result = PageConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.entityName).toBe('task')
      expect(result.data.listColumns).toEqual(['title', 'status', 'due_date'])
      expect(result.data.enumFields).toHaveLength(1)
    }
  })

  it('rejects missing required fields', () => {
    const result = PageConfigSchema.safeParse({ entityName: 'task' })
    expect(result.success).toBe(false)
  })

  // ---- Coercion: enumFields z.preprocess ----

  it('coerces null enumFields → empty array', () => {
    const input = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: null,
      detailSections: [{ title: 'Info', fields: ['title'] }],
    }

    const result = PageConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enumFields).toEqual([])
    }
  })

  it('coerces undefined enumFields → empty array', () => {
    const input = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: undefined,
      detailSections: [{ title: 'Info', fields: ['title'] }],
    }

    const result = PageConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enumFields).toEqual([])
    }
  })

  it('coerces single object enumFields → array', () => {
    const input = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: { field: 'status', options: ['pending', 'done'] },
      detailSections: [{ title: 'Info', fields: ['title'] }],
    }

    const result = PageConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enumFields).toHaveLength(1)
      expect(result.data.enumFields[0].field).toBe('status')
    }
  })

  it('coerces JSON string enumFields → array', () => {
    const input = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: '[{"field":"status","options":["pending","done"]}]',
      detailSections: [{ title: 'Info', fields: ['title'] }],
    }

    const result = PageConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.enumFields).toHaveLength(1)
    }
  })

  it('falls back to empty array for malformed enumFields via .catch()', () => {
    const input = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: 'not-valid-json',
      detailSections: [{ title: 'Info', fields: ['title'] }],
    }

    const result = PageConfigSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      // coerceArray splits by comma → ["not-valid-json"], inner object parse fails → .catch([])
      expect(result.data.enumFields).toEqual([])
    }
  })
})

// ============================================================================
// derivePageFeatureSpec — deterministic expansion from PageConfig + contract
// ============================================================================

describe('derivePageFeatureSpec', () => {
  const baseConfig = {
    entityName: 'task',
    listColumns: ['title', 'status', 'due_date'],
    headerField: 'title',
    enumFields: [{ field: 'status', options: ['pending', 'active', 'done'] }],
    detailSections: [
      { title: 'Details', fields: ['title', 'description', 'status'] },
      { title: 'Dates', fields: ['due_date', 'is_complete'] },
    ],
  }

  it('derives a complete PageFeatureSpec', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)

    expect(spec.entityName).toBe('task')
    expect(spec.listPage.columns).toHaveLength(3)
    expect(spec.listPage.emptyStateMessage).toBe('No tasks yet. Create your first task!')
    expect(spec.detailPage.headerField).toBe('title')
    expect(spec.detailPage.sections).toHaveLength(2)
  })

  it('derives correct column formats from SQL types', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)

    const titleCol = spec.listPage.columns.find(c => c.field === 'title')
    expect(titleCol?.format).toBe('text')

    // Enum column → badge format
    const statusCol = spec.listPage.columns.find(c => c.field === 'status')
    expect(statusCol?.format).toBe('badge')

    // Timestamp → date format
    const dueDateCol = spec.listPage.columns.find(c => c.field === 'due_date')
    expect(dueDateCol?.format).toBe('date')
  })

  it('derives snake_case → Title Case labels', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)

    const dueDateCol = spec.listPage.columns.find(c => c.field === 'due_date')
    expect(dueDateCol?.label).toBe('Due Date')

    const isCompleteField = spec.detailPage.sections[1].fields.find(f => f.field === 'is_complete')
    expect(isCompleteField?.label).toBe('Is Complete')
  })

  it('derives search fields from text columns in listColumns', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)
    // title is text and not enum → searchable
    expect(spec.listPage.searchFields).toContain('title')
    // status is text but IS enum → not searchable
    expect(spec.listPage.searchFields).not.toContain('status')
    // due_date is timestamptz → not searchable
    expect(spec.listPage.searchFields).not.toContain('due_date')
  })

  it('sorts by created_at desc when available', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)
    expect(spec.listPage.sortDefault).toBe('created_at')
    expect(spec.listPage.sortDirection).toBe('desc')
  })

  it('excludes auto-managed columns from create form', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)
    const formFieldNames = spec.listPage.createFormFields.map(f => f.field)

    expect(formFieldNames).not.toContain('id')
    expect(formFieldNames).not.toContain('created_at')
    expect(formFieldNames).not.toContain('updated_at')
    expect(formFieldNames).not.toContain('user_id')

    // Non-auto columns should be present
    expect(formFieldNames).toContain('title')
    expect(formFieldNames).toContain('status')
    expect(formFieldNames).toContain('description')
  })

  it('derives correct input types for form fields', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)
    const formByField = new Map(spec.listPage.createFormFields.map(f => [f.field, f]))

    expect(formByField.get('title')?.inputType).toBe('text')
    expect(formByField.get('description')?.inputType).toBe('textarea')
    expect(formByField.get('status')?.inputType).toBe('select') // enum
    expect(formByField.get('due_date')?.inputType).toBe('date')
    expect(formByField.get('is_complete')?.inputType).toBe('checkbox')
  })

  it('populates enum options in form fields', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)
    const statusField = spec.listPage.createFormFields.find(f => f.field === 'status')

    expect(statusField?.options).toEqual(['pending', 'active', 'done'])
    expect(statusField?.placeholder).toBe('') // enum fields get empty placeholder
  })

  it('derives filters for enum, boolean, and timestamp columns', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)
    const filterByField = new Map(spec.listPage.filters.map(f => [f.field, f]))

    expect(filterByField.get('status')?.type).toBe('select')
    expect(filterByField.get('status')?.options).toEqual(['pending', 'active', 'done'])
    expect(filterByField.get('is_complete')?.type).toBe('boolean')
    expect(filterByField.get('due_date')?.type).toBe('dateRange')
  })

  it('derives detail format with json support for jsonb', () => {
    const configWithMetadata = {
      ...baseConfig,
      detailSections: [{ title: 'All', fields: ['title', 'metadata'] }],
    }
    const spec = derivePageFeatureSpec(configWithMetadata, testContract)

    const metadataField = spec.detailPage.sections[0].fields.find(f => f.field === 'metadata')
    expect(metadataField?.format).toBe('json')
  })

  it('filters out columns not in contract', () => {
    const configWithBadCol = {
      ...baseConfig,
      listColumns: ['title', 'nonexistent_column'],
    }
    const spec = derivePageFeatureSpec(configWithBadCol, testContract)

    // Only valid column should survive
    expect(spec.listPage.columns).toHaveLength(1)
    expect(spec.listPage.columns[0].field).toBe('title')
  })

  it('throws for table not in contract', () => {
    const badConfig = { ...baseConfig, entityName: 'nonexistent' }
    expect(() => derivePageFeatureSpec(badConfig, testContract)).toThrow('not found in contract')
  })

  it('produces output that passes PageFeatureSchema validation', () => {
    const spec = derivePageFeatureSpec(baseConfig, testContract)
    const result = PageFeatureSchema.safeParse(spec)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// validatePageConfig — pre-derivation validation
// ============================================================================

describe('validatePageConfig', () => {
  it('returns valid for correct field references', () => {
    const config = {
      entityName: 'task',
      listColumns: ['title', 'status'],
      headerField: 'title',
      enumFields: [{ field: 'status', options: ['pending'] }],
      detailSections: [{ title: 'Info', fields: ['title', 'description'] }],

    }

    const result = validatePageConfig(config, testContract)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects entity not in contract', () => {
    const config = {
      entityName: 'nonexistent',
      listColumns: [],
      headerField: 'id',
      enumFields: [],
      detailSections: [],

    }

    const result = validatePageConfig(config, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('nonexistent')
  })

  it('rejects invalid listColumn', () => {
    const config = {
      entityName: 'task',
      listColumns: ['title', 'bad_column'],
      headerField: 'title',
      enumFields: [],
      detailSections: [],

    }

    const result = validatePageConfig(config, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('bad_column')
  })

  it('rejects invalid headerField', () => {
    const config = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'nonexistent',
      enumFields: [],
      detailSections: [],

    }

    const result = validatePageConfig(config, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('nonexistent')
  })

  it('rejects invalid enumField column', () => {
    const config = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: [{ field: 'bad_field', options: ['a'] }],
      detailSections: [],

    }

    const result = validatePageConfig(config, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('bad_field')
  })

  it('rejects invalid detail section field', () => {
    const config = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: [],
      detailSections: [{ title: 'Info', fields: ['title', 'nonexistent'] }],

    }

    const result = validatePageConfig(config, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('nonexistent')
  })
})

// ============================================================================
// PageFeatureSchema — kept as validation schema for defense-in-depth
// ============================================================================

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
          { field: 'title', label: 'Title', inputType: 'text', placeholder: 'Enter title', options: [] },
          { field: 'description', label: 'Description', inputType: 'textarea', placeholder: '', options: [] },
        ],
        emptyStateMessage: 'No tasks yet. Create your first task!',
        filters: [],
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
        filters: [],
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

  it('passes through valid data unchanged', () => {
    const input = {
      entityName: 'task',
      listPage: {
        columns: [{ field: 'title', label: 'Title', format: 'text' }],
        searchFields: ['title'],
        sortDefault: 'created_at',
        sortDirection: 'desc',
        createFormFields: [
          { field: 'status', label: 'Status', inputType: 'select', placeholder: 'Choose status', options: ['pending', 'done'] },
        ],
        emptyStateMessage: 'No tasks',
        filters: [
          { field: 'status', label: 'Status', type: 'select', options: ['pending', 'done'] },
        ],
      },
      detailPage: {
        headerField: 'title',
        sections: [{ title: 'Info', fields: [{ field: 'title', label: 'Title', format: 'text' }] }],
        editFormFields: [{ field: 'title', label: 'Title', inputType: 'text' }],
      },
    }

    const result = PageFeatureSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.listPage.createFormFields[0].placeholder).toBe('Choose status')
      expect(result.data.listPage.createFormFields[0].options).toEqual(['pending', 'done'])
      expect(result.data.listPage.filters[0].options).toEqual(['pending', 'done'])
    }
  })
})

// CustomProcedureSchema was removed in the PostgREST migration —
// generated apps use SQL Functions instead of tRPC procedures.

// ============================================================================
// validateFeatureSpec — post-derivation validation (defense-in-depth)
// ============================================================================

describe('validateFeatureSpec', () => {
  it('returns valid for correct field references', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'task',
      listPage: {
        columns: [{ field: 'title', label: 'Title', format: 'text' }],
        searchFields: ['title'],
        sortDefault: 'created_at',
        sortDirection: 'asc',
        createFormFields: [{ field: 'title', label: 'Title', inputType: 'text', placeholder: '', options: [] }],
        emptyStateMessage: 'Empty',
        filters: [],
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
        filters: [],
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
        filters: [],
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

  it('validates filter fields reference valid columns', () => {
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
          { field: 'is_complete', label: 'Complete', type: 'boolean', options: [] },
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

  it('rejects invalid filter field', () => {
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
          { field: 'invalid_column', label: 'Invalid', type: 'search', options: [] },
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
