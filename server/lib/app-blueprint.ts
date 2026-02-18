import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { inferFeatures, type SchemaContract, type DesignPreferences, type InferredFeatures } from './schema-contract'
import { contractToPages } from './contract-to-pages'
import { contractToSQL } from './contract-to-sql'
import { snakeToPascal, snakeToKebab, pluralize } from './naming-utils'

// ============================================================================
// UI Kit — shadcn/ui components read from snapshot/ui-kit/ at runtime
// ============================================================================

const UI_KIT_DIR = join(import.meta.dirname, '../../snapshot/ui-kit')

/** Read all shadcn/ui component files from snapshot/ui-kit/ */
function loadUIKit(): BlueprintFile[] {
  const files: BlueprintFile[] = []
  const entries = readdirSync(UI_KIT_DIR)
  for (const entry of entries) {
    const content = readFileSync(join(UI_KIT_DIR, entry), 'utf-8')
    // utils.ts → src/lib/utils.ts, everything else → src/components/ui/{name}
    const destPath = entry === 'utils.ts'
      ? 'src/lib/utils.ts'
      : `src/components/ui/${entry}`
    files.push({ path: destPath, content, layer: 1, isLLMSlot: false })
  }
  return files
}

export interface BlueprintFile {
  path: string
  content: string
  layer: number
  isLLMSlot: boolean
}

export interface AppBlueprint {
  meta: {
    appName: string
    appDescription: string
    designPreferences: DesignPreferences
  }
  features: InferredFeatures
  contract: SchemaContract
  fileTree: BlueprintFile[]
}

interface BlueprintInput {
  appName: string
  appDescription: string
  contract: SchemaContract
  designPreferences: DesignPreferences
}

// ============================================================================
// Color utilities — hex → oklch conversion for Tailwind v4 @theme
// ============================================================================

/**
 * Convert a 6-digit hex color to OKLCH components.
 * Returns {L, C, H} where L ∈ [0,1], C ∈ [0,~0.4], H ∈ [0,360).
 */
function hexToOklch(hex: string): { L: number; C: number; H: number } {
  const h = hex.replace('#', '')
  if (h.length !== 6) return { L: 0.48, C: 0.18, H: 240 }

  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255

  // Linearize (sRGB gamma decode)
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const lr = lin(r), lg = lin(g), lb = lin(b)

  // RGB → XYZ (D65)
  const X = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb
  const Y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb
  const Z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb

  // XYZ → Oklab (via LMS cone response)
  const lc = 0.8189330101 * X + 0.3618667424 * Y - 0.1288597137 * Z
  const mc = 0.0329845436 * X + 0.9293118715 * Y + 0.0361456387 * Z
  const sc = 0.0482003018 * X + 0.2643662691 * Y + 0.6338517070 * Z

  const l_ = Math.cbrt(lc), m_ = Math.cbrt(mc), s_ = Math.cbrt(sc)
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const bv = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_

  const C = Math.sqrt(a * a + bv * bv)
  const H = ((Math.atan2(bv, a) * 180 / Math.PI) + 360) % 360

  return { L, C, H }
}

/** Format oklch components to a CSS oklch() string */
function oklch(L: number, C: number, H: number): string {
  return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(2)})`
}

/**
 * Generate a full shadcn/ui color palette derived from a single primary hex color.
 * Returns CSS oklch() strings for all required tokens.
 */
function buildColorPalette(primaryHex: string) {
  const { L, C, H } = hexToOklch(primaryHex)

  // Primary: use the color as-is, clamp L to reasonable range for readability
  const primaryL = Math.min(0.72, Math.max(0.35, L))
  const primaryFgL = primaryL > 0.55 ? 0.12 : 0.98

  // Secondary: very light tint of primary hue
  const secondaryL = 0.965
  const secondaryC = Math.min(C * 0.12, 0.025)

  // Muted: very subtle hue-tinted neutral
  const mutedC = Math.min(C * 0.08, 0.015)

  // Accent: slightly more saturated than secondary
  const accentC = Math.min(C * 0.18, 0.035)

  // Border: very light with tiny hint of hue
  const borderC = Math.min(C * 0.06, 0.012)

  return {
    primary:            oklch(primaryL, Math.min(C, 0.28), H),
    primaryForeground:  oklch(primaryFgL, 0, 0),
    secondary:          oklch(secondaryL, secondaryC, H),
    secondaryFg:        oklch(0.21, 0, 0),
    muted:              oklch(0.965, mutedC, H),
    mutedFg:            oklch(0.50, Math.min(C * 0.12, 0.02), H),
    accent:             oklch(0.955, accentC, H),
    accentFg:           oklch(0.20, 0, 0),
    border:             oklch(0.918, borderC, H),
    input:              oklch(0.918, borderC, H),
    ring:               oklch(primaryL, Math.min(C * 0.65, 0.20), H),
    // Dark mode variants
    darkBg:             oklch(0.085, Math.min(C * 0.06, 0.012), H),
    darkFg:             oklch(0.96, 0, 0),
    darkCard:           oklch(0.115, Math.min(C * 0.06, 0.012), H),
    darkPrimary:        oklch(Math.min(primaryL + 0.10, 0.78), Math.min(C, 0.28), H),
    darkBorder:         oklch(0.22, Math.min(C * 0.08, 0.015), H),
    darkMuted:          oklch(0.18, Math.min(C * 0.08, 0.015), H),
    darkMutedFg:        oklch(0.58, Math.min(C * 0.10, 0.018), H),
  }
}

/** Generate Tailwind v4 CSS theme with shadcn/ui color tokens */
function generateIndexCSS(prefs: DesignPreferences): string {
  const pal = buildColorPalette(prefs.primaryColor)
  return `@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.140 0 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.140 0 0);
  --color-popover: oklch(1 0 0);
  --color-popover-foreground: oklch(0.140 0 0);
  --color-primary: ${pal.primary};
  --color-primary-foreground: ${pal.primaryForeground};
  --color-secondary: ${pal.secondary};
  --color-secondary-foreground: ${pal.secondaryFg};
  --color-muted: ${pal.muted};
  --color-muted-foreground: ${pal.mutedFg};
  --color-accent: ${pal.accent};
  --color-accent-foreground: ${pal.accentFg};
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-destructive-foreground: oklch(0.985 0 0);
  --color-border: ${pal.border};
  --color-input: ${pal.input};
  --color-ring: ${pal.ring};
  --radius: 0.5rem;
  --font-sans: '${prefs.fontFamily}', ui-sans-serif, system-ui, sans-serif;
}

/* Dark mode overrides */
.dark {
  --color-background: ${pal.darkBg};
  --color-foreground: ${pal.darkFg};
  --color-card: ${pal.darkCard};
  --color-card-foreground: ${pal.darkFg};
  --color-popover: ${pal.darkCard};
  --color-popover-foreground: ${pal.darkFg};
  --color-primary: ${pal.darkPrimary};
  --color-primary-foreground: oklch(0.10 0 0);
  --color-secondary: ${pal.darkMuted};
  --color-secondary-foreground: ${pal.darkFg};
  --color-muted: ${pal.darkMuted};
  --color-muted-foreground: ${pal.darkMutedFg};
  --color-accent: ${pal.darkMuted};
  --color-accent-foreground: ${pal.darkFg};
  --color-destructive: oklch(0.704 0.191 22.216);
  --color-border: ${pal.darkBorder};
  --color-input: ${pal.darkBorder};
  --color-ring: ${pal.ring};
}

/* Smooth transitions for all interactive elements */
* {
  @apply border-border;
}

body {
  @apply bg-background text-foreground antialiased;
  font-feature-settings: "cv11", "ss01";
  font-variation-settings: "opsz" 32;
}
`
}

/** Build a Google Fonts URL for a given font family name */
function googleFontsUrl(fontFamily: string): string {
  const encoded = fontFamily.trim().replace(/\s+/g, '+')
  return `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap`
}

/** Generate index.html for the Vite SPA with optional Google Fonts */
function generateIndexHTML(appName: string, prefs: DesignPreferences): string {
  // Always load font via Google Fonts (even Inter) for consistency
  const fontsUrl = googleFontsUrl(prefs.fontFamily)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="${appName}" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${fontsUrl}" rel="stylesheet">
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}

/** Generate main.tsx with providers and router */
function generateMainTSX(_features: InferredFeatures): string {
  // Auth is handled by Supabase RLS + session tokens (auto-attached by supabase-js).
  // No AuthProvider needed — the _authenticated route guard checks session in beforeLoad.
  return `// Auto-generated by VibeStack — do not edit manually
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const queryClient = new QueryClient()
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
`
}

/** Generate app-layout.tsx with branded nav and optional sign-out button */
function generateAppLayout(appName: string, features: InferredFeatures): string {
  const navLinks = features.entities.map((entity) => {
    const plural = pluralize(entity)
    const label = snakeToPascal(plural)
    const kebab = snakeToKebab(plural)
    return `  { to: '/${kebab}', label: '${label}' }`
  }).join(',\n')

  // Pick a brand initial for the logo mark
  const initial = appName.charAt(0).toUpperCase()

  const signOutImports = features.auth
    ? `import { useNavigate } from '@tanstack/react-router'\nimport { supabase } from '@/lib/supabase'\n`
    : ''

  const signOutHook = features.auth
    ? `\n  const navigate = useNavigate()
  async function signOut() {
    await supabase.auth.signOut()
    navigate({ to: '/auth/login' })
  }\n`
    : ''

  const signOutButton = features.auth
    ? `
          <button
            onClick={signOut}
            className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border hover:bg-muted hover:text-foreground transition-colors"
          >
            Sign out
          </button>`
    : ''

  return `// Auto-generated by VibeStack — do not edit manually
import { Link, Outlet } from '@tanstack/react-router'
${signOutImports}
const navLinks = [
${navLinks},
]

export function AppLayout() {${signOutHook}
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <nav className="container mx-auto flex items-center gap-1 px-4 py-3">
          {/* Brand mark */}
          <Link to="/" className="mr-6 flex items-center gap-2.5 shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm">
              ${initial}
            </span>
            <span className="text-sm font-semibold tracking-tight">${appName}</span>
          </Link>

          {/* Nav links */}
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{ className: 'rounded-md px-3 py-1.5 text-sm bg-muted text-foreground font-medium' }}
            >
              {link.label}
            </Link>
          ))}
          ${signOutButton}
        </nav>
        {/* Accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </header>

      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
`
}

/** Generate auth login/signup page — split-screen branded design */
function generateAuthLoginPage(appName: string): string {
  const initial = appName.charAt(0).toUpperCase()
  return `// Auto-generated by VibeStack
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/auth/login')({
  component: AuthLoginPage,
})

function AuthLoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email to confirm your account, then sign in.')
        setMode('signin')
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else if (data.session) {
        navigate({ to: '/' })
      }
    }

    setLoading(false)
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: brand panel */}
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-foreground/15 text-base font-bold">
            ${initial}
          </span>
          <span className="text-lg font-semibold">${appName}</span>
        </div>
        <div className="space-y-3">
          <p className="text-3xl font-bold leading-tight tracking-tight">
            Welcome back
          </p>
          <p className="text-primary-foreground/70 text-sm leading-relaxed max-w-xs">
            Sign in to your account to continue where you left off.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/40">© {new Date().getFullYear()} ${appName}</p>
      </div>

      {/* Right: form panel */}
      <div className="flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              ${initial}
            </span>
            <span className="font-semibold">${appName}</span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === 'signin'
                ? 'Enter your credentials to access your account'
                : 'Fill in the details below to get started'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Email address</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                className="h-10"
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-md border border-green-500/30 bg-green-50 px-3 py-2.5 text-sm text-green-700">
                {message}
              </div>
            )}

            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Please wait…
                </span>
              ) : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setMessage(null) }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
`
}

/** Generate auth callback page — handles Supabase email confirmation links */
function generateAuthCallbackPage(): string {
  return `// Auto-generated by VibeStack — handles Supabase email confirmation redirects
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? '/' : '/auth/login' })
    })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Verifying…</p>
    </div>
  )
}
`
}

/** Generate .env with placeholder credentials (replaced by infra provisioning) */
function generateDotEnv(): string {
  return `# Auto-generated — values injected by VibeStack infra provisioning
VITE_SUPABASE_URL=__PLACEHOLDER__
VITE_SUPABASE_ANON_KEY=__PLACEHOLDER__
`
}

/** Generate root route for TanStack Router */
function generateRootRoute(): string {
  return `// Auto-generated by VibeStack
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => <Outlet />,
})
`
}

/** Generate index route that redirects to the first entity's list page */
function generateIndexRoute(firstEntityKebab: string): string {
  return `// Auto-generated by VibeStack — redirects to first entity page
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/${firstEntityKebab}' })
  },
})
`
}

/** Generate routeTree.gen.ts — deterministic route tree from contract entities.
 *
 * TanStack Router v1.160+ requires `.update()` on each route to set id/path/getParentRoute.
 * Without this, createFileRoute() routes have no path info and all resolve to __root__,
 * causing "Duplicate routes found with id: __root__" at runtime.
 */
function generateRouteTree(contract: SchemaContract, features: InferredFeatures): string {
  const lines: string[] = [
    '/* eslint-disable */',
    '// @ts-nocheck',
    '// This file is auto-generated by VibeStack — do not edit manually',
    '',
    "import { Route as rootRoute } from './routes/__root'",
    "import { Route as IndexImport } from './routes/index'",
    "import { Route as AuthenticatedImport } from './routes/_authenticated/route'",
  ]

  if (features.auth) {
    lines.push("import { Route as AuthLoginImport } from './routes/auth/login'")
    lines.push("import { Route as AuthCallbackImport } from './routes/auth/callback'")
  }

  // Import each entity's routes
  for (const entity of features.entities) {
    const plural = pluralize(entity)
    const kebab = snakeToKebab(plural)
    const pascal = snakeToPascal(plural)

    lines.push(`import { Route as ${pascal}ListImport } from './routes/_authenticated/${kebab}'`)
    lines.push(`import { Route as ${pascal}DetailImport } from './routes/_authenticated/${kebab}.$id'`)
  }

  // Update routes with path/id/getParentRoute (required by TanStack Router v1.160+)
  lines.push('')
  lines.push("const IndexRoute = IndexImport.update({ id: '/', path: '/', getParentRoute: () => rootRoute } as any)")
  lines.push("const AuthenticatedRoute = AuthenticatedImport.update({ id: '/_authenticated', getParentRoute: () => rootRoute } as any)")

  if (features.auth) {
    lines.push("const AuthLoginRoute = AuthLoginImport.update({ path: '/auth/login', getParentRoute: () => rootRoute } as any)")
    lines.push("const AuthCallbackRoute = AuthCallbackImport.update({ path: '/auth/callback', getParentRoute: () => rootRoute } as any)")
  }

  lines.push('')

  const childRoutes: string[] = []
  for (const entity of features.entities) {
    const plural = pluralize(entity)
    const kebab = snakeToKebab(plural)
    const pascal = snakeToPascal(plural)

    lines.push(`const ${pascal}ListRoute = ${pascal}ListImport.update({ path: '/${kebab}', getParentRoute: () => AuthenticatedRoute } as any)`)
    lines.push(`const ${pascal}DetailRoute = ${pascal}DetailImport.update({ path: '/${kebab}/$id', getParentRoute: () => AuthenticatedRoute } as any)`)

    childRoutes.push(`    ${pascal}ListRoute,`)
    childRoutes.push(`    ${pascal}DetailRoute,`)
  }

  const authRouteEntries = features.auth ? ['  AuthLoginRoute,', '  AuthCallbackRoute,'] : []

  lines.push('')
  lines.push('export const routeTree = rootRoute.addChildren([')
  lines.push('  IndexRoute,')
  lines.push(...authRouteEntries)
  lines.push('  AuthenticatedRoute.addChildren([')
  lines.push(...childRoutes)
  lines.push('  ]),')
  lines.push('])')
  lines.push('')

  return lines.join('\n')
}

/** Generate Supabase client singleton for the generated app */
function generateSupabaseClient(): string {
  return `// Auto-generated by VibeStack
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
`
}

/** Generate Vite config — no TanStack Router plugin (we generate routeTree.gen.ts deterministically) */
function generateViteConfig(): string {
  return `import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    cors: true,
  },
})
`
}

/**
 * Generate a complete AppBlueprint from SchemaContract + design preferences.
 * The blueprint contains every file the generated app needs, organized by dependency layer.
 */
export function contractToBlueprint(input: BlueprintInput): AppBlueprint {
  const features = inferFeatures(input.contract)
  const fileTree: BlueprintFile[] = []

  // Layer 0: Build config + Vite config + Vercel SPA rewrite (overwrite snapshot defaults)
  fileTree.push({
    path: '.gitignore',
    content: `# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
dist-ssr/
*.local

# Environment files — use Vercel env vars for secrets
.env
.env.local
.env.*.local

# Vite caches
.vite/

# Editor / OS
.DS_Store
Thumbs.db
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`,
    layer: 0,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'vite.config.ts',
    content: generateViteConfig(),
    layer: 0,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'vercel.json',
    content: `{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
`,
    layer: 0,
    isLLMSlot: false,
  })

  // Layer 1: Supabase client + CSS + HTML (all independent)
  fileTree.push({
    path: 'src/lib/supabase.ts',
    content: generateSupabaseClient(),
    layer: 1,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'src/index.css',
    content: generateIndexCSS(input.designPreferences),
    layer: 1,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'index.html',
    content: generateIndexHTML(input.appName, input.designPreferences),
    layer: 1,
    isLLMSlot: false,
  })

  // Layer 1 (continued): shadcn/ui components — CRUD pages import from @/components/ui/*
  fileTree.push(...loadUIKit())

  // Layer 2: .env + SQL migration (depend on schema)
  fileTree.push({
    path: '.env',
    content: generateDotEnv(),
    layer: 2,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'supabase/migrations/0001_initial.sql',
    content: contractToSQL(input.contract),
    layer: 2,
    isLLMSlot: false,
  })

  // Layer 0 (continued): Override warmup scaffold App.tsx to prevent duplicate createRootRoute()
  // The snapshot's App.tsx creates its own root route for Vite dep pre-bundling.
  // We replace it with an empty re-export to avoid "Duplicate routes with id: __root__" errors.
  fileTree.push({
    path: 'src/App.tsx',
    content: '// Replaced by VibeStack — see main.tsx\nexport default function App() { return null }\n',
    layer: 0,
    isLLMSlot: false,
  })

  // Layer 3: Root route + Index redirect + Auth guard route — deterministic
  fileTree.push({
    path: 'src/routes/__root.tsx',
    content: generateRootRoute(),
    layer: 3,
    isLLMSlot: false,
  })
  // Index route redirects to first entity list page
  const firstEntityKebab = snakeToKebab(pluralize(features.entities[0]))
  fileTree.push({
    path: 'src/routes/index.tsx',
    content: generateIndexRoute(firstEntityKebab),
    layer: 3,
    isLLMSlot: false,
  })
  // _authenticated/route.tsx is ALWAYS needed — all entity routes are nested under it.
  // When auth is enabled: real session check + redirect to /auth/login.
  // When auth is disabled: passthrough layout wrapper only.
  const authenticatedRouteContent = features.auth
    ? `// Auto-generated by VibeStack
import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppLayout } from '@/components/app-layout'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      throw redirect({ to: '/auth/login' })
    }
  },
  component: AppLayout,
})
`
    : `// Auto-generated by VibeStack
import { createFileRoute } from '@tanstack/react-router'
import { AppLayout } from '@/components/app-layout'

export const Route = createFileRoute('/_authenticated')({
  component: AppLayout,
})
`
  fileTree.push({
    path: 'src/routes/_authenticated/route.tsx',
    content: authenticatedRouteContent,
    layer: 3,
    isLLMSlot: false,
  })

  // Auth pages — only when schema has auth.users FK references
  if (features.auth) {
    fileTree.push({
      path: 'src/routes/auth/login.tsx',
      content: generateAuthLoginPage(input.appName),
      layer: 3,
      isLLMSlot: false,
    })
    fileTree.push({
      path: 'src/routes/auth/callback.tsx',
      content: generateAuthCallbackPage(),
      layer: 3,
      isLLMSlot: false,
    })
  }

  // Layer 4: Page skeletons (LLM fills JSX bodies)
  const pages = contractToPages(input.contract)
  for (const page of pages) {
    fileTree.push({
      path: `src/routes/_authenticated/${page.fileName}`,
      content: page.content,
      layer: 4,
      isLLMSlot: true,
    })
  }

  // Layer 5: Route tree + wiring files (depend on routes being defined)
  fileTree.push({
    path: 'src/routeTree.gen.ts',
    content: generateRouteTree(input.contract, features),
    layer: 5,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'src/main.tsx',
    content: generateMainTSX(features),
    layer: 5,
    isLLMSlot: false,
  })
  fileTree.push({
    path: 'src/components/app-layout.tsx',
    content: generateAppLayout(input.appName, features),
    layer: 5,
    isLLMSlot: false,
  })

  return {
    meta: {
      appName: input.appName,
      appDescription: input.appDescription,
      designPreferences: input.designPreferences,
    },
    features,
    contract: input.contract,
    fileTree,
  }
}
