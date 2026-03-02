/**
 * Shared Langfuse Client (singleton)
 *
 * Used for features not covered by the Mastra observability exporter:
 * - Prompt management (fetch versioned prompts from Langfuse UI)
 * - Direct scoring (attach build-success / token-efficiency scores to traces)
 *
 * Gated on LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY — returns undefined when unset.
 */

import { LangfuseClient } from '@langfuse/client'

let client: LangfuseClient | undefined

export function getLangfuseClient(): LangfuseClient | undefined {
  if (client) return client

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) return undefined

  client = new LangfuseClient({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
  })

  return client
}
