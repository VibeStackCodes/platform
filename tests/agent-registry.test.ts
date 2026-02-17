import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const provider = (modelId: string) => ({ modelId, provider: 'openai' })
    return provider
  }),
}))

import {
  analystAgent,
  repairAgent,
} from '@server/lib/agents/registry'

describe('Agent Registry (Reduced Roster: 2+1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exports exactly 2 agents (analyst, repair) + edit', () => {
    expect(analystAgent).toBeDefined()
    expect(repairAgent).toBeDefined()
  })

  it('analyst has searchDocs, askClarifyingQuestions, submitRequirements tools', () => {
    const tools = Object.keys(analystAgent.listTools())
    expect(tools).toContain('searchDocs')
    expect(tools).toContain('askClarifyingQuestions')
    expect(tools).toContain('submitRequirements')
  })

  it('repair agent has writeFile, readFile, runCommand tools', () => {
    const tools = Object.keys(repairAgent.listTools())
    expect(tools).toHaveLength(3)
    expect(tools).toContain('writeFile')
    expect(tools).toContain('readFile')
    expect(tools).toContain('runCommand')
  })

  it('no supervisor, infra, dba, reviewer, qa, devops, pm, frontend, or backend agents exported', async () => {
    const registryExports = await import('@server/lib/agents/registry')
    const exports = registryExports as Record<string, unknown>
    expect(exports.supervisorAgent).toBeUndefined()
    expect(exports.infraAgent).toBeUndefined()
    expect(exports.dbaAgent).toBeUndefined()
    expect(exports.reviewerAgent).toBeUndefined()
    expect(exports.qaAgent).toBeUndefined()
    expect(exports.devOpsAgent).toBeUndefined()
    expect(exports.pmAgent).toBeUndefined()
    // frontendAgent removed — code generation is fully deterministic
    expect(exports.frontendAgent).toBeUndefined()
    // backendAgent was removed in PostgREST migration
    expect(exports.backendAgent).toBeUndefined()
  })
})
