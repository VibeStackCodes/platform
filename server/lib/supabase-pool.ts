/**
 * Warm Supabase Project Pool
 *
 * Maintains a pool of pre-provisioned Supabase projects that can be claimed instantly,
 * eliminating the 60-120s provisioning delay from the critical path.
 *
 * Architecture:
 * - Background replenishment keeps pool at target size
 * - Atomic claiming prevents race conditions
 * - Projects are reset (schema dropped) when released back to pool
 * - Pool size configurable via WARM_POOL_SIZE env var (default: 5)
 */

import { sql } from 'drizzle-orm'
import * as Sentry from '@sentry/node'
import { db } from './db/client'
import { createSupabaseProject, runMigration } from './supabase-mgmt'
import type { WarmSupabaseProject } from './db/schema'

// ============================================================================
// Types
// ============================================================================

export interface WarmProject {
  id: string
  supabaseProjectId: string
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  dbHost: string
  dbPassword: string
  region: string
  claimedBy: string | null
  claimedAt: Date | null
}

export interface PoolStatus {
  available: number
  claimed: number
  total: number
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_POOL_SIZE = 5
const POOL_SIZE = process.env.WARM_POOL_SIZE
  ? Number.parseInt(process.env.WARM_POOL_SIZE, 10)
  : DEFAULT_POOL_SIZE

// ============================================================================
// Pool Operations
// ============================================================================

/**
 * Claim a warm project from the pool
 * Uses atomic UPDATE with WHERE guards to prevent race conditions
 *
 * @param userId - User ID claiming the project
 * @returns WarmProject if available, null if pool is empty
 */
export async function claimWarmProject(userId: string): Promise<WarmProject | null> {
  try {
    // Atomic claim: UPDATE the first available project and return it
    const result = await db.execute(
      sql`UPDATE warm_supabase_projects
          SET status = 'claimed',
              claimed_by = ${userId},
              claimed_at = NOW()
          WHERE id = (
            SELECT id
            FROM warm_supabase_projects
            WHERE status = 'available'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0] as WarmSupabaseProject

    // Fire-and-forget: replenish pool in background after claim
    // This ensures the pool stays topped up without needing an external cron
    replenishPool().catch((error) => {
      console.error('[supabase-pool] Background replenishment failed:', error)
      Sentry.captureException(error, { tags: { operation: 'pool_replenish' } })
    })

    return {
      id: row.id,
      supabaseProjectId: row.supabaseProjectId,
      supabaseUrl: row.supabaseUrl,
      anonKey: row.anonKey,
      serviceRoleKey: row.serviceRoleKey,
      dbHost: row.dbHost,
      dbPassword: row.dbPassword,
      region: row.region,
      claimedBy: row.claimedBy,
      claimedAt: row.claimedAt,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // Table doesn't exist yet — expected when warm pool migration hasn't run
    // Drizzle wraps the error as "Failed query: UPDATE warm_supabase_projects..."
    if (msg.includes('does not exist') || msg.includes('warm_supabase_projects')) {
      console.warn('[supabase-pool] Warm pool table not found — falling back to cold creation')
    } else {
      console.error('[supabase-pool] Claim failed:', msg)
      Sentry.captureException(error, { tags: { operation: 'claim_project' } })
    }
    return null
  }
}

/**
 * Release a claimed project back to the pool
 * Resets the database schema to clean state before releasing
 *
 * @param supabaseProjectId - Supabase project ID to release
 */
export async function releaseProject(supabaseProjectId: string): Promise<void> {
  try {
    // Step 1: Reset the database schema
    const resetSQL = `
      -- Drop and recreate public schema (removes all tables, views, functions, policies)
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;

      -- Restore default grants
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
      GRANT USAGE ON SCHEMA public TO anon;
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT USAGE ON SCHEMA public TO service_role;

      -- Restore commonly needed extensions
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      -- Reset default privileges for future objects
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
    `

    const migrationResult = await runMigration(supabaseProjectId, resetSQL)

    if (!migrationResult.success) {
      const errorMsg = migrationResult.error || 'Schema reset failed'
      console.error(
        `[supabase-pool] Failed to reset schema for ${supabaseProjectId}:`,
        errorMsg,
      )
      // Mark as error instead of available if schema reset fails
      await db.execute(
        sql`UPDATE warm_supabase_projects
            SET status = 'error',
                error_message = ${errorMsg},
                claimed_by = NULL,
                claimed_at = NULL
            WHERE supabase_project_id = ${supabaseProjectId}`,
      )
      Sentry.captureException(new Error(errorMsg), {
        tags: { operation: 'schema_reset' },
        extra: { supabaseProjectId },
      })
      return
    }

    // Step 2: Release back to pool
    await db.execute(
      sql`UPDATE warm_supabase_projects
          SET status = 'available',
              claimed_by = NULL,
              claimed_at = NULL,
              error_message = NULL
          WHERE supabase_project_id = ${supabaseProjectId}`,
    )

    console.log(`[supabase-pool] Released project ${supabaseProjectId} back to pool`)
  } catch (error) {
    console.error(`[supabase-pool] Failed to release project ${supabaseProjectId}:`, error)
    Sentry.captureException(error, {
      tags: { operation: 'release_project' },
      extra: { supabaseProjectId },
    })
    throw error
  }
}

/**
 * Replenish the pool by creating new Supabase projects up to target size
 * Should be called by background job/cron
 *
 * Uses PostgreSQL advisory lock to prevent concurrent replenishment race conditions.
 *
 * @param targetSize - Target pool size (defaults to WARM_POOL_SIZE env var or 5)
 * @returns Summary of created projects and any errors
 */
export async function replenishPool(
  targetSize: number = POOL_SIZE,
): Promise<{ created: number; errors: string[] }> {
  try {
    // Try to acquire advisory lock (non-blocking)
    // Lock ID is a fixed constant — only one replenish can run at a time
    const REPLENISH_LOCK_ID = 42_424_242
    const lockResult = await db.execute(
      sql`SELECT pg_try_advisory_lock(${REPLENISH_LOCK_ID}) as acquired`,
    )
    const acquired = (lockResult.rows[0] as { acquired: boolean }).acquired
    if (!acquired) {
      console.log('[supabase-pool] Replenishment already in progress, skipping')
      return { created: 0, errors: [] }
    }

    try {
      // Count current available projects
      const statusResult = await db.execute(
        sql`SELECT COUNT(*) as count
            FROM warm_supabase_projects
            WHERE status = 'available'`,
      )

      const availableCount = Number((statusResult.rows[0] as { count: string }).count || '0')
      const needed = Math.max(0, targetSize - availableCount)

      if (needed === 0) {
        console.log(`[supabase-pool] Pool is full (${availableCount}/${targetSize})`)
        return { created: 0, errors: [] }
      }

      console.log(
        `[supabase-pool] Replenishing pool: ${availableCount}/${targetSize}, creating ${needed} projects...`,
      )

    const errors: string[] = []
    let created = 0

    // Create projects sequentially to avoid overwhelming the API
    for (let i = 0; i < needed; i++) {
      let placeholderId: string | undefined
      try {
        // Mark as creating first (so other replenish calls don't try to create the same slot)
        const placeholder = await db.execute(
          sql`INSERT INTO warm_supabase_projects (
                supabase_project_id,
                supabase_url,
                anon_key,
                service_role_key,
                db_host,
                db_password,
                region,
                status
              ) VALUES (
                'creating-' || gen_random_uuid()::text,
                'creating',
                'creating',
                'creating',
                'creating',
                'creating',
                'us-east-1',
                'creating'
              )
              RETURNING id`,
        )

        placeholderId = (placeholder.rows[0] as { id: string }).id

        // Create the actual Supabase project
        const timestamp = Date.now()
        const project = await createSupabaseProject(
          `vibestack-warm-${timestamp}`,
          'us-east-1',
          undefined,
          'free',
        )

        // Update the placeholder with real project details
        await db.execute(
          sql`UPDATE warm_supabase_projects
              SET supabase_project_id = ${project.id},
                  supabase_url = ${project.url},
                  anon_key = ${project.anonKey},
                  service_role_key = ${project.serviceRoleKey},
                  db_host = ${project.dbHost},
                  db_password = ${project.dbPassword},
                  region = ${project.region},
                  status = 'available',
                  error_message = NULL
              WHERE id = ${placeholderId}`,
        )

        created++
        console.log(
          `[supabase-pool] Created warm project ${created}/${needed}: ${project.id} (${project.url})`,
        )
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push(errorMsg)
        console.error(`[supabase-pool] Failed to create project ${i + 1}/${needed}:`, errorMsg)
        // Mark placeholder as 'error' so cleanupErrorProjects() can remove it
        if (placeholderId) {
          await db.execute(
            sql`UPDATE warm_supabase_projects SET status = 'error', error_message = ${errorMsg}
                WHERE id = ${placeholderId}`,
          ).catch(() => {}) // best-effort
        }
        Sentry.captureException(error, {
          tags: { operation: 'create_warm_project' },
          extra: { projectIndex: i + 1, needed },
        })
      }
    }

      console.log(
        `[supabase-pool] Replenishment complete: created ${created}/${needed}, errors: ${errors.length}`,
      )
      return { created, errors }
    } finally {
      // Always release the lock, even if replenishment throws
      await db.execute(sql`SELECT pg_advisory_unlock(${REPLENISH_LOCK_ID})`)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[supabase-pool] Replenishment failed:', errorMsg)
    Sentry.captureException(error, { tags: { operation: 'pool_replenish' } })
    return { created: 0, errors: [errorMsg] }
  }
}

/**
 * Get pool status for monitoring
 * @returns Count of available, claimed, and total projects
 */
export async function getPoolStatus(): Promise<PoolStatus> {
  try {
    const result = await db.execute(
      sql`SELECT
            COUNT(*) FILTER (WHERE status = 'available') as available,
            COUNT(*) FILTER (WHERE status = 'claimed') as claimed,
            COUNT(*) as total
          FROM warm_supabase_projects`,
    )

    const row = result.rows[0] as { available: string; claimed: string; total: string }

    return {
      available: Number(row.available || '0'),
      claimed: Number(row.claimed || '0'),
      total: Number(row.total || '0'),
    }
  } catch (error) {
    console.error('[supabase-pool] Failed to get pool status:', error)
    Sentry.captureException(error, { tags: { operation: 'get_pool_status' } })
    return { available: 0, claimed: 0, total: 0 }
  }
}

/**
 * Clean up zombie projects — claimed but abandoned (no generation completed).
 * Projects claimed more than `maxAgeMs` ago are released back to pool.
 *
 * @param maxAgeMs - Maximum age for claimed projects (default: 30 minutes)
 * @returns Summary of cleaned up projects
 */
export async function cleanupZombieProjects(
  maxAgeMs: number = 30 * 60 * 1000,
): Promise<{ released: number; errors: string[] }> {
  const errors: string[] = []
  let released = 0

  try {
    const cutoff = new Date(Date.now() - maxAgeMs)

    // Find zombie projects
    const result = await db.execute(
      sql`SELECT supabase_project_id
          FROM warm_supabase_projects
          WHERE status = 'claimed'
          AND claimed_at < ${cutoff.toISOString()}::timestamptz`,
    )

    if (result.rows.length === 0) {
      return { released: 0, errors: [] }
    }

    console.log(`[supabase-pool] Found ${result.rows.length} zombie projects to clean up`)

    // Release each zombie
    for (const row of result.rows) {
      const projectId = (row as { supabase_project_id: string }).supabase_project_id
      try {
        await releaseProject(projectId)
        released++
      } catch (error) {
        const msg = `Failed to release zombie ${projectId}: ${error instanceof Error ? error.message : String(error)}`
        errors.push(msg)
        Sentry.captureException(error, {
          tags: { operation: 'zombie_cleanup' },
          extra: { supabaseProjectId: projectId },
        })
      }
    }

    console.log(`[supabase-pool] Zombie cleanup: released ${released}, errors: ${errors.length}`)
    return { released, errors }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, { tags: { operation: 'zombie_cleanup' } })
    return { released: 0, errors: [msg] }
  }
}

/**
 * Remove projects in error state from the pool (they're unusable).
 * Note: Does NOT delete the actual Supabase project — just removes from pool tracking.
 */
export async function cleanupErrorProjects(): Promise<number> {
  try {
    const result = await db.execute(
      sql`DELETE FROM warm_supabase_projects
          WHERE status = 'error'
          RETURNING id`,
    )
    const count = result.rows.length
    if (count > 0) {
      console.log(`[supabase-pool] Removed ${count} error projects from pool`)
    }
    return count
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'cleanup_errors' } })
    return 0
  }
}
