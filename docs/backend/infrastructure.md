---
title: Infrastructure
description: Sandbox lifecycle, GitHub integration, Stripe billing, rate limiting, and SSE
---

# Infrastructure

## Daytona Sandbox

**File**: `server/lib/sandbox.ts`

Daytona provides isolated cloud development environments ("sandboxes") running a pre-built Docker image. Each generated app lives in its own sandbox at `/workspace`.

### SDK Import

```typescript
import { Daytona, type Sandbox } from '@daytonaio/sdk'
```

The package is `@daytonaio/sdk` (not `@daytona/sdk`). This is a common mistake — use the `@daytonaio` scope.

### Singleton Client

```typescript
export function getDaytonaClient(): Daytona {
  if (!daytonaClient) {
    daytonaClient = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: 'https://app.daytona.io/api',
      _experimental: {},
    })
  }
  return daytonaClient
}
```

`DAYTONA_API_KEY` is required. The client is a module-level singleton to avoid re-creating it on every request.

### Sandbox Creation

```typescript
export async function createSandbox(config: SandboxConfig = {}): Promise<Sandbox>

interface SandboxConfig {
  language?: 'typescript' | 'javascript' | 'python'
  envVars?: Record<string, string>
  autoStopInterval?: number   // minutes; default 60
  labels?: Record<string, string>
}
```

```typescript
const sandbox = await daytona.create(
  {
    language: 'typescript',
    envVars: {},
    autoStopInterval: 60,
    labels: {},
    ephemeral: false,
    public: true,              // required for preview URLs
    snapshot: process.env.DAYTONA_SNAPSHOT_ID,
  },
  { timeout: 60 },             // 60 second creation timeout
)
```

`DAYTONA_SNAPSHOT_ID` must be set. The snapshot is a pre-built Docker image (`vibestack-workspace`) containing:
- `oven/bun:1-debian` base
- React 19 scaffold cloned from `VibeStackCodes/vibestack-template`
- 49 shadcn/ui components pre-installed
- OpenVSCode Server on port 13337
- Vite dev server configuration
- Pre-bundled Vite dep cache (`.vite/`)

### Getting a Sandbox by ID

```typescript
export async function getSandbox(sandboxId: string): Promise<Sandbox>
```

Always use `daytona.get(id)` — not `daytona.list()`. The `list()` method returns lightweight objects without `process.executeCommand()` or `fs` methods attached.

### Finding a Sandbox by Project Label

```typescript
export async function findSandboxByProject(projectId: string): Promise<Sandbox | null>
```

Calls `daytona.list({ project: projectId }, 1, 1)` then calls `daytona.get(items[0].id)` to get the full sandbox object. Used by `GET /api/projects/:id/sandbox-urls`.

### File Operations

```typescript
// Single file upload (Buffer or string content)
export async function uploadFile(
  sandbox: Sandbox,
  content: string | Buffer,
  remotePath: string,
): Promise<void>

// Batch upload (parallel)
export async function uploadFiles(
  sandbox: Sandbox,
  files: Array<{ content: string | Buffer; path: string }>,
): Promise<void>

// Download single file
export async function downloadFile(sandbox: Sandbox, remotePath: string): Promise<Buffer>

// Download entire directory (parallel, 60s timeout)
export async function downloadDirectory(
  sandbox: Sandbox,
  remotePath?: string,   // default: /workspace
): Promise<Array<{ path: string; content: Buffer }>>
```

`downloadDirectory()` excludes `node_modules`, `.next`, and `.git` via `find -type f ! -path ...`. It races against a 60-second timeout to prevent indefinite blocking during Vercel deployments.

### Command Execution

Two execution paths exist:

**Simple execution** (via tools):
```typescript
await sandbox.process.executeCommand(command, cwd, undefined, timeoutSeconds)
// Returns: { exitCode: number, result: string }
```

**Session-based execution** (for background processes):
```typescript
export async function runCommand(
  sandbox: Sandbox,
  command: string,
  sessionId: string,
  options: { cwd?: string; env?: Record<string, string>; async?: boolean; timeout?: number },
): Promise<CommandResult>
```

Session-based execution creates a persistent session (`sandbox.process.createSession(sessionId)`) then runs commands within it via `sandbox.process.executeSessionCommand()`. This is required for background servers that need to outlive a single command invocation.

### Preview URLs

```typescript
export async function getPreviewUrl(
  sandbox: Sandbox,
  port: number = 3000,
): Promise<PreviewUrlResult>

interface PreviewUrlResult {
  url: string       // Daytona's native preview URL
  token: string     // auth token for the preview
  port: number
  expiresAt: Date   // ~1 hour from now
}
```

Uses `sandbox.getPreviewLink(port)` — **not** `sandbox.getSignedPreviewUrl()`. Signed URLs redirect through Daytona's auth0 login page which sets `X-Frame-Options: DENY`, blocking iframe embedding in the builder UI.

### Reverse Proxy URL Construction

All preview URLs served to clients use the Cloudflare Worker proxy, not Daytona's native URLs:

```typescript
export function buildProxyUrl(sandboxId: string, port: number): string {
  const base = process.env.PREVIEW_PROXY_BASE ?? 'vibestack.site'
  return `https://${port}-${sandboxId}-preview.${base}`
}
```

Format: `https://{port}-{sandboxId}-preview.vibestack.site`

The Worker resolves the Daytona target, injects `X-Daytona-Preview-Token` and `X-Daytona-Skip-Preview-Warning` headers, and proxies HTTP and WebSocket (Vite HMR) transparently.

### Dev Server Readiness

```typescript
export async function waitForDevServer(sandbox: Sandbox): Promise<{ url: string }>
export async function waitForCodeServer(sandbox: Sandbox, maxAttempts?: number): Promise<void>
```

Both poll their respective port with `curl` (1-second intervals, up to 30 attempts for dev server, 15 for code server). The health check is `curl -f -s -o /dev/null -w "%{http_code}"` — success is any valid 3-digit HTTP code (`/^[1-5]\d{2}$/`).

### GitHub Push from Sandbox

```typescript
export async function pushToGitHub(
  sandbox: Sandbox,
  cloneUrl: string,
  token: string,
  workDir?: string,   // default: /workspace
): Promise<void>
```

Sets the `origin` remote and uses Daytona's native `sandbox.git.push(workDir, 'x-access-token', token)`. This is only used in the Vercel deploy route. The agent's `commitAndPush` tool handles its own git operations via shell commands.

---

## GitHub Integration

**File**: `server/lib/github.ts`

GitHub repos are created in the `VibeStackCodes-Generated` org (configurable via `GITHUB_ORG` env var) using a GitHub App installation token.

### Authentication

```typescript
function getOctokit(): Octokit {
  octokitInstance = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      installationId: Number(process.env.GITHUB_APP_INSTALLATION_ID),
    },
  })
  return octokitInstance
}
```

Octokit handles JWT signing and installation token caching internally. Three env vars are required: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`.

### Creating a Repository

```typescript
export async function createRepo(name: string): Promise<{
  cloneUrl: string
  htmlUrl: string
  repoName: string
}>
```

Creates a public repo in `GITHUB_ORG` with `auto_init: true` (creates an initial commit so `refs/heads/main` exists). If the name is taken (HTTP 422), retries up to 3 times with a random 4-character hex suffix appended.

### Getting an Installation Token

```typescript
export async function getInstallationToken(): Promise<string>
```

Returns a short-lived installation access token. Used by the agent's `commitAndPush` tool to authenticate git push operations. Tokens expire in ~1 hour.

### Repo Naming

```typescript
export function buildRepoName(_appName: string, projectId: string): string {
  return `vibestack-${projectId}`
}
```

Repo names are based on the `sandboxId` (passed as `projectId` in the tool). UUIDs guarantee uniqueness.

### Pushing Files via Git Data API

```typescript
export async function pushFilesViaAPI(
  files: Array<{ path: string; content: string }>,
  owner: string,
  repo: string,
): Promise<void>
```

4-step process that bypasses sandbox git entirely:

```
1. GET /repos/{owner}/{repo}/branches/main  → baseSha (auto-init commit)
2. POST /repos/{owner}/{repo}/git/trees     → new tree SHA (layered on base tree)
3. POST /repos/{owner}/{repo}/git/commits   → new commit SHA (parent: baseSha)
4. PATCH /repos/{owner}/{repo}/git/refs/heads/main → move HEAD to new commit
```

This approach avoids network timeout risk and token wrangling in sandbox git. Used when content is already downloaded to server memory.

---

## Stripe Payment Flow

**Files**: `server/routes/stripe-checkout.ts`, `server/routes/stripe-webhook.ts`, `server/lib/db/queries.ts`

The payment flow uses Stripe Checkout for subscription creation and webhook events for lifecycle management.

### Checkout Session Creation

```
POST /api/stripe/checkout
    │
    ├─ getProfileForCheckout(userId)
    │   → { email, stripeCustomerId }
    │
    ├─ if !stripeCustomerId:
    │   stripe.customers.create({ email, metadata: { supabase_user_id } })
    │   setStripeCustomerId(userId, customer.id)
    │
    ├─ stripe.checkout.sessions.create({
    │     customer: customerId,
    │     mode: 'subscription',
    │     line_items: [{
    │       price_data: {
    │         currency: 'usd',
    │         product_data: { name: 'VibeStack Pro' },
    │         unit_amount: 2000,    // $20.00
    │         recurring: { interval: 'month' },
    │       },
    │       quantity: 1,
    │     }],
    │     metadata: { supabase_user_id: userId },
    │     success_url, cancel_url,
    │   })
    │
    └─ return { url: session.url }  → client redirects browser to Stripe Checkout
```

Stripe API version: `'2026-01-28.clover'`

The session `metadata.supabase_user_id` is how the webhook handler maps a Stripe payment back to a Supabase user. This is set at both the customer level and the checkout session level.

### Webhook Event Flow

```
POST /api/stripe/webhook (no auth)
    │
    ├─ Verify: stripe.webhooks.constructEvent(body, stripe-signature, STRIPE_WEBHOOK_SECRET)
    │   → 400 if missing or invalid
    │
    └─ switch(event.type):
       │
       ├─ checkout.session.completed
       │   metadata.supabase_user_id → updateProfilePlan(userId, 'pro', 2000, 2000)
       │
       ├─ customer.subscription.deleted
       │   customer → getProfileByStripeId(customerId) → updateProfileByStripeId({
       │     plan: 'free', creditsMonthly: 200, creditsRemaining: 200, creditsResetAt: null
       │   })
       │
       ├─ invoice.paid
       │   (only subscription renewals, not initial payment)
       │   customer → getProfileByStripeId(customerId) → updateProfileByStripeId({
       │     creditsRemaining: profile.creditsMonthly,
       │     creditsResetAt: new Date(invoice.lines.data[0].period.end * 1000),
       │   })
       │
       └─ customer.subscription.updated
           customer → getProfileByStripeId(customerId) → updateProfileByStripeId({
             plan: subscription.status === 'active' ? 'pro' : 'free',
           })
```

All webhook DB updates use Drizzle directly via `DATABASE_URL` connection — they bypass Supabase RLS which requires a user JWT context.

---

## Rate Limiting Architecture

**File**: `server/lib/rate-limit.ts`

### Why Database-Backed

Vercel serverless functions are stateless — each cold start has a fresh process. An in-memory `Map` would be empty on every cold start. The DB-backed implementation uses PostgreSQL as a distributed counter that persists across instances and cold starts.

### Implementation

```typescript
export function createRateLimiter(config: RateLimitConfig)

interface RateLimitConfig {
  windowMs: number    // sliding window duration in ms
  max: number         // max requests per window
  prefix?: string     // key namespace (default: 'default')
}
```

Per request, two SQL queries run:

```sql
-- Query 1: Count hits in current window
SELECT COUNT(*)::int as cnt
FROM rate_limit_hits
WHERE key = $1
AND created_at > $2::timestamptz

-- Query 2: Insert this hit (only runs if under limit)
INSERT INTO rate_limit_hits (key, created_at, expires_at)
VALUES ($1, NOW(), NOW() + make_interval(secs => $2))
```

**Key format**: `{prefix}:{userId_or_ip}`

- If `authMiddleware` has already run and set `c.var.user`, the key uses `user.id` (UUID)
- Otherwise falls back to `X-Forwarded-For` first IP, then `'anonymous'`

### Fail Behavior

```typescript
catch (error) {
  const criticalPaths = ['/api/agent', '/api/stripe']
  const isCritical = criticalPaths.some(p => c.req.path.startsWith(p))
  if (isCritical) {
    // Fail closed: protect LLM and payment endpoints
    return c.json({ error: 'Service temporarily unavailable' }, 503)
  }
  // Non-critical: fail open (allow request through)
  return next()
}
```

This asymmetric behavior prevents DB failures from completely blocking the API while still protecting the expensive LLM endpoint.

### Cleanup

```typescript
export async function cleanupExpiredRateLimits(): Promise<number>
```

Deletes rows where `expires_at < NOW()`. Called from `GET /api/admin/health` as housekeeping. Returns the count of deleted rows.

---

## SSE Streaming Implementation

**File**: `server/lib/sse.ts`

### createSSEStream

```typescript
export function createSSEStream<T = StreamEvent>(
  handler: (emit: (event: T) => void, signal: AbortSignal) => Promise<void>,
): Response
```

Returns a `Response` with `Content-Type: text/event-stream` and a `ReadableStream` body. The handler receives:
- `emit(event)` — sends `data: ${JSON.stringify(event)}\n\n` to the client
- `signal` — an `AbortSignal` that fires when the client disconnects (stream cancel)

### Keepalive

Every 15 seconds, a comment frame is sent to prevent proxy/server idle timeouts:

```
: keepalive
```

The `Bun.serve({ idleTimeout: 255 })` setting ensures Bun itself does not close the connection during the keepalive intervals. 255 seconds is the maximum Bun allows.

### Client Disconnect

When the client closes the connection, `ReadableStream.cancel()` is called, which triggers `abortController.abort()`. The `signal` in the handler then fires. The agent route handler checks `signal.aborted` in its stream processing loop and settles credits with 0 usage on disconnect.

### Response Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

---

## Relace Instant Apply Integration

**File**: `server/lib/relace.ts`

Relace is an external API that merges code edit snippets into full files. The agent uses `// ... keep existing code` markers in edit snippets to avoid rewriting entire files, then Relace reconstructs the full file.

### API Details

- **Endpoint**: `POST https://instantapply.endpoint.relace.run/v1/code/apply`
- **Model**: `relace-apply-3`
- **Auth**: `Authorization: Bearer {RELACE_API_KEY}`
- **Pricing**: ~$0.85/1M input tokens, ~$1.25/1M output tokens
- **Speed**: ~10,000 tokens/second

### Types

```typescript
export interface RelaceInput {
  initialCode: string    // current full file content
  editSnippet: string    // abbreviated snippet with keep-existing markers
  instruction?: string   // optional natural language instruction for the merge
}

export interface RelaceUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface RelaceResult {
  mergedCode: string   // merged full file
  usage: RelaceUsage
}
```

### applyEdit

```typescript
export async function applyEdit(input: RelaceInput): Promise<RelaceResult>
```

Sends `{ model, initial_code, edit_snippet, stream: false, instruction? }` to the Relace API. Throws on non-2xx responses with the full response body in the error message.

### How the editFile Tool Uses It

1. `sandbox.fs.downloadFile(fullPath)` — reads current file content
2. `applyEdit({ initialCode, editSnippet, instruction })` — merges changes
3. `sandbox.fs.uploadFile(Buffer.from(result.mergedCode), fullPath)` — writes back

The agent provides an `editSnippet` like:
```typescript
// src/components/Header.tsx
import { Button } from '@/components/ui/button'

export function Header() {
  // ... keep existing code
  return (
    <header className="bg-slate-900 text-white p-4">
      {/* ... keep existing code */}
      <Button variant="outline">New Button</Button>
    </header>
  )
}
```

Relace reconstructs the full file from the snippet and the current content. This is faster and cheaper than the agent rewriting the entire file (especially for large files).

`RELACE_API_KEY` is required — the `editFile` tool throws immediately if the key is absent.
