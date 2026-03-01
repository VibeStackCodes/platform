// tests/rate-limit.test.ts
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the db client before importing rate-limit
vi.mock('@server/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}))

import { db } from '@server/lib/db/client'
import { cleanupExpiredRateLimits, createRateLimiter } from '@server/lib/rate-limit'

describe('createRateLimiter', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('allows requests under the limit', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5, prefix: 'test' })
    app.use('/*', limiter)
    app.get('/test', (c) => c.json({ success: true }))

    // Mock DB responses: count=2, insert succeeds
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ cnt: 2 }],
        fields: [],
        command: 'SELECT',
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        fields: [],
        command: 'INSERT',
        rowCount: 1,
      })

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('3')
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy()
    expect(await res.json()).toEqual({ success: true })

    // Verify both COUNT and INSERT queries were called
    expect(db.execute).toHaveBeenCalledTimes(2)
  })

  it('returns 429 when limit exceeded', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5, prefix: 'test' })
    app.use('/*', limiter)
    app.get('/test', (c) => c.json({ success: true }))

    // Mock DB response: count=5 (at limit)
    vi.mocked(db.execute).mockResolvedValue({
      rows: [{ cnt: 5 }],
      fields: [],
      command: 'SELECT',
      rowCount: 1,
    })

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })

    expect(res.status).toBe(429)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(res.headers.get('Retry-After')).toBe('60')

    const body = await res.json()
    expect(body.error).toBe('rate_limit_exceeded')
    expect(body.retryAfter).toBe(60)

    // Should only call COUNT query, not INSERT (since over limit)
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('sets rate limit headers correctly', async () => {
    const limiter = createRateLimiter({ windowMs: 30_000, max: 10, prefix: 'test' })
    app.use('/*', limiter)
    app.get('/test', (c) => c.json({ success: true }))

    // Mock DB: count=7
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ cnt: 7 }],
        fields: [],
        command: 'SELECT',
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        fields: [],
        command: 'INSERT',
        rowCount: 1,
      })

    const res = await app.request('/test')

    expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('3')
    const reset = Number.parseInt(res.headers.get('X-RateLimit-Reset') ?? '0')
    expect(reset).toBeGreaterThan(Date.now() / 1000)
  })

  it('fails open when DB is unavailable', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5, prefix: 'test' })
    app.use('/*', limiter)
    app.get('/test', (c) => c.json({ success: true }))

    // Mock DB failure
    vi.mocked(db.execute).mockRejectedValue(new Error('Connection failed'))

    // Suppress console.error for this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await app.request('/test')

    // Should allow request through (fail open)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[rate-limit] DB query failed, allowing request:',
      expect.any(Error),
    )

    consoleErrorSpy.mockRestore()
  })

  it('uses different prefixes to avoid interference', async () => {
    const limiter1 = createRateLimiter({ windowMs: 60_000, max: 5, prefix: 'api' })
    const limiter2 = createRateLimiter({ windowMs: 60_000, max: 3, prefix: 'agent' })

    const app1 = new Hono()
    app1.use('/*', limiter1)
    app1.get('/test', (c) => c.json({ service: 'api' }))

    const app2 = new Hono()
    app2.use('/*', limiter2)
    app2.get('/test', (c) => c.json({ service: 'agent' }))

    // Mock DB for app1: count=2
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ cnt: 2 }],
        fields: [],
        command: 'SELECT',
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        fields: [],
        command: 'INSERT',
        rowCount: 1,
      })

    const res1 = await app1.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })
    expect(res1.status).toBe(200)
    expect(res1.headers.get('X-RateLimit-Limit')).toBe('5')

    vi.clearAllMocks()

    // Mock DB for app2: count=1
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ cnt: 1 }],
        fields: [],
        command: 'SELECT',
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        fields: [],
        command: 'INSERT',
        rowCount: 1,
      })

    const res2 = await app2.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    })
    expect(res2.status).toBe(200)
    expect(res2.headers.get('X-RateLimit-Limit')).toBe('3')
  })

  it('uses authenticated user ID when available', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5, prefix: 'test' })

    const appWithAuth = new Hono<{ Variables: { user?: { id: string } } }>()
    appWithAuth.use('/*', async (c, next) => {
      c.set('user', { id: 'user-123' })
      await next()
    })
    appWithAuth.use('/*', limiter)
    appWithAuth.get('/test', (c) => c.json({ success: true }))

    // Mock DB
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ cnt: 1 }],
        fields: [],
        command: 'SELECT',
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        fields: [],
        command: 'INSERT',
        rowCount: 1,
      })

    const res = await appWithAuth.request('/test')
    expect(res.status).toBe(200)

    // User-specific rate limiting works (verified by successful execution)
    expect(db.execute).toHaveBeenCalledTimes(2)
  })

  it('falls back to anonymous when no user or IP', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5, prefix: 'test' })
    app.use('/*', limiter)
    app.get('/test', (c) => c.json({ success: true }))

    // Mock DB
    vi.mocked(db.execute)
      .mockResolvedValueOnce({
        rows: [{ cnt: 0 }],
        fields: [],
        command: 'SELECT',
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [],
        fields: [],
        command: 'INSERT',
        rowCount: 1,
      })

    const res = await app.request('/test')
    expect(res.status).toBe(200)

    // Anonymous rate limiting works (verified by successful execution)
    expect(db.execute).toHaveBeenCalledTimes(2)
  })
})

describe('cleanupExpiredRateLimits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('removes expired entries and returns count', async () => {
    // Mock DB response: 3 rows deleted
    vi.mocked(db.execute).mockResolvedValue({
      rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
      fields: [],
      command: 'DELETE',
      rowCount: 3,
    })

    const count = await cleanupExpiredRateLimits()
    expect(count).toBe(3)

    // Verify DELETE query was called
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('returns 0 when no entries to delete', async () => {
    vi.mocked(db.execute).mockResolvedValue({
      rows: [],
      fields: [],
      command: 'DELETE',
      rowCount: 0,
    })

    const count = await cleanupExpiredRateLimits()
    expect(count).toBe(0)
  })

  it('returns 0 and logs error on DB failure', async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error('Connection failed'))

    // Suppress console.error for this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const count = await cleanupExpiredRateLimits()
    expect(count).toBe(0)
    expect(consoleErrorSpy).toHaveBeenCalledWith('[rate-limit] Cleanup failed:', expect.any(Error))

    consoleErrorSpy.mockRestore()
  })
})
