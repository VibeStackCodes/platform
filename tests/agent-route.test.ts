import { describe, it, expect, vi } from 'vitest'

// Mock all external dependencies
vi.mock('@server/lib/agents/memory', () => ({
  memory: {},
  storage: {},
  workingMemorySchema: {},
}))
vi.mock('@server/lib/agents/mastra', () => ({
  mastra: { __registerMastra: vi.fn() },
  memory: {},
  storage: {},
}))
vi.mock('@server/lib/agents/orchestrator', () => ({
  createOrchestrator: vi.fn(() => ({
    __registerMastra: vi.fn(),
    stream: vi.fn(),
  })),
}))
vi.mock('@server/lib/agents/provider', () => ({
  createDirectProvider: vi.fn(() => vi.fn(() => ({}))),
  createAgentModelResolver: vi.fn(() => vi.fn(() => ({}))),
  isAllowedModel: vi.fn(() => true),
}))
vi.mock('@server/lib/db/queries', () => ({
  getProject: vi.fn(() => ({ id: 'proj-1', userId: 'user-1' })),
  getUserCredits: vi.fn(() => ({ creditsRemaining: 100 })),
  updateProject: vi.fn(),
}))
vi.mock('@server/lib/credits', () => ({
  reserveCredits: vi.fn(() => true),
  settleCredits: vi.fn(() => ({ creditsRemaining: 95 })),
}))
vi.mock('@server/lib/sandbox', () => ({
  getSandbox: vi.fn(),
  createSandbox: vi.fn(),
  getPreviewUrl: vi.fn(),
  buildProxyUrl: vi.fn(),
}))
vi.mock('@server/lib/github', () => ({
  buildRepoName: vi.fn(),
  createRepo: vi.fn(),
  getInstallationToken: vi.fn(),
}))

describe('agent route', () => {
  it('module exports agentRoutes as Hono instance', async () => {
    const { agentRoutes } = await import('@server/routes/agent')
    expect(agentRoutes).toBeDefined()
    expect(typeof agentRoutes.post).toBe('function')
  })
})
