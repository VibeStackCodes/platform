import { contractToBlueprint } from '@server/lib/app-blueprint'
import type { SchemaContract, DesignPreferences } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToBlueprint', () => {
  const contract: SchemaContract = {
    tables: [
      {
        name: 'bookmark',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
          { name: 'url', type: 'text', nullable: false },
          { name: 'title', type: 'text' },
          { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
        ],
      },
      {
        name: 'tag',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'text', nullable: false, unique: true },
        ],
      },
    ],
  }

  const designPreferences: DesignPreferences = {
    style: 'modern',
    primaryColor: '#3b82f6',
    fontFamily: 'Inter',
  }

  it('produces a blueprint with meta, features, and fileTree', () => {
    const bp = contractToBlueprint({
      appName: 'MarkNest',
      appDescription: 'A bookmark manager',
      contract,
      designPreferences,
    })

    expect(bp.meta.appName).toBe('MarkNest')
    expect(bp.features.auth).toBe(true)
    expect(bp.features.entities).toContain('bookmark')
    expect(bp.features.entities).toContain('tag')
  })

  it('includes all layer 1 files (Drizzle schema, index.css, index.html)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('server/db/schema.ts')
    expect(paths).toContain('src/index.css')
    expect(paths).toContain('index.html')
  })

  it('includes all layer 2 files (tRPC routers, root router, .env, migration)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('server/trpc/routers/bookmark.ts')
    expect(paths).toContain('server/trpc/routers/tag.ts')
    expect(paths).toContain('server/trpc/router.ts')
    expect(paths).toContain('.env')
    expect(paths).toContain('drizzle/0001_initial.sql')
  })

  it('includes all layer 4 page skeletons', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/routes/_authenticated/bookmarks.tsx')
    expect(paths).toContain('src/routes/_authenticated/bookmarks.$id.tsx')
    expect(paths).toContain('src/routes/_authenticated/tags.tsx')
  })

  it('includes layer 5 wiring files (main.tsx, app-layout)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/main.tsx')
    expect(paths).toContain('src/components/app-layout.tsx')
  })

  it('marks LLM-filled files with isLLMSlot=true', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const pageFile = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/bookmarks.tsx')
    expect(pageFile?.isLLMSlot).toBe(true)

    const schemaFile = bp.fileTree.find((f) => f.path === 'server/db/schema.ts')
    expect(schemaFile?.isLLMSlot).toBe(false)
  })

  it('assigns correct layers to files', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const schemaFile = bp.fileTree.find((f) => f.path === 'server/db/schema.ts')
    expect(schemaFile?.layer).toBe(1)

    const routerFile = bp.fileTree.find((f) => f.path === 'server/trpc/routers/bookmark.ts')
    expect(routerFile?.layer).toBe(2)

    const pageFile = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/bookmarks.tsx')
    expect(pageFile?.layer).toBe(4)

    const mainFile = bp.fileTree.find((f) => f.path === 'src/main.tsx')
    expect(mainFile?.layer).toBe(5)
  })

  it('generates index.css with theme variables from designPreferences', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const cssFile = bp.fileTree.find((f) => f.path === 'src/index.css')
    expect(cssFile?.content).toContain('@import "tailwindcss"')
    expect(cssFile?.content).toContain('@theme')
    expect(cssFile?.content).toContain('--color-primary')
  })

  it('generates .env with placeholder Supabase credentials', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const envFile = bp.fileTree.find((f) => f.path === '.env')
    expect(envFile?.content).toContain('DATABASE_URL=')
    expect(envFile?.content).toContain('SUPABASE_URL=')
    expect(envFile?.content).toContain('SUPABASE_ANON_KEY=')
  })
})
