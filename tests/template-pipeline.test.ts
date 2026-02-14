import { describe, it, expect } from 'vitest';
import { mergeSchemaContracts } from '@/lib/template-pipeline';
import type { SchemaContract } from '@/lib/schema-contract';

describe('mergeSchemaContracts', () => {
  it('merges multiple contract fragments into one', () => {
    const fragments: Partial<SchemaContract>[] = [
      {
        tables: [{
          name: 'posts',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text', nullable: false },
          ],
        }],
      },
      {
        tables: [{
          name: 'comments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'post_id', type: 'uuid', references: { table: 'posts', column: 'id' } },
          ],
        }],
      },
    ];

    const merged = mergeSchemaContracts(fragments);
    expect(merged.tables).toHaveLength(2);
    expect(merged.tables.map(t => t.name)).toContain('posts');
    expect(merged.tables.map(t => t.name)).toContain('comments');
  });

  it('deduplicates tables by name (last wins)', () => {
    const fragments: Partial<SchemaContract>[] = [
      { tables: [{ name: 'items', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] }] },
      { tables: [{ name: 'items', columns: [{ name: 'id', type: 'uuid', primaryKey: true }, { name: 'title', type: 'text' }] }] },
    ];

    const merged = mergeSchemaContracts(fragments);
    expect(merged.tables).toHaveLength(1);
    expect(merged.tables[0].columns).toHaveLength(2); // last one wins
  });

  it('auto-creates stub tables for unresolved FK references', () => {
    const fragments: Partial<SchemaContract>[] = [
      {
        tables: [{
          name: 'ward_assignments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'bed_id', type: 'uuid', references: { table: 'beds', column: 'id' } },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          ],
        }],
      },
    ];

    const merged = mergeSchemaContracts(fragments);
    expect(merged.tables).toHaveLength(2);
    const beds = merged.tables.find(t => t.name === 'beds');
    expect(beds).toBeDefined();
    expect(beds!.columns.find(c => c.name === 'id')).toBeDefined();
  });

  it('stub table RLS policies use cached (select auth.uid())', () => {
    const fragments: Partial<SchemaContract>[] = [
      {
        tables: [{
          name: 'assignments',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'room_id', type: 'uuid', references: { table: 'rooms', column: 'id' } },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
          ],
        }],
      },
    ];

    const merged = mergeSchemaContracts(fragments);
    const rooms = merged.tables.find(t => t.name === 'rooms');
    expect(rooms).toBeDefined();
    for (const policy of rooms!.rlsPolicies ?? []) {
      if (policy.using) {
        expect(policy.using).toContain('(select auth.uid())');
        expect(policy.using).not.toBe('auth.uid() = user_id');
      }
      if (policy.withCheck) {
        expect(policy.withCheck).toContain('(select auth.uid())');
      }
    }
  });

  it('generates seed data for tables without required external FKs', () => {
    const fragments: Partial<SchemaContract>[] = [
      {
        tables: [{
          name: 'categories',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'description', type: 'text' },
          ],
        }],
      },
    ];

    const merged = mergeSchemaContracts(fragments);
    expect(merged.seedData).toBeDefined();
    expect(merged.seedData!.length).toBeGreaterThan(0);
    const catSeed = merged.seedData!.find(s => s.table === 'categories');
    expect(catSeed).toBeDefined();
    expect(catSeed!.rows.length).toBe(5);
  });

  it('skips seed data for tables with required external FK (auth.users)', () => {
    const fragments: Partial<SchemaContract>[] = [
      {
        tables: [{
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
            { name: 'display_name', type: 'text' },
          ],
        }],
      },
    ];

    const merged = mergeSchemaContracts(fragments);
    const profilesSeed = merged.seedData!.find(s => s.table === 'profiles');
    expect(profilesSeed).toBeDefined();
    expect(profilesSeed!.rows.length).toBe(0);
  });
});
