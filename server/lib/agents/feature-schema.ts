import { z } from 'zod'
import type { SchemaContract } from '../schema-contract'

// ============================================================================
// Column display format — closed enum for deterministic rendering
// ============================================================================

const ColumnFormatSchema = z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean'])
const DetailFormatSchema = z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean', 'json'])

// ============================================================================
// Form input type — closed enum mapping to shadcn/ui components
// ============================================================================

const InputTypeSchema = z.enum([
  'text', 'textarea', 'number', 'select', 'date', 'email', 'url', 'checkbox',
])

// ============================================================================
// PageFeatureSchema — structured output from LLM feature analysis
// ============================================================================

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
    createFormFields: z.array(z.object({
      field: z.string(),
      label: z.string(),
      inputType: InputTypeSchema,
      placeholder: z.string().optional(),
      options: z.array(z.string()).optional(),
    })),
    emptyStateMessage: z.string(),
    // E4: Auto-generated filter UI from column types
    filters: z.array(z.object({
      field: z.string(),
      label: z.string(),
      type: z.enum(['search', 'select', 'boolean', 'dateRange']),
      options: z.array(z.string()).optional(), // for select type
    })).optional(),
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
    })),
  }),
})

export type PageFeatureSpec = z.infer<typeof PageFeatureSchema>

// ============================================================================
// CustomProcedureSchema — structured output for backend custom procedures
// ============================================================================

export const CustomProcedureSchema = z.object({
  procedures: z.array(z.object({
    name: z.string(),
    type: z.enum(['query', 'mutation']),
    access: z.enum(['public', 'protected']),
    description: z.string(),
    inputFields: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'string[]']),
      optional: z.boolean(),
    })),
    implementation: z.string(),
  })),
})

export type CustomProcedureSpec = z.infer<typeof CustomProcedureSchema>

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

  // Find the table for this entity
  const table = contract.tables.find((t) => t.name === spec.entityName)
  if (!table) {
    errors.push(`Entity "${spec.entityName}" not found in contract`)
    return { valid: false, errors }
  }

  const columnNames = new Set(table.columns.map((c) => c.name))

  // Validate list page columns
  for (const col of spec.listPage.columns) {
    if (!columnNames.has(col.field)) {
      errors.push(`List column "${col.field}" not found in table "${spec.entityName}"`)
    }
  }

  // Validate search fields
  for (const field of spec.listPage.searchFields) {
    if (!columnNames.has(field)) {
      errors.push(`Search field "${field}" not found in table "${spec.entityName}"`)
    }
  }

  // Validate sort default
  if (!columnNames.has(spec.listPage.sortDefault)) {
    errors.push(`Sort default "${spec.listPage.sortDefault}" not found in table "${spec.entityName}"`)
  }

  // Validate create form fields
  for (const field of spec.listPage.createFormFields) {
    if (!columnNames.has(field.field)) {
      errors.push(`Create form field "${field.field}" not found in table "${spec.entityName}"`)
    }
  }

  // E4: Validate filter fields
  for (const filter of spec.listPage.filters ?? []) {
    if (!columnNames.has(filter.field)) {
      errors.push(`Filter field "${filter.field}" not found in table "${spec.entityName}"`)
    }
  }

  // Validate detail page header field
  if (!columnNames.has(spec.detailPage.headerField)) {
    errors.push(`Header field "${spec.detailPage.headerField}" not found in table "${spec.entityName}"`)
  }

  // Validate detail sections
  for (const section of spec.detailPage.sections) {
    for (const field of section.fields) {
      if (!columnNames.has(field.field)) {
        errors.push(`Detail field "${field.field}" not found in table "${spec.entityName}"`)
      }
    }
  }

  // Validate edit form fields
  for (const field of spec.detailPage.editFormFields) {
    if (!columnNames.has(field.field)) {
      errors.push(`Edit form field "${field.field}" not found in table "${spec.entityName}"`)
    }
  }

  return { valid: errors.length === 0, errors }
}
