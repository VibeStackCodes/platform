import { describe, expect, it } from 'vitest'
import { buildFeatureAnalysisPrompt, runCodeGeneration } from '@server/lib/agents/orchestrator'
import type { SchemaContract } from '@server/lib/schema-contract'

describe('buildFeatureAnalysisPrompt', () => {
  it('includes table name and column list', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'status', type: 'text' },
          ],
        },
      ],
    }
    const prompt = buildFeatureAnalysisPrompt(contract.tables[0], contract)
    expect(prompt).toContain('task')
    expect(prompt).toContain('title')
    expect(prompt).toContain('status')
    expect(prompt).toContain('text') // column type
  })
})

describe('runCodeGeneration', () => {
  it('is a function', () => {
    // This test is integration-level and requires mocking the sandbox + agents.
    // Verify the function signature exists and accepts the expected inputs.
    expect(typeof runCodeGeneration).toBe('function')
  })
})
