import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@server/middleware/auth', () => ({
  authMiddleware: createMiddleware(async (c, next) => {
    c.set('user', { id: 'user-123', email: 'test@test.com' })
    return next()
  }),
}))

vi.mock('@server/lib/db/client', () => {
  const createMockDb = () => ({
    select: vi.fn(function (this: any) {
      return this
    }),
    from: vi.fn(function (this: any) {
      return this
    }),
    where: vi.fn(function (this: any) {
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

const mockDb = db as any

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

    const res = await app.request('/api/supabase-proxy/v1/projects')

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({ error: 'Server misconfigured' })
  })

  it('returns 403 when user does not own the project', async () => {
    mockDb.then.mockImplementationOnce((callback: any) => {
      return Promise.resolve(callback([]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ data: [] }),
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
    mockDb.then.mockImplementationOnce((callback: any) => {
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
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-access-token',
          'Content-Type': 'application/json',
        },
      },
    )
  })

  it('forwards POST requests with body to Supabase API', async () => {
    mockDb.then.mockImplementationOnce((callback: any) => {
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
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: 'SELECT * FROM users' }),
      },
    )
  })

  it('passes through response status from Supabase API', async () => {
    mockDb.then.mockImplementationOnce((callback: any) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 404,
      text: async () => JSON.stringify({ error: 'Not found' }),
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-123/database/missing')

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json).toEqual({ error: 'Not found' })
  })

  it('proxies non-project paths without ownership check', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ organizations: [] }),
    })

    const res = await app.request('/api/supabase-proxy/v1/organizations')

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ organizations: [] })

    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.from).not.toHaveBeenCalled()
    expect(mockDb.where).not.toHaveBeenCalled()

    expect(global.fetch).toHaveBeenCalledWith('https://api.supabase.com/v1/organizations', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-access-token',
        'Content-Type': 'application/json',
      },
    })
  })

  it('handles PUT requests correctly', async () => {
    mockDb.then.mockImplementationOnce((callback: any) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ updated: true }),
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-789/settings', {
      method: 'PUT',
      body: JSON.stringify({ setting: 'value' }),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(res.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/ref-789/settings',
      expect.objectContaining({
        method: 'PUT',
      }),
    )
  })

  it('handles DELETE requests correctly', async () => {
    mockDb.then.mockImplementationOnce((callback: any) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 204,
      text: async () => '',
    })

    const res = await app.request('/api/supabase-proxy/v1/projects/ref-999/resources/item-1', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/ref-999/resources/item-1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
  })

  it('extracts correct path from nested routes', async () => {
    mockDb.then.mockImplementationOnce((callback: any) => {
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

  it('handles project ref in middle of complex path', async () => {
    mockDb.then.mockImplementationOnce((callback: any) => {
      return Promise.resolve(callback([{ id: 'project-123' }]))
    })

    global.fetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify({ migrations: [] }),
    })

    await app.request('/api/supabase-proxy/v1/projects/ref-complex-123/database/migrations/history')

    expect(mockDb.then).toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/ref-complex-123/database/migrations/history',
      expect.any(Object),
    )
  })
})
