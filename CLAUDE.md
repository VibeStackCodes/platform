# VibeStack Platform

AI-powered app builder — users describe an app, the platform generates a full Next.js + Supabase project with live preview.

## Commands

```bash
bun run dev           # Vite SPA + Hono API server (concurrently)
bun run build         # Vite client build + server typecheck
bun run preview       # Vite preview of built client
bun run lint          # OxLint (670+ rules, 50-100x faster than ESLint)
bun run lint:fix      # OxLint auto-fix
bun run format        # Biome format (formatter only)
bun run test          # Vitest unit/integration tests
bun run test:e2e:mock # Playwright E2E with mock mode (no external services)
bun run test:e2e:real # Playwright E2E against real Supabase/Daytona
bun run db:generate   # Drizzle Kit generate migrations
bun run db:migrate    # Drizzle Kit run migrations
bun run db:studio     # Drizzle Kit studio (DB browser)
```

## Stack

- **Client**: Vite 8 SPA, React 19, TanStack Router (file-based routing)
- **Server**: Hono API framework (replaces Next.js API routes)
- **Language**: TypeScript 5, strict mode, dual tsconfig (client + server)
- **UI**: Tailwind CSS v4, shadcn/ui (Radix), Motion (framer-motion successor)
- **Auth**: Supabase Auth via `@supabase/supabase-js` (SPA localStorage tokens)
- **Database**: Drizzle ORM + Supabase (platform DB) + Supabase Management API (generated app DBs)
- **Sandbox**: Daytona SDK — sandboxed environments from snapshots
- **AI**: Mastra agent framework, OpenAI + Anthropic providers
- **Payments**: Stripe (checkout, webhooks)
- **Deployment**: Vercel (Hono via `@hono/vercel`, client via `dist/client/`)
- **Monitoring**: Sentry (client + server + AI agent instrumentation)
- **Linting**: OxLint (670+ rules, oxc-based) + Biome (formatter only)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Package manager**: bun

## Architecture

### Directory Structure

```
src/                     # Client SPA (Vite + TanStack Router)
  main.tsx               # App entry point (Router + QueryClient + Auth)
  sentry.client.ts       # Sentry client init
  index.css              # Tailwind v4 theme (CSS-first)
  routes/
    __root.tsx            # Root layout (Outlet + devtools)
    index.tsx             # Landing page
    _authenticated/
      route.tsx           # Auth guard (beforeLoad redirect)
      dashboard.tsx       # Project list
      project.$id.tsx     # Builder UI (chat + preview + DB manager)
    auth/
      login.tsx           # Sign in/up page
  components/
    ui/                   # shadcn/ui primitives
    supabase-manager/     # Database browser/editor for generated apps
    builder-chat.tsx      # Chat panel in builder
    builder-preview.tsx   # Live preview iframe
    hero-prompt.tsx       # Landing page prompt bar
    project-layout.tsx    # Builder page layout
    theme-provider.tsx    # Dark/light/system theme (replaces next-themes)
  lib/
    auth.ts              # useAuth() hook (Supabase onAuthStateChange)
    supabase-browser.ts  # Supabase client singleton (import.meta.env.VITE_*)
    utils.ts             # cn() helper, stripCodeFences()
    types.ts             # Client-side type definitions
    platform-kit/        # Management API client + pg-meta types
  contexts/              # React contexts
  hooks/                 # Custom hooks
server/                  # Hono API server
  index.ts               # Hono app entry + Sentry middleware
  sentry.ts              # Sentry server init + AI agent instrumentation
  middleware/
    auth.ts              # Hono auth middleware (cookie-based Supabase)
  routes/
    agent.ts             # Mastra agent SSE endpoint (credit-gated)
    projects.ts          # Project CRUD
    projects-deploy.ts   # Vercel deployment
    sandbox-urls.ts      # Sandbox preview URLs
    stripe-checkout.ts   # Stripe checkout sessions
    stripe-webhook.ts    # Stripe webhook handler
    supabase-proxy.ts    # Proxies queries to generated app's Supabase
    auth-callback.ts     # OAuth code exchange
  lib/
    db/
      schema.ts          # Drizzle schema (matches Supabase migrations)
      relations.ts       # Drizzle relations
      client.ts          # Drizzle client (pg Pool)
      queries.ts         # Type-safe query functions
    agents/
      registry.ts        # 9 agents + supervisor network (Mastra)
      tools.ts           # 18 Mastra tools
      schemas.ts         # Zod schemas for agent inputs/outputs
      workflows.ts       # Mastra workflows
    sandbox.ts           # Daytona sandbox lifecycle
    schema-contract.ts   # SchemaContract type — single source of truth
    contract-to-sql.ts   # SchemaContract → deterministic SQL migration
    contract-to-types.ts # SchemaContract → TypeScript types
    contract-to-hooks.ts  # SchemaContract → TanStack Query CRUD hooks
    contract-to-routes.ts # SchemaContract → TanStack Router route definitions
    github.ts            # GitHub App integration
    supabase-mgmt.ts     # Supabase Management API
    credits.ts           # Credit checking/deduction
    sse.ts               # SSE stream helper (Hono streamSSE)
supabase/migrations/     # Platform DB migrations
snapshot/                # Daytona sandbox Docker image (Vite + React base)
```

### Dual tsconfig

- **`tsconfig.json`**: Client code (`src/`). `@/` → `./src/*`
- **`tsconfig.server.json`**: Server code (`server/`). `@/` → `./server/*`
- **Never cross-import** between client and server boundaries
- `src/mastra/` is excluded from client tsconfig (imports server code)

### Generation Pipeline

1. **Agent route** (`/api/agent`) → user describes app → Mastra supervisor network orchestrates 9 agents (credit-gated, 402 on exhaustion):
   - **Planner**: Extracts requirements, creates `SchemaContract`
   - **Data Architect**: Generates SQL migration, validates via PGlite
   - **Frontend Engineer**: Generates React components in sandbox
   - **QA Engineer**: Runs `bun run build`, fixes errors
   - **Infra Agent**: Creates Supabase project, GitHub repo
   - **DevOps Agent**: Deploys to Vercel
   - SSE bridge maps Mastra `NetworkChunkType` → `StreamEvent` types
2. **Preview** delivered via `BuilderPreview` subscribing to Supabase realtime on `projects` table

### Key Patterns

- **Contract-first**: `SchemaContract` → all downstream artifacts (SQL, types, seed). Never retry LLM generation — fix the contract or generator if wrong.
- **Agent architecture**: 9 Mastra agents created per-request via `createAgentNetwork(model, userId)` with Helicone proxy for observability. Model tiers: `gpt-4o` (orchestrator/codegen), `gpt-4o-mini` (validator).
- **Credit-Based Billing**: 1 credit = 1,000 tokens. `/api/agent` enforces credits (402 on exhaustion). Stripe meters track usage, credit grants provision per subscription.
- **Single-flow frontend**: All AI calls go through `/api/agent` (SSE).
- **SSE streaming**: Agent route streams progress events to client via Hono `streamSSE()`.
- **Mock mode**: `VITE_MOCK_MODE=true` bypasses auth and Supabase queries for E2E testing.
- **Path aliases**: `@/` → `src/` (client), `@/` → `server/` (server tsconfig). Tests use `@server/` → `server/` alias.

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Platform Supabase instance |
| `VITE_SUPABASE_ANON_KEY` | Platform Supabase anon key |
| `DATABASE_URL` | PostgreSQL connection string (Supabase pooler URL) |
| `SUPABASE_ACCESS_TOKEN` | Management API token (for generating app DBs) |
| `SUPABASE_ORG_ID` | Org for generated Supabase projects |
| `ANTHROPIC_API_KEY` | Claude API |
| `OPENAI_API_KEY` | OpenAI API |
| `DAYTONA_API_KEY` | Daytona sandbox API |
| `DAYTONA_SNAPSHOT_ID` | Pre-built sandbox snapshot ID |
| `VERCEL_TOKEN` | Vercel deployment token |
| `VERCEL_WILDCARD_PROJECT_ID` | Target project for deployments |
| `GITHUB_APP_ID` | GitHub App for repo creation |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key |
| `GITHUB_APP_INSTALLATION_ID` | GitHub App installation |
| `GITHUB_ORG` | Org for generated repos |
| `STRIPE_SECRET_KEY` | Stripe server key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook validation |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe client key |
| `HELICONE_API_KEY` | Helicone LLM proxy (observability + per-user tracking) |
| `UNSPLASH_ACCESS_KEY` | Unsplash API for hero images in generated apps |
| `VITE_SENTRY_DSN` | Sentry client DSN (optional) |
| `SENTRY_DSN` | Sentry server DSN (optional) |

## Testing

### Unit Tests (Vitest)

- Config: `vitest.config.ts`, environment: `happy-dom`
- Tests in `tests/` directory, setup file: `tests/setup.ts`
- Aliases: `@/` → `src/`, `@server/` → `server/`
- Run: `bun run test` or `bun run test:ui`

### E2E Tests (Playwright)

- Config: `playwright.config.ts`
- Two projects: `mock` (uses mock mode) and `real` (hits real services)
- Mock E2E: `bun run test:e2e:mock` — runs with `VITE_MOCK_MODE=true`
- Real E2E: `bun run test:e2e:real` — requires all env vars set
- Sequential (not parallel) — tests share auth state
- Global setup: `e2e/global-setup.ts`

## Branch Merge Protocol (NON-NEGOTIABLE)

When merging a feature branch (especially from a worktree), **always verify the merged result before committing**:

```bash
# 1. Merge without committing
git merge --no-commit feature/branch-name

# 2. Install deps (package.json may have changed)
bun install

# 3. Verify the MERGED code compiles
bunx tsc --noEmit

# 4. Run the FULL test suite (not just branch tests)
bun run test

# 5. Only then commit
git commit
```

**Why**: Branch tests only cover branch code. Main may have evolved independently — new files importing modules the branch deleted, new deps the branch's `package.json` removed, etc. These **merge-boundary failures** are invisible until you run `tsc` and `test` on the combined result.

**Common merge-boundary issues**:
- Deps removed by branch but still needed by main's frontend code
- Main added functions to a module the branch rewrote (e.g., `sandbox.ts`)
- Test files on main referencing modules the branch deleted
- Type exports removed by branch but still imported by main's components

## Gotchas

- **Dual tsconfig**: Client uses `@/` → `src/`, server uses `@/` → `server/`. Never cross-import. Tests use `@server/` for server code.
- **Env vars**: Client uses `import.meta.env.VITE_*`, server uses `process.env.*`. Only `VITE_` prefixed vars are exposed to the client.
- **PGlite validation** requires AUTH_STUBS with `authenticated`, `anon`, and `service_role` roles — omitting these causes migration validation to fail silently.
- **Daytona sandbox polling** uses a 20s window (10x2s) — shorter windows cause duplicate sandbox creation from race conditions.
- **Verifier** runs `bun run build` (not `npm run build`) — must match Vercel build command in generated projects.
- **Preview URL** comes from Supabase realtime subscription on `projects` table, NOT from SSE events.
- **`d.list()` vs `d.get(id)`**: Daytona's `list()` returns lightweight objects without `process.executeCommand()`. Always use `get(id)` for full sandbox operations.
- **Signed preview URLs** from Daytona expire in 1 hour.
- **No `SUPABASE_SERVICE_ROLE_KEY`** in platform env — use Management API for DB queries against generated apps.
- **Credit deduction** happens post-execution (not pre-execution). In-flight generations always complete even if credits go negative.
- **Helicone fallback**: When `HELICONE_API_KEY` is unset, LLM calls go directly to OpenAI (no observability).
- **Sentry** is gated behind `VITE_SENTRY_DSN` / `SENTRY_DSN` — no-op when unset.

## Snapshot (Daytona Sandbox Image)

The `snapshot/` directory defines the Docker image used as the Daytona sandbox base (`vibestack-workspace`):

- **Base**: `oven/bun:1-debian` (Bun runtime, not Node)
- **Pre-cached deps**: `package-base.json` — React 19, Supabase JS, PGlite, Vite 7, Tailwind v4, Radix UI, etc.
- **Warmup**: Dockerfile runs `bun run dev` + `tsc --noEmit` at build time to pre-bundle Vite deps (`.vite/`) and TypeScript caches (`tsconfig.tsbuildinfo`), saving ~5-10s on first use
- **Generated apps use Vite** (not Next.js) — `bun run build` = `tsc -b && vite build`
- **PGlite** (`@electric-sql/pglite`) is included for in-sandbox SQL migration validation
- **`warmup-scaffold/`**: Minimal React+Vite app used only for cache warming, cleaned up after build (caches kept)

Key detail: both the platform and generated apps now use Vite + React.

## Code Style

- TypeScript strict mode, no `any` unless unavoidable
- React 19 — use `use()` hook, no `forwardRef` needed
- shadcn/ui components in `src/components/ui/`
- Tailwind v4 (CSS-first config, no `tailwind.config.ts`)
- OxLint: linter (670+ rules, oxc parser, 50-100x faster than ESLint)
- Biome: formatter only (single quotes, no semicolons, trailing commas)
- Client imports use `@/` path alias (→ `src/`)
- Server code uses relative imports within `server/`
