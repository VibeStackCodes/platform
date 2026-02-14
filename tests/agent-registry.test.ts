import { describe, it, expect } from 'vitest';
import {
  mastra,
  supervisorAgent,
  analystAgent,
  infraAgent,
  dbaAgent,
  backendAgent,
  frontendAgent,
  reviewerAgent,
  qaAgent,
  devOpsAgent,
} from '@/lib/agents/registry';

describe('Agent Registry', () => {
  it('exports Mastra instance', () => {
    expect(mastra).toBeDefined();
  });

  it('exports all 9 agents', () => {
    const agents = [
      supervisorAgent, analystAgent, infraAgent, dbaAgent,
      backendAgent, frontendAgent, reviewerAgent, qaAgent, devOpsAgent,
    ];
    expect(agents).toHaveLength(9);
    agents.forEach(a => expect(a).toBeDefined());
  });

  it('supervisor has all 8 sub-agents registered', () => {
    const subAgents = supervisorAgent.listAgents();
    expect(subAgents).toBeDefined();
    expect(Object.keys(subAgents)).toHaveLength(8);
  });

  it('supervisor has memory configured', async () => {
    const memory = supervisorAgent.getMemory();
    expect(memory).toBeDefined();
  });

  it('each sub-agent has name and id', () => {
    const subAgents = [analystAgent, infraAgent, dbaAgent, backendAgent,
      frontendAgent, reviewerAgent, qaAgent, devOpsAgent];
    for (const agent of subAgents) {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.id.length).toBeGreaterThan(0);
      expect(agent.name.length).toBeGreaterThan(0);
    }
  });

  it('Mastra instance registers the supervisor', () => {
    const agent = mastra.getAgent('supervisor');
    expect(agent).toBeDefined();
  });
});
