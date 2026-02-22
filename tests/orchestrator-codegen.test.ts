import { describe, expect, it } from 'vitest'
import { inferPageConfig } from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

describe('inferPageConfig (deterministic — no LLM)', () => {
  it('picks title as headerField and includes it in listColumns', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'status', type: 'text' },
            { name: 'created_at', type: 'timestamptz' },
          ],
        },
      ],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    expect(config.entityName).toBe('task')
    expect(config.headerField).toBe('title')
    expect(config.listColumns).toContain('title')
    expect(config.listColumns).toContain('status')
  })

  it('detects enum fields from semantic types', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
            { name: 'status', type: 'text' },
            { name: 'priority', type: 'text' },
          ],
        },
      ],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const fieldNames = config.enumFields.map((e) => e.field)
    expect(fieldNames).toContain('status')
    // status gets well-known defaults
    const statusEnum = config.enumFields.find((e) => e.field === 'status')
    expect(statusEnum?.options).toEqual(['pending', 'active', 'completed'])
  })

  it('uses contract.enums when available', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'status', type: 'text' },
          ],
        },
      ],
      enums: [
        { name: 'status', values: ['draft', 'published', 'archived'] },
      ],
    }
    const config = inferPageConfig(contract.tables[0], contract)
    const statusEnum = config.enumFields.find((e) => e.field === 'status')
    expect(statusEnum?.options).toEqual(['draft', 'published', 'archived'])
  })
})

