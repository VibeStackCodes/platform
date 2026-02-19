// lib/contract-to-seed.ts
// LLM-based seed data generation for generated app databases.
// Tables are topologically sorted so parents are inserted before children.
// The LLM generates contextually rich, domain-appropriate values; the structural
// logic (PKs, FKs, auth seeding) is fully deterministic.
// Idempotent via ON CONFLICT DO NOTHING — safe to re-run.

import { generateObject } from 'ai'
import { z } from 'zod'
import type { ColumnDef, SchemaContract, TableDef } from './schema-contract'
import { createHeliconeProvider, PIPELINE_MODELS } from './agents/provider'

// Fixed UUID for seed data — clearly distinguishable as synthetic
// Uses '5ee' (valid hex that reads as "see") to avoid invalid UUID parse errors
const SEED_USER_ID = '00000000-0000-4000-a000-0000000005ee'
const SEED_USER_EMAIL = 'seed@vibestack.test'

// Columns that are always structural — never passed to the LLM for content generation
const STRUCTURAL_COLUMNS = new Set(['created_at', 'updated_at', 'user_id', 'id'])

// Column types that are considered "semantic content" even when they have a .default
// (e.g. status = 'active', type = 'standard' — we want the LLM to vary these across rows)
const SEMANTIC_CONTENT_COLUMN_PATTERNS = /^(status|type_val|stage|state|category|priority|level|kind)$/

type Row = Record<string, unknown>

// ============================================================================
// LLM seed value generation
// ============================================================================

const outputSchema = z.object({
  tables: z.array(
    z.object({
      name: z.string(),
      rows: z.array(z.object({}).catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    }),
  ),
})

/**
 * Identify content columns for a table: columns that are NOT structural, NOT FK refs,
 * and NOT auto-managed defaults (unless they are semantic content columns).
 */
function getContentColumns(table: TableDef): ColumnDef[] {
  return table.columns.filter((col) => {
    if (col.primaryKey) return false
    if (col.references) return false
    if (STRUCTURAL_COLUMNS.has(col.name)) return false
    // Implicit auth FK columns — skip
    if (
      col.type === 'uuid' &&
      col.nullable === false &&
      /^(user_id|owner_id|created_by|author_id|member_id|assigned_to)$/.test(col.name)
    ) return false
    // Skip columns with defaults UNLESS they are semantic content columns (status, type, etc.)
    if (col.default && !SEMANTIC_CONTENT_COLUMN_PATTERNS.test(col.name)) return false
    return true
  })
}

/**
 * Build a human-readable schema description for the LLM prompt.
 */
function buildSchemaDescription(contract: SchemaContract): string {
  const enumMap = new Map<string, string[]>()
  for (const e of contract.enums ?? []) {
    enumMap.set(e.name, e.values)
  }

  return contract.tables
    .map((table) => {
      const contentCols = getContentColumns(table)
      if (contentCols.length === 0) return null

      const colDescriptions = contentCols.map((col) => {
        // Check if this column is likely backed by an enum from its name
        const possibleEnumName = col.name.replace(/_val$/, '')
        const enumValues =
          enumMap.get(possibleEnumName) ??
          enumMap.get(`${table.name}_${possibleEnumName}`) ??
          null

        let desc = `  - ${col.name} (${col.type})`
        if (enumValues) desc += ` [enumValues: ${enumValues.join(', ')}]`
        return desc
      })

      return `Table: ${table.name}\n${colDescriptions.join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Call the LLM to generate contextually rich seed values for all content columns.
 * Returns a Map<tableName, Row[]> — each row contains ONLY content column values.
 * On error: logs and returns an empty Map (caller falls back to simple defaults).
 */
async function llmGenerateSeedValues(
  contract: SchemaContract,
  rowsPerTable: number,
): Promise<Map<string, Row[]>> {
  const schemaDescription = buildSchemaDescription(contract)

  // If there are no content columns across any table, skip the LLM call entirely
  if (!schemaDescription.trim()) {
    return new Map()
  }

  const openai = createHeliconeProvider({ userId: 'seed', agentName: 'seed' })

  const prompt = `You are generating realistic seed data for a web application database.

App schema:
${schemaDescription}

Generate exactly ${rowsPerTable} rows per table with contextually appropriate, realistic values.

Rules:
- Use table/column names to infer the domain (e.g., "watches" → watch brand names like "Rolex Submariner")
- Text values must be realistic and domain-specific — NO Latin lorem ipsum
- For columns ending in _url, _image, _photo, _avatar, _cover, _thumbnail: use "https://picsum.photos/seed/{descriptive-topic}/800/600" (e.g., "https://picsum.photos/seed/rolex-submariner/800/600")
- For enum columns (enumValues listed): only use those exact enum values, vary them across rows
- For boolean columns: use true/false appropriately for the domain
- For numeric columns: realistic values (price_cents in cents like 125000, rating 1-5, etc.)
- For slug columns: url-safe lowercase version of the name field
- For status/stage columns: vary values across rows to show diversity
- Make data tell a coherent story (e.g., a CRM might have leads → qualified → closed)
- Each table's rows should have different, plausible values — no repeats`

  try {
    const result = await generateObject({
      model: openai(PIPELINE_MODELS.seed),
      schema: outputSchema,
      prompt,
    })

    // Build a case-insensitive + plural-insensitive lookup map
    const map = new Map<string, Row[]>()
    for (const tableData of result.object.tables) {
      // Store under both the exact name and normalized variants
      const rows = tableData.rows as Row[]
      map.set(tableData.name, rows)
      map.set(tableData.name.toLowerCase(), rows)
      // Handle plural/singular variants: "Collection" → "collections", "watches" → "watch"
      const lower = tableData.name.toLowerCase()
      if (!lower.endsWith('s')) map.set(lower + 's', rows)
      if (lower.endsWith('s')) map.set(lower.slice(0, -1), rows)
      if (lower.endsWith('ies')) map.set(lower.slice(0, -3) + 'y', rows)
    }
    return map
  } catch (err) {
    console.error('[seed] LLM seed generation failed:', err)
    return new Map()
  }
}

// ============================================================================
// SQL value formatting helpers
// ============================================================================

/**
 * Format an LLM-provided value as a SQL literal.
 * Returns null if the value is not usable.
 */
function formatLLMValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${escapeSQL(value)}'`
  return null
}

/**
 * Fallback value for a column when the LLM did not provide one.
 * Uses column name + table name + row index to generate varied, contextual values.
 */
function fallbackValue(col: ColumnDef, tableName: string, rowIdx: number): string | null {
  switch (col.type) {
    case 'text': {
      // Use column name to generate contextual fallback text
      const singular = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName
      const colName = col.name.replace(/_/g, ' ')
      if (/name|title|label/.test(col.name)) return `'${escapeSQL(singular)} ${rowIdx + 1}'`
      if (/description|bio|summary|body|content/.test(col.name)) return `'A ${escapeSQL(colName)} for ${escapeSQL(singular)} ${rowIdx + 1}.'`
      if (/slug/.test(col.name)) return `'${escapeSQL(singular.replace(/\s+/g, '-'))}-${rowIdx + 1}'`
      if (/email/.test(col.name)) return `'user${rowIdx + 1}@example.com'`
      if (/url|link|website/.test(col.name)) return `'https://example.com/${escapeSQL(singular)}/${rowIdx + 1}'`
      if (/image|photo|avatar|thumbnail|cover/.test(col.name)) return `'https://picsum.photos/seed/${escapeSQL(singular)}-${rowIdx + 1}/800/600'`
      if (/phone/.test(col.name)) return `'+1-555-010${rowIdx}'`
      if (/address/.test(col.name)) return `'${100 + rowIdx} Main Street'`
      return `'${escapeSQL(singular)} ${escapeSQL(colName)} ${rowIdx + 1}'`
    }
    case 'integer':
    case 'bigint':
      return String(rowIdx + 1)
    case 'numeric':
      return `${(rowIdx + 1) * 10}.00`
    case 'boolean':
      return rowIdx % 2 === 0 ? 'true' : 'false'
    case 'timestamptz':
      return `now() - interval '${30 - rowIdx} days'`
    case 'jsonb':
      return `'{}'::jsonb`
    case 'uuid':
      return 'gen_random_uuid()'
    default:
      return null
  }
}

// ============================================================================
// Auth seed helpers
// ============================================================================

/**
 * Check if any table has FK references to auth.users (directly or via a profile table).
 */
function needsAuthSeed(contract: SchemaContract): boolean {
  return contract.tables.some((t) =>
    t.columns.some(
      (c) =>
        c.references?.table === 'auth.users' ||
        // Implicit auth FK — no references field but column name implies auth.users
        (c.type === 'uuid' &&
          c.nullable === false &&
          /^(user_id|owner_id|created_by|author_id|member_id|assigned_to)$/.test(c.name)),
    ),
  )
}

/**
 * Generate auth.users + auth.identities seed preamble.
 * Required so that FK references to auth.users(id) don't violate constraints.
 */
function generateAuthSeed(): string[] {
  return [
    '-- Seed auth.users so FK references work',
    `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token)`,
    `VALUES ('${SEED_USER_ID}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${SEED_USER_EMAIL}', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '')`,
    `ON CONFLICT (id) DO NOTHING;`,
    '',
    `INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)`,
    `VALUES (gen_random_uuid(), '${SEED_USER_ID}', '${SEED_USER_ID}', 'email', jsonb_build_object('sub', '${SEED_USER_ID}', 'email', '${SEED_USER_EMAIL}'), now(), now(), now())`,
    `ON CONFLICT (provider, provider_id) DO NOTHING;`,
    '',
  ]
}

// ============================================================================
// Main export
// ============================================================================

export async function contractToSeedSQL(contract: SchemaContract, rowsPerTable: number = 5): Promise<string> {
  const sorted = topologicalSort(contract.tables)
  const tableIds = new Map<string, string[]>()
  const lines: string[] = []

  lines.push('-- Auto-generated seed data from SchemaContract')

  // If any table references auth.users, seed a test user first
  if (needsAuthSeed(contract)) {
    lines.push(...generateAuthSeed())
  }

  // Fetch LLM-generated content values for all tables in one shot
  const llmRows = await llmGenerateSeedValues(contract, rowsPerTable)

  for (let tableIdx = 0; tableIdx < sorted.length; tableIdx++) {
    const table = sorted[tableIdx]

    // Profile tables: PK is the user's auth.users id — insert ONE row with SEED_USER_ID
    // so downstream FK references (e.g. appointments.patient_id → profiles.id) work.
    const pkCol = table.columns.find((c) => c.primaryKey)
    if (pkCol?.references?.table === 'auth.users') {
      tableIds.set(table.name, [SEED_USER_ID])

      const profileCols: string[] = [pkCol.name]
      const profileVals: string[] = [`'${SEED_USER_ID}'`]
      const tableContentCols = getContentColumns(table)
      const llmTableRows = llmRows.get(table.name) ?? []
      const llmRow = llmTableRows[0] ?? {}

      for (const col of table.columns) {
        if (col.primaryKey) continue
        if (col.default && !col.references) continue
        if (col.references?.table === 'auth.users') {
          profileCols.push(col.name)
          profileVals.push(`'${SEED_USER_ID}'`)
          continue
        }
        // FK to another table — resolve parent IDs
        if (col.references) {
          const parentIds = tableIds.get(col.references.table)
          if (parentIds && parentIds.length > 0) {
            profileCols.push(col.name)
            profileVals.push(`'${parentIds[0]}'`)
          }
          continue
        }
        // Implicit auth FK
        if (
          col.type === 'uuid' &&
          col.nullable === false &&
          /^(user_id|owner_id|created_by|author_id|member_id|assigned_to)$/.test(col.name)
        ) {
          profileCols.push(col.name)
          profileVals.push(`'${SEED_USER_ID}'`)
          continue
        }

        if (col.nullable === false || col.type === 'text') {
          const isContentCol = tableContentCols.some((c) => c.name === col.name)
          let val: string | null = null

          if (isContentCol) {
            val = formatLLMValue(llmRow[col.name]) ?? fallbackValue(col, table.name, 0)
          } else {
            val = fallbackValue(col, table.name, 0)
          }

          if (val !== null) {
            profileCols.push(col.name)
            profileVals.push(val)
          }
        }
      }

      lines.push(
        `INSERT INTO "${table.name}" (${profileCols.join(', ')}) VALUES (${profileVals.join(', ')}) ON CONFLICT DO NOTHING;`,
      )
      continue
    }

    const ids: string[] = []
    const tableContentCols = getContentColumns(table)
    const llmTableRows = llmRows.get(table.name) ?? []

    for (let row = 0; row < rowsPerTable; row++) {
      const id = makeId(tableIdx, row)
      ids.push(id)

      const cols: string[] = []
      const vals: string[] = []
      // Existence guards for FK-dependent inserts: if a parent row wasn't actually
      // inserted (e.g. due to LLM data type mismatch), skip rather than violate FK.
      const fkExistsConds: string[] = []

      const llmRow = llmTableRows[row] ?? {}

      for (const col of table.columns) {
        // PK with default — insert explicit ID so FKs can reference it
        if (col.primaryKey && col.type === 'uuid') {
          cols.push(col.name)
          vals.push(`'${id}'`)
          continue
        }

        // Non-PK columns with defaults — let DB handle them (unless content col)
        if (col.default && !col.references && !SEMANTIC_CONTENT_COLUMN_PATTERNS.test(col.name)) continue

        // FK columns
        if (col.references) {
          if (col.references.table === 'auth.users') {
            cols.push(col.name)
            vals.push(`'${SEED_USER_ID}'`)
          } else {
            const parentIds = tableIds.get(col.references.table)
            if (parentIds && parentIds.length > 0) {
              const parentId = parentIds[row % parentIds.length]
              cols.push(col.name)
              vals.push(`'${parentId}'`)
              // Guard: skip this row if the parent row wasn't actually inserted
              fkExistsConds.push(
                `EXISTS (SELECT 1 FROM "${col.references.table}" WHERE "${col.references.column}" = '${parentId}')`,
              )
            }
            // If parent table has no IDs (shouldn't happen with topo sort), skip
          }
          continue
        }

        // Implicit auth FK: user_id / owner_id / created_by / author_id columns that
        // are uuid + NOT NULL but lack an explicit `references` in the contract
        // (LLM sometimes omits the FK reference). Use SEED_USER_ID so the value is
        // a known auth.users row that RLS policies can match against.
        if (
          col.type === 'uuid' &&
          col.nullable === false &&
          /^(user_id|owner_id|created_by|author_id|member_id|assigned_to)$/.test(col.name)
        ) {
          cols.push(col.name)
          vals.push(`'${SEED_USER_ID}'`)
          continue
        }

        // Regular content/non-nullable columns
        if (col.nullable !== false && col.type !== 'text') {
          // Skip nullable non-text columns to keep seed minimal
          continue
        }

        const isContentCol = tableContentCols.some((c) => c.name === col.name)

        let value: string | null = null
        if (isContentCol) {
          const llmValue = formatLLMValue(llmRow[col.name])
          if (llmValue !== null) {
            value = llmValue
          } else if (!col.default) {
            // No LLM value and no DB default — must provide a value
            value = fallbackValue(col, table.name, row)
          }
          // else: has a DB default, LLM gave nothing → let DB use the default
        } else {
          value = fallbackValue(col, table.name, row)
        }

        if (value !== null) {
          cols.push(col.name)
          vals.push(value)
        }
      }

      if (cols.length > 0) {
        if (fkExistsConds.length > 0) {
          // SELECT form: row is silently skipped if any parent wasn't inserted
          lines.push(
            `INSERT INTO "${table.name}" (${cols.join(', ')}) SELECT ${vals.join(', ')} WHERE ${fkExistsConds.join(' AND ')} ON CONFLICT DO NOTHING;`,
          )
        } else {
          // No inter-table FKs — plain VALUES form
          lines.push(
            `INSERT INTO "${table.name}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`,
          )
        }
      }
    }

    tableIds.set(table.name, ids)
  }

  return lines.join('\n')
}

// ============================================================================
// Utilities (kept unchanged from original)
// ============================================================================

/**
 * Generate a deterministic UUID for seed rows.
 * Format: 00000000-0000-4000-8ttt-rrrrrrrrrrrr
 *   ttt  = table index (hex, 3 digits)
 *   rrrr = row index (hex, 12 digits)
 * Variant/version bits set for valid UUID v4.
 */
function makeId(tableIdx: number, rowIdx: number): string {
  const t = tableIdx.toString(16).padStart(3, '0')
  const r = (rowIdx + 1).toString(16).padStart(12, '0')
  return `00000000-0000-4000-8${t}-${r}`
}

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * Topological sort tables by FK dependencies (parents first).
 * External tables (auth.users) are excluded from the graph.
 */
function topologicalSort(tables: TableDef[]): TableDef[] {
  const tableMap = new Map(tables.map((t) => [t.name, t]))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const t of tables) {
    inDegree.set(t.name, 0)
    adj.set(t.name, [])
  }

  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && tableMap.has(col.references.table)) {
        const neighbors = adj.get(col.references.table)
        if (neighbors) {
          neighbors.push(t.name)
        }
        inDegree.set(t.name, (inDegree.get(t.name) ?? 0) + 1)
      }
    }
  }

  const queue = tables.filter((t) => inDegree.get(t.name) === 0).map((t) => t.name)
  const result: TableDef[] = []

  while (queue.length > 0) {
    const name = queue.shift()
    if (!name) continue
    const table = tableMap.get(name)
    if (table) {
      result.push(table)
    }
    for (const neighbor of adj.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  return result
}
