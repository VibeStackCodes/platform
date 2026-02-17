import { describe, expect, it } from 'vitest'
import { contractToSQLFunctions } from '@server/lib/contract-to-sql-functions'
import { contractToSQL } from '@server/lib/contract-to-sql'
import type { SchemaContract } from '@server/lib/schema-contract'

// ============================================================================
// Fixtures
// ============================================================================

const ordersContract: SchemaContract = {
  tables: [
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'customer_name', type: 'text', nullable: false },
        { name: 'total_amount', type: 'numeric', nullable: false },
        { name: 'item_count', type: 'integer', nullable: false },
        { name: 'status', type: 'text', nullable: false, default: "'pending'" },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

const productsContract: SchemaContract = {
  tables: [
    {
      name: 'products',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'price', type: 'numeric', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'rating', type: 'numeric', nullable: true },
        { name: 'stock_count', type: 'integer', nullable: false },
      ],
    },
  ],
}

const usersContract: SchemaContract = {
  tables: [
    {
      name: 'profiles',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'full_name', type: 'text', nullable: true },
        { name: 'email', type: 'text', nullable: false },
        { name: 'bio', type: 'text', nullable: true },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

const multiTableContract: SchemaContract = {
  tables: [
    {
      name: 'invoices',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'amount', type: 'numeric', nullable: false },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
    {
      name: 'tags',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
      ],
    },
    {
      name: 'line_items',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'quantity', type: 'integer', nullable: false },
        { name: 'unit_price', type: 'numeric', nullable: false },
      ],
    },
  ],
}

// ============================================================================
// Tables with aggregatable columns produce SQL functions
// ============================================================================

describe('contractToSQLFunctions — aggregatable tables', () => {
  it('generates a function for a table with a currency column', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns.length).toBeGreaterThanOrEqual(1)
    const fn = fns.find((f) => f.tableName === 'orders')
    expect(fn).toBeDefined()
    expect(fn!.name).toBe('get_orders_stats')
  })

  it('generates function for products table with price and rating', () => {
    const fns = contractToSQLFunctions(productsContract)
    const fn = fns.find((f) => f.tableName === 'products')
    expect(fn).toBeDefined()
    expect(fn!.name).toBe('get_products_stats')
  })

  it('returns multiple functions for a multi-table contract', () => {
    const fns = contractToSQLFunctions(multiTableContract)
    // invoices (amount=currency) and line_items (quantity+unit_price) should get functions
    const tableNames = fns.map((f) => f.tableName)
    expect(tableNames).toContain('invoices')
    expect(tableNames).toContain('line_items')
  })
})

// ============================================================================
// Tables without aggregatable columns produce no functions
// ============================================================================

describe('contractToSQLFunctions — non-aggregatable tables', () => {
  it('produces no functions for a text-only table', () => {
    const fns = contractToSQLFunctions(usersContract)
    expect(fns).toHaveLength(0)
  })

  it('skips the tags table (no numeric columns)', () => {
    const fns = contractToSQLFunctions(multiTableContract)
    const tagsFn = fns.find((f) => f.tableName === 'tags')
    expect(tagsFn).toBeUndefined()
  })

  it('returns empty array for empty contract', () => {
    const empty: SchemaContract = { tables: [] }
    expect(contractToSQLFunctions(empty)).toHaveLength(0)
  })
})

// ============================================================================
// SQL syntax correctness
// ============================================================================

describe('contractToSQLFunctions — SQL syntax', () => {
  it('uses CREATE OR REPLACE FUNCTION', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('CREATE OR REPLACE FUNCTION')
  })

  it('includes RETURNS TABLE clause', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('RETURNS TABLE')
  })

  it('includes total_count bigint in RETURNS TABLE', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('total_count bigint')
  })

  it('includes count(*) in SELECT', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('count(*)::bigint')
  })

  it('includes avg and sum for currency columns', () => {
    const fns = contractToSQLFunctions(ordersContract)
    const fn = fns.find((f) => f.tableName === 'orders')!
    // total_amount is currency → both avg and sum
    expect(fn.sql).toContain('avg(total_amount)::numeric')
    expect(fn.sql).toContain('sum(total_amount)::numeric')
    expect(fn.sql).toContain('avg_total_amount numeric')
    expect(fn.sql).toContain('sum_total_amount numeric')
  })

  it('includes only avg for score/rating columns', () => {
    const fns = contractToSQLFunctions(productsContract)
    const fn = fns.find((f) => f.tableName === 'products')!
    expect(fn.sql).toContain('avg(rating)::numeric')
    expect(fn.sql).toContain('avg_rating numeric')
    // rating should NOT have sum
    expect(fn.sql).not.toContain('sum(rating)')
  })

  it('uses LANGUAGE sql STABLE', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('LANGUAGE sql STABLE')
  })

  it('uses AS $$ ... $$ block', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('AS $$')
    expect(fns[0].sql).toContain('$$;')
  })

  it('uses SELECT ... FROM inside the function body', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('SELECT')
    expect(fns[0].sql).toContain('FROM')
  })
})

// ============================================================================
// Security patterns
// ============================================================================

describe('contractToSQLFunctions — security patterns', () => {
  it('uses SECURITY DEFINER', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('SECURITY DEFINER')
  })

  it('sets search_path to empty string', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain("SET search_path = ''")
  })

  it('uses explicit public. schema prefix in FROM clause', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].sql).toContain('FROM public.orders')
  })

  it('each generated function has security definer and empty search_path', () => {
    const fns = contractToSQLFunctions(multiTableContract)
    for (const fn of fns) {
      expect(fn.sql).toContain('SECURITY DEFINER')
      expect(fn.sql).toContain("SET search_path = ''")
    }
  })

  it('each function references its table with public. prefix', () => {
    const fns = contractToSQLFunctions(multiTableContract)
    for (const fn of fns) {
      expect(fn.sql).toContain(`FROM public.${fn.tableName}`)
    }
  })
})

// ============================================================================
// SQLFunction metadata
// ============================================================================

describe('contractToSQLFunctions — metadata', () => {
  it('SQLFunction has name, tableName, and sql fields', () => {
    const fns = contractToSQLFunctions(ordersContract)
    const fn = fns[0]
    expect(fn).toHaveProperty('name')
    expect(fn).toHaveProperty('tableName')
    expect(fn).toHaveProperty('sql')
    expect(typeof fn.name).toBe('string')
    expect(typeof fn.tableName).toBe('string')
    expect(typeof fn.sql).toBe('string')
  })

  it('function name follows get_{table}_stats convention', () => {
    const fns = contractToSQLFunctions(ordersContract)
    expect(fns[0].name).toBe('get_orders_stats')
    expect(fns[0].name).toMatch(/^get_.+_stats$/)
  })
})

// ============================================================================
// Integration with contractToSQL
// ============================================================================

describe('contractToSQL — stats function integration', () => {
  it('includes stats functions in the full SQL output for aggregatable tables', () => {
    const sql = contractToSQL(ordersContract)
    expect(sql).toContain('-- Stats function for orders')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION get_orders_stats()')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain('FROM public.orders')
  })

  it('does NOT include stats functions for non-aggregatable tables', () => {
    const sql = contractToSQL(usersContract)
    expect(sql).not.toContain('-- Stats function for profiles')
    expect(sql).not.toContain('get_profiles_stats')
  })

  it('stats functions appear after table DDL in output', () => {
    const sql = contractToSQL(ordersContract)
    const tableIdx = sql.indexOf('CREATE TABLE IF NOT EXISTS orders')
    const fnIdx = sql.indexOf('get_orders_stats')
    expect(tableIdx).toBeGreaterThan(-1)
    expect(fnIdx).toBeGreaterThan(tableIdx)
  })

  it('produces valid SQL for a multi-table contract with mixed aggregatability', () => {
    const sql = contractToSQL(multiTableContract)
    // Tables with aggregatable columns get functions
    expect(sql).toContain('get_invoices_stats')
    expect(sql).toContain('get_line_items_stats')
    // Tags table (no aggregatable columns) does not
    expect(sql).not.toContain('get_tags_stats')
  })
})
