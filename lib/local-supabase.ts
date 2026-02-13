import type { Sandbox } from '@daytonaio/sdk';
import { runCommand } from './sandbox';

/**
 * Local Supabase Helper
 *
 * Uses PGlite (Supabase's embedded WASM Postgres) to validate migrations
 * inside the sandbox. No system-level Postgres installation needed.
 *
 * PGlite runs in-process via Node/Bun — <3MB, supports pgcrypto + uuid-ossp.
 */

/**
 * Apply a SQL migration to the sandbox-local PGlite instance.
 * Validates the migration SQL is correct Postgres, then writes it to disk
 * so the generated app can reference it.
 */
export async function applyLocalMigration(
  sandbox: Sandbox,
  migrationSQL: string,
): Promise<void> {
  // Write migration to a temp Node script that runs PGlite in the sandbox
  const script = `
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(\`CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\`);
  await db.exec(${JSON.stringify(migrationSQL)});
  console.log('MIGRATION_OK');
} catch (e) {
  console.error('MIGRATION_ERROR:', e.message);
  process.exit(1);
} finally {
  await db.close();
}
`;

  await sandbox.fs.uploadFile(
    Buffer.from(script),
    '/tmp/run-migration.mjs'
  );

  const result = await runCommand(
    sandbox,
    'bun /tmp/run-migration.mjs',
    'apply-migration',
    { cwd: '/workspace', timeout: 30 }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Local migration failed: ${result.stdout}\n${result.stderr || ''}`);
  }

  console.log('[local-supabase] Migration validated successfully via PGlite');
}

/**
 * Read the local Supabase credentials from the sandbox's .env.local.
 * For local dev, these point to the cloud Supabase project (wired at deploy).
 */
export async function getLocalSupabaseCredentials(
  sandbox: Sandbox,
): Promise<{ url: string; anonKey: string; serviceRoleKey: string }> {
  const envContent = await sandbox.fs.downloadFile('/workspace/.env.local');
  const envStr = envContent.toString();

  const url = envStr.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim() || '';
  const anonKey = envStr.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim() || '';
  const serviceRoleKey = envStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim() || '';

  return { url, anonKey, serviceRoleKey };
}
