/**
 * Shared memory + storage infrastructure.
 *
 * Extracted from mastra.ts to break the circular dependency:
 *   mastra.ts → orchestrator.ts → mastra.ts
 *
 * Both mastra.ts and orchestrator.ts import from this module instead.
 */

import { Memory } from '@mastra/memory'
import { PostgresStore } from '@mastra/pg'
import { z } from 'zod'

// Working Memory Schema — structured notepad persisted across turns
export const workingMemorySchema = z.object({
  sandboxId: z.string().optional(),
  projectName: z.string().optional(),
  repoUrl: z.string().optional(),
  filesCreated: z.array(z.string()).optional(),
  designDecisions: z.array(z.string()).optional(),
  buildStatus: z.enum(['pending', 'passing', 'failing']).optional(),
})

// Storage — reuse existing Supabase Postgres
export const storage = new PostgresStore({
  id: 'vibestack-storage',
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- DATABASE_URL required at runtime
  connectionString: process.env.DATABASE_URL as string,
})

/**
 * Strip provider-specific reasoning parts from recalled messages.
 *
 * OpenAI's Responses API requires every `reasoning` item to be followed by
 * an output item. When a stream is aborted mid-generation (server crash,
 * client disconnect), Mastra's per-step save can persist an assistant message
 * with a reasoning part but no following output. On replay, this orphaned
 * reasoning item causes OpenAI to reject with:
 *   "Item 'rs_...' of type 'reasoning' was provided without its required following item."
 *
 * Old reasoning is useless for context (the LLM regenerates it each call),
 * so we strip all reasoning/redacted-reasoning parts on recall.
 */
// biome-ignore lint/suspicious/noExplicitAny: Mastra message types are internal and vary across versions
function stripReasoningFromMessages(messages: any[]): any[] {
  return messages.map((msg: any) => {
    if (msg.role !== 'assistant') return msg

    let parsed: unknown
    try {
      parsed = JSON.parse(msg.content)
    } catch {
      return msg
    }

    // Format 2 messages: { format: 2, parts: [...] }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'parts' in parsed &&
      Array.isArray((parsed as { parts: unknown[] }).parts)
    ) {
      const obj = parsed as { format: number; parts: Array<{ type: string; [k: string]: unknown }> }
      const filtered = obj.parts.filter(
        (p) => p.type !== 'reasoning' && p.type !== 'redacted-reasoning',
      )
      // If all parts were reasoning (nothing left), skip the message entirely
      if (filtered.length === 0) return null
      if (filtered.length === obj.parts.length) return msg // no change
      return { ...msg, content: JSON.stringify({ ...obj, parts: filtered }) }
    }

    return msg
  }).filter(Boolean)
}

/**
 * Memory subclass that strips reasoning parts on recall to prevent
 * orphaned OpenAI reasoning items from poisoning conversation history.
 */
class SafeMemory extends Memory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra recall args type is complex
  async recall(args: any) {
    const result = await super.recall(args)
    result.messages = stripReasoningFromMessages(result.messages)
    return result
  }
}

// Memory — thread-based conversation history + working memory
export const memory = new SafeMemory({
  storage,
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      scope: 'thread',
      schema: workingMemorySchema,
    },
  },
})
