import { describe, it, expect } from 'vitest'
import { CapabilityRegistry } from '@server/lib/capabilities/registry'
import type { Capability } from '@server/lib/capabilities/types'

const authCap: Capability = {
  name: 'auth',
  version: 1,
  description: 'Authentication and user profiles',
  schema: [
    {
      name: 'profiles',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, references: { table: 'auth.users', column: 'id' } },
        { name: 'display_name', type: 'text', nullable: true },
      ],
    },
  ],
  pages: [
    { path: '/auth/login', type: 'static', template: 'login' },
    { path: '/auth/signup', type: 'static', template: 'signup' },
  ],
  components: [],
  dependencies: { npm: {}, capabilities: [] },
  navEntries: [],
  designHints: {},
}

const blogCap: Capability = {
  name: 'blog',
  version: 1,
  description: 'Blog with posts and categories',
  schema: [
    {
      name: 'posts',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false },
        { name: 'content', type: 'text', nullable: true },
        { name: 'author_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'published_at', type: 'timestamptz', nullable: true },
      ],
    },
    {
      name: 'categories',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
      ],
    },
  ],
  pages: [
    { path: '/blog', type: 'public-list', entity: 'posts' },
    { path: '/blog/$slug', type: 'public-detail', entity: 'posts' },
  ],
  components: [],
  dependencies: { npm: {}, capabilities: ['auth'] },
  navEntries: [{ label: 'Blog', path: '/blog', position: 'main', order: 2 }],
  designHints: { cardStyle: 'text-first' },
}

describe('CapabilityRegistry', () => {
  it('registers and retrieves capabilities', () => {
    const registry = new CapabilityRegistry()
    registry.register(authCap)
    registry.register(blogCap)
    expect(registry.get('auth')).toBe(authCap)
    expect(registry.get('blog')).toBe(blogCap)
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('lists all registered capabilities', () => {
    const registry = new CapabilityRegistry()
    registry.register(authCap)
    registry.register(blogCap)
    expect(registry.list().map((c) => c.name)).toEqual(['auth', 'blog'])
  })

  it('resolves dependency graph', () => {
    const registry = new CapabilityRegistry()
    registry.register(authCap)
    registry.register(blogCap)
    const resolved = registry.resolve(['blog'])
    expect(resolved.map((c) => c.name)).toEqual(['auth', 'blog'])
  })

  it('throws on missing dependency', () => {
    const registry = new CapabilityRegistry()
    registry.register(blogCap)
    expect(() => registry.resolve(['blog'])).toThrow(/auth/)
  })

  it('throws on circular dependency', () => {
    const capA: Capability = {
      ...authCap,
      name: 'a',
      dependencies: { npm: {}, capabilities: ['b'] },
    }
    const capB: Capability = {
      ...authCap,
      name: 'b',
      dependencies: { npm: {}, capabilities: ['a'] },
    }
    const registry = new CapabilityRegistry()
    registry.register(capA)
    registry.register(capB)
    expect(() => registry.resolve(['a'])).toThrow(/circular/i)
  })

  it('deduplicates when multiple capabilities share a dependency', () => {
    const recipesCap: Capability = {
      ...authCap,
      name: 'recipes',
      dependencies: { npm: {}, capabilities: ['auth'] },
    }
    const registry = new CapabilityRegistry()
    registry.register(authCap)
    registry.register(blogCap)
    registry.register(recipesCap)
    const resolved = registry.resolve(['blog', 'recipes'])
    const names = resolved.map((c) => c.name)
    expect(names.filter((n) => n === 'auth')).toHaveLength(1)
    expect(names.indexOf('auth')).toBeLessThan(names.indexOf('blog'))
    expect(names.indexOf('auth')).toBeLessThan(names.indexOf('recipes'))
  })
})
