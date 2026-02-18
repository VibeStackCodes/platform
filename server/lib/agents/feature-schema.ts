import { z } from 'zod'
import type { SchemaContract, TableDef } from '../schema-contract'
import { classifyColumn } from '../column-classifier'
import type { ColumnClassification } from '../column-classifier'
import { pluralize } from '../naming-utils'

// ============================================================================
// Coercion helper — recover arrays from LLM edge cases
// ============================================================================

/** Coerce null/undefined/string/object → array. Logs when coercion fires. */
function coerceArray(fieldName: string) {
  return (val: unknown): unknown => {
    if (val === null || val === undefined) {
      console.warn(`[feature-schema] ${fieldName}: coerced ${val} → []`)
      return []
    }
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        if (Array.isArray(parsed)) return parsed
      } catch { /* not JSON */ }
      return val.split(',').map(s => s.trim()).filter(Boolean)
    }
    if (typeof val === 'object' && !Array.isArray(val)) return [val]
    return val
  }
}

// ============================================================================
// PageConfigSchema — SIMPLIFIED structured output from LLM
//
// Only fields that require LLM judgment. Everything else (formats, labels,
// input types, filter types) is derived deterministically from the contract.
//
// ~10 fields vs ~40 in the old PageFeatureSchema → faster constrained decoding,
// fewer tokens, less room for LLM errors.
// ============================================================================

export const PageConfigSchema = z.object({
  entityName: z.string()
    .describe('Exact table name from the database schema (snake_case, e.g. "task")'),

  listColumns: z.array(z.string())
    .describe('Column names to show in the list table (3-6 most important, e.g. ["title","status","due_date"])'),

  headerField: z.string()
    .describe('Column name for the detail page title (e.g. "title" or "name")'),

  enumFields: z.preprocess(
    coerceArray('enumFields'),
    z.array(z.object({
      field: z.string().describe('Column name that has enum-like values'),
      options: z.array(z.string()).describe('Known values, e.g. ["pending","active","done"]'),
    })).catch([]).describe('Columns with known dropdown options (for select inputs and filters)'),
  ),

  detailSections: z.array(z.object({
    title: z.string().describe('Section heading, e.g. "Details", "Metadata"'),
    fields: z.array(z.string()).describe('Column names in this section'),
  })).describe('How to group fields on the detail page'),

})

export type PageConfig = z.infer<typeof PageConfigSchema>

// ============================================================================
// Deterministic PageConfig inference — replaces LLM frontendAgent call
//
// Uses ColumnSemanticClassifier to pick list columns, header field,
// enum fields, and detail sections. Zero LLM involvement.
// ============================================================================

/** Well-known enum option defaults by semantic type */
const DEFAULT_ENUM_OPTIONS: Record<string, string[]> = {
  status: ['pending', 'active', 'completed'],
  priority: ['low', 'medium', 'high'],
  role: ['admin', 'member', 'viewer'],
}

/** Section assignment based on semantic type */
type SectionBucket = 'details' | 'properties' | 'dates'

function sectionBucket(cls: ColumnClassification): SectionBucket {
  const s = cls.semantic
  // Date/timestamp columns → Dates section
  if (
    s === 'created_at' || s === 'updated_at' || s === 'timestamp' ||
    s === 'date' || s === 'birthdate'
  ) return 'dates'
  // Enum-like, boolean, numeric, json → Properties section
  if (
    s === 'status' || s === 'type' || s === 'category' || s === 'role' || s === 'enum' ||
    s === 'boolean' || s === 'json' || s === 'currency' || s === 'price' ||
    s === 'quantity' || s === 'score' || s === 'rating' ||
    s === 'generic_number' || s === 'color'
  ) return 'properties'
  // Everything else → Details section
  return 'details'
}

/**
 * Infer a PageConfig deterministically from a table definition + contract.
 * No LLM call — uses the column classifier for all decisions.
 */
export function inferPageConfig(
  table: TableDef,
  contract: SchemaContract,
): PageConfig {
  // Classify all columns
  const classifications = table.columns.map((col) => ({
    col,
    cls: classifyColumn({
      name: col.name,
      type: col.type,
      references: col.references ?? undefined,
    }),
  }))

  // Build enum name → values map from contract.enums
  const contractEnums = new Map<string, string[]>()
  if (contract.enums) {
    for (const e of contract.enums) {
      contractEnums.set(e.name, e.values)
    }
  }

  // ── headerField: first title/name column, fallback to first non-auto text ──
  const headerField =
    classifications.find((c) => c.cls.semantic === 'title')?.col.name ??
    classifications.find((c) => c.cls.semantic === 'name')?.col.name ??
    classifications.find((c) => c.cls.semantic === 'full_name')?.col.name ??
    classifications.find((c) => c.cls.semantic === 'first_name')?.col.name ??
    classifications.find((c) =>
      !c.cls.isAutoManaged && c.col.type === 'text' && c.cls.semantic !== 'description' && c.cls.semantic !== 'content',
    )?.col.name ??
    table.columns[0].name

  // ── listColumns: sort by priority, pick top 6 visible columns ──
  const listColumns = classifications
    .filter((c) => c.cls.showInList && !c.cls.isAutoManaged)
    .toSorted((a, b) => a.cls.listPriority - b.cls.listPriority)
    .slice(0, 6)
    .map((c) => c.col.name)

  // Ensure we have at least 2 columns (add created_at if needed)
  if (listColumns.length < 2) {
    const createdAt = table.columns.find((c) => c.name === 'created_at')
    if (createdAt && !listColumns.includes('created_at')) {
      listColumns.push('created_at')
    }
  }
  // Ensure headerField is always in listColumns
  if (!listColumns.includes(headerField)) {
    listColumns.unshift(headerField)
    if (listColumns.length > 6) listColumns.pop()
  }

  // ── enumFields: columns with enum-like semantics ──
  const enumFields: Array<{ field: string; options: string[] }> = []
  for (const { col, cls } of classifications) {
    if (cls.isAutoManaged) continue
    const isEnumSemantic = ['status', 'type', 'category', 'role', 'enum'].includes(cls.semantic)
    if (!isEnumSemantic) continue

    // Try contract.enums first (match by column name or table_column pattern)
    const enumFromContract =
      contractEnums.get(col.name) ??
      contractEnums.get(`${table.name}_${col.name}`)
    if (enumFromContract) {
      enumFields.push({ field: col.name, options: enumFromContract })
      continue
    }

    // Fallback to well-known defaults by keyword match
    const matchedKey = Object.keys(DEFAULT_ENUM_OPTIONS).find((key) =>
      col.name.includes(key),
    )
    if (matchedKey) {
      enumFields.push({ field: col.name, options: DEFAULT_ENUM_OPTIONS[matchedKey] })
    }
    // No match = don't mark as enum (text input instead of broken select)
  }

  // ── detailSections: group non-PK/non-auto columns by type ──
  const buckets: Record<SectionBucket, string[]> = {
    details: [],
    properties: [],
    dates: [],
  }

  for (const { col, cls } of classifications) {
    if (col.primaryKey || cls.isAutoManaged) continue
    buckets[sectionBucket(cls)].push(col.name)
  }

  const detailSections: Array<{ title: string; fields: string[] }> = []
  if (buckets.details.length > 0) detailSections.push({ title: 'Details', fields: buckets.details })
  if (buckets.properties.length > 0) detailSections.push({ title: 'Properties', fields: buckets.properties })
  if (buckets.dates.length > 0) detailSections.push({ title: 'Dates', fields: buckets.dates })

  // If all columns ended up in one section, just call it "Details"
  if (detailSections.length === 0) {
    const allNonAuto = classifications
      .filter((c) => !c.col.primaryKey && !c.cls.isAutoManaged)
      .map((c) => c.col.name)
    if (allNonAuto.length > 0) detailSections.push({ title: 'Details', fields: allNonAuto })
  }

  return {
    entityName: table.name,
    listColumns,
    headerField,
    enumFields,
    detailSections,
  }
}

// ============================================================================
// Deterministic derivation — PageConfig + Contract → PageFeatureSpec
//
// All formats, labels, input types, filters, and form fields are derived
// from column types in the contract. Zero LLM involvement.
// ============================================================================

/** Auto-managed columns excluded from create/edit forms */
const AUTO_COLUMNS = new Set(['id', 'created_at', 'updated_at', 'user_id'])

/**
 * Returns the FK ref table for a dropdown, or undefined if not applicable.
 * By the time this runs the contract has been normalized via SchemaContractSchema.transform(),
 * so `col.references` is already populated for all inferable FK columns.
 */
function fkRefTable(
  col: { name: string; references?: { table: string; column: string } },
): string | undefined {
  // auth.users FKs are structural — never a user-facing dropdown
  if (col.references?.table === 'auth.users') return undefined
  return col.references?.table
}

/** snake_case → Title Case */
function snakeToLabel(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Derive display format from SQL type (for list columns) */
function deriveColumnFormat(type: string, name: string): ColumnFormat {
  if (type === 'timestamptz' || type.includes('timestamp')) return 'date'
  if (type === 'boolean') return 'boolean'
  if (name.endsWith('_url') || name.endsWith('_link') || name === 'url') return 'link'
  if ((type === 'numeric' || type === 'decimal') && /amount|price|cost|total|fee|budget|balance|salary|rate|limit/.test(name)) return 'currency'
  return 'text'
}

/** Derive detail format (superset of column format — includes 'json') */
function deriveDetailFormat(type: string, name: string): DetailFormat {
  if (type === 'jsonb') return 'json'
  return deriveColumnFormat(type, name)
}

/** Derive form input type from SQL type */
function deriveInputType(type: string, name: string, isEnum: boolean): InputType {
  if (isEnum) return 'select'
  if (type === 'boolean') return 'checkbox'
  if (type === 'timestamptz' || type.includes('timestamp')) return 'date'
  if (type === 'numeric' || type === 'integer' || type === 'bigint') return 'number'
  if (name === 'email') return 'email'
  if (name.endsWith('_url') || name === 'url') return 'url'
  if (name === 'description' || name === 'content' || name === 'body' || name === 'notes') return 'textarea'
  return 'text'
}

/** Derive form placeholder from column name and type */
function deriveFormPlaceholder(name: string, type: string, isEnum: boolean): string {
  if (isEnum) return ''
  if (type === 'boolean' || type === 'timestamptz') return ''
  if (name === 'email' || name.includes('email')) return 'e.g., name@example.com'
  if (name.endsWith('_url') || name === 'url' || name.includes('website')) return 'e.g., https://example.com'
  if (name.includes('phone')) return 'e.g., (555) 000-1234'
  return `Enter ${snakeToLabel(name).toLowerCase()}`
}

/** Derive filter type from SQL type */
function deriveFilterType(type: string, isEnum: boolean): 'search' | 'select' | 'boolean' | 'dateRange' {
  if (isEnum) return 'select'
  if (type === 'boolean') return 'boolean'
  if (type === 'timestamptz' || type.includes('timestamp')) return 'dateRange'
  return 'search'
}

// Format types (re-exported for assembler compatibility)
type ColumnFormat = 'text' | 'date' | 'badge' | 'currency' | 'link' | 'boolean'
type DetailFormat = ColumnFormat | 'json'
type InputType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'email' | 'url' | 'checkbox'

// ============================================================================
// PageFeatureSpec — the full derived specification used by assemblers
// (same shape as before so assemblers don't need to change)
// ============================================================================

export interface PageFeatureSpec {
  entityName: string
  listPage: {
    columns: Array<{ field: string; label: string; format: ColumnFormat }>
    searchFields: string[]
    sortDefault: string
    sortDirection: 'asc' | 'desc'
    emptyStateMessage: string
    createFormFields: Array<{
      field: string
      label: string
      inputType: InputType
      placeholder: string
      options: string[]
      refTable?: string
    }>
    filters: Array<{
      field: string
      label: string
      type: 'search' | 'select' | 'boolean' | 'dateRange'
      options: string[]
    }>
  }
  detailPage: {
    headerField: string
    sections: Array<{
      title: string
      fields: Array<{ field: string; label: string; format: DetailFormat }>
    }>
    editFormFields: Array<{
      field: string
      label: string
      inputType: InputType
      refTable?: string
    }>
  }
}

/**
 * Derive a full PageFeatureSpec from a simplified PageConfig + SchemaContract.
 * All formats, labels, input types, and filters are computed deterministically.
 */
export function derivePageFeatureSpec(
  config: PageConfig,
  contract: SchemaContract,
): PageFeatureSpec {
  const table = contract.tables.find((t) => t.name === config.entityName)
  if (!table) throw new Error(`Table "${config.entityName}" not found in contract`)

  const columnMap = new Map(table.columns.map((c) => [c.name, c]))
  const enumMap = new Map(config.enumFields.map((e) => [e.field, e.options]))

  // Derive list columns with format and label
  const listColumns = config.listColumns
    .filter((name) => columnMap.has(name))
    .map((name) => {
      const col = columnMap.get(name)!
      const isEnum = enumMap.has(name)
      return {
        field: name,
        label: snakeToLabel(name),
        format: isEnum ? 'badge' as ColumnFormat : deriveColumnFormat(col.type, name),
      }
    })

  // Search fields: text columns from listColumns
  const searchFields = config.listColumns.filter((name) => {
    const col = columnMap.get(name)
    return col && col.type === 'text' && !enumMap.has(name)
  })

  // Sort: prefer created_at desc, fallback to first timestamp or first column
  const timestamps = table.columns.filter((c) => c.type === 'timestamptz')
  const sortDefault = timestamps.find((c) => c.name === 'created_at')?.name
    ?? timestamps[0]?.name
    ?? table.columns[0].name
  const sortDirection: 'asc' | 'desc' = timestamps.some((c) => c.name === sortDefault) ? 'desc' : 'asc'

  // Create form: non-auto columns, excluding auth.users FK columns (structural — not user-editable)
  const formColumns = table.columns.filter(
    (c) => !AUTO_COLUMNS.has(c.name) && !c.primaryKey && c.references?.table !== 'auth.users',
  )
  const createFormFields = formColumns.map((col) => {
    const isEnum = enumMap.has(col.name)
    return {
      field: col.name,
      label: snakeToLabel(col.name),
      inputType: deriveInputType(col.type, col.name, isEnum),
      placeholder: deriveFormPlaceholder(col.name, col.type, isEnum),
      options: enumMap.get(col.name) ?? [],
      refTable: fkRefTable(col),
    }
  })

  // Filters: enum columns + boolean columns + timestamp columns (from non-auto columns)
  const filterColumns = table.columns.filter(
    (c) => !c.primaryKey && (enumMap.has(c.name) || c.type === 'boolean' || c.type === 'timestamptz'),
  )
  const filters = filterColumns
    .filter((c) => !AUTO_COLUMNS.has(c.name))
    .map((col) => {
      const isEnum = enumMap.has(col.name)
      return {
        field: col.name,
        label: snakeToLabel(col.name),
        type: deriveFilterType(col.type, isEnum),
        options: enumMap.get(col.name) ?? [],
      }
    })

  // Detail sections: derive formats for each field
  const sections = config.detailSections.map((section) => ({
    title: section.title,
    fields: section.fields
      .filter((name) => columnMap.has(name))
      .map((name) => {
        const col = columnMap.get(name)!
        const isEnum = enumMap.has(name)
        return {
          field: name,
          label: snakeToLabel(name),
          format: isEnum ? 'badge' as DetailFormat : deriveDetailFormat(col.type, name),
        }
      }),
  }))

  // Edit form: same as create form minus inputType-specific fields
  const editFormFields = formColumns.map((col) => ({
    field: col.name,
    label: snakeToLabel(col.name),
    inputType: deriveInputType(col.type, col.name, enumMap.has(col.name)),
    refTable: fkRefTable(col),
  }))

  return {
    entityName: config.entityName,
    listPage: {
      columns: listColumns,
      searchFields,
      sortDefault,
      sortDirection,
      emptyStateMessage: `No ${pluralize(snakeToLabel(config.entityName).toLowerCase())} yet. Create your first ${snakeToLabel(config.entityName).toLowerCase()}!`,
      createFormFields,
      filters,
    },
    detailPage: {
      headerField: config.headerField,
      sections,
      editFormFields,
    },
  }
}

// ============================================================================
// Legacy PageFeatureSchema — kept as Zod schema for safeParse validation
// of the derived output (defense-in-depth)
// ============================================================================

const ColumnFormatSchema = z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean'])
const DetailFormatSchema = z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean', 'json'])
const InputTypeSchema = z.enum([
  'text', 'textarea', 'number', 'select', 'date', 'email', 'url', 'checkbox',
])

export const PageFeatureSchema = z.object({
  entityName: z.string(),
  listPage: z.object({
    columns: z.array(z.object({
      field: z.string(),
      label: z.string(),
      format: ColumnFormatSchema,
    })),
    searchFields: z.array(z.string()),
    sortDefault: z.string(),
    sortDirection: z.enum(['asc', 'desc']),
    emptyStateMessage: z.string(),
    createFormFields: z.array(z.object({
      field: z.string(),
      label: z.string(),
      inputType: InputTypeSchema,
      placeholder: z.string(),
      options: z.array(z.string()),
      refTable: z.string().optional(),
    })),
    filters: z.array(z.object({
      field: z.string(),
      label: z.string(),
      type: z.enum(['search', 'select', 'boolean', 'dateRange']),
      options: z.array(z.string()),
    })),
  }),
  detailPage: z.object({
    headerField: z.string(),
    sections: z.array(z.object({
      title: z.string(),
      fields: z.array(z.object({
        field: z.string(),
        label: z.string(),
        format: DetailFormatSchema,
      })),
    })),
    editFormFields: z.array(z.object({
      field: z.string(),
      label: z.string(),
      inputType: InputTypeSchema,
      refTable: z.string().optional(),
    })),
  }),
})

// ============================================================================
// Validation — ensure all field references exist in the contract
// ============================================================================

interface FeatureValidationResult {
  valid: boolean
  errors: string[]
}

export function validateFeatureSpec(
  spec: PageFeatureSpec,
  contract: SchemaContract,
): FeatureValidationResult {
  const errors: string[] = []

  const table = contract.tables.find((t) => t.name === spec.entityName)
  if (!table) {
    errors.push(`Entity "${spec.entityName}" not found in contract`)
    return { valid: false, errors }
  }

  const columnNames = new Set(table.columns.map((c) => c.name))

  for (const col of spec.listPage.columns) {
    if (!columnNames.has(col.field))
      errors.push(`List column "${col.field}" not found in table "${spec.entityName}"`)
  }

  for (const field of spec.listPage.searchFields) {
    if (!columnNames.has(field))
      errors.push(`Search field "${field}" not found in table "${spec.entityName}"`)
  }

  if (!columnNames.has(spec.listPage.sortDefault))
    errors.push(`Sort default "${spec.listPage.sortDefault}" not found in table "${spec.entityName}"`)

  for (const field of spec.listPage.createFormFields) {
    if (!columnNames.has(field.field))
      errors.push(`Create form field "${field.field}" not found in table "${spec.entityName}"`)
  }

  for (const filter of spec.listPage.filters) {
    if (!columnNames.has(filter.field))
      errors.push(`Filter field "${filter.field}" not found in table "${spec.entityName}"`)
  }

  if (!columnNames.has(spec.detailPage.headerField))
    errors.push(`Header field "${spec.detailPage.headerField}" not found in table "${spec.entityName}"`)

  for (const section of spec.detailPage.sections) {
    for (const field of section.fields) {
      if (!columnNames.has(field.field))
        errors.push(`Detail field "${field.field}" not found in table "${spec.entityName}"`)
    }
  }

  for (const field of spec.detailPage.editFormFields) {
    if (!columnNames.has(field.field))
      errors.push(`Edit form field "${field.field}" not found in table "${spec.entityName}"`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate a PageConfig against a contract (used before derivation).
 * Checks that all referenced column names exist.
 */
export function validatePageConfig(
  config: PageConfig,
  contract: SchemaContract,
): FeatureValidationResult {
  const errors: string[] = []

  const table = contract.tables.find((t) => t.name === config.entityName)
  if (!table) {
    errors.push(`Entity "${config.entityName}" not found in contract`)
    return { valid: false, errors }
  }

  const columnNames = new Set(table.columns.map((c) => c.name))

  for (const col of config.listColumns) {
    if (!columnNames.has(col))
      errors.push(`List column "${col}" not found in table "${config.entityName}"`)
  }

  if (!columnNames.has(config.headerField))
    errors.push(`Header field "${config.headerField}" not found in table "${config.entityName}"`)

  for (const ef of config.enumFields) {
    if (!columnNames.has(ef.field))
      errors.push(`Enum field "${ef.field}" not found in table "${config.entityName}"`)
  }

  for (const section of config.detailSections) {
    for (const field of section.fields) {
      if (!columnNames.has(field))
        errors.push(`Detail field "${field}" not found in table "${config.entityName}"`)
    }
  }

  return { valid: errors.length === 0, errors }
}
