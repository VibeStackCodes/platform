/**
 * Admin API Routes
 *
 * Provides system monitoring and management endpoints.
 * All routes require authentication + admin role.
 *
 * Endpoints:
 * - GET  /api/admin/health     — System health check (DB, pool, env vars)
 * - GET  /api/admin/pool       — Warm Supabase pool status + metrics
 * - POST /api/admin/pool/replenish — Manually trigger pool replenishment
 * - POST /api/admin/pool/cleanup   — Clean up zombie + error projects
 * - GET  /api/admin/env-check  — Verify required environment variables
 */

import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from '../lib/db/client'
import { authMiddleware } from '../middleware/auth'
import { createRateLimiter } from '../lib/rate-limit'

export const adminRoutes = new Hono()

// Auth middleware for all admin routes
adminRoutes.use('*', authMiddleware)

// Admin guard — check if user has admin role
// For now, check against ADMIN_USER_IDS env var (comma-separated UUIDs)
adminRoutes.use('*', async (c, next) => {
  const user = c.var.user
  const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)

  if (adminIds.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return c.json({ error: 'Admin endpoints disabled — ADMIN_USER_IDS not configured' }, 503)
    }
    // Dev mode: allow any authenticated user
    return next()
  }

  if (!adminIds.includes(user.id)) {
    return c.json({ error: 'Forbidden — admin access required' }, 403)
  }

  return next()
})

// Rate limit admin routes: 10 requests per minute
adminRoutes.use('*', createRateLimiter({ windowMs: 60_000, max: 10, prefix: 'admin' }))

/**
 * GET /api/admin/health
 * Comprehensive system health check
 */
adminRoutes.get('/health', async (c) => {
  const checks: Record<string, { status: 'ok' | 'error' | 'warning'; details?: string }> = {}

  // 1. Database connectivity
  try {
    const start = Date.now()
    await db.execute(sql`SELECT 1`)
    const latency = Date.now() - start
    checks.database = { status: 'ok', details: `${latency}ms latency` }
  } catch (error) {
    checks.database = { status: 'error', details: error instanceof Error ? error.message : 'Connection failed' }
  }

  // 2. Warm Supabase pool
  try {
    const { getPoolStatus } = await import('../lib/supabase-pool')
    const pool = await getPoolStatus()
    const poolSize = Number(process.env.WARM_POOL_SIZE || '5')

    if (pool.available === 0) {
      checks.warm_pool = { status: 'warning', details: `Pool empty (0/${poolSize} available, ${pool.claimed} claimed)` }
    } else {
      checks.warm_pool = { status: 'ok', details: `${pool.available}/${poolSize} available, ${pool.claimed} claimed` }
    }
  } catch (error) {
    checks.warm_pool = { status: 'error', details: error instanceof Error ? error.message : 'Pool check failed' }
  }

  // 3. Daytona connectivity
  try {
    const { getDaytonaClient } = await import('../lib/sandbox')
    const daytona = getDaytonaClient()
    // Quick list call to verify API connectivity (limit 1 result)
    const start = Date.now()
    await daytona.list({}, 1, 1)
    const latency = Date.now() - start
    checks.daytona = { status: 'ok', details: `${latency}ms latency` }
  } catch (error) {
    checks.daytona = {
      status: process.env.DAYTONA_API_KEY ? 'error' : 'warning',
      details: error instanceof Error ? error.message : 'Connection failed',
    }
  }

  // 4. Rate limit table cleanup (housekeeping)
  try {
    const { cleanupExpiredRateLimits } = await import('../lib/rate-limit')
    const cleaned = await cleanupExpiredRateLimits()
    checks.rate_limits = { status: 'ok', details: `${cleaned} expired entries cleaned` }
  } catch {
    checks.rate_limits = { status: 'warning', details: 'Cleanup failed' }
  }

  // 5. Required env vars
  const requiredVars = [
    'DATABASE_URL',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'OPENAI_API_KEY',
    'DAYTONA_API_KEY',
    'DAYTONA_SNAPSHOT_ID',
    'VERCEL_TOKEN',
    'GITHUB_APP_ID',
    'GITHUB_APP_PRIVATE_KEY',
    'STRIPE_SECRET_KEY',
  ]
  const missingVars = requiredVars.filter(v => !process.env[v])
  if (missingVars.length === 0) {
    checks.env_vars = { status: 'ok', details: `All ${requiredVars.length} required vars set` }
  } else {
    checks.env_vars = { status: 'error', details: `Missing: ${missingVars.join(', ')}` }
  }

  // Overall status
  const hasErrors = Object.values(checks).some(c => c.status === 'error')
  const hasWarnings = Object.values(checks).some(c => c.status === 'warning')
  const overallStatus = hasErrors ? 'error' : hasWarnings ? 'degraded' : 'healthy'

  return c.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  }, hasErrors ? 503 : 200)
})

/**
 * GET /api/admin/pool
 * Detailed warm pool status
 */
adminRoutes.get('/pool', async (c) => {
  try {
    const { getPoolStatus } = await import('../lib/supabase-pool')
    const status = await getPoolStatus()
    const targetSize = Number(process.env.WARM_POOL_SIZE || '5')

    // Get detailed breakdown
    const detailed = await db.execute(
      sql`SELECT
            status,
            COUNT(*)::int as count,
            MIN(created_at) as oldest,
            MAX(created_at) as newest
          FROM warm_supabase_projects
          GROUP BY status
          ORDER BY status`,
    )

    return c.json({
      summary: { ...status, targetSize },
      breakdown: detailed.rows,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Failed to get pool status' }, 500)
  }
})

/**
 * POST /api/admin/pool/replenish
 * Manually trigger pool replenishment
 */
adminRoutes.post('/pool/replenish', async (c) => {
  try {
    const { replenishPool } = await import('../lib/supabase-pool')
    const result = await replenishPool()
    return c.json({
      success: true,
      created: result.created,
      errors: result.errors,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Replenishment failed' }, 500)
  }
})

/**
 * POST /api/admin/pool/cleanup
 * Clean up zombie and error projects
 */
adminRoutes.post('/pool/cleanup', async (c) => {
  try {
    const { cleanupZombieProjects, cleanupErrorProjects } = await import('../lib/supabase-pool')

    const [zombieResult, errorCount] = await Promise.all([
      cleanupZombieProjects(),
      cleanupErrorProjects(),
    ])

    return c.json({
      success: true,
      zombiesReleased: zombieResult.released,
      errorsRemoved: errorCount,
      errors: zombieResult.errors,
    })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Cleanup failed' }, 500)
  }
})

/**
 * GET /api/admin/env-check
 * Verify all required and optional environment variables
 */
adminRoutes.get('/env-check', async (c) => {
  const required = [
    { name: 'DATABASE_URL', purpose: 'PostgreSQL connection' },
    { name: 'VITE_SUPABASE_URL', purpose: 'Platform Supabase' },
    { name: 'VITE_SUPABASE_ANON_KEY', purpose: 'Platform Supabase auth' },
    { name: 'SUPABASE_ACCESS_TOKEN', purpose: 'Supabase Management API' },
    { name: 'SUPABASE_ORG_ID', purpose: 'Generated Supabase projects org' },
    { name: 'OPENAI_API_KEY', purpose: 'OpenAI / GPT models' },
    { name: 'DAYTONA_API_KEY', purpose: 'Daytona sandbox API' },
    { name: 'DAYTONA_SNAPSHOT_ID', purpose: 'Sandbox base image' },
    { name: 'VERCEL_TOKEN', purpose: 'Vercel deployment' },
    { name: 'GITHUB_APP_ID', purpose: 'GitHub App for repos' },
    { name: 'GITHUB_APP_PRIVATE_KEY', purpose: 'GitHub App auth' },
    { name: 'GITHUB_APP_INSTALLATION_ID', purpose: 'GitHub App install' },
    { name: 'GITHUB_ORG', purpose: 'Org for generated repos' },
    { name: 'STRIPE_SECRET_KEY', purpose: 'Stripe payments' },
    { name: 'STRIPE_WEBHOOK_SECRET', purpose: 'Stripe webhook validation' },
  ]

  const optional = [
    { name: 'WARM_POOL_SIZE', purpose: 'Warm pool target size (default: 5)' },
    { name: 'VERCEL_TEAM_ID', purpose: 'Vercel team for deployments' },
    { name: 'VERCEL_WILDCARD_DOMAIN', purpose: 'Custom domain for generated apps' },
    { name: 'HELICONE_API_KEY', purpose: 'LLM observability proxy' },
    { name: 'SENTRY_DSN', purpose: 'Server error tracking' },
    { name: 'VITE_SENTRY_DSN', purpose: 'Client error tracking' },
    { name: 'ANTHROPIC_API_KEY', purpose: 'Claude API (optional)' },
    { name: 'ADMIN_USER_IDS', purpose: 'Admin user UUIDs (comma-separated)' },
  ]

  const requiredStatus = required.map(v => ({
    ...v,
    set: !!process.env[v.name],
    preview: process.env[v.name] ? 'SET' : 'NOT SET',
  }))

  const optionalStatus = optional.map(v => ({
    ...v,
    set: !!process.env[v.name],
    value: v.name === 'WARM_POOL_SIZE' ? process.env[v.name] || '5 (default)' : undefined,
  }))

  const missingRequired = requiredStatus.filter(v => !v.set)

  return c.json({
    status: missingRequired.length === 0 ? 'ok' : 'missing_required',
    required: requiredStatus,
    optional: optionalStatus,
    missingCount: missingRequired.length,
  })
})
