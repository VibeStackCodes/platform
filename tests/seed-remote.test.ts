import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildConnectionString, seedRemoteDatabase } from '../lib/seed-remote';
import type { SupabaseProject } from '../lib/types';

// Mock @snaplet/seed module
vi.mock('@snaplet/seed', () => ({
  createSeedClient: vi.fn(),
}));

describe('seed-remote', () => {
  describe('buildConnectionString', () => {
    it('builds a valid postgres connection string', () => {
      const project: SupabaseProject = {
        id: 'test-id',
        name: 'test',
        orgId: 'org-1',
        region: 'us-east-1',
        dbHost: 'db.test-id.supabase.co',
        dbPassword: 'my-pass!@#',
        anonKey: 'anon-key',
        serviceRoleKey: 'service-key',
        url: 'https://test-id.supabase.co',
      };
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:my-pass!%40%23@db.test-id.supabase.co:5432/postgres');
    });

    it('handles simple passwords', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.x.supabase.co', dbPassword: 'simple',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      expect(buildConnectionString(project)).toContain('simple@');
    });

    it('handles empty password', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.example.com', dbPassword: '',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:@db.example.com:5432/postgres');
    });

    it('handles password with spaces', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.example.com', dbPassword: 'my secret pass',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:my%20secret%20pass@db.example.com:5432/postgres');
    });

    it('handles password with slashes', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.example.com', dbPassword: 'pass/with/slashes',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:pass%2Fwith%2Fslashes@db.example.com:5432/postgres');
    });

    it('handles password with colons', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.example.com', dbPassword: 'pass:with:colons',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:pass%3Awith%3Acolons@db.example.com:5432/postgres');
    });

    it('handles password with question marks', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.example.com', dbPassword: 'pass?with?questions',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:pass%3Fwith%3Fquestions@db.example.com:5432/postgres');
    });

    it('handles very long host names', () => {
      const longHost = 'db.very-long-subdomain-name-with-many-characters-and-hyphens.supabase.co';
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: longHost, dbPassword: 'pass',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      const connStr = buildConnectionString(project);
      expect(connStr).toBe(`postgresql://postgres:pass@${longHost}:5432/postgres`);
    });

    it('handles complex password with multiple special characters', () => {
      const project = {
        id: 'x', name: 'x', orgId: 'x', region: 'x',
        dbHost: 'db.example.com', dbPassword: 'P@ss:w/rd?2024#test',
        anonKey: 'x', serviceRoleKey: 'x', url: 'x',
      } as SupabaseProject;
      const connStr = buildConnectionString(project);
      expect(connStr).toBe('postgresql://postgres:P%40ss%3Aw%2Frd%3F2024%23test@db.example.com:5432/postgres');
    });
  });

  describe('seedRemoteDatabase', () => {
    let mockCreateSeedClient: any;
    let mockSeedClient: any;
    let mockTableMethod: any;
    let consoleWarnSpy: any;

    beforeEach(async () => {
      // Reset mocks
      vi.clearAllMocks();

      // Setup spy for console.warn
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create mock table method
      mockTableMethod = vi.fn().mockResolvedValue(undefined);

      // Create mock seed client with table methods
      mockSeedClient = {
        users: mockTableMethod,
        posts: mockTableMethod,
        comments: mockTableMethod,
      };

      // Get the mocked module
      const snapletSeed = await import('@snaplet/seed');
      mockCreateSeedClient = snapletSeed.createSeedClient as any;
      mockCreateSeedClient.mockResolvedValue(mockSeedClient);
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    const createMockProject = (): SupabaseProject => ({
      id: 'test-id',
      name: 'test',
      orgId: 'org-1',
      region: 'us-east-1',
      dbHost: 'db.test.supabase.co',
      dbPassword: 'password123',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-key',
      url: 'https://test.supabase.co',
    });

    it('calls createSeedClient with correct connection string', async () => {
      const project = createMockProject();
      await seedRemoteDatabase(project, ['users'], 3);

      expect(mockCreateSeedClient).toHaveBeenCalledWith({
        databaseUrl: 'postgresql://postgres:password123@db.test.supabase.co:5432/postgres',
      });
    });

    it('calls table methods with rowsPerTable count', async () => {
      const project = createMockProject();
      await seedRemoteDatabase(project, ['users', 'posts'], 10);

      expect(mockTableMethod).toHaveBeenCalledTimes(2);

      // Each call should invoke the method with a function that calls x(10)
      const firstCall = mockTableMethod.mock.calls[0][0];
      const mockX = vi.fn();
      firstCall(mockX);
      expect(mockX).toHaveBeenCalledWith(10);
    });

    it('uses default rowsPerTable of 5', async () => {
      const project = createMockProject();
      await seedRemoteDatabase(project, ['users']);

      expect(mockTableMethod).toHaveBeenCalledTimes(1);

      const firstCall = mockTableMethod.mock.calls[0][0];
      const mockX = vi.fn();
      firstCall(mockX);
      expect(mockX).toHaveBeenCalledWith(5);
    });

    it('returns correct counts when all tables are seeded', async () => {
      const project = createMockProject();
      const result = await seedRemoteDatabase(project, ['users', 'posts', 'comments'], 7);

      expect(result).toEqual({
        tablesSeeded: 3,
        rowsInserted: 21, // 3 tables * 7 rows each
      });
    });

    it('skips tables where method does not exist', async () => {
      const project = createMockProject();
      const result = await seedRemoteDatabase(
        project,
        ['users', 'non_existent_table', 'posts'],
        5
      );

      // Should only call methods for users and posts
      expect(mockTableMethod).toHaveBeenCalledTimes(2);

      // Total tables count includes non-existent, but rows only from successful ones
      expect(result).toEqual({
        tablesSeeded: 3, // All 3 table names
        rowsInserted: 10, // Only 2 tables * 5 rows each
      });
    });

    it('handles errors gracefully and continues to next table', async () => {
      const project = createMockProject();

      // Make one table method throw an error
      const errorTableMethod = vi.fn().mockRejectedValue(new Error('Database constraint violation'));
      mockSeedClient.users = errorTableMethod;

      const result = await seedRemoteDatabase(project, ['users', 'posts'], 5);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[seed-remote] Skipped users: Database constraint violation')
      );

      // Should still try posts
      expect(mockTableMethod).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        tablesSeeded: 2, // Both table names
        rowsInserted: 5, // Only posts succeeded with 5 rows
      });
    });

    it('handles non-Error objects in catch block', async () => {
      const project = createMockProject();

      const errorTableMethod = vi.fn().mockRejectedValue('String error');
      mockSeedClient.users = errorTableMethod;

      await seedRemoteDatabase(project, ['users'], 5);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[seed-remote] Skipped users: String error')
      );
    });

    it('returns zero counts for empty tableNames', async () => {
      const project = createMockProject();
      const result = await seedRemoteDatabase(project, [], 5);

      expect(mockTableMethod).not.toHaveBeenCalled();
      expect(result).toEqual({
        tablesSeeded: 0,
        rowsInserted: 0,
      });
    });

    it('handles table method that is not a function', async () => {
      const project = createMockProject();

      // Set a non-function value
      mockSeedClient.users = 'not a function';

      const result = await seedRemoteDatabase(project, ['users', 'posts'], 5);

      // Should skip users since it's not a function
      expect(mockTableMethod).toHaveBeenCalledTimes(1); // Only posts
      expect(result).toEqual({
        tablesSeeded: 2,
        rowsInserted: 5, // Only posts
      });
    });

    it('handles multiple errors across different tables', async () => {
      const project = createMockProject();

      const error1 = vi.fn().mockRejectedValue(new Error('Error 1'));
      const error2 = vi.fn().mockRejectedValue(new Error('Error 2'));

      mockSeedClient.users = error1;
      mockSeedClient.comments = error2;

      const result = await seedRemoteDatabase(
        project,
        ['users', 'posts', 'comments'],
        3
      );

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[seed-remote] Skipped users: Error 1')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[seed-remote] Skipped comments: Error 2')
      );

      expect(result).toEqual({
        tablesSeeded: 3,
        rowsInserted: 3, // Only posts succeeded
      });
    });
  });
});
