// lib/schema-contract.ts

import { z } from 'zod'

// ============================================================================
// SQL identifier validation
// ============================================================================

// PostgreSQL identifier validation: lowercase snake_case
export const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/

// PostgreSQL reserved words (must be quoted or avoided)
export const SQL_RESERVED_WORDS = new Set([
  'user', 'order', 'select', 'insert', 'update', 'delete', 'table', 'column',
  'index', 'constraint', 'primary', 'foreign', 'references', 'group', 'having',
  'where', 'from', 'join', 'left', 'right', 'inner', 'outer', 'on', 'as',
  'and', 'or', 'not', 'null', 'true', 'false', 'default', 'check', 'unique',
  'public', 'grant', 'revoke', 'create', 'drop', 'alter', 'trigger', 'function',
  'procedure', 'view', 'schema', 'database', 'role', 'type', 'cast', 'case',
  'when', 'then', 'else', 'end', 'between', 'like', 'in', 'exists', 'all', 'any',
  'limit', 'offset', 'fetch', 'union', 'intersect', 'except', 'distinct', 'into',
  'values', 'set', 'begin', 'commit', 'rollback', 'abort',
])

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

// Common LLM-generated type aliases → canonical SQL types
// LLMs frequently emit "decimal", "int", "date", etc. which aren't in our allowed set.
// z.preprocess() runs before the enum check, normalizing these before validation.
const SQL_TYPE_ALIASES: Record<string, string> = {
  decimal: 'numeric',
  float: 'numeric',
  double: 'numeric',
  number: 'numeric',
  money: 'numeric',
  real: 'numeric',
  int: 'integer',
  int2: 'integer',
  int4: 'integer',
  smallint: 'integer',
  serial: 'integer',
  int8: 'bigint',
  bigserial: 'bigint',
  varchar: 'text',
  string: 'text',
  char: 'text',
  character: 'text',
  time: 'text',
  date: 'timestamptz',
  timestamp: 'timestamptz',
  datetime: 'timestamptz',
  bool: 'boolean',
  json: 'jsonb',
}

// Explicit sets to avoid false-positive substring matches (e.g. "appointment" contains "int")
const BIGINT_TYPES = new Set(['bigint', 'int8', 'bigserial', 'int64'])
const INTEGER_TYPES = new Set([
  'int', 'integer', 'int2', 'int4', 'smallint', 'mediumint', 'tinyint',
  'serial', 'serial4', 'unsigned int', 'unsigned integer',
])

export const SQLTypeSchema = z.preprocess((val) => {
  if (typeof val !== 'string') return val
  const lower = val.toLowerCase().trim()

  // 1. Exact alias match
  if (SQL_TYPE_ALIASES[lower]) return SQL_TYPE_ALIASES[lower]

  // 2. Already a valid canonical type
  if ((SQL_TYPES as readonly string[]).includes(lower)) return lower

  // 3. Explicit set lookups — avoids false positives from substring matching
  if (BIGINT_TYPES.has(lower)) return 'bigint'
  if (INTEGER_TYPES.has(lower)) return 'integer'

  // 4. Prefix/substring patterns for compound types (safe after set checks above)
  if (lower.includes('timestamp') || lower.includes('datetime')) return 'timestamptz'
  if (lower.startsWith('date')) return 'timestamptz' // "date", "date without time zone"
  if (lower.startsWith('time')) return 'text' // "time", "time without time zone", "timetz"
  if (lower.includes('decimal') || lower.includes('float') || lower.includes('double') ||
      lower.includes('money') || lower.includes('real') || lower.startsWith('numeric')) return 'numeric'
  if (lower.includes('char') || lower.includes('string') || lower.includes('text') ||
      lower === 'enum' || lower === 'array' || lower === 'interval') return 'text'
  if (lower.includes('bool')) return 'boolean'
  if (lower.includes('json')) return 'jsonb'
  if (lower.includes('uuid')) return 'uuid'

  // 5. Unknown type — safest fallback is text (stores anything as a string)
  console.warn(`[SQLTypeSchema] Unknown type "${val}" → coerced to "text"`)
  return 'text'
}, z.enum(SQL_TYPES))

/**
 * Apply the same reserved-word renaming rules as TableDefSchema/ColumnDefSchema to FK refs.
 * The analyst may generate `references: { table: 'order', column: 'id' }` while the
 * TableDefSchema renames the actual table to 'order_record'. This keeps them in sync.
 */
function applyFKRenames(ref: { table?: unknown; column?: unknown }): { table: string; column: string } {
  let table = typeof ref.table === 'string' ? ref.table.trim() : String(ref.table ?? '')
  let column = typeof ref.column === 'string' ? ref.column.trim() : String(ref.column ?? 'id')
  if (SQL_RESERVED_WORDS.has(table)) table = `${table}_record`
  if (SQL_RESERVED_WORDS.has(column)) column = `${column}_val`
  return { table, column }
}

// FK reference schema — accepts both object `{ table, column }` and string "table.column"
const FKReferenceSchema = z
  .preprocess((val) => {
    if (typeof val === 'string') {
      // Parse "table.column" or "table(column)" format
      const dotMatch = val.match(/^([^.(]+)\.([^.(]+)$/)
      if (dotMatch) return applyFKRenames({ table: dotMatch[1], column: dotMatch[2] })
      const parenMatch = val.match(/^([^(]+)\(([^)]+)\)$/)
      if (parenMatch) return applyFKRenames({ table: parenMatch[1], column: parenMatch[2] })
      // Assume it's a table name referencing "id"
      return applyFKRenames({ table: val, column: 'id' })
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return applyFKRenames(val as { table?: unknown; column?: unknown })
    }
    return val
  }, z.object({
    table: z.string().describe('Referenced table name'),
    column: z.string().describe('Referenced column name'),
  }))
  .describe('Foreign key reference')

// LLMs emit `null` for absent optional fields — Zod .optional() only accepts undefined
const nullish = (val: unknown) => (val === null ? undefined : val)

export const ColumnDefSchema = z.object({
  name: z.preprocess(
    // Auto-rename reserved words: LLMs reliably emit natural domain words like
    // `type`, `order`, `role` that conflict with PostgreSQL keywords.
    // Appending `_val` is deterministic; downstream code reads from the contract.
    (val) => {
      if (typeof val === 'string' && SQL_RESERVED_WORDS.has(val)) return `${val}_val`
      return val
    },
    z.string()
      .max(63, 'Identifier exceeds PostgreSQL 63-character limit')
      .regex(SQL_IDENTIFIER, 'Invalid column name: must be lowercase snake_case')
      .describe('Column name (snake_case)'),
  ),
  type: SQLTypeSchema.describe('PostgreSQL data type'),
  nullable: z.preprocess(nullish, z.boolean().optional()).describe('Whether column is nullable'),
  // Accept any primitive, coerce to string (LLMs emit numbers/booleans for defaults).
  // Strip type casts to custom/unknown types (e.g. "'scheduled'::appointment_status" →
  // "'scheduled'") — these custom PostgreSQL types don't exist in generated schemas.
  default: z.preprocess(
    (val) => {
      if (val == null) return undefined
      let str = String(val).trim()
      // Strip '::custom_type' casts where the type is not in our canonical set
      const VALID_TYPES = 'uuid|text|numeric|boolean|timestamptz|jsonb|integer|bigint'
      str = str.replace(new RegExp(`::(?!(${VALID_TYPES})(?:\\W|$))[a-z_][a-z0-9_]*`, 'gi'), '')
      str = str.trim()
      // Drop bare identifiers that look like type names (no quotes, parens, or digits)
      // e.g. "appointment_status" alone as a default makes no SQL sense
      if (str && /^[a-z_][a-z0-9_]*$/i.test(str) &&
          !/^(true|false|null|now|current_timestamp|current_date|current_time|gen_random_uuid)$/i.test(str)) {
        console.warn(`[ColumnDefSchema] Bare-identifier default "${val}" → dropped`)
        return undefined
      }
      return str || undefined
    },
    z.string().optional(),
  ).describe('SQL default expression'),
  primaryKey: z.preprocess(nullish, z.boolean().optional()).describe('Whether column is primary key'),
  unique: z.preprocess(nullish, z.boolean().optional()).describe('Whether column has unique constraint'),
  // LLMs emit null, empty objects, or empty strings for absent FK refs — normalize to undefined
  references: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '') return undefined
      if (typeof val === 'object' && !Array.isArray(val) && !(val as { table?: string }).table)
        return undefined
      return val
    },
    FKReferenceSchema.optional(),
  ),
})

export const RLSPolicySchema = z.object({
  name: z.string()
    .max(63, 'Policy name exceeds PostgreSQL 63-character limit')
    .describe('Policy name (can contain spaces, always quoted in SQL)'),
  operation: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']).describe('SQL operation'),
  using: z.preprocess(nullish, z.string().optional()).describe('USING expression for row filtering'),
  withCheck: z.preprocess(nullish, z.string().optional()).describe('WITH CHECK expression for mutations'),
})

export const TableDefSchema = z.object({
  name: z.preprocess(
    (val) => {
      if (typeof val === 'string' && SQL_RESERVED_WORDS.has(val)) return `${val}_record`
      return val
    },
    z.string()
      .max(63, 'Identifier exceeds PostgreSQL 63-character limit')
      .regex(SQL_IDENTIFIER, 'Invalid table name: must be lowercase snake_case')
      .describe('Table name (snake_case, singular)'),
  ),
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
}).transform((table) => {
  // After ColumnDefSchema renames reserved words (e.g. `role` → `role_val`), RLS policy
  // strings remain unchanged. Rebuild them using the column rename map so policies stay
  // consistent with the actual column names in the generated SQL.
  const colRenames = new Map<string, string>()
  for (const col of table.columns) {
    if (col.name.endsWith('_val')) {
      const original = col.name.slice(0, -4) // strip '_val'
      if (SQL_RESERVED_WORDS.has(original)) colRenames.set(original, col.name)
    }
  }
  if (colRenames.size === 0 || !table.rlsPolicies?.length) return table

  const updatedPolicies = table.rlsPolicies.map((policy) => {
    let using = policy.using
    let withCheck = policy.withCheck
    for (const [original, renamed] of colRenames) {
      // Word-boundary replacement: replace bare column references, not SQL keywords
      const re = new RegExp(`\\b${original}\\b`, 'g')
      if (using) using = using.replace(re, renamed)
      if (withCheck) withCheck = withCheck.replace(re, renamed)
    }
    return { ...policy, using, withCheck }
  })
  return { ...table, rlsPolicies: updatedPolicies }
})

export const EnumDefSchema = z.object({
  name: z.string()
    .max(63, 'Identifier exceeds PostgreSQL 63-character limit')
    .regex(SQL_IDENTIFIER, 'Invalid enum name: must be lowercase snake_case')
    .refine((name) => !SQL_RESERVED_WORDS.has(name), {
      message: 'Enum name is a PostgreSQL reserved word',
    })
    .describe('Enum type name'),
  values: z.array(
    z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid enum value: must be alphanumeric with underscores/hyphens')
  ).describe('Enum values'),
})

export const SchemaContractSchema = z.object({
  tables: z.array(TableDefSchema).describe('Database tables'),
  enums: z.preprocess(
    (val) => (val === null ? undefined : val),
    z.array(EnumDefSchema).optional(),
  ).describe('PostgreSQL enum types'),
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

    // Check FK references exist (skip empty/invalid references)
    for (const col of table.columns) {
      if (col.references?.table && col.references?.column) {
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

// ============================================================================
// Feature inference — detect app capabilities from schema structure
// ============================================================================

export interface InferredFeatures {
  auth: boolean
  entities: string[]
}

/**
 * Infer app features from the schema contract.
 * - auth: true if any table has a user_id column referencing auth.users
 * - entities: list of all table names
 */
export function inferFeatures(contract: SchemaContract): InferredFeatures {
  const hasAuth = contract.tables.some((table) =>
    table.columns.some(
      (col) =>
        col.references?.table === 'auth.users' &&
        col.name.endsWith('user_id'),
    ),
  )

  return {
    auth: hasAuth,
    entities: contract.tables.map((t) => t.name),
  }
}
