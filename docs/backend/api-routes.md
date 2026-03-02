---
title: API Routes
description: All 13 API endpoints with methods, auth, and response types
---

# API Routes

All routes are mounted under the `/api` base path in `server/index.ts`. Authentication is applied per-route via `authMiddleware` from `server/middleware/auth.ts`. Routes that bypass auth are explicitly noted.

## Endpoint Table

| Method | Path | Auth | Rate Limit | Request Body | Response | Error Codes |
|--------|------|------|-----------|-------------|----------|-------------|
| GET | `/api/health` | No | 60/min | — | `{ status, db, timestamp }` | 503 |
| POST | `/api/agent` | Yes | 5/min | `{ message, projectId, model? }` | SSE stream | 400, 401, 402, 404 |
| GET | `/api/projects` | Yes | 60/min | — | Project[] | 401 |
| POST | `/api/projects` | Yes | 60/min | `{ name, prompt? }` | Project | 400, 401, 500 |
| GET | `/api/projects/:id` | Yes | 60/min | — | Project | 401, 404 |
| GET | `/api/projects/:id/messages` | Yes | 60/min | — | ChatMessage[] | 401, 404 |
| GET | `/api/projects/:id/sandbox-urls` | Yes | 60/min | — | `{ sandboxId, previewUrl, codeServerUrl, expiresAt }` | 401, 404 |
| POST | `/api/projects/deploy` | Yes | 60/min | `{ projectId, vercelTeamId? }` | `{ success, deployUrl, projectId }` | 400, 401, 404, 500 |
| POST | `/api/stripe/checkout` | Yes | 60/min | — | `{ url }` | 400, 401, 500 |
| POST | `/api/stripe/webhook` | **No** | 60/min | Raw Stripe event | `{ received: true }` | 400, 500 |
| GET | `/api/auth/callback` | **No** | 60/min | `?code=<oauth_code>` | Redirect | — |
| GET | `/api/admin/health` | Yes (admin) | 10/min | — | `{ status, timestamp, checks }` | 401, 403, 503 |
| GET | `/api/admin/env-check` | Yes (admin) | 10/min | — | `{ status, required[], optional[] }` | 401, 403 |

### Documentation Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/doc` | No | OpenAPI 3.1 JSON spec (auto-generated from route metadata) |
| GET | `/api/reference` | No | Scalar interactive API reference UI |

## Route Details

### GET /api/health

No authentication required. Runs `SELECT 1` against PostgreSQL to verify DB connectivity.

**Success response (200)**:
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-03-01T12:00:00.000Z"
}
```

**Degraded response (503)**:
```json
{
  "status": "degraded",
  "db": "error",
  "timestamp": "2026-03-01T12:00:00.000Z"
}
```

---

### POST /api/agent

The core generation endpoint. Streams `AgentStreamEvent` SSE events while the orchestrator builds or edits the app.

**Request body**:
```typescript
{
  message: string      // User prompt or edit instruction
  projectId: string    // UUID of the project (must be owned by caller)
  model?: string       // One of ALLOWED_MODELS (default: 'gpt-5.2-codex')
}
```

**Error responses**:
- `400` — Missing `message` or `projectId`, invalid JSON, or unrecognized `model`
- `401` — Unauthenticated
- `402` — Insufficient credits (`{ error: 'insufficient_credits', credits_remaining: N }`)
- `404` — Project not found or not owned by caller

**Credit flow**: 50 credits are reserved atomically before the stream starts. After the stream ends (or errors), credits are settled to actual usage (`Math.ceil(totalTokens / 1000)`). If the client disconnects, 0 credits are charged.

**SSE Streaming format** — see section below.

---

### GET /api/projects

Returns all projects for the authenticated user, ordered by `created_at` descending.

**Response (200)**:
```json
[
  {
    "id": "uuid",
    "name": "My App",
    "description": null,
    "prompt": "Build a todo app",
    "status": "complete",
    "previewUrl": "https://...",
    "createdAt": "2026-03-01T12:00:00.000Z",
    "updatedAt": "2026-03-01T12:00:00.000Z"
  }
]
```

Note: Full project fields (`sandboxId`, `plan`, `generationState`, `githubRepoUrl`, etc.) are excluded from this response. Use `GET /api/projects/:id` for full details.

---

### POST /api/projects

Creates a new project for the authenticated user.

**Request body**:
```typescript
{
  name: string      // required
  prompt?: string   // optional initial prompt
}
```

**Success response (201)**: Full project row from Drizzle `returning()`.

**Error codes**: `400` if `name` is missing, `500` if insert fails.

---

### GET /api/projects/:id

Returns the full project row for the given ID with ownership check (`userId` must match the authenticated user).

**Response (200)**: Full project row including `sandboxId`, `plan`, `generationState`, `githubRepoUrl`, `deployUrl`, `model`.

**Error codes**: `404` if not found or not owned.

---

### GET /api/projects/:id/messages

Returns chat history for a project. Reads from Mastra memory (thread = `projectId`, resource = `userId`) first, falls back to the `chatMessages` table for legacy data.

Ownership is verified before fetching messages (prevents IDOR — the `projectId` alone is not sufficient).

**Response (200)**:
```json
[
  {
    "id": "msg-uuid",
    "role": "user",
    "type": "message",
    "parts": [{ "text": "Build a todo app" }],
    "createdAt": "2026-03-01T12:00:00.000Z"
  },
  {
    "id": "msg-uuid-2",
    "role": "assistant",
    "type": "message",
    "parts": [{ "text": "Your todo app is live! Features: ..." }],
    "createdAt": "2026-03-01T12:00:00.000Z"
  }
]
```

Mastra stores messages in its internal format 2 (`{ format: 2, parts: [...] }`). The route converts these to the `{ role, type, parts: [{ text }] }` shape the client expects.

---

### GET /api/projects/:id/sandbox-urls

Returns Daytona sandbox preview and code server URLs for the given project. Both URLs route through the Cloudflare Worker reverse proxy (`vibestack.site`) which injects Daytona auth headers.

The endpoint waits for both the dev server (port 3000) and code server (port 13337) to be ready before responding. This can take up to 30 seconds if the sandbox is cold.

**Response (200)**:
```json
{
  "sandboxId": "abc123",
  "previewUrl": "https://3000-abc123-preview.vibestack.site",
  "previewToken": "...",
  "codeServerUrl": "https://13337-abc123-preview.vibestack.site",
  "expiresAt": "2026-03-01T13:00:00.000Z"
}
```

If no sandbox is found for the project:
```json
{ "previewUrl": null, "codeServerUrl": null, "expiresAt": null }
```

**URL format**: `https://{port}-{sandboxId}-preview.{PREVIEW_PROXY_BASE}` where `PREVIEW_PROXY_BASE` defaults to `vibestack.site`.

---

### POST /api/projects/deploy

Deploys the generated app to Vercel. If the project has a `githubRepoUrl`, deploys via GitHub (preferred path). Otherwise falls back to downloading all files from the Daytona sandbox and uploading directly to Vercel.

**Request body**:
```typescript
{
  projectId: string      // UUID
  vercelTeamId?: string  // Overrides VERCEL_TEAM_ID env var
}
```

**GitHub deploy path** (when `project.githubRepoUrl` is set):
1. Fetches the GitHub repo ID via `GET https://api.github.com/repos/{owner}/{repo}`
2. Creates a Vercel project linked to the GitHub repo (`POST /v10/projects`)
3. Triggers an explicit deployment with `gitSource` (`POST /v13/deployments`)
4. Polls deployment status via `checkDeploymentStatus()` from `@vercel/client`

**File upload path** (fallback):
1. Downloads all files from `/workspace` via `downloadDirectory()`
2. Base64-encodes files and uploads to Vercel (`POST /v13/deployments`)
3. Polls for `READY` state

**Custom domain**: If `VERCEL_WILDCARD_DOMAIN` is set, assigns a subdomain alias using `buildAppSlug(project.name, projectId)` after the deployment is ready.

**Success response (200)**:
```json
{
  "success": true,
  "deployUrl": "https://my-app.vibestack.site",
  "projectId": "uuid"
}
```

---

### POST /api/stripe/checkout

Creates a Stripe Checkout session for the Pro plan subscription ($20/month, 2,000 credits). No `Content-Type` body is required — user identity comes from the auth middleware.

**Sequence**:
1. Reads `email` and `stripeCustomerId` from `profiles` via `getProfileForCheckout()`
2. Creates a Stripe customer if `stripeCustomerId` is null, then persists the new ID via `setStripeCustomerId()`
3. Creates a `subscription` mode checkout session

**Success response (200)**:
```json
{ "url": "https://checkout.stripe.com/..." }
```

The session metadata includes `supabase_user_id` for the webhook to look up the user. Redirect URLs are validated against a hardcoded allowlist — the `Origin` header is never trusted directly for redirect targets.

---

### POST /api/stripe/webhook

Receives and processes Stripe webhook events. **No `authMiddleware`** — Stripe calls this endpoint directly. Signature is verified with `stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)` before any event processing.

**Stripe-Signature header is required.** Returns `400` if missing or invalid.

**Handled events**:

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Upgrades user to `pro` plan: sets `creditsMonthly = 2000`, `creditsRemaining = 2000` |
| `customer.subscription.deleted` | Downgrades to `free`: sets `creditsMonthly = 200`, `creditsRemaining = 200`, `creditsResetAt = null` |
| `invoice.paid` | Resets `creditsRemaining` to `creditsMonthly` for the new billing period; sets `creditsResetAt` from invoice period end |
| `customer.subscription.updated` | Updates plan to `pro` if subscription is `active`, otherwise `free` |

All webhook handlers use Drizzle queries directly (bypassing Supabase RLS) via the `DATABASE_URL` connection.

**Response (200)**:
```json
{ "received": true }
```

---

### GET /api/auth/callback

Handles the OAuth code exchange after Supabase redirects the user back from the provider. **No `authMiddleware`** — the user is not authenticated yet at this point.

**Query parameters**: `?code=<oauth_authorization_code>`

Calls `supabase.auth.exchangeCodeForSession(code)`. On success, redirects to `/dashboard`. On error, redirects to `/?error=authentication_failed` (raw error messages are never reflected in the redirect URL to prevent information leakage).

Redirect target origin is validated against a hardcoded allowlist (`app.vibestack.com`, `vibestack.com`, `www.vibestack.com`). In non-production, the request origin is used. This prevents open redirect vulnerabilities.

---

### GET /api/admin/health

Comprehensive system health check. Requires authentication plus admin role. Admin role is validated by checking `c.var.user.id` against the `ADMIN_USER_IDS` env var (comma-separated UUIDs). In development with no `ADMIN_USER_IDS` set, any authenticated user is allowed.

Also triggers `cleanupExpiredRateLimits()` as housekeeping.

**Success response (200)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-01T12:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "details": "12ms latency" },
    "daytona": { "status": "ok", "details": "340ms latency" },
    "rate_limits": { "status": "ok", "details": "3 expired entries cleaned" },
    "env_vars": { "status": "ok", "details": "All 11 required vars set" }
  }
}
```

Returns `503` if any check has `status: 'error'`.

---

### GET /api/admin/env-check

Verifies all required and optional environment variables. Returns `'ok'` if all required vars are set, `'missing_required'` otherwise. Values are never exposed — only `"SET"` or `"NOT SET"` for required vars.

## SSE Streaming Format

The `POST /api/agent` response is a Server-Sent Events stream. Each event is a JSON-encoded `AgentStreamEvent` on the `data:` field:

```
data: {"type":"thinking","content":"Let me research construction dashboards..."}

data: {"type":"tool_start","tool":"webSearch","label":"Searching: construction dashboard UI"}

data: {"type":"tool_complete","tool":"webSearch","success":true,"durationMs":1200}

data: {"type":"tool_start","tool":"createSandbox","label":"Provisioning sandbox"}

data: {"type":"tool_complete","tool":"createSandbox","success":true,"durationMs":8500}

data: {"type":"sandbox_ready","sandboxId":"abc123"}

data: {"type":"tool_start","tool":"writeFile","label":"Editing src/index.css","args":{"path":"src/index.css"}}

data: {"type":"tool_complete","tool":"writeFile","success":true,"result":"src/index.css (2048 bytes)","filePath":"src/index.css","newContent":"...","durationMs":300}

data: {"type":"tool_start","tool":"runBuild","label":"Building app"}

data: {"type":"tool_complete","tool":"runBuild","success":true,"result":"Build passed","durationMs":15000}

data: {"type":"package_installed","packages":"bun add dnd-kit output..."}

data: {"type":"done","summary":"Your construction dashboard is live!","sandboxId":"abc123","tokensUsed":42000}

data: {"type":"credits_used","creditsUsed":42,"creditsRemaining":158,"tokensTotal":42000}
```

Keepalive comment frames are sent every 15 seconds to prevent proxy timeouts:
```
: keepalive
```

**AgentStreamEvent union type** (defined in `server/lib/types.ts`):

| Type | Key Fields |
|------|-----------|
| `thinking` | `content: string` |
| `tool_start` | `tool: string`, `label?: string`, `args?: Record<string, unknown>` |
| `tool_complete` | `tool: string`, `success: boolean`, `result?: string`, `filePath?: string`, `oldContent?: string`, `newContent?: string`, `durationMs?: number` |
| `done` | `summary: string`, `sandboxId?: string`, `tokensUsed?: number` |
| `agent_error` | `message: string` |
| `sandbox_ready` | `sandboxId: string` |
| `package_installed` | `packages: string` |
| `credits_used` | `creditsUsed: number`, `creditsRemaining: number`, `tokensTotal: number` |

`tool_complete` for `writeFile` and `editFile` includes `oldContent` and `newContent` for diff rendering in the client UI. The route handler strips full file content from `tool_start` args (only `path` and `sandboxId` are sent) to avoid duplicating large files in the stream.

## Rate Limiting Rules

Rate limiting is applied at the Hono middleware level using a PostgreSQL-backed sliding window counter (`rate_limit_hits` table).

| Endpoint | Window | Max Requests | Key |
|----------|--------|-------------|-----|
| `/api/agent` | 60 seconds | 5 | User ID (authenticated) or IP |
| `/api/admin/*` | 60 seconds | 10 | User ID or IP |
| `/api/*` (all others) | 60 seconds | 60 | User ID (authenticated) or IP |

**Key selection**: If the user is authenticated (i.e., `authMiddleware` has already set `c.var.user`), the key uses the user UUID. For unauthenticated requests (webhook, auth callback), it falls back to the `X-Forwarded-For` IP.

**Fail behavior**:
- `/api/agent` and `/api/stripe`: fail **closed** if the DB is unavailable — returns `503`
- All other paths: fail **open** — allows the request through

**Rate limit response (429)**:
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please try again in 60 seconds.",
  "retryAfter": 60
}
```

**Rate limit headers** (set on every response):
- `X-RateLimit-Limit`: configured max
- `X-RateLimit-Remaining`: hits remaining in window
- `X-RateLimit-Reset`: Unix timestamp of window reset
- `Retry-After`: seconds until retry (only on 429)
