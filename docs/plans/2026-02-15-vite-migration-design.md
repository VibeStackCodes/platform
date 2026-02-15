# VibeStack Platform: Next.js to Vite Migration Design

**Date**: 2026-02-15
**Status**: Proposed
**Scope**: Full platform migration from Next.js 16 to Vite + React + Hono

## Motivation

The platform uses Next.js with almost none of its differentiating features (no Server Actions, no ISR, no Edge Functions, no `next/image`, empty `next.config.ts`). Generated apps already use Vite + React. Competitors (Lovable, bolt.new, Replit) all use Vite-based or SPA + API architectures. Migrating aligns the platform with its output and the market.

## Architecture

### Before (Next.js)

```
Next.js App Router
├── app/           5 pages (file-based routing)
├── app/api/       7 API routes (all Node.js)
├── middleware.ts   Auth check (thin)
├── components/     70 client components
└── lib/           Business logic
```

### After (Vite + Hono)

```
├── src/                          # Client SPA (Vite + React)
│   ├── routes/                   # TanStack Router (file-based)
│   │   ├── __root.tsx            # Root layout + Outlet
│   │   ├── index.tsx             # Landing page
│   │   ├── (authenticated)/      # Auth-guarded layout route
│   │   │   ├── route.tsx         # beforeLoad guard
│   │   │   ├── dashboard.tsx     # Project list
│   │   │   └── project.$id.tsx   # Builder (chat + preview)
│   │   └── auth/
│   │       └── login.tsx         # Login form
│   ├── components/               # All existing components (mostly unchanged)
│   │   └── ui/                   # shadcn/ui (untouched)
│   ├── lib/                      # Client-side utilities
│   │   ├── api.ts                # Typed fetch wrappers for Hono routes
│   │   ├── supabase-browser.ts   # Supabase client (browser)
│   │   └── utils.ts              # cn() and helpers
│   ├── index.css                 # Tailwind v4 (4-step pattern)
│   └── main.tsx                  # RouterProvider + QueryClient + Sentry
│
├── server/                       # Hono API server
│   ├── index.ts                  # Hono app entry + Sentry middleware
│   ├── routes/
│   │   ├── agent.ts              # POST /api/agent — SSE streaming (Mastra)
│   │   ├── projects.ts           # GET/POST /api/projects — CRUD
│   │   ├── projects-deploy.ts    # POST /api/projects/deploy — Vercel deploy
│   │   ├── sandbox-urls.ts       # GET /api/projects/:id/sandbox-urls
│   │   ├── stripe-checkout.ts    # POST /api/stripe/checkout
│   │   ├── stripe-webhook.ts     # POST /api/stripe/webhook
│   │   └── supabase-proxy.ts     # GET/POST /api/supabase-proxy/*
│   ├── middleware/
│   │   ├── auth.ts               # Supabase session verification
│   │   └── rate-limit.ts         # Upstash rate limiting
│   ├── lib/
│   │   ├── agents/               # Mastra agents (moved from lib/agents)
│   │   │   ├── registry.ts       # 9 agents + supervisor network
│   │   │   ├── tools.ts          # 18 Mastra tools
│   │   │   └── schemas.ts        # Zod schemas
│   │   ├── db/                   # Drizzle ORM
│   │   │   ├── schema.ts         # Table definitions
│   │   │   ├── relations.ts      # Drizzle relations (separate file)
│   │   │   ├── client.ts         # Pool + drizzle instance
│   │   │   └── queries.ts        # Type-safe query functions
│   │   ├── credits.ts            # Credit check/deduct (uses Drizzle)
│   │   ├── sandbox.ts            # Daytona lifecycle
│   │   ├── github.ts             # GitHub App integration
│   │   ├── supabase-mgmt.ts      # Supabase Management API
│   │   ├── schema-contract.ts    # SchemaContract type
│   │   ├── contract-to-sql.ts    # Contract -> SQL migration
│   │   ├── contract-to-types.ts  # Contract -> TypeScript types
│   │   ├── contract-to-drizzle.ts # Contract -> Drizzle schema
│   │   ├── local-supabase.ts     # PGlite validation
│   │   └── sse.ts                # SSE stream helper (Hono-native)
│   └── sentry.ts                 # Sentry server init + AI monitoring
│
├── vite.config.ts                # Vite + plugins
├── biome.json                    # Biome (linting + formatting)
├── drizzle.config.ts             # Drizzle Kit config
├── sentry.client.config.ts       # Sentry client init
└── vercel.json                   # Vercel deployment config
```

## Tooling Stack

| Tool | Replaces | Purpose |
|------|----------|---------|
| **Biome** | ESLint + Prettier (both) | Linting + formatting in one Rust binary (100x faster) |
| **Sentry** | `console.error()` | Error monitoring + AI agent observability |
| **Drizzle ORM** | `supabase.from()` | Type-safe DB queries with compile-time safety |
| **TanStack Router** | Next.js App Router | File-based routing with full type safety |
| **Hono** | Next.js API routes | API server with SSE, Vercel adapter |
| **Vite 6** | Next.js bundler | Build + dev server + HMR |
| **@tailwindcss/vite** | `@tailwindcss/postcss` | Tailwind v4 native Vite integration |

### Why Biome alone (not OxLint + Biome)

OxLint and Biome are both Rust-based linters. Running both is redundant. Biome handles linting (300+ rules including React, a11y, TypeScript) AND formatting in a single pass. Since we're dropping Next.js, there's no need for `eslint-plugin-next` — eliminating the last reason for ESLint. One tool replaces three.

## Detailed Component Designs

### 1. Vite Configuration

Source: vite skill (Vite 8 Rolldown migration reference), tanstack-router skill (plugin order critical), tailwind-v4-shadcn skill (@tailwindcss/vite recommended).

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
    // Source: tanstack-router skill, Issue #2
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
      '/api': 'http://localhost:8787', // Hono dev server
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist/client',
  },
})
```

### 2. TanStack Router — Auth Guard

Source: tanstack-router skill (beforeLoad pattern, Issue #11 pathless notFoundComponent).

```typescript
// src/routes/(authenticated)/route.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/(authenticated)')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/auth/login',
        search: { redirect: location.pathname },
      })
    }
  },
})
```

```typescript
// src/main.tsx
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { auth: undefined!, queryClient },
  defaultErrorComponent: ({ error }) => <div>Error: {error.message}</div>,
})

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

function App() {
  const auth = useAuth() // Supabase auth hook
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ auth, queryClient }} />
    </QueryClientProvider>
  )
}
```

### 3. Hono API Server

Source: hono skill (CLI for docs/testing), Sentry skill (middleware integration).

```typescript
// server/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { sentry } from '@hono/sentry'
import { handle } from '@hono/vercel'
import { agentRoutes } from './routes/agent'
import { projectRoutes } from './routes/projects'
import { stripeRoutes } from './routes/stripe'
import { supabaseProxyRoutes } from './routes/supabase-proxy'

const app = new Hono().basePath('/api')

// Global middleware
app.use('*', sentry({ dsn: process.env.SENTRY_DSN }))
app.use('*', cors())

// Mount route groups
app.route('/agent', agentRoutes)
app.route('/projects', projectRoutes)
app.route('/stripe', stripeRoutes)
app.route('/supabase-proxy', supabaseProxyRoutes)

// Vercel adapter for production
export default handle(app)

// Dev server entry (used by vite proxy)
export { app }
```

```typescript
// server/routes/agent.ts — SSE streaming example
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import * as Sentry from '@sentry/node'

export const agentRoutes = new Hono()

agentRoutes.post('/', async (c) => {
  const body = await c.req.json()

  return streamSSE(c, async (stream) => {
    await Sentry.startSpan({
      op: 'gen_ai.invoke_agent',
      name: 'Mastra supervisor network',
      attributes: { 'gen_ai.agent.name': 'supervisor' },
    }, async (span) => {
      // ... Mastra agent orchestration
      // stream.writeSSE({ data: JSON.stringify(event), event: 'progress' })
    })
  })
})
```

### 4. Drizzle ORM Schema

Source: drizzle-orm skill (relations separate from tables, $inferSelect for types).

```typescript
// server/lib/db/schema.ts
import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email'),
  plan: text('plan').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  creditsRemaining: integer('credits_remaining').notNull().default(200),
  creditsMonthly: integer('credits_monthly').notNull().default(200),
  creditsResetAt: timestamp('credits_reset_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prompt: text('prompt'),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  plan: jsonb('plan'),
  model: text('model'),
  generationState: jsonb('generation_state').default({}),
  sandboxId: text('sandbox_id'),
  supabaseProjectId: text('supabase_project_id'),
  previewUrl: text('preview_url'),
  codeServerUrl: text('code_server_url'),
  deployUrl: text('deploy_url'),
  supabaseUrl: text('supabase_url'),
  supabaseAnonKey: text('supabase_anon_key'),
  supabaseServiceRoleKey: text('supabase_service_role_key'),
  githubRepoUrl: text('github_repo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  parts: jsonb('parts').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  model: text('model').notNull().default('gpt-5.2'),
  tokensInput: integer('tokens_input').notNull().default(0),
  tokensOutput: integer('tokens_output').notNull().default(0),
  tokensTotal: integer('tokens_total').notNull().default(0),
  creditsUsed: integer('credits_used').notNull().default(0),
  stripeMeterEventId: text('stripe_meter_event_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Type inference
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ChatMessage = typeof chatMessages.$inferSelect
export type UsageEvent = typeof usageEvents.$inferSelect
```

```typescript
// server/lib/db/relations.ts
import { relations } from 'drizzle-orm'
import { profiles, projects, chatMessages, usageEvents } from './schema'

export const profilesRelations = relations(profiles, ({ many }) => ({
  projects: many(projects),
  usageEvents: many(usageEvents),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(profiles, { fields: [projects.userId], references: [profiles.id] }),
  chatMessages: many(chatMessages),
  usageEvents: many(usageEvents),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  project: one(projects, { fields: [chatMessages.projectId], references: [projects.id] }),
}))

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(profiles, { fields: [usageEvents.userId], references: [profiles.id] }),
  project: one(projects, { fields: [usageEvents.projectId], references: [projects.id] }),
}))
```

```typescript
// server/lib/db/client.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import * as relations from './relations'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema: { ...schema, ...relations } })
```

```typescript
// server/lib/db/queries.ts — example type-safe queries
import { db } from './client'
import { projects, profiles } from './schema'
import { eq, desc } from 'drizzle-orm'

export async function getUserProjects(userId: string) {
  return db.select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt))
}

export async function getProjectWithMessages(projectId: string, userId: string) {
  return db.query.projects.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, projectId), eq(p.userId, userId)),
    with: { chatMessages: true },
  })
}

export async function getUserCredits(userId: string) {
  return db.select({
    creditsRemaining: profiles.creditsRemaining,
    creditsMonthly: profiles.creditsMonthly,
    creditsResetAt: profiles.creditsResetAt,
    plan: profiles.plan,
  })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .then(rows => rows[0] ?? null)
}
```

### 5. Sentry — Client + Server + AI Monitoring

Source: sentry-setup-ai-monitoring skill (OpenAI/Anthropic auto-integrations, manual gen_ai.* spans).

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
})
```

```typescript
// server/sentry.ts
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  integrations: [
    // Auto-instrument OpenAI SDK calls (Mastra uses OpenAI under the hood)
    Sentry.openAIIntegration({ recordInputs: true, recordOutputs: true }),
    // Auto-instrument Anthropic SDK calls
    Sentry.anthropicAIIntegration({ recordInputs: true, recordOutputs: true }),
  ],
})

// Manual instrumentation for Mastra agent spans
export function traceAgent(agentName: string, fn: () => Promise<unknown>) {
  return Sentry.startSpan({
    op: 'gen_ai.invoke_agent',
    name: `Mastra agent: ${agentName}`,
    attributes: { 'gen_ai.agent.name': agentName },
  }, fn)
}

export function traceTool(toolName: string, fn: () => Promise<unknown>) {
  return Sentry.startSpan({
    op: 'gen_ai.execute_tool',
    name: `Tool: ${toolName}`,
    attributes: { 'gen_ai.tool.name': toolName },
  }, fn)
}
```

### 6. Biome Configuration

Source: biome skill (React patterns, migration from ESLint, CI integration).

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignore": ["node_modules", "dist", ".mastra", "coverage", "*.gen.ts"]
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
      "security": {
        "recommended": true,
        "noDangerouslySetInnerHtml": "error"
      },
      "style": {
        "useConst": "error",
        "useImportType": "error",
        "useExportType": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noArrayIndexKey": "error"
      }
    }
  },
  "overrides": [
    {
      "include": ["**/*.test.ts", "**/*.spec.ts"],
      "linter": {
        "rules": {
          "suspicious": { "noExplicitAny": "off" }
        }
      }
    }
  ]
}
```

### 7. Tailwind v4 CSS (4-Step Pattern)

Source: tailwind-v4-shadcn skill (mandatory 4-step architecture, tw-animate-css).

```css
/* src/index.css */
@import "tailwindcss";
@import "tw-animate-css";

/* Step 1: CSS Variables at root level (NOT inside @layer base) */
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(222.2 84% 4.9%);
  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222.2 84% 4.9%);
  --primary: hsl(221.2 83.2% 53.3%);
  --primary-foreground: hsl(210 40% 98%);
  --secondary: hsl(210 40% 96.1%);
  --secondary-foreground: hsl(222.2 47.4% 11.2%);
  --muted: hsl(210 40% 96.1%);
  --muted-foreground: hsl(215.4 16.3% 46.9%);
  --accent: hsl(210 40% 96.1%);
  --accent-foreground: hsl(222.2 47.4% 11.2%);
  --destructive: hsl(0 84.2% 60.2%);
  --destructive-foreground: hsl(210 40% 98%);
  --border: hsl(214.3 31.8% 91.4%);
  --input: hsl(214.3 31.8% 91.4%);
  --ring: hsl(221.2 83.2% 53.3%);
  --radius: 0.5rem;
  --sidebar-background: hsl(0 0% 98%);
  --sidebar-foreground: hsl(240 5.3% 26.1%);
}

.dark {
  --background: hsl(222.2 84% 4.9%);
  --foreground: hsl(210 40% 98%);
  /* ... all dark mode overrides */
}

/* Step 2: Map variables to Tailwind utilities */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

/* Step 3: Base styles (NO hsl() wrapper here) */
@layer base {
  body {
    background-color: var(--background);
    color: var(--foreground);
  }
}

/* Step 4: Dark mode switches automatically via .dark class */
```

### 8. Drizzle Kit Configuration

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './server/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

### 9. Vercel Deployment

```jsonc
// vercel.json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist/client",
  "functions": {
    "server/index.ts": {
      "maxDuration": 300
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/server/index.ts" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Dependencies

### Add

| Package | Purpose |
|---------|---------|
| `vite` | Build tool + dev server |
| `@vitejs/plugin-react` | React plugin for Vite |
| `@tailwindcss/vite` | Tailwind v4 Vite plugin |
| `@tanstack/react-router` | File-based routing |
| `@tanstack/router-plugin` | Vite plugin for route generation |
| `@tanstack/router-devtools` | Router devtools |
| `@tanstack/zod-adapter` | Search params validation |
| `hono` | API server |
| `@hono/vercel` | Vercel deployment adapter |
| `@hono/sentry` | Sentry middleware for Hono |
| `@sentry/react` | Client-side error monitoring |
| `@sentry/node` | Server-side error monitoring |
| `drizzle-orm` | Type-safe ORM |
| `pg` | PostgreSQL driver |
| `@biomejs/biome` | Linting + formatting |
| `tw-animate-css` | Animation utilities (replaces tailwindcss-animate) |
| `drizzle-kit` | Migration tooling (dev) |

### Remove

| Package | Why |
|---------|-----|
| `next` | Replaced by Vite + Hono |
| `eslint` | Replaced by Biome |
| `eslint-config-next` | No more Next.js |
| `@tailwindcss/postcss` | Replaced by @tailwindcss/vite |
| `@supabase/ssr` | Not needed for SPA (use @supabase/supabase-js directly) |
| `next-themes` | Replaced by custom ThemeProvider |

### Keep (unchanged)

All Mastra packages, Vercel AI SDK, Stripe, Daytona SDK, React Query, shadcn/ui, radix-ui, motion, shiki, streamdown, and all other business-logic dependencies.

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"tsx watch server/index.ts\"",
    "build": "vite build && tsc -p tsconfig.server.json",
    "preview": "vite preview",
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "vitest",
    "test:e2e:mock": "playwright test --project=mock",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

## Migration Map (File by File)

### Pages (5 files)

| Next.js | TanStack Router | Changes |
|---------|-----------------|---------|
| `app/layout.tsx` | `src/routes/__root.tsx` | Root layout with `<Outlet />` |
| `app/page.tsx` | `src/routes/index.tsx` | Landing page (no server fetch) |
| `app/dashboard/page.tsx` | `src/routes/(authenticated)/dashboard.tsx` | `supabase.from()` -> React Query + Drizzle API |
| `app/project/[id]/page.tsx` | `src/routes/(authenticated)/project.$id.tsx` | Dynamic param `$id`, loader prefetches |
| `app/auth/login/page.tsx` | `src/routes/auth/login.tsx` | Already `"use client"`, minimal changes |

### API Routes (7 files)

| Next.js | Hono | Changes |
|---------|------|---------|
| `app/api/agent/route.ts` | `server/routes/agent.ts` | `NextResponse` -> `streamSSE()`, `maxDuration` -> vercel.json |
| `app/api/projects/[id]/route.ts` | `server/routes/projects.ts` | `supabase.from()` -> `db.select()` |
| `app/api/projects/[id]/sandbox-urls/route.ts` | `server/routes/sandbox-urls.ts` | Minimal changes |
| `app/api/projects/deploy/route.ts` | `server/routes/projects-deploy.ts` | Minimal changes |
| `app/api/stripe/checkout/route.ts` | `server/routes/stripe-checkout.ts` | `supabase.from()` -> Drizzle |
| `app/api/stripe/webhook/route.ts` | `server/routes/stripe-webhook.ts` | `supabase.from()` -> Drizzle |
| `app/api/supabase-proxy/[...path]/route.ts` | `server/routes/supabase-proxy.ts` | Catch-all via Hono `/*` |

### Middleware (1 file)

| Next.js | Replacement | Changes |
|---------|-------------|---------|
| `middleware.ts` | `src/routes/(authenticated)/route.tsx` | `beforeLoad` guard on layout route |

### Components (70 files)

**Zero changes needed.** All components are already `"use client"` React components. They import from `@/components/ui/*` and use Tailwind classes — both of which remain identical.

Only changes:
- `next/link` (2 files) -> `<Link>` from `@tanstack/react-router`
- `next/navigation` `useRouter()` (2 files) -> `useNavigate()` from TanStack Router
- `next/navigation` `redirect()` (2 files) -> moved to route `beforeLoad`

### Business Logic (lib/)

**Server-side files** move to `server/lib/`. **Client-side files** stay in `src/lib/`.

| File | Destination | Changes |
|------|-------------|---------|
| `lib/agents/*` | `server/lib/agents/*` | None (server-only) |
| `lib/credits.ts` | `server/lib/credits.ts` | `supabase.from()` -> Drizzle queries |
| `lib/sandbox.ts` | `server/lib/sandbox.ts` | None |
| `lib/github.ts` | `server/lib/github.ts` | None |
| `lib/supabase-mgmt.ts` | `server/lib/supabase-mgmt.ts` | None |
| `lib/schema-contract.ts` | `server/lib/schema-contract.ts` | None |
| `lib/contract-to-*.ts` | `server/lib/contract-to-*.ts` | None |
| `lib/local-supabase.ts` | `server/lib/local-supabase.ts` | None |
| `lib/sse.ts` | `server/lib/sse.ts` | Adapt to Hono `streamSSE()` |
| `lib/supabase-server.ts` | `server/middleware/auth.ts` | `cookies()` -> Hono cookie middleware |
| `lib/supabase-browser.ts` | `src/lib/supabase-browser.ts` | Keep (client-side) |
| `lib/types.ts` | Shared (both) | Split client/server types |
| `lib/utils.ts` | `src/lib/utils.ts` | Keep (client-side, cn()) |

## Environment Variables

### Renamed (Vite convention)

Client-side variables use `VITE_` prefix instead of `NEXT_PUBLIC_`:

| Before | After |
|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `VITE_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_MOCK_MODE` | `VITE_MOCK_MODE` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `VITE_STRIPE_PUBLISHABLE_KEY` |

### New

| Variable | Purpose |
|----------|---------|
| `VITE_SENTRY_DSN` | Sentry client DSN |
| `SENTRY_DSN` | Sentry server DSN |

### Unchanged

All server-side variables remain the same (DATABASE_URL, OPENAI_API_KEY, etc.).

## What Stays the Same

- All shadcn/ui components (zero changes)
- All Mastra agent code (9 agents, 18 tools)
- SchemaContract pipeline (contract-first generation)
- Supabase Auth (client-side, `@supabase/supabase-js`)
- Supabase Realtime (preview URL subscription)
- Stripe integration (webhook + checkout)
- Daytona sandbox lifecycle
- GitHub App integration
- Vitest test framework
- Playwright E2E framework
- SQL migrations (existing, Drizzle reads from same tables)
- React Query for client-side data fetching

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| SSR loss for landing page SEO | Landing page is a prompt bar with minimal content. Add `<meta>` tags via `react-helmet-async`. Most traffic is authenticated (dashboard). |
| Vercel function cold starts | Hono is ~14kb. Cold starts will be faster than Next.js serverless functions. |
| Supabase Realtime in SPA | Already works client-side via `@supabase/supabase-js`. No change needed. |
| Mock mode for E2E tests | Replace `NEXT_PUBLIC_MOCK_MODE` with `VITE_MOCK_MODE`. Same pattern, different prefix. |
| Drizzle + Supabase RLS | Drizzle connects via `DATABASE_URL` (Supabase pooler). RLS works at the Postgres level regardless of ORM. Service-level queries bypass RLS via direct connection. |
| Mastra agent memory | Mastra uses `@mastra/pg` with `DATABASE_URL`. Independent of platform ORM choice. |
