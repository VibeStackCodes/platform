# Vite Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate VibeStack platform from Next.js 16 to Vite + React + Hono + TanStack Router + Drizzle + Biome + Sentry.

**Architecture:** SPA client (Vite + TanStack Router) + API server (Hono) deployed to Vercel. Drizzle ORM replaces raw Supabase queries. Biome replaces ESLint. Sentry instruments both client and server + AI agent spans.

**Tech Stack:** Vite 6, React 19, TanStack Router, Hono, Drizzle ORM, Biome, Sentry, Tailwind v4 (@tailwindcss/vite), Vercel deployment.

**Design Doc:** `docs/plans/2026-02-15-vite-migration-design.md`

**Strategy:** Build new structure in a feature branch. Work phase-by-phase with typecheck + test verification at each phase boundary. Delete old Next.js files only after the new stack is proven working.

---

## Phase 1: Foundation (Configs + Dependencies)

### Task 1: Create feature branch and install new dependencies

**Files:**
- Modify: `package.json`

**Step 1: Create feature branch**

```bash
git checkout -b feature/vite-migration
```

**Step 2: Install new dependencies**

```bash
pnpm add vite @vitejs/plugin-react @tailwindcss/vite \
  @tanstack/react-router @tanstack/router-plugin @tanstack/router-devtools @tanstack/zod-adapter \
  hono @hono/node-server @hono/vercel @hono/sentry \
  @sentry/react @sentry/node \
  drizzle-orm pg concurrently

pnpm add -D @biomejs/biome drizzle-kit @types/pg tw-animate-css
```

**Step 3: Remove old dependencies**

```bash
pnpm remove next eslint eslint-config-next @tailwindcss/postcss @supabase/ssr next-themes
```

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: swap Next.js deps for Vite + Hono + TanStack Router + Drizzle + Biome + Sentry"
```

---

### Task 2: Create Vite config

**Files:**
- Create: `vite.config.ts` (new, replaces `next.config.ts`)
- Create: `index.html` (Vite entry point)

**Step 1: Write vite.config.ts**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    // ORDER MATTERS: TanStack Router MUST come before react()
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist/client',
  },
})
```

**Step 2: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeStack</title>
    <meta name="description" content="AI-powered app builder" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 3: Commit**

```bash
git add vite.config.ts index.html
git commit -m "chore: add Vite config and HTML entry point"
```

---

### Task 3: Create Biome config and remove ESLint/OxLint configs

**Files:**
- Create: `biome.json`
- Delete: `oxlint.json`
- Modify: `package.json` (scripts)

**Step 1: Write biome.json**

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignore": ["node_modules", "dist", ".mastra", "coverage", "*.gen.ts", "app/", "drizzle/"]
  },
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "a11y": { "recommended": true },
      "correctness": {
        "recommended": true,
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "warn"
      },
      "security": { "recommended": true, "noDangerouslySetInnerHtml": "error" },
      "style": { "useConst": "error", "useImportType": "error", "useExportType": "error" },
      "suspicious": { "noExplicitAny": "warn", "noArrayIndexKey": "error" }
    }
  },
  "overrides": [
    {
      "include": ["**/*.test.ts", "**/*.spec.ts"],
      "linter": { "rules": { "suspicious": { "noExplicitAny": "off" } } }
    }
  ]
}
```

**Step 2: Delete oxlint.json**

```bash
rm oxlint.json
```

**Step 3: Update package.json scripts**

Replace `"lint": "eslint"` with:
```json
{
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write ."
}
```

**Step 4: Run Biome to verify config works**

```bash
npx @biomejs/biome check --diagnostic-level=error src/ server/ 2>&1 | head -20
```

Expected: May show warnings but no config errors.

**Step 5: Commit**

```bash
git add biome.json package.json && git rm oxlint.json
git commit -m "chore: replace ESLint + OxLint with Biome"
```

---

### Task 4: Create tsconfig files for client and server

**Files:**
- Modify: `tsconfig.json` (client-focused)
- Create: `tsconfig.server.json` (server build)

**Step 1: Update tsconfig.json for Vite SPA**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 2: Create tsconfig.server.json**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./server/*"] }
  },
  "include": ["server"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Commit**

```bash
git add tsconfig.json tsconfig.server.json
git commit -m "chore: split tsconfig into client (Vite) and server (Hono)"
```

---

### Task 5: Create Vercel deployment config

**Files:**
- Create: `vercel.json`
- Delete: `next.config.ts`

**Step 1: Write vercel.json**

```jsonc
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist/client",
  "functions": {
    "server/index.ts": { "maxDuration": 300 }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/server/index.ts" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Step 2: Delete next.config.ts**

```bash
rm next.config.ts
```

**Step 3: Commit**

```bash
git add vercel.json && git rm next.config.ts
git commit -m "chore: replace next.config.ts with vercel.json"
```

---

## Phase 2: Drizzle ORM

### Task 6: Create Drizzle schema from existing SQL migrations

**Files:**
- Create: `server/lib/db/schema.ts`
- Create: `server/lib/db/relations.ts`
- Create: `server/lib/db/client.ts`

**Step 1: Create directory structure**

```bash
mkdir -p server/lib/db
```

**Step 2: Write schema.ts**

Transcribe all tables from `supabase/migrations/001_init.sql` and `002_credits.sql` into Drizzle schema. Use exact column names from SQL. See design doc Section 4 for complete code.

Reference: `supabase/migrations/001_init.sql` (lines 21-213), `supabase/migrations/002_credits.sql` (lines 1-71)

**Step 3: Write relations.ts**

Define all foreign key relations for `db.query.*` API. See design doc Section 4.

**Step 4: Write client.ts**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import * as relations from './relations'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema: { ...schema, ...relations } })
```

**Step 5: Commit**

```bash
git add server/lib/db/
git commit -m "feat: add Drizzle ORM schema matching existing Supabase tables"
```

---

### Task 7: Create Drizzle Kit config and verify schema matches DB

**Files:**
- Create: `drizzle.config.ts`

**Step 1: Write drizzle.config.ts**

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './server/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

**Step 2: Introspect existing DB to verify schema matches**

```bash
npx drizzle-kit introspect
```

Expected: Generated schema in `drizzle/` should match `server/lib/db/schema.ts` columns. Diff and fix any mismatches.

**Step 3: Commit**

```bash
git add drizzle.config.ts
git commit -m "chore: add Drizzle Kit config for migration tooling"
```

---

### Task 8: Write type-safe query functions

**Files:**
- Create: `server/lib/db/queries.ts`

**Step 1: Write queries for all existing `supabase.from()` patterns**

Audit every `supabase.from()` call in the codebase and write a Drizzle equivalent:

| Current Pattern (file) | Drizzle Query Function |
|------------------------|----------------------|
| `supabase.from('projects').select('*').eq('user_id', userId)` (dashboard) | `getUserProjects(userId)` |
| `supabase.from('projects').select('*').eq('id', id).eq('user_id', userId).single()` (project route) | `getProject(id, userId)` |
| `supabase.from('profiles').select('credits_*').eq('id', userId).single()` (credits) | `getUserCredits(userId)` |
| `supabase.from('profiles').select('stripe_customer_id').eq('id', userId).single()` (stripe) | `getStripeCustomerId(userId)` |
| `supabase.from('chat_messages').select('*').eq('project_id', id)` (project page) | `getProjectMessages(projectId)` |
| `supabase.from('profiles').update({ plan }).eq('stripe_customer_id', customerId)` (webhook) | `updatePlanByStripeId(customerId, plan)` |
| `supabase.from('profiles').update({ stripe_customer_id }).eq('id', userId)` (checkout) | `setStripeCustomerId(userId, stripeId)` |

See design doc Section 4 for query implementation code.

**Step 2: Write test for queries**

Create: `tests/db-queries.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest'
// Test that query functions return correct Drizzle SQL structure
// (mock the db, verify .where() and .from() are called correctly)
```

**Step 3: Run test**

```bash
pnpm test tests/db-queries.test.ts
```

**Step 4: Commit**

```bash
git add server/lib/db/queries.ts tests/db-queries.test.ts
git commit -m "feat: add type-safe Drizzle query functions for all DB operations"
```

---

## Phase 3: Hono API Server

### Task 9: Create Hono server entry point

**Files:**
- Create: `server/index.ts`
- Create: `server/middleware/auth.ts`

**Step 1: Write server/index.ts**

See design doc Section 3 for complete Hono app with route mounting. Key: `handle()` from `@hono/vercel` for production, `app` export for dev.

**Step 2: Write auth middleware**

Port `lib/supabase-server.ts` (89 lines) to Hono middleware. Replace `cookies()` from `next/headers` with Hono's `getCookie()`:

```typescript
import { createMiddleware } from 'hono/factory'
import { createClient } from '@supabase/supabase-js'

export const authMiddleware = createMiddleware(async (c, next) => {
  // Extract access_token and refresh_token from cookies
  // Create Supabase client, call getUser()
  // Set c.set('user', user) or return 401
  await next()
})
```

Reference: `lib/supabase-server.ts` (89 lines), `middleware.ts` (76 lines)

**Step 3: Commit**

```bash
git add server/index.ts server/middleware/auth.ts
git commit -m "feat: add Hono server entry point with auth middleware"
```

---

### Task 10: Port /api/projects routes to Hono

**Files:**
- Create: `server/routes/projects.ts`
- Create: `server/routes/sandbox-urls.ts`

**Step 1: Port GET /api/projects/:id**

Convert `app/api/projects/[id]/route.ts` (36 lines). Replace:
- `NextRequest/NextResponse` -> Hono `c.json()`
- `supabase.from('projects')` -> `db.select().from(projects)`
- `params.id` -> `c.req.param('id')`

**Step 2: Port GET /api/projects/:id/sandbox-urls**

Convert `app/api/projects/[id]/sandbox-urls/route.ts` (48 lines). Same pattern.

**Step 3: Commit**

```bash
git add server/routes/projects.ts server/routes/sandbox-urls.ts
git commit -m "feat: port project routes to Hono + Drizzle"
```

---

### Task 11: Port /api/projects/deploy to Hono

**Files:**
- Create: `server/routes/projects-deploy.ts`

**Step 1: Port POST /api/projects/deploy**

Convert `app/api/projects/deploy/route.ts` (528 lines). This is the largest route. Replace:
- `NextRequest/NextResponse` -> Hono `c.req.json()` / `c.json()`
- Move `@/lib/sandbox`, `@/lib/slug` imports to server paths

This route mostly calls Daytona SDK and Vercel API — neither depends on Next.js.

**Step 2: Commit**

```bash
git add server/routes/projects-deploy.ts
git commit -m "feat: port deploy route to Hono (528 lines)"
```

---

### Task 12: Port /api/agent SSE route to Hono

**Files:**
- Create: `server/routes/agent.ts`
- Create: `server/lib/sse.ts`

**Step 1: Port SSE helper**

Convert `lib/sse.ts` (56 lines) to use Hono's `streamSSE()`:

```typescript
import { streamSSE } from 'hono/streaming'
// Replace createSSEStream() with Hono's native streaming
```

**Step 2: Port POST /api/agent**

Convert `app/api/agent/route.ts` (268 lines). Replace:
- SSE response with `streamSSE(c, async (stream) => { ... })`
- `NextResponse` error responses with `c.json({ error }, status)`
- Credit checking to use Drizzle queries

Reference: `app/api/agent/route.ts` (268 lines), `lib/sse.ts` (56 lines)

**Step 3: Commit**

```bash
git add server/routes/agent.ts server/lib/sse.ts
git commit -m "feat: port agent SSE route to Hono streamSSE"
```

---

### Task 13: Port Stripe routes to Hono

**Files:**
- Create: `server/routes/stripe-checkout.ts`
- Create: `server/routes/stripe-webhook.ts`

**Step 1: Port POST /api/stripe/checkout**

Convert `app/api/stripe/checkout/route.ts` (107 lines). Replace `supabase.from('profiles')` with Drizzle queries.

**Step 2: Port POST /api/stripe/webhook**

Convert `app/api/stripe/webhook/route.ts` (189 lines). Key: webhook signature verification uses `c.req.raw` for raw body access in Hono.

**Step 3: Commit**

```bash
git add server/routes/stripe-checkout.ts server/routes/stripe-webhook.ts
git commit -m "feat: port Stripe routes to Hono + Drizzle"
```

---

### Task 14: Port supabase-proxy and auth callback to Hono

**Files:**
- Create: `server/routes/supabase-proxy.ts`
- Create: `server/routes/auth-callback.ts`

**Step 1: Port supabase-proxy**

Convert `app/api/supabase-proxy/[...path]/route.ts` (80 lines). Hono catch-all: `app.all('/*', handler)`.

**Step 2: Port auth callback**

Convert `app/auth/callback/route.ts` (33 lines). OAuth code exchange.

**Step 3: Commit**

```bash
git add server/routes/supabase-proxy.ts server/routes/auth-callback.ts
git commit -m "feat: port supabase-proxy and auth callback to Hono"
```

---

### Task 15: Move server-side lib files

**Files:**
- Move: `lib/agents/*` -> `server/lib/agents/*`
- Move: `lib/credits.ts` -> `server/lib/credits.ts`
- Move: `lib/sandbox.ts` -> `server/lib/sandbox.ts`
- Move: `lib/github.ts` -> `server/lib/github.ts`
- Move: `lib/supabase-mgmt.ts` -> `server/lib/supabase-mgmt.ts`
- Move: `lib/schema-contract.ts` -> `server/lib/schema-contract.ts`
- Move: `lib/contract-to-*.ts` -> `server/lib/contract-to-*.ts`
- Move: `lib/local-supabase.ts` -> `server/lib/local-supabase.ts`
- Move: `lib/slug.ts` -> `server/lib/slug.ts`
- Move: `lib/lsp.ts` -> `server/lib/lsp.ts`
- Move: `lib/pipeline-dag.ts` -> `server/lib/pipeline-dag.ts`
- Move: `lib/shadcn-manifest.ts` -> `server/lib/shadcn-manifest.ts`
- Move: `lib/layer-diagnostics.ts` -> `server/lib/layer-diagnostics.ts`
- Move: `lib/platform-kit/*` -> `server/lib/platform-kit/*`

**Step 1: Create directory structure and move files**

```bash
mkdir -p server/lib/agents server/lib/platform-kit/pg-meta
# git mv each file (preserves git history)
git mv lib/agents/* server/lib/agents/
git mv lib/credits.ts server/lib/credits.ts
git mv lib/sandbox.ts server/lib/sandbox.ts
# ... (all files listed above)
```

**Step 2: Update imports in moved files**

Replace `@/lib/` imports with relative imports or `@/` pointing to `server/`.

**Step 3: Update credits.ts to use Drizzle**

Replace `supabase.from('profiles')` calls with Drizzle query functions from `server/lib/db/queries.ts`.

**Step 4: Commit**

```bash
git add server/lib/
git commit -m "refactor: move server-side lib files to server/lib/"
```

---

### Task 16: Verify server builds

**Step 1: Typecheck server**

```bash
npx tsc -p tsconfig.server.json --noEmit
```

Expected: 0 errors. Fix any import path issues.

**Step 2: Commit fixes if any**

```bash
git add -A && git commit -m "fix: resolve server typecheck errors"
```

---

## Phase 4: Client SPA (Vite + TanStack Router)

### Task 17: Create client entry point and app shell

**Files:**
- Create: `src/main.tsx`
- Create: `src/index.css`
- Create: `src/lib/utils.ts` (copy from `lib/utils.ts`)
- Create: `src/lib/supabase-browser.ts` (copy from `lib/supabase-browser.ts`)

**Step 1: Write src/main.tsx**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import './index.css'
import './sentry.client'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { auth: undefined!, queryClient },
  defaultErrorComponent: ({ error }) => <div>Error: {error?.message}</div>,
})

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

function App() {
  // TODO: wire up Supabase auth context in Task 19
  const auth = { isAuthenticated: false, user: null }
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ auth, queryClient }} />
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
```

**Step 2: Write src/index.css**

Copy from design doc Section 7 (Tailwind v4 4-step pattern). Copy existing color variables from `app/globals.css`.

**Step 3: Copy client-side lib files**

```bash
mkdir -p src/lib
cp lib/utils.ts src/lib/utils.ts
cp lib/supabase-browser.ts src/lib/supabase-browser.ts
```

Update `supabase-browser.ts` to use `import.meta.env.VITE_SUPABASE_URL` instead of `process.env.NEXT_PUBLIC_SUPABASE_URL`.

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: create Vite SPA entry point with TanStack Router shell"
```

---

### Task 18: Create TanStack Router routes

**Files:**
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/routes/(authenticated)/route.tsx`
- Create: `src/routes/(authenticated)/dashboard.tsx`
- Create: `src/routes/(authenticated)/project.$id.tsx`
- Create: `src/routes/auth/login.tsx`

**Step 1: Write __root.tsx**

Port from `app/layout.tsx` (35 lines). Replace `{children}` with `<Outlet />`. Remove `next/font/google` — use CSS `@font-face` or Google Fonts CDN link in `index.html`.

```typescript
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import type { QueryClient } from '@tanstack/react-query'

interface RouterContext {
  auth: { isAuthenticated: boolean; user: any }
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  ),
})
```

**Step 2: Write (authenticated)/route.tsx**

Auth guard using `beforeLoad`. See design doc Section 2.

**Step 3: Write index.tsx (landing page)**

Port from `app/page.tsx` (69 lines). Remove server component patterns. Pure client component.

**Step 4: Write dashboard.tsx**

Port from `app/dashboard/page.tsx` (123 lines). Replace `supabase.from('projects')` with React Query fetch to `/api/projects`.

**Step 5: Write project.$id.tsx**

Port from `app/project/[id]/page.tsx` (67 lines). Use `Route.useParams()` for `$id`. Fetch via React Query.

**Step 6: Write auth/login.tsx**

Port from `app/auth/login/page.tsx` (181 lines). Replace `useRouter()` from `next/navigation` with `useNavigate()` from TanStack Router.

**Step 7: Run route generation**

```bash
npx vite --force  # triggers TanStack Router plugin to generate routeTree.gen.ts
```

Verify: `src/routeTree.gen.ts` is created with all routes.

**Step 8: Commit**

```bash
git add src/routes/ src/routeTree.gen.ts
git commit -m "feat: create TanStack Router routes (5 pages + auth guard)"
```

---

### Task 19: Move components to src/

**Files:**
- Move: `components/` -> `src/components/`
- Move: `contexts/` -> `src/contexts/`
- Move: `hooks/` -> `src/hooks/`

**Step 1: Move component directories**

```bash
git mv components/ src/components/
git mv contexts/ src/contexts/
git mv hooks/ src/hooks/
```

**Step 2: Fix next/* imports in components**

Only 4 files need changes:

| File | Change |
|------|--------|
| `src/components/hero-prompt.tsx` | `next/link` -> `Link` from `@tanstack/react-router` |
| `src/components/hero-prompt.tsx` | `useRouter()` from `next/navigation` -> `useNavigate()` |
| `src/components/builder-chat.tsx` | No `next/*` imports (already pure React) |
| `src/components/ui/sonner.tsx` | `next-themes` -> custom theme hook or remove |

**Step 3: Fix env var references**

Search all components for `NEXT_PUBLIC_` and replace with `VITE_`:

```bash
grep -r "NEXT_PUBLIC_" src/ --include="*.tsx" --include="*.ts" -l
```

Replace `process.env.NEXT_PUBLIC_*` with `import.meta.env.VITE_*`.

**Step 4: Remove "use client" directives**

In Vite SPA, everything is client-side. Remove `"use client"` from all files (optional but clean):

```bash
# This is cosmetic — "use client" is ignored by Vite but doesn't hurt
```

**Step 5: Commit**

```bash
git add src/components/ src/contexts/ src/hooks/
git commit -m "refactor: move components, contexts, hooks to src/"
```

---

### Task 20: Create ThemeProvider (replaces next-themes)

**Files:**
- Create: `src/components/theme-provider.tsx`

**Step 1: Write ThemeProvider**

```typescript
'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (theme: Theme) => void
}>({ theme: 'system', setTheme: () => {} })

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vibestack-theme',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  )

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    if (theme === 'system') {
      const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(sys)
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: (t) => { setTheme(t); localStorage.setItem(storageKey, t) } }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
```

**Step 2: Update sonner.tsx**

Replace `next-themes` import with `useTheme` from `@/components/theme-provider`.

**Step 3: Commit**

```bash
git add src/components/theme-provider.tsx src/components/ui/sonner.tsx
git commit -m "feat: add ThemeProvider replacing next-themes"
```

---

### Task 21: Create Supabase auth hook and wire into router

**Files:**
- Create: `src/lib/auth.ts`
- Modify: `src/main.tsx`

**Step 1: Write auth hook**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from './supabase-browser'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return { user, isAuthenticated: !!user, loading }
}
```

**Step 2: Wire into main.tsx**

Replace stub auth with `useAuth()` hook.

**Step 3: Commit**

```bash
git add src/lib/auth.ts src/main.tsx
git commit -m "feat: add Supabase auth hook wired into TanStack Router context"
```

---

### Task 22: Verify client builds and dev server works

**Step 1: Build client**

```bash
npx vite build
```

Expected: Build succeeds, output in `dist/client/`.

**Step 2: Start dev server**

```bash
npx vite --port 3001
```

Expected: Dev server starts, landing page renders at localhost:3001.

**Step 3: Fix any remaining errors**

Common issues: missing `@/` imports, env var mismatches, Tailwind class issues.

**Step 4: Commit fixes**

```bash
git add -A && git commit -m "fix: resolve client build errors"
```

---

## Phase 5: Sentry Integration

### Task 23: Add Sentry client-side monitoring

**Files:**
- Create: `src/sentry.client.ts`
- Modify: `src/main.tsx` (import sentry config)

**Step 1: Write sentry.client.ts**

See design doc Section 5.

**Step 2: Import in main.tsx**

Add `import './sentry.client'` at the top of `src/main.tsx`.

**Step 3: Commit**

```bash
git add src/sentry.client.ts src/main.tsx
git commit -m "feat: add Sentry client-side error monitoring"
```

---

### Task 24: Add Sentry server-side + AI monitoring

**Files:**
- Create: `server/sentry.ts`
- Modify: `server/index.ts` (import sentry, add @hono/sentry middleware)

**Step 1: Write server/sentry.ts**

See design doc Section 5. Includes `openAIIntegration()`, `anthropicAIIntegration()`, and `traceAgent()` / `traceTool()` helpers.

**Step 2: Import in server/index.ts**

```typescript
import './sentry' // must be first import
import { sentry } from '@hono/sentry'
// ... rest of server
app.use('*', sentry({ dsn: process.env.SENTRY_DSN }))
```

**Step 3: Commit**

```bash
git add server/sentry.ts server/index.ts
git commit -m "feat: add Sentry server-side monitoring with AI agent instrumentation"
```

---

## Phase 6: Cleanup and Verification

### Task 25: Update package.json scripts

**Files:**
- Modify: `package.json`

**Step 1: Replace all scripts**

```json
{
  "scripts": {
    "dev": "concurrently -n client,server \"vite\" \"tsx watch server/index.ts\"",
    "build": "vite build && tsc -p tsconfig.server.json --noEmit",
    "preview": "vite preview",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e:mock": "playwright test --project=mock",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: update scripts for Vite + Hono dev workflow"
```

---

### Task 26: Delete old Next.js files

**Files:**
- Delete: `app/` (entire directory)
- Delete: `middleware.ts`
- Delete: `lib/` (already moved to server/lib/ and src/lib/)
- Delete: `postcss.config.mjs` (if exists)

**Step 1: Remove old files**

```bash
git rm -r app/
git rm middleware.ts
git rm -r lib/
git rm -f postcss.config.mjs
```

**Step 2: Commit**

```bash
git commit -m "chore: remove Next.js app directory, middleware, and old lib/"
```

---

### Task 27: Update Vitest config for new paths

**Files:**
- Modify: `vitest.config.ts`

**Step 1: Update paths**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
})
```

**Step 2: Fix test imports**

Update any tests importing from `@/lib/` to use new paths (`@/` -> `src/` for client, direct paths for server).

**Step 3: Run tests**

```bash
pnpm test
```

Expected: All existing tests pass (or fail for expected import reasons — fix them).

**Step 4: Commit**

```bash
git add vitest.config.ts tests/
git commit -m "fix: update Vitest config and test imports for new structure"
```

---

### Task 28: Update Playwright config for SPA

**Files:**
- Modify: `playwright.config.ts`

**Step 1: Update webServer command**

Replace `next dev` / `next build && next start` with Vite commands:

```typescript
webServer: {
  command: 'pnpm dev',
  port: 3000,
  reuseExistingServer: !process.env.CI,
},
```

**Step 2: Update mock mode env var**

Replace `NEXT_PUBLIC_MOCK_MODE` with `VITE_MOCK_MODE` in playwright config.

**Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "fix: update Playwright config for Vite SPA"
```

---

### Task 29: Update CLAUDE.md for new stack

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update all references**

- Framework: `Next.js 16` -> `Vite 6 + Hono`
- Routing: `App Router` -> `TanStack Router`
- Linting: `OxLint` -> `Biome`
- DB: Add Drizzle ORM section
- Commands: Update all `pnpm` scripts
- Directory structure: Update to new `src/` + `server/` layout
- Env vars: `NEXT_PUBLIC_*` -> `VITE_*`
- Remove Next.js gotchas, add Vite/Hono gotchas

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Vite + Hono + TanStack Router + Drizzle + Biome stack"
```

---

### Task 30: Full verification

**Step 1: Typecheck client**

```bash
npx tsc --noEmit
```

Expected: 0 errors

**Step 2: Typecheck server**

```bash
npx tsc -p tsconfig.server.json --noEmit
```

Expected: 0 errors

**Step 3: Lint**

```bash
pnpm lint
```

Expected: No errors (warnings ok)

**Step 4: Unit tests**

```bash
pnpm test
```

Expected: All tests pass

**Step 5: Build**

```bash
pnpm build
```

Expected: Client builds to `dist/client/`, no errors.

**Step 6: Dev smoke test**

```bash
pnpm dev
```

Visit http://localhost:3000 — landing page should render. Navigate to /auth/login — login page should render.

**Step 7: Final commit**

```bash
git add -A && git commit -m "chore: final verification — all checks passing"
```

---

## Summary

| Phase | Tasks | What |
|-------|-------|------|
| 1. Foundation | 1-5 | Deps, Vite config, Biome, tsconfig, Vercel config |
| 2. Drizzle ORM | 6-8 | Schema, relations, client, queries, tests |
| 3. Hono Server | 9-16 | 8 API routes ported, lib files moved, typecheck |
| 4. Client SPA | 17-22 | Entry point, routes, components, theme, auth, build |
| 5. Sentry | 23-24 | Client + server + AI monitoring |
| 6. Cleanup | 25-30 | Scripts, delete old files, update tests + docs, verify |

**Total: 30 tasks across 6 phases.**
