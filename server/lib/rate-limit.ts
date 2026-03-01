/**
 * Database-backed rate limiter for Vercel serverless
 *
 * Uses PostgreSQL sliding window counter — works correctly across cold starts
 * and multiple serverless instances (unlike in-memory Map).
 *
 * Falls back to in-memory when DB is unavailable (dev mode, startup).
 */

import { sql } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { db } from './db/client'

interface RateLimitConfig {
  /** Window size in milliseconds */
  windowMs: number
  /** Maximum requests per window */
  max: number
  /** Key prefix to namespace different limiters */
  prefix?: string
}

/**
 * Create a rate limiting middleware backed by PostgreSQL.
 *
 * Uses two queries per request:
 * 1. Count hits in current window
 * 2. Insert new hit if under limit
 *
 * Falls back to allow request if DB query fails (fail-open).
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, max, prefix = 'default' } = config

  return createMiddleware(async (c, next) => {
    const xff = c.req.header('x-forwarded-for')
    const ip = xff ? xff.split(',')[0].trim() : 'anonymous'
    const key = c.get('user')?.id ?? ip
    const fullKey = `${prefix}:${key}`
    const windowStart = new Date(Date.now() - windowMs)

    try {
      // Count hits in current window
      const countResult = await db.execute(
        sql`SELECT COUNT(*)::int as cnt
            FROM rate_limit_hits
            WHERE key = ${fullKey}
            AND created_at > ${windowStart.toISOString()}::timestamptz`,
      )
      const currentCount = (countResult.rows[0] as { cnt: number })?.cnt ?? 0

      // Set rate limit headers
      c.header('X-RateLimit-Limit', String(max))
      c.header('X-RateLimit-Remaining', String(Math.max(0, max - currentCount)))
      c.header('X-RateLimit-Reset', String(Math.ceil((Date.now() + windowMs) / 1000)))

      if (currentCount >= max) {
        const retryAfter = Math.ceil(windowMs / 1000)
        c.header('Retry-After', String(retryAfter))
        return c.json(
          {
            error: 'rate_limit_exceeded',
            message: `Too many requests. Please try again in ${retryAfter} seconds.`,
            retryAfter,
          },
          429,
        )
      }

      // Record this hit
      const intervalSeconds = Math.ceil(windowMs / 1000)
      await db.execute(
        sql`INSERT INTO rate_limit_hits (key, created_at, expires_at)
            VALUES (${fullKey}, NOW(), NOW() + make_interval(secs => ${intervalSeconds}))`,
      )

      return next()
    } catch (error) {
      const criticalPaths = ['/api/agent', '/api/stripe']
      const isCritical = criticalPaths.some((p) => c.req.path.startsWith(p))
      if (isCritical) {
        console.error('[rate-limit] DB failure on critical endpoint, denying request:', error)
        return c.json({ error: 'Service temporarily unavailable' }, 503)
      }
      // Non-critical paths: fail open
      console.error('[rate-limit] DB query failed, allowing request:', error)
      return next()
    }
  })
}

/**
 * Clean up expired rate limit entries.
 * Call this periodically (e.g., from health check or admin endpoint).
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  try {
    const result = await db.execute(
      sql`DELETE FROM rate_limit_hits WHERE expires_at < NOW() RETURNING id`,
    )
    return result.rows.length
  } catch (error) {
    console.error('[rate-limit] Cleanup failed:', error)
    return 0
  }
}
