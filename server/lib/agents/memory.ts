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

// Memory — thread-based conversation history + working memory
export const memory = new Memory({
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
