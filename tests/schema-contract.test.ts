// tests/schema-contract.test.ts

import { type SchemaContract, validateContract, inferFeatures, inferRefTableFromStem, SchemaContractSchema } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('validateContract', () => {
  it('accepts a valid contract with tables and relations', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'display_name', type: 'text', nullable: false },
            {
              name: 'user_id',
              type: 'uuid',
              nullable: false,
              references: { table: 'auth.users', column: 'id' },
            },
            { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
          ],
          rlsPolicies: [
            {
              name: 'Users can view own profile',
              operation: 'SELECT',
              using: 'auth.uid() = user_id',
            },
          ],
        },
      ],
    }
    expect(validateContract(contract)).toEqual({ valid: true, errors: [] })
  })

  it('rejects a contract with duplicate column names in a table', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'items',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'title', type: 'text' }, // duplicate
          ],
        },
      ],
    }
    const result = validateContract(contract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('duplicate')
  })

  it('rejects a contract with FK reference to non-existent table', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
          ],
        },
      ],
    }
    const result = validateContract(contract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('posts')
  })

  it('allows FK references to auth.users (external table)', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          ],
        },
      ],
    }
    expect(validateContract(contract)).toEqual({ valid: true, errors: [] })
  })

  it('rejects a contract with circular FK dependencies', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'a',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'b_id', type: 'uuid', references: { table: 'b', column: 'id' } },
          ],
        },
        {
          name: 'b',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'a_id', type: 'uuid', references: { table: 'a', column: 'id' } },
          ],
        },
      ],
    }
    const result = validateContract(contract)
    expect(result.valid).toBe(false)
    expect(result.errors[0].toLowerCase()).toContain('circular')
  })
})

describe('inferFeatures', () => {
  it('detects auth when any table has user_id FK to auth.users', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'bookmark',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
            { name: 'url', type: 'text', nullable: false },
          ],
        },
      ],
    }
    const features = inferFeatures(contract)
    expect(features.auth).toBe(true)
    expect(features.entities).toEqual(['bookmark'])
  })

  it('returns auth=false when no user_id FK exists', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'item',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    }
    const features = inferFeatures(contract)
    expect(features.auth).toBe(false)
  })

  it('lists all table names as entities', () => {
    const contract: SchemaContract = {
      tables: [
        { name: 'bookmark', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] },
        { name: 'tag', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] },
        { name: 'bookmark_tag', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] },
      ],
    }
    const features = inferFeatures(contract)
    expect(features.entities).toEqual(['bookmark', 'tag', 'bookmark_tag'])
  })
})

// ============================================================================
// inferRefTableFromStem
// ============================================================================

describe('inferRefTableFromStem', () => {
  const tables = ['author', 'tags', 'addresses', 'menu_categories', 'table_record', 'order_record']

  it('matches exact stem', () => {
    expect(inferRefTableFromStem('author', tables)).toBe('author')
  })

  it('matches simple plural (stem + s)', () => {
    expect(inferRefTableFromStem('tag', tables)).toBe('tags')
  })

  it('matches -es plural', () => {
    expect(inferRefTableFromStem('address', tables)).toBe('addresses')
  })

  it('matches y→ies plural as substring (category_id → menu_categories)', () => {
    expect(inferRefTableFromStem('category', tables)).toBe('menu_categories')
  })

  it('matches reserved-word rename (table → table_record)', () => {
    expect(inferRefTableFromStem('table', tables)).toBe('table_record')
  })

  it('returns undefined when no table matches', () => {
    expect(inferRefTableFromStem('external_service', tables)).toBeUndefined()
  })
})

// ============================================================================
// SchemaContractSchema.transform — implicit FK normalization
// ============================================================================

describe('SchemaContractSchema.transform — FK normalization', () => {
  it('populates references on implicit FK columns when matching table exists', () => {
    const contract = SchemaContractSchema.parse({
      tables: [
        {
          name: 'menu_item',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'category_id', type: 'uuid' }, // implicit FK → menu_categories
          ],
        },
        {
          name: 'menu_categories',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    })
    const col = contract.tables[0].columns.find((c) => c.name === 'category_id')
    expect(col?.references).toEqual({ table: 'menu_categories', column: 'id' })
  })

  it('does not overwrite explicit references already in the contract', () => {
    const contract = SchemaContractSchema.parse({
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'project_id', type: 'uuid', references: { table: 'project', column: 'id' } },
          ],
        },
        { name: 'project', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] },
      ],
    })
    const col = contract.tables[0].columns.find((c) => c.name === 'project_id')
    expect(col?.references).toEqual({ table: 'project', column: 'id' })
  })

  it('leaves references undefined when no matching table is found', () => {
    const contract = SchemaContractSchema.parse({
      tables: [{
        name: 'event',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'external_service_id', type: 'uuid' }, // no matching table
        ],
      }],
    })
    const col = contract.tables[0].columns.find((c) => c.name === 'external_service_id')
    expect(col?.references).toBeUndefined()
  })

  it('does not infer references for non-_id columns', () => {
    const contract = SchemaContractSchema.parse({
      tables: [{
        name: 'post',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'price', type: 'numeric' },
        ],
      }],
    })
    const col = contract.tables[0].columns.find((c) => c.name === 'price')
    expect(col?.references).toBeUndefined()
  })

  // id uuid PRIMARY KEY normalization
  it('auto-sets primaryKey: true on id uuid columns missing it', () => {
    const contract = SchemaContractSchema.parse({
      tables: [{
        name: 'recipes',
        columns: [
          // LLM forgot primaryKey: true — would cause 42830 on any REFERENCES recipes(id)
          { name: 'id', type: 'uuid', default: 'gen_random_uuid()' },
          { name: 'title', type: 'text' },
        ],
      }],
    })
    const idCol = contract.tables[0].columns.find((c) => c.name === 'id')
    expect(idCol?.primaryKey).toBe(true)
    expect(idCol?.default).toBe('gen_random_uuid()')
  })

  it('adds gen_random_uuid() default when id uuid has no default', () => {
    const contract = SchemaContractSchema.parse({
      tables: [{
        name: 'items',
        columns: [{ name: 'id', type: 'uuid' }],
      }],
    })
    const idCol = contract.tables[0].columns.find((c) => c.name === 'id')
    expect(idCol?.primaryKey).toBe(true)
    expect(idCol?.default).toBe('gen_random_uuid()')
  })

  it('does not change id uuid that already has primaryKey: true', () => {
    const contract = SchemaContractSchema.parse({
      tables: [{
        name: 'user_profile',
        columns: [{ name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' }],
      }],
    })
    const idCol = contract.tables[0].columns.find((c) => c.name === 'id')
    expect(idCol?.primaryKey).toBe(true)
  })

  it('does not infer self-referential FK even when stem substring-matches own table name', () => {
    // `category_id` in `recipe_category_links` → stem `category` → substring matches the
    // table's own name (contains "category") → must NOT produce a self-referential FK.
    const contract = SchemaContractSchema.parse({
      tables: [
        {
          name: 'recipe_category_links',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'recipe_id', type: 'uuid' },
            { name: 'category_id', type: 'uuid' }, // no real 'category' table exists
          ],
        },
        {
          name: 'recipes',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    })
    const links = contract.tables[0]
    const categoryCol = links.columns.find((c) => c.name === 'category_id')
    // category_id → stem 'category' → would substring-match 'recipe_category_links' itself
    // → must be blocked. No matching external table → undefined.
    expect(categoryCol?.references).toBeUndefined()

    const recipeCol = links.columns.find((c) => c.name === 'recipe_id')
    // recipe_id → stem 'recipe' → plural 'recipes' → correct external table
    expect(recipeCol?.references).toEqual({ table: 'recipes', column: 'id' })
  })

  it('drops explicit self-referential FKs provided by the LLM', () => {
    // LLMs sometimes wire junction table columns back to the same table:
    //   recipe_category_links.category_id → references: { table: 'recipe_category_links' }
    // This creates a circular FK cycle. The transform must drop these.
    const contract = SchemaContractSchema.parse({
      tables: [
        {
          name: 'recipe_category_links',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'recipe_id', type: 'uuid' },
            {
              name: 'category_id',
              type: 'uuid',
              // LLM explicitly wired this back to the same table — must be dropped
              references: { table: 'recipe_category_links', column: 'id' },
            },
          ],
        },
        {
          name: 'recipes',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    })
    const links = contract.tables[0]
    const categoryCol = links.columns.find((c) => c.name === 'category_id')
    // Explicit self-reference must be dropped (not just inference-blocked)
    expect(categoryCol?.references).toBeUndefined()
  })

  it('does not auto-set primaryKey on non-uuid id columns', () => {
    // e.g. a surrogate integer id — shouldn't be touched by uuid normalization
    const contract = SchemaContractSchema.parse({
      tables: [{
        name: 'legacy',
        columns: [{ name: 'id', type: 'integer' }],
      }],
    })
    const idCol = contract.tables[0].columns.find((c) => c.name === 'id')
    // integer id — not touched (no primaryKey auto-set by our transform)
    expect(idCol?.primaryKey).toBeFalsy()
  })
})
