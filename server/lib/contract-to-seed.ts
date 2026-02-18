// lib/contract-to-seed.ts
// Domain-aware seed data generation using @faker-js/faker.
// Tables are topologically sorted so parents are inserted before children.
// Faker is deterministically seeded per-value so the same contract always
// produces identical SQL — safe to rerun (ON CONFLICT DO NOTHING).

import { faker } from '@faker-js/faker'
import type { ColumnDef, SchemaContract, TableDef } from './schema-contract'

// Fixed UUID for seed data — clearly distinguishable as synthetic
// Uses '5eed' (valid hex that reads as "seed") to avoid invalid UUID parse errors
const SEED_USER_ID = '00000000-0000-4000-a000-0000000005ee'
const SEED_USER_EMAIL = 'seed@vibestack.test'

/**
 * FNV-1a hash — fast, well-distributed, deterministic.
 * Used to convert a string key into a numeric faker seed.
 */
function stableHash(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash
}

type TableDomain = 'food' | 'medical' | 'commerce' | 'professional' | 'content' | 'travel' | 'fitness' | 'generic'

/**
 * Detect the semantic domain of a table from its name.
 * Drives contextual faker method selection for `name`/`title` columns.
 */
function detectTableDomain(tableName: string): TableDomain {
  const n = tableName.toLowerCase()
  if (/menu|food|dish|recipe|ingredient|restaurant|meal|cuisine|drink|beverage/.test(n)) return 'food'
  if (/patient|doctor|physician|clinic|appointment|medical|health|prescription|diagnosis/.test(n)) return 'medical'
  if (/product|order|cart|invoice|customer|shop|store|catalog|item|purchase|payment/.test(n)) return 'commerce'
  if (/employee|staff|department|job|salary|project|task|client|company|contract|member/.test(n)) return 'professional'
  if (/post|article|blog|comment|tag|author|content|story|entry|journal|book/.test(n)) return 'content'
  if (/destination|trip|travel|journey|booking|hotel|flight|itinerary|route/.test(n)) return 'travel'
  if (/workout|exercise|fitness|training|gym|class|schedule|session/.test(n)) return 'fitness'
  return 'generic'
}

/**
 * Select a domain-appropriate fake entity name.
 * Caller must seed faker before calling this.
 */
function inferNameByDomain(domain: TableDomain, tableName: string): string {
  const n = tableName.toLowerCase()

  switch (domain) {
    case 'food':
      if (n.includes('ingredient')) return faker.food.ingredient()
      if (n.includes('category') || n.includes('categorie')) return faker.food.ethnicCategory()
      return faker.food.dish()

    case 'medical':
      // Most medical tables with a "name" are about people
      if (n.includes('department') || n.includes('specialty')) return faker.commerce.department()
      return faker.person.fullName()

    case 'commerce':
      if (n.includes('category') || n.includes('department')) return faker.commerce.department()
      if (n.includes('brand') || n.includes('company') || n.includes('vendor') || n.includes('supplier')) return faker.company.name()
      return faker.commerce.productName()

    case 'professional':
      if (n.includes('company') || n.includes('client') || n.includes('vendor') || n.includes('organization')) return faker.company.name()
      if (n.includes('department') || n.includes('team') || n.includes('division')) return faker.commerce.department()
      if (n.includes('project') || n.includes('task')) return faker.lorem.words(3)
      return faker.person.fullName()

    case 'content':
      if (n.includes('tag') || n.includes('label') || n.includes('category')) return faker.word.noun()
      if (n.includes('book')) return faker.lorem.words(3)
      return faker.lorem.words(3)

    case 'travel':
      if (n.includes('destination') || n.includes('city') || n.includes('location')) return faker.location.city()
      if (n.includes('hotel') || n.includes('accommodation') || n.includes('property')) return `${faker.location.city()} ${faker.helpers.arrayElement(['Hotel', 'Resort', 'Inn', 'Lodge'])}`
      return faker.location.country()

    case 'fitness':
      return faker.helpers.arrayElement(['Yoga Flow', 'HIIT Cardio', 'Power Lifting', 'Pilates Core', 'Spin Class', 'Aqua Aerobics', 'Boxing Basics', 'Zumba Dance', 'Stretch & Tone', 'CrossFit'])

    default:
      return faker.lorem.words(2)
  }
}

/**
 * Infer a domain-aware text value from column name + table context.
 * Seeds faker with stableHash(key) before each call for determinism.
 */
function inferTextValue(colName: string, tableName: string, key: string): string {
  faker.seed(stableHash(key))

  const name = colName.toLowerCase()
  const domain = detectTableDomain(tableName)

  if (name.includes('email')) return faker.internet.email()
  if (name.includes('phone')) return faker.phone.number()
  if (name.endsWith('_url') || name === 'url' || name.includes('link') || name.includes('website'))
    return faker.internet.url()
  if (name.includes('avatar') || name.includes('image') || name.includes('photo'))
    return faker.image.url()

  if (name === 'name' || name === 'full_name') return inferNameByDomain(domain, tableName)

  if (name === 'first_name') return faker.person.firstName()
  if (name === 'last_name') return faker.person.lastName()

  if (name.endsWith('_name') || name.startsWith('name_')) return inferNameByDomain(domain, tableName)

  if (name.includes('title')) {
    if (domain === 'content') return faker.lorem.words(4)
    if (domain === 'commerce') return faker.commerce.productName()
    if (domain === 'food') return faker.food.dish()
    if (domain === 'travel') return faker.location.city()
    return faker.lorem.words(3)
  }

  if (name.includes('description') || name.includes('content') || name.includes('body') || name.includes('summary'))
    return faker.lorem.paragraph()

  if (name.includes('note') || name.includes('comment') || name.includes('remark'))
    return faker.lorem.sentence()

  if (name === 'bio' || name === 'about') return faker.lorem.sentences(2)

  if (name.includes('status')) {
    if (domain === 'medical') return faker.helpers.arrayElement(['scheduled', 'completed', 'cancelled', 'no-show', 'pending'])
    if (domain === 'commerce') return faker.helpers.arrayElement(['active', 'pending', 'shipped', 'delivered', 'cancelled'])
    return faker.helpers.arrayElement(['active', 'pending', 'completed', 'inactive', 'draft'])
  }

  if (name.includes('type')) {
    if (domain === 'medical') return faker.helpers.arrayElement(['routine', 'urgent', 'follow-up', 'emergency', 'consultation'])
    if (domain === 'food') return faker.helpers.arrayElement(['appetizer', 'main', 'dessert', 'beverage', 'side'])
    if (domain === 'professional') return faker.helpers.arrayElement(['full-time', 'part-time', 'contract', 'intern', 'freelance'])
    return faker.helpers.arrayElement(['standard', 'premium', 'basic', 'enterprise', 'custom'])
  }

  if (name.includes('category')) {
    if (domain === 'food') return faker.food.ethnicCategory()
    if (domain === 'commerce') return faker.commerce.department()
    if (domain === 'content') return faker.word.noun()
    return faker.lorem.word()
  }

  if (name.includes('role')) return faker.helpers.arrayElement(['admin', 'member', 'viewer', 'editor', 'owner'])
  if (name.includes('gender')) return faker.helpers.arrayElement(['male', 'female', 'non-binary', 'prefer not to say'])
  if (name.includes('language')) return faker.helpers.arrayElement(['English', 'Spanish', 'French', 'German', 'Portuguese'])

  if (name.includes('address') || name.includes('street')) return faker.location.streetAddress()
  if (name === 'city') return faker.location.city()
  if (name === 'state' || name.includes('province')) return faker.location.state()
  if (name === 'country') return faker.location.country()
  if (name.includes('zip') || name.includes('postal')) return faker.location.zipCode()

  if (name.includes('company') || name.includes('organization')) return faker.company.name()
  if (name.includes('tag') || name.includes('label')) return faker.word.noun()
  if (name.includes('slug')) return faker.lorem.words(2).replace(/\s+/g, '-').toLowerCase()
  if (name.includes('color') || name.includes('colour')) return faker.color.human()
  if (name.includes('currency')) return faker.finance.currencyCode()
  if (name.includes('isbn') || name.includes('barcode')) return faker.commerce.isbn()
  if (name.includes('sku') || name.includes('code')) return faker.string.alphanumeric(8).toUpperCase()

  // Generic fallback
  return faker.lorem.words(2)
}

/**
 * Generate a column value based on type and name heuristics.
 * Seeds faker deterministically so the same contract always produces the same SQL.
 */
function generateValue(col: ColumnDef, rowIdx: number, tableName: string, enforceUnique = false): string | null {
  const n = rowIdx + 1
  const key = `${tableName}.${col.name}.${n}`

  switch (col.type) {
    case 'text': {
      let textVal = inferTextValue(col.name.toLowerCase(), tableName, key)
      // For unique columns, suffix the row index to guarantee no collisions
      if (enforceUnique) textVal = `${textVal}-${n}`
      return `'${escapeSQL(textVal)}'`
    }

    case 'integer':
    case 'bigint':
      if (enforceUnique) return String(n * 1000 + n)
      faker.seed(stableHash(key))
      return String(faker.number.int({ min: 1, max: 1000 }))

    case 'numeric':
      if (enforceUnique) return (n * 100.0).toFixed(2)
      faker.seed(stableHash(key))
      return faker.number.float({ min: 0.01, max: 9999.99, fractionDigits: 2 }).toFixed(2)

    case 'boolean':
      faker.seed(stableHash(key))
      return faker.datatype.boolean() ? 'true' : 'false'

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
