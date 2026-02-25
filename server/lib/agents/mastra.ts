/**
 * Mastra Registry
 *
 * Central Mastra instance with orchestrator agent, memory, storage,
 * observability, and logging. Re-exported by `src/mastra/index.ts`
 * for `mastra dev` / `mastra build` / Mastra Cloud.
 *
 * Memory + storage are defined in `./memory.ts` (shared with orchestrator.ts).
 */

import { Mastra } from '@mastra/core/mastra'
import { PinoLogger } from '@mastra/loggers'
import { Observability, SamplingStrategyType } from '@mastra/observability'
import { LangfuseExporter } from '@mastra/langfuse'
import { createOrchestrator } from './orchestrator'
import { memory, storage } from './memory'

// Re-export for consumers that imported from this module
export { memory, storage, workingMemorySchema } from './memory'

// Observability — Langfuse exporter (gated on env vars)
function createObservability(): Observability | undefined {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) return undefined

  return new Observability({
    configs: {
      default: {
        serviceName: 'vibestack-agent',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [
          new LangfuseExporter({
            publicKey,
            secretKey,
            baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
          }),
        ],
      },
    },
  })
}

// Logger
const logger = new PinoLogger({ level: 'info' })

// Mastra Registry — orchestrator registered here for mastra dev / Mastra Cloud.
// Production route (agent.ts) creates per-request agents for provider switching.
export const mastra = new Mastra({
  agents: {
    orchestrator: createOrchestrator(),
  },
  memory: {
    default: memory,
  },
  storage,
  logger,
  observability: createObservability(),
})
