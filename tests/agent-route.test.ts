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

vi.mock('../../src/mastra/index', () => {
  /** Create a mock ReadableStream of WorkflowStreamEvents */
  function createMockStream() {
    const events = [
      { type: 'workflow-start', runId: 'test-run', from: 'WORKFLOW', payload: { workflowId: 'app-generation' } },
      {
        type: 'workflow-step-start',
        runId: 'test-run',
        from: 'WORKFLOW',
        id: 'analyst',
        payload: { id: 'analyst', stepCallId: 'sc-1', status: 'running' },
      },
      {
        type: 'workflow-step-finish',
        runId: 'test-run',
        from: 'WORKFLOW',
        payload: { id: 'analyst', metadata: {} },
      },
      {
        type: 'workflow-finish',
        runId: 'test-run',
        from: 'WORKFLOW',
        payload: {
          workflowStatus: 'success',
          output: { usage: { inputTokens: 500, outputTokens: 500, totalTokens: 1000 } },
          metadata: {},
        },
      },
    ]
    return new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(event)
        }
        controller.close()
      },
    })
  }

  return {
    mastra: {
      getWorkflow: vi.fn(() => ({
        createRun: vi.fn(async () => ({
          stream: vi.fn(() => ({
            fullStream: createMockStream(),
            usage: Promise.resolve({ inputTokens: 500, outputTokens: 500, totalTokens: 1000 }),
            result: Promise.resolve({}),
          })),
        })),
      })),
    },
  }
})

vi.mock('@server/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}))

import { isAllowedModel } from '@server/lib/agents/provider'
import { getUserCredits } from '@server/lib/db/queries'
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

    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message', projectId: 'proj-1' }),
    })

    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json).toEqual({
      error: 'insufficient_credits',
      credits_remaining: 0,
      credits_reset_at: null,
    })
    expect(getUserCredits).toHaveBeenCalledWith('user-123')
  })

  it('returns 402 when user credits are 0', async () => {
    vi.mocked(getUserCredits).mockResolvedValue({
      creditsRemaining: 0,
      creditsMonthly: 100,
      creditsResetAt: '2026-03-01T00:00:00Z',
      plan: 'free',
    })
    vi.mocked(isAllowedModel).mockReturnValue(true)

    const res = await app.request('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message', projectId: 'proj-1' }),
    })

    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json).toEqual({
      error: 'insufficient_credits',
      credits_remaining: 0,
      credits_reset_at: '2026-03-01T00:00:00Z',
    })
  })

  it('returns SSE stream with text/event-stream content-type for valid request', async () => {
    vi.mocked(getUserCredits).mockResolvedValue({
      creditsRemaining: 100,
      creditsMonthly: 100,
      creditsResetAt: '2026-03-01T00:00:00Z',
      plan: 'free',
    })
    vi.mocked(isAllowedModel).mockReturnValue(true)

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

    const eventData = JSON.parse(dataLine?.replace('data: ', ''))
    expect(eventData).toEqual({ type: 'stage_update', stage: 'generating' })

    reader.releaseLock()
  })
})
