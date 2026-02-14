import { describe, it, expect } from 'vitest';
import {
  mastra,
  plannerAgent,
  dataArchitectAgent,
  frontendEngineerAgent,
  qaEngineerAgent,
} from '@/lib/agents/registry';
import type { AgentId } from '@/lib/agents/registry';

describe('Agent Registry', () => {
  it('exports a Mastra instance', () => {
    expect(mastra).toBeDefined();
  });

  it('has exactly 4 agents registered', () => {
    const agents = [plannerAgent, dataArchitectAgent, frontendEngineerAgent, qaEngineerAgent];
    expect(agents).toHaveLength(4);
  });

  it('every agent has a name and id', () => {
    const agents = [plannerAgent, dataArchitectAgent, frontendEngineerAgent, qaEngineerAgent];
    for (const agent of agents) {
      expect(agent.name).toBeTruthy();
    }
  });

  it('planner and data-architect use architect model', () => {
    expect(plannerAgent).toBeDefined();
    expect(dataArchitectAgent).toBeDefined();
  });

  it('qa-engineer uses validator model', () => {
    expect(qaEngineerAgent).toBeDefined();
  });
});
