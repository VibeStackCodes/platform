// server/middleware/auth.ts

import { createClient } from '@supabase/supabase-js'
import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'

const MOCK_MODE =
  process.env.NODE_ENV !== 'production' &&
  (process.env.VITE_MOCK_MODE === 'true' || process.env.NEXT_PUBLIC_MOCK_MODE === 'true')

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

// Short-lived token cache to avoid calling getUser() on every request (30s TTL)
const tokenCache = new Map<string, { user: User; expiresAt: number }>()
const TOKEN_CACHE_TTL = 30_000

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
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ error: 'Server misconfigured: missing Supabase credentials' }, 500)
  }

  // Check Authorization header first (SPA sends Bearer token from localStorage),
  // then fall back to cookies (for SSR or cookie-based setups)
  const authHeader = c.req.header('Authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const accessToken =
    bearerToken ??
    getCookie(c, 'sb-access-token') ??
    getCookie(c, `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`)
  const refreshToken = getCookie(c, 'sb-refresh-token')

  if (!accessToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Check cache first to avoid network call on every request
  const cached = tokenCache.get(accessToken)
  if (cached && cached.expiresAt > Date.now()) {
    c.set('user', cached.user)
    return next()
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

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const typedUser = user as unknown as User
  // Cache the verified user to avoid redundant getUser() calls
  tokenCache.set(accessToken, { user: typedUser, expiresAt: Date.now() + TOKEN_CACHE_TTL })
  c.set('user', typedUser)
  return next()
})
