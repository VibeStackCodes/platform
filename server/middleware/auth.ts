// server/middleware/auth.ts
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { createClient } from '@supabase/supabase-js'

const MOCK_MODE = process.env.VITE_MOCK_MODE === 'true' || process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

/** Stable mock user for E2E tests */
export const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'mock@vibestack.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
} as const

type User = typeof MOCK_USER

// Extend Hono context with typed user
declare module 'hono' {
  interface ContextVariableMap {
    user: User
  }
}

/**
 * Auth middleware — extracts Supabase session from cookies, verifies user.
 * In mock mode, always returns MOCK_USER.
 * Sets c.var.user for downstream handlers.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  if (MOCK_MODE) {
    c.set('user', MOCK_USER)
    return next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ error: 'Server misconfigured: missing Supabase credentials' }, 500)
  }

  // Supabase stores session in cookies as sb-<ref>-auth-token
  const accessToken = getCookie(c, 'sb-access-token') ?? getCookie(c, `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`)
  const refreshToken = getCookie(c, 'sb-refresh-token')

  if (!accessToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  // If we have a refresh token, set the session
  if (refreshToken) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
  }

  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('user', user as unknown as User)
  return next()
})
