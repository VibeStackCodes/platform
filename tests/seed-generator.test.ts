import { describe, it, expect } from 'vitest';
import { generateSeedData, generateAllSeedData } from '@/lib/seed-generator';
import type { TableDef } from '@/lib/schema-contract';

describe('generateSeedData', () => {
  it('generates the requested number of rows', () => {
    const table: TableDef = {
      name: 'items',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
      ],
    };
    const seed = generateSeedData(table, 5, []);
    expect(seed.table).toBe('items');
    expect(seed.rows).toHaveLength(5);
  });

  it('skips primary key and auto-generated columns', () => {
    const table: TableDef = {
      name: 'items',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text' },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    };
    const seed = generateSeedData(table, 1, []);
    const row = seed.rows[0];
    // id IS included (pre-generated UUID so child tables can reference it)
    expect(row).toHaveProperty('id');
    expect(row).not.toHaveProperty('created_at');
    expect(row).not.toHaveProperty('updated_at');
    expect(row).toHaveProperty('title');
  });

  it('uses column-name heuristics for email', () => {
    const table: TableDef = {
      name: 'users',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'email', type: 'text', nullable: false },
      ],
    };
    const seed = generateSeedData(table, 1, []);
    expect(seed.rows[0].email).toMatch(/@/);
  });

  it('uses column-name heuristics for price (numeric)', () => {
    const table: TableDef = {
      name: 'products',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'price', type: 'numeric' },
      ],
    };
    const seed = generateSeedData(table, 1, []);
    expect(typeof seed.rows[0].price).toBe('number');
  });

  it('skips tables with required external FK (auth.users)', () => {
    const table: TableDef = {
      name: 'profiles',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
        { name: 'display_name', type: 'text' },
      ],
    };
    const seed = generateSeedData(table, 3, []);
    expect(seed.rows).toHaveLength(0);
  });

  it('resolves internal FK using parent IDs from generatedIds map', () => {
    const parentIds = ['parent-1', 'parent-2', 'parent-3'];
    const generatedIds = new Map([['posts', parentIds]]);
    const table: TableDef = {
      name: 'comments',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
        { name: 'body', type: 'text' },
      ],
    };
    const seed = generateSeedData(table, 3, [], generatedIds);
    expect(seed.rows).toHaveLength(3);
    for (const row of seed.rows) {
      expect(parentIds).toContain(row.post_id);
      expect(row).toHaveProperty('body');
    }
  });

  it('skips internal FK table when parent has no generated IDs', () => {
    const table: TableDef = {
      name: 'comments',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
      ],
    };
    const seed = generateSeedData(table, 1, []);
    expect(seed.rows).toHaveLength(0);
  });

  it('generates jsonb values as objects', () => {
    const table: TableDef = {
      name: 'settings',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'metadata', type: 'jsonb' },
      ],
    };
    const seed = generateSeedData(table, 1, []);
    expect(typeof seed.rows[0].metadata).toBe('object');
  });

  it('falls back to type-based generation for unknown column names', () => {
    const table: TableDef = {
      name: 'widgets',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'xyzzy', type: 'text' },
        { name: 'flag', type: 'boolean' },
        { name: 'count', type: 'integer' },
      ],
    };
    const seed = generateSeedData(table, 1, []);
    expect(typeof seed.rows[0].xyzzy).toBe('string');
    expect(typeof seed.rows[0].flag).toBe('boolean');
    expect(typeof seed.rows[0].count).toBe('number');
  });
});

describe('generateAllSeedData', () => {
  it('seeds parent tables first and resolves FK references in children', () => {
    const tables: TableDef[] = [
      {
        name: 'comments', // child — listed first to test topo sort
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
          { name: 'body', type: 'text' },
        ],
      },
      {
        name: 'posts', // parent — listed second
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'title', type: 'text' },
        ],
      },
    ];

    const seeds = generateAllSeedData(tables, 3, []);

    // Posts should have seed data
    const postsSeed = seeds.find(s => s.table === 'posts');
    expect(postsSeed).toBeDefined();
    expect(postsSeed!.rows).toHaveLength(3);

    // Comments should reference actual post IDs
    const commentsSeed = seeds.find(s => s.table === 'comments');
    expect(commentsSeed).toBeDefined();
    expect(commentsSeed!.rows).toHaveLength(3);

    const postIds = postsSeed!.rows.map(r => r.id);
    for (const row of commentsSeed!.rows) {
      expect(postIds).toContain(row.post_id);
    }
  });
});
