/**
 * Workflow Step Functions
 *
 * Individual steps for the agent workflow pipeline.
 * Uses Mastra Agent.generate() with structuredOutput for type-safe artifact production.
 */

import { plannerAgent, selectAgents, buildPlanPrompt } from './planner';
import { AGENT_REGISTRY, PHASE_AGENTS, PHASE_NAMES } from './registry';
import type { AgentId } from './registry';
import {
  ClarifiedRequirementsSchema,
  ExecutionPlanSchema,
  DatabaseSchemaArtifactSchema,
  FrontendArtifactSchema,
  QAResultArtifactSchema,
} from './schemas';
import type {
  ClarifiedRequirements,
  ExecutionPlan,
  DatabaseSchemaArtifact,
  FrontendArtifact,
  QAResultArtifact,
  AgentEvent,
} from './schemas';

/**
 * Agent artifact union type
 */
export type AgentArtifact = DatabaseSchemaArtifact | FrontendArtifact | QAResultArtifact;

/**
 * Agent context for execution
 */
export interface AgentContext {
  requirements: ClarifiedRequirements;
  plan: ExecutionPlan;
  priorArtifacts: Map<AgentId, AgentArtifact>;
}

/**
 * Step 1: Clarify Requirements
 *
 * Calls planner agent with structured output to extract requirements from user prompt.
 */
export async function clarifyRequirements(userPrompt: string): Promise<ClarifiedRequirements> {
  const result = await plannerAgent.generate(
    `Extract structured requirements from the following user prompt. Default to sensible choices for any unspecified details.

User Prompt:
${userPrompt}

Extract: app name, description, target audience, features (with categories), constraints, and design preferences.`,
    {
      structuredOutput: { schema: ClarifiedRequirementsSchema },
    }
  );

  return result.object;
}

/**
 * Step 2: Assemble Team
 *
 * Selects agents based on requirements and maps them to phase metadata.
 */
export function assembleTeam(requirements: ClarifiedRequirements): Map<AgentId, { phase: number; layerName: string }> {
  const selectedAgents = selectAgents(requirements);
  const teamMap = new Map<AgentId, { phase: number; layerName: string }>();

  for (const [phase, agents] of Object.entries(PHASE_AGENTS)) {
    const phaseNum = parseInt(phase, 10);
    for (const agentId of agents) {
      if (selectedAgents.includes(agentId)) {
        teamMap.set(agentId, {
          phase: phaseNum,
          layerName: PHASE_NAMES[phaseNum],
        });
      }
    }
  }

  return teamMap;
}

/**
 * Step 3: Generate Plan
 *
 * Calls planner agent with structured output to produce an execution plan.
 */
export async function generatePlan(requirements: ClarifiedRequirements): Promise<ExecutionPlan> {
  const prompt = buildPlanPrompt(requirements);

  const result = await plannerAgent.generate(prompt, {
    structuredOutput: { schema: ExecutionPlanSchema },
  });

  return result.object;
}

/**
 * Step 4: Run Agent
 *
 * Executes a single agent with context and emits progress events.
 */
export async function runAgent(
  agentId: AgentId,
  context: AgentContext,
  emitEvent: (event: AgentEvent) => void
): Promise<AgentArtifact> {
  const agent = AGENT_REGISTRY[agentId];
  const startTime = Date.now();

  emitEvent({
    type: 'agent_start',
    agentId,
    agentName: agent.name ?? agentId,
    phase: getAgentPhase(agentId),
  });

  const prompt = buildAgentPrompt(agentId, context);
  const schema = getAgentOutputSchema(agentId);

  const result = await agent.generate(prompt, {
    structuredOutput: { schema },
  });

  const artifact = result.object as AgentArtifact;
  const durationMs = Date.now() - startTime;

  emitEvent({
    type: 'agent_artifact',
    agentId,
    artifactType: getArtifactType(agentId),
    artifactName: getArtifactName(agentId),
  });

  emitEvent({
    type: 'agent_complete',
    agentId,
    tokensUsed: result.totalUsage?.totalTokens ?? 0,
    durationMs,
  });

  return artifact;
}

/**
 * Step 5: Run Phase
 *
 * Executes all agents in a phase in parallel and merges artifacts.
 */
export async function runPhase(
  phaseNumber: number,
  requirements: ClarifiedRequirements,
  priorArtifacts: Map<AgentId, AgentArtifact>,
  emitEvent: (event: AgentEvent) => void
): Promise<Map<AgentId, AgentArtifact>> {
  const agents = PHASE_AGENTS[phaseNumber] ?? [];
  const phaseName = PHASE_NAMES[phaseNumber] ?? `Phase ${phaseNumber}`;

  emitEvent({
    type: 'phase_start',
    phase: phaseNumber,
    phaseName,
    agentCount: agents.length,
  });

  const context: AgentContext = {
    requirements,
    plan: { phases: [], estimatedDuration: '', agentAssignments: {} },
    priorArtifacts,
  };

  const results = await Promise.all(
    agents.map(async (agentId) => {
      const artifact = await runAgent(agentId, context, emitEvent);
      return [agentId, artifact] as const;
    })
  );

  const phaseArtifacts = new Map<AgentId, AgentArtifact>(results);

  emitEvent({
    type: 'phase_complete',
    phase: phaseNumber,
    phaseName,
  });

  return phaseArtifacts;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getAgentPhase(agentId: AgentId): number {
  for (const [phase, agents] of Object.entries(PHASE_AGENTS)) {
    if (agents.includes(agentId)) {
      return parseInt(phase, 10);
    }
  }
  return 0;
}

function buildAgentPrompt(agentId: AgentId, context: AgentContext): string {
  const { requirements, priorArtifacts } = context;

  switch (agentId) {
    case 'data-architect': {
      const featureList = requirements.features
        .filter((f) => f.category === 'crud' || f.category === 'realtime')
        .map((f) => `- ${f.name}: ${f.description}`)
        .join('\n');

      return `Design a PostgreSQL database schema for "${requirements.appName}".

Description: ${requirements.appDescription}

Data Features:
${featureList || '- No explicit data features (use minimal schema with users table)'}

Generate tables with uuid PKs, timestamptz timestamps, foreign keys, indices, RLS policies using auth.uid(), and a complete SQL migration script.`;
    }

    case 'frontend-engineer': {
      const dbSchema = priorArtifacts.get('data-architect') as DatabaseSchemaArtifact | undefined;
      const schemaContext = dbSchema
        ? `\nDatabase Tables:\n${dbSchema.tables.map((t) => `- ${t.name}: ${t.columns.map((c) => c.name).join(', ')}`).join('\n')}`
        : '';

      const featureList = requirements.features
        .map((f) => `- [${f.category}] ${f.name}: ${f.description}`)
        .join('\n');

      return `Generate production-ready React 19 components for "${requirements.appName}".

Description: ${requirements.appDescription}
${schemaContext}

Features:
${featureList}

Design: ${requirements.designPreferences.style} style, ${requirements.designPreferences.primaryColor} color, ${requirements.designPreferences.fontFamily} font.

Generate complete, type-safe components with Tailwind v4, Radix UI, and Supabase integration. Sort files by dependency layer.`;
    }

    case 'qa-engineer':
      return `Run build verification (bun run build). Parse TypeScript/module errors. Generate minimal fixes. Iterate up to 3 times.`;

    default:
      return `Execute ${agentId} task for ${requirements.appName}`;
  }
}

function getAgentOutputSchema(agentId: AgentId) {
  switch (agentId) {
    case 'data-architect':
      return DatabaseSchemaArtifactSchema;
    case 'frontend-engineer':
      return FrontendArtifactSchema;
    case 'qa-engineer':
      return QAResultArtifactSchema;
    default:
      return DatabaseSchemaArtifactSchema;
  }
}

function getArtifactType(agentId: AgentId): string {
  switch (agentId) {
    case 'data-architect': return 'database-schema';
    case 'frontend-engineer': return 'frontend-code';
    case 'qa-engineer': return 'qa-result';
    default: return 'unknown';
  }
}

function getArtifactName(agentId: AgentId): string {
  switch (agentId) {
    case 'data-architect': return 'Database Schema';
    case 'frontend-engineer': return 'Frontend Components';
    case 'qa-engineer': return 'QA Report';
    default: return 'Artifact';
  }
}
