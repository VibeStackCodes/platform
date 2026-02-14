import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { generateZodSchema, getPrimaryKeys } from '@/components/supabase-manager/database';

describe('generateZodSchema', () => {
  it('returns empty schema for null table', () => {
    const schema = generateZodSchema(null);
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(schema.shape)).toHaveLength(0);
  });

  it('returns empty schema for undefined table', () => {
    const schema = generateZodSchema(undefined);
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(schema.shape)).toHaveLength(0);
  });

  it('returns empty schema for table with no columns', () => {
    const table = { name: 'test_table' };
    const schema = generateZodSchema(table);
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(schema.shape)).toHaveLength(0);
  });

  it('returns empty schema for table with empty columns array', () => {
    const table = { name: 'test_table', columns: [] };
    const schema = generateZodSchema(table);
    expect(schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(schema.shape)).toHaveLength(0);
  });

  it('maps integer column to z.number()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'age',
          data_type: 'integer',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('age');

    // Test that it validates numbers and rejects strings
    expect(() => schema.parse({ age: 25 })).not.toThrow();
    expect(() => schema.parse({ age: '25' })).toThrow();
  });

  it('maps bigint column to z.number()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'count',
          data_type: 'bigint',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('count');
    expect(() => schema.parse({ count: 100 })).not.toThrow();
  });

  it('maps numeric column to z.number()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'price',
          data_type: 'numeric',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('price');
    expect(() => schema.parse({ price: 99.99 })).not.toThrow();
  });

  it('maps boolean column to z.boolean()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'is_active',
          data_type: 'boolean',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('is_active');

    // Test that it validates booleans and rejects strings
    expect(() => schema.parse({ is_active: true })).not.toThrow();
    expect(() => schema.parse({ is_active: false })).not.toThrow();
    expect(() => schema.parse({ is_active: 'true' })).toThrow();
  });

  it('maps text column to z.string()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'name',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('name');

    // Test that it validates strings and rejects numbers
    expect(() => schema.parse({ name: 'John Doe' })).not.toThrow();
    expect(() => schema.parse({ name: 123 })).toThrow();
  });

  it('maps varchar column to z.string()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'email',
          data_type: 'character varying',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('email');
    expect(() => schema.parse({ email: 'test@example.com' })).not.toThrow();
  });

  it('maps array column to z.array(z.any())', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'tags',
          data_type: 'ARRAY',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('tags');

    // Test that it validates arrays and rejects non-arrays
    expect(() => schema.parse({ tags: [] })).not.toThrow();
    expect(() => schema.parse({ tags: ['a', 'b', 'c'] })).not.toThrow();
    expect(() => schema.parse({ tags: [1, 2, 3] })).not.toThrow();
    expect(() => schema.parse({ tags: 'not an array' })).toThrow();
  });

  it('maps user-defined enum column to z.enum()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'status',
          data_type: 'USER-DEFINED',
          enums: ['pending', 'active', 'completed'],
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('status');

    // Test that it validates enum values
    expect(() => schema.parse({ status: 'pending' })).not.toThrow();
    expect(() => schema.parse({ status: 'active' })).not.toThrow();
    expect(() => schema.parse({ status: 'completed' })).not.toThrow();
    expect(() => schema.parse({ status: 'invalid' })).toThrow();
  });

  it('falls back to z.string() for user-defined without enums', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'custom_type',
          data_type: 'user-defined',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('custom_type');
    expect(() => schema.parse({ custom_type: 'any string' })).not.toThrow();
  });

  it('falls back to z.string() for user-defined with empty enums array', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'custom_type',
          data_type: 'user-defined',
          enums: [],
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('custom_type');
    expect(() => schema.parse({ custom_type: 'any string' })).not.toThrow();
  });

  it('makes nullable column optional with nullish()', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'description',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: true,
        },
      ],
    };
    const schema = generateZodSchema(table);
    expect(Object.keys(schema.shape)).toContain('description');

    // Test that it accepts null, undefined, and strings
    expect(() => schema.parse({ description: 'Some text' })).not.toThrow();
    expect(() => schema.parse({ description: null })).not.toThrow();
    expect(() => schema.parse({ description: undefined })).not.toThrow();
    expect(() => schema.parse({})).not.toThrow(); // Missing key should be fine
  });

  it('makes nullable number column accept null', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'score',
          data_type: 'integer',
          is_updatable: true,
          is_generated: false,
          is_nullable: true,
        },
      ],
    };
    const schema = generateZodSchema(table);

    expect(() => schema.parse({ score: 100 })).not.toThrow();
    expect(() => schema.parse({ score: null })).not.toThrow();
    expect(() => schema.parse({ score: undefined })).not.toThrow();
    expect(() => schema.parse({})).not.toThrow();
  });

  it('skips non-updatable columns', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'id',
          data_type: 'integer',
          is_updatable: false,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'name',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);

    expect(Object.keys(schema.shape)).not.toContain('id');
    expect(Object.keys(schema.shape)).toContain('name');
  });

  it('skips generated columns', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'created_at',
          data_type: 'timestamp',
          is_updatable: true,
          is_generated: true,
          is_nullable: false,
        },
        {
          name: 'name',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);

    expect(Object.keys(schema.shape)).not.toContain('created_at');
    expect(Object.keys(schema.shape)).toContain('name');
  });

  it('skips both non-updatable and generated columns', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'id',
          data_type: 'integer',
          is_updatable: false,
          is_generated: true,
          is_nullable: false,
        },
        {
          name: 'name',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };
    const schema = generateZodSchema(table);

    expect(Object.keys(schema.shape)).not.toContain('id');
    expect(Object.keys(schema.shape)).toContain('name');
  });

  it('handles mixed column types in a complex table', () => {
    const table = {
      name: 'users',
      columns: [
        {
          name: 'id',
          data_type: 'integer',
          is_updatable: false,
          is_generated: true,
          is_nullable: false,
        },
        {
          name: 'name',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'email',
          data_type: 'character varying',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'age',
          data_type: 'integer',
          is_updatable: true,
          is_generated: false,
          is_nullable: true,
        },
        {
          name: 'is_admin',
          data_type: 'boolean',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'roles',
          data_type: 'ARRAY',
          is_updatable: true,
          is_generated: false,
          is_nullable: true,
        },
        {
          name: 'status',
          data_type: 'user-defined',
          enums: ['active', 'inactive', 'suspended'],
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };

    const schema = generateZodSchema(table);
    const keys = Object.keys(schema.shape);

    // Should not include generated/non-updatable id
    expect(keys).not.toContain('id');

    // Should include all updatable, non-generated columns
    expect(keys).toContain('name');
    expect(keys).toContain('email');
    expect(keys).toContain('age');
    expect(keys).toContain('is_admin');
    expect(keys).toContain('roles');
    expect(keys).toContain('status');

    // Test a valid object
    const validData = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      is_admin: false,
      roles: ['user', 'viewer'],
      status: 'active',
    };
    expect(() => schema.parse(validData)).not.toThrow();

    // Test with nullable fields as null
    const validDataWithNulls = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      age: null,
      is_admin: true,
      roles: null,
      status: 'inactive',
    };
    expect(() => schema.parse(validDataWithNulls)).not.toThrow();
  });

  it('handles case-insensitive data types', () => {
    const table = {
      name: 'test_table',
      columns: [
        {
          name: 'field1',
          data_type: 'INTEGER',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'field2',
          data_type: 'BOOLEAN',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'field3',
          data_type: 'TEXT',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
    };

    const schema = generateZodSchema(table);

    expect(() => schema.parse({ field1: 1, field2: true, field3: 'text' })).not.toThrow();
  });
});

describe('getPrimaryKeys', () => {
  it('returns empty array for null table', () => {
    const result = getPrimaryKeys(null);
    expect(result).toEqual([]);
  });

  it('returns empty array for undefined table', () => {
    const result = getPrimaryKeys(undefined);
    expect(result).toEqual([]);
  });

  it('returns empty array for table with no primary_keys property', () => {
    const table = { name: 'test_table' };
    const result = getPrimaryKeys(table);
    expect(result).toEqual([]);
  });

  it('returns empty array for table with empty primary_keys array', () => {
    const table = { name: 'test_table', primary_keys: [] };
    const result = getPrimaryKeys(table);
    expect(result).toEqual([]);
  });

  it('returns array with single primary key name', () => {
    const table = {
      name: 'test_table',
      primary_keys: [{ name: 'id' }],
    };
    const result = getPrimaryKeys(table);
    expect(result).toEqual(['id']);
  });

  it('returns array with multiple primary key names for composite key', () => {
    const table = {
      name: 'test_table',
      primary_keys: [{ name: 'org_id' }, { name: 'user_id' }],
    };
    const result = getPrimaryKeys(table);
    expect(result).toEqual(['org_id', 'user_id']);
  });

  it('preserves order of primary keys', () => {
    const table = {
      name: 'test_table',
      primary_keys: [{ name: 'first' }, { name: 'second' }, { name: 'third' }],
    };
    const result = getPrimaryKeys(table);
    expect(result).toEqual(['first', 'second', 'third']);
  });

  it('handles primary key objects with additional properties', () => {
    const table = {
      name: 'test_table',
      primary_keys: [
        { name: 'id', data_type: 'integer', is_nullable: false },
      ],
    };
    const result = getPrimaryKeys(table);
    expect(result).toEqual(['id']);
  });

  it('extracts only the name property from complex pk objects', () => {
    const table = {
      name: 'users_roles',
      primary_keys: [
        { name: 'user_id', data_type: 'uuid', is_nullable: false, position: 1 },
        { name: 'role_id', data_type: 'uuid', is_nullable: false, position: 2 },
      ],
    };
    const result = getPrimaryKeys(table);
    expect(result).toEqual(['user_id', 'role_id']);
    expect(result).toHaveLength(2);
  });
});
