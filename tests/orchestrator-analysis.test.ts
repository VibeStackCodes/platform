import { describe, expect, it, vi } from 'vitest'
import { runAnalysis } from '@server/lib/agents/orchestrator'

// Mock analyst agent
vi.mock('@server/lib/agents/registry', () => ({
  analystAgent: {
    generate: vi.fn(),
  },
}))

describe('runAnalysis', () => {
  it('extracts contract from submitRequirements tool call', async () => {
    const { analystAgent } = await import('@server/lib/agents/registry')
    const mockGenerate = vi.mocked(analystAgent.generate)

    mockGenerate.mockResolvedValue({
      steps: [
        {
          content: [
            {
              type: 'tool-call',
              toolName: 'submitRequirements',
              input: {
                appName: 'TaskFlow',
                appDescription: 'Task management app',
                selectedCapabilities: ['auth'],
                contract: {
                  tables: [{ name: 'task', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] }],
                },
              },
            },
          ],
        },
      ],
      totalUsage: { totalTokens: 500 },
    } as any)

    const result = await runAnalysis({
      userMessage: 'Build a task app',
      projectId: 'test-123',
    })

    expect(result.type).toBe('done')
    if (result.type === 'done') {
      expect(result.appName).toBe('TaskFlow')
      expect(result.capabilityManifest).toContain('auth')
      expect(result.contract.tables.map((t) => t.name)).toContain('task')
      expect(result.contract.tables.map((t) => t.name)).toContain('profiles')
      expect(result.tokensUsed).toBe(500)
    }
  })

  it('extracts questions from askClarifyingQuestions tool call', async () => {
    const { analystAgent } = await import('@server/lib/agents/registry')
    const mockGenerate = vi.mocked(analystAgent.generate)

    mockGenerate.mockResolvedValue({
      steps: [
        {
          content: [
            {
              type: 'tool-call',
              toolName: 'askClarifyingQuestions',
              input: {
                questions: [{ question: 'What type of app?', options: ['Todo', 'CRM'] }],
              },
            },
          ],
        },
      ],
      totalUsage: { totalTokens: 200 },
    } as any)

    const result = await runAnalysis({
      userMessage: 'Build something',
      projectId: 'test-123',
    })

    expect(result.type).toBe('clarification')
    if (result.type === 'clarification') {
      expect(result.questions).toHaveLength(1)
    }
  })
})
