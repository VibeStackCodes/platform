// lib/contract-to-sql-functions.ts
// Generates PostgreSQL stat functions from a SchemaContract.
// For each table that contains aggregatable columns, emits a
// `get_{table}_stats()` function using SECURITY DEFINER + SET search_path.

import type { SchemaContract } from './schema-contract'
import { classifyColumn } from './column-classifier'

export interface SQLFunction {
  name: string        // e.g., "get_orders_stats"
  tableName: string
  sql: string         // Complete CREATE OR REPLACE FUNCTION DDL
}

/**
 * Build stats SQL functions for tables that have aggregatable columns.
 * Uses SECURITY DEFINER + SET search_path = '' + explicit public. prefix for security.
 */
export function contractToSQLFunctions(contract: SchemaContract): SQLFunction[] {
  const functions: SQLFunction[] = []

  for (const table of contract.tables) {
    // Classify every column to detect aggregatable ones
    const aggregatableCols = table.columns
      .map((col) => ({
        col,
        classification: classifyColumn({
          name: col.name,
          type: col.type,
          references: col.references ?? undefined,
        }),
      }))
      .filter(({ classification }) => classification.isAggregatable)

    // Skip tables without any aggregatable columns
    if (aggregatableCols.length === 0) {
      continue
    }

    // Build RETURNS TABLE columns
    const returnCols: string[] = ['total_count bigint']
    // Build SELECT expressions
    const selectExprs: string[] = ['count(*)::bigint']

    for (const { col, classification } of aggregatableCols) {
      const fn = classification.aggregationFn

      // For currency/quantity columns, include both avg and sum when aggregationFn is 'sum'
      // For score columns, aggregationFn is 'avg' — only include avg
      if (fn === 'sum') {
        returnCols.push(`avg_${col.name} numeric`)
        returnCols.push(`sum_${col.name} numeric`)
        selectExprs.push(`avg(${col.name})::numeric`)
        selectExprs.push(`sum(${col.name})::numeric`)
      } else if (fn === 'avg') {
        returnCols.push(`avg_${col.name} numeric`)
        selectExprs.push(`avg(${col.name})::numeric`)
      } else if (fn === 'count') {
        returnCols.push(`count_${col.name} bigint`)
        selectExprs.push(`count(${col.name})::bigint`)
      } else if (fn === 'min') {
        returnCols.push(`min_${col.name} numeric`)
        selectExprs.push(`min(${col.name})::numeric`)
      } else if (fn === 'max') {
        returnCols.push(`max_${col.name} numeric`)
        selectExprs.push(`max(${col.name})::numeric`)
      }
    }

    const functionName = `get_${table.name}_stats`
    const returnTableDef = returnCols.join(', ')
    const selectClause = selectExprs.join(',\n    ')

    const sql = `CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS TABLE(${returnTableDef})
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ${selectClause}
  FROM public.${table.name};
$$;`

    functions.push({
      name: functionName,
      tableName: table.name,
      sql,
    })
  }

  return functions
}
