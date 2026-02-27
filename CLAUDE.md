# VibeStack Platform

AI-powered app builder — users describe an app, the platform generates a full Vite + React project with live preview.

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

- **Client**: Vite 7 SPA, React 19, TanStack Router (file-based routing)
- **Server**: Hono API framework
- **Language**: TypeScript 5, strict mode, single tsconfig
- **UI**: Tailwind CSS v4, shadcn/ui (Radix), Motion (framer-motion successor)
- **Auth**: Supabase Auth via `@supabase/supabase-js` (SPA localStorage tokens)
- **Database**: Drizzle ORM + Supabase (platform DB)
- **Sandbox**: Daytona SDK — sandboxed environments from snapshots
- **AI**: Mastra agent framework, multi-provider LLM routing (OpenAI + Anthropic), Langfuse observability (via @mastra/langfuse)
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
    agent.ts             # Single orchestrator SSE endpoint (credit-gated)
    admin.ts             # Admin health check + env check
    projects.ts          # Project CRUD
    projects-deploy.ts   # Vercel deployment
    sandbox-urls.ts      # Sandbox preview URLs
    stripe-checkout.ts   # Stripe checkout sessions
    stripe-webhook.ts    # Stripe webhook handler
    auth-callback.ts     # OAuth code exchange
  lib/
    db/
      schema.ts          # Drizzle schema (matches Supabase migrations)
      relations.ts       # Drizzle relations
      client.ts          # Drizzle client (pg Pool)
      queries.ts         # Type-safe query functions
    agents/
      mastra.ts          # Mastra registry: PostgresStore, Memory (working memory), Langfuse observability
      orchestrator.ts    # Single Mastra agent with 11 tools + system prompt + memory
      provider.ts        # Multi-provider routing (PROVIDER_REGISTRY + MODEL_CONFIGS per role)
      tools.ts           # 11 Mastra tools (sandbox, file I/O, build, commitAndPush, web search)
    sandbox.ts           # Daytona sandbox lifecycle
    github.ts            # GitHub App integration
    relace.ts            # Relace Instant Apply API client
    credits.ts           # reserveCredits + settleCredits (pessimistic reservation)
    sse.ts               # SSE stream helper (Hono streamSSE)
    rate-limit.ts        # DB-backed rate limiter (PostgreSQL sliding window, 5/min agent, 60/min global)
    logger.ts            # Structured logger
    env.ts               # Env var validation
    fetch.ts             # Fetch utilities
    slug.ts              # Slug generation
    types.ts             # StreamEvent types (AgentStreamEvent union)
supabase/migrations/     # Platform DB migrations
snapshot/                # Daytona sandbox Docker image (scaffold + tooling)
.prototypes/             # Interactive HTML design prototypes (agentic flow UI)
docs/plans/              # Design documents and implementation plans
```

### Path Aliases

Single `tsconfig.json` covers both `src/` and `server/`:

- `@/*` → `./src/*` (client imports)
- `@server/*` → `./server/*` (used in tests)
- **Never cross-import** between client and server boundaries
- Server code uses relative imports internally

### Single Orchestrator Agent

The generation pipeline is a single Mastra `Agent` (`server/lib/agents/orchestrator.ts`). The LLM decides what to do — no state machine.

- **Entry point**: `POST /api/agent` — credit-gated, streams `AgentStreamEvent` via Hono `streamSSE()`
- **Agent**: `createOrchestrator(provider)` builds a Mastra `Agent` with 11 tools + system prompt + thread-based memory
- **Tool belt**: `createSandbox`, `writeFile`, `writeFiles`, `readFile`, `editFile`, `listFiles`, `runCommand`, `runBuild`, `installPackage`, `getPreviewUrl`, `commitAndPush`, `webSearch`
- **Memory**: Mastra `Memory` with PostgresStore — thread-based (projectId = thread, userId = resource). Working memory schema tracks sandboxId, repoUrl, buildStatus, etc.
- **Web search**: Provider-native — `openai.tools.webSearch()` for OpenAI, `anthropic.tools.webSearch_20250305()` for Anthropic
- **Relace**: `editFile` tool calls the Relace Instant Apply API (`relace.ts`) to merge code snippets into existing files
- **Build loop**: Agent writes code → calls `runBuild` → reads errors → fixes → rebuilds. Max 3 repair attempts.
- **Quality gate**: `vite build` passing is the only requirement — no type-check gate in generated apps
- **SSE events**: `AgentStreamEvent` union — `thinking`, `tool_start`, `tool_complete`, `done`, `agent_error`, `sandbox_ready`, `package_installed`, `credits_used`
- **Credits**: `reserveCredits()` before generation starts, `settleCredits()` after to adjust to actual token usage
- **Observability**: Langfuse via `@mastra/langfuse` (configured in `mastra.ts`). Traces all LLM calls + tool executions. Gated on `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`.

### Model Routing

User-selectable per generation: GPT-5.2 Codex (OpenAI), Claude Opus 4.6, Claude Sonnet 4.6. Provider routing via `PROVIDER_REGISTRY` + `MODEL_CONFIGS` in `provider.ts`. Route handler sets `selectedModel` on `RequestContext` before creating the agent. Direct provider connections (no proxy). Adding a new model = one `MODEL_CONFIGS` entry. Adding a new provider = one `PROVIDER_REGISTRY` entry + `bun add @ai-sdk/<provider>`.

### Key Patterns

- **Single-agent generation**: User prompt → `createOrchestrator(provider)` → agent calls tools in sequence. No fixed pipeline — the LLM decides order and which tools to call.
- **Scaffold-first editing**: Sandbox contains a full Lovable-style scaffold (React 19, RRD 7, Tailwind v4, 49 shadcn/ui components pre-installed). Agent edits files in-place via `editFile` / `writeFile`.
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
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API token (keep — may still be referenced) |
| `SUPABASE_ORG_ID` | Supabase org (keep — may still be referenced) |
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
| `LANGFUSE_PUBLIC_KEY` | Langfuse observability public key (optional) |
| `LANGFUSE_SECRET_KEY` | Langfuse observability secret key (optional) |
| `LANGFUSE_BASEURL` | Langfuse base URL (default: `https://cloud.langfuse.com`) |
| `RELACE_API_KEY` | Relace Instant Apply API key (used by editFile tool) |
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
- **Daytona sandbox polling** uses a 20s window (10x2s) — shorter windows cause duplicate sandbox creation from race conditions.
- **Preview URL** comes from Supabase realtime subscription on `projects` table, NOT from SSE events.
- **`d.list()` vs `d.get(id)`**: Daytona's `list()` returns lightweight objects without `process.executeCommand()`. Always use `get(id)` for full sandbox operations.
- **Signed preview URLs** from Daytona expire in 1 hour.
- **Credit deduction**: `reserveCredits()` is pessimistic — reserves upfront, then `settleCredits()` adjusts after. In-flight generations always complete even if credits go negative.
- **Langfuse observability**: Gated on `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` — when unset, no traces are exported. Configured in `server/lib/agents/mastra.ts`.
- **Sentry** is gated behind `VITE_SENTRY_DSN` / `SENTRY_DSN` — no-op when unset.
- **Bun.serve idle timeout**: Set to 255s (max) to prevent SSE connection drops during long LLM calls. Keepalive pings every 15s.
- **Rate limiter**: DB-backed (PostgreSQL sliding window) — survives Vercel cold starts. Fails open for non-critical paths, fails closed for `/api/agent` and `/api/stripe`.

## Snapshot (Daytona Sandbox Image)

The `snapshot/` directory defines the Docker image used as the Daytona sandbox base (`vibestack-workspace`):

- **Base**: `oven/bun:1-debian` (Bun runtime, not Node)
- **Template repo**: Cloned from `VibeStackCodes/vibestack-template` (not `git init`) — React 19, react-router-dom v7, Tailwind v4, 46 shadcn/ui components pre-installed. Agent edits files in-place.
- **Tooling**: OpenVSCode Server + tmux + OxLint included in the image
- **Generated apps use Vite** (not Next.js) — `bun run build` = `tsc -b && vite build`
- **TypeScript**: Loose config (`strict: false`) in scaffold — agent focuses on working code, not type perfection
- **Pre-warmed**: Dockerfile pre-bundles Vite deps (`.vite/`) and TypeScript caches at build time, saving ~5-10s on first use

## Code Style

- TypeScript strict mode, no `any` unless unavoidable
- React 19 — use `use()` hook, no `forwardRef` needed
- shadcn/ui components in `src/components/ui/`
- Tailwind v4 (CSS-first config, no `tailwind.config.ts`)
- OxLint: linter (670+ rules, oxc parser, 50-100x faster than ESLint)
- Biome: formatter only (single quotes, no semicolons, trailing commas)
- Client imports use `@/` path alias (→ `src/`)
- Server code uses relative imports within `server/`
