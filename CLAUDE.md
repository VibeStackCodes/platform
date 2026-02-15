# VibeStack Platform

AI-powered app builder — users describe an app, the platform generates a full Next.js + Supabase project with live preview.

## Commands

```bash
pnpm dev              # Next.js dev server on :3000
pnpm build            # Production build (matches Vercel)
pnpm lint             # OxLint (670+ rules, replaces ESLint)
pnpm test             # Vitest unit/integration tests
pnpm test:e2e:mock    # Playwright E2E with mock mode (no external services)
pnpm test:e2e:real    # Playwright E2E against real Supabase/Daytona
```

## Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Language**: TypeScript 5, strict mode
- **UI**: Tailwind CSS v4, shadcn/ui (Radix), Motion (framer-motion successor)
- **Auth**: Supabase Auth via `@supabase/ssr` middleware
- **Database**: Supabase (platform DB) + Supabase Management API (generated app DBs)
- **Sandbox**: Daytona SDK — sandboxed environments from snapshots
- **AI**: Vercel AI SDK v6 (`ai` package), Anthropic + OpenAI providers
- **Payments**: Stripe (checkout, webhooks)
- **Deployment**: Vercel (generated apps deployed via `@vercel/client`)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Package manager**: pnpm

## Architecture

### Directory Structure

```
app/
  api/
    agent/         # Mastra agent pipeline endpoint (SSE, credit-gated)
    projects/      # Project CRUD, deploy, sandbox-urls
    stripe/        # Stripe webhooks
    supabase-proxy/ # Proxies queries to generated app's Supabase
  auth/            # Auth callback routes
  dashboard/       # User's project list
  project/[id]/    # Builder UI (chat + preview + DB manager)
components/
  ui/              # shadcn/ui primitives
  supabase-manager/ # Database browser/editor for generated apps
  builder-chat.tsx  # Chat panel in builder
  builder-preview.tsx # Live preview iframe
lib/
  agents/
    registry.ts      # 9 agents + supervisor network (Mastra)
    tools.ts         # 18 Mastra tools (sandbox, GitHub, Supabase, Vercel)
    schemas.ts       # Zod schemas for agent inputs/outputs
    index.ts         # Barrel exports
  sandbox.ts         # Daytona sandbox lifecycle (create, get, destroy)
  schema-contract.ts # SchemaContract type — single source of truth
  contract-to-sql.ts # SchemaContract → deterministic SQL migration
  contract-to-types.ts # SchemaContract → TypeScript types
  contract-to-drizzle.ts # SchemaContract → Drizzle ORM schema
  github.ts          # GitHub App integration (create repo, push)
  supabase-mgmt.ts   # Supabase Management API (create project, run migration)
  local-supabase.ts  # PGlite-based local SQL validation
  sse.ts             # SSE stream helper
  types.ts           # Shared types (StreamEvent, Plan, Project, etc.)
supabase/migrations/ # Platform DB migrations
snapshot/            # Daytona sandbox Docker image (Vite + React base)
```

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
- **Single-flow frontend**: All AI calls go through `/api/agent` (SSE). `/api/chat` has been removed.
- **SSE streaming**: Agent route streams progress events to client via `lib/sse.ts`.
- **Mock mode**: `NEXT_PUBLIC_MOCK_MODE=true` bypasses auth middleware and Supabase queries for E2E testing.
- **Path alias**: `@/*` maps to project root.

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Platform Supabase instance |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Platform Supabase anon key |
| `DATABASE_URL` | PostgreSQL connection string (Supabase pooler URL for Mastra agent memory) |
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
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe client key |
| `HELICONE_API_KEY` | Helicone LLM proxy (observability + per-user tracking) |

## Testing

### Unit Tests (Vitest)

- Config: `vitest.config.ts`, environment: `happy-dom`
- Tests in `tests/` directory, setup file: `tests/setup.ts`
- Run: `pnpm test` or `pnpm test:ui`

### E2E Tests (Playwright)

- Config: `playwright.config.ts`
- Two projects: `mock` (uses mock mode) and `real` (hits real services)
- Mock E2E: `pnpm test:e2e:mock` — builds app with `NEXT_PUBLIC_MOCK_MODE=true`
- Real E2E: `pnpm test:e2e:real` — requires all env vars set
- Sequential (not parallel) — tests share auth state
- Global setup: `e2e/global-setup.ts`

## Branch Merge Protocol (NON-NEGOTIABLE)

When merging a feature branch (especially from a worktree), **always verify the merged result before committing**:

```bash
# 1. Merge without committing
git merge --no-commit feature/branch-name

# 2. Install deps (package.json may have changed)
pnpm install

# 3. Verify the MERGED code compiles
npx tsc --noEmit

# 4. Run the FULL test suite (not just branch tests)
pnpm test

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

- **PGlite validation** requires AUTH_STUBS with `authenticated`, `anon`, and `service_role` roles — omitting these causes migration validation to fail silently.
- **Daytona sandbox polling** uses a 20s window (10x2s) — shorter windows cause duplicate sandbox creation from race conditions.
- **Verifier** runs `bun run build` (not `npm run build`) — must match Vercel build command in generated projects.
- **Preview URL** comes from Supabase realtime subscription on `projects` table, NOT from SSE events.
- **`d.list()` vs `d.get(id)`**: Daytona's `list()` returns lightweight objects without `process.executeCommand()`. Always use `get(id)` for full sandbox operations.
- **Signed preview URLs** from Daytona expire in 1 hour.
- **No `SUPABASE_SERVICE_ROLE_KEY`** in platform env — use Management API for DB queries against generated apps.
- **Credit deduction** happens post-execution (not pre-execution). In-flight generations always complete even if credits go negative.
- **Helicone fallback**: When `HELICONE_API_KEY` is unset, LLM calls go directly to OpenAI (no observability).

## Snapshot (Daytona Sandbox Image)

The `snapshot/` directory defines the Docker image used as the Daytona sandbox base (`vibestack-workspace`):

- **Base**: `oven/bun:1-debian` (Bun runtime, not Node)
- **Pre-cached deps**: `package-base.json` — React 19, Supabase JS, PGlite, Vite 7, Tailwind v4, Radix UI, etc.
- **Warmup**: Dockerfile runs `bun run dev` + `tsc --noEmit` at build time to pre-bundle Vite deps (`.vite/`) and TypeScript caches (`tsconfig.tsbuildinfo`), saving ~5-10s on first use
- **Generated apps use Vite** (not Next.js) — `bun run build` = `tsc -b && vite build`
- **PGlite** (`@electric-sql/pglite`) is included for in-sandbox SQL migration validation
- **`warmup-scaffold/`**: Minimal React+Vite app used only for cache warming, cleaned up after build (caches kept)

Key detail: the platform itself is Next.js, but **generated apps are Vite + React** running inside Daytona sandboxes.

## Code Style

- TypeScript strict mode, no `any` unless unavoidable
- React 19 — use `use()` hook, no `forwardRef` needed
- shadcn/ui components in `components/ui/`
- Tailwind v4 (CSS-first config, no `tailwind.config.ts`)
- OxLint: replaces ESLint (670+ rules, 50-100x faster)
- Imports use `@/` path alias
