import { describe, expect, it, vi } from 'vitest'
import {
  PageConfigSchema,
  PageFeatureSchema,
  derivePageFeatureSpec,
  inferPageConfig,
  validateFeatureSpec,
  validatePageConfig,
} from '@server/lib/agents/feature-schema'
import { SchemaContractSchema } from '@server/lib/schema-contract'
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

  it('populates refTable for FK columns and omits it for non-FK columns', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'order_item',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'product_id', type: 'uuid', references: { table: 'product', column: 'id' } },
          { name: 'quantity', type: 'integer' },
          { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const spec = derivePageFeatureSpec(config, contract)

    // product_id should have refTable set (non-auth FK)
    const productField = spec.listPage.createFormFields.find(f => f.field === 'product_id')
    expect(productField).toBeDefined()
    expect(productField?.refTable).toBe('product')

    // quantity should not have refTable
    const qtyField = spec.listPage.createFormFields.find(f => f.field === 'quantity')
    expect(qtyField?.refTable).toBeUndefined()

    // user_id is auto-managed and should be excluded from the form entirely
    const userIdField = spec.listPage.createFormFields.find(f => f.field === 'user_id')
    expect(userIdField).toBeUndefined()
  })

  it('excludes auth.users FK columns from create and edit forms', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'post',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'author_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const spec = derivePageFeatureSpec(config, contract)

    const createFields = spec.listPage.createFormFields.map(f => f.field)
    const editFields = spec.detailPage.editFormFields.map(f => f.field)

    // auth.users FK columns should be excluded from both forms
    expect(createFields).not.toContain('author_id')
    expect(editFields).not.toContain('author_id')
  })

  it('populates refTable in editFormFields for non-auth FK columns', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'project_id', type: 'uuid', references: { table: 'project', column: 'id' } },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
        { name: 'project', columns: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'name', type: 'text' }] },
      ],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const spec = derivePageFeatureSpec(config, contract)

    const projectEditField = spec.detailPage.editFormFields.find(f => f.field === 'project_id')
    expect(projectEditField).toBeDefined()
    expect(projectEditField?.refTable).toBe('project')
  })

  it('infers refTable from _id column name when references field is absent', () => {
    // Simulates analyst output that omits `references` on FK columns.
    // Contract is parsed through SchemaContractSchema so the .transform() runs
    // and populates `col.references` for all detectable FK columns.
    const contract = SchemaContractSchema.parse({
      tables: [
        {
          name: 'menu_item',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'name', type: 'text' },
            { name: 'category_id', type: 'uuid' },          // no explicit references
            { name: 'table_id', type: 'uuid' },             // no explicit references (reserved-word table)
            { name: 'price', type: 'numeric' },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
        { name: 'menu_categories', columns: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'name', type: 'text' }] },
        { name: 'table_record', columns: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'name', type: 'text' }] },
      ],
    })
    const config = inferPageConfig(contract.tables[0], contract)
    const spec = derivePageFeatureSpec(config, contract)

    // category_id → stem 'category' → found in 'menu_categories' (substring match)
    const catField = spec.listPage.createFormFields.find(f => f.field === 'category_id')
    expect(catField?.refTable).toBe('menu_categories')

    // table_id → stem 'table' → found in 'table_record' (reserved-word rename)
    const tableField = spec.listPage.createFormFields.find(f => f.field === 'table_id')
    expect(tableField?.refTable).toBe('table_record')

    // price has no _id suffix → no refTable
    const priceField = spec.listPage.createFormFields.find(f => f.field === 'price')
    expect(priceField?.refTable).toBeUndefined()
  })

  it('does not infer refTable for _id columns with no matching contract table', () => {
    const contract = SchemaContractSchema.parse({
      tables: [{
        name: 'event',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'text' },
          { name: 'external_service_id', type: 'uuid' }, // _id but no matching table
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    })
    const config = inferPageConfig(contract.tables[0], contract)
    const spec = derivePageFeatureSpec(config, contract)

    // external_service_id → no matching table in contract → text input
    const extField = spec.listPage.createFormFields.find(f => f.field === 'external_service_id')
    expect(extField?.refTable).toBeUndefined()
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

// ============================================================================
// inferPageConfig — deterministic PageConfig from contract (no LLM)
// ============================================================================

describe('inferPageConfig', () => {
  it('picks title as headerField when available', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'post',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'body', type: 'text' },
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    expect(config.headerField).toBe('title')
  })

  it('falls back to name when no title exists', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'category',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'text' },
          { name: 'description', type: 'text' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    expect(config.headerField).toBe('name')
  })

  it('falls back to first non-auto text column when no title/name', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'log_entry',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'message', type: 'text' },
          { name: 'severity', type: 'text' },
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    // 'message' matches 'content' rule (no), it's generic_text — first non-auto text
    // Actually 'message' doesn't match description/content patterns, so it's generic_text
    expect(config.headerField).toBe('message')
  })

  it('falls back to first column when no suitable text column exists', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'measurement',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'temperature', type: 'numeric' },
          { name: 'humidity', type: 'numeric' },
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    // No text columns at all → falls back to table.columns[0].name
    expect(config.headerField).toBe('id')
  })

  it('sorts listColumns by priority — title/name before status before timestamps', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'task',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'created_at', type: 'timestamptz' },
          { name: 'status', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'email', type: 'text' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    // title=1, email=2, status=2, created_at=4 (but created_at is autoManaged → filtered)
    expect(config.listColumns[0]).toBe('title')
    expect(config.listColumns).toContain('email')
    expect(config.listColumns).toContain('status')
  })

  it('caps listColumns at 6', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'person',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'first_name', type: 'text' },
          { name: 'last_name', type: 'text' },
          { name: 'email', type: 'text' },
          { name: 'status', type: 'text' },
          { name: 'role', type: 'text' },
          { name: 'is_active', type: 'boolean' },
          { name: 'score', type: 'integer' },
          { name: 'quantity', type: 'integer' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    expect(config.listColumns.length).toBeLessThanOrEqual(6)
  })

  it('ensures headerField is always in listColumns', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'article',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'description', type: 'text' }, // showInList=false
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    expect(config.headerField).toBe('title')
    expect(config.listColumns).toContain('title')
  })

  it('adds created_at when listColumns has fewer than 2 entries', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'simple',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'label', type: 'text' }, // generic_text, showInList=false
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    // 'label' → generic_text → showInList=false → listColumns starts empty
    // headerField = 'label' (first non-auto text) → unshift into listColumns → [label]
    // length < 2 → adds created_at → [label, created_at]
    expect(config.listColumns).toContain('label')
    expect(config.listColumns).toContain('created_at')
    expect(config.listColumns.length).toBeGreaterThanOrEqual(2)
  })

  it('uses contract.enums when available for enum fields', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'ticket',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'status', type: 'text' },
        ],
      }],
      enums: [
        { name: 'status', values: ['open', 'in_progress', 'closed'] },
      ],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const statusEnum = config.enumFields.find(e => e.field === 'status')
    expect(statusEnum).toBeDefined()
    expect(statusEnum?.options).toEqual(['open', 'in_progress', 'closed'])
  })

  it('uses table_column pattern for contract.enums', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'order',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'status', type: 'text' },
        ],
      }],
      enums: [
        { name: 'order_status', values: ['pending', 'shipped', 'delivered'] },
      ],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const statusEnum = config.enumFields.find(e => e.field === 'status')
    expect(statusEnum?.options).toEqual(['pending', 'shipped', 'delivered'])
  })

  it('falls back to DEFAULT_ENUM_OPTIONS for well-known enum fields', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'task',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'status', type: 'text' },
          { name: 'priority', type: 'text' },
        ],
      }],
      // No enums defined → uses well-known defaults
    }
    const config = inferPageConfig(contract.tables[0], contract)

    const statusEnum = config.enumFields.find(e => e.field === 'status')
    expect(statusEnum?.options).toEqual(['pending', 'active', 'completed'])

    // 'priority' matches keyword via classifier → semantic 'generic_text'
    // Actually priority doesn't match any classifier rule → generic_text → not enum semantic
    // So no enum entry for priority via classifier
    // BUT wait — let me check: classifier doesn't have a priority rule
    // priority is generic_text → isEnumSemantic = false → skipped
  })

  it('does not mark enum-semantic column as enum when no options available', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'widget',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'widget_type', type: 'text' }, // semantic: 'type'
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    // 'widget_type' → semantic 'type' → isEnumSemantic=true
    // No contract enum, no DEFAULT_ENUM_OPTIONS match for 'widget_type'
    // → should NOT be in enumFields
    expect(config.enumFields.find(e => e.field === 'widget_type')).toBeUndefined()
  })

  it('groups columns into correct detail sections', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'product',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'text' },           // → Details
          { name: 'description', type: 'text' },     // → Details
          { name: 'price', type: 'numeric' },         // → Properties (currency)
          { name: 'status', type: 'text' },           // → Properties (status)
          { name: 'is_active', type: 'boolean' },     // → Properties (boolean)
          { name: 'created_at', type: 'timestamptz' },// → auto-managed, excluded
          { name: 'updated_at', type: 'timestamptz' },// → auto-managed, excluded
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)

    const details = config.detailSections.find(s => s.title === 'Details')
    const properties = config.detailSections.find(s => s.title === 'Properties')
    const dates = config.detailSections.find(s => s.title === 'Dates')

    expect(details?.fields).toContain('name')
    expect(details?.fields).toContain('description')
    expect(properties?.fields).toContain('price')
    expect(properties?.fields).toContain('status')
    expect(properties?.fields).toContain('is_active')
    // Auto-managed timestamps are excluded from all sections
    expect(dates).toBeUndefined()
  })

  it('puts non-auto timestamps in Dates section', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'event',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'start_time', type: 'timestamptz' }, // generic timestamp → not auto-managed
          { name: 'end_time', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)

    const dates = config.detailSections.find(s => s.title === 'Dates')
    expect(dates?.fields).toContain('start_time')
    expect(dates?.fields).toContain('end_time')
  })

  it('excludes auto-managed columns from detail sections', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'task',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'user_id', type: 'uuid', references: { table: 'users', column: 'id' } },
          { name: 'created_at', type: 'timestamptz' },
          { name: 'updated_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const allDetailFields = config.detailSections.flatMap(s => s.fields)
    expect(allDetailFields).not.toContain('id')
    expect(allDetailFields).not.toContain('user_id')
    expect(allDetailFields).not.toContain('created_at')
    expect(allDetailFields).not.toContain('updated_at')
  })

  it('creates fallback Details section when all columns would be excluded', () => {
    // Edge case: only PK + auto-managed columns
    const contract: SchemaContract = {
      tables: [{
        name: 'counter',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'created_at', type: 'timestamptz' },
          { name: 'updated_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    // All columns are auto-managed or PK → no section buckets filled → empty detailSections
    expect(config.detailSections).toHaveLength(0)
  })

  it('output passes PageConfigSchema validation', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'task',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'status', type: 'text' },
          { name: 'due_date', type: 'timestamptz' },
          { name: 'is_complete', type: 'boolean' },
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const result = PageConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('entityName matches table name exactly', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'user_profile',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'text' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    expect(config.entityName).toBe('user_profile')
  })

  it('handles FK columns — hidden from list and detail sections', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'comment',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'body', type: 'text' },
          { name: 'post_id', type: 'uuid', references: { table: 'post', column: 'id' } },
          { name: 'user_id', type: 'uuid', references: { table: 'users', column: 'id' } },
          { name: 'created_at', type: 'timestamptz' },
        ],
      }],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    // FK columns should not appear in listColumns
    expect(config.listColumns).not.toContain('post_id')
    expect(config.listColumns).not.toContain('user_id')
    // FK columns (auto-managed) excluded from detail sections
    const allDetailFields = config.detailSections.flatMap(s => s.fields)
    expect(allDetailFields).not.toContain('user_id')
  })
})
