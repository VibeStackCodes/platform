import { describe, it, expect, vi } from 'vitest'

// Mock all external dependencies
vi.mock('@server/lib/agents/v2-orchestrator', () => ({
  createV2Orchestrator: vi.fn(),
}))
vi.mock('@server/lib/agents/provider', () => ({
  createHeliconeProvider: vi.fn(() => vi.fn(() => ({}))),
  createAgentModelResolver: vi.fn(() => vi.fn(() => ({}))),
  isAllowedModel: vi.fn(() => true),
}))
vi.mock('@server/lib/db/queries', () => ({
  getProject: vi.fn(() => ({ id: 'proj-1', userId: 'user-1' })),
  getUserCredits: vi.fn(() => ({ creditsRemaining: 100 })),
  updateProject: vi.fn(),
  insertChatMessage: vi.fn(),
  getProjectGenerationState: vi.fn(),
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
  downloadDirectory: vi.fn(),
  pushToGitHub: vi.fn(),
}))
vi.mock('@server/lib/github', () => ({
  buildRepoName: vi.fn(),
  createRepo: vi.fn(),
  getInstallationToken: vi.fn(),
}))

describe('v2-agent route', () => {
  it('module exports v2AgentRoutes as Hono instance', async () => {
    const { v2AgentRoutes } = await import('@server/routes/v2-agent')
    expect(v2AgentRoutes).toBeDefined()
    expect(typeof v2AgentRoutes.post).toBe('function')
  })
})
