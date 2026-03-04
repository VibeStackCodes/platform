/**
 * Shared input processors for Mastra agents.
 *
 * These run at every step of the agentic loop (processInputStep) to clean
 * recalled messages before they are sent to the LLM provider.
 */

import type { MastraDBMessage } from '@mastra/core/agent/message-list'
import type { InputProcessor, ProcessInputStepArgs } from '@mastra/core/processors'

/**
 * Strip providerMetadata from recalled messages.
 *
 * OpenAI Responses API uses providerMetadata.openai.itemId to create
 * item_reference entries. When reasoning items are stored without their
 * paired function_call items, OpenAI rejects the request. Stripping
 * providerMetadata forces the AI SDK to send full message content instead
 * of broken item_reference entries.
 */
export const stripProviderMetadata: InputProcessor = {
  id: 'strip-provider-metadata',
  processInputStep({ messages }: ProcessInputStepArgs): { messages: MastraDBMessage[] } {
    const cleaned = messages.map((msg) => {
      if (!msg.content || typeof msg.content !== 'object' || !('parts' in msg.content)) return msg
      const content = msg.content as { format: number; parts: Array<Record<string, unknown>>; providerMetadata?: unknown }
      if (!content.parts?.length && !content.providerMetadata) return msg
      return {
        ...msg,
        content: {
          ...content,
          providerMetadata: undefined,
          parts: content.parts.map((part) => {
            if (!part.providerMetadata) return part
            const { providerMetadata: _, ...rest } = part
            return rest
          }),
        },
      } as MastraDBMessage
    })
    return { messages: cleaned }
  },
}
