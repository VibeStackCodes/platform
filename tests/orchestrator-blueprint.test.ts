import { describe, expect, it } from 'vitest'
import { runBlueprint } from '@server/lib/agents/orchestrator'
import type { SchemaContract, DesignPreferences } from '@server/lib/schema-contract'

describe('runBlueprint', () => {
  it('generates AppBlueprint from contract', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      ],
    }
    const prefs: DesignPreferences = {
      style: 'modern',
      primaryColor: '#3b82f6',
      fontFamily: 'Inter',
    }

    const result = runBlueprint({
      appName: 'TaskFlow',
      appDescription: 'Task management',
      contract,
      designPreferences: prefs,
    })

    expect(result.blueprint.meta.appName).toBe('TaskFlow')
    expect(result.blueprint.contract).toBe(contract)
    expect(result.blueprint.fileTree.length).toBeGreaterThan(0)
    // Layer 1: supabase client, css, html
    expect(result.blueprint.fileTree.some((f) => f.path === 'src/lib/supabase.ts')).toBe(true)
    // Layer 2: migration (PostgREST — no server-side code)
    expect(result.blueprint.fileTree.some((f) => f.path === 'supabase/migrations/0001_initial.sql')).toBe(true)
    // No server/ files in PostgREST architecture
    expect(result.blueprint.fileTree.some((f) => f.path.startsWith('server/'))).toBe(false)
    // No LLM calls — tokensUsed is 0
    expect(result.tokensUsed).toBe(0)
  })
})
