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
});
