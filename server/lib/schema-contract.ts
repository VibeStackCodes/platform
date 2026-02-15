// lib/schema-contract.ts

import { z } from 'zod'

// ============================================================================
// Zod schemas (runtime validation — used by structuredOutput + tools)
// ============================================================================

const SQL_TYPES = [
  'uuid',
  'text',
  'numeric',
  'boolean',
  'timestamptz',
  'jsonb',
  'integer',
  'bigint',
] as const

export const SQLTypeSchema = z.enum(SQL_TYPES)

// FK reference schema — accepts both object `{ table, column }` and string "table.column"
const FKReferenceSchema = z
  .preprocess((val) => {
    if (typeof val === 'string') {
      // Parse "table.column" or "table(column)" format
      const dotMatch = val.match(/^([^.(]+)\.([^.(]+)$/)
      if (dotMatch) return { table: dotMatch[1], column: dotMatch[2] }
      const parenMatch = val.match(/^([^(]+)\(([^)]+)\)$/)
      if (parenMatch) return { table: parenMatch[1], column: parenMatch[2] }
      // Assume it's a table name referencing "id"
      return { table: val, column: 'id' }
    }
    return val
  }, z.object({
    table: z.string().describe('Referenced table name'),
    column: z.string().describe('Referenced column name'),
  }))
  .describe('Foreign key reference')

export const ColumnDefSchema = z.object({
  name: z.string().describe('Column name (snake_case)'),
  type: SQLTypeSchema.describe('PostgreSQL data type'),
  nullable: z.boolean().optional().describe('Whether column is nullable'),
  // Accept any primitive, coerce to string (LLMs emit numbers/booleans for defaults)
  default: z.preprocess(
    (val) => (val != null ? String(val) : undefined),
    z.string().optional(),
  ).describe('SQL default expression'),
  primaryKey: z.boolean().optional().describe('Whether column is primary key'),
  unique: z.boolean().optional().describe('Whether column has unique constraint'),
  references: FKReferenceSchema.optional(),
})

export const RLSPolicySchema = z.object({
  name: z.string().describe('Policy name'),
  operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']).describe('SQL operation'),
  using: z.string().optional().describe('USING expression for row filtering'),
  withCheck: z.string().optional().describe('WITH CHECK expression for mutations'),
})

export const TableDefSchema = z.object({
  name: z.string().describe('Table name (snake_case, singular)'),
  columns: z.array(ColumnDefSchema).describe('Table columns'),
  // Accept string or array — LLMs sometimes emit "enable RLS" as a string
  rlsPolicies: z.preprocess(
    (val) => {
      if (typeof val === 'string') return [] // Drop invalid string, use empty array
      if (!Array.isArray(val)) return undefined
      return val
    },
    z.array(RLSPolicySchema).optional(),
  ).describe('Row-Level Security policies'),
})

export const EnumDefSchema = z.object({
  name: z.string().describe('Enum type name'),
  values: z.array(z.string()).describe('Enum values'),
})

export const SchemaContractSchema = z.object({
  tables: z.array(TableDefSchema).describe('Database tables'),
  enums: z.array(EnumDefSchema).optional().describe('PostgreSQL enum types'),
})

export const DesignPreferencesSchema = z.object({
  style: z.string().default('modern').describe('Design style (e.g., modern, minimal, playful)'),
  primaryColor: z.string().default('#3b82f6').describe('Primary color (hex code)'),
  fontFamily: z.string().default('Inter').describe('Font family'),
})

// ============================================================================
// TypeScript types (inferred from Zod schemas — single source of truth)
// ============================================================================

export type SQLType = z.infer<typeof SQLTypeSchema>
export type ColumnDef = z.infer<typeof ColumnDefSchema>
export type RLSPolicy = z.infer<typeof RLSPolicySchema>
export type TableDef = z.infer<typeof TableDefSchema>
export type EnumDef = z.infer<typeof EnumDefSchema>
export type SchemaContract = z.infer<typeof SchemaContractSchema>
export type DesignPreferences = z.infer<typeof DesignPreferencesSchema>

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// External tables that are always available (Supabase auth)
const EXTERNAL_TABLES = new Set(['auth.users'])

/**
 * Validate a SchemaContract for correctness:
 * - No duplicate column names within a table
 * - All FK references point to existing tables or external tables
 * - No circular FK dependencies
 */
export function validateContract(contract: SchemaContract): ValidationResult {
  const errors: string[] = []
  const tableNames = new Set(contract.tables.map((t) => t.name))

  for (const table of contract.tables) {
    // Check duplicate columns
    const colNames = new Set<string>()
    for (const col of table.columns) {
      if (colNames.has(col.name)) {
        errors.push(`Table "${table.name}" has duplicate column "${col.name}"`)
      }
      colNames.add(col.name)
    }

    // Check FK references exist
    for (const col of table.columns) {
      if (col.references) {
        const refTable = col.references.table
        if (!tableNames.has(refTable) && !EXTERNAL_TABLES.has(refTable)) {
          errors.push(
            `Table "${table.name}" column "${col.name}" references non-existent table "${refTable}"`,
          )
        }
      }
    }
  }

  // Check for circular dependencies via topological sort attempt
  if (errors.length === 0) {
    const cycle = detectCycle(contract.tables)
    if (cycle) {
      errors.push(`Circular FK dependency detected: ${cycle.join(' → ')}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Detect circular FK dependencies. Returns cycle path or null.
 */
function detectCycle(tables: TableDef[]): string[] | null {
  const adj = new Map<string, string[]>()
  for (const t of tables) {
    adj.set(t.name, [])
  }
  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && adj.has(col.references.table)) {
        const neighbors = adj.get(t.name)
        if (neighbors) {
          neighbors.push(col.references.table)
        }
      }
    }
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2
  const color = new Map<string, number>()
  for (const name of adj.keys()) color.set(name, WHITE)

  const path: string[] = []

  function dfs(node: string): boolean {
    color.set(node, GRAY)
    path.push(node)
    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        path.push(neighbor)
        return true // cycle found
      }
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true
    }
    path.pop()
    color.set(node, BLACK)
    return false
  }

  for (const name of adj.keys()) {
    if (color.get(name) === WHITE && dfs(name)) return path
  }
  return null
}
