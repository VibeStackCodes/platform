// lib/contract-to-seed.ts
// Uses @snaplet/copycat for deterministic seed data generation
// (Supabase-recommended: https://supabase.com/docs/guides/local-development/seeding-your-database)
import { copycat } from '@snaplet/copycat'
import type { ColumnDef, SchemaContract, TableDef } from './schema-contract'

/**
 * Generate deterministic INSERT SQL from a SchemaContract.
 *
 * Tables are topologically sorted so parent rows exist before FK references.
 * Columns with defaults (id, created_at, updated_at) use DEFAULT.
 * FK columns referencing auth.users use a fixed seed user UUID.
 * FK columns referencing other tables reuse previously-generated row IDs.
 *
 * Uses @snaplet/copycat for input-keyed deterministic fake data:
 *   copycat.email(`${table}.${col}.${row}`) — always the same for a given key.
 */

// Fixed UUID for seed data — clearly distinguishable as synthetic
// Uses '5eed' (valid hex that reads as "seed") to avoid invalid UUID parse errors
const SEED_USER_ID = '00000000-0000-4000-a000-0000000005ee'
const SEED_USER_EMAIL = 'seed@vibestack.test'

/**
 * Check if any table has FK references to auth.users (directly or via a profile table).
 */
function needsAuthSeed(contract: SchemaContract): boolean {
  return contract.tables.some((t) =>
    t.columns.some((c) => c.references?.table === 'auth.users'),
  )
}

/**
 * Generate auth.users + auth.identities seed preamble.
 * Required so that FK references to auth.users(id) don't violate constraints.
 * Pattern from: https://supabase.com/docs/guides/local-development/seeding-your-database
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

export function contractToSeedSQL(contract: SchemaContract, rowsPerTable: number = 5): string {
  const sorted = topologicalSort(contract.tables)
  const tableIds = new Map<string, string[]>()
  const lines: string[] = []

  lines.push('-- Auto-generated seed data from SchemaContract')

  // If any table references auth.users, seed a test user first
  if (needsAuthSeed(contract)) {
    lines.push(...generateAuthSeed())
  }

  for (let tableIdx = 0; tableIdx < sorted.length; tableIdx++) {
    const table = sorted[tableIdx]

    // Skip tables whose PK references auth.users — these are user profile tables
    // populated by Supabase Auth triggers, not direct INSERT
    const pkCol = table.columns.find((c) => c.primaryKey)
    if (pkCol?.references?.table === 'auth.users') {
      tableIds.set(table.name, [SEED_USER_ID]) // downstream FKs can still reference this
      continue
    }

    const ids: string[] = []

    for (let row = 0; row < rowsPerTable; row++) {
      const id = makeId(tableIdx, row)
      ids.push(id)

      const cols: string[] = []
      const vals: string[] = []

      for (const col of table.columns) {
        // PK with default — insert explicit ID so FKs can reference it
        if (col.primaryKey && col.type === 'uuid') {
          cols.push(col.name)
          vals.push(`'${id}'`)
          continue
        }

        // Non-PK columns with defaults — let DB handle them
        if (col.default && !col.references) continue

        // FK columns
        if (col.references) {
          if (col.references.table === 'auth.users') {
            cols.push(col.name)
            vals.push(`'${SEED_USER_ID}'`)
          } else {
            const parentIds = tableIds.get(col.references.table)
            if (parentIds && parentIds.length > 0) {
              cols.push(col.name)
              vals.push(`'${parentIds[row % parentIds.length]}'`)
            }
            // If parent table has no IDs (shouldn't happen with topo sort), skip
          }
          continue
        }

        // Regular columns — generate value from type + name
        if (col.nullable !== false && col.type !== 'text') {
          // Skip nullable non-text columns to keep seed minimal
          continue
        }

        const value = generateValue(col, row, table.name, col.unique === true)
        if (value !== null) {
          cols.push(col.name)
          vals.push(value)
        }
      }

      if (cols.length > 0) {
        // ON CONFLICT DO NOTHING makes seed idempotent across re-runs of the pipeline
        lines.push(`INSERT INTO "${table.name}" (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`)
      }
    }

    tableIds.set(table.name, ids)
  }

  return lines.join('\n')
}

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

/**
 * Generate a column value based on type and name heuristics.
 * Uses copycat with `${tableName}.${colName}.${rowIdx}` as deterministic input key.
 * For unique columns, the row index is appended to the generated value to guarantee uniqueness.
 */
function generateValue(col: ColumnDef, rowIdx: number, tableName: string, enforceUnique = false): string | null {
  const n = rowIdx + 1
  const key = `${tableName}.${col.name}.${n}`

  switch (col.type) {
    case 'text': {
      let textVal = inferTextValue(col.name.toLowerCase(), key)
      // For unique columns, suffix the row index to guarantee no collisions
      if (enforceUnique) textVal = `${textVal}-${n}`
      return `'${escapeSQL(textVal)}'`
    }

    case 'integer':
    case 'bigint':
      // For unique integer columns, use the row index directly
      if (enforceUnique) return String(n * 1000 + n)
      return String(copycat.int(key, { min: 1, max: 1000 }))

    case 'numeric':
      if (enforceUnique) return (n * 100.0).toFixed(2)
      return copycat.float(key, { min: 0.01, max: 9999.99 }).toFixed(2)

    case 'boolean':
      return copycat.bool(key) ? 'true' : 'false'

    case 'timestamptz':
      // Spread seed dates across the last 30 days
      return `now() - interval '${30 - n} days'`

    case 'jsonb':
      return `'{}'::jsonb`

    case 'uuid':
      // Non-PK, non-FK uuid — generate a fresh one
      return 'gen_random_uuid()'

    default:
      return null
  }
}

/**
 * Infer a realistic text value from the column name using @snaplet/copycat.
 * Deterministic: copycat uses input-keyed SipHash — same key → same output.
 */
function inferTextValue(name: string, key: string): string {
  if (name.includes('email')) return copycat.email(key)
  if (name.includes('phone')) return copycat.phoneNumber(key)
  if (name.endsWith('_url') || name === 'url' || name.includes('link') || name.includes('website'))
    return copycat.url(key)
  if (name.includes('avatar') || name.includes('image') || name.includes('photo'))
    return copycat.url(key) // copycat has no avatar — use URL
  if (name === 'name' || name === 'full_name') return copycat.fullName(key)
  if (name === 'first_name') return copycat.firstName(key)
  if (name === 'last_name') return copycat.lastName(key)
  if (name.includes('_name') || name.includes('title')) return copycat.words(key)
  if (
    name.includes('description') ||
    name.includes('content') ||
    name.includes('body')
  )
    return copycat.paragraph(key)
  if (name.includes('note') || name.includes('comment')) return copycat.sentence(key)
  if (name.includes('status'))
    return copycat.oneOfString(key, ['active', 'pending', 'completed', 'inactive', 'draft'])
  if (name.includes('type') || name.includes('category') || name.includes('role'))
    return copycat.oneOfString(key, ['standard', 'premium', 'basic', 'enterprise', 'custom'])
  if (name.includes('address') || name.includes('street')) return copycat.streetAddress(key)
  if (name.includes('city')) return copycat.city(key)
  if (name.includes('state') || name.includes('province')) return copycat.state(key)
  if (name.includes('country')) return copycat.country(key)
  if (name.includes('zip') || name.includes('postal')) return copycat.postalAddress(key)
  if (name.includes('company') || name.includes('organization')) return copycat.fullName(key) // company approx
  if (name.includes('tag') || name.includes('label')) return copycat.word(key)
  if (name.includes('slug')) return copycat.words(key).toLowerCase().replace(/\s+/g, '-')

  // Generic fallback
  return copycat.words(key)
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
