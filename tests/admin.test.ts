import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock auth middleware
vi.mock('@server/middleware/auth', () => ({
  authMiddleware: createMiddleware(async (c, next) => {
    c.set('user', { id: 'admin-user-123', email: 'admin@test.com' })
    return next()
  }),
}))

// Mock DB
vi.mock('@server/lib/db/client', () => ({
  db: { execute: vi.fn() },
}))

// Mock rate-limit
vi.mock('@server/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(() =>
    createMiddleware(async (c, next) => {
      return next()
    }),
  ),
  cleanupExpiredRateLimits: vi.fn(),
}))

// Mock sandbox
vi.mock('@server/lib/sandbox', () => ({
  getDaytonaClient: vi.fn(),
}))

import { db } from '@server/lib/db/client'
import { cleanupExpiredRateLimits } from '@server/lib/rate-limit'
import { getDaytonaClient } from '@server/lib/sandbox'
import { adminRoutes } from '@server/routes/admin'

describe('Admin Routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    // No ADMIN_USER_IDS = dev mode, allow all authenticated users
    delete process.env.ADMIN_USER_IDS
    app = new Hono()
    app.route('/api/admin', adminRoutes)
  })

  describe('GET /api/admin/health', () => {
    it('returns healthy status when all systems ok', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [{ '?column?': 1 }] } as any)

      const mockDaytonaClient = {
        list: vi.fn().mockResolvedValue({ items: [] }),
      }
      vi.mocked(getDaytonaClient).mockReturnValue(mockDaytonaClient as any)
      vi.mocked(cleanupExpiredRateLimits).mockResolvedValue(5)

      process.env.DATABASE_URL = 'postgres://test'
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.DAYTONA_API_KEY = 'daytona-test'
      process.env.DAYTONA_SNAPSHOT_ID = 'snap-123'
      process.env.VERCEL_TOKEN = 'vercel-test'
      process.env.GITHUB_APP_ID = '123'
      process.env.GITHUB_APP_PRIVATE_KEY = 'private-key'
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'

      const res = await app.request('/api/admin/health')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.checks.database.status).toBe('ok')
      expect(data.checks.daytona.status).toBe('ok')
      expect(data.checks.daytona.details).toMatch(/\d+ms latency/)
      expect(data.checks.rate_limits.status).toBe('ok')
      expect(data.checks.rate_limits.details).toBe('5 expired entries cleaned')
      expect(data.checks.env_vars.status).toBe('ok')
      expect(data.timestamp).toBeDefined()
    })

    it('returns 503 when database is down', async () => {
      vi.mocked(db.execute).mockRejectedValue(new Error('Connection refused'))

      process.env.DATABASE_URL = 'postgres://test'
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.DAYTONA_API_KEY = 'daytona-test'
      process.env.DAYTONA_SNAPSHOT_ID = 'snap-123'
      process.env.VERCEL_TOKEN = 'vercel-test'
      process.env.GITHUB_APP_ID = '123'
      process.env.GITHUB_APP_PRIVATE_KEY = 'private-key'
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'

      const res = await app.request('/api/admin/health')
      const data = await res.json()

      expect(res.status).toBe(503)
      expect(data.status).toBe('error')
      expect(data.checks.database.status).toBe('error')
      expect(data.checks.database.details).toContain('Connection refused')
    })

    it('reports daytona error when API key is set but connection fails', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [{ '?column?': 1 }] } as any)
      vi.mocked(getDaytonaClient).mockImplementation(() => {
        throw new Error('API connection failed')
      })
      vi.mocked(cleanupExpiredRateLimits).mockResolvedValue(0)

      process.env.DATABASE_URL = 'postgres://test'
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.DAYTONA_API_KEY = 'daytona-test'
      process.env.DAYTONA_SNAPSHOT_ID = 'snap-123'
      process.env.VERCEL_TOKEN = 'vercel-test'
      process.env.GITHUB_APP_ID = '123'
      process.env.GITHUB_APP_PRIVATE_KEY = 'private-key'
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'

      const res = await app.request('/api/admin/health')
      const data = await res.json()

      expect(res.status).toBe(503)
      expect(data.status).toBe('error')
      expect(data.checks.daytona.status).toBe('error')
      expect(data.checks.daytona.details).toContain('API connection failed')
    })

    it('reports daytona warning when API key is not set (dev mode)', async () => {
      vi.mocked(db.execute).mockResolvedValue({ rows: [{ '?column?': 1 }] } as any)
      vi.mocked(getDaytonaClient).mockImplementation(() => {
        throw new Error('API key not configured')
      })
      vi.mocked(cleanupExpiredRateLimits).mockResolvedValue(0)

      process.env.DATABASE_URL = 'postgres://test'
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.DAYTONA_API_KEY = 'temp'
      process.env.DAYTONA_SNAPSHOT_ID = 'snap-123'
      process.env.VERCEL_TOKEN = 'vercel-test'
      process.env.GITHUB_APP_ID = '123'
      process.env.GITHUB_APP_PRIVATE_KEY = 'private-key'
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'

      // Delete DAYTONA_API_KEY to simulate dev mode
      delete process.env.DAYTONA_API_KEY

      const res = await app.request('/api/admin/health')
      const data = await res.json()

      expect(res.status).toBe(503)
      expect(data.status).toBe('error')
      expect(data.checks.daytona.status).toBe('warning')
      expect(data.checks.daytona.details).toContain('API key not configured')
      expect(data.checks.env_vars.status).toBe('error')
    })
  })

  describe('GET /api/admin/env-check', () => {
    it('lists all required and optional environment variables', async () => {
      process.env.DATABASE_URL = 'postgres://test'
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key-123456'
      process.env.SUPABASE_ACCESS_TOKEN = 'sbp_test_token'
      process.env.SUPABASE_ORG_ID = 'org-123'
      process.env.OPENAI_API_KEY = 'sk-test-key'
      process.env.DAYTONA_API_KEY = 'daytona-api-key'
      process.env.DAYTONA_SNAPSHOT_ID = 'snapshot-12345'
      process.env.VERCEL_TOKEN = 'vercel-token-abc'
      process.env.GITHUB_APP_ID = '123456'
      process.env.GITHUB_APP_PRIVATE_KEY = 'private-key-content'
      process.env.GITHUB_APP_INSTALLATION_ID = '98765'
      process.env.GITHUB_ORG = 'test-org'
      process.env.STRIPE_SECRET_KEY = 'sk_test_stripe'
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
      process.env.WARM_POOL_SIZE = '10'
      process.env.HELICONE_API_KEY = 'helicone-key'

      const res = await app.request('/api/admin/env-check')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe('ok')
      expect(data.missingCount).toBe(0)

      const dbUrlVar = data.required.find((v: any) => v.name === 'DATABASE_URL')
      expect(dbUrlVar.set).toBe(true)
      expect(dbUrlVar.preview).toBe('SET')

      const poolSizeVar = data.optional.find((v: any) => v.name === 'WARM_POOL_SIZE')
      expect(poolSizeVar.set).toBe(true)
      expect(poolSizeVar.value).toBe('10')
    })

    it('reports missing required environment variables', async () => {
      delete process.env.DATABASE_URL
      delete process.env.VITE_SUPABASE_URL
      delete process.env.VITE_SUPABASE_ANON_KEY
      delete process.env.SUPABASE_ACCESS_TOKEN
      delete process.env.SUPABASE_ORG_ID
      delete process.env.OPENAI_API_KEY
      delete process.env.DAYTONA_API_KEY
      delete process.env.DAYTONA_SNAPSHOT_ID
      delete process.env.VERCEL_TOKEN
      delete process.env.GITHUB_APP_ID
      delete process.env.GITHUB_APP_PRIVATE_KEY
      delete process.env.GITHUB_APP_INSTALLATION_ID
      delete process.env.GITHUB_ORG
      delete process.env.STRIPE_SECRET_KEY
      delete process.env.STRIPE_WEBHOOK_SECRET

      const res = await app.request('/api/admin/env-check')
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe('missing_required')
      expect(data.missingCount).toBe(15)

      const dbUrlVar = data.required.find((v: any) => v.name === 'DATABASE_URL')
      expect(dbUrlVar.set).toBe(false)
      expect(dbUrlVar.preview).toBe('NOT SET')
    })
  })

  describe('Admin guard', () => {
    it('blocks non-admin users when ADMIN_USER_IDS is configured', async () => {
      process.env.ADMIN_USER_IDS = 'other-user-456,another-user-789'

      const res = await app.request('/api/admin/health')
      const data = await res.json()

      expect(res.status).toBe(403)
      expect(data.error).toContain('Forbidden')
    })

    it('allows authenticated users in dev mode (no ADMIN_USER_IDS)', async () => {
      delete process.env.ADMIN_USER_IDS

      vi.mocked(db.execute).mockResolvedValue({ rows: [{ '?column?': 1 }] } as any)
      const mockDaytonaClient = {
        list: vi.fn().mockResolvedValue({ items: [] }),
      }
      vi.mocked(getDaytonaClient).mockReturnValue(mockDaytonaClient as any)
      vi.mocked(cleanupExpiredRateLimits).mockResolvedValue(0)

      process.env.DATABASE_URL = 'postgres://test'
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'
      process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
      process.env.SUPABASE_ACCESS_TOKEN = 'test-token'
      process.env.OPENAI_API_KEY = 'sk-test'
      process.env.DAYTONA_API_KEY = 'daytona-test'
      process.env.DAYTONA_SNAPSHOT_ID = 'snap-123'
      process.env.VERCEL_TOKEN = 'vercel-test'
      process.env.GITHUB_APP_ID = '123'
      process.env.GITHUB_APP_PRIVATE_KEY = 'private-key'
      process.env.STRIPE_SECRET_KEY = 'sk_test_123'

      const res = await app.request('/api/admin/health')
      expect(res.status).toBe(200)
    })
  })
})
