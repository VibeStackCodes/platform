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

  it('createDirectProvider uses API key from env', async () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test'

    const { createDirectProvider } = await import('@server/lib/agents/provider')
    const { createOpenAI } = await import('@ai-sdk/openai')

    createDirectProvider('openai')

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-openai-test',
      }),
    )
  })

  it('createDirectProvider does not set baseURL or headers', async () => {
    process.env.OPENAI_API_KEY = 'sk-openai-test'

    const { createDirectProvider } = await import('@server/lib/agents/provider')
    const { createOpenAI } = await import('@ai-sdk/openai')

    createDirectProvider('openai')

    expect(createOpenAI).not.toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.anything(),
      }),
    )
    expect(createOpenAI).not.toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.anything(),
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

  it('ALLOWED_MODELS contains all configured model IDs', async () => {
    const { ALLOWED_MODELS } = await import('@server/lib/agents/provider')
    expect(ALLOWED_MODELS).toEqual(['gpt-5.2-codex', 'claude-opus-4-6', 'claude-sonnet-4-6'])
  })
})
