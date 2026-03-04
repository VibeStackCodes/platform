// tests/conversation-store.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock Mastra memory
const mockRecall = vi.fn()
const mockSaveMessages = vi.fn()
vi.mock('@server/lib/agents/memory', () => ({
  memory: {
    recall: mockRecall,
    saveMessages: mockSaveMessages,
  },
}))

describe('MastraConversationStore', () => {
  let store: import('@server/lib/conversation-store/mastra').MastraConversationStore

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@server/lib/conversation-store/mastra')
    store = new mod.MastraConversationStore()
  })

  describe('getMessages', () => {
    it('returns transformed messages from Mastra memory', async () => {
      mockRecall.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            createdAt: new Date('2026-03-04T00:00:00Z'),
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'Build me an app' }],
            },
          },
          {
            id: 'msg-2',
            role: 'assistant',
            createdAt: new Date('2026-03-04T00:01:00Z'),
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'Sure, creating sandbox...' }],
            },
          },
        ],
      })

      const result = await store.getMessages('project-1', 'user-1')

      expect(mockRecall).toHaveBeenCalledWith({
        threadId: 'project-1',
        resourceId: 'user-1',
      })
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0]).toMatchObject({ id: 'msg-1', role: 'user', type: 'message' })
      expect(result.messages[1]).toMatchObject({ id: 'msg-2', role: 'assistant', type: 'message' })
      expect(result.queryLatencyMs).toBeGreaterThanOrEqual(0)
    })

    it('returns empty messages when Mastra memory has no messages', async () => {
      mockRecall.mockResolvedValue({ messages: [] })

      const result = await store.getMessages('project-1', 'user-1')

      expect(result.messages).toEqual([])
      expect(result.queryLatencyMs).toBeGreaterThanOrEqual(0)
    })

    it('returns empty messages when Mastra memory throws', async () => {
      mockRecall.mockRejectedValue(new Error('Mastra unavailable'))

      const result = await store.getMessages('project-1', 'user-1')

      expect(result.messages).toEqual([])
      expect(result.queryLatencyMs).toBeGreaterThanOrEqual(0)
    })

    it('skips tool-role messages', async () => {
      mockRecall.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            createdAt: new Date('2026-03-04T00:00:00Z'),
            content: { format: 2, parts: [{ type: 'text', text: 'Build app' }] },
          },
          {
            id: 'msg-tool',
            role: 'tool',
            createdAt: new Date('2026-03-04T00:00:30Z'),
            content: { format: 2, parts: [{ type: 'text', text: 'internal' }] },
          },
          {
            id: 'msg-2',
            role: 'assistant',
            createdAt: new Date('2026-03-04T00:01:00Z'),
            content: { format: 2, parts: [{ type: 'text', text: 'Done!' }] },
          },
        ],
      })

      const { messages } = await store.getMessages('project-1', 'user-1')

      expect(messages).toHaveLength(2)
      expect(messages.every((m) => m.role !== 'tool')).toBe(true)
    })

    it('extracts tool-invocation parts as tool_complete events', async () => {
      mockRecall.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            createdAt: new Date('2026-03-04T00:00:00Z'),
            content: {
              format: 2,
              parts: [
                { type: 'text', text: 'Creating sandbox...' },
                {
                  type: 'tool-invocation',
                  toolInvocation: {
                    toolName: 'createSandbox',
                    args: { snapshot: 'snap-1' },
                    result: { sandboxId: 'sb-123' },
                  },
                },
              ],
            },
          },
        ],
      })

      const { messages } = await store.getMessages('project-1', 'user-1')

      // Should produce two events: text message + tool_complete
      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({ type: 'message', role: 'assistant' })
      expect(messages[1]).toMatchObject({
        type: 'tool_complete',
        role: 'assistant',
      })
    })

    it('strips large content fields from writeFile tool args', async () => {
      mockRecall.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            createdAt: new Date('2026-03-04T00:00:00Z'),
            content: {
              format: 2,
              parts: [
                {
                  type: 'tool-invocation',
                  toolInvocation: {
                    toolName: 'writeFile',
                    args: { path: '/src/App.tsx', content: 'const x = 1;\n'.repeat(1000) },
                    result: { success: true },
                  },
                },
              ],
            },
          },
        ],
      })

      const { messages } = await store.getMessages('project-1', 'user-1')

      const toolEvent = messages.find((m) => m.type === 'tool_complete')
      expect(toolEvent).toBeDefined()
      const toolPart = (toolEvent ?? { parts: [] }).parts[0] as Record<string, unknown>
      const args = toolPart.args as Record<string, unknown>
      expect(args.path).toBe('/src/App.tsx')
      expect(args.content).toBeUndefined()
    })

    it('handles string content format (legacy)', async () => {
      mockRecall.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            createdAt: new Date('2026-03-04T00:00:00Z'),
            content: 'Hello world',
          },
        ],
      })

      const { messages } = await store.getMessages('project-1', 'user-1')

      expect(messages).toHaveLength(1)
      expect(messages[0].parts).toEqual([{ text: 'Hello world' }])
    })

    it('extracts summary from JSON assistant content', async () => {
      mockRecall.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            createdAt: new Date('2026-03-04T00:00:00Z'),
            content: {
              format: 2,
              parts: [{ type: 'text', text: '{"summary":"App built successfully"}' }],
            },
          },
        ],
      })

      const { messages } = await store.getMessages('project-1', 'user-1')

      expect(messages).toHaveLength(1)
      expect((messages[0].parts[0] as { text: string }).text).toBe('App built successfully')
    })

    it('skips assistant messages with empty text content', async () => {
      mockRecall.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            createdAt: new Date('2026-03-04T00:00:00Z'),
            content: { format: 2, parts: [{ type: 'text', text: '  ' }] },
          },
        ],
      })

      const { messages } = await store.getMessages('project-1', 'user-1')

      expect(messages).toEqual([])
    })
  })

  describe('saveMessage', () => {
    it('persists via Mastra memory.saveMessages', async () => {
      mockSaveMessages.mockResolvedValue(undefined)

      const result = await store.saveMessage('project-1', 'user-1', {
        id: 'msg-new',
        role: 'assistant',
        type: 'message',
        parts: [{ type: 'text', text: 'Deployed!' }],
      })

      expect(mockSaveMessages).toHaveBeenCalledWith({
        messages: [
          expect.objectContaining({
            id: 'msg-new',
            role: 'assistant',
            threadId: 'project-1',
            resourceId: 'user-1',
            type: 'text',
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'Deployed!' }],
            },
          }),
        ],
      })
      expect(result).toMatchObject({ id: 'msg-new', role: 'assistant' })
    })

    it('returns null when Mastra fails', async () => {
      mockSaveMessages.mockRejectedValue(new Error('Mastra down'))

      const result = await store.saveMessage('project-1', 'user-1', {
        id: 'msg-new',
        role: 'assistant',
        type: 'message',
        parts: [{ type: 'text', text: 'Deployed!' }],
      })

      expect(result).toBeNull()
    })
  })
})
