/**
 * Analyst Agent
 *
 * Researches the domain via web search, then produces a structured project
 * plan for human approval before building begins.
 */

import { openai } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
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

Given a user's app description, research the domain and produce a concise project plan.

## Your Job

1. **Research first** — use \`webSearch\` to find 2-3 real products in this space. Study their features, UI patterns, and what makes them great. Example queries: "best todo app features 2026", "top project management tools comparison".
2. Read the user's request carefully, combining their intent with your research.
3. Name the project — something catchy and memorable (e.g. "TaskFlow" for a project management app, "BiteBoard" for a recipe app).
4. Break the request into 3-8 feature areas. Each feature has a short name and a one-line description of its scope.
5. Be opinionated — make design decisions informed by your research, don't punt to the user.
6. If the request is vague ("build me an app"), infer a reasonable interpretation and go with it.

## Rules

- NEVER ask clarifying questions. Always produce a plan.
- Keep feature descriptions to one line (under 100 characters).
- Cover the obvious requirements PLUS 1-2 things the user probably wants but didn't say (e.g. responsive design, dark mode, error handling).
- Ground your features in real-world patterns from your research — don't invent features that no real product uses.
- Order features by implementation priority (foundational first, polish last).`

/**
 * Create a fresh analyst agent instance.
 * Has web search for domain research, then produces structured output.
 */
export function createAnalyst(): Agent {
  return new Agent({
    id: 'analyst',
    name: 'Analyst Agent',
    model: analystModel,
    // No memory — analyst only needs the current message, not conversation history.
    // This also avoids memory tool calls consuming maxSteps.
    description: 'Researches the domain and produces a structured project plan',
    instructions: ANALYST_PROMPT,
    tools: {
      webSearch: openai.tools.webSearch(),
    },
    defaultOptions: {
      // Step 1: web search, Step 2: (optional follow-up search), Step 3: structured output
      maxSteps: 3,
      modelSettings: { temperature: 0.4 },
    },
  })
}
