/**
 * Tests for server/lib/agents/memory.ts
 *
 * Key behaviour under test:
 *  1. workingMemorySchema — validates the working memory shape
 *  2. storage            — is a PostgresStore singleton
 *  3. memory             — is a SafeMemory (Memory subclass) with correct config
 *  4. SafeMemory.recall  — strips orphaned reasoning parts from conversation history
 *
 * NOTE: @mastra/memory and @mastra/pg are complex ESM packages with circular deps
 * (zod/v3 + zod/v4 + @mastra/core) that conflict with Vitest's static mock hoisting.
 * We use `vi.mock` without a factory (auto-mock) for these packages, then restore
 * only what memory.ts actually needs via `vi.mocked()` + `mockImplementation`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Auto-mock the packages — Vitest replaces every export with a vi.fn() or empty class.
// We then patch what we need in beforeEach / per-test.
vi.mock('@mastra/pg', () => {
  return {
    PostgresStore: class PostgresStore {
      connectionString: string | undefined
      id: string | undefined
      constructor(opts: Record<string, string>) {
        this.connectionString = opts.connectionString
        this.id = opts.id
      }
    },
  }
})

vi.mock('@mastra/memory', async (importOriginal) => {
  // We only need the Memory class to be constructable and have a `recall` method
  // that the SafeMemory subclass can call via `super.recall()`.
  // `importOriginal` is not called — we provide a minimal stand-in.
  void importOriginal
  return {
    Memory: class Memory {
      storage: unknown
      options: unknown
      constructor(opts: { storage: unknown; options: unknown }) {
        this.storage = opts.storage
        this.options = opts.options
      }
      // Default impl: will be overridden per-test via prototype patching below
      async recall(_args: unknown): Promise<{ messages: unknown[] }> {
        return { messages: [] }
      }
    },
  }
})

// After the mocks are registered, import the module under test and its deps.
// Dynamic import is used to ensure Vitest's mock registry is set up first.
const { memory, storage, workingMemorySchema } = await import('@server/lib/agents/memory')
const { Memory } = await import('@mastra/memory')
const { PostgresStore } = await import('@mastra/pg')

// Spy on the Memory prototype's recall method so tests can control it
// without re-importing the module on every test.
const recallSpy = vi.spyOn(Memory.prototype, 'recall')

describe('memory module', () => {
  beforeEach(() => {
    recallSpy.mockReset()
    // Default: return empty message list
    recallSpy.mockResolvedValue({ messages: [] })
  })

  // ── workingMemorySchema ──────────────────────────────────────────────────
  describe('workingMemorySchema', () => {
    it('validates correct data', () => {
      const valid = {
        sandboxId: 'sb-abc',
        projectName: 'My App',
        repoUrl: 'https://github.com/org/repo',
        filesCreated: ['src/index.ts', 'package.json'],
        designDecisions: ['Use Tailwind for styling'],
        buildStatus: 'passing' as const,
      }

      const result = workingMemorySchema.safeParse(valid)
      expect(result.success).toBe(true)
    })

    it('validates with all fields optional (empty object is valid)', () => {
      const result = workingMemorySchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('rejects invalid buildStatus enum value', () => {
      const result = workingMemorySchema.safeParse({ buildStatus: 'running' })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issues = result.error.issues
        expect(issues.some((i) => i.path.includes('buildStatus'))).toBe(true)
      }
    })

    it('accepts all valid buildStatus enum values', () => {
      for (const status of ['pending', 'passing', 'failing'] as const) {
        const result = workingMemorySchema.safeParse({ buildStatus: status })
        expect(result.success).toBe(true)
      }
    })

    it('rejects non-array filesCreated', () => {
      const result = workingMemorySchema.safeParse({ filesCreated: 'not-an-array' })
      expect(result.success).toBe(false)
    })
  })

  // ── storage ──────────────────────────────────────────────────────────────
  describe('storage', () => {
    it('is a PostgresStore instance', () => {
      expect(storage).toBeInstanceOf(PostgresStore)
    })

    it('is constructed with an id matching the storage instance name', () => {
      // The PostgresStore is constructed with { id: 'vibestack-storage', connectionString: DATABASE_URL }.
      // We verify the `id` field since DATABASE_URL may not be set in test env.
      const s = storage as unknown as { id: unknown }
      expect(s.id).toBe('vibestack-storage')
    })
  })

  // ── memory instance ──────────────────────────────────────────────────────
  describe('memory', () => {
    it('is a Memory (SafeMemory) instance', () => {
      expect(memory).toBeInstanceOf(Memory)
    })

    it('is configured with lastMessages: 40', () => {
      const opts = (memory as unknown as { options: { lastMessages: number } }).options
      expect(opts.lastMessages).toBe(40)
    })

    it('is configured with semanticRecall: false', () => {
      const opts = (memory as unknown as { options: { semanticRecall: boolean } }).options
      expect(opts.semanticRecall).toBe(false)
    })

    it('has working memory enabled with thread scope', () => {
      const opts = (
        memory as unknown as {
          options: { workingMemory: { enabled: boolean; scope: string } }
        }
      ).options
      expect(opts.workingMemory.enabled).toBe(true)
      expect(opts.workingMemory.scope).toBe('thread')
    })
  })

  // ── SafeMemory.recall ────────────────────────────────────────────────────
  describe('SafeMemory.recall', () => {
    it('leaves non-assistant messages unchanged', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'You are helpful' },
      ]
      recallSpy.mockResolvedValue({ messages })

      const result = await memory.recall({ threadId: 't1', resourceId: 'r1' })

      expect(result.messages).toEqual(messages)
    })

    it('leaves assistant messages with non-JSON content unchanged', async () => {
      const messages = [{ role: 'assistant', content: 'Plain text response, not JSON' }]
      recallSpy.mockResolvedValue({ messages })

      const result = await memory.recall({ threadId: 't1', resourceId: 'r1' })

      expect(result.messages).toEqual(messages)
    })

    it('strips reasoning parts from assistant messages', async () => {
      const assistantContent = JSON.stringify({
        format: 2,
        parts: [
          { type: 'reasoning', thinking: 'Let me think...' },
          { type: 'text', text: 'Here is my answer.' },
        ],
      })
      const messages = [{ role: 'assistant', content: assistantContent }]
      recallSpy.mockResolvedValue({ messages })

      const result = await memory.recall({ threadId: 't1', resourceId: 'r1' })

      expect(result.messages).toHaveLength(1)
      const parsed = JSON.parse(result.messages[0].content)
      expect(parsed.parts).toHaveLength(1)
      expect(parsed.parts[0].type).toBe('text')
      expect(parsed.parts[0].text).toBe('Here is my answer.')
    })

    it('strips redacted-reasoning parts from assistant messages', async () => {
      const assistantContent = JSON.stringify({
        format: 2,
        parts: [
          { type: 'redacted-reasoning', data: 'encrypted...' },
          { type: 'text', text: 'Final answer.' },
        ],
      })
      const messages = [{ role: 'assistant', content: assistantContent }]
      recallSpy.mockResolvedValue({ messages })

      const result = await memory.recall({ threadId: 't1', resourceId: 'r1' })

      const parsed = JSON.parse(result.messages[0].content)
      expect(parsed.parts.every((p: { type: string }) => p.type !== 'redacted-reasoning')).toBe(
        true,
      )
      expect(parsed.parts).toHaveLength(1)
    })

    it('filters out assistant messages that consist entirely of reasoning parts', async () => {
      const allReasoningContent = JSON.stringify({
        format: 2,
        parts: [
          { type: 'reasoning', thinking: 'Step 1...' },
          { type: 'redacted-reasoning', data: 'enc' },
        ],
      })
      const messages = [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: allReasoningContent },
      ]
      recallSpy.mockResolvedValue({ messages })

      const result = await memory.recall({ threadId: 't1', resourceId: 'r1' })

      // All-reasoning assistant message must be filtered out entirely
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe('user')
    })

    it('returns assistant message unchanged when content has no reasoning parts', async () => {
      const noReasoningContent = JSON.stringify({
        format: 2,
        parts: [
          { type: 'text', text: 'Hello!' },
          { type: 'tool_call', toolName: 'readFile', args: {} },
        ],
      })
      const messages = [{ role: 'assistant', content: noReasoningContent }]
      recallSpy.mockResolvedValue({ messages })

      const result = await memory.recall({ threadId: 't1', resourceId: 'r1' })

      // No parts stripped — same message object reference returned unchanged
      expect(result.messages[0]).toBe(messages[0])
    })

    it('passes recall arguments through to the base class', async () => {
      recallSpy.mockResolvedValue({ messages: [] })

      const args = { threadId: 'thread-abc', resourceId: 'resource-xyz', limit: 10 }
      await memory.recall(args)

      expect(recallSpy).toHaveBeenCalledWith(args)
    })

    it('preserves other fields on the result (e.g. workingMemory)', async () => {
      const workingMemory = { sandboxId: 'sb-001', buildStatus: 'passing' }
      recallSpy.mockResolvedValue({ messages: [], workingMemory })

      const result = await memory.recall({ threadId: 't1', resourceId: 'r1' })

      expect(result.workingMemory).toEqual(workingMemory)
    })
  })
})
