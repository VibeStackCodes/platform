/**
 * Auth Callback Route Handler
 * Handles OAuth callback from Supabase and exchanges code for session
 */

import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

export const authCallbackRoutes = new Hono()

/**
 * GET /api/auth/callback
 * No auth middleware — user isn't authenticated yet.
 * Exchanges OAuth code for session and redirects to dashboard.
 */
authCallbackRoutes.get('/', async (c) => {
  const code = c.req.query('code')
  const origin = new URL(c.req.url).origin

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return c.redirect(`${origin}/?error=server_misconfigured`)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        console.error('Auth callback error:', error)
        return c.redirect(`${origin}/?error=${error.message}`)
      }
    } catch (error) {
      console.error('Unexpected auth error:', error)
      return c.redirect(`${origin}/?error=authentication_failed`)
    }
  }

  // URL to redirect to after successful sign in
  return c.redirect(`${origin}/dashboard`)
})
