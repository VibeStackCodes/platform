import { describe, expect, it, vi } from 'vitest'
import type { SchemaContract } from '@server/lib/schema-contract'
import type { AppBlueprint } from '@server/lib/app-blueprint'
import type { AssemblyResult } from '@server/lib/capabilities/assembler'

vi.mock('@server/lib/app-blueprint', () => ({
  contractToBlueprintWithDesignAgent: vi.fn(async (input) => ({
    meta: { appName: input.appName, appDescription: input.appDescription },
    contract: input.contract,
    features: { auth: false, entities: input.contract.tables.map((t: { name: string }) => t.name) },
    fileTree: [
      { path: 'src/lib/supabase.ts', content: '', layer: 1, isLLMSlot: false },
      { path: 'supabase/migrations/0001_initial.sql', content: '', layer: 2, isLLMSlot: false },
    ],
  }) as AppBlueprint),
}))

import { runBlueprint } from '@server/lib/agents/orchestrator'
import { contractToBlueprintWithDesignAgent } from '@server/lib/app-blueprint'

describe('runBlueprint', () => {
  it('generates AppBlueprint from contract', async () => {
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
    const result = await runBlueprint({
      appName: 'TaskFlow',
      appDescription: 'Task management',
      contract,
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

  it('passes assembly result through to blueprint builder', async () => {
    const contract: SchemaContract = {
      tables: [{ name: 'task', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] }],
    }
    const assembly: AssemblyResult = {
      contract,
      pages: [{ path: '/tasks', type: 'public-list', entity: 'task' }],
      components: [],
      navEntries: [{ label: 'Tasks', path: '/tasks', position: 'main' }],
      npmDependencies: {},
      designHints: {},
      capabilityManifest: ['tasks'],
      hasAuth: false,
    }

    await runBlueprint({
      appName: 'TaskFlow',
      appDescription: 'Task management',
      contract,
      assembly,
    })

    expect(vi.mocked(contractToBlueprintWithDesignAgent)).toHaveBeenCalledWith(
      expect.objectContaining({ assembly }),
    )
  })
})
