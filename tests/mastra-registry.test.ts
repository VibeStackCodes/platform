import { describe, it, expect, vi } from 'vitest'

// Mock @mastra/pg to avoid real DB connection
vi.mock('@mastra/pg', () => {
  class PostgresStore {
    init = vi.fn()
    getStore = vi.fn()
    __setLogger = vi.fn()
  }
  return { PostgresStore }
})

// Mock @mastra/langfuse
vi.mock('@mastra/langfuse', () => {
  class LangfuseExporter {
    name = 'langfuse'
    exportTracingEvent = vi.fn()
    shutdown = vi.fn()
  }
  return { LangfuseExporter }
})

// Mock @mastra/core/mastra to avoid complex initialization requiring real storage
vi.mock('@mastra/core/mastra', () => {
  class Mastra {
    // stub — no-op registry
  }
  return { Mastra }
})

// Mock @mastra/memory to avoid real memory initialization
vi.mock('@mastra/memory', () => {
  class Memory {
    // stub — no-op memory
  }
  return { Memory }
})

describe('Mastra registry', () => {
  it('exports mastra instance with memory and storage', async () => {
    const { mastra, memory, storage } = await import('@server/lib/agents/mastra')
    expect(mastra).toBeDefined()
    expect(memory).toBeDefined()
    expect(storage).toBeDefined()
  })

  it('exports working memory schema', async () => {
    const { workingMemorySchema } = await import('@server/lib/agents/mastra')
    const result = workingMemorySchema.safeParse({
      sandboxId: 'test-123',
      buildStatus: 'passing',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid working memory', async () => {
    const { workingMemorySchema } = await import('@server/lib/agents/mastra')
    const result = workingMemorySchema.safeParse({
      buildStatus: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})
