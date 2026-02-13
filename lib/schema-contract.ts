// lib/schema-contract.ts

// SQL column types supported by Supabase/Postgres
export type SQLType =
  | 'uuid'
  | 'text'
  | 'numeric'
  | 'boolean'
  | 'timestamptz'
  | 'jsonb'
  | 'integer'
  | 'bigint';

export interface ColumnDef {
  name: string;
  type: SQLType;
  nullable?: boolean;
  default?: string;
  primaryKey?: boolean;
  unique?: boolean;
  references?: { table: string; column: string };
}

export interface RLSPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using?: string;
  withCheck?: string;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  rlsPolicies?: RLSPolicy[];
}

export interface EnumDef {
  name: string;
  values: string[];
}

export interface SeedRow {
  table: string;
  rows: Record<string, unknown>[];
}

export interface SchemaContract {
  tables: TableDef[];
  enums?: EnumDef[];
  seedData?: SeedRow[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// External tables that are always available (Supabase auth)
const EXTERNAL_TABLES = new Set(['auth.users']);

/**
 * Validate a SchemaContract for correctness:
 * - No duplicate column names within a table
 * - All FK references point to existing tables or external tables
 * - No circular FK dependencies
 */
export function validateContract(contract: SchemaContract): ValidationResult {
  const errors: string[] = [];
  const tableNames = new Set(contract.tables.map(t => t.name));

  for (const table of contract.tables) {
    // Check duplicate columns
    const colNames = new Set<string>();
    for (const col of table.columns) {
      if (colNames.has(col.name)) {
        errors.push(`Table "${table.name}" has duplicate column "${col.name}"`);
      }
      colNames.add(col.name);
    }

    // Check FK references exist
    for (const col of table.columns) {
      if (col.references) {
        const refTable = col.references.table;
        if (!tableNames.has(refTable) && !EXTERNAL_TABLES.has(refTable)) {
          errors.push(`Table "${table.name}" column "${col.name}" references non-existent table "${refTable}"`);
        }
      }
    }
  }

  // Check for circular dependencies via topological sort attempt
  if (errors.length === 0) {
    const cycle = detectCycle(contract.tables);
    if (cycle) {
      errors.push(`Circular FK dependency detected: ${cycle.join(' → ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Detect circular FK dependencies. Returns cycle path or null.
 */
function detectCycle(tables: TableDef[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const t of tables) {
    adj.set(t.name, []);
  }
  for (const t of tables) {
    for (const col of t.columns) {
      if (col.references && adj.has(col.references.table)) {
        adj.get(t.name)!.push(col.references.table);
      }
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const name of adj.keys()) color.set(name, WHITE);

  const path: string[] = [];

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    path.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        path.push(neighbor);
        return true; // cycle found
      }
      if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
    }
    path.pop();
    color.set(node, BLACK);
    return false;
  }

  for (const name of adj.keys()) {
    if (color.get(name) === WHITE && dfs(name)) return path;
  }
  return null;
}
