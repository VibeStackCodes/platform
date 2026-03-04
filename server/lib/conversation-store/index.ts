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
