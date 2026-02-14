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

  it('assigns correct models per tier', () => {
    // Orchestrator tier (gpt-5.2)
    expect(supervisorAgent.model).toContain('gpt-5.2');
    expect(analystAgent.model).toContain('gpt-5.2');
    expect(dbaAgent.model).toContain('gpt-5.2');
    expect(reviewerAgent.model).toContain('gpt-5.2');

    // Codegen tier (gpt-5.1-codex-max)
    expect(backendAgent.model).toContain('gpt-5.1-codex-max');
    expect(frontendAgent.model).toContain('gpt-5.1-codex-max');

    // Validator tier (gpt-5-mini)
    expect(infraAgent.model).toContain('gpt-5-mini');
    expect(qaAgent.model).toContain('gpt-5-mini');
    expect(devOpsAgent.model).toContain('gpt-5-mini');
  });

  it('assigns correct tools per agent', () => {
    // Supervisor has no tools (pure orchestrator)
    const supervisorTools = supervisorAgent.listTools();
    expect(Object.keys(supervisorTools)).toHaveLength(0);

    // Sub-agents have tools
    expect(Object.keys(analystAgent.listTools())).toContain('searchDocs');
    expect(Object.keys(infraAgent.listTools())).toContain('createSandbox');
    expect(Object.keys(reviewerAgent.listTools())).toContain('readFile');

    // Code reviewer should only have read-only tools
    const reviewerToolKeys = Object.keys(reviewerAgent.listTools());
    expect(reviewerToolKeys).not.toContain('writeFile');
  });

  it('each sub-agent has a description for routing', () => {
    const subAgents = [analystAgent, infraAgent, dbaAgent, backendAgent,
      frontendAgent, reviewerAgent, qaAgent, devOpsAgent];
    for (const agent of subAgents) {
      const description = agent.getDescription();
      expect(description).toBeDefined();
      expect(description!.length).toBeGreaterThan(10);
    }
  });
});
