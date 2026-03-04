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
