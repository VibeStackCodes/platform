/**
 * Supabase Management API Client
 *
 * Handles project creation, schema setup, and management operations
 * via the Supabase Management API (api.supabase.com/v1)
 */

import type { SupabaseProject, SupabaseSchema } from "./types";

// ============================================================================
// Internal API Response Types
// ============================================================================

/**
 * Raw response from Supabase Management API /projects endpoint
 */
interface SupabaseAPIProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
  database: {
    host: string;
    version: string;
  };
  status: string; // "ACTIVE_HEALTHY", "COMING_UP", etc.
  created_at: string;
}

/**
 * Database schema for migration execution (different from SupabaseSchema in types.ts)
 */
export interface DatabaseSchema {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      default?: string;
    }>;
    rls?: {
      enabled: boolean;
      policies?: Array<{
        name: string;
        definition: string;
      }>;
    };
  }>;
  functions?: Array<{
    name: string;
    sql: string;
  }>;
  seed?: string;
}

/**
 * Result of a SQL migration execution
 */
export interface MigrationResult {
  success: boolean;
  error?: string;
  executedAt: string;
}

// ============================================================================
// Management API Helper
// ============================================================================

/**
 * Helper function for authenticated requests to Supabase Management API
 */
export async function mgmtFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN environment variable is required");
  }

  const url = `https://api.supabase.com/v1${path}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

// ============================================================================
// Project Management
// ============================================================================

/**
 * Create a new Supabase project and poll until it's ready (ACTIVE_HEALTHY)
 *
 * @param name - Project name (will be slugified)
 * @param region - AWS region (e.g., "us-east-1")
 * @param dbPassword - Database password (min 8 chars)
 * @param plan - Subscription plan ("free", "pro", etc.)
 * @returns Project details with credentials once ready
 */
export async function createSupabaseProject(
  name: string,
  region: string = "us-east-1",
  dbPassword?: string,
  plan: string = "free"
): Promise<SupabaseProject> {
  const orgId = process.env.SUPABASE_E2E_ORG_ID || process.env.SUPABASE_ORG_ID;
  if (!orgId) {
    throw new Error("SUPABASE_ORG_ID environment variable is required");
  }

  // Generate a secure password if not provided
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const password =
    dbPassword ||
    Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => chars[b % chars.length]).join("");

  // Sanitize project name (Supabase requires lowercase alphanumeric + hyphens)
  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);

  // Create the project
  const createResponse = await mgmtFetch("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: sanitizedName,
      organization_id: orgId,
      region,
      plan,
      db_pass: password,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create Supabase project: ${error}`);
  }

  const project: SupabaseAPIProject = await createResponse.json();
  console.log(`[supabase-mgmt] Created project ${project.id}, waiting for ACTIVE_HEALTHY status...`);

  // Poll until project is ready
  const maxAttempts = 60; // 5 minutes with 5s intervals
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const statusResponse = await mgmtFetch(`/projects/${project.id}`);
    if (!statusResponse.ok) {
      throw new Error(`Failed to check project status: ${await statusResponse.text()}`);
    }

    const currentProject: SupabaseAPIProject = await statusResponse.json();
    console.log(`[supabase-mgmt] Project status: ${currentProject.status} (attempt ${attempt + 1}/${maxAttempts})`);

    if (currentProject.status === "ACTIVE_HEALTHY") {
      // Fetch API keys
      const keysResponse = await mgmtFetch(`/projects/${project.id}/api-keys`);
      if (!keysResponse.ok) {
        throw new Error(`Failed to fetch API keys: ${await keysResponse.text()}`);
      }

      const keys = await keysResponse.json();
      const anonKey = keys.find((k: any) => k.name === "anon")?.api_key;
      const serviceRoleKey = keys.find((k: any) => k.name === "service_role")?.api_key;

      if (!anonKey || !serviceRoleKey) {
        throw new Error("Failed to retrieve API keys from project");
      }

      // Map to shared SupabaseProject type
      return {
        id: currentProject.id,
        name: currentProject.name,
        orgId: currentProject.organization_id,
        region: currentProject.region,
        dbHost: currentProject.database.host,
        dbPassword: password,
        anonKey,
        serviceRoleKey,
        url: `https://${currentProject.id}.supabase.co`,
      };
    }

    if (currentProject.status.includes("ERROR") || currentProject.status.includes("FAILED")) {
      throw new Error(`Project creation failed with status: ${currentProject.status}`);
    }
  }

  throw new Error("Project creation timed out waiting for ACTIVE_HEALTHY status");
}

/**
 * Delete a Supabase project
 */
export async function deleteSupabaseProject(projectId: string): Promise<void> {
  const response = await mgmtFetch(`/projects/${projectId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete project: ${error}`);
  }

  console.log(`[supabase-mgmt] Deleted project ${projectId}`);
}

// ============================================================================
// Schema Management
// ============================================================================

/**
 * Run a SQL migration against a Supabase project
 *
 * @param projectId - Supabase project ID
 * @param sql - SQL migration to execute
 */
export async function runMigration(
  projectId: string,
  sql: string
): Promise<MigrationResult> {
  try {
    const response = await mgmtFetch(`/projects/${projectId}/database/query`, {
      method: "POST",
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        success: false,
        error: `Migration failed: ${error}`,
        executedAt: new Date().toISOString(),
      };
    }

    return {
      success: true,
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      executedAt: new Date().toISOString(),
    };
  }
}

/**
 * Complete schema setup: migrations, RLS policies, seed data, and realtime
 *
 * @param projectId - Supabase project ID
 * @param schema - Database schema definition
 */
export async function setupSchema(
  projectId: string,
  schema: DatabaseSchema | SupabaseSchema
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  // Handle SupabaseSchema (raw SQL from planner)
  if ("migrationSQL" in schema) {
    const s = schema as SupabaseSchema;
    results.push(await runMigration(projectId, s.migrationSQL));
    if (s.rls) {
      results.push(await runMigration(projectId, s.rls));
    }
    if (s.seedSQL) {
      results.push(await runMigration(projectId, s.seedSQL));
    }
    for (const table of s.realtimeTables) {
      // Validate table name to prevent SQL injection
      if (!/^[a-z0-9_]+$/.test(table)) {
        console.error(`[supabase-mgmt] Invalid table name for realtime: ${table}`);
        results.push({
          success: false,
          error: `Invalid table name: ${table}`,
          executedAt: new Date().toISOString(),
        });
        continue;
      }
      results.push(await runMigration(projectId, `ALTER PUBLICATION supabase_realtime ADD TABLE ${table};`));
    }
    for (const bucket of s.storageBuckets) {
      // Validate bucket name to prevent SQL injection
      if (!/^[a-z0-9_]+$/.test(bucket)) {
        console.error(`[supabase-mgmt] Invalid bucket name: ${bucket}`);
        results.push({
          success: false,
          error: `Invalid bucket name: ${bucket}`,
          executedAt: new Date().toISOString(),
        });
        continue;
      }
      results.push(await runMigration(projectId, `INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', true) ON CONFLICT DO NOTHING;`));
    }
    console.log(`[supabase-mgmt] Schema setup complete for project ${projectId}`);
    return results;
  }

  // Handle structured DatabaseSchema
  // 1. Create tables
  for (const table of schema.tables) {
    const columns = table.columns
      .map(
        (col) =>
          `${col.name} ${col.type}${col.nullable === false ? " NOT NULL" : ""}${
            col.default ? ` DEFAULT ${col.default}` : ""
          }`
      )
      .join(", ");

    const createTableSql = `CREATE TABLE IF NOT EXISTS ${table.name} (${columns});`;
    const result = await runMigration(projectId, createTableSql);
    results.push(result);

    // 2. Enable RLS if specified
    if (table.rls?.enabled) {
      const rlsSql = `ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`;
      const rlsResult = await runMigration(projectId, rlsSql);
      results.push(rlsResult);

      // Create policies
      if (table.rls.policies) {
        for (const policy of table.rls.policies) {
          const policyResult = await runMigration(projectId, policy.definition);
          results.push(policyResult);
        }
      }
    }
  }

  // 3. Create functions
  if (schema.functions) {
    for (const func of schema.functions) {
      const result = await runMigration(projectId, func.sql);
      results.push(result);
    }
  }

  // 4. Run seed data
  if (schema.seed) {
    const seedResult = await runMigration(projectId, schema.seed);
    results.push(seedResult);
  }

  // 5. Enable realtime for all tables
  const realtimeSql = schema.tables
    .map((table) => `ALTER PUBLICATION supabase_realtime ADD TABLE ${table.name};`)
    .join("\n");

  if (realtimeSql) {
    const realtimeResult = await runMigration(projectId, realtimeSql);
    results.push(realtimeResult);
  }

  console.log(`[supabase-mgmt] Schema setup complete for project ${projectId}`);
  return results;
}
