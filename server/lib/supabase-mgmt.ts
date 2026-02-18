/**
 * Supabase Management API Client
 *
 * Handles project creation, schema setup, and management operations
 * via the Supabase Management API (api.supabase.com/v1)
 */

import { SupabaseManagementAPI } from 'supabase-management-js'
import type { SupabaseProject, SupabaseSchema } from './types'

// ============================================================================
// Internal API Response Types
// ============================================================================

/**
 * Raw response from Supabase Management API /projects endpoint
 */
interface SupabaseAPIProject {
  id: string
  name: string
  organization_id: string
  region: string
  database: {
    host: string
    version: string
  }
  status: string // "ACTIVE_HEALTHY", "COMING_UP", etc.
  created_at: string
}

/**
 * Database schema for migration execution (different from SupabaseSchema in types.ts)
 */
export interface DatabaseSchema {
  tables: Array<{
    name: string
    columns: Array<{
      name: string
      type: string
      nullable?: boolean
      default?: string
    }>
    rls?: {
      enabled: boolean
      policies?: Array<{
        name: string
        definition: string
      }>
    }
  }>
  functions?: Array<{
    name: string
    sql: string
  }>
  seed?: string
}

/**
 * Result of a SQL migration execution
 */
export interface MigrationResult {
  success: boolean
  error?: string
  executedAt: string
}

// ============================================================================
// SDK Client Singleton
// ============================================================================

let _client: SupabaseManagementAPI | null = null

/**
 * Get or create the Supabase Management API client
 */
function getClient(): SupabaseManagementAPI {
  if (!_client) {
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN
    if (!accessToken) {
      throw new Error('SUPABASE_ACCESS_TOKEN environment variable is required')
    }
    _client = new SupabaseManagementAPI({ accessToken })
  }
  return _client
}

// ============================================================================
// Management API Helper (Legacy)
// ============================================================================

/**
 * Helper function for authenticated requests to Supabase Management API
 * @deprecated Use getClient() for supported operations
 * Kept for operations not yet supported by the SDK and for test compatibility
 */
export async function mgmtFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('SUPABASE_ACCESS_TOKEN environment variable is required')
  }

  const url = `https://api.supabase.com/v1${path}`
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  return response
}

// ============================================================================
// Project Management
// ============================================================================

/**
 * Wait for a Supabase project to reach ACTIVE_HEALTHY status with exponential backoff
 *
 * @param projectId - Supabase project ID
 * @param maxWaitMs - Maximum time to wait (default: 5 minutes)
 */
async function waitForProjectReady(projectId: string, maxWaitMs: number = 300_000): Promise<void> {
  const startTime = Date.now()
  let delay = 1000 // Start at 1s
  const maxDelay = 15_000 // Cap at 15s
  let consecutiveFailures = 0

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, delay))

    try {
      const statusResponse = await mgmtFetch(`/projects/${projectId}`)
      if (!statusResponse.ok) {
        consecutiveFailures++
        if (consecutiveFailures >= 5) {
          throw new Error(`Supabase project ${projectId} status check failed 5 times consecutively`)
        }
      } else {
        consecutiveFailures = 0 // Reset on success
        const project = (await statusResponse.json()) as SupabaseAPIProject
        console.log(`[supabase-mgmt] Project status: ${project.status}`)

        if (project.status === 'ACTIVE_HEALTHY') {
          return
        }

        if (project.status.includes('ERROR') || project.status.includes('FAILED')) {
          throw new Error(`Project creation failed with status: ${project.status}`)
        }
      }
    } catch (error) {
      // Retry on transient errors (57P03, TLS, ECONNRESET)
      const msg = error instanceof Error ? error.message : String(error)
      if (
        msg.includes('57P03') ||
        msg.includes('TLS') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ECONNREFUSED')
      ) {
        consecutiveFailures++
        if (consecutiveFailures >= 5) throw error
      } else {
        throw error // Non-transient error, don't retry
      }
    }

    // Exponential backoff with jitter
    delay = Math.min(delay * 2 + Math.random() * 500, maxDelay)
  }

  throw new Error(`Supabase project ${projectId} not ready after ${maxWaitMs / 1000}s`)
}

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
  region: string = 'us-east-1',
  dbPassword?: string,
  plan: string = 'free',
): Promise<SupabaseProject> {
  const client = getClient()
  const orgId = process.env.SUPABASE_E2E_ORG_ID || process.env.SUPABASE_ORG_ID
  if (!orgId) {
    throw new Error('SUPABASE_ORG_ID environment variable is required')
  }

  // Generate a secure password if not provided
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const password =
    dbPassword ||
    Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => chars[b % chars.length]).join('')

  // Sanitize project name (Supabase requires lowercase alphanumeric + hyphens)
  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63)

  // Create the project using SDK
  type CreateProjectParams = Parameters<typeof client.createProject>[0]
  const project = await client.createProject({
    name: sanitizedName,
    organization_id: orgId,
    region: region as CreateProjectParams['region'],
    plan: plan as CreateProjectParams['plan'],
    db_pass: password,
  })

  if (!project) {
    throw new Error('Failed to create Supabase project: No response from SDK')
  }

  console.log(`[supabase-mgmt] Created project ${project.id}, waiting for ACTIVE_HEALTHY status...`)

  // Wait for project to be ready with exponential backoff
  await waitForProjectReady(project.id)

  // Fetch API keys using SDK
  const keys = await client.getProjectApiKeys(project.id)
  if (!keys) {
    throw new Error('Failed to fetch API keys from SDK')
  }

  const anonKey = keys.find((k) => k.name === 'anon')?.api_key
  const serviceRoleKey = keys.find((k) => k.name === 'service_role')?.api_key

  if (!anonKey || !serviceRoleKey) {
    throw new Error('Failed to retrieve API keys from project')
  }

  // Fetch final project details
  const statusResponse = await mgmtFetch(`/projects/${project.id}`)
  if (!statusResponse.ok) {
    throw new Error(`Failed to fetch final project details: ${await statusResponse.text()}`)
  }
  const currentProject = (await statusResponse.json()) as SupabaseAPIProject

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
  }
}

/**
 * Update the Supabase Auth configuration for a project.
 * Must be called after the Vercel URL is known (post-deployment).
 *
 * Sets SITE_URL so confirmation/magic-link emails redirect to the live app
 * instead of the default http://localhost:3000.
 */
export async function updateAuthConfig(projectId: string, siteUrl: string): Promise<void> {
  const response = await mgmtFetch(`/projects/${projectId}/config/auth`, {
    method: 'PATCH',
    body: JSON.stringify({
      site_url: siteUrl,
      additional_redirect_urls: siteUrl,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to update auth config for project ${projectId}: ${body}`)
  }

  console.log(`[supabase-mgmt] Auth config updated for ${projectId}: SITE_URL=${siteUrl}`)
}

/**
 * Delete a Supabase project
 */
export async function deleteSupabaseProject(projectId: string): Promise<void> {
  const client = getClient()

  await client.deleteProject(projectId)

  console.log(`[supabase-mgmt] Deleted project ${projectId}`)
}

// ============================================================================
// Schema Management
// ============================================================================

// Circuit breaker for migrations
let migrationFailureCount = 0
const MAX_CONSECUTIVE_MIGRATION_FAILURES = 3

/**
 * Run a SQL migration against a Supabase project
 *
 * @param projectId - Supabase project ID
 * @param sql - SQL migration to execute
 */
export async function runMigration(projectId: string, sql: string): Promise<MigrationResult> {
  const client = getClient()

  try {
    await client.runQuery(projectId, sql)

    // Reset circuit breaker on success
    migrationFailureCount = 0

    return {
      success: true,
      executedAt: new Date().toISOString(),
    }
  } catch (error) {
    migrationFailureCount++
    if (migrationFailureCount >= MAX_CONSECUTIVE_MIGRATION_FAILURES) {
      throw new Error(
        `Circuit breaker: ${migrationFailureCount} consecutive migration failures. Last error: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error },
      )
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      executedAt: new Date().toISOString(),
    }
  }
}

/**
 * Regex for safe SQL identifiers (table names, bucket names, etc.)
 */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_-]*$/

/**
 * Complete schema setup: migrations, RLS policies, seed data, and realtime
 *
 * @param projectId - Supabase project ID
 * @param schema - Database schema definition
 */
export async function setupSchema(
  projectId: string,
  schema: DatabaseSchema | SupabaseSchema,
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = []

  // Handle SupabaseSchema (raw SQL from planner)
  if ('migrationSQL' in schema) {
    const s = schema as SupabaseSchema
    results.push(await runMigration(projectId, s.migrationSQL))
    if (s.rls) {
      results.push(await runMigration(projectId, s.rls))
    }
    if (s.seedSQL) {
      results.push(await runMigration(projectId, s.seedSQL))
    }
    for (const table of s.realtimeTables) {
      // Validate table name to prevent SQL injection
      if (!SAFE_IDENTIFIER.test(table)) {
        console.error(`[supabase-mgmt] Invalid table name for realtime: ${table}`)
        results.push({
          success: false,
          error: `Invalid table name: ${table}`,
          executedAt: new Date().toISOString(),
        })
        continue
      }
      results.push(
        await runMigration(projectId, `ALTER PUBLICATION supabase_realtime ADD TABLE ${table};`),
      )
    }
    for (const bucket of s.storageBuckets) {
      // Validate bucket name to prevent SQL injection
      if (!SAFE_IDENTIFIER.test(bucket)) {
        console.error(`[supabase-mgmt] Invalid bucket name: ${bucket}`)
        results.push({
          success: false,
          error: `Invalid bucket name: ${bucket}`,
          executedAt: new Date().toISOString(),
        })
        continue
      }
      // Escape single quotes in bucket name (defense in depth)
      const escapedBucket = bucket.replace(/'/g, "''")
      results.push(
        await runMigration(
          projectId,
          `INSERT INTO storage.buckets (id, name, public) VALUES ('${escapedBucket}', '${escapedBucket}', true) ON CONFLICT DO NOTHING;`,
        ),
      )
    }
    console.log(`[supabase-mgmt] Schema setup complete for project ${projectId}`)
    return results
  }

  // Handle structured DatabaseSchema
  // 1. Create tables
  for (const table of schema.tables) {
    // Validate table name to prevent SQL injection
    if (!SAFE_IDENTIFIER.test(table.name)) {
      results.push({ success: false, error: `Invalid table name: ${table.name}`, executedAt: new Date().toISOString() })
      continue
    }

    const columns = table.columns
      .map(
        (col: { name: string; type: string; nullable?: boolean; default?: string }) => {
          // Validate column name and type
          if (!SAFE_IDENTIFIER.test(col.name)) {
            throw new Error(`Invalid column name: ${col.name}`)
          }
          if (!/^[a-z_][a-z0-9_() ]*$/i.test(col.type)) {
            throw new Error(`Invalid column type: ${col.type}`)
          }
          return `${col.name} ${col.type}${col.nullable === false ? ' NOT NULL' : ''}${
            col.default ? ` DEFAULT ${col.default}` : ''
          }`
        },
      )
      .join(', ')

    const createTableSql = `CREATE TABLE IF NOT EXISTS ${table.name} (${columns});`
    const result = await runMigration(projectId, createTableSql)
    results.push(result)

    // 2. Enable RLS if specified
    if (table.rls?.enabled) {
      const rlsSql = `ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`
      const rlsResult = await runMigration(projectId, rlsSql)
      results.push(rlsResult)

      // Create policies
      if (table.rls.policies) {
        for (const policy of table.rls.policies) {
          const policyResult = await runMigration(projectId, policy.definition)
          results.push(policyResult)
        }
      }
    }
  }

  // 3. Create functions
  if (schema.functions) {
    for (const func of schema.functions) {
      const result = await runMigration(projectId, func.sql)
      results.push(result)
    }
  }

  // 4. Run seed data
  if (schema.seed) {
    const seedResult = await runMigration(projectId, schema.seed)
    results.push(seedResult)
  }

  // 5. Enable realtime for all tables (names already validated above)
  const realtimeSql = schema.tables
    .filter((table: { name: string }) => SAFE_IDENTIFIER.test(table.name))
    .map(
      (table: { name: string }) => `ALTER PUBLICATION supabase_realtime ADD TABLE ${table.name};`,
    )
    .join('\n')

  if (realtimeSql) {
    const realtimeResult = await runMigration(projectId, realtimeSql)
    results.push(realtimeResult)
  }

  console.log(`[supabase-mgmt] Schema setup complete for project ${projectId}`)
  return results
}
