import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'openai' })
    return provider
  }),
}))

import {
  analystAgent,
  backendAgent,
  frontendAgent,
  repairAgent,
} from '@server/lib/agents/registry'

describe('Agent Registry (Reduced Roster: 3+1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports exactly 4 agents', () => {
    expect(analystAgent).toBeDefined()
    expect(backendAgent).toBeDefined()
    expect(frontendAgent).toBeDefined()
    expect(repairAgent).toBeDefined()
  })

  it('analyst has searchDocs, askClarifyingQuestions, submitRequirements tools', () => {
    const tools = Object.keys(analystAgent.listTools())
    expect(tools).toContain('searchDocs')
    expect(tools).toContain('askClarifyingQuestions')
    expect(tools).toContain('submitRequirements')
  })

  it('backend agent has 6 tools (no contractToHooks)', () => {
    const tools = Object.keys(backendAgent.listTools())
    expect(tools).toHaveLength(6)
    expect(tools).toContain('writeFile')
    expect(tools).toContain('readFile')
    expect(tools).not.toContain('contractToHooks')
  })

  it('frontend agent has 6 tools (no contractToRoutes)', () => {
    const tools = Object.keys(frontendAgent.listTools())
    expect(tools).toHaveLength(6)
    expect(tools).toContain('writeFile')
    expect(tools).toContain('readFile')
    expect(tools).not.toContain('contractToRoutes')
  })

  it('repair agent has writeFile, readFile, runCommand tools', () => {
    const tools = Object.keys(repairAgent.listTools())
    expect(tools).toHaveLength(3)
    expect(tools).toContain('writeFile')
    expect(tools).toContain('readFile')
    expect(tools).toContain('runCommand')
  })

  it('no supervisor, infra, dba, reviewer, qa, devops, or pm agents exported', async () => {
    // These should no longer be exported from the registry
    const registryExports = await import('@server/lib/agents/registry')
    expect(registryExports.supervisorAgent).toBeUndefined()
    expect(registryExports.infraAgent).toBeUndefined()
    expect(registryExports.dbaAgent).toBeUndefined()
    expect(registryExports.reviewerAgent).toBeUndefined()
    expect(registryExports.qaAgent).toBeUndefined()
    expect(registryExports.devOpsAgent).toBeUndefined()
    expect(registryExports.pmAgent).toBeUndefined()
  })
})
