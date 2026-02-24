# VibeStack Platform

AI-powered app builder — users describe an app, the platform generates a full Vite + Supabase project with live preview.

## Commands

```bash
bun run dev           # Vite SPA + Hono API server (concurrently)
bun run build         # Vite client build + typecheck (single tsconfig)
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
- **Server**: Hono API framework
- **Language**: TypeScript 5, strict mode, single tsconfig
- **UI**: Tailwind CSS v4, shadcn/ui (Radix), Motion (framer-motion successor)
- **Auth**: Supabase Auth via `@supabase/supabase-js` (SPA localStorage tokens)
- **Database**: Drizzle ORM + Supabase (platform DB) + Supabase Management API (generated app DBs)
- **Sandbox**: Daytona SDK — sandboxed environments from snapshots
- **AI**: Mastra agent framework, OpenAI providers, XState pipeline orchestration
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
      project.$id.tsx     # Builder UI (chat + preview)
    auth/
      login.tsx           # Sign in/up page
  components/
    ui/                   # shadcn/ui primitives
    ai-elements/          # Agent cards, code blocks, theme tokens, etc.
    builder-chat.tsx      # Chat panel in builder
    builder-preview.tsx   # Live preview iframe
    project-layout.tsx    # Builder page layout
    theme-provider.tsx    # Dark/light/system theme
  lib/
    auth.ts              # useAuth() hook (Supabase onAuthStateChange)
    supabase-browser.ts  # Supabase client singleton (import.meta.env.VITE_*)
    utils.ts             # cn() helper, stripCodeFences()
    types.ts             # Client-side type definitions
  hooks/                 # Custom hooks
server/                  # Hono API server
  index.ts               # Hono app entry + Sentry middleware
  sentry.ts              # Sentry server init + AI agent instrumentation
  middleware/
    auth.ts              # Hono auth middleware (cookie-based Supabase)
  routes/
    agent.ts             # XState pipeline SSE endpoint (credit-gated)
    admin.ts             # Admin health check + env check
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
      machine.ts         # XState state machine (main pipeline)
      edit-machine.ts    # XState machine for iterative edits
      orchestrator.ts    # Actor implementations (analysis, design, codegen, etc.)
      registry.ts        # Agent definitions (Mastra)
      tools.ts           # ~25 Mastra tools (sandbox, GitHub, Supabase, Vercel)
      schemas.ts         # Zod schemas for agent inputs/outputs
      provider.ts        # Multi-provider routing (PROVIDER_REGISTRY + MODEL_CONFIGS per role)
      repair.ts          # Repair agent for build errors
      validation.ts      # Build validation gate
    sandbox.ts           # Daytona sandbox lifecycle
    creative-director.ts # Creative Director — visual design spec
    page-generator.ts    # LLM bespoke page generation (per CreativeSpec sitemap)
    deterministic-assembly.ts # routeTree, main.tsx, __root.tsx, index.css from CreativeSpec
    app-blueprint.ts     # AppBlueprint type + loadUIKit()
    page-validator.ts    # Post-assembly validation
    themed-code-engine.ts # themeCss() — CSS generation from DesignSystem tokens
    github.ts            # GitHub App integration
    supabase-mgmt.ts     # Supabase Management API
    credits.ts           # Credit checking/deduction
    sse.ts               # SSE stream helper (Hono streamSSE)
supabase/migrations/     # Platform DB migrations
snapshot/                # Daytona sandbox Docker image (Vite + React base)
```

### Path Aliases

Single `tsconfig.json` covers both `src/` and `server/`:

- `@/*` → `./src/*` (client imports)
- `@server/*` → `./server/*` (used in tests)
- **Never cross-import** between client and server boundaries
- Server code uses relative imports internally

### XState Pipeline Orchestration

The generation pipeline is orchestrated by an XState state machine (`server/lib/agents/machine.ts`):

- **State flow**: `idle` → `preparing` (parallel: analysis + provisioning) → `designing` → `architecting` → `codeGeneration` → `validating` → `deploying` → `complete`
- **Error path**: Any state can transition to `cleanup` → `failed` (cleanup releases sandbox + Supabase project)
- **Repair loop**: `validating` ↔ `repairing` (max 2 retries, halts if errors unchanged)
- **Parallel state**: `preparing` runs `runAnalysisActor` and `runProvisioningActor` concurrently; both must complete before `designing`
- **Clarification**: `preparing.analysis.running` → `awaitingClarification` (30min timeout) → `USER_ANSWERED` event resumes
- **Mock pipeline**: `MOCK_PIPELINE=true` swaps all actors with fake delays (2-3s each), no external services
- **SSE mapping**: `STATE_PHASES` maps state names → `{ phase, agentId, agentName }` for client rendering; `streamActorStates()` emits `agent_start`/`agent_complete`/`checkpoint`/`phase_start` events
- **Context**: `MachineContext` carries all data through the pipeline (tokens, blueprint, sandbox/Supabase IDs, validation results, generated pages)

### Model Routing

User-selectable per generation: GPT-5.2 Codex (OpenAI), Claude Opus 4.6, Claude Sonnet 4.6. Provider routing via `PROVIDER_REGISTRY` + `MODEL_CONFIGS` in `provider.ts`. Adding a new model = one `MODEL_CONFIGS` entry. Adding a new provider = one `PROVIDER_REGISTRY` entry + `bun add @ai-sdk/<provider>`.

### Key Patterns

- **Bespoke LLM code generation**: Creative Director → CreativeSpec → `page-generator.ts` writes complete .tsx per sitemap entry → `deterministic-assembly.ts` generates infrastructure (routeTree, main.tsx, __root.tsx, index.css). No prefab renderers — every page is bespoke.
- **Credit-Based Billing**: 1 credit = 1,000 tokens. `/api/agent` enforces credits (402 on exhaustion). Stripe meters track usage.
- **Single-flow frontend**: All AI calls go through `/api/agent` (SSE).
- **SSE streaming**: Agent route streams progress events to client via Hono `streamSSE()`.
- **Mock mode**: `VITE_MOCK_MODE=true` bypasses auth and Supabase queries for E2E testing.

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Platform Supabase instance |
| `VITE_SUPABASE_ANON_KEY` | Platform Supabase anon key |
| `DATABASE_URL` | PostgreSQL connection string (Supabase pooler URL) |
| `SUPABASE_ACCESS_TOKEN` | Management API token (for generating app DBs) |
| `SUPABASE_ORG_ID` | Org for generated Supabase projects |
| `OPENAI_API_KEY` | OpenAI API |
| `ANTHROPIC_API_KEY` | Anthropic API (Claude models) |
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

## Gotchas

- **Path aliases**: `@/` → `src/` (client), `@server/` → `server/` (tests). Server code uses relative imports. Never cross-import between client and server.
- **Env vars**: Client uses `import.meta.env.VITE_*`, server uses `process.env.*`. Only `VITE_` prefixed vars are exposed to the client.
- **PGlite validation** requires AUTH_STUBS with `authenticated`, `anon`, and `service_role` roles — omitting these causes migration validation to fail silently.
- **Daytona sandbox polling** uses a 20s window (10x2s) — shorter windows cause duplicate sandbox creation from race conditions.
- **Preview URL** comes from Supabase realtime subscription on `projects` table, NOT from SSE events.
- **`d.list()` vs `d.get(id)`**: Daytona's `list()` returns lightweight objects without `process.executeCommand()`. Always use `get(id)` for full sandbox operations.
- **Signed preview URLs** from Daytona expire in 1 hour.
- **Credit deduction** happens post-execution (not pre-execution). In-flight generations always complete even if credits go negative.
- **Helicone fallback**: When `HELICONE_API_KEY` is unset, LLM calls go directly to OpenAI (no observability).
- **Sentry** is gated behind `VITE_SENTRY_DSN` / `SENTRY_DSN` — no-op when unset.
- **Bun.serve idle timeout**: Set to 255s (max) to prevent SSE connection drops during long LLM calls. Keepalive pings every 15s.
- **SSE subscribe before send**: XState `actor.subscribe()` only fires on future snapshots. Must call `streamActorStates()` BEFORE `actor.send({ type: 'START' })`.

## Snapshot (Daytona Sandbox Image)

The `snapshot/` directory defines the Docker image used as the Daytona sandbox base (`vibestack-workspace`):

- **Base**: `oven/bun:1-debian` (Bun runtime, not Node)
- **Pre-cached deps**: `package-base.json` — React 19, Supabase JS, PGlite, Vite 7, Tailwind v4, Radix UI, etc.
- **Warmup**: Dockerfile runs `bun run dev` + `tsc --noEmit` at build time to pre-bundle Vite deps (`.vite/`) and TypeScript caches (`tsconfig.tsbuildinfo`), saving ~5-10s on first use
- **Generated apps use Vite** (not Next.js) — `bun run build` = `tsc -b && vite build`
- **PGlite** (`@electric-sql/pglite`) is included for in-sandbox SQL migration validation
- **`warmup-scaffold/`**: Minimal React+Vite app used only for cache warming, cleaned up after build (caches kept)

## Code Style

- TypeScript strict mode, no `any` unless unavoidable
- React 19 — use `use()` hook, no `forwardRef` needed
- shadcn/ui components in `src/components/ui/`
- Tailwind v4 (CSS-first config, no `tailwind.config.ts`)
- OxLint: linter (670+ rules, oxc parser, 50-100x faster than ESLint)
- Biome: formatter only (single quotes, no semicolons, trailing commas)
- Client imports use `@/` path alias (→ `src/`)
- Server code uses relative imports within `server/`
