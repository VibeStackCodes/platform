// lib/contract-to-seed.ts
import type { ColumnDef, SchemaContract, SQLType, TableDef } from './schema-contract'

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

        const value = generateValue(col, row)
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
function generateValue(col: ColumnDef, rowIdx: number): string | null {
  const n = rowIdx + 1
  const name = col.name.toLowerCase()

  switch (col.type) {
    case 'text':
      return `'${escapeSQL(inferTextValue(name, n))}'`

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
 * Infer a realistic text value from the column name.
 */
function inferTextValue(name: string, n: number): string {
  if (name.includes('email')) return `user${n}@example.com`
  if (name.includes('phone')) return `+1555000${n.toString().padStart(4, '0')}`
  if (name.includes('url') || name.includes('link') || name.includes('website'))
    return `https://example.com/${n}`
  if (name.includes('avatar') || name.includes('image') || name.includes('photo'))
    return `https://api.dicebear.com/7.x/initials/svg?seed=User${n}`
  if (name === 'name' || name.includes('_name') || name.includes('title'))
    return `Sample ${name.replace(/_/g, ' ')} ${n}`
  if (
    name.includes('description') ||
    name.includes('content') ||
    name.includes('body') ||
    name.includes('note')
  )
    return `This is sample ${name.replace(/_/g, ' ')} for row ${n}.`
  if (name.includes('status')) return ['active', 'pending', 'completed', 'inactive', 'draft'][n % 5]
  if (name.includes('type') || name.includes('category') || name.includes('role'))
    return `type_${n}`
  if (name.includes('address')) return `${n * 100} Main Street`
  if (name.includes('city'))
    return ['New York', 'San Francisco', 'Chicago', 'Austin', 'Seattle'][n % 5]
  if (name.includes('color')) return ['red', 'blue', 'green', 'purple', 'orange'][n % 5]

  // Generic fallback
  return `Sample ${n}`
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
        adj.get(col.references.table)!.push(t.name)
        inDegree.set(t.name, (inDegree.get(t.name) ?? 0) + 1)
      }
    }
  }

  const queue = tables.filter((t) => inDegree.get(t.name) === 0).map((t) => t.name)
  const result: TableDef[] = []

  while (queue.length > 0) {
    const name = queue.shift()!
    result.push(tableMap.get(name)!)
    for (const neighbor of adj.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  return result
}
