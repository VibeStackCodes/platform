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
  // All generated tables use UUID `id` as their primary key. LLMs sometimes reference
  // non-PK columns (e.g. `name`, `code`, `title`) which lack unique constraints and cause:
  //   ERROR: 42830: there is no unique constraint matching given keys for referenced table
  // Force FK column to `id` unless it was already `id` or was renamed from a reserved word
  // (`_val` suffix indicates a reserved-word rename, which we preserve as-is).
  if (column !== 'id' && !column.endsWith('_val')) {
    console.warn(`[FKReference] Non-PK FK column "${column}" on "${table}" → normalized to "id"`)
    column = 'id'
  }
  return { table, column }
}

// Known PostgreSQL schemas. When dot-notation contains these as the first segment,
// the full string is a schema-qualified table name (e.g. "auth.users"), NOT a
// "table.column" pair — treat the full string as the table, default column to "id".
const KNOWN_SCHEMAS = new Set(['auth', 'public', 'extensions', 'storage', 'vault', 'graphql_public'])

// FK reference schema — accepts both object `{ table, column }` and string "table.column"
const FKReferenceSchema = z
  .preprocess((val) => {
    if (typeof val === 'string') {
      // Parse "table.column" or "table(column)" format.
      // Special case: schema-qualified names like "auth.users" use dot as schema separator,
      // not table.column separator — detect via KNOWN_SCHEMAS and treat full string as table.
      const dotMatch = val.match(/^([^.(]+)\.([^.(]+)$/)
      if (dotMatch) {
        const [, first, second] = dotMatch
        if (KNOWN_SCHEMAS.has(first.toLowerCase())) {
          // Schema-qualified name: e.g. "auth.users" → { table: 'auth.users', column: 'id' }
          return applyFKRenames({ table: `${first}.${second}`, column: 'id' })
        }
        return applyFKRenames({ table: first, column: second })
      }
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
    z.preprocess(
      (val) => {
        if (typeof val !== 'string') return val
        // Bail out early if the value contains SQL-dangerous characters (quotes, semicolons, comments)
        // so the regex below still rejects them for security.
        if (/['";]|--/.test(val)) return val
        return val
          .trim()
          .toLowerCase()
          .replace(/\+/g, '_plus')        // "200+" → "200_plus"
          .replace(/[^a-zA-Z0-9_-]/g, '_') // spaces/slashes/dots → "_"
          .replace(/_+/g, '_')             // collapse consecutive underscores
          .replace(/^_|_$/g, '')           // strip leading/trailing underscores
          || 'value'                       // fallback for empty string after normalization
      },
      z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid enum value: must be alphanumeric with underscores/hyphens'),
    )
  ).describe('Enum values'),
})

/**
 * Infer the referenced table from an `_id` suffix column stem.
 * Used by SchemaContractSchema.transform() to normalize implicit FK references.
 *
 * Matching strategy (in order):
 * 1. Exact match of stem or plural variants (simple + es + y→ies)
 * 2. Substring match (e.g. 'categories' found within 'menu_categories')
 * 3. Reserved-word rename match (e.g. 'table' → 'table_record')
 *
 * Exported for use in tests.
 */
export function inferRefTableFromStem(stem: string, tableNames: string[]): string | undefined {
  const variants: string[] = [
    stem,
    stem + 's',
    stem + 'es',
    stem.endsWith('y') ? stem.slice(0, -1) + 'ies' : '',
  ].filter(Boolean)

  // 1. Exact match
  for (const v of variants) {
    const match = tableNames.find((t) => t === v)
    if (match) return match
  }

  // 2. Substring match (e.g. 'categories' in 'menu_categories')
  for (const v of variants) {
    const match = tableNames.find((t) => t.includes(v))
    if (match) return match
  }

  // 3. Reserved-word rename (table → table_record, order → order_record)
  const recordMatch = tableNames.find(
    (t) => t.endsWith('_record') && t.replace(/_record$/, '') === stem,
  )
  if (recordMatch) return recordMatch

  return undefined
}

export const SchemaContractSchema = z.object({
  tables: z.array(TableDefSchema).default([]).describe('Database tables'),
  enums: z.preprocess(
    (val) => (val === null ? undefined : val),
    z.array(EnumDefSchema).optional(),
  ).describe('PostgreSQL enum types'),
}).transform((contract) => {
  // Two normalizations applied at parse time so all downstream code gets a clean contract:
  //
  // 1. id uuid → PRIMARY KEY: The analyst sometimes omits `primaryKey: true` on the `id`
  //    column (common when generating many tables at once). Without PRIMARY KEY, any
  //    REFERENCES to that table fail with PostgreSQL 42830 "no unique constraint".
  //
  // 2. Implicit FK references: The analyst sometimes omits `references` on FK columns
  //    (e.g. `category_id` without `references: { table: 'menu_categories', column: 'id' }`).
  //    We infer them from column naming conventions (_id suffix → stem → table name match).
  const tableNames = contract.tables.map((t) => t.name)
  return {
    ...contract,
    tables: contract.tables.map((table) => ({
      ...table,
      columns: table.columns.map((col) => {
        // Normalization 1: auto-set PRIMARY KEY + default on id uuid columns.
        // Every generated table uses `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` by
        // convention. If the analyst forgets primaryKey: true, the SQL generator emits
        // a column with no unique constraint — breaking any REFERENCES to this table.
        let normalized = col
        if (col.name === 'id' && col.type === 'uuid' && !col.primaryKey) {
          normalized = {
            ...col,
            primaryKey: true,
            default: col.default ?? 'gen_random_uuid()',
          }
        }

        // Normalization 2: infer missing FK references from _id suffix columns.
        if (normalized.references) {
          // Drop explicit self-referential FKs — LLMs sometimes wire junction table
          // columns back to the same table (e.g. recipe_category_links.category_id
          // referencing recipe_category_links). These cause circular FK cycles.
          if (normalized.references.table === table.name) {
            return { ...normalized, references: undefined }
          }
          return normalized
        }
        if (!normalized.name.endsWith('_id')) return normalized
        const stem = normalized.name.slice(0, -3)
        const refTable = inferRefTableFromStem(stem, tableNames)
        if (!refTable) return normalized
        // Never infer self-referential FKs — these must be explicit in the contract
        // (e.g. tree structures). The substring match in inferRefTableFromStem can
        // false-positive on junction tables, e.g. `category_id` in `recipe_category_links`
        // matches `recipe_category_links` because it contains the word "category".
        if (refTable === table.name) return normalized
        return { ...normalized, references: { table: refTable, column: 'id' } }
      }),
    })),
  }
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
 * A junction table is a pure many-to-many bridge with no meaningful own columns.
 * Detection: all non-auto-managed, non-PK columns reference other tables (are FKs).
 * Must have at least 2 FK columns to qualify as a junction.
 *
 * Handles both explicit FK references AND implicit FKs (column ends in `_id`
 * with a stem matching a known table name) — the analyst LLM sometimes omits
 * explicit `references` fields on junction table FK columns.
 */
function isJunctionTable(table: TableDef, allTables: TableDef[]): boolean {
  const autoManaged = new Set(['id', 'created_at', 'updated_at', 'user_id', 'order', 'position', 'sort_order'])
  const tableNames = new Set(allTables.map((t) => t.name))
  const nonAutoNonPk = table.columns.filter((c) => !c.primaryKey && !autoManaged.has(c.name))
  // Need at least 2 columns to be a junction table
  if (nonAutoNonPk.length < 2) return false
  // All such columns must be FKs (explicit or implicit via `_id` naming)
  return nonAutoNonPk.every((c) => {
    if (c.references) return true
    if (c.name.endsWith('_id')) {
      const stem = c.name.slice(0, -3) // 'article' from 'article_id'
      return tableNames.has(stem) || tableNames.has(stem + 's') || tableNames.has(stem + 'es')
    }
    return false
  })
}

/**
 * Infer app features from the schema contract.
 * - auth: true if any table has a user_id column referencing auth.users
 * - entities: list of all non-junction table names
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
    entities: contract.tables.filter((t) => !isJunctionTable(t, contract.tables)).map((t) => t.name),
  }
}
