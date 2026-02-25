import { Mastra } from '@mastra/core/mastra'
import { Memory } from '@mastra/memory'
import { PostgresStore } from '@mastra/pg'
import { PinoLogger } from '@mastra/loggers'
import { Observability, SamplingStrategyType } from '@mastra/observability'
import { LangfuseExporter } from '@mastra/langfuse'
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

// Memory — thread-based conversation history + working memory
export const memory = new Memory({
  storage,
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      schema: workingMemorySchema,
    },
  },
})

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

// Mastra Registry
export const mastra = new Mastra({
  memory: {
    default: memory,
  },
  storage,
  logger,
  observability: createObservability(),
})
