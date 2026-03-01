import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @supabase/supabase-js — must be hoisted before any import of auth-callback
const mockExchangeCodeForSession = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}))

// Import AFTER mocks are set up
import { createClient } from '@supabase/supabase-js'
import { authCallbackRoutes } from '@server/routes/auth-callback'

describe('Auth Callback Routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()

    // Default: non-production mode so origin uses raw request URL
    process.env.NODE_ENV = 'test'

    // Default: valid Supabase env vars
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    app = new Hono()
    app.route('/api/auth/callback', authCallbackRoutes)
  })

  describe('GET /api/auth/callback', () => {
    it('exchanges valid OAuth code for session and redirects to /dashboard', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

      const res = await app.request('/api/auth/callback?code=valid-oauth-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      expect(location).toMatch(/\/dashboard$/)
      expect(location).not.toContain('error=')
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-oauth-code')
    })

    it('redirects to /dashboard when code query param is missing (no error)', async () => {
      const res = await app.request('/api/auth/callback', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      expect(location).toMatch(/\/dashboard$/)
      expect(location).not.toContain('error=')
      // No code → no exchange attempt
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    })

    it('redirects with error=server_misconfigured when both VITE_ and NEXT_PUBLIC_ Supabase URL vars are absent', async () => {
      delete process.env.VITE_SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_URL

      const res = await app.request('/api/auth/callback?code=some-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      expect(location).toContain('error=server_misconfigured')
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    })

    it('redirects with error=server_misconfigured when both VITE_ and NEXT_PUBLIC_ Supabase anon key vars are absent', async () => {
      delete process.env.VITE_SUPABASE_ANON_KEY
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      const res = await app.request('/api/auth/callback?code=some-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      expect(location).toContain('error=server_misconfigured')
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
    })

    it('redirects with error=authentication_failed when exchangeCodeForSession returns an error object', async () => {
      mockExchangeCodeForSession.mockResolvedValue({
        data: null,
        error: { message: 'Invalid code verifier' },
      })

      const res = await app.request('/api/auth/callback?code=bad-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      expect(location).toContain('error=authentication_failed')
      // Raw error message must NOT appear in redirect (info leak / open redirect risk)
      expect(location).not.toContain('Invalid code verifier')
    })

    it('redirects with error=authentication_failed when exchangeCodeForSession throws', async () => {
      mockExchangeCodeForSession.mockRejectedValue(new Error('Network timeout'))

      const res = await app.request('/api/auth/callback?code=throwing-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      expect(location).toContain('error=authentication_failed')
      expect(location).not.toContain('Network timeout')
    })

    it('uses first allowed origin in production mode when request origin is not in allowed list', async () => {
      process.env.NODE_ENV = 'production'
      mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

      // In tests the request URL origin is http://localhost — not in ALLOWED_ORIGINS
      const res = await app.request('/api/auth/callback?code=prod-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      // Must fall back to first allowed origin (https://app.vibestack.com)
      expect(location).toMatch(/^https:\/\/app\.vibestack\.com/)
      expect(location).toMatch(/\/dashboard$/)
    })

    it('uses raw request origin in development mode even when not in allowed origins list', async () => {
      process.env.NODE_ENV = 'development'
      mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

      const res = await app.request('http://localhost:3000/api/auth/callback?code=dev-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      // Raw origin should be reflected in dev mode
      expect(location).toMatch(/^http:\/\/localhost:3000/)
      expect(location).toMatch(/\/dashboard$/)
    })

    it('uses an explicitly allowed origin in production mode and redirects to /dashboard', async () => {
      process.env.NODE_ENV = 'production'
      mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

      const res = await app.request(
        'https://app.vibestack.com/api/auth/callback?code=allowed-code',
        { method: 'GET' },
      )

      expect(res.status).toBe(302)
      const location = res.headers.get('location')
      expect(location).toBe('https://app.vibestack.com/dashboard')
    })

    it('prefers NEXT_PUBLIC_SUPABASE_URL when VITE_SUPABASE_URL is absent', async () => {
      delete process.env.VITE_SUPABASE_URL
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://next-url.supabase.co'
      mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

      const res = await app.request('/api/auth/callback?code=next-url-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      expect(createClient).toHaveBeenCalledWith('https://next-url.supabase.co', expect.any(String))
    })

    it('prefers NEXT_PUBLIC_SUPABASE_ANON_KEY when VITE_SUPABASE_ANON_KEY is absent', async () => {
      delete process.env.VITE_SUPABASE_ANON_KEY
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'next-anon-key'
      mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null })

      const res = await app.request('/api/auth/callback?code=next-anon-code', {
        method: 'GET',
      })

      expect(res.status).toBe(302)
      expect(createClient).toHaveBeenCalledWith(expect.any(String), 'next-anon-key')
    })
  })
})
