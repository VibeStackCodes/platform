import { contractToBlueprint } from '@server/lib/app-blueprint'
import type { SchemaContract } from '@server/lib/schema-contract'
import type { AssemblyResult } from '@server/lib/capabilities/assembler'
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

  it('produces a blueprint with meta, features, and fileTree', () => {
    const bp = contractToBlueprint({
      appName: 'MarkNest',
      appDescription: 'A bookmark manager',
      contract,
    })

    expect(bp.meta.appName).toBe('MarkNest')
    expect(bp.features.auth).toBe(true)
    expect(bp.features.entities).toContain('bookmark')
    expect(bp.features.entities).toContain('tag')
  })

  it('includes all layer 1 files (supabase client, index.css, index.html)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/lib/supabase.ts')
    expect(paths).toContain('src/index.css')
    expect(paths).toContain('index.html')
  })

  it('includes .gitignore, .env, and migration (no tRPC routers)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('.gitignore')
    expect(paths).toContain('.env')
    expect(paths).toContain('supabase/migrations/0001_initial.sql')
    // No server-side files in PostgREST architecture
    expect(paths.some((p) => p.startsWith('server/'))).toBe(false)
  })

  it('.gitignore excludes node_modules, dist, and .env', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const gitignore = bp.fileTree.find((f) => f.path === '.gitignore')
    expect(gitignore).toBeDefined()
    expect(gitignore!.content).toContain('node_modules/')
    expect(gitignore!.content).toContain('dist/')
    expect(gitignore!.content).toContain('.env')
    expect(gitignore!.layer).toBe(0) // must be written before git add -A
  })

  it('includes all layer 4 page skeletons', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/routes/_authenticated/bookmarks.tsx')
    expect(paths).toContain('src/routes/_authenticated/bookmarks.$id.tsx')
    expect(paths).toContain('src/routes/_authenticated/tags.tsx')
  })

  it('includes layer 5 wiring files (main.tsx, app-layout)', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const paths = bp.fileTree.map((f) => f.path)
    expect(paths).toContain('src/main.tsx')
    expect(paths).toContain('src/components/app-layout.tsx')
  })

  it('marks LLM-filled files with isLLMSlot=true', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const pageFile = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/bookmarks.tsx')
    expect(pageFile?.isLLMSlot).toBe(true)

    const supabaseFile = bp.fileTree.find((f) => f.path === 'src/lib/supabase.ts')
    expect(supabaseFile?.isLLMSlot).toBe(false)
  })

  it('assigns correct layers to files', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const supabaseFile = bp.fileTree.find((f) => f.path === 'src/lib/supabase.ts')
    expect(supabaseFile?.layer).toBe(1)

    const migrationFile = bp.fileTree.find((f) => f.path === 'supabase/migrations/0001_initial.sql')
    expect(migrationFile?.layer).toBe(2)

    const pageFile = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/bookmarks.tsx')
    expect(pageFile?.layer).toBe(4)

    const mainFile = bp.fileTree.find((f) => f.path === 'src/main.tsx')
    expect(mainFile?.layer).toBe(5)
  })

  it('generates index.css with theme variables', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const cssFile = bp.fileTree.find((f) => f.path === 'src/index.css')
    expect(cssFile?.content).toContain('@import "tailwindcss"')
    expect(cssFile?.content).toContain('@theme')
    expect(cssFile?.content).toContain('--color-primary')
  })

  it('generates .env with VITE_ prefixed Supabase credentials', () => {
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const envFile = bp.fileTree.find((f) => f.path === '.env')
    expect(envFile?.content).toContain('VITE_SUPABASE_URL=')
    expect(envFile?.content).toContain('VITE_SUPABASE_ANON_KEY=')
    // No DATABASE_URL in PostgREST architecture
    expect(envFile?.content).not.toContain('DATABASE_URL=')
  })

  it('uses AssemblyResult pages for routeTree when provided', () => {
    const assembly: AssemblyResult = {
      contract,
      pages: [
        { path: '/', type: 'static', template: 'landing' },
        { path: '/about', type: 'static', template: 'about' },
        { path: '/contact', type: 'static', template: 'contact' },
        { path: '/blog', type: 'public-list', entity: 'tag' },
      ],
      components: [],
      navEntries: [{ label: 'Blog', path: '/blog', position: 'main', order: 1 }],
      npmDependencies: {},
      designHints: {},
      capabilityManifest: ['public-website', 'blog'],
      hasAuth: false,
    }

    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract, assembly })
    const tree = bp.fileTree.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(tree?.content).toContain("path: '/blog'")
    expect(tree?.content).not.toContain("path: '/tags/'")
  })

  it('does not emit AuthProvider import in main.tsx (C4 fix)', () => {
    // Contract has auth.users FK → features.auth=true, but AuthProvider should not be emitted
    const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
    const mainFile = bp.fileTree.find((f) => f.path === 'src/main.tsx')
    expect(mainFile?.content).not.toContain('AuthProvider')
    expect(mainFile?.content).not.toContain("from '@/lib/auth'")
    // Still has the standard providers
    expect(mainFile?.content).toContain('QueryClientProvider')
    expect(mainFile?.content).toContain('RouterProvider')
  })

  describe('auth system (features.auth = true)', () => {
    // contract already has auth.users FK → features.auth = true

    it('includes themed auth routes', () => {
      const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
      const paths = bp.fileTree.map((f) => f.path)
      expect(paths).toContain('src/routes/auth/login.tsx')
      expect(paths).toContain('src/routes/_authenticated/route.tsx')
      expect(paths).toContain('src/routes/_authenticated/dashboard.tsx')
    })

    it('login page has themed sign-in flow with supabase auth', () => {
      const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
      const login = bp.fileTree.find((f) => f.path === 'src/routes/auth/login.tsx')
      expect(login?.content).toContain("createFileRoute('/auth/login')")
      expect(login?.content).toContain('supabase.auth.signInWithPassword')
      expect(login?.content).toContain("navigate({ to: '/_authenticated/dashboard' })")
    })

    it('_authenticated/route.tsx redirects to /auth/login when no session', () => {
      const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
      const route = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/route.tsx')
      expect(route?.content).toContain('supabase.auth.getSession')
      expect(route?.content).toContain("redirect({ to: '/auth/login' })")
    })

    it('app-layout is a pass-through outlet', () => {
      const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
      const layout = bp.fileTree.find((f) => f.path === 'src/components/app-layout.tsx')
      expect(layout?.content).toContain('return <Outlet />')
      expect(layout?.content).not.toContain('supabase.auth.signOut')
    })

    it('routeTree.gen.ts includes auth routes', () => {
      const bp = contractToBlueprint({ appName: 'Test', appDescription: '', contract })
      const tree = bp.fileTree.find((f) => f.path === 'src/routeTree.gen.ts')
      expect(tree?.content).toContain("from './routes/auth/login'")
      expect(tree?.content).toContain("path: '/auth/login'")
      expect(tree?.content).toContain('AuthLoginRoute,')
    })
  })

  describe('no-auth schema (features.auth = false)', () => {
    const noAuthContract: SchemaContract = {
      tables: [{
        name: 'product',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'text', nullable: false },
        ],
      }],
    }

    it('keeps themed auth routes under default hybrid posture', () => {
      const bp = contractToBlueprint({ appName: 'Shop', appDescription: '', contract: noAuthContract })
      const paths = bp.fileTree.map((f) => f.path)
      expect(paths).toContain('src/routes/auth/login.tsx')
      expect(paths).toContain('src/routes/_authenticated/route.tsx')
    })

    it('_authenticated/route.tsx keeps auth guard under hybrid posture', () => {
      const bp = contractToBlueprint({ appName: 'Shop', appDescription: '', contract: noAuthContract })
      const route = bp.fileTree.find((f) => f.path === 'src/routes/_authenticated/route.tsx')
      expect(route?.content).toContain('getSession')
      expect(route?.content).toContain('redirect')
    })

    it('app-layout has no sign out button when no auth', () => {
      const bp = contractToBlueprint({ appName: 'Shop', appDescription: '', contract: noAuthContract })
      const layout = bp.fileTree.find((f) => f.path === 'src/components/app-layout.tsx')
      expect(layout?.content).not.toContain('signOut')
    })
  })
})
