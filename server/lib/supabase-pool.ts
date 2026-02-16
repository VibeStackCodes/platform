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
    console.error('[supabase-pool] Claim failed:', error)
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
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `

    const migrationResult = await runMigration(supabaseProjectId, resetSQL)

    if (!migrationResult.success) {
      console.error(
        `[supabase-pool] Failed to reset schema for ${supabaseProjectId}:`,
        migrationResult.error,
      )
      // Mark as error instead of available if schema reset fails
      await db.execute(
        sql`UPDATE warm_supabase_projects
            SET status = 'error',
                error_message = ${migrationResult.error || 'Schema reset failed'},
                claimed_by = NULL,
                claimed_at = NULL
            WHERE supabase_project_id = ${supabaseProjectId}`,
      )
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
    throw error
  }
}

/**
 * Replenish the pool by creating new Supabase projects up to target size
 * Should be called by background job/cron
 *
 * @param targetSize - Target pool size (defaults to WARM_POOL_SIZE env var or 5)
 * @returns Summary of created projects and any errors
 */
export async function replenishPool(
  targetSize: number = POOL_SIZE,
): Promise<{ created: number; errors: string[] }> {
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

        const placeholderId = (placeholder.rows[0] as { id: string }).id

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
      }
    }

    console.log(
      `[supabase-pool] Replenishment complete: created ${created}/${needed}, errors: ${errors.length}`,
    )
    return { created, errors }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[supabase-pool] Replenishment failed:', errorMsg)
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
    return { available: 0, claimed: 0, total: 0 }
  }
}
