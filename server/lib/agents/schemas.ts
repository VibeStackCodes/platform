import { z } from 'zod'
import { DesignPreferencesSchema, SchemaContractSchema } from '../schema-contract'

/**
 * Zod schemas for agent structured output.
 *
 * Only schemas actively used by agents are defined here.
 * Removed unused schemas from earlier agent network architecture (2026-02-16 audit).
 */

/**
 * Analyst output — the structured result of requirements extraction.
 * Used as the inputSchema for the submitRequirements tool so the analyst
 * can produce structured output via tool calling (allowing it to also call
 * askClarifyingQuestions in the same generate() invocation).
 */
export const AnalystOutputSchema = z.object({
  appName: z.string().describe('Short application name (e.g., "TaskFlow")'),
  appDescription: z.string().describe('One-line app description'),
  contract: SchemaContractSchema.describe('Database schema contract'),
  designPreferences: DesignPreferencesSchema.describe('UI design preferences'),
})
