/**
 * Analyst Agent
 *
 * Pure reasoning agent — no tools. Analyzes user requirements and produces
 * a structured project plan for human approval before building begins.
 */

import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { memory } from './memory'
import { createAgentModelResolver } from './provider'

const analystModel = createAgentModelResolver('analyst')

/** Structured output schema for the project plan */
export const AnalystPlanSchema = z.object({
  projectName: z.string().describe('Short catchy name for the project (e.g. "TaskFlow", "BiteBoard")'),
  features: z
    .array(
      z.object({
        name: z.string().describe('Feature area name (e.g. "Authentication & User Management")'),
        description: z.string().describe('One-line scope description'),
      }),
    )
    .min(3)
    .max(8)
    .describe('Feature areas broken down from the user request'),
})

export type AnalystPlan = z.infer<typeof AnalystPlanSchema>

export const ANALYST_PROMPT = `You are a senior product analyst at a world-class app studio.

Given a user's app description, produce a concise project plan.

## Your Job

1. Read the user's request carefully.
2. Name the project — something catchy and memorable (e.g. "TaskFlow" for a project management app, "BiteBoard" for a recipe app).
3. Break the request into 3-8 feature areas. Each feature has a short name and a one-line description of its scope.
4. Be opinionated — make design decisions, don't punt to the user.
5. If the request is vague ("build me an app"), infer a reasonable interpretation and go with it.

## Rules

- NEVER ask clarifying questions. Always produce a plan.
- Keep feature descriptions to one line (under 100 characters).
- Cover the obvious requirements PLUS 1-2 things the user probably wants but didn't say (e.g. responsive design, dark mode, error handling).
- Order features by implementation priority (foundational first, polish last).`

/**
 * Create a fresh analyst agent instance.
 * No tools — pure reasoning only.
 */
export function createAnalyst(): Agent {
  return new Agent({
    id: 'analyst',
    name: 'Analyst Agent',
    model: analystModel,
    memory,
    description: 'Analyzes user requirements and produces a structured project plan',
    instructions: ANALYST_PROMPT,
    tools: {},
    defaultOptions: {
      maxSteps: 1,
      modelSettings: { temperature: 0.4 },
    },
  })
}
