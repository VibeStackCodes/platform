# Backend Isolation & Documentation — Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Mastra Studio verification, Scalar API docs, Hono RPC type-safe client, and full backend test coverage.

**Architecture:** Four parallel workstreams: (1) Verify Mastra Studio boots and document usage, (2) Add `hono-openapi` + `@scalar/hono-api-reference` for interactive API docs, (3) Set up Hono RPC type exports + client, (4) Write tests for all 10 untested backend modules.

**Tech Stack:** Mastra CLI, `@scalar/hono-api-reference`, `hono-openapi`, `hono/client` (built-in), Vitest, Zod

---

## Workstream A: Mastra Studio

### Task A1: Verify Mastra Studio boots

**Files:**
- Read: `src/mastra/index.ts`
- Read: `server/lib/agents/mastra.ts`
- Create: `docs/backend/mastra-studio.md`

**Steps:**
1. Run `bunx mastra dev` from project root — confirm it starts on `localhost:4111`
2. Verify agent playground loads at `http://localhost:4111/`
3. Verify Swagger UI loads at `http://localhost:4111/swagger-ui`
4. Document findings in `docs/backend/mastra-studio.md` with usage instructions

---

## Workstream B: Scalar + OpenAPI

### Task B1: Install packages

```bash
bun add hono-openapi @scalar/hono-api-reference
```

### Task B2: Add OpenAPI metadata to routes

**Files:**
- Modify: `server/routes/projects.ts` — add `describeRoute()` middleware
- Modify: `server/routes/admin.ts` — add `describeRoute()` middleware
- Modify: `server/routes/agent.ts` — add `describeRoute()` middleware
- Modify: `server/routes/stripe-checkout.ts` — add `describeRoute()` middleware
- Modify: `server/routes/sandbox-urls.ts` — add `describeRoute()` middleware
- Modify: `server/routes/auth-callback.ts` — add `describeRoute()` middleware
- Modify: `server/routes/projects-deploy.ts` — add `describeRoute()` middleware

Pattern for each route:
```typescript
import { describeRoute } from 'hono-openapi'

app.get(
  '/',
  describeRoute({
    summary: 'List user projects',
    tags: ['projects'],
    responses: { 200: { description: 'Project list' } },
  }),
  existingHandler
)
```

### Task B3: Mount OpenAPI spec + Scalar UI

**Files:**
- Modify: `server/index.ts` — add `/api/doc` (OpenAPI JSON) + `/api/reference` (Scalar UI)

```typescript
import { Scalar } from '@scalar/hono-api-reference'
import { openAPIRouteHandler } from 'hono-openapi'

app.get('/doc', openAPIRouteHandler({
  documentation: {
    info: { title: 'VibeStack API', version: '1.0.0' },
    servers: [{ url: '/api' }],
  },
}))
app.get('/reference', Scalar({ url: '/api/doc' }))
```

---

## Workstream C: Hono RPC

### Task C1: Export route types from server

**Files:**
- Modify: `server/index.ts` — export `AppType` from chained route composition
- Modify: each route file — ensure method-chaining on Hono instance for type inference

### Task C2: Create typed client

**Files:**
- Create: `src/lib/api-client.ts`

```typescript
import { hc } from 'hono/client'
import type { AppType } from '../../server'

export const api = hc<AppType>('/')
```

---

## Workstream D: Test Coverage (10 files)

### Task D1: `tests/auth-callback.test.ts`
Source: `server/routes/auth-callback.ts`
- Valid code → redirects to `/dashboard`
- Missing code → redirects to `/dashboard`
- Missing Supabase env → `error=server_misconfigured`
- Failed exchange → `error=authentication_failed`
- Disallowed origin in prod → uses first allowed origin

### Task D2: `tests/projects-deploy.test.ts`
Source: `server/routes/projects-deploy.ts`
- Valid deployment with GitHub repo
- Valid deployment without repo (file download fallback)
- Missing projectId → 400
- Project not found → 404
- Deployment timeout → error

### Task D3: `tests/github.test.ts`
Source: `server/lib/github.ts`
- createRepo success
- createRepo name collision → retries with suffix
- getInstallationToken returns token
- buildRepoName format
- pushFilesViaAPI calls 4 API methods in order

### Task D4: `tests/sandbox.test.ts`
Source: `server/lib/sandbox.ts`
- buildProxyUrl format
- createSandbox from snapshot
- findSandboxByProject returns match or null
- runCommand with existing session → reuses
- uploadFile string + Buffer
- getPreviewUrl returns URL/token/expiry
- downloadDirectory excludes patterns

### Task D5: `tests/db-queries.test.ts`
Source: `server/lib/db/queries.ts`
- getUserProjects ordered by createdAt desc
- getProject owner match → returns, no match → null
- updateProject sets updatedAt
- createProject returns row
- insertChatMessage duplicate → silent
- getProjectWithMessages includes relation

### Task D6: `tests/memory.test.ts`
Source: `server/lib/agents/memory.ts`
- workingMemorySchema validates correctly
- SafeMemory.recall strips reasoning parts
- Non-JSON content → returned unchanged
- All reasoning → message filtered out

### Task D7: `tests/sse.test.ts`
Source: `server/lib/sse.ts`
- createSSEStream emits formatted SSE events
- Keepalive comments every 15s
- Client disconnect → aborts signal
- Multiple events sent in order

### Task D8: `tests/env.test.ts`
Source: `server/lib/env.ts`
- Missing required var in prod → throws
- Missing required var in dev → logs only
- VITEST=true → skips validation
- Valid env → no error

### Task D9: `tests/slug.test.ts`
Source: `server/lib/slug.ts`
- Normal case → `{slug}-{shortId}`
- Special chars → removed
- UUID hyphens → stripped, first 12 chars

### Task D10: `tests/fetch.test.ts`
Source: `server/lib/fetch.ts`
- Success → returns Response
- Timeout → throws AbortError
- Custom timeout → uses custom value
- Headers/body preserved

---

## Workstream E: Backend Documentation

### Task E1: Write architecture docs

**Files:**
- Create: `docs/backend/architecture.md` — system overview, request lifecycle, module graph
- Create: `docs/backend/agents.md` — orchestrator reference, 11 tools, memory schema
- Create: `docs/backend/api-routes.md` — all endpoints with method/path/auth/types
- Create: `docs/backend/data-model.md` — Drizzle schema, relationships, credit flow
- Create: `docs/backend/infrastructure.md` — sandbox, GitHub, Stripe, rate limiting, SSE
