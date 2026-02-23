import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @ai-sdk/openai before importing
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn((config: Record<string, unknown>) => {
    const provider = (model: string) => ({ model, ...config })
    provider._config = config
    return provider
  }),
}))

describe('Agent Provider', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('routes through Helicone when HELICONE_API_KEY is set', async () => {
    process.env.HELICONE_API_KEY = 'sk-helicone-test'
    process.env.OPENAI_API_KEY = 'sk-openai-test'

    const { createHeliconeProvider } = await import('@server/lib/agents/provider')
    const { createOpenAI } = await import('@ai-sdk/openai')

    createHeliconeProvider('user-123')

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://oai.helicone.ai/v1',
        headers: expect.objectContaining({
          'Helicone-Auth': 'Bearer sk-helicone-test',
          'Helicone-User-Id': 'user-123',
        }),
      }),
    )
  })

  it('falls back to direct OpenAI when HELICONE_API_KEY is not set', async () => {
    delete process.env.HELICONE_API_KEY
    process.env.OPENAI_API_KEY = 'sk-openai-test'

    const { createHeliconeProvider } = await import('@server/lib/agents/provider')
    const { createOpenAI } = await import('@ai-sdk/openai')

    createHeliconeProvider('user-123')

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-openai-test',
      }),
    )
    expect(createOpenAI).not.toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.stringContaining('helicone'),
      }),
    )
  })

  it('isAllowedModel validates correctly', async () => {
    const { isAllowedModel } = await import('@server/lib/agents/provider')

    expect(isAllowedModel('gpt-5.2-codex')).toBe(true)
    expect(isAllowedModel('gpt-5.2')).toBe(false)
    expect(isAllowedModel('gpt-5-mini')).toBe(false)
    expect(isAllowedModel('claude-sonnet')).toBe(false)
  })

  it('ALLOWED_MODELS contains only gpt-5.2-codex', async () => {
    const { ALLOWED_MODELS } = await import('@server/lib/agents/provider')
    expect(ALLOWED_MODELS).toEqual(['gpt-5.2-codex'])
  })
})
