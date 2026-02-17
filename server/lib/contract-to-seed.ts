// lib/contract-to-seed.ts
import { faker } from '@faker-js/faker'
import type { ColumnDef, SchemaContract, TableDef } from './schema-contract'

/**
 * Generate deterministic INSERT SQL from a SchemaContract.
 *
 * Tables are topologically sorted so parent rows exist before FK references.
 * Columns with defaults (id, created_at, updated_at) use DEFAULT.
 * FK columns referencing auth.users use a fixed seed user UUID.
 * FK columns referencing other tables reuse previously-generated row IDs.
 */

// Fixed UUID for seed data — clearly distinguishable as synthetic
const SEED_USER_ID = '00000000-seed-0000-0000-000000000001'

export function contractToSeedSQL(contract: SchemaContract, rowsPerTable: number = 5): string {
  const sorted = topologicalSort(contract.tables)
  const tableIds = new Map<string, string[]>()
  const lines: string[] = []

  lines.push('-- Auto-generated seed data from SchemaContract')

  for (let tableIdx = 0; tableIdx < sorted.length; tableIdx++) {
    const table = sorted[tableIdx]
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

        const value = generateValue(col, row, tableIdx)
        if (value !== null) {
          cols.push(col.name)
          vals.push(value)
        }
      }

      if (cols.length > 0) {
        lines.push(`INSERT INTO ${table.name} (${cols.join(', ')}) VALUES (${vals.join(', ')});`)
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
 */
function generateValue(col: ColumnDef, rowIdx: number, tableIdx: number): string | null {
  const n = rowIdx + 1
  const name = col.name.toLowerCase()

  switch (col.type) {
    case 'text':
      return `'${escapeSQL(inferTextValue(name, n, tableIdx))}'`

    case 'integer':
    case 'bigint':
      return String(n * 10)

    case 'numeric':
      return `${(n * 10.5).toFixed(2)}`

    case 'boolean':
      return n % 2 === 1 ? 'true' : 'false'

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
 * Infer a realistic text value from the column name using FakerJS.
 * Deterministic: faker.seed() is set from tableIdx + rowIdx.
 */
function inferTextValue(name: string, n: number, tableIdx: number): string {
  faker.seed(tableIdx * 10000 + n)

  if (name.includes('email')) return faker.internet.email()
  if (name.includes('phone')) return faker.phone.number()
  if (name.endsWith('_url') || name === 'url' || name.includes('link') || name.includes('website'))
    return faker.internet.url()
  if (name.includes('avatar') || name.includes('image') || name.includes('photo'))
    return faker.image.avatar()
  if (name === 'name' || name === 'full_name') return faker.person.fullName()
  if (name === 'first_name') return faker.person.firstName()
  if (name === 'last_name') return faker.person.lastName()
  if (name.includes('_name') || name.includes('title')) return faker.lorem.words(3)
  if (
    name.includes('description') ||
    name.includes('content') ||
    name.includes('body')
  )
    return faker.lorem.paragraph(1)
  if (name.includes('note') || name.includes('comment')) return faker.lorem.sentence()
  if (name.includes('status'))
    return faker.helpers.arrayElement(['active', 'pending', 'completed', 'inactive', 'draft'])
  if (name.includes('type') || name.includes('category') || name.includes('role'))
    return faker.helpers.arrayElement(['standard', 'premium', 'basic', 'enterprise', 'custom'])
  if (name.includes('address') || name.includes('street')) return faker.location.streetAddress()
  if (name.includes('city')) return faker.location.city()
  if (name.includes('state') || name.includes('province')) return faker.location.state()
  if (name.includes('country')) return faker.location.country()
  if (name.includes('zip') || name.includes('postal')) return faker.location.zipCode()
  if (name.includes('color')) return faker.color.human()
  if (name.includes('company') || name.includes('organization')) return faker.company.name()
  if (name.includes('tag') || name.includes('label')) return faker.word.noun()
  if (name.includes('slug')) return faker.helpers.slugify(faker.lorem.words(2))

  // Generic fallback
  return faker.lorem.words(2)
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
