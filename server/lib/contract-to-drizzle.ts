// lib/contract-to-drizzle.ts

import type { SchemaContract, TableDef, ColumnDef, SQLType } from './schema-contract'

/**
 * Convert snake_case to camelCase.
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Topologically sort tables by FK dependencies (parent tables before children).
 * External tables (auth.users) are excluded from the graph.
 */
function topologicalSort(tables: TableDef[]): TableDef[] {
  const tableMap = new Map(tables.map((t) => [t.name, t]))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  // Initialize
  for (const table of tables) {
    inDegree.set(table.name, 0)
    adj.set(table.name, [])
  }

  // Build adjacency list
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.references && tableMap.has(col.references.table)) {
        // Edge: references.table → table.name
        const deps = adj.get(col.references.table)
        if (deps) {
          deps.push(table.name)
        }
        inDegree.set(table.name, (inDegree.get(table.name) ?? 0) + 1)
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = []
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name)
  }

  const sorted: TableDef[] = []
  while (queue.length > 0) {
    const name = queue.shift()!
    sorted.push(tableMap.get(name)!)

    for (const neighbor of adj.get(name) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  return sorted
}

/**
 * Determine which column types are used in the schema.
 */
function getUsedColumnTypes(contract: SchemaContract): Set<SQLType> {
  const used = new Set<SQLType>()
  for (const table of contract.tables) {
    for (const col of table.columns) {
      used.add(col.type)
    }
  }
  return used
}

/**
 * Generate Drizzle import statement based on used types.
 */
function generateImports(contract: SchemaContract): string {
  const usedTypes = getUsedColumnTypes(contract)
  const imports: string[] = []

  // Map SQL types to Drizzle column types
  const typeMap: Record<SQLType, string> = {
    uuid: 'uuid',
    text: 'text',
    numeric: 'numeric',
    boolean: 'boolean',
    timestamptz: 'timestamp',
    jsonb: 'jsonb',
    integer: 'integer',
    bigint: 'bigint',
  }

  for (const sqlType of usedTypes) {
    const drizzleType = typeMap[sqlType]
    if (drizzleType && !imports.includes(drizzleType)) {
      imports.push(drizzleType)
    }
  }

  // Always include pgTable
  imports.push('pgTable')

  // Add pgEnum if enums exist
  if (contract.enums && contract.enums.length > 0) {
    imports.push('pgEnum')
  }

  return `import { ${imports.join(', ')} } from 'drizzle-orm/pg-core'`
}

/**
 * Generate a Drizzle column definition.
 */
function generateColumn(col: ColumnDef, tableName: string, tableMap: Map<string, TableDef>): string {
  const propName = toCamelCase(col.name)
  const colName = col.name

  let def = ''

  switch (col.type) {
    case 'uuid':
      def = `uuid('${colName}')`
      break
    case 'text':
      def = `text('${colName}')`
      break
    case 'numeric':
      def = `numeric('${colName}')`
      break
    case 'boolean':
      def = `boolean('${colName}')`
      break
    case 'timestamptz':
      def = `timestamp('${colName}', { withTimezone: true })`
      break
    case 'jsonb':
      def = `jsonb('${colName}')`
      break
    case 'integer':
      def = `integer('${colName}')`
      break
    case 'bigint':
      def = `bigint('${colName}', { mode: 'number' })`
      break
  }

  // Apply modifiers in correct order:
  // 1. primaryKey
  // 2. unique
  // 3. notNull
  // 4. default
  // 5. references

  if (col.primaryKey) {
    def += '.primaryKey()'
  }

  if (col.unique) {
    def += '.unique()'
  }

  // Only add .notNull() if nullable is explicitly false
  if (col.nullable === false) {
    def += '.notNull()'
  }

  // Apply default values
  if (col.default) {
    if (col.default === 'gen_random_uuid()') {
      def += '.defaultRandom()'
    } else if (col.default === 'now()') {
      def += '.defaultNow()'
    } else if (col.type === 'boolean') {
      def += `.default(${col.default})`
    } else if (col.type === 'integer' || col.type === 'bigint') {
      def += `.default(${col.default})`
    }
  }

  // Apply FK references (skip external tables like auth.users)
  if (col.references && tableMap.has(col.references.table)) {
    const refTable = toCamelCase(col.references.table)
    const refCol = toCamelCase(col.references.column)
    def += `.references(() => ${refTable}.${refCol})`
  }

  return `${propName}: ${def},`
}

/**
 * Generate a pgTable definition.
 */
function generateTable(table: TableDef, tableMap: Map<string, TableDef>): string {
  const tableName = toCamelCase(table.name)
  const lines: string[] = []

  lines.push(`export const ${tableName} = pgTable('${table.name}', {`)

  for (const col of table.columns) {
    lines.push(`  ${generateColumn(col, table.name, tableMap)}`)
  }

  lines.push('})')

  return lines.join('\n')
}

/**
 * Generate pgEnum definitions.
 */
function generateEnums(contract: SchemaContract): string {
  if (!contract.enums || contract.enums.length === 0) {
    return ''
  }

  const lines: string[] = []
  for (const enumDef of contract.enums) {
    const enumName = `${toCamelCase(enumDef.name)}Enum`
    const values = enumDef.values.map((v) => `'${v}'`).join(', ')
    lines.push(`export const ${enumName} = pgEnum('${enumDef.name}', [${values}])`)
  }

  return lines.join('\n') + '\n'
}

/**
 * Generate a complete Drizzle schema file from a SchemaContract.
 */
export function contractToDrizzle(contract: SchemaContract): string {
  const lines: string[] = []

  // Header
  lines.push('// Auto-generated by VibeStack')
  lines.push('')

  // Imports
  lines.push(generateImports(contract))
  lines.push('')

  // Enums
  if (contract.enums && contract.enums.length > 0) {
    lines.push(generateEnums(contract))
  }

  // Tables (topologically sorted)
  const sortedTables = topologicalSort(contract.tables)
  const tableMap = new Map(contract.tables.map((t) => [t.name, t]))

  for (const table of sortedTables) {
    lines.push(generateTable(table, tableMap))
    lines.push('')
  }

  return lines.join('\n')
}
