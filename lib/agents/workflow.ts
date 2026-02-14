/**
 * Workflow Orchestrator
 *
 * AsyncGenerator-based workflow for the 4-agent generation pipeline.
 * Yields state at each step, suspends at plan approval, resumes for execution.
 */

import type { AgentEvent, ClarifiedRequirements, ExecutionPlan } from './schemas';
import type { AgentId } from './registry';
import { PHASE_AGENTS, PHASE_NAMES } from './registry';
import { clarifyRequirements, generatePlan, assembleTeam, runPhase, type AgentArtifact } from './steps';

export type WorkflowPhase =
  | 'clarifying'
  | 'assembling-team'
  | 'generating-plan'
  | 'awaiting-approval'
  | 'executing'
  | 'completed'
  | 'error';

export interface WorkflowState {
  phase: WorkflowPhase;
  requirements?: ClarifiedRequirements;
  selectedAgents?: Map<AgentId, { phase: number; layerName: string }>;
  plan?: ExecutionPlan;
  artifacts?: Map<AgentId, AgentArtifact>;
  error?: string;
}

/**
 * Run the full generation workflow as an async generator.
 *
 * The generator yields WorkflowState at each step. When it reaches
 * 'awaiting-approval', the caller must send `true` to approve or
 * `false` to reject via generator.next(approved).
 *
 * @param userPrompt - Raw user input
 * @param emitEvent - Callback for streaming AgentEvents to SSE
 */
export async function* runGenerationWorkflow(
  userPrompt: string,
  emitEvent: (event: AgentEvent) => void,
): AsyncGenerator<WorkflowState, WorkflowState, boolean | undefined> {
  // Step 1: Clarify requirements
  yield { phase: 'clarifying' };

  const requirements = await clarifyRequirements(userPrompt);

  // Step 2: Assemble team
  yield { phase: 'assembling-team', requirements };

  const selectedAgents = assembleTeam(requirements);

  // Step 3: Generate plan
  yield { phase: 'generating-plan', requirements, selectedAgents };

  const plan = await generatePlan(requirements);

  // Suspend for approval
  const state: WorkflowState = {
    phase: 'awaiting-approval',
    requirements,
    selectedAgents,
    plan,
  };

  const approved = yield state;

  if (!approved) {
    return { ...state, phase: 'error', error: 'Plan rejected by user' };
  }

  // Step 4: Execute phases sequentially
  yield { phase: 'executing', requirements, selectedAgents, plan };

  const allArtifacts = new Map<AgentId, AgentArtifact>();

  for (const phaseNum of [1, 2, 3]) {
    if (!PHASE_AGENTS[phaseNum]) continue;

    const phaseArtifacts = await runPhase(
      phaseNum,
      requirements,
      allArtifacts,
      emitEvent,
    );

    for (const [agentId, artifact] of phaseArtifacts) {
      allArtifacts.set(agentId, artifact);
    }
  }

  return {
    phase: 'completed',
    requirements,
    selectedAgents,
    plan,
    artifacts: allArtifacts,
  };
}
