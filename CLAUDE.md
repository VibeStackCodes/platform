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
    chat/          # AI chat endpoint (streaming)
    projects/      # Project CRUD + generate route (SSE pipeline)
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
  sandbox.ts        # Daytona sandbox lifecycle (create, get, destroy)
  template-pipeline.ts # Orchestrates scaffold → features → verify
  schema-contract.ts   # SchemaContract type — single source of truth
  contract-to-sql.ts   # SchemaContract → deterministic SQL migration
  contract-to-types.ts # SchemaContract → TypeScript types
  generator.ts         # AI code generation (features, pages, components)
  verifier.ts          # Runs `bun run build` in sandbox to validate
  github.ts            # GitHub App integration (create repo, push)
  seed-remote.ts       # Seeds generated DB via @snaplet/seed
  local-supabase.ts    # PGlite-based local SQL validation
templates/             # Handlebars templates for generated app scaffolds
  scaffold/            # Base app structure
  auth/ crud/ dashboard/ messaging/ realtime/  # Feature templates
supabase/migrations/   # Platform DB migrations
```

### Generation Pipeline

1. **Chat route** → user describes app → AI extracts requirements
2. **Generate route** (SSE) → orchestrates full pipeline:
   - `SchemaContract` created from requirements (contract-first)
   - `contract-to-sql.ts` generates deterministic SQL migration
   - `local-supabase.ts` validates SQL via PGlite (one-shot, no retry)
   - Scaffold templates applied in Daytona sandbox
   - Feature templates injected per feature classification
   - `verifier.ts` runs `bun run build` in sandbox
   - GitHub push → Vercel deploy → Supabase DB provisioned
3. **Preview** delivered via `BuilderPreview` subscribing to Supabase realtime on `projects` table

### Key Patterns

- **Contract-first**: `SchemaContract` → all downstream artifacts (SQL, types, seed). Never retry LLM generation — fix the contract or generator if wrong.
- **SSE streaming**: Generate route streams progress events to client via `lib/sse.ts`.
- **Mock mode**: `NEXT_PUBLIC_MOCK_MODE=true` bypasses auth middleware and Supabase queries for E2E testing.
- **Path alias**: `@/*` maps to project root.

## Environment Variables

Required in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Platform Supabase instance |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Platform Supabase anon key |
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

## Gotchas

- **PGlite validation** requires AUTH_STUBS with `authenticated`, `anon`, and `service_role` roles — omitting these causes migration validation to fail silently.
- **Daytona sandbox polling** uses a 20s window (10x2s) — shorter windows cause duplicate sandbox creation from race conditions.
- **Verifier** runs `bun run build` (not `npm run build`) — must match Vercel build command in generated projects.
- **Preview URL** comes from Supabase realtime subscription on `projects` table, NOT from SSE events.
- **`d.list()` vs `d.get(id)`**: Daytona's `list()` returns lightweight objects without `process.executeCommand()`. Always use `get(id)` for full sandbox operations.
- **Signed preview URLs** from Daytona expire in 1 hour.
- **No `SUPABASE_SERVICE_ROLE_KEY`** in platform env — use Management API for DB queries against generated apps.

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
