import { describe, it, expect } from 'vitest';
import { AGENT_REGISTRY, PHASE_AGENTS, PHASE_NAMES, type AgentId } from '@/lib/agents/registry';

describe('Agent Registry', () => {
  it('has exactly 4 agents', () => {
    expect(Object.keys(AGENT_REGISTRY)).toHaveLength(4);
  });

  it('every agent has a name', () => {
    for (const [id, agent] of Object.entries(AGENT_REGISTRY)) {
      expect(agent.name).toBeTruthy();
    }
  });

  it('has 3 phases', () => {
    expect(Object.keys(PHASE_AGENTS)).toHaveLength(3);
  });

  it('every phase has a display name', () => {
    for (const phase of Object.keys(PHASE_AGENTS)) {
      expect(PHASE_NAMES[Number(phase)]).toBeTruthy();
    }
  });

  it('all phase agents reference valid registry keys', () => {
    const registryKeys = Object.keys(AGENT_REGISTRY) as AgentId[];
    for (const agents of Object.values(PHASE_AGENTS)) {
      for (const agentId of agents) {
        expect(registryKeys).toContain(agentId);
      }
    }
  });

  it('covers all agents across phases with no duplicates', () => {
    const allPhaseAgents = Object.values(PHASE_AGENTS).flat();
    const registryKeys = Object.keys(AGENT_REGISTRY);
    // All agents appear in phases (planner is in phase 1)
    expect(new Set(allPhaseAgents).size).toBe(allPhaseAgents.length);
    expect(allPhaseAgents).toHaveLength(registryKeys.length);
  });
});
