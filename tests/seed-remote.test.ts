import { describe, it, expect } from 'vitest';
import { buildConnectionString } from '../lib/seed-remote';
import type { SupabaseProject } from '../lib/types';

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
  });
});
