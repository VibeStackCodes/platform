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

  // Extract path after /api/supabase-proxy/
  // c.req.path returns full path like /api/supabase-proxy/v1/projects/xxx/database/query
  const fullPath = c.req.path.replace(/^\/api\/supabase-proxy\//, '')

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

  // Forward to Supabase Management API
  const targetUrl = `${SUPABASE_API_BASE}/${fullPath}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const method = c.req.method
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
