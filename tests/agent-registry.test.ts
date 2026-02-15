import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @ai-sdk/openai to avoid real API calls
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'openai' });
    return provider;
  }),
}));

import { createAgentNetwork, mastra, supervisorAgent } from '@/lib/agents/registry';
import type { Agent } from '@mastra/core/agent';

/** Helper: listAgents() can return sync or async; we always treat it as sync in tests */
function getSubAgents(supervisor: Agent): Record<string, Agent> {
  return supervisor.listAgents() as Record<string, Agent>;
}

describe('Agent Registry (Factory Pattern)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createAgentNetwork returns an object with supervisor', () => {
    const network = createAgentNetwork('gpt-5.2', 'user-abc');
    expect(network).toBeDefined();
    expect(network.supervisor).toBeDefined();
    expect(network.supervisor.name).toBe('Supervisor');
  });

  it('supervisor has all 8 sub-agents registered', () => {
    const network = createAgentNetwork('gpt-5.2', 'user-abc');
    const subAgents = getSubAgents(network.supervisor);
    expect(subAgents).toBeDefined();
    expect(Object.keys(subAgents)).toHaveLength(8);
  });

  it('exports mastra instance', () => {
    expect(mastra).toBeDefined();
  });

  it('exports backward-compatible supervisorAgent singleton', () => {
    expect(supervisorAgent).toBeDefined();
    expect(supervisorAgent.name).toBe('Supervisor');
    const subAgents = getSubAgents(supervisorAgent);
    expect(Object.keys(subAgents)).toHaveLength(8);
  });

  it('each sub-agent has correct tools', () => {
    const network = createAgentNetwork('gpt-5.2', 'user-test');
    const agents = getSubAgents(network.supervisor);

    // Analyst has searchDocs
    expect(Object.keys(agents['analyst'].listTools())).toContain('searchDocs');

    // Infra has 5 tools: createSandbox, runCommand, getPreviewUrl, createSupabaseProject, createGitHubRepo
    expect(Object.keys(agents['infraEngineer'].listTools())).toHaveLength(5);
    expect(Object.keys(agents['infraEngineer'].listTools())).toContain('createSandbox');

    // DBA has 6 tools
    expect(Object.keys(agents['databaseAdmin'].listTools())).toHaveLength(6);

    // Backend has 5 tools
    expect(Object.keys(agents['backendEngineer'].listTools())).toHaveLength(5);

    // Frontend has 5 tools
    expect(Object.keys(agents['frontendEngineer'].listTools())).toHaveLength(5);

    // Code reviewer has only read-only tools (2 tools)
    const reviewerTools = Object.keys(agents['codeReviewer'].listTools());
    expect(reviewerTools).toHaveLength(2);
    expect(reviewerTools).toContain('readFile');
    expect(reviewerTools).toContain('listFiles');
    expect(reviewerTools).not.toContain('writeFile');

    // QA has 7 tools
    expect(Object.keys(agents['qaEngineer'].listTools())).toHaveLength(7);

    // DevOps has 4 tools
    expect(Object.keys(agents['devOpsEngineer'].listTools())).toHaveLength(4);
  });

  it('supervisor has no tools (pure orchestrator)', () => {
    const network = createAgentNetwork('gpt-5.2', 'user-test');
    const supervisorTools = network.supervisor.listTools();
    expect(Object.keys(supervisorTools)).toHaveLength(0);
  });

  it('each sub-agent has name, id, and description', () => {
    const network = createAgentNetwork('gpt-5.2', 'user-test');
    const agents = getSubAgents(network.supervisor);

    for (const [, agent] of Object.entries(agents)) {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.id.length).toBeGreaterThan(0);
      expect(agent.name.length).toBeGreaterThan(0);
      const description = agent.getDescription();
      expect(description).toBeDefined();
      expect(description!.length).toBeGreaterThan(10);
    }
  });

  it('memory does not throw without DATABASE_URL', () => {
    const network = createAgentNetwork('gpt-5.2', 'user-test');
    expect(() => network.supervisor.getMemory()).not.toThrow();
  });

  it('creates independent networks per call', () => {
    const network1 = createAgentNetwork('gpt-5.2', 'user-1');
    const network2 = createAgentNetwork('gpt-5.2', 'user-2');
    expect(network1.supervisor).not.toBe(network2.supervisor);
  });
});
