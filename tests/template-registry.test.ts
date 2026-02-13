import { describe, it, expect } from 'vitest';
import { executeTemplate } from '@/lib/template-registry';

describe('executeTemplate returns SchemaContract fragments', () => {
  it('crud template returns a schema fragment with table definition', () => {
    const result = executeTemplate(
      {
        template: 'crud',
        config: {
          entity: 'task',
          tableName: 'tasks',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'done', type: 'boolean', required: false },
          ],
          belongsTo: [],
        },
      },
      { primaryColor: '#3b82f6', accentColor: '#8b5cf6', fontFamily: 'Inter', spacing: 'comfortable', borderRadius: 'medium' },
    );

    // Should have a schema fragment instead of raw migration SQL
    expect(result.schema).toBeDefined();
    expect(result.schema!.tables).toBeDefined();
    expect(result.schema!.tables).toHaveLength(1);
    expect(result.schema!.tables![0].name).toBe('tasks');
    expect(result.schema!.tables![0].columns.find(c => c.name === 'title')).toBeDefined();
    // migration string should be undefined now (derived from contract later)
    expect(result.migration).toBeUndefined();
  });

  it('crud template with belongsTo adds FK column to schema', () => {
    const result = executeTemplate(
      {
        template: 'crud',
        config: {
          entity: 'comment',
          tableName: 'comments',
          fields: [{ name: 'body', type: 'text', required: true }],
          belongsTo: ['post'],
        },
      },
      { primaryColor: '#3b82f6', accentColor: '#8b5cf6', fontFamily: 'Inter', spacing: 'comfortable', borderRadius: 'medium' },
    );

    expect(result.schema).toBeDefined();
    expect(result.schema!.tables).toBeDefined();
    const table = result.schema!.tables![0];
    const fkCol = table.columns.find(c => c.name === 'post_id');
    expect(fkCol).toBeDefined();
    expect(fkCol!.references).toEqual({ table: 'posts', column: 'id' });
  });
});
