import { describe, it, expect } from 'vitest'
import { assembleCapabilities } from '@server/capabilities/assembler'
import type { Capability } from '@server/capabilities/types'

const authCap: Capability = {
  name: 'auth',
  version: 1,
  description: 'Authentication',
  schema: [
    {
      name: 'profiles',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, references: { table: 'auth.users', column: 'id' } },
        { name: 'display_name', type: 'text', nullable: true },
      ],
    },
  ],
  pages: [],
  components: [],
  dependencies: { npm: {}, capabilities: [] },
  navEntries: [],
  designHints: {},
}

const blogCap: Capability = {
  name: 'blog',
  version: 1,
  description: 'Blog system',
  schema: [
    {
      name: 'posts',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'author_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
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

const publicWebsiteCap: Capability = {
  name: 'public-website',
  version: 1,
  description: 'Landing page, about, contact',
  schema: [],
  pages: [
    { path: '/', type: 'static', template: 'landing' },
    { path: '/about', type: 'static', template: 'about' },
  ],
  components: [],
  dependencies: { npm: {}, capabilities: [] },
  navEntries: [
    { label: 'Home', path: '/', position: 'main', order: 0 },
    { label: 'About', path: '/about', position: 'main', order: 99 },
  ],
  designHints: {},
}

describe('assembleCapabilities', () => {
  it('merges schemas from multiple capabilities', () => {
    const result = assembleCapabilities([authCap, blogCap])
    expect(result.contract.tables.map((t) => t.name)).toContain('profiles')
    expect(result.contract.tables.map((t) => t.name)).toContain('posts')
  })

  it('deduplicates tables with same name', () => {
    const dup: Capability = {
      ...authCap,
      name: 'dup',
      dependencies: { npm: {}, capabilities: [] },
    }
    const result = assembleCapabilities([authCap, dup])
    const profileTables = result.contract.tables.filter((t) => t.name === 'profiles')
    expect(profileTables).toHaveLength(1)
  })

  it('merges nav entries sorted by order', () => {
    const result = assembleCapabilities([publicWebsiteCap, blogCap, authCap])
    const labels = result.navEntries.map((n) => n.label)
    expect(labels).toEqual(['Home', 'Blog', 'About'])
  })

  it('merges npm dependencies', () => {
    const withDeps: Capability = {
      ...blogCap,
      dependencies: { npm: { marked: '^5.0.0' }, capabilities: ['auth'] },
    }
    const result = assembleCapabilities([authCap, withDeps])
    expect(result.npmDependencies).toHaveProperty('marked', '^5.0.0')
  })

  it('collects all pages from all capabilities', () => {
    const result = assembleCapabilities([publicWebsiteCap, blogCap, authCap])
    const paths = result.pages.map((p) => p.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/blog')
    expect(paths).toContain('/blog/$slug')
  })

  it('detects route conflicts', () => {
    const conflict: Capability = {
      ...blogCap,
      name: 'conflict',
      pages: [{ path: '/blog', type: 'public-list', entity: 'other' }],
      dependencies: { npm: {}, capabilities: [] },
    }
    expect(() => assembleCapabilities([blogCap, conflict])).toThrow(/route conflict.*\/blog/i)
  })

  it('collects capability manifest', () => {
    const result = assembleCapabilities([authCap, blogCap])
    expect(result.capabilityManifest).toEqual(['auth', 'blog'])
  })

  it('infers auth feature when auth capability present', () => {
    const result = assembleCapabilities([authCap, blogCap])
    expect(result.hasAuth).toBe(true)
  })

  it('no auth when auth capability absent', () => {
    const noAuthBlog: Capability = {
      ...blogCap,
      dependencies: { npm: {}, capabilities: [] },
    }
    const result = assembleCapabilities([noAuthBlog])
    expect(result.hasAuth).toBe(false)
  })
})
