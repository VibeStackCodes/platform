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

  it('includes all layer 1 files (supabase client, index.css, index.html)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/lib/supabase.ts')
    expect(paths).toContain('src/index.css')
    expect(paths).toContain('index.html')
  })

  it('includes .gitignore, .env, and migration (no tRPC routers)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('.gitignore')
    expect(paths).toContain('.env')
    expect(paths).toContain('supabase/migrations/0001_initial.sql')
    // No server-side files in PostgREST architecture
    expect(paths.some((p) => p.startsWith('server/'))).toBe(false)
  })

  it('.gitignore excludes node_modules, dist, and .env', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const gitignore = bp.fileTree.find((f) => f.path === '.gitignore')
    expect(gitignore).toBeDefined()
    expect(gitignore!.content).toContain('node_modules/')
    expect(gitignore!.content).toContain('dist/')
    expect(gitignore!.content).toContain('.env')
    expect(gitignore!.layer).toBe(0) // must be written before git add -A
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

    const supabaseFile = bp.fileTree.find((f) => f.path === 'src/lib/supabase.ts')
    expect(supabaseFile?.isLLMSlot).toBe(false)
  })

  it('assigns correct layers to files', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const supabaseFile = bp.fileTree.find((f) => f.path === 'src/lib/supabase.ts')
    expect(supabaseFile?.layer).toBe(1)

    const migrationFile = bp.fileTree.find((f) => f.path === 'supabase/migrations/0001_initial.sql')
    expect(migrationFile?.layer).toBe(2)

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

  it('generates .env with VITE_ prefixed Supabase credentials', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const envFile = bp.fileTree.find((f) => f.path === '.env')
    expect(envFile?.content).toContain('VITE_SUPABASE_URL=')
    expect(envFile?.content).toContain('VITE_SUPABASE_ANON_KEY=')
    // No DATABASE_URL in PostgREST architecture
    expect(envFile?.content).not.toContain('DATABASE_URL=')
  })

  it('does not emit AuthProvider import in main.tsx (C4 fix)', () => {
    // Contract has auth.users FK → features.auth=true, but AuthProvider should not be emitted
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, designPreferences })
    const mainFile = bp.fileTree.find((f) => f.path === 'src/main.tsx')
    expect(mainFile?.content).not.toContain('AuthProvider')
    expect(mainFile?.content).not.toContain("from '@/lib/auth'")
    // Still has the standard providers
    expect(mainFile?.content).toContain('QueryClientProvider')
    expect(mainFile?.content).toContain('RouterProvider')
  })
})
