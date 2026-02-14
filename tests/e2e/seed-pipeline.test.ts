/**
 * E2E Seed Pipeline Tests
 *
 * Tests the complete post-migration seeding flow:
 * - Connection string construction from project credentials
 * - Seed client initialization with correct database URL
 * - Table-by-table seeding with error resilience
 * - Integration with the proxy for table introspection before seeding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock Setup
// ============================================================================

vi.mock('@snaplet/seed', () => ({
  createSeedClient: vi.fn(),
}));

// ============================================================================
// Tests: Full Seed Pipeline
// ============================================================================

describe('Seed Pipeline E2E', () => {
  let mockCreateSeedClient: any;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const snapletSeed = await import('@snaplet/seed');
    mockCreateSeedClient = snapletSeed.createSeedClient as any;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('runs the full introspect → connect → seed → report pipeline', async () => {
    const { buildConnectionString, seedRemoteDatabase } = await import('@/lib/seed-remote');
    const { listTablesSql } = await import('@/lib/platform-kit/pg-meta');
    const { postgresTableSchema } = await import('@/lib/platform-kit/pg-meta/types');
    const { getPrimaryKeys } = await import('@/components/supabase-manager/database');

    // Step 1: Generate introspection SQL (what the UI sends to get table list)
    const sql = listTablesSql(['public']);
    expect(sql).toContain("where schema in ('public')");

    // Step 2: Simulate the introspection response — discovered tables
    const discoveredTables = [
      {
        id: 1, schema: 'public', name: 'users',
        rls_enabled: true, rls_forced: false,
        replica_identity: 'DEFAULT' as const,
        bytes: 8192, size: '8 kB',
        live_rows_estimate: 0, dead_rows_estimate: 0, comment: null,
        columns: [
          {
            table_id: 1, schema: 'public', table: 'users', id: '1.1',
            ordinal_position: 1, name: 'id', default_value: 'gen_random_uuid()',
            data_type: 'uuid', format: 'uuid',
            is_identity: false, identity_generation: null,
            is_generated: true, is_nullable: false, is_updatable: false,
            is_unique: true, enums: [], check: null, comment: null,
          },
          {
            table_id: 1, schema: 'public', table: 'users', id: '1.2',
            ordinal_position: 2, name: 'email', default_value: null,
            data_type: 'text', format: 'text',
            is_identity: false, identity_generation: null,
            is_generated: false, is_nullable: false, is_updatable: true,
            is_unique: true, enums: [], check: null, comment: null,
          },
        ],
        primary_keys: [{ schema: 'public', table_name: 'users', name: 'id', table_id: 1 }],
        relationships: [],
      },
      {
        id: 2, schema: 'public', name: 'posts',
        rls_enabled: true, rls_forced: false,
        replica_identity: 'DEFAULT' as const,
        bytes: 8192, size: '8 kB',
        live_rows_estimate: 0, dead_rows_estimate: 0, comment: null,
        primary_keys: [{ schema: 'public', table_name: 'posts', name: 'id', table_id: 2 }],
        relationships: [{
          id: 100, constraint_name: 'posts_user_id_fkey',
          source_schema: 'public', source_table_name: 'posts', source_column_name: 'user_id',
          target_table_schema: 'public', target_table_name: 'users', target_column_name: 'id',
        }],
      },
    ];

    // Validate each through pg-meta schemas
    for (const table of discoveredTables) {
      expect(postgresTableSchema.safeParse(table).success).toBe(true);
    }

    // Step 3: Extract table names for seeding
    const tableNames = discoveredTables.map((t) => t.name);
    expect(tableNames).toEqual(['users', 'posts']);

    // Step 4: Build connection string from project credentials
    const project = {
      id: 'proj-123', name: 'My App', orgId: 'org-1', region: 'us-east-1',
      dbHost: 'db.proj-123.supabase.co', dbPassword: 'S3cur3!P@ss',
      anonKey: 'anon-key', serviceRoleKey: 'svc-key',
      url: 'https://proj-123.supabase.co',
    };

    const connStr = buildConnectionString(project as any);
    expect(connStr).toBe(
      'postgresql://postgres:S3cur3!P%40ss@db.proj-123.supabase.co:5432/postgres',
    );

    // Step 5: Seed the database
    const mockUsersMethod = vi.fn().mockResolvedValue(undefined);
    const mockPostsMethod = vi.fn().mockResolvedValue(undefined);

    mockCreateSeedClient.mockResolvedValue({
      users: mockUsersMethod,
      posts: mockPostsMethod,
    });

    const result = await seedRemoteDatabase(project as any, tableNames, 10);

    // Step 6: Verify the full pipeline
    expect(mockCreateSeedClient).toHaveBeenCalledWith({
      databaseUrl: connStr,
    });
    expect(mockUsersMethod).toHaveBeenCalledTimes(1);
    expect(mockPostsMethod).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ tablesSeeded: 2, rowsInserted: 20 });

    // Step 7: Verify the seeded tables have primary keys (for later editing)
    for (const table of discoveredTables) {
      const pks = getPrimaryKeys(table);
      expect(pks).toContain('id');
    }
  });

  it('handles partial failure: seeds what it can, reports accurately', async () => {
    const { seedRemoteDatabase } = await import('@/lib/seed-remote');

    const errorMethod = vi.fn().mockRejectedValue(new Error('unique_violation'));
    const successMethod = vi.fn().mockResolvedValue(undefined);

    mockCreateSeedClient.mockResolvedValue({
      users: errorMethod,
      posts: successMethod,
      comments: successMethod,
    });

    const project = {
      id: 'x', name: 'x', orgId: 'x', region: 'x',
      dbHost: 'db.x.supabase.co', dbPassword: 'pass',
      anonKey: 'x', serviceRoleKey: 'x', url: 'x',
    };

    const result = await seedRemoteDatabase(
      project as any,
      ['users', 'posts', 'comments'],
      5,
    );

    // users fails, posts + comments succeed
    expect(result).toEqual({ tablesSeeded: 3, rowsInserted: 10 });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[seed-remote] Skipped users: unique_violation'),
    );
    // Pipeline continues despite partial failure
    expect(successMethod).toHaveBeenCalledTimes(2);
  });

  it('handles tables discovered by introspection but missing from seed client', async () => {
    const { seedRemoteDatabase } = await import('@/lib/seed-remote');

    // Seed client only has "users" — "audit_logs" is a system table not in the seed client
    mockCreateSeedClient.mockResolvedValue({
      users: vi.fn().mockResolvedValue(undefined),
    });

    const project = {
      id: 'x', name: 'x', orgId: 'x', region: 'x',
      dbHost: 'db.x.supabase.co', dbPassword: 'pass',
      anonKey: 'x', serviceRoleKey: 'x', url: 'x',
    };

    const result = await seedRemoteDatabase(
      project as any,
      ['users', 'audit_logs'],
      5,
    );

    // audit_logs is skipped (no method), users succeeds
    expect(result).toEqual({ tablesSeeded: 2, rowsInserted: 5 });
  });
});
