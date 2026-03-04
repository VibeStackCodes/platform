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
        messages: [
          {
            id: message.id,
            role: message.role as 'user' | 'assistant',
            createdAt: new Date(),
            threadId: projectId,
            resourceId: userId,
            type: 'text',
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
      const row = result.rows[0] as
        | {
            total_threads: number
            total_messages: number
            avg_per_thread: number
            largest_thread: number
            table_size_bytes: number
            content_size_bytes: number
            avg_content_bytes: number
            p95_content_bytes: number
          }
        | undefined

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra message type is opaque
    messages: any[], // oxlint-disable-line @typescript-eslint/no-explicit-any
  ): ConversationMessage[] {
    const events: ConversationMessage[] = []

    for (const msg of messages) {
      if ((msg.role as string) === 'tool') continue

      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra content type varies
      const content = msg.content as any
      let textContent = ''
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- parts shape varies
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
      // biome-ignore lint/suspicious/noExplicitAny: tool event shape varies
      const toolEvents: ConversationMessage[] = []
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

            toolEvents.push({
              id: `tool-${msg.id}-${toolName}-${events.length + toolEvents.length}`,
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
      if (msg.role === 'assistant' && !textContent.trim()) {
        // Still emit any tool events collected from this message
        events.push(...toolEvents)
        continue
      }

      // Push text message first, then tool events (preserves readable ordering)
      events.push({
        id: msg.id,
        role: msg.role,
        type: 'message',
        parts: [{ text: textContent }],
        createdAt: msg.createdAt,
      })
      events.push(...toolEvents)
    }

    return events
  }
}
