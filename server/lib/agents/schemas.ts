import { z } from 'zod'
import { SchemaContractSchema } from '../schema-contract'

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
 *
 * Design decisions (colors, fonts, layout) are NOT part of the analyst output.
 * The Design Agent is the sole authority for visual identity.
 */
export const AnalystOutputSchema = z.object({
  appName: z.string().describe('Short application name (e.g., "TaskFlow")'),
  appDescription: z.string().describe('One-line app description'),
  selectedCapabilities: z.array(z.string()).default([]).describe('Capability names selected from the core catalog'),
  contract: SchemaContractSchema.describe('Database schema contract'),
})

export const ThemeSelectorInputSchema = z.object({
  userPrompt: z.string().min(5).describe('User prompt describing the app'),
  appDescription: z.string().optional().describe('App description'),
})

export const ThemeSelectorOutputSchema = z.object({
  themeName: z.string().describe('Selected theme name'),
  reasoning: z.string().describe('Why this theme was selected'),
  shouldMergeTables: z.boolean().describe('Whether to merge theme base tables with user schema'),
})
