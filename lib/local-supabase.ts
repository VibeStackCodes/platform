import type { Sandbox } from '@daytonaio/sdk';
import { runCommand } from './sandbox';

/**
 * Local Supabase Helper
 *
 * Utilities for interacting with the sandbox-local Postgres instance.
 * The sandbox snapshot includes a pre-installed Postgres server on localhost:5432.
 */

/**
 * Apply a SQL migration to the sandbox-local Postgres.
 * Postgres is pre-installed in the snapshot and running on localhost:5432.
 */
export async function applyLocalMigration(
  sandbox: Sandbox,
  migrationSQL: string,
): Promise<void> {
  // Write migration to temp file (avoids shell escaping issues)
  await sandbox.fs.uploadFile(
    Buffer.from(migrationSQL),
    '/tmp/migration.sql'
  );

  const result = await runCommand(
    sandbox,
    'psql -h localhost -U postgres -d app -f /tmp/migration.sql',
    'apply-migration',
    { cwd: '/workspace', timeout: 30 }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Local migration failed: ${result.stdout}\n${result.stderr || ''}`);
  }

  console.log('[local-supabase] Migration applied successfully');
}

/**
 * Read the local Supabase credentials from the sandbox's .env.local.
 * These are generated at snapshot boot time by supabase-init.sh.
 */
export async function getLocalSupabaseCredentials(
  sandbox: Sandbox,
): Promise<{ url: string; anonKey: string; serviceRoleKey: string }> {
  const envContent = await sandbox.fs.downloadFile('/workspace/.env.local');
  const envStr = envContent.toString();

  const url = envStr.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim() || 'http://localhost:3001';
  const anonKey = envStr.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim() || '';
  const serviceRoleKey = envStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() || '';

  return { url, anonKey, serviceRoleKey };
}
