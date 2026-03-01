/**
 * Auth Callback Route Handler
 * Handles OAuth callback from Supabase and exchanges code for session
 */

import { describeRoute, resolver } from 'hono-openapi'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const RedirectResponseSchema = z
  .string()
  .describe('302 redirect — Location header points to /dashboard or /?error=<code>')

export const authCallbackRoutes = new Hono()

/**
 * GET /api/auth/callback
 * No auth middleware — user isn't authenticated yet.
 * Exchanges OAuth code for session and redirects to dashboard.
 */
authCallbackRoutes.get(
  '/',
  describeRoute({
    summary: 'OAuth callback — exchange code for session',
    description:
      'No auth middleware. Exchanges Supabase OAuth code for session and redirects to dashboard.',
    tags: ['auth'],
    security: [],
    parameters: [
      {
        name: 'code',
        in: 'query',
        required: false,
        description: 'OAuth authorization code provided by Supabase',
        schema: { type: 'string' },
      },
    ],
    responses: {
      302: {
        description: 'Redirect to dashboard on success or /?error=<code> on failure',
        content: { 'text/plain': { schema: resolver(RedirectResponseSchema) } },
      },
    },
  }),
  async (c) => {
    const code = c.req.query('code')

    // Hardcode allowed origin — never derive from Host header (open redirect risk)
    const ALLOWED_ORIGINS = [
      'https://app.vibestack.com',
      'https://vibestack.com',
      'https://www.vibestack.com',
    ]
    const rawOrigin = new URL(c.req.url).origin
    const origin = ALLOWED_ORIGINS.includes(rawOrigin)
      ? rawOrigin
      : process.env.NODE_ENV !== 'production'
        ? rawOrigin
        : ALLOWED_ORIGINS[0]

    if (code) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
      const supabaseAnonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        return c.redirect(`${origin}/?error=server_misconfigured`)
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('Auth callback error:', error)
          // Never reflect raw error.message in redirect URL — use a fixed error code
          return c.redirect(`${origin}/?error=authentication_failed`)
        }
      } catch (error) {
        console.error('Unexpected auth error:', error)
        return c.redirect(`${origin}/?error=authentication_failed`)
      }
    }

    // URL to redirect to after successful sign in
    return c.redirect(`${origin}/dashboard`)
  },
)
