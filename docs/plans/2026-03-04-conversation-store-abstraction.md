# ConversationStore Abstraction + chatMessages Table Removal

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Abstract the conversation data layer behind a `ConversationStore` interface so the storage backend (Mastra/PostgreSQL today, MongoDB later) can be swapped without touching consumers. Remove the legacy `chatMessages` Drizzle table — Mastra Memory is the single source of truth.

**Architecture:** Extract the message retrieval logic from `projects.ts` into a `ConversationStore` interface with a `MastraConversationStore` implementation. Remove the `chatMessages` table, its Drizzle schema, query functions, relations, and all fallback code. Write a SQL migration that drops the table (NOT applied). Add lightweight monitoring via an admin endpoint.

**Tech Stack:** Hono, Mastra Memory, PostgreSQL, Vitest

---

## Context for Implementer

### Current Architecture
- **Primary conversation store**: Mastra `Memory` with `PostgresStore` backend (`server/lib/agents/memory.ts`). Manages its own internal tables — we don't control their schema.
- **Legacy fallback store**: `chatMessages` Drizzle table (`server/lib/db/schema.ts:36-45`). Used when Mastra memory is unavailable. **This is being removed.**
- **Message retrieval**: `GET /api/projects/:id/messages` in `server/routes/projects.ts:268-398` has inline two-tier logic: try Mastra → fallback to chatMessages → transform to API format.
- **Message writes**: Mastra agent auto-persists via `savePerStep: true`. Deploy route uses `memory.saveMessages()` directly. Legacy `insertChatMessage()` exists but is never called from active code paths.

### What This Plan Changes
1. New `ConversationStore` interface + `MastraConversationStore` implementation (Mastra-only, no fallback)
2. `projects.ts` message route refactored to use `ConversationStore`
3. `projects-deploy.ts` refactored to use `ConversationStore`
4. **Remove**: `chatMessages` from Drizzle schema, relations, queries, and tests
5. SQL migration to DROP `chat_messages` table (written, NOT applied)
6. Monitoring admin endpoint for conversation store health
7. Tests for ConversationStore

### What This Plan Does NOT Change
- Mastra Memory configuration (stays as-is in `memory.ts`)
- Agent write path (still Mastra-managed via `savePerStep: true`)
- Credit system, auth, SSE streaming
- Any client-side code
- `profiles`, `projects`, `usageEvents` tables

### Files Affected

**Create:**
- `server/lib/conversation-store/types.ts`
- `server/lib/conversation-store/mastra.ts`
- `server/lib/conversation-store/index.ts`
- `tests/conversation-store.test.ts`
- `supabase/migrations/20260304120000_drop_chat_messages.sql`

**Modify:**
- `server/routes/projects.ts` — replace inline Mastra logic + chatMessages fallback with `conversationStore.getMessages()`
- `server/routes/projects-deploy.ts` — replace `memory.saveMessages()` with `conversationStore.saveMessage()`
- `server/lib/db/schema.ts` — remove `chatMessages` table + `ChatMessage` type
- `server/lib/db/relations.ts` — remove `chatMessagesRelations` + `chatMessages: many(chatMessages)` from projects
- `server/lib/db/queries.ts` — remove `insertChatMessage`, `getProjectMessages`, `getProjectWithMessages`
- `server/lib/db/CLAUDE.md` — update to reflect removal
- `server/routes/admin.ts` — add monitoring endpoint
- `tests/projects-route.test.ts` — remove `getProjectMessages` mocks, mock `conversationStore` instead
- `tests/db-queries.test.ts` — remove chatMessages test cases

---

## Task 1: Create Branch

**Step 1: Create and switch to feature branch**

```bash
cd /Users/ammishra/VibeStack/platform
git checkout -b feature/conversation-store-abstraction
```

**Step 2: Verify clean state**

```bash
git status
```

Expected: clean working tree on `feature/conversation-store-abstraction`

---

## Task 2: Define ConversationStore Interface

**Files:**
- Create: `server/lib/conversation-store/types.ts`

**Step 1: Write the interface**

```typescript
// server/lib/conversation-store/types.ts

/**
 * ConversationStore — abstract interface for conversation persistence.
 *
 * Decouples message retrieval/storage from the underlying backend
 * (Mastra/PostgreSQL today, MongoDB or other document stores later).
 *
 * The agent WRITE path is Mastra-managed (savePerStep: true).
 * This interface abstracts the READ path + auxiliary writes
 * (deploy messages, system events).
 */

export interface ConversationMessage {
  id: string
  role: string
  type: string
  parts: unknown[]
  createdAt: Date | string
}

export interface ConversationStoreResult {
  messages: ConversationMessage[]
  /** Time in ms to retrieve messages (recall latency) */
  queryLatencyMs: number
}

export interface ConversationStore {
  /**
   * Retrieve all messages for a project, ordered by creation time ascending.
   * Returns messages + query latency for monitoring.
   */
  getMessages(projectId: string, userId: string): Promise<ConversationStoreResult>

  /**
   * Persist a single message to the store.
   * Used for auxiliary writes (deploy messages, system events).
   * Agent conversation messages are persisted by Mastra Memory automatically.
   */
  saveMessage(
    projectId: string,
    userId: string,
    message: Pick<ConversationMessage, 'id' | 'role' | 'type' | 'parts'>,
  ): Promise<ConversationMessage | null>

  /**
   * Collect global store metrics for monitoring.
   * Used by admin endpoints to decide when to migrate to MongoDB.
   */
  getGlobalMetrics(): Promise<ConversationStoreGlobalMetrics>
}

export interface ConversationStoreGlobalMetrics {
  /** Total conversation threads across all projects */
  totalThreads: number
  /** Total messages across all threads */
  totalMessages: number
  /** Average messages per thread */
  avgMessagesPerThread: number
  /** Largest thread by message count */
  largestThreadMessageCount: number
  /** Approximate total storage size in bytes (table + indexes + toast) */
  tableSizeBytes: number
  /** Approximate total size of message content (jsonb) in bytes */
  contentSizeBytes: number
  /** Average message content size in bytes */
  avgContentSizeBytes: number
  /** P95 message content size in bytes (flags outlier large messages) */
  p95ContentSizeBytes: number
  /** Time in milliseconds to execute the full metrics query */
  queryLatencyMs: number
}
```

**Step 2: Commit**

```bash
git add server/lib/conversation-store/types.ts
git commit -m "feat: define ConversationStore interface for backend-agnostic conversation persistence"
```

---

## Task 3: Implement MastraConversationStore

**Files:**
- Create: `server/lib/conversation-store/mastra.ts`
- Create: `server/lib/conversation-store/index.ts`
- Create: `tests/conversation-store.test.ts`

This implementation extracts the Mastra retrieval + transformation logic currently inline in `server/routes/projects.ts:278-398`.

**Step 1: Write the failing test**

```typescript
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
      const toolPart = toolEvent!.parts[0] as Record<string, unknown>
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
        threadId: 'project-1',
        resourceId: 'user-1',
        messages: [
          expect.objectContaining({
            id: 'msg-new',
            role: 'assistant',
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
```

**Step 2: Run test to verify it fails**

```bash
bun run test -- tests/conversation-store.test.ts
```

Expected: FAIL — module `@server/lib/conversation-store/mastra` not found

**Step 3: Implement MastraConversationStore**

Extract the transformation logic from `server/routes/projects.ts:278-398` into this class. The logic must be faithful to the existing behavior — same tool label mapping, same content parsing, same field stripping.

Reference the existing inline logic in `projects.ts` carefully. The key behaviors to preserve:
- Skip `tool` role messages
- Parse string content (try JSON, extract `parts` or `summary`)
- Parse object content (extract `parts` array)
- Extract `tool-invocation` parts as separate `tool_complete` events
- Use `TOOL_LABELS` mapping for human-readable labels (match the existing function-based labels in projects.ts)
- Strip `content`/`files`/`newContent` from writeFile/editFile/writeFiles args
- Extract `filePath` from args
- Skip `INTERNAL_TOOLS` (check projects.ts for the current set)
- Skip assistant messages with empty text after processing
- Extract `summary` from JSON-shaped assistant text

```typescript
// server/lib/conversation-store/mastra.ts

import type {
  ConversationMessage,
  ConversationStore,
  ConversationStoreGlobalMetrics,
  ConversationStoreResult,
} from './types'

/** Tools to hide from conversation history (internal agent bookkeeping). */
const INTERNAL_TOOLS = new Set(['getPreviewUrl'])

/**
 * Tool label mapping — derives human-readable labels from tool name + args.
 * Matches the existing TOOL_LABELS in projects.ts.
 */
const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  createSandbox: () => 'Creating sandbox',
  writeFile: (a) => `Writing ${a.path ?? 'file'}`,
  writeFiles: (a) => {
    const files = a.files as Array<{ path: string }> | undefined
    return files ? `Writing ${files.length} files` : 'Writing files'
  },
  readFile: (a) => `Reading ${a.path ?? 'file'}`,
  editFile: (a) => `Editing ${a.path ?? 'file'}`,
  listFiles: () => 'Listing files',
  runCommand: (a) => `Running: ${(a.command as string)?.slice(0, 60) ?? 'command'}`,
  runBuild: () => 'Running build',
  installPackage: (a) => `Installing ${a.name ?? 'package'}`,
  commitAndPush: () => 'Committing to GitHub',
  webSearch: (a) => `Searching: ${(a.query as string)?.slice(0, 40) ?? 'web'}`,
}

/**
 * Mastra Memory-backed ConversationStore.
 *
 * Single-tier: reads/writes go through Mastra Memory only.
 * No legacy chatMessages fallback — that table is being removed.
 */
export class MastraConversationStore implements ConversationStore {
  async getMessages(projectId: string, userId: string): Promise<ConversationStoreResult> {
    const start = performance.now()
    try {
      const { memory } = await import('../agents/memory')
      const result = await memory.recall({
        threadId: projectId,
        resourceId: userId,
      })

      const elapsed = Math.round((performance.now() - start) * 100) / 100

      if (!result?.messages || result.messages.length === 0) {
        return { messages: [], queryLatencyMs: elapsed }
      }

      return {
        messages: this.transformMastraMessages(result.messages),
        queryLatencyMs: elapsed,
      }
    } catch (err) {
      const elapsed = Math.round((performance.now() - start) * 100) / 100
      console.error('[conversation-store] Mastra recall failed:', err)
      return { messages: [], queryLatencyMs: elapsed }
    }
  }

  async saveMessage(
    projectId: string,
    userId: string,
    message: Pick<ConversationMessage, 'id' | 'role' | 'type' | 'parts'>,
  ): Promise<ConversationMessage | null> {
    try {
      const { memory } = await import('../agents/memory')
      await memory.saveMessages({
        threadId: projectId,
        resourceId: userId,
        messages: [
          {
            id: message.id,
            role: message.role as 'user' | 'assistant',
            content: {
              format: 2 as const,
              parts: (message.parts as { type: string; text: string }[]).map((p) => ({
                type: p.type as 'text',
                text: p.text ?? '',
              })),
            },
          },
        ],
      })
      return { ...message, createdAt: new Date() }
    } catch (err) {
      console.error('[conversation-store] Mastra saveMessages failed:', err)
      return null
    }
  }

  async getGlobalMetrics(): Promise<ConversationStoreGlobalMetrics> {
    // Mastra manages its own tables — we query them via raw SQL.
    // Table name: 'mastra_messages' (PostgresStore default).
    // Columns: id, threadId, content (jsonb), role, type, createdAt
    try {
      const { db } = await import('../db/client')
      const { sql } = await import('drizzle-orm')
      const start = performance.now()

      // Single query: thread stats + size stats + p95 content size
      const result = await db.execute(
        sql`WITH thread_stats AS (
              SELECT
                COUNT(DISTINCT "threadId")::int AS total_threads,
                COUNT(*)::int AS total_messages,
                ROUND(COUNT(*)::numeric / GREATEST(COUNT(DISTINCT "threadId"), 1))::int AS avg_per_thread,
                MAX(thread_cnt)::int AS largest_thread
              FROM mastra_messages
              CROSS JOIN LATERAL (
                SELECT COUNT(*) AS thread_cnt
                FROM mastra_messages m2
                WHERE m2."threadId" = mastra_messages."threadId"
                GROUP BY m2."threadId"
              ) sub
            ),
            size_stats AS (
              SELECT
                pg_total_relation_size('mastra_messages')::bigint AS table_size_bytes,
                COALESCE(SUM(pg_column_size(content)), 0)::bigint AS content_size_bytes,
                COALESCE(AVG(pg_column_size(content)), 0)::int AS avg_content_bytes,
                COALESCE(
                  percentile_cont(0.95) WITHIN GROUP (ORDER BY pg_column_size(content)),
                  0
                )::int AS p95_content_bytes
              FROM mastra_messages
            )
            SELECT
              t.total_threads,
              t.total_messages,
              t.avg_per_thread,
              t.largest_thread,
              s.table_size_bytes,
              s.content_size_bytes,
              s.avg_content_bytes,
              s.p95_content_bytes
            FROM thread_stats t, size_stats s`,
      )

      const elapsed = performance.now() - start
      const row = result.rows[0] as {
        total_threads: number
        total_messages: number
        avg_per_thread: number
        largest_thread: number
        table_size_bytes: number
        content_size_bytes: number
        avg_content_bytes: number
        p95_content_bytes: number
      } | undefined

      return {
        totalThreads: row?.total_threads ?? 0,
        totalMessages: row?.total_messages ?? 0,
        avgMessagesPerThread: row?.avg_per_thread ?? 0,
        largestThreadMessageCount: row?.largest_thread ?? 0,
        tableSizeBytes: Number(row?.table_size_bytes ?? 0),
        contentSizeBytes: Number(row?.content_size_bytes ?? 0),
        avgContentSizeBytes: row?.avg_content_bytes ?? 0,
        p95ContentSizeBytes: row?.p95_content_bytes ?? 0,
        queryLatencyMs: Math.round(elapsed * 100) / 100,
      }
    } catch (err) {
      console.error('[conversation-store] Metrics query failed:', err)
      return {
        totalThreads: 0,
        totalMessages: 0,
        avgMessagesPerThread: 0,
        largestThreadMessageCount: 0,
        tableSizeBytes: 0,
        contentSizeBytes: 0,
        avgContentSizeBytes: 0,
        p95ContentSizeBytes: 0,
        queryLatencyMs: -1,
      }
    }
  }

  // ── Private: Mastra message transformation ─────────────────

  /**
   * Transform Mastra messages into ConversationMessage format.
   *
   * Faithfully reproduces the logic previously inline in
   * server/routes/projects.ts GET /:id/messages handler.
   */
  private transformMastraMessages(
    // biome-ignore lint/suspicious/noExplicitAny: Mastra message type is opaque
    messages: any[],
  ): ConversationMessage[] {
    const events: ConversationMessage[] = []

    for (const msg of messages) {
      if ((msg.role as string) === 'tool') continue

      // biome-ignore lint/suspicious/noExplicitAny: Mastra content type varies
      const content = msg.content as any
      let textContent = ''
      // biome-ignore lint/suspicious/noExplicitAny: parts shape varies
      let parts: any[] | null = null

      // Extract parts array from content (string JSON or object)
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content)
          if (parsed?.parts && Array.isArray(parsed.parts)) {
            parts = parsed.parts
          } else if (typeof parsed?.summary === 'string') {
            textContent = parsed.summary
          } else {
            textContent = content
          }
        } catch {
          textContent = content
        }
      } else if (content && typeof content === 'object') {
        if (content.parts && Array.isArray(content.parts)) {
          parts = content.parts
        } else if (Array.isArray(content)) {
          parts = content
        }
      }

      // Process parts array: extract text and tool-invocations
      if (parts) {
        const textParts: string[] = []
        for (const part of parts) {
          if (part.type === 'text' && part.text) {
            textParts.push(part.text)
          } else if (part.type === 'tool-invocation' && part.toolInvocation) {
            const inv = part.toolInvocation
            const toolName = inv.toolName ?? inv.name ?? 'unknown'

            if (INTERNAL_TOOLS.has(toolName)) continue

            const labelFn = TOOL_LABELS[toolName]
            const args = inv.args ?? {}
            const label = labelFn ? labelFn(args) : toolName

            const filePath = (args.path as string) ?? (args.filePath as string) ?? undefined

            // Strip large content fields
            const leanArgs =
              toolName === 'writeFile' || toolName === 'editFile'
                ? { path: args.path }
                : { ...args }
            if (toolName === 'writeFiles') {
              delete leanArgs.files
            }

            events.push({
              id: `tool-${msg.id}-${toolName}-${events.length}`,
              role: 'assistant',
              type: 'tool_complete',
              parts: [
                {
                  type: 'tool_complete',
                  tool: toolName,
                  label,
                  filePath,
                  args: leanArgs,
                },
              ],
              createdAt: msg.createdAt,
            })
          }
        }
        textContent = textParts.join('')
      }

      // Extract summary from structured output JSON
      if (textContent.startsWith('{') && textContent.includes('"summary"')) {
        try {
          const parsed = JSON.parse(textContent)
          if (typeof parsed?.summary === 'string') {
            textContent = parsed.summary
          }
        } catch {
          // Not valid JSON, keep as-is
        }
      }

      // Skip assistant messages with empty text
      if (msg.role === 'assistant' && !textContent.trim()) continue

      events.push({
        id: msg.id,
        role: msg.role,
        type: 'message',
        parts: [{ text: textContent }],
        createdAt: msg.createdAt,
      })
    }

    return events
  }
}
```

```typescript
// server/lib/conversation-store/index.ts

export type {
  ConversationMessage,
  ConversationStore,
  ConversationStoreGlobalMetrics,
  ConversationStoreResult,
} from './types'
export { MastraConversationStore } from './mastra'

import { MastraConversationStore } from './mastra'

/**
 * Default singleton instance.
 * Import this in route handlers instead of constructing directly.
 *
 * To swap backends (e.g., MongoDB), replace this with a different
 * ConversationStore implementation. No consumer code changes needed.
 */
export const conversationStore: import('./types').ConversationStore = new MastraConversationStore()
```

**Step 4: Run tests**

```bash
bun run test -- tests/conversation-store.test.ts
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add server/lib/conversation-store/ tests/conversation-store.test.ts
git commit -m "feat: implement MastraConversationStore (Mastra-only, no legacy fallback)"
```

---

## Task 4: Refactor Routes to Use ConversationStore

**Files:**
- Modify: `server/routes/projects.ts` — replace inline Mastra logic + chatMessages fallback
- Modify: `server/routes/projects-deploy.ts` — replace direct `memory.saveMessages()`
- Modify: `tests/projects-route.test.ts` — mock `conversationStore` instead of `getProjectMessages`

**Step 1: Refactor projects.ts GET /:id/messages**

In `server/routes/projects.ts`, the handler at lines 268-398 should be replaced. Remove:
- The `import('../lib/agents/memory')` call
- The inline `TOOL_LABELS` mapping (if defined in this file)
- The inline `INTERNAL_TOOLS` set (if defined in this file)
- The entire try/catch block with Mastra recall + message transformation
- The chatMessages fallback at line 395
- The `getProjectMessages` import

Replace with:

```typescript
import { conversationStore } from '../lib/conversation-store'

// Inside the GET /:id/messages handler, after ownership check:
const { messages, queryLatencyMs } = await conversationStore.getMessages(id, user.id)
c.header('X-Query-Latency-Ms', String(queryLatencyMs))
return c.json(messages)
```

Also remove `getProjectMessages` from the imports at the top of the file. If `TOOL_LABELS` and `INTERNAL_TOOLS` are defined only in this file and not used elsewhere, delete them.

**Step 2: Refactor projects-deploy.ts**

Replace the direct `memory` import and `memory.saveMessages()` call. In `server/routes/projects-deploy.ts`:
- Remove: `import { memory } from '../lib/agents/memory'`
- Add: `import { conversationStore } from '../lib/conversation-store'`
- Replace the `memory.saveMessages()` call (~line 169) with:

```typescript
await conversationStore.saveMessage(projectId, userId, {
  id: crypto.randomUUID(),
  role: 'assistant',
  type: 'message',
  parts: [{ type: 'text', text: `App deployed to ${deployUrl}` }],
})
```

Note: The exact variable names (`projectId`, `userId`, `deployUrl`) depend on the handler scope — read the file to confirm.

**Step 3: Update tests/projects-route.test.ts**

- Remove `getProjectMessages` from the mock setup and assertions
- Add mock for `conversationStore`:

```typescript
const mockGetMessages = vi.fn()
vi.mock('@server/lib/conversation-store', () => ({
  conversationStore: {
    getMessages: mockGetMessages,
  },
}))
```

- Update test cases that assert message retrieval to use `mockGetMessages`

**Step 4: Run tests**

```bash
bun run test -- tests/projects-route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/projects.ts server/routes/projects-deploy.ts tests/projects-route.test.ts
git commit -m "refactor: use ConversationStore in routes, remove inline Mastra logic and chatMessages fallback"
```

---

## Task 5: Remove chatMessages from Drizzle Schema, Relations, and Queries

**Files:**
- Modify: `server/lib/db/schema.ts`
- Modify: `server/lib/db/relations.ts`
- Modify: `server/lib/db/queries.ts`
- Modify: `server/lib/db/CLAUDE.md`
- Modify: `tests/db-queries.test.ts`

**Step 1: Remove from schema.ts**

Delete the `chatMessages` table definition and the `ChatMessage` type export:

```typescript
// DELETE these lines from schema.ts:
export const chatMessages = pgTable('chat_messages', { ... })
export type ChatMessage = typeof chatMessages.$inferSelect
```

**Step 2: Remove from relations.ts**

- Delete the `chatMessagesRelations` definition
- Remove the `chatMessages` import
- Remove `chatMessages: many(chatMessages)` from `projectsRelations`

After removal, `projectsRelations` should look like:

```typescript
export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(profiles, { fields: [projects.userId], references: [profiles.id] }),
  usageEvents: many(usageEvents),
}))
```

**Step 3: Remove from queries.ts**

Delete these functions entirely:
- `getProjectMessages()` (~lines 136-148)
- `insertChatMessage()` (~lines 151-164)
- `getProjectWithMessages()` (~lines 169-174)

Remove the `chatMessages` import from the imports at the top.

**Step 4: Update CLAUDE.md**

In `server/lib/db/CLAUDE.md`:
- Change "5 tables" to "4 tables" (or correct count)
- Remove references to `chatMessages` in the schema description
- Remove `insertChatMessage()` from the queries description
- Remove `projects→chatMessages (1:many)` from relations

**Step 5: Update tests/db-queries.test.ts**

- Remove the `chatMessages` mock in schema mocks
- Remove the `insertChatMessage` and `getProjectWithMessages` imports
- Remove test cases for `insertChatMessage()` (~lines 306-388)
- Remove any test cases for `getProjectWithMessages()`

**Step 6: Run tests**

```bash
bun run test
```

Expected: PASS (some tests may need mock adjustments if they reference chatMessages)

**Step 7: Commit**

```bash
git add server/lib/db/schema.ts server/lib/db/relations.ts server/lib/db/queries.ts server/lib/db/CLAUDE.md tests/db-queries.test.ts
git commit -m "refactor: remove chatMessages table, relations, and query functions (Mastra Memory is sole store)"
```

---

## Task 6: Write DROP TABLE Migration (DO NOT APPLY)

**Files:**
- Create: `supabase/migrations/20260304120000_drop_chat_messages.sql`

**Step 1: Write the migration**

```sql
-- ============================================================================
-- Drop legacy chat_messages table
-- ============================================================================
--
-- WHY: Conversation data is now stored exclusively in Mastra Memory
-- (PostgresStore-managed tables). The chat_messages table was a legacy
-- fallback that is no longer read or written by any code path.
--
-- PREREQUISITES:
--   1. Verify no queries hit chat_messages: search codebase for 'chat_messages'
--   2. Confirm Mastra Memory has all historical conversations
--   3. Take a backup of chat_messages before dropping (pg_dump --table=chat_messages)
--
-- DO NOT APPLY THIS MIGRATION WITHOUT VERIFYING PREREQUISITES.
-- ============================================================================

BEGIN;

-- Remove from realtime publication first
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS chat_messages;

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can view own project messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can insert own project messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can update own project messages" ON chat_messages;

-- Drop indexes
DROP INDEX IF EXISTS idx_chat_messages_project;
DROP INDEX IF EXISTS idx_chat_messages_project_type;

-- Drop table
DROP TABLE IF EXISTS chat_messages;

COMMIT;
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260304120000_drop_chat_messages.sql
git commit -m "feat: add migration to drop legacy chat_messages table (NOT applied)

Prerequisites: verify Mastra Memory has all historical data,
take a pg_dump backup before applying."
```

---

## Task 7: Add Monitoring Admin Endpoint

**Files:**
- Modify: `server/routes/admin.ts`

**Step 1: Read current admin.ts to understand existing structure**

```bash
# Read the file first to see what endpoints exist
```

**Step 2: Add conversation metrics endpoint**

```typescript
import { conversationStore } from '../lib/conversation-store'

// Add to existing admin routes:
admin.get('/conversation-metrics', async (c) => {
  const metrics = await conversationStore.getGlobalMetrics()
  return c.json({
    ...metrics,
    // Human-readable derived fields
    tableSizeMB: Math.round(metrics.tableSizeBytes / 1024 / 1024 * 100) / 100,
    contentSizeMB: Math.round(metrics.contentSizeBytes / 1024 / 1024 * 100) / 100,
    avgContentSizeKB: Math.round(metrics.avgContentSizeBytes / 1024 * 100) / 100,
    p95ContentSizeKB: Math.round(metrics.p95ContentSizeBytes / 1024 * 100) / 100,
  })
})
```

**Step 3: Run tests**

```bash
bun run test
```

Expected: PASS

**Step 4: Commit**

```bash
git add server/routes/admin.ts
git commit -m "feat: add /api/admin/conversation-metrics endpoint for Mastra store monitoring"
```

---

## Task 8: Lint, Type-check, Final Verification

**Step 1: Type-check**

```bash
bunx tsc --noEmit
```

Expected: No errors

**Step 2: Lint**

```bash
bun run lint
```

Expected: No errors

**Step 3: Format**

```bash
bun run format
```

**Step 4: Full test suite**

```bash
bun run test
```

Expected: All tests PASS

**Step 5: Final commit (if format changed anything)**

```bash
git add -A
git status
# Only commit if there are formatting changes
git commit -m "chore: format"
```

---

## Summary of Deliverables

| Deliverable | File(s) | Action |
|---|---|---|
| ConversationStore interface | `server/lib/conversation-store/types.ts` | **Create** |
| Mastra implementation | `server/lib/conversation-store/mastra.ts` | **Create** |
| Module barrel export | `server/lib/conversation-store/index.ts` | **Create** |
| Unit tests | `tests/conversation-store.test.ts` | **Create** |
| DROP TABLE migration | `supabase/migrations/20260304120000_drop_chat_messages.sql` | **Create** (NOT applied) |
| Route refactor (messages) | `server/routes/projects.ts` | **Modify** — remove ~130 lines of inline logic |
| Route refactor (deploy) | `server/routes/projects-deploy.ts` | **Modify** — swap memory import |
| Remove chatMessages schema | `server/lib/db/schema.ts` | **Modify** — delete table + type |
| Remove chatMessages relations | `server/lib/db/relations.ts` | **Modify** — delete relations |
| Remove chatMessages queries | `server/lib/db/queries.ts` | **Modify** — delete 3 functions |
| Update DB CLAUDE.md | `server/lib/db/CLAUDE.md` | **Modify** |
| Admin monitoring | `server/routes/admin.ts` | **Modify** — add endpoint |
| Update route tests | `tests/projects-route.test.ts` | **Modify** — swap mocks |
| Update DB tests | `tests/db-queries.test.ts` | **Modify** — remove chatMessages tests |

## Future: Swapping to MongoDB

When Mastra's PostgresStore becomes a bottleneck:

1. Create `MongoConversationStore` implementing `ConversationStore`
2. Change one line in `server/lib/conversation-store/index.ts`:
   ```typescript
   export const conversationStore = new MongoConversationStore()
   ```
3. No route changes, no test changes — the abstraction holds
