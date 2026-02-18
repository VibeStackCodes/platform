// tests/schema-contract.property.test.ts
//
// Property-based tests for SchemaContractSchema.
// These run automatically and discover edge cases without manual enumeration.
//
// Run: bun run test tests/schema-contract.property.test.ts

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  SchemaContractSchema,
  validateContract,
  SQL_RESERVED_WORDS,
  inferRefTableFromStem,
} from '@server/lib/schema-contract'

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** SQL types — includes adversarial LLM aliases that the transform must normalize */
const sqlTypeArb = fc.constantFrom(
  'uuid', 'text', 'integer', 'bigint', 'numeric', 'boolean',
  'timestamptz', 'date', 'jsonb',
  // LLM aliases (must be normalized, not thrown on):
  'decimal', 'int', 'varchar', 'appointment_status', 'order_state',
  'TEXT', 'INTEGER', 'BIGINT',
)

/** Column names — mix of well-known sentinels (4x weight) + random strings (1x weight) */
const colNameArb = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(
    'id', 'user_id', 'title', 'name', 'email', 'price', 'status',
    'created_at', 'updated_at', 'is_active', 'category_id', 'description',
    'score', 'amount', 'avatar_url', 'notes', 'body', 'type', 'kind',
    'owner_id', 'author_id', 'tag_id', 'project_id', 'external_service_id',
  ) },
  // Random names: lowercase alpha + underscores only
  { weight: 1, arbitrary: fc.stringMatching(/^[a-z][a-z_]{0,29}$/).filter((s) => s.length > 0) },
)

/** Table names — mix of common patterns + random */
const tableNameArb = fc.oneof(
  fc.constantFrom(
    'users', 'posts', 'comments', 'tags', 'categories', 'products',
    'recipes', 'items', 'projects', 'tasks', 'profiles', 'events',
    'recipe_category_links', 'table_record', 'order_record',
  ),
  fc.stringMatching(/^[a-z][a-z_]{1,29}$/).filter((s) => s.length > 1),
)

/** Raw column definition (no references — avoids too-complex cycles in generation) */
const rawColumnArb = fc.record({
  name: colNameArb,
  type: sqlTypeArb,
  primaryKey: fc.option(fc.boolean(), { nil: undefined }),
  nullable: fc.option(fc.boolean(), { nil: undefined }),
  default: fc.option(
    fc.constantFrom(
      'gen_random_uuid()', 'now()', "'pending'", "'active'", '0', 'true', 'false',
    ),
    { nil: undefined },
  ),
})

/** Raw table with columns only (no FK references for simplicity) */
const rawTableArb = fc.record({
  name: tableNameArb,
  columns: fc.array(rawColumnArb, { minLength: 1, maxLength: 8 }),
})

/** Raw schema — 1-6 tables, no FK references (avoids need to keep ref tables consistent) */
const rawSchemaArb = fc.record({
  tables: fc.array(rawTableArb, { minLength: 1, maxLength: 6 }),
})

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('SchemaContractSchema property tests', () => {
  it('parse never throws for any reasonable raw input', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        expect(() => SchemaContractSchema.parse(raw)).not.toThrow()
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('all parsed SQL types are in the canonical set', () => {
    const CANONICAL_TYPES = new Set([
      'uuid', 'text', 'numeric', 'boolean', 'timestamptz', 'jsonb', 'integer', 'bigint',
    ])
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        for (const table of contract.tables) {
          for (const col of table.columns) {
            expect(CANONICAL_TYPES.has(col.type)).toBe(true)
          }
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('reserved-word column names are renamed with _val suffix after parse', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        for (const table of contract.tables) {
          for (const col of table.columns) {
            // If the column name (without _val suffix) is a reserved word,
            // then it must have been renamed — i.e. col.name ends with _val
            const base = col.name.endsWith('_val') ? col.name.slice(0, -4) : col.name
            if (SQL_RESERVED_WORDS.has(col.name)) {
              // After normalization, the column name itself should NOT be a reserved word
              // (it would have been renamed to name_val before we see it)
              expect(col.name).toMatch(/_val$/)
            }
            // Baseline: the base name (before _val suffix) should not itself be a reserved word
            // that slipped through un-renamed
            if (!col.name.endsWith('_val')) {
              // This column was not renamed — it must not have been a reserved word originally
              expect(SQL_RESERVED_WORDS.has(col.name)).toBe(false)
            }
            void base // suppress unused var lint
          }
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('reserved-word table names are renamed with _record suffix after parse', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        for (const table of contract.tables) {
          if (!table.name.endsWith('_record')) {
            // This table was not renamed — its name must not be a reserved word
            expect(SQL_RESERVED_WORDS.has(table.name)).toBe(false)
          }
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('parse is idempotent — double-parsing does not change the result', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const once = SchemaContractSchema.parse(raw)
        const twice = SchemaContractSchema.parse(once)
        expect(twice).toEqual(once)
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('validateContract does not throw for any parsed contract', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        expect(() => validateContract(contract)).not.toThrow()
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('validateContract returns errors array (never undefined) for any input', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        const result = validateContract(contract)
        expect(Array.isArray(result.errors)).toBe(true)
        expect(typeof result.valid).toBe('boolean')
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('validateContract valid flag is consistent with errors array length', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        const result = validateContract(contract)
        // valid === true iff errors is empty — these must always agree
        if (result.valid) {
          expect(result.errors).toHaveLength(0)
        } else {
          expect(result.errors.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('all column defaults, if present, are strings after parse', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        for (const table of contract.tables) {
          for (const col of table.columns) {
            if (col.default !== undefined) {
              expect(typeof col.default).toBe('string')
            }
          }
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('no column default is an empty string after parse', () => {
    fc.assert(
      fc.property(rawSchemaArb, (raw) => {
        const contract = SchemaContractSchema.parse(raw)
        for (const table of contract.tables) {
          for (const col of table.columns) {
            // Defaults that normalize to empty string must be dropped (become undefined)
            if (col.default !== undefined) {
              expect(col.default.length).toBeGreaterThan(0)
            }
          }
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })
})

describe('inferRefTableFromStem property tests', () => {
  const tableNamesArb = fc.array(tableNameArb, { minLength: 1, maxLength: 20 })
  const stemArb = fc.stringMatching(/^[a-z][a-z_]{1,25}$/)

  it('always returns undefined or a member of the provided tables array', () => {
    fc.assert(
      fc.property(stemArb, tableNamesArb, (stem, tables) => {
        const result = inferRefTableFromStem(stem, tables)
        if (result !== undefined) {
          expect(tables).toContain(result)
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })

  it('returns undefined when tables array is empty', () => {
    fc.assert(
      fc.property(stemArb, (stem) => {
        const result = inferRefTableFromStem(stem, [])
        expect(result).toBeUndefined()
      }),
      { numRuns: 200, seed: 42 },
    )
  })

  it('finds exact stem match when table with that name exists', () => {
    fc.assert(
      fc.property(tableNameArb, tableNamesArb, (target, others) => {
        const tables = [target, ...others]
        // The stem is the target table name itself — should find it (exact match)
        const result = inferRefTableFromStem(target, tables)
        // Result must be one of the tables (could match something else via substring)
        if (result !== undefined) {
          expect(tables).toContain(result)
        }
        // An exact match exists, so result must never be undefined
        expect(result).toBeDefined()
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('is deterministic — same inputs always yield same output', () => {
    fc.assert(
      fc.property(stemArb, tableNamesArb, (stem, tables) => {
        const first = inferRefTableFromStem(stem, tables)
        const second = inferRefTableFromStem(stem, tables)
        expect(first).toBe(second)
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('never returns a value not in the input tables array', () => {
    fc.assert(
      fc.property(stemArb, tableNamesArb, (stem, tables) => {
        const result = inferRefTableFromStem(stem, tables)
        if (result !== undefined) {
          // Result must be an element from the tables array — never a synthesized string
          expect(tables.indexOf(result)).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 500, seed: 42 },
    )
  })
})
