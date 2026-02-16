import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@server/middleware/auth', () => ({
  authMiddleware: createMiddleware(async (c, next) => {
    c.set('user', { id: 'user-123', email: 'test@test.com' })
    return next()
  }),
}))

vi.mock('@server/lib/db/queries', () => ({
  getUserCredits: vi.fn(),
}))

vi.mock('@server/lib/agents/provider', () => ({
  isAllowedModel: vi.fn(),
  createHeliconeProvider: vi.fn(() => vi.fn()),
}))

vi.mock('xstate', async () => {
  const actual = await vi.importActual('xstate')
  return {
    ...actual,
    createActor: vi.fn(() => {
      // Return a mock actor that simulates state transitions
      const subscribers: Array<(snapshot: any) => void> = []
      let started = false
      return {
        start: vi.fn(() => {
          started = true
        }),
        stop: vi.fn(() => {
          started = false
        }),
        send: vi.fn((event: any) => {
          if (!started || subscribers.length === 0) return

          // Simulate state transitions based on event type
          if (event.type === 'START') {
            // Immediately transition through analyzing → complete
            setTimeout(() => {
              for (const sub of subscribers) {
                sub({ value: 'analyzing', context: { retryCount: 0 } })
              }
              setTimeout(() => {
                for (const sub of subscribers) {
                  sub({ value: 'complete', context: { retryCount: 0, error: null }, status: 'done' })
                }
              }, 0)
            }, 0)
          } else if (event.type === 'USER_ANSWERED') {
            // Resume from clarification → complete
            setTimeout(() => {
              for (const sub of subscribers) {
                sub({ value: 'analyzing', context: { retryCount: 0 } })
              }
              setTimeout(() => {
                for (const sub of subscribers) {
                  sub({ value: 'complete', context: { retryCount: 0, error: null }, status: 'done' })
                }
              }, 0)
            }, 0)
          }
        }),
        subscribe: vi.fn((callback: (snapshot: any) => void) => {
          subscribers.push(callback)
          return { unsubscribe: vi.fn(() => {
            const index = subscribers.indexOf(callback)
            if (index > -1) subscribers.splice(index, 1)
          }) }
        }),
        getSnapshot: vi.fn(() => ({ value: 'idle', context: { retryCount: 0 } })),
      }
    }),
  }
})

vi.mock('@server/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}))

vi.mock('@server/lib/credits', () => ({
  reserveCredits: vi.fn(),
  settleCredits: vi.fn().mockResolvedValue({ creditsRemaining: 50 }),
}))

import { isAllowedModel } from '@server/lib/agents/provider'
import { getUserCredits } from '@server/lib/db/queries'
import { reserveCredits } from '@server/lib/credits'
import { agentRoutes } from '@server/routes/agent'

describe('POST /api/agent', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.route('/api/agent', agentRoutes)
  })

  it('returns 400 for invalid JSON body', async () => {
    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid-json',
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Invalid request body' })
  })

  it('returns 400 when message is missing', async () => {
    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1' }),
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Missing message or projectId' })
  })

  it('returns 400 when projectId is missing', async () => {
    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message' }),
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Missing message or projectId' })
  })

  it('returns 400 for disallowed model', async () => {
    vi.mocked(isAllowedModel).mockReturnValue(false)

    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'test message',
        projectId: 'proj-1',
        model: 'invalid-model',
      }),
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ error: 'Model "invalid-model" is not available' })
    expect(isAllowedModel).toHaveBeenCalledWith('invalid-model')
  })

  it('returns 402 when user has no credits (null)', async () => {
    vi.mocked(getUserCredits).mockResolvedValue(null)
    vi.mocked(isAllowedModel).mockReturnValue(true)
    vi.mocked(reserveCredits).mockResolvedValue(false)

    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message', projectId: 'proj-1' }),
    })

    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.error).toBe('insufficient_credits')
    expect(json.credits_remaining).toBe(0)
    expect(json.credits_reset_at).toBeNull()
  })

  it('returns 402 when user credits are 0', async () => {
    vi.mocked(getUserCredits).mockResolvedValue({
      creditsRemaining: 0,
      creditsMonthly: 100,
      creditsResetAt: '2026-03-01T00:00:00Z',
      plan: 'free',
    })
    vi.mocked(isAllowedModel).mockReturnValue(true)
    vi.mocked(reserveCredits).mockResolvedValue(false)

    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message', projectId: 'proj-1' }),
    })

    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.error).toBe('insufficient_credits')
    expect(json.credits_remaining).toBe(0)
    expect(json.credits_reset_at).toBe('2026-03-01T00:00:00Z')
  })

  it('returns SSE stream with text/event-stream content-type for valid request', async () => {
    vi.mocked(getUserCredits).mockResolvedValue({
      creditsRemaining: 100,
      creditsMonthly: 100,
      creditsResetAt: '2026-03-01T00:00:00Z',
      plan: 'free',
    })
    vi.mocked(isAllowedModel).mockReturnValue(true)
    vi.mocked(reserveCredits).mockResolvedValue(true)

    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message', projectId: 'proj-1' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(res.headers.get('Connection')).toBe('keep-alive')
  })

  it('SSE stream contains stage_update event with generating stage', async () => {
    vi.mocked(getUserCredits).mockResolvedValue({
      creditsRemaining: 100,
      creditsMonthly: 100,
      creditsResetAt: '2026-03-01T00:00:00Z',
      plan: 'free',
    })
    vi.mocked(isAllowedModel).mockReturnValue(true)
    vi.mocked(reserveCredits).mockResolvedValue(true)

    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message', projectId: 'proj-1' }),
    })

    expect(res.status).toBe(200)
    expect(res.body).not.toBeNull()

    const reader = res.body?.getReader()
    const decoder = new TextDecoder()

    const { value } = await reader.read()
    const chunk = decoder.decode(value)

    expect(chunk).toContain('data: ')
    const lines = chunk.split('\n')
    const dataLine = lines.find((line) => line.startsWith('data: '))
    expect(dataLine).toBeDefined()

    const eventData = JSON.parse(dataLine?.replace('data: ', '') ?? '{}')
    expect(eventData).toEqual({ type: 'stage_update', stage: 'generating' })

    reader.releaseLock()
  })
})
