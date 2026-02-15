import type { Sandbox } from '@daytonaio/sdk';
import { runCommand } from './sandbox';

/**
 * Local Supabase Helper
 *
 * Uses PGlite (Supabase's embedded WASM Postgres) to validate migrations
 * inside the sandbox. No system-level Postgres installation needed.
 *
 * PGlite runs in-process via Node/Bun — <3MB, PG16 with gen_random_uuid() built-in.
 */

// Supabase auth stubs — PGlite is bare Postgres without auth schema
const AUTH_STUBS = `
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  role text DEFAULT 'authenticated'
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT gen_random_uuid() $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
`;

/**
 * Validate migration SQL without retry loops.
 * Throws an error if migration fails (contractToSQL bug).
 */
export async function validateMigration(
  sandbox: Sandbox,
  migrationSQL: string,
): Promise<void> {
  const error = await runMigrationInPGlite(sandbox, migrationSQL);
  if (error) {
    throw new Error(`Migration validation failed (contractToSQL bug): ${error}`);
  }
  console.log('[local-supabase] Migration validated successfully via PGlite');
}

/**
 * Run migration SQL in PGlite and return the error message (or null on success)
 */
async function runMigrationInPGlite(
  sandbox: Sandbox,
  migrationSQL: string,
): Promise<string | null> {
  // Strip CREATE EXTENSION statements — PGlite doesn't support extension management.
  // gen_random_uuid() is built-in to PGlite (PG16), so pgcrypto/uuid-ossp aren't needed.
  const cleanedSQL = migrationSQL.replace(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+[^;]+;/gi, '');
  const script = `
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(${JSON.stringify(AUTH_STUBS)});
  await db.exec(${JSON.stringify(cleanedSQL)});
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
    '/workspace/run-migration.mjs'
  );

  const result = await runCommand(
    sandbox,
    'bun /workspace/run-migration.mjs',
    'apply-migration',
    { cwd: '/workspace', timeout: 30 }
  );

  if (result.exitCode !== 0) {
    const output = `${result.stdout}\n${result.stderr || ''}`.trim();
    const match = output.match(/MIGRATION_ERROR:\s*(.+)/);
    return match?.[1] || output;
  }

  return null;
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
