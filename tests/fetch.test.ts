import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithTimeout } from '@server/lib/fetch'

// Capture the real AbortSignal.timeout BEFORE any mocking
const realAbortSignalTimeout = AbortSignal.timeout.bind(AbortSignal)

// Track calls to AbortSignal.timeout via a spy on the real implementation
let timeoutSpy: ReturnType<typeof vi.fn>

// Mock global fetch
const mockFetch = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', mockFetch)

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    mockFetch.mockReset()

    // Spy that delegates to the real implementation so it still works
    timeoutSpy = vi.fn((ms: number) => realAbortSignalTimeout(ms))
    // Replace AbortSignal.timeout with the spy (preserving other static members)
    Object.defineProperty(AbortSignal, 'timeout', {
      value: timeoutSpy,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    // Restore the real AbortSignal.timeout
    Object.defineProperty(AbortSignal, 'timeout', {
      value: realAbortSignalTimeout,
      writable: true,
      configurable: true,
    })
  })

  it('returns Response on a successful fetch', async () => {
    const fakeResponse = new Response('ok', { status: 200 })
    mockFetch.mockResolvedValueOnce(fakeResponse)

    const result = await fetchWithTimeout('https://example.com/api')

    expect(result).toBe(fakeResponse)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('passes the URL through to fetch unchanged', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'))

    const url = 'https://api.example.com/v1/resource'
    await fetchWithTimeout(url)

    expect(mockFetch.mock.calls[0][0]).toBe(url)
  })

  it('uses a default timeout of 30 000 ms when none is provided', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'))

    await fetchWithTimeout('https://example.com/')

    expect(timeoutSpy).toHaveBeenCalledWith(30_000)
  })

  it('uses a custom timeout when provided', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'))

    await fetchWithTimeout('https://example.com/', { timeout: 5_000 })

    expect(timeoutSpy).toHaveBeenCalledWith(5_000)
  })

  it('throws an AbortError when the request times out', async () => {
    // Create an already-aborted signal to simulate an immediate timeout
    const controller = new AbortController()
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'))

    timeoutSpy.mockReturnValueOnce(controller.signal)

    mockFetch.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))

    await expect(fetchWithTimeout('https://slow.example.com/', { timeout: 100 })).rejects.toThrow()
  })

  it('passes custom headers through to fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'))

    await fetchWithTimeout('https://example.com/', {
      headers: {
        Authorization: 'Bearer my-token',
        'X-Custom-Header': 'custom-value',
      },
    })

    const [, opts] = mockFetch.mock.calls[0]
    const headers = opts?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-token')
    expect(headers['X-Custom-Header']).toBe('custom-value')
  })

  it('passes POST method and body through to fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Response('created', { status: 201 }))

    await fetchWithTimeout('https://api.example.com/items', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts?.method).toBe('POST')
    expect(opts?.body).toBe(JSON.stringify({ name: 'test' }))
  })

  it('does NOT pass the timeout option as a fetch init property', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'))

    await fetchWithTimeout('https://example.com/', { timeout: 5_000 })

    const [, opts] = mockFetch.mock.calls[0]
    // timeout is a custom extension — must be stripped before calling fetch
    expect(opts).not.toHaveProperty('timeout')
  })

  it('attaches the AbortSignal from AbortSignal.timeout to the fetch call', async () => {
    const fakeSignal = realAbortSignalTimeout(8_000)
    timeoutSpy.mockReturnValueOnce(fakeSignal)
    mockFetch.mockResolvedValueOnce(new Response('ok'))

    await fetchWithTimeout('https://example.com/', { timeout: 8_000 })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts?.signal).toBe(fakeSignal)
    expect(timeoutSpy).toHaveBeenCalledWith(8_000)
  })

  it('propagates non-timeout errors from fetch', async () => {
    const networkError = new TypeError('Failed to fetch')
    mockFetch.mockRejectedValueOnce(networkError)

    await expect(fetchWithTimeout('https://unreachable.example.com/')).rejects.toThrow(
      'Failed to fetch',
    )
  })
})
