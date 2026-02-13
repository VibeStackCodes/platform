import type { Sandbox } from '@daytonaio/sdk';
import { runCommand } from './sandbox';
import { getOpenAIClient, FIX_MODEL } from './openai-client';
import { stripCodeFences } from './utils';

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

const MAX_FIX_ATTEMPTS = 5;

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
 * Apply a SQL migration to the sandbox-local PGlite instance.
 * Validates the migration SQL is correct Postgres. If it fails,
 * asks the LLM to fix the SQL and retries up to MAX_FIX_ATTEMPTS times.
 */
export async function applyLocalMigration(
  sandbox: Sandbox,
  migrationSQL: string,
  model: string = FIX_MODEL,
): Promise<string> {
  let currentSQL = migrationSQL;
  const errorHistory: string[] = [];

  for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) {
    const error = await runMigrationInPGlite(sandbox, currentSQL);

    if (!error) {
      console.log(`[local-supabase] Migration validated successfully via PGlite${attempt > 0 ? ` (fixed after ${attempt} attempt(s))` : ''}`);
      return currentSQL;
    }

    errorHistory.push(error);
    console.warn(`[local-supabase] Migration attempt ${attempt + 1} failed: ${error}`);

    if (attempt === MAX_FIX_ATTEMPTS - 1) {
      throw new Error(`Local migration failed after ${MAX_FIX_ATTEMPTS} attempts: ${error}`);
    }

    // Ask LLM to fix the SQL with full error history
    currentSQL = await fixMigrationSQL(currentSQL, errorHistory, model);
  }

  return currentSQL; // unreachable but satisfies TS
}

/**
 * Run migration SQL in PGlite and return the error message (or null on success)
 */
async function runMigrationInPGlite(
  sandbox: Sandbox,
  migrationSQL: string,
): Promise<string | null> {
  const script = `
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(${JSON.stringify(AUTH_STUBS)});
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
 * Ask the LLM to fix a broken migration SQL.
 * Includes full error history so the LLM doesn't repeat previous mistakes.
 */
async function fixMigrationSQL(
  sql: string,
  errorHistory: string[],
  model: string,
): Promise<string> {
  const client = getOpenAIClient();

  const historySection = errorHistory.length > 1
    ? `\nPREVIOUS ERRORS (do NOT repeat these mistakes):\n${errorHistory.map((e, i) => `  Attempt ${i + 1}: ${e}`).join('\n')}\n`
    : '';

  const response = await client.responses.create({
    model,
    input: [{
      role: 'user',
      content: `Fix this PostgreSQL migration SQL. It failed with: ${errorHistory[errorHistory.length - 1]}
${historySection}
MIGRATION SQL:
\`\`\`sql
${sql}
\`\`\`

Return ONLY the corrected SQL — no explanation, no markdown fences, just raw SQL.

CRITICAL RULES:
1. CREATE TABLES IN DEPENDENCY ORDER — if table B has a foreign key to table A, CREATE table A first
2. Do NOT duplicate column names in any CREATE TABLE statement
3. Do NOT use CREATE EXTENSION — gen_random_uuid() is built-in to PG16
4. auth.uid() is available and returns the current user's UUID
5. auth.users table already exists with columns: id (uuid), email (text), role (text)
6. Use REFERENCES auth.users(id) for user foreign keys
7. Every table should have: id uuid PRIMARY KEY DEFAULT gen_random_uuid()
8. Return the COMPLETE migration — do not omit any tables, RLS policies, or seed data`,
    }],
  });

  const fixed = stripCodeFences(response.output_text);
  console.log(`[local-supabase] LLM proposed fix (${fixed.length} chars)`);
  return fixed;
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
