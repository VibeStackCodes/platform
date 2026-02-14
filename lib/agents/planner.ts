/**
 * Planner Logic
 *
 * Functions for agent selection and prompt building for the planner agent
 */

import type { AgentId } from './registry';
import { AGENT_REGISTRY } from './registry';
import type { ClarifiedRequirements } from './schemas';

/**
 * Select agents for a given set of requirements.
 *
 * For now, this returns all agents. Future: filter by feature category relevance.
 *
 * @param requirements - Clarified requirements from planner agent
 * @returns Array of agent IDs to use in the workflow
 */
export function selectAgents(requirements: ClarifiedRequirements): AgentId[] {
  // TODO: Filter agents by feature relevance
  // For now, always return all agents (planner is used in clarification, not execution)
  return ['data-architect', 'frontend-engineer', 'qa-engineer'];
}

/**
 * Build a prompt for the planner agent to generate an execution plan.
 *
 * This creates a text prompt from ClarifiedRequirements that guides the planner
 * to produce an ExecutionPlan with phases, agent assignments, and duration estimates.
 *
 * @param requirements - Clarified requirements
 * @returns Text prompt for planner agent
 */
export function buildPlanPrompt(requirements: ClarifiedRequirements): string {
  const featureList = requirements.features
    .map((f, i) => `${i + 1}. [${f.category}] ${f.name}: ${f.description}`)
    .join('\n');

  const constraintList = requirements.constraints.length > 0
    ? requirements.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : 'None';

  return `Generate an execution plan for the following application:

**App Name:** ${requirements.appName}
**Description:** ${requirements.appDescription}
**Target Audience:** ${requirements.targetAudience}

**Features:**
${featureList}

**Technical Constraints:**
${constraintList}

**Design Preferences:**
- Style: ${requirements.designPreferences.style}
- Primary Color: ${requirements.designPreferences.primaryColor}
- Font Family: ${requirements.designPreferences.fontFamily}

Create a detailed execution plan with:
1. Phases (Planning & Data Architecture, Frontend Generation, Build Verification & QA)
2. Agent assignments for each phase
3. Estimated duration (be realistic — complex apps take 3-5 minutes)
4. Model selection rationale (use Sonnet for complex work, Haiku for validation)

Output an ExecutionPlan with phases array and agentAssignments map.`;
}

/**
 * Get the planner agent instance from the registry
 */
export const plannerAgent = AGENT_REGISTRY['planner'];
