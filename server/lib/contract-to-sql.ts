// lib/contract-to-sql.ts
import type { SchemaContract, TableDef } from './schema-contract'
import { SQL_IDENTIFIER } from './schema-contract'
import { contractToSQLFunctions } from './contract-to-sql-functions'

const SQL_TYPE_MAP: Record<string, string> = {
  uuid: 'UUID',
  text: 'TEXT',
  numeric: 'NUMERIC',
  boolean: 'BOOLEAN',
  timestamptz: 'TIMESTAMPTZ',
  jsonb: 'JSONB',
  integer: 'INTEGER',
  bigint: 'BIGINT',
}

/**
 * Generate deterministic Postgres SQL from a SchemaContract.
 * Tables are topologically sorted by FK dependencies — correct by construction.
 */
export function contractToSQL(contract: SchemaContract): string {
  // Validate all identifiers before generating SQL
  for (const table of contract.tables) {
    if (!SQL_IDENTIFIER.test(table.name)) {
      throw new Error(`Invalid table name: ${table.name}`)
    }
    for (const col of table.columns) {
      if (!SQL_IDENTIFIER.test(col.name)) {
        throw new Error(`Invalid column name: ${table.name}.${col.name}`)
      }
    }
  }
  for (const e of contract.enums ?? []) {
    if (!SQL_IDENTIFIER.test(e.name)) {
      throw new Error(`Invalid enum name: ${e.name}`)
    }
  }

  const parts: string[] = []

  // 1. Enums (escape single quotes in values)
  for (const e of contract.enums ?? []) {
    parts.push(`CREATE TYPE ${e.name} AS ENUM (${e.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')});`)
  }

  // 2. updated_at trigger function (emitted once, before tables)
  const hasUpdatedAt = contract.tables.some((t) => t.columns.some((c) => c.name === 'updated_at'))
  if (hasUpdatedAt) {
    parts.push(
      `CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;`,
    )
  }

  // 3. Tables in topological order
  const sorted = topologicalSort(contract.tables)
  for (const table of sorted) {
    parts.push(generateCreateTable(table))

    // RLS
    if (table.rlsPolicies && table.rlsPolicies.length > 0) {
      parts.push(`ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`)
      for (const policy of table.rlsPolicies) {
        parts.push(generatePolicy(table.name, policy))
      }
    }

    // FK indexes
    for (const col of table.columns) {
      if (col.references?.table && col.references?.column) {
        parts.push(`CREATE INDEX idx_${table.name}_${col.name} ON ${table.name} (${col.name});`)
      }
    }

    // updated_at trigger
    if (table.columns.some((c) => c.name === 'updated_at')) {
      parts.push(
        `CREATE TRIGGER trg_${table.name}_updated_at BEFORE UPDATE ON ${table.name} FOR EACH ROW EXECUTE FUNCTION update_updated_at();`,
      )
    }
  }

  // 4. Stats functions for tables with aggregatable columns
  const functions = contractToSQLFunctions(contract)
  for (const fn of functions) {
    parts.push('')
    parts.push(`-- Stats function for ${fn.tableName}`)
    parts.push(fn.sql)
  }

  return parts.join('\n\n')
}

function generateCreateTable(table: TableDef): string {
  const colDefs = table.columns.map((col) => {
    const sqlType = SQL_TYPE_MAP[col.type] ?? col.type.toUpperCase()
    const parts: string[] = [`  ${col.name} ${sqlType}`]

    if (col.nullable === false && !col.primaryKey) parts.push('NOT NULL')
    if (col.default) parts.push(`DEFAULT ${col.default}`)
    if (col.primaryKey) parts.push('PRIMARY KEY')
    if (col.unique) parts.push('UNIQUE')
    if (col.references?.table && col.references?.column) {
      parts.push(`REFERENCES ${col.references.table}(${col.references.column}) ON DELETE CASCADE`)
    }

    return parts.join(' ')
  })

  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n${colDefs.join(',\n')}\n);`
}

/**
 * Wrap bare auth.uid() calls in a subselect for per-statement caching.
 * `auth.uid()` → `(select auth.uid())` — Postgres caches the subselect result
 * across all rows in a single statement, avoiding per-row function evaluation.
 */
function cacheAuthCalls(expr: string): string {
  return expr.replace(/(?<!\(select\s)auth\.uid\(\)/g, '(select auth.uid())')
}

function generatePolicy(
  tableName: string,
  policy: { name: string; operation: string; using?: string; withCheck?: string },
): string {
  let sql = `CREATE POLICY "${policy.name}" ON ${tableName} FOR ${policy.operation} TO authenticated`
  if (policy.using) sql += ` USING (${cacheAuthCalls(policy.using)})`
  if (policy.withCheck) sql += ` WITH CHECK (${cacheAuthCalls(policy.withCheck)})`
  return sql + ';'
}

/**
 * Topological sort tables by FK dependencies.
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
        // t depends on col.references.table → edge from ref → t
        const neighbors = adj.get(col.references.table)
        if (neighbors) {
          neighbors.push(t.name)
        }
        inDegree.set(t.name, (inDegree.get(t.name) ?? 0) + 1)
      }
    }
  }

  // Kahn's algorithm
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
