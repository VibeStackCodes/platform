import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyEdit } from '@server/lib/relace'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('applyEdit', () => {
  beforeEach(() => {
    vi.stubEnv('RELACE_API_KEY', 'test-key')
    mockFetch.mockReset()
  })

  it('sends correct request and returns merged code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mergedCode: 'const x = 1\nconst y = 2\n',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    })

    const result = await applyEdit({
      initialCode: 'const x = 1\n',
      editSnippet: 'const x = 1\nconst y = 2\n',
    })

    expect(result.mergedCode).toBe('const x = 1\nconst y = 2\n')
    expect(result.usage.total_tokens).toBe(150)

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('https://instantapply.endpoint.relace.run/v1/code/apply')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.model).toBe('relace-apply-3')
    expect(body.initial_code).toBe('const x = 1\n')
    expect(body.edit_snippet).toBe('const x = 1\nconst y = 2\n')
    expect(body.stream).toBe(false)
    expect(opts.headers.Authorization).toBe('Bearer test-key')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    await expect(
      applyEdit({
        initialCode: 'x',
        editSnippet: 'y',
      }),
    ).rejects.toThrow('Relace API error 500')
  })

  it('throws when RELACE_API_KEY is missing', async () => {
    vi.stubEnv('RELACE_API_KEY', '')

    await expect(
      applyEdit({
        initialCode: 'x',
        editSnippet: 'y',
      }),
    ).rejects.toThrow('RELACE_API_KEY')
  })

  it('passes optional instruction', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mergedCode: 'result',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    })

    await applyEdit({
      initialCode: 'code',
      editSnippet: 'edit',
      instruction: 'Make it blue',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.instruction).toBe('Make it blue')
  })
})
