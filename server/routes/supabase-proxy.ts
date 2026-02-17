/**
 * Supabase Management API Proxy
 *
 * Forwards requests to api.supabase.com/v1 with server-side auth token.
 * Authenticates the user and verifies project ownership before proxying.
 */

import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../lib/db/client'
import { projects } from '../lib/db/schema'
import { fetchWithTimeout } from '../lib/fetch'
import { authMiddleware } from '../middleware/auth'

const SUPABASE_API_BASE = 'https://api.supabase.com'

export const supabaseProxyRoutes = new Hono()

// Apply auth middleware to all routes
supabaseProxyRoutes.use('*', authMiddleware)

/**
 * Catch-all handler for both GET and POST
 * Proxies requests to Supabase Management API
 * Path format: /api/supabase-proxy/v1/projects/{ref}/database/query
 */
supabaseProxyRoutes.all('/*', async (c) => {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  if (!accessToken) {
    return c.json({ error: 'Server misconfigured' }, 500)
  }

  const user = c.var.user

  // Security: Only allow safe HTTP methods
  const ALLOWED_METHODS = new Set(['GET', 'POST'])
  const method = c.req.method
  if (!ALLOWED_METHODS.has(method)) {
    return c.json({ error: 'Method not allowed' }, 405)
  }

  // Security: Allowlist of safe API endpoint patterns
  const ALLOWED_PATH_PATTERNS = [
    /^rest\/v1\//,                                           // PostgREST data access
    /^v1\/projects\/[a-z0-9_-]+\/database\/query$/,          // SQL queries
    /^v1\/projects\/[a-z0-9_-]+\/database\/tables(\/.*)?$/,  // Table list + nested
    /^v1\/projects\/[a-z0-9_-]+\/database\/columns$/,        // Column list
    /^v1\/projects\/[a-z0-9_-]+\/database\/schemas$/,        // Schema list
  ]

  // Extract path after /api/supabase-proxy/
  // c.req.path returns full path like /api/supabase-proxy/v1/projects/xxx/database/query
  const fullPath = c.req.path.replace(/^\/api\/supabase-proxy\//, '')

  // Security: Validate path against allowlist
  const pathAllowed = ALLOWED_PATH_PATTERNS.some(pattern => pattern.test(fullPath))
  if (!pathAllowed) {
    return c.json({ error: 'Forbidden — path not allowed' }, 403)
  }

  // Verify project ownership if path contains a project ref
  const projectRefMatch = fullPath.match(/projects\/([^/]+)/)
  if (projectRefMatch) {
    const projectRef = projectRefMatch[1]
    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.supabaseProjectId, projectRef), eq(projects.userId, user.id)))
      .then((rows) => rows[0] ?? null)

    if (!project) {
      return c.json({ error: 'Forbidden' }, 403)
    }
  }

  // Security: Only allow SELECT queries (with CTEs) through the proxy
  if (method === 'POST' && fullPath.includes('/database/query')) {
    const bodyText = await c.req.text()
    // Parse JSON body to get the query string
    let queryText = bodyText
    try {
      const parsed = JSON.parse(bodyText)
      queryText = parsed.query ?? parsed.sql ?? bodyText
    } catch {
      // Not JSON, use raw body
    }
    // Strip comments and normalize whitespace for safe matching
    const normalized = queryText.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
    // Only allow SELECT or WITH...SELECT (CTEs)
    if (!/^(SELECT|WITH)\b/i.test(normalized)) {
      return c.json({ error: 'Forbidden — only SELECT queries are allowed' }, 403)
    }
    // Restore body for fetch
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: bodyText,
    }

    const targetUrl = `${SUPABASE_API_BASE}/${fullPath}`
    const response = await fetchWithTimeout(targetUrl, fetchOptions)
    const data = await response.text()

    return new Response(data, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Forward to Supabase Management API
  const targetUrl = `${SUPABASE_API_BASE}/${fullPath}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const fetchOptions: RequestInit = { method, headers }
  if (method === 'POST') {
    fetchOptions.body = await c.req.text()
  }

  const response = await fetch(targetUrl, fetchOptions)
  const data = await response.text()

  return new Response(data, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
