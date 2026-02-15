# VibeStack Platform — Agent Instructions

AI-powered app builder — users describe an app, the platform generates a full Vite + Supabase project with live preview.

## Commands

```bash
bun run dev           # Vite SPA + Hono API server (concurrently)
bun run build         # Vite client build + server typecheck
bun run lint          # OxLint (670+ rules, 50-100x faster than ESLint)
bun run lint:fix      # OxLint auto-fix
bun run format        # Biome format (formatter only)
bun run test          # Vitest unit/integration tests
bun run test:e2e:mock # Playwright E2E with mock mode
bun run test:e2e:real # Playwright E2E against real services
```

## Stack

- **Client**: Vite 8 SPA, React 19, TanStack Router (file-based routing)
- **Server**: Hono API framework
- **Language**: TypeScript 5, strict mode, dual tsconfig (client + server)
- **UI**: Tailwind CSS v4, shadcn/ui (Radix), Motion
- **Auth**: Supabase Auth via `@supabase/supabase-js` (SPA localStorage tokens)
- **Database**: Drizzle ORM + Supabase (platform DB)
- **Sandbox**: Daytona SDK — sandboxed environments from snapshots
- **AI**: Mastra agent framework, OpenAI + Anthropic providers
- **Payments**: Stripe (checkout, webhooks)
- **Deployment**: Vercel (Hono via `@hono/vercel`, client via `dist/client/`)
- **Linting**: OxLint (670+ rules, oxc-based) + Biome (formatter only)
- **Testing**: Vitest (unit), Playwright (E2E)
- **Package manager**: bun

## Architecture

```
src/                     # Client SPA (Vite + TanStack Router)
  routes/                # File-based routing
  components/            # UI components (shadcn/ui in ui/)
  lib/                   # Client utilities, auth, types
server/                  # Hono API server
  routes/                # API endpoints (agent, projects, stripe, etc.)
  lib/
    db/                  # Drizzle schema, relations, queries
    agents/              # 9 Mastra agents + supervisor network
      registry.ts        # Agent + network creation
      tools.ts           # 18 Mastra tools (sandbox, GitHub, Supabase, Vercel)
      schemas.ts         # Zod schemas for agent I/O
    sandbox.ts           # Daytona sandbox lifecycle
    schema-contract.ts   # SchemaContract — single source of truth
    contract-to-sql.ts   # SchemaContract → SQL migration
    contract-to-types.ts # SchemaContract → TypeScript types
snapshot/                # Daytona sandbox Docker image (bun + Vite base)
```

### Key Patterns

- **Contract-first**: `SchemaContract` → all downstream artifacts (SQL, types, seed). Never retry LLM generation — fix the contract or generator.
- **Dual tsconfig**: `@/` → `src/` (client), `@/` → `server/` (server). Never cross-import.
- **Env vars**: Client uses `import.meta.env.VITE_*`, server uses `process.env.*`.
- **Mock mode**: `VITE_MOCK_MODE=true` bypasses auth for E2E testing.
- **Agent architecture**: 9 Mastra agents orchestrated via supervisor network. Model tiers: `gpt-4o` (orchestrator/codegen), `gpt-4o-mini` (validator).

See `CLAUDE.md` for full documentation.
