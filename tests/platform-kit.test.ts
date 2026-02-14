import { describe, it, expect } from 'vitest';
import {
  listTablesSql,
  coalesceRowsToArray,
  SYSTEM_SCHEMAS,
} from '@/lib/platform-kit/pg-meta';
import {
  postgresColumnSchema,
  postgresTableSchema,
  postgresPrimaryKeySchema,
  postgresRelationshipSchema,
} from '@/lib/platform-kit/pg-meta/types';
import { client } from '@/lib/platform-kit/management-api';

describe('pg-meta/index.ts', () => {
  describe('SYSTEM_SCHEMAS', () => {
    it('contains expected system schema entries', () => {
      expect(SYSTEM_SCHEMAS).toContain('information_schema');
      expect(SYSTEM_SCHEMAS).toContain('pg_catalog');
      expect(SYSTEM_SCHEMAS).toContain('pg_toast');
      expect(SYSTEM_SCHEMAS).toContain('_timescaledb_internal');
      expect(SYSTEM_SCHEMAS).toHaveLength(4);
    });
  });

  describe('listTablesSql', () => {
    it('excludes system schemas when called with no arguments', () => {
      const sql = listTablesSql();

      // Should contain the WHERE clause excluding system schemas
      expect(sql).toContain('where schema not in');
      expect(sql).toContain("'information_schema'");
      expect(sql).toContain("'pg_catalog'");
      expect(sql).toContain("'pg_toast'");
      expect(sql).toContain("'_timescaledb_internal'");

      // Should NOT contain a positive schema filter
      expect(sql).not.toContain('where schema in (');
    });

    it("includes only 'public' schema when passed ['public']", () => {
      const sql = listTablesSql(['public']);

      // Should contain WHERE clause with only public schema
      expect(sql).toContain("where schema in ('public')");

      // Should NOT contain system schema exclusion
      expect(sql).not.toContain('where schema not in');
    });

    it("includes both schemas when passed ['public', 'auth']", () => {
      const sql = listTablesSql(['public', 'auth']);

      // Should contain WHERE clause with both schemas
      expect(sql).toContain("where schema in ('public','auth')");

      // Should NOT contain system schema exclusion
      expect(sql).not.toContain('where schema not in');
    });

    it('generates valid SQL structure with CTE and column aggregation', () => {
      const sql = listTablesSql();

      // Check for CTE structure
      expect(sql).toContain('with');
      expect(sql).toContain('tables as (');
      expect(sql).toContain('columns as (');

      // Check for main select
      expect(sql).toContain('select');
      expect(sql).toContain('from tables');

      // Check for column coalescing
      expect(sql).toContain('COALESCE');
      expect(sql).toContain('array_agg');
    });
  });

  describe('coalesceRowsToArray', () => {
    it('returns valid SQL with COALESCE and array_agg', () => {
      const result = coalesceRowsToArray('columns', 'columns.table_id = tables.id');

      // Should contain COALESCE
      expect(result).toContain('COALESCE');

      // Should contain SELECT with array_agg
      expect(result).toContain('SELECT');
      expect(result).toContain('array_agg(row_to_json(columns))');

      // Should contain FILTER with the provided condition
      expect(result).toContain('FILTER (WHERE columns.table_id = tables.id)');

      // Should contain FROM clause
      expect(result).toContain('FROM');
      expect(result).toContain('columns');

      // Should default to empty array
      expect(result).toContain("'{}'");

      // Should alias the result
      expect(result).toContain('AS columns');
    });

    it('works with different source and filter parameters', () => {
      const result = coalesceRowsToArray('relationships', 'relationships.id = fk.constraint_id');

      expect(result).toContain('row_to_json(relationships)');
      expect(result).toContain('FILTER (WHERE relationships.id = fk.constraint_id)');
      expect(result).toContain('FROM');
      expect(result).toContain('relationships');
      expect(result).toContain('AS relationships');
    });
  });
});

describe('pg-meta/types.ts', () => {
  describe('postgresColumnSchema', () => {
    it('validates a valid column object', () => {
      const validColumn = {
        table_id: 12345,
        schema: 'public',
        table: 'users',
        id: '12345.1',
        ordinal_position: 1,
        name: 'id',
        default_value: 'gen_random_uuid()',
        data_type: 'uuid',
        format: 'uuid',
        is_identity: false,
        identity_generation: null,
        is_generated: false,
        is_nullable: false,
        is_updatable: true,
        is_unique: true,
        enums: [],
        check: null,
        comment: 'Primary key',
      };

      const result = postgresColumnSchema.safeParse(validColumn);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('id');
        expect(result.data.data_type).toBe('uuid');
      }
    });

    it('rejects invalid column missing required fields', () => {
      const invalidColumn = {
        table_id: 12345,
        schema: 'public',
        // Missing required fields
      };

      const result = postgresColumnSchema.safeParse(invalidColumn);
      expect(result.success).toBe(false);
    });

    it('accepts ALWAYS and BY DEFAULT for identity_generation', () => {
      const columnWithAlways = {
        table_id: 12345,
        schema: 'public',
        table: 'users',
        id: '12345.1',
        ordinal_position: 1,
        name: 'id',
        default_value: null,
        data_type: 'bigint',
        format: 'int8',
        is_identity: true,
        identity_generation: 'ALWAYS' as const,
        is_generated: false,
        is_nullable: false,
        is_updatable: false,
        is_unique: true,
        enums: [],
        check: null,
        comment: null,
      };

      const resultAlways = postgresColumnSchema.safeParse(columnWithAlways);
      expect(resultAlways.success).toBe(true);

      const columnWithByDefault = {
        ...columnWithAlways,
        identity_generation: 'BY DEFAULT' as const,
      };

      const resultByDefault = postgresColumnSchema.safeParse(columnWithByDefault);
      expect(resultByDefault.success).toBe(true);
    });

    it('accepts enum values as array of strings', () => {
      const columnWithEnums = {
        table_id: 12345,
        schema: 'public',
        table: 'users',
        id: '12345.2',
        ordinal_position: 2,
        name: 'status',
        default_value: null,
        data_type: 'USER-DEFINED',
        format: 'user_status',
        is_identity: false,
        identity_generation: null,
        is_generated: false,
        is_nullable: true,
        is_updatable: true,
        is_unique: false,
        enums: ['active', 'inactive', 'pending'],
        check: null,
        comment: null,
      };

      const result = postgresColumnSchema.safeParse(columnWithEnums);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enums).toEqual(['active', 'inactive', 'pending']);
      }
    });
  });

  describe('postgresPrimaryKeySchema', () => {
    it('validates a valid primary key object', () => {
      const validPrimaryKey = {
        schema: 'public',
        table_name: 'users',
        name: 'id',
        table_id: 12345,
      };

      const result = postgresPrimaryKeySchema.safeParse(validPrimaryKey);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('id');
        expect(result.data.table_name).toBe('users');
      }
    });

    it('rejects primary key with invalid table_id type', () => {
      const invalidPrimaryKey = {
        schema: 'public',
        table_name: 'users',
        name: 'id',
        table_id: '12345', // Should be number
      };

      const result = postgresPrimaryKeySchema.safeParse(invalidPrimaryKey);
      expect(result.success).toBe(false);
    });
  });

  describe('postgresRelationshipSchema', () => {
    it('validates a valid relationship object', () => {
      const validRelationship = {
        id: 67890,
        constraint_name: 'posts_user_id_fkey',
        source_schema: 'public',
        source_table_name: 'posts',
        source_column_name: 'user_id',
        target_table_schema: 'public',
        target_table_name: 'users',
        target_column_name: 'id',
      };

      const result = postgresRelationshipSchema.safeParse(validRelationship);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.constraint_name).toBe('posts_user_id_fkey');
        expect(result.data.source_table_name).toBe('posts');
        expect(result.data.target_table_name).toBe('users');
      }
    });
  });

  describe('postgresTableSchema', () => {
    it('validates a complete table object with columns, primary_keys, and relationships', () => {
      const validTable = {
        id: 12345,
        schema: 'public',
        name: 'users',
        rls_enabled: true,
        rls_forced: false,
        replica_identity: 'DEFAULT' as const,
        bytes: 16384,
        size: '16 kB',
        live_rows_estimate: 100,
        dead_rows_estimate: 0,
        comment: 'User accounts table',
        columns: [
          {
            table_id: 12345,
            schema: 'public',
            table: 'users',
            id: '12345.1',
            ordinal_position: 1,
            name: 'id',
            default_value: 'gen_random_uuid()',
            data_type: 'uuid',
            format: 'uuid',
            is_identity: false,
            identity_generation: null,
            is_generated: false,
            is_nullable: false,
            is_updatable: true,
            is_unique: true,
            enums: [],
            check: null,
            comment: null,
          },
        ],
        primary_keys: [
          {
            schema: 'public',
            table_name: 'users',
            name: 'id',
            table_id: 12345,
          },
        ],
        relationships: [
          {
            id: 67890,
            constraint_name: 'posts_user_id_fkey',
            source_schema: 'public',
            source_table_name: 'posts',
            source_column_name: 'user_id',
            target_table_schema: 'public',
            target_table_name: 'users',
            target_column_name: 'id',
          },
        ],
      };

      const result = postgresTableSchema.safeParse(validTable);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('users');
        expect(result.data.columns).toHaveLength(1);
        expect(result.data.primary_keys).toHaveLength(1);
        expect(result.data.relationships).toHaveLength(1);
      }
    });

    it('rejects a table missing required fields', () => {
      const invalidTable = {
        id: 12345,
        schema: 'public',
        name: 'users',
        // Missing many required fields
      };

      const result = postgresTableSchema.safeParse(invalidTable);
      expect(result.success).toBe(false);
    });

    it('accepts all valid replica_identity values', () => {
      const replicaIdentities = ['DEFAULT', 'INDEX', 'FULL', 'NOTHING'] as const;

      replicaIdentities.forEach((replicaIdentity) => {
        const table = {
          id: 12345,
          schema: 'public',
          name: 'test_table',
          rls_enabled: false,
          rls_forced: false,
          replica_identity: replicaIdentity,
          bytes: 8192,
          size: '8 kB',
          live_rows_estimate: 0,
          dead_rows_estimate: 0,
          comment: null,
          primary_keys: [],
          relationships: [],
        };

        const result = postgresTableSchema.safeParse(table);
        expect(result.success).toBe(true);
      });
    });

    it('accepts table with optional columns field omitted', () => {
      const tableWithoutColumns = {
        id: 12345,
        schema: 'public',
        name: 'test_table',
        rls_enabled: false,
        rls_forced: false,
        replica_identity: 'DEFAULT' as const,
        bytes: 8192,
        size: '8 kB',
        live_rows_estimate: 0,
        dead_rows_estimate: 0,
        comment: null,
        // columns field omitted - it's optional
        primary_keys: [],
        relationships: [],
      };

      const result = postgresTableSchema.safeParse(tableWithoutColumns);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.columns).toBeUndefined();
      }
    });

    it('accepts null for comment field', () => {
      const tableWithNullComment = {
        id: 12345,
        schema: 'public',
        name: 'test_table',
        rls_enabled: false,
        rls_forced: false,
        replica_identity: 'DEFAULT' as const,
        bytes: 8192,
        size: '8 kB',
        live_rows_estimate: 0,
        dead_rows_estimate: 0,
        comment: null,
        primary_keys: [],
        relationships: [],
      };

      const result = postgresTableSchema.safeParse(tableWithNullComment);
      expect(result.success).toBe(true);
    });
  });
});

describe('management-api.ts', () => {
  describe('client', () => {
    it('is defined', () => {
      expect(client).toBeDefined();
      expect(client).toBeTypeOf('object');
    });

    it('has GET, POST, PUT, DELETE, PATCH methods', () => {
      expect(typeof client.GET).toBe('function');
      expect(typeof client.POST).toBe('function');
      expect(typeof client.PUT).toBe('function');
      expect(typeof client.DELETE).toBe('function');
      expect(typeof client.PATCH).toBe('function');
    });
  });
});
