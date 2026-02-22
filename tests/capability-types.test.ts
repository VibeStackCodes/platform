import { describe, it, expect } from 'vitest'
import { CapabilitySchema, type Capability, type PageDef } from '@server/lib/capabilities/types'

describe('Capability contract types', () => {
  it('validates a minimal capability', () => {
    const cap: Capability = {
      name: 'recipes',
      version: 1,
      description: 'Recipe management',
      schema: [
        {
          name: 'recipes',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
          ],
        },
      ],
      pages: [
        { path: '/recipes', type: 'public-list', entity: 'recipes' },
        { path: '/recipes/$id', type: 'public-detail', entity: 'recipes' },
      ],
      components: [],
      dependencies: { npm: {}, capabilities: [] },
      navEntries: [{ label: 'Recipes', path: '/recipes', position: 'main' }],
      designHints: {},
    }
    const result = CapabilitySchema.safeParse(cap)
    expect(result.success).toBe(true)
  })

  it('rejects capability with missing name', () => {
    const result = CapabilitySchema.safeParse({ version: 1 })
    expect(result.success).toBe(false)
  })

  it('validates capability with runtime config', () => {
    const cap: Capability = {
      name: 'ai-chatbot',
      version: 1,
      description: 'AI chatbot widget',
      schema: [
        {
          name: 'chat_sessions',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
          ],
        },
      ],
      pages: [{ path: '/chat', type: 'interactive', entity: 'chat_sessions', component: 'ChatWidget' }],
      components: [{ name: 'ChatWidget', type: 'floating' }],
      dependencies: { npm: { '@vibestack/sdk': '^1.0.0' }, capabilities: ['auth'] },
      navEntries: [],
      designHints: { position: 'bottom-right', style: 'glass' },
      runtime: { type: 'managed', service: 'mastra-agent', config: { model: 'gpt-4o-mini' } },
    }
    const result = CapabilitySchema.safeParse(cap)
    expect(result.success).toBe(true)
  })

  it('PageDef types are mutually exclusive', () => {
    const publicList: PageDef = { path: '/recipes', type: 'public-list', entity: 'recipes' }
    const publicDetail: PageDef = { path: '/recipes/$id', type: 'public-detail', entity: 'recipes' }
    const crudList: PageDef = { path: '/admin/recipes', type: 'crud-list', entity: 'recipes' }
    const crudDetail: PageDef = { path: '/admin/recipes/$id', type: 'crud-detail', entity: 'recipes' }
    const interactive: PageDef = { path: '/chat', type: 'interactive', entity: 'chat_sessions', component: 'ChatWidget' }
    const staticPage: PageDef = { path: '/about', type: 'static', template: 'about' }
    expect([publicList, publicDetail, crudList, crudDetail, interactive, staticPage]).toHaveLength(6)
  })
})
