import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @ai-sdk/openai to avoid real API calls
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'openai' });
    return provider;
  }),
}));

import { mastra } from '@/src/mastra/index';
import {
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
import type { Agent } from '@mastra/core/agent';

/** Helper: listAgents() can return sync or async; we always treat it as sync in tests */
function getSubAgents(supervisor: Agent): Record<string, Agent> {
  return supervisor.listAgents() as Record<string, Agent>;
}

describe('Agent Registry (Module-Level with Dynamic Model)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mastra instance has all 9 agents registered', () => {
    const agents = mastra.listAgents();
    expect(Object.keys(agents)).toHaveLength(9);
  });

  it('supervisor agent is retrievable from mastra', () => {
    const supervisor = mastra.getAgent('supervisor');
    expect(supervisor).toBeDefined();
    expect(supervisor.name).toBe('Supervisor');
  });

  it('supervisor has all 8 sub-agents registered', () => {
    const subAgents = getSubAgents(supervisorAgent);
    expect(subAgents).toBeDefined();
    expect(Object.keys(subAgents)).toHaveLength(8);
  });

  it('exports mastra instance', () => {
    expect(mastra).toBeDefined();
  });

  it('each sub-agent has correct tools', () => {
    const agents = getSubAgents(supervisorAgent);

    // Analyst has searchDocs
    expect(Object.keys(agents['analyst'].listTools())).toContain('searchDocs');

    // Infra has 5 tools: createSandbox, runCommand, getPreviewUrl, createSupabaseProject, createGitHubRepo
    expect(Object.keys(agents['infraEngineer'].listTools())).toHaveLength(5);
    expect(Object.keys(agents['infraEngineer'].listTools())).toContain('createSandbox');

    // DBA has 7 tools (includes writeFiles batch tool)
    expect(Object.keys(agents['databaseAdmin'].listTools())).toHaveLength(7);

    // Backend has 6 tools (includes writeFiles batch tool)
    expect(Object.keys(agents['backendEngineer'].listTools())).toHaveLength(6);

    // Frontend has 6 tools (includes writeFiles batch tool)
    expect(Object.keys(agents['frontendEngineer'].listTools())).toHaveLength(6);

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
    const supervisorTools = supervisorAgent.listTools();
    expect(Object.keys(supervisorTools)).toHaveLength(0);
  });

  it('each sub-agent has name, id, and description', () => {
    const agents = getSubAgents(supervisorAgent);

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
    expect(() => supervisorAgent.getMemory()).not.toThrow();
  });

  it('all module-level agents are the same instances used by supervisor', () => {
    const subAgents = getSubAgents(supervisorAgent);
    expect(subAgents['analyst']).toBe(analystAgent);
    expect(subAgents['infraEngineer']).toBe(infraAgent);
    expect(subAgents['databaseAdmin']).toBe(dbaAgent);
    expect(subAgents['backendEngineer']).toBe(backendAgent);
    expect(subAgents['frontendEngineer']).toBe(frontendAgent);
    expect(subAgents['codeReviewer']).toBe(reviewerAgent);
    expect(subAgents['qaEngineer']).toBe(qaAgent);
    expect(subAgents['devOpsEngineer']).toBe(devOpsAgent);
  });
});
