import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@server/middleware/auth', () => ({
  authMiddleware: createMiddleware(async (c, next) => {
    c.set('user', { id: 'user-123', email: 'test@test.com' })
    return next()
  }),
}))

interface MockDb {
  select: ReturnType<typeof vi.fn>
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  then: ReturnType<typeof vi.fn>
}

vi.mock('@server/lib/db/client', () => {
  const createMockDb = (): MockDb => ({
    select: vi.fn(function (this: MockDb) {
      return this
    }),
    from: vi.fn(function (this: MockDb) {
      return this
    }),
    where: vi.fn(function (this: MockDb) {
      return this
    }),
    // oxlint-disable-next-line unicorn/no-thenable
    then: vi.fn(),
  })

  const mockDb = createMockDb()
  mockDb.select = vi.fn(() => mockDb)
  mockDb.from = vi.fn(() => mockDb)
  mockDb.where = vi.fn(() => mockDb)

  return { db: mockDb }
})

import { db } from '@server/lib/db/client'
import { supabaseProxyRoutes } from '@server/routes/supabase-proxy'

const mockDb = db as unknown as MockDb

describe('Supabase Proxy Route', () => {
  let app: Hono
  let originalEnv: string | undefined

  beforeEach(() => {
    app = new Hono()
    app.route('/api/supabase-proxy', supabaseProxyRoutes)

    originalEnv = process.env.SUPABASE_ACCESS_TOKEN
    process.env.SUPABASE_ACCESS_TOKEN = 'test-access-token'

    vi.clearAllMocks()

    global.fetch = vi.fn()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SUPABASE_ACCESS_TOKEN = originalEnv
    } else {
      delete process.env.SUPABASE_ACCESS_TOKEN
    }
  })

  it('returns 500 when SUPABASE_ACCESS_TOKEN is not set', async () => {
    delete process.env.SUPABASE_ACCESS_TOKEN

    const res = await app.request('/api/supabase-proxy/v1/projects/ref123/database/query')

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({ error: 'Server misconfigured' })
  })

  it('returns 403 when user does not own the project', async () => {
    mockDb.then.mockImplementationOnce((callback: (data: unknown[]) => unknown) => {
      return Promise.resolve(callback([]))
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-123/database/query')

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json).toEqual({ error: 'Forbidden' })

    expect(mockDb.select).toHaveBeenCalled()
    expect(mockDb.from).toHaveBeenCalled()
    expect(mockDb.where).toHaveBeenCalled()
    expect(mockDb.then).toHaveBeenCalled()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('forwards GET requests to Supabase API when ownership verified', async () => {
    mockDb.then.mockImplementationOnce((callback: (data: unknown[]) => unknown) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ result: 'success' }),
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-123/database/query')

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ result: 'success' })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/ref-123/database/query',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      }),
    )
  })

  it('forwards POST requests with body to Supabase API', async () => {
    mockDb.then.mockImplementationOnce((callback: (data: unknown[]) => unknown) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 201,
      text: async () => JSON.stringify({ created: true }),
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-456/database/query', {
      method: 'POST',
      body: JSON.stringify({ query: 'SELECT * FROM users' }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json).toEqual({ created: true })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/ref-456/database/query',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      }),
    )
  })

  it('passes through response status from Supabase API', async () => {
    mockDb.then.mockImplementationOnce((callback: (data: unknown[]) => unknown) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ data: [] }),
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-123/database/tables')

    expect(res.status).toBe(200)
  })

  // Security: PUT, DELETE, PATCH are now blocked
  it('returns 405 for PUT requests', async () => {
    const res = await app.request('/api/supabase-proxy/v1/projects/ref-789/database/query', {
      method: 'PUT',
      body: JSON.stringify({ setting: 'value' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(405)
    const json = await res.json()
    expect(json).toEqual({ error: 'Method not allowed' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns 405 for DELETE requests', async () => {
    const res = await app.request('/api/supabase-proxy/v1/projects/ref-999/database/query', {
      method: 'DELETE',
    })

    expect(res.status).toBe(405)
    const json = await res.json()
    expect(json).toEqual({ error: 'Method not allowed' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // Security: Path allowlist enforcement
  it('returns 403 for disallowed paths (settings)', async () => {
    const res = await app.request('/api/supabase-proxy/v1/projects/ref-abc/settings')

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json).toEqual({ error: 'Forbidden — path not allowed' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns 403 for non-project paths (organizations)', async () => {
    const res = await app.request('/api/supabase-proxy/v1/organizations')

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json).toEqual({ error: 'Forbidden — path not allowed' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('allows nested table paths', async () => {
    mockDb.then.mockImplementationOnce((callback: (data: unknown[]) => unknown) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ data: [] }),
    })

    const res = await app.request(
      '/api/supabase-proxy/v1/projects/ref-abc/database/tables/users/columns',
    )

    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/ref-abc/database/tables/users/columns',
      expect.any(Object),
    )
  })

  // Security: DDL prevention in POST queries
  it('blocks POST with DDL keywords (DROP)', async () => {
    mockDb.then.mockImplementationOnce((callback: (data: unknown[]) => unknown) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-123/database/query', {
      method: 'POST',
      body: JSON.stringify({ query: 'DROP TABLE users' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json).toEqual({ error: 'Forbidden — only SELECT queries are allowed' })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
