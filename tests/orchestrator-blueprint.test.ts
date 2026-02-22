import { describe, expect, it } from 'vitest'
import type { SchemaContract } from '@server/lib/schema-contract'
import type { AssemblyResult } from '@server/lib/capabilities/assembler'

import { runBlueprint } from '@server/lib/agents/orchestrator'

describe('runBlueprint', () => {
  it('throws — Pipeline A removed', async () => {
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
    await expect(
      runBlueprint({ appName: 'TaskFlow', appDescription: 'Task management', contract }),
    ).rejects.toThrow('Pipeline A removed')
  })

  it('throws regardless of assembly input', async () => {
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

    await expect(
      runBlueprint({ appName: 'TaskFlow', appDescription: 'Task management', contract, assembly }),
    ).rejects.toThrow('Pipeline A removed')
  })
})
