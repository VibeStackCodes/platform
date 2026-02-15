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
    // Orchestrator tier (gpt-4o)
    expect(supervisorAgent.model).toContain('gpt-4o');
    expect(analystAgent.model).toContain('gpt-4o');
    expect(dbaAgent.model).toContain('gpt-4o');
    expect(reviewerAgent.model).toContain('gpt-4o');

    // Codegen tier (gpt-4o)
    expect(backendAgent.model).toContain('gpt-4o');
    expect(frontendAgent.model).toContain('gpt-4o');

    // Validator tier (gpt-4o-mini)
    expect(infraAgent.model).toContain('gpt-4o-mini');
    expect(qaAgent.model).toContain('gpt-4o-mini');
    expect(devOpsAgent.model).toContain('gpt-4o-mini');
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

    // Tool count assertions
    expect(Object.keys(infraAgent.listTools())).toHaveLength(5); // createSandbox, runCommand, getPreviewUrl, createSupabaseProject, createGitHubRepo
    expect(Object.keys(dbaAgent.listTools())).toHaveLength(6); // runCommand, writeFile, readFile, validateSQL, searchDocs, runMigration
    expect(Object.keys(devOpsAgent.listTools())).toHaveLength(4); // pushToGitHub, deployToVercel, runCommand, getGitHubToken
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
