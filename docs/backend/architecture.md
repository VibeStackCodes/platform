---
title: Architecture
description: System overview, middleware stack, and request lifecycle
---

# Backend Architecture

## System Overview

VibeStack's backend is a Hono API server running under the `/api` base path. It runs in two modes: as a Vercel serverless function in production (via the `@hono/vercel` adapter) and as a local Bun HTTP server during development (via `Bun.serve()`). All routes are mounted once in `server/index.ts` and exported as a typed `AppType` that the client SPA imports as a type-only reference for Hono RPC inference.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client SPA (Vite)                        │
│                    src/ (React + TanStack Router)               │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / SSE  (proxied via Vite in dev)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   server/index.ts  (Hono app)                   │
│                       basePath: /api                            │
│                                                                 │
│  Middleware stack (applied in order):                           │
│  1. CORS                                                        │
│  2. Sentry  (if SENTRY_DSN is set)                              │
│  3. Secure Headers (CSP, Referrer-Policy, Permissions-Policy)   │
│  4. Body Limit  (10MB)                                          │
│  5. Rate Limiter  /agent: 5/min  |  /*: 60/min  (DB-backed)     │
│                                                                 │
│  Routes:                                                        │
│  POST   /api/agent                → agent.ts                    │
│  GET    /api/health               → inline handler              │
│  GET    /api/projects             → projects.ts                 │
│  POST   /api/projects             → projects.ts                 │
│  GET    /api/projects/:id         → projects.ts                 │
│  GET    /api/projects/:id/messages→ projects.ts                 │
│  GET    /api/projects/:id/sandbox-urls → sandbox-urls.ts        │
│  POST   /api/projects/deploy      → projects-deploy.ts          │
│  POST   /api/stripe/checkout      → stripe-checkout.ts          │
│  POST   /api/stripe/webhook       → stripe-webhook.ts           │
│  GET    /api/auth/callback        → auth-callback.ts            │
│  GET    /api/admin/health         → admin.ts                    │
│  GET    /api/admin/env-check      → admin.ts                    │
│                                                                 │
│  Meta endpoints (documentation):                                │
│  GET    /api/doc                  → OpenAPI JSON spec            │
│  GET    /api/reference            → Scalar interactive API UI    │
└────┬───────────────────────┬────────────────────────────────────┘
     │                       │
     ▼                       ▼
┌─────────┐          ┌────────────┐
│ Supabase│          │  Daytona   │
│  (auth  │          │  Sandbox   │
│ + DB)   │          │    API     │
└─────────┘          └────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│     PostgreSQL  (Drizzle ORM)           │
│   profiles, projects, chatMessages,     │
│   usageEvents, rate_limit_hits          │
└─────────────────────────────────────────┘
```

## Module Dependency Graph

```
server/index.ts
├── server/sentry.ts              (must be imported first)
├── server/lib/env.ts             (env var validation — side effect)
├── server/lib/logger.ts          (PinoLogger)
├── server/lib/db/client.ts       (Drizzle + pg Pool)
├── server/lib/rate-limit.ts      (DB-backed rate limiter)
├── server/middleware/auth.ts     (Supabase session validation)
│
├── server/routes/agent.ts
│   ├── server/lib/agents/orchestrator.ts
│   │   ├── server/lib/agents/memory.ts  (PostgresStore + SafeMemory)
│   │   ├── server/lib/agents/provider.ts
│   │   └── server/lib/agents/tools.ts
│   │       ├── server/lib/sandbox.ts    (Daytona SDK)
│   │       ├── server/lib/github.ts     (Octokit)
│   │       └── server/lib/relace.ts     (Relace Instant Apply)
│   ├── server/lib/agents/mastra.ts      (Mastra registry)
│   ├── server/lib/credits.ts
│   └── server/lib/sse.ts
│
├── server/routes/projects.ts
│   └── server/lib/db/queries.ts
│
├── server/routes/projects-deploy.ts
│   ├── server/lib/sandbox.ts
│   └── server/lib/db/queries.ts
│
├── server/routes/sandbox-urls.ts
│   └── server/lib/sandbox.ts
│
├── server/routes/stripe-checkout.ts
│   └── server/lib/db/queries.ts
│
├── server/routes/stripe-webhook.ts
│   └── server/lib/db/queries.ts
│
├── server/routes/auth-callback.ts  (no deps beyond Supabase client)
│
└── server/routes/admin.ts
    ├── server/lib/db/client.ts
    ├── server/lib/sandbox.ts
    └── server/lib/rate-limit.ts
```

## Request Lifecycle

Every request follows this sequence:

```
HTTP Request
    │
    ▼
Hono basePath('/api') — strips prefix, routes to handler
    │
    ├─ CORS middleware
    │    Checks origin against allowlist:
    │    - https://vibestack.com  (+ www + app)
    │    - https://vibestack-*.vercel.app  (regex: preview deployments)
    │    - http://localhost:3000 + :5173  (non-production only)
    │    credentials: true, maxAge: 86400
    │
    ├─ Sentry middleware  (if SENTRY_DSN is set)
    │    Wraps each request in a Sentry transaction
    │
    ├─ secureHeaders middleware
    │    Sets: Content-Security-Policy, Referrer-Policy,
    │    Permissions-Policy (geolocation=[], microphone=[], camera=[])
    │    CSP: defaultSrc 'self', connectSrc includes *.supabase.co,
    │         frameSrc includes *.daytona.io
    │
    ├─ bodyLimit  (10MB on all /api/* routes)
    │
    ├─ createRateLimiter for /agent  (5 req/min per user/IP)
    ├─ createRateLimiter for /*      (60 req/min per user/IP)
    │    Key: c.var.user?.id ?? ip (prefers authenticated user ID)
    │    Storage: rate_limit_hits PostgreSQL table
    │    Fails closed on /api/agent and /api/stripe if DB is down
    │    Fails open for all other paths
    │
    ├─ authMiddleware  (applied per-route, not globally)
    │    Reads: Authorization: Bearer <token> header
    │           OR sb-access-token cookie
    │           OR sb-<hostname>-auth-token cookie
    │    Validates: supabase.auth.getUser()
    │    Caches: 30s in-memory token cache (Map<token, {user, expiresAt}>)
    │    Sets:   c.var.user (typed as Hono ContextVariableMap)
    │    Mock:   if VITE_MOCK_MODE=true → always sets MOCK_USER
    │
    ▼
Route Handler
    │
    ▼
JSON or SSE Response
```

## OpenAPI & Interactive Docs

Two additional endpoints serve auto-generated documentation:

- **`GET /api/doc`** — Returns the OpenAPI 3.1 JSON spec, generated from `describeRoute()` metadata across all mounted routes via `hono-openapi`
- **`GET /api/reference`** — Serves the [Scalar](https://scalar.com) interactive API reference UI (theme: `deepSpace`, dark mode, with "Try it" request testing)

The `/api/reference` route uses a permissive CSP (allowing Scalar CDN scripts) that differs from the global secure headers. The `connect-src` directive includes localhost origins so the "Try it" feature works in development.

## Dual-Export Pattern

`server/index.ts` exports the application in three forms to satisfy both runtime environments:

```typescript
// 1. Type-only export for Hono RPC client inference
//    client SPA: import type { AppType } from '../../server'
export type AppType = typeof routes

// 2. Default export: Vercel serverless adapter
//    Vercel reads this as the function handler
export default handle(app)

// 3. Named export: used by Vite dev proxy (vite.config.ts)
export { app }

// 4. Bun.serve: dev server (only when NOT on Vercel)
if (typeof Bun !== 'undefined' && !process.env.VERCEL) {
  Bun.serve({ port: 8787, fetch: app.fetch, idleTimeout: 255 })
}
```

The `idleTimeout: 255` on `Bun.serve()` is the maximum allowed by Bun and prevents SSE connections from being dropped during long LLM calls (30–120s). Vercel's function timeout is managed separately via `vercel.json`.

## Middleware Stack Detail

| Order | Middleware | Scope | Purpose |
|-------|-----------|-------|---------|
| 1 | `cors()` | `*` | Origin allowlist, credentials, preflight cache |
| 2 | `sentry()` | `*` | Request tracing (gated on `SENTRY_DSN`) |
| 3 | `secureHeaders()` | `*` | CSP, referrer policy, permissions policy |
| 4 | `bodyLimit(10MB)` | `/*` | Prevent oversized payloads |
| 5 | `createRateLimiter(5/min)` | `/agent` | Tight limit on LLM endpoint |
| 6 | `createRateLimiter(60/min)` | `/*` | General API rate limit |
| 7 | `authMiddleware` | per-route | Supabase JWT validation |

Routes that bypass `authMiddleware`: `POST /api/stripe/webhook` and `GET /api/auth/callback`.

## Health Check

`GET /api/health` is an inline handler (not a route file) that runs a `SELECT 1` against PostgreSQL and returns:

```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-03-01T00:00:00.000Z"
}
```

Returns `503` with `"status": "degraded"` if the DB query fails.
