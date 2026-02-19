# Capability Compositor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform VibeStack from a monolithic code generator into a capability compositor that assembles production web apps from self-contained capability contracts, styled by an LLM-driven design/polish layer.

**Architecture:** Two-layer system — TypeScript capability contracts drive a deterministic assembler (schema merge, routing, hooks, pages), while SKILL.md design knowledge guides an LLM polish agent that rewrites public-facing pages with unique creative UI. New capabilities inject additively into existing apps.

**Tech Stack:** Mastra 1.4+ (agents + Workspace), Daytona (sandbox), Supabase (DB/auth), Vite + React + TanStack Router (generated apps), XState (pipeline orchestration)

---

## Phase Overview

| Phase | Deliverable | Incremental Value |
|-------|------------|-------------------|
| **1** | Capability contract types + assembler + 5 core capabilities | Apps assembled from composable contracts instead of monolithic generator |
| **2** | Polish agent with Mastra Workspace | Each app gets unique, creative public-facing pages |
| **3** | Additive injection pipeline | Users can add capabilities to existing deployed apps |
| **4** | Managed runtime capabilities | AI chatbot, analytics, webhook relay — VibeStack Cloud backend |

---

## Phase 1: Capability Contracts + Assembler

### Task 1: Define Capability Contract Types

**Files:**
- Create: `server/lib/capabilities/types.ts`
- Test: `tests/capability-types.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/capability-types.test.ts
import { describe, it, expect } from 'vitest'
import { CapabilitySchema, type Capability, type PageDef, type ComponentDef, type NavEntry, type DesignHints } from '@server/capabilities/types'

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
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/capability-types.test.ts`
Expected: FAIL with "Cannot find module '@server/capabilities/types'"

**Step 3: Write the implementation**

```typescript
// server/lib/capabilities/types.ts

import { z } from 'zod'
import type { TableDef, ColumnDef, RLSPolicy, EnumDef } from '../schema-contract'

// ============================================================================
// Page definitions — what routes a capability creates
// ============================================================================

export type PageType =
  | 'public-list'      // Public browsable list (e.g., /recipes)
  | 'public-detail'    // Public detail view (e.g., /recipes/$id)
  | 'crud-list'        // Authenticated CRUD list (e.g., /admin/recipes)
  | 'crud-detail'      // Authenticated CRUD detail (e.g., /admin/recipes/$id)
  | 'interactive'      // Custom interactive page (e.g., /chat)
  | 'static'           // Static content page (e.g., /about)

export interface PageDef {
  path: string          // Route path (e.g., '/recipes', '/recipes/$id')
  type: PageType
  entity?: string       // Database table this page operates on
  component?: string    // Custom component name (for 'interactive' type)
  template?: string     // Template name (for 'static' type)
}

// ============================================================================
// Component definitions — shared UI components a capability provides
// ============================================================================

export type ComponentType = 'floating' | 'embedded' | 'modal' | 'sidebar'

export interface ComponentDef {
  name: string          // PascalCase component name (e.g., 'ChatWidget')
  type: ComponentType   // How it's rendered in the app
  props?: Record<string, string>  // Expected props with type descriptions
}

// ============================================================================
// Navigation entries
// ============================================================================

export type NavPosition = 'main' | 'footer' | 'sidebar' | 'none'

export interface NavEntry {
  label: string
  path: string
  position: NavPosition
  icon?: string         // Lucide icon name
  order?: number        // Sort order (lower = earlier)
}

// ============================================================================
// Design hints — guide the polish agent
// ============================================================================

export interface DesignHints {
  cardStyle?: 'media-heavy' | 'text-first' | 'compact' | 'glass'
  heroType?: 'featured-item' | 'text-centered' | 'image-split' | 'none'
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'fullscreen'
  style?: 'glass' | 'solid' | 'outlined' | 'minimal'
  [key: string]: string | undefined  // Extensible
}

// ============================================================================
// Runtime configuration — for managed VibeStack Cloud features
// ============================================================================

export interface RuntimeConfig {
  type: 'managed'
  service: 'mastra-agent' | 'rag-pipeline' | 'webhook-relay' | 'analytics-ingest'
  config: Record<string, unknown>
}

// ============================================================================
// The Capability Contract — the atomic unit
// ============================================================================

export interface Capability {
  name: string
  version: number
  description: string

  // What it needs
  schema: TableDef[]
  pages: PageDef[]
  components: ComponentDef[]
  dependencies: {
    npm: Record<string, string>
    capabilities: string[]
  }

  // How it integrates
  navEntries: NavEntry[]
  designHints: DesignHints

  // Where intelligence lives (optional — most capabilities are fully generated)
  runtime?: RuntimeConfig
}

// ============================================================================
// Zod schema for runtime validation
// ============================================================================

const PageDefSchema = z.object({
  path: z.string().min(1),
  type: z.enum(['public-list', 'public-detail', 'crud-list', 'crud-detail', 'interactive', 'static']),
  entity: z.string().optional(),
  component: z.string().optional(),
  template: z.string().optional(),
})

const ComponentDefSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['floating', 'embedded', 'modal', 'sidebar']),
  props: z.record(z.string()).optional(),
})

const NavEntrySchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
  position: z.enum(['main', 'footer', 'sidebar', 'none']),
  icon: z.string().optional(),
  order: z.number().optional(),
})

const RuntimeConfigSchema = z.object({
  type: z.literal('managed'),
  service: z.enum(['mastra-agent', 'rag-pipeline', 'webhook-relay', 'analytics-ingest']),
  config: z.record(z.unknown()),
})

export const CapabilitySchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().min(1),
  schema: z.array(z.object({
    name: z.string(),
    columns: z.array(z.any()),  // Validated by SchemaContractSchema downstream
  }).passthrough()),
  pages: z.array(PageDefSchema),
  components: z.array(ComponentDefSchema),
  dependencies: z.object({
    npm: z.record(z.string()),
    capabilities: z.array(z.string()),
  }),
  navEntries: z.array(NavEntrySchema),
  designHints: z.record(z.any()),
  runtime: RuntimeConfigSchema.optional(),
})
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/capability-types.test.ts`
Expected: PASS — all 4 tests green

**Step 5: Commit**

```bash
git add server/lib/capabilities/types.ts tests/capability-types.test.ts
git commit -m "feat(capabilities): define Capability contract types with Zod validation"
```

---

### Task 2: Create the Capability Registry

**Files:**
- Create: `server/lib/capabilities/registry.ts`
- Test: `tests/capability-registry.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/capability-registry.test.ts
import { describe, it, expect } from 'vitest'
import { CapabilityRegistry } from '@server/capabilities/registry'
import type { Capability } from '@server/capabilities/types'

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
    expect(registry.list().map(c => c.name)).toEqual(['auth', 'blog'])
  })

  it('resolves dependency graph', () => {
    const registry = new CapabilityRegistry()
    registry.register(authCap)
    registry.register(blogCap)
    // blog depends on auth — resolved order should be [auth, blog]
    const resolved = registry.resolve(['blog'])
    expect(resolved.map(c => c.name)).toEqual(['auth', 'blog'])
  })

  it('throws on missing dependency', () => {
    const registry = new CapabilityRegistry()
    registry.register(blogCap) // blog needs auth but auth not registered
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
    // auth appears once, then blog and recipes
    const names = resolved.map(c => c.name)
    expect(names.filter(n => n === 'auth')).toHaveLength(1)
    expect(names.indexOf('auth')).toBeLessThan(names.indexOf('blog'))
    expect(names.indexOf('auth')).toBeLessThan(names.indexOf('recipes'))
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/capability-registry.test.ts`
Expected: FAIL with "Cannot find module '@server/capabilities/registry'"

**Step 3: Write the implementation**

```typescript
// server/lib/capabilities/registry.ts

import type { Capability } from './types'

export class CapabilityRegistry {
  private caps = new Map<string, Capability>()

  register(cap: Capability): void {
    this.caps.set(cap.name, cap)
  }

  get(name: string): Capability | undefined {
    return this.caps.get(name)
  }

  list(): Capability[] {
    return [...this.caps.values()]
  }

  /**
   * Topological sort: resolve all dependencies for a set of requested capabilities.
   * Returns capabilities in dependency order (dependencies first).
   * Throws on missing or circular dependencies.
   */
  resolve(requested: string[]): Capability[] {
    const resolved: Capability[] = []
    const resolvedNames = new Set<string>()
    const visiting = new Set<string>()

    const visit = (name: string, path: string[]) => {
      if (resolvedNames.has(name)) return
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${[...path, name].join(' → ')}`)
      }

      const cap = this.caps.get(name)
      if (!cap) {
        throw new Error(`Missing capability dependency: "${name}" (required by ${path.at(-1) ?? 'root'})`)
      }

      visiting.add(name)
      for (const dep of cap.dependencies.capabilities) {
        visit(dep, [...path, name])
      }
      visiting.delete(name)

      resolvedNames.add(name)
      resolved.push(cap)
    }

    for (const name of requested) {
      visit(name, [])
    }

    return resolved
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/capability-registry.test.ts`
Expected: PASS — all 6 tests green

**Step 5: Commit**

```bash
git add server/lib/capabilities/registry.ts tests/capability-registry.test.ts
git commit -m "feat(capabilities): registry with topological dependency resolution"
```

---

### Task 3: Create the Assembler (Schema Merge + Blueprint)

**Files:**
- Create: `server/lib/capabilities/assembler.ts`
- Test: `tests/capability-assembler.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/capability-assembler.test.ts
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
    expect(result.contract.tables.map(t => t.name)).toContain('profiles')
    expect(result.contract.tables.map(t => t.name)).toContain('posts')
  })

  it('deduplicates tables with same name', () => {
    const dup: Capability = {
      ...authCap,
      name: 'dup',
      dependencies: { npm: {}, capabilities: [] },
    }
    const result = assembleCapabilities([authCap, dup])
    const profileTables = result.contract.tables.filter(t => t.name === 'profiles')
    expect(profileTables).toHaveLength(1)
  })

  it('merges nav entries sorted by order', () => {
    const result = assembleCapabilities([publicWebsiteCap, blogCap, authCap])
    const labels = result.navEntries.map(n => n.label)
    // Home (0) < Blog (2) < About (99)
    expect(labels).toEqual(['Home', 'Blog', 'About'])
  })

  it('merges npm dependencies', () => {
    const withDeps: Capability = {
      ...blogCap,
      dependencies: { npm: { 'marked': '^5.0.0' }, capabilities: ['auth'] },
    }
    const result = assembleCapabilities([authCap, withDeps])
    expect(result.npmDependencies).toHaveProperty('marked', '^5.0.0')
  })

  it('collects all pages from all capabilities', () => {
    const result = assembleCapabilities([publicWebsiteCap, blogCap, authCap])
    const paths = result.pages.map(p => p.path)
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
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/capability-assembler.test.ts`
Expected: FAIL with "Cannot find module '@server/capabilities/assembler'"

**Step 3: Write the implementation**

```typescript
// server/lib/capabilities/assembler.ts

import type { SchemaContract, TableDef } from '../schema-contract'
import type { Capability, PageDef, NavEntry, ComponentDef, DesignHints } from './types'

export interface AssemblyResult {
  contract: SchemaContract
  pages: PageDef[]
  components: ComponentDef[]
  navEntries: NavEntry[]
  npmDependencies: Record<string, string>
  designHints: DesignHints          // Merged hints (last-wins per key)
  capabilityManifest: string[]      // Ordered list of active capability names
  hasAuth: boolean
}

/**
 * Assembles multiple resolved capabilities into a single AssemblyResult.
 * Capabilities must already be in dependency order (use CapabilityRegistry.resolve()).
 *
 * This function is purely deterministic — no LLM calls.
 */
export function assembleCapabilities(capabilities: Capability[]): AssemblyResult {
  const tableMap = new Map<string, TableDef>()
  const pages: PageDef[] = []
  const routeSet = new Set<string>()
  const components: ComponentDef[] = []
  const allNavEntries: NavEntry[] = []
  const npmDeps: Record<string, string> = {}
  const mergedHints: DesignHints = {}
  const manifest: string[] = []

  for (const cap of capabilities) {
    manifest.push(cap.name)

    // Merge schemas — first definition wins (dep order means deps come first)
    for (const table of cap.schema) {
      if (!tableMap.has(table.name)) {
        tableMap.set(table.name, table as TableDef)
      }
    }

    // Collect pages — detect route conflicts
    for (const page of cap.pages) {
      if (routeSet.has(page.path)) {
        throw new Error(
          `Route conflict: "${page.path}" is defined by both "${cap.name}" and a previous capability`
        )
      }
      routeSet.add(page.path)
      pages.push(page)
    }

    // Collect components
    components.push(...cap.components)

    // Collect nav entries
    allNavEntries.push(...cap.navEntries)

    // Merge npm deps (later version wins — simple semver last-wins)
    Object.assign(npmDeps, cap.dependencies.npm)

    // Merge design hints (last-wins per key)
    Object.assign(mergedHints, cap.designHints)
  }

  // Sort nav entries by order (default 50), then alphabetically
  allNavEntries.sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.label.localeCompare(b.label))

  const contract: SchemaContract = {
    tables: [...tableMap.values()],
  }

  const hasAuth = manifest.includes('auth')

  return {
    contract,
    pages,
    components,
    navEntries: allNavEntries,
    npmDependencies: npmDeps,
    designHints: mergedHints,
    capabilityManifest: manifest,
    hasAuth,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/capability-assembler.test.ts`
Expected: PASS — all 9 tests green

**Step 5: Commit**

```bash
git add server/lib/capabilities/assembler.ts tests/capability-assembler.test.ts
git commit -m "feat(capabilities): assembler merges schemas, pages, nav from capability contracts"
```

---

### Task 4: Create 5 Core Capability Contracts (auth, public-website, blog, recipes, portfolio)

**Files:**
- Create: `server/lib/capabilities/catalog/auth.ts`
- Create: `server/lib/capabilities/catalog/public-website.ts`
- Create: `server/lib/capabilities/catalog/blog.ts`
- Create: `server/lib/capabilities/catalog/recipes.ts`
- Create: `server/lib/capabilities/catalog/portfolio.ts`
- Create: `server/lib/capabilities/catalog/index.ts` (registry loader)
- Test: `tests/capability-catalog.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/capability-catalog.test.ts
import { describe, it, expect } from 'vitest'
import { loadCoreRegistry } from '@server/capabilities/catalog/index'
import { assembleCapabilities } from '@server/capabilities/assembler'

describe('Core capability catalog', () => {
  it('loads all 5 core capabilities', () => {
    const registry = loadCoreRegistry()
    expect(registry.list()).toHaveLength(5)
    expect(registry.get('auth')).toBeDefined()
    expect(registry.get('public-website')).toBeDefined()
    expect(registry.get('blog')).toBeDefined()
    expect(registry.get('recipes')).toBeDefined()
    expect(registry.get('portfolio')).toBeDefined()
  })

  it('resolves "recipe website" capabilities', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'recipes', 'auth'])
    expect(resolved.map(c => c.name)).toContain('auth')
    expect(resolved.map(c => c.name)).toContain('public-website')
    expect(resolved.map(c => c.name)).toContain('recipes')
  })

  it('assembles a blog app without errors', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'blog'])
    const result = assembleCapabilities(resolved)
    expect(result.contract.tables.length).toBeGreaterThan(0)
    expect(result.hasAuth).toBe(true) // blog requires auth
    expect(result.navEntries.length).toBeGreaterThan(0)
  })

  it('assembles a portfolio app without errors', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'portfolio'])
    const result = assembleCapabilities(resolved)
    expect(result.contract.tables.map(t => t.name)).toContain('projects')
    expect(result.hasAuth).toBe(true) // portfolio requires auth
  })

  it('produces valid SchemaContract from assembled capabilities', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['public-website', 'recipes', 'blog'])
    const result = assembleCapabilities(resolved)
    // Every table should have an id column
    for (const table of result.contract.tables) {
      const idCol = table.columns.find(c => c.name === 'id')
      expect(idCol, `Table ${table.name} missing id column`).toBeDefined()
    }
  })

  it('no duplicate tables when assembling multiple capabilities that share auth', () => {
    const registry = loadCoreRegistry()
    const resolved = registry.resolve(['blog', 'recipes', 'public-website'])
    const result = assembleCapabilities(resolved)
    const tableNames = result.contract.tables.map(t => t.name)
    const unique = [...new Set(tableNames)]
    expect(tableNames).toEqual(unique)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/capability-catalog.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write the 5 capability contracts + registry loader**

Each capability contract is a TypeScript file exporting a `Capability` object. These contracts reuse the existing `TableDef` format from `schema-contract.ts` so they feed directly into `contractToSQL`, `contractToTypes`, `contractToHooks`, etc.

The contracts should be based on the schemas the analyst LLM currently generates for these app types (reference: `docs/e2e-pipeline-learnings.md` for real examples).

Create the 5 contract files + the `index.ts` registry loader. Each contract:
- Has well-typed `TableDef[]` with proper PK, FK references, nullable flags
- Declares the routes it creates (public list/detail for browsable entities)
- Declares nav entries with sort order
- Has design hints for the polish agent

Then create `server/lib/capabilities/catalog/index.ts`:

```typescript
// server/lib/capabilities/catalog/index.ts
import { CapabilityRegistry } from '../registry'
import { auth } from './auth'
import { publicWebsite } from './public-website'
import { blog } from './blog'
import { recipes } from './recipes'
import { portfolio } from './portfolio'

export function loadCoreRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(auth)
  registry.register(publicWebsite)
  registry.register(blog)
  registry.register(recipes)
  registry.register(portfolio)
  return registry
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/capability-catalog.test.ts`
Expected: PASS — all 6 tests green

**Step 5: Commit**

```bash
git add server/lib/capabilities/catalog/ tests/capability-catalog.test.ts
git commit -m "feat(capabilities): 5 core capability contracts (auth, public-website, blog, recipes, portfolio)"
```

---

### Task 5: Wire Assembler into Analyst → Capability Selection

**Files:**
- Modify: `server/lib/agents/orchestrator.ts` — `runAnalysis()` returns selected capability names
- Modify: `server/lib/agents/schemas.ts` — add `selectedCapabilities` to analyst output schema
- Modify: `server/lib/agents/machine.ts` — new context field `capabilityManifest`
- Test: `tests/orchestrator-analysis.test.ts` — update existing tests

**Context:** Currently the analyst LLM generates a raw `SchemaContract`. In the new architecture, the analyst selects capabilities from the catalog and may add custom tables. The assembler then merges the capability schemas with any extra tables.

**Step 1: Update the analyst output schema**

In `server/lib/agents/schemas.ts`, add `selectedCapabilities: z.array(z.string())` to the analyst output schema. This is a list of capability names (e.g., `['auth', 'public-website', 'recipes']`).

**Step 2: Update `runAnalysis()` in `orchestrator.ts`**

After the analyst returns, use the `selectedCapabilities` to resolve and assemble:
```typescript
const registry = loadCoreRegistry()
const resolved = registry.resolve(analysis.selectedCapabilities)
const assembled = assembleCapabilities(resolved)
// Merge any extra tables the analyst added on top
const contract = mergeExtraTables(assembled.contract, analysis.extraTables)
```

**Step 3: Update machine context**

Add `capabilityManifest: string[]` to `MachineContext`. Pass it through from analysis result.

**Step 4: Update tests**

Existing `tests/orchestrator-analysis.test.ts` tests should be updated to expect the new `selectedCapabilities` field in the analyst output.

**Step 5: Commit**

```bash
git add server/lib/agents/orchestrator.ts server/lib/agents/schemas.ts server/lib/agents/machine.ts tests/orchestrator-analysis.test.ts
git commit -m "feat(capabilities): wire assembler into analyst → capability selection pipeline"
```

---

### Task 6: Integrate Assembler Output into Blueprint Generation

**Files:**
- Modify: `server/lib/app-blueprint.ts` — `contractToBlueprintWithDesignAgent()` accepts `AssemblyResult`
- Modify: `server/lib/agents/orchestrator.ts` — `runBlueprint()` passes assembly result
- Test: `tests/app-blueprint.test.ts` — update for new input shape

**Context:** Currently `buildBlueprintFromTokens()` takes `BlueprintInput` (appName, contract, tokens). In the new flow, it also receives the `AssemblyResult` with pages, nav entries, components, and design hints. The blueprint generator uses these instead of inferring everything from the schema.

**Step 1: Add `AssemblyResult` as optional input to `buildBlueprintFromTokens()`**

When an `AssemblyResult` is provided, use its `pages` and `navEntries` instead of the auto-inferred ones. This is backward-compatible — when `AssemblyResult` is `undefined`, the existing behavior is unchanged.

**Step 2: Update `generateRouteTree()`**

Currently generates routes from all tables. When `AssemblyResult.pages` is available, generate routes from those page definitions instead. Public pages use the archetype layout system, CRUD pages use the existing generic generators.

**Step 3: Update navigation generation**

Use `AssemblyResult.navEntries` when available. Fall back to auto-inferred nav from schema entities.

**Step 4: Update tests**

```bash
bunx vitest run tests/app-blueprint.test.ts
```

**Step 5: Commit**

```bash
git add server/lib/app-blueprint.ts server/lib/agents/orchestrator.ts tests/app-blueprint.test.ts
git commit -m "feat(capabilities): blueprint generation uses AssemblyResult pages + nav entries"
```

---

### Task 7: End-to-End Verification

**Files:**
- Modify: `scripts/e2e-pipeline-test.ts` — add a capability-based test case
- Run: full pipeline test

**Step 1: Add E2E test case**

Add a test case to the E2E script that uses capability-based generation:
```
{ prompt: 'recipe website with blog', expectedCapabilities: ['auth', 'public-website', 'recipes', 'blog'] }
```

**Step 2: Run E2E**

```bash
bun scripts/e2e-pipeline-test.ts
```

Verify:
- Analyst selects correct capabilities
- Assembler merges schemas correctly
- Blueprint generates all expected routes
- Build passes (tsc + vite build)
- Deploy succeeds

**Step 3: Run full test suite**

```bash
bunx tsc --noEmit && bun run lint && bun run test
```

**Step 4: Commit**

```bash
git add scripts/e2e-pipeline-test.ts
git commit -m "test: E2E verification for capability-based generation"
```

---

## Phase 2: Polish Agent with Mastra Workspace (Outline)

### Task 8: Create Polish Agent with Mastra Workspace
- Create `server/lib/agents/polish-agent.ts`
- Agent uses Mastra Workspace to read scaffold files + SKILL.md design knowledge
- Rewrites public-facing page JSX with creative, unique UI
- Cannot touch: SQL, types, hooks, auth, private CRUD pages
- Token budget enforcement (configurable, ~50K default)

### Task 9: Add `polishing` State to XState Machine
- New state between `generating` and `validating`
- Invokes `runPolishActor` which calls the polish agent
- Passes: sandboxId, blueprint file list, design skill path, token budget
- On success → `validating`; on failure → serve scaffold without polish (graceful degradation)

### Task 10: Polish Agent Validation Gate
- Polish agent runs `tsc + vite build` in Workspace sandbox
- Self-repairs up to 3 times on build failure
- If all repairs fail, revert to scaffold (no polish)

### Task 11: Design Skill Integration
- Polish agent reads the selected SKILL.md (from design-agent selection)
- Uses design hints from capability contracts to guide visual decisions
- Each SKILL.md provides visual language (colors, typography, layout patterns)
- Capability designHints provide structural guidance (card style, hero type)

---

## Phase 3: Additive Injection Pipeline (Outline)

### Task 12: Capability Manifest Storage
- Store `capabilityManifest` in `projects` table (JSONB column)
- On project load, read existing manifest to know what's already installed

### Task 13: Inject Analyzer
- New analyst mode: reads existing manifest + user request
- Identifies NEW capabilities to add (not already installed)
- Returns: `newCapabilities`, `removedCapabilities` (always empty v1)

### Task 14: Additive Assembler
- Takes existing app state + new capabilities
- Generates ONLY: new tables (additive SQL migration), new pages, new hooks, new routes
- Merges new nav entries into existing navigation
- NEVER modifies existing files (except nav regeneration)

### Task 15: Incremental Deploy
- Upload only new files to sandbox
- Run additive migration on existing Supabase project
- Rebuild and redeploy

---

## Phase 4: Managed Runtime Capabilities (Outline)

### Task 16: `@vibestack/sdk` Package
- Client-side SDK for managed capabilities
- `createVibeStackClient({ projectId, apiKey })` → typed API client
- Methods: `chat.send()`, `analytics.track()`, `rag.query()`

### Task 17: AI Chatbot Capability
- Capability contract: `chat_sessions` + `chat_messages` tables
- `ChatWidget` floating component
- Runtime: `mastra-agent` service on VibeStack Cloud
- SDK calls `POST /api/vibestack/chat` → Mastra agent

### Task 18: Analytics Capability
- Capability contract: `events` + `page_views` tables
- Analytics dashboard page
- Runtime: `analytics-ingest` service
- SDK auto-tracks page views, custom events via `analytics.track()`

### Task 19: Webhook Relay Capability
- For capabilities that need external event processing (Stripe, email)
- Runtime: `webhook-relay` service
- Routes external webhooks through VibeStack Cloud to generated app's Supabase

---

## Verification Checklist (Phase 1 Complete)

```bash
# All must pass before Phase 1 is considered done
bunx tsc --noEmit                    # Clean compile
bun run lint                         # 0 errors
bun run test                         # All tests pass (including new ones)
bun scripts/e2e-pipeline-test.ts     # E2E deploy succeeds
```

Expected test count increase: ~25-30 new tests across 4 test files.
