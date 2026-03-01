---
title: Data Model
description: Drizzle schema, table relationships, and credit flow
---

# Data Model

The platform database uses PostgreSQL (Supabase) accessed via Drizzle ORM. Schema is defined in `server/lib/db/schema.ts`, relations in `server/lib/db/relations.ts`, and all query functions in `server/lib/db/queries.ts`.

## Database Client

**File**: `server/lib/db/client.ts`

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,                    // one connection per serverless instance
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message)
})

export const db = drizzle(pool, { schema: { ...schema, ...relations } })
```

`max: 1` is critical for Vercel serverless — prevents connection exhaustion across cold-start instances. The error listener prevents unhandled rejections from crashing the process.

## Tables

### `profiles`

Stores one row per Supabase auth user. The `id` matches Supabase's `auth.users.id`.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `uuid` | PRIMARY KEY | — |
| `email` | `text` | nullable | — |
| `plan` | `text` | NOT NULL | `'free'` |
| `stripe_customer_id` | `text` | UNIQUE, nullable | — |
| `credits_remaining` | `integer` | NOT NULL | `200` |
| `credits_monthly` | `integer` | NOT NULL | `200` |
| `credits_reset_at` | `timestamptz` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**TypeScript types**:
```typescript
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
```

**Credit semantics**:
- Free plan: 200 credits/month (~0.7 app generations at typical token usage)
- Pro plan: 2,000 credits/month (~7 app generations)
- 1 credit = 1,000 tokens

---

### `projects`

One row per user project. `user_id` cascades on delete.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` ON DELETE CASCADE | — |
| `name` | `text` | NOT NULL | — |
| `prompt` | `text` | nullable | — |
| `description` | `text` | nullable | — |
| `status` | `text` | NOT NULL | `'pending'` |
| `plan` | `jsonb` | nullable | — |
| `model` | `text` | nullable | — |
| `generation_state` | `jsonb` | nullable | `{}` |
| `sandbox_id` | `text` | nullable | — |
| `preview_url` | `text` | nullable | — |
| `code_server_url` | `text` | nullable | — |
| `deploy_url` | `text` | nullable | — |
| `github_repo_url` | `text` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

**TypeScript types**:
```typescript
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
```

**`status` values** (from `server/lib/types.ts`):
`'pending'` | `'planning'` | `'generating'` | `'verifying'` | `'complete'` | `'error'` | `'deploying'` | `'deployed'`

**`generation_state` (JSONB)** — `GenerationState` interface from `server/lib/types.ts`:
```typescript
interface GenerationState {
  blueprint?: unknown
  sandboxId?: string
  githubRepo?: string | null
  fileManifest?: Record<string, string>
  appName?: string
  appDescription?: string
  tokens?: unknown
  creativeSpec?: unknown
  generationStatus?: string
  lastEditedAt?: string
}
```

The `sandbox_id` column is updated by the agent route handler when `createSandbox` completes (via `updateProject(projectId, { sandboxId }, userId)`).

---

### `chat_messages`

Stores conversation history for a project. The `id` column is a plain `text` (not UUID) to accommodate Mastra's internal message ID format.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `text` | PRIMARY KEY | — |
| `project_id` | `uuid` | NOT NULL, FK → `projects.id` ON DELETE CASCADE | — |
| `role` | `text` | NOT NULL | — |
| `type` | `text` | NOT NULL | `'message'` |
| `parts` | `jsonb` | NOT NULL | `[]` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**TypeScript types**:
```typescript
export type ChatMessage = typeof chatMessages.$inferSelect
```

**`role`**: `'user'` | `'assistant'` | `'system'`

**`type`**: Distinguishes message kinds. Currently `'message'` for all chat messages. Legacy pipeline used this to store SSE events as typed rows.

**`parts`**: Array of content parts. Format: `[{ text: string }]` from the client's perspective. Internally Mastra stores parts in `{ format: 2, parts: [...] }` format.

**Insert is idempotent**: `insertChatMessage()` uses `ON CONFLICT DO NOTHING` on the primary key to prevent duplicate messages from retry logic.

---

### `usage_events`

Logs every LLM call for billing and analytics. Both `user_id` and `project_id` foreign keys are enforced.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `uuid` | PRIMARY KEY | `gen_random_uuid()` |
| `user_id` | `uuid` | NOT NULL, FK → `profiles.id` ON DELETE CASCADE | — |
| `project_id` | `uuid` | nullable, FK → `projects.id` ON DELETE SET NULL | — |
| `event_type` | `text` | NOT NULL | — |
| `model` | `text` | NOT NULL | `'gpt-5.2'` |
| `tokens_input` | `integer` | NOT NULL | `0` |
| `tokens_output` | `integer` | NOT NULL | `0` |
| `tokens_total` | `integer` | NOT NULL | `0` |
| `credits_used` | `integer` | NOT NULL | `0` |
| `stripe_meter_event_id` | `text` | nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

**TypeScript types**:
```typescript
export type UsageEvent = typeof usageEvents.$inferSelect
```

`project_id` uses `ON DELETE SET NULL` so deleting a project preserves usage history for billing purposes.

---

### `rate_limit_hits`

Backing store for the DB-based rate limiter. Not defined in Drizzle schema — managed directly via raw SQL.

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial/uuid | Primary key |
| `key` | `text` | Namespaced key: `{prefix}:{userId_or_ip}` |
| `created_at` | `timestamptz` | When this hit occurred |
| `expires_at` | `timestamptz` | TTL for automatic cleanup |

Expired rows are cleaned up by `cleanupExpiredRateLimits()` which is called from `GET /api/admin/health`.

## Relationships

**File**: `server/lib/db/relations.ts`

```
profiles (1) ──────── (many) projects
    │
    └──────────────── (many) usageEvents

projects (1) ────────── (many) chatMessages
    │
    └────────────────── (many) usageEvents
```

Drizzle relations:

```typescript
export const profilesRelations = relations(profiles, ({ many }) => ({
  projects: many(projects),
  usageEvents: many(usageEvents),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(profiles, { fields: [projects.userId], references: [profiles.id] }),
  chatMessages: many(chatMessages),
  usageEvents: many(usageEvents),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  project: one(projects, { fields: [chatMessages.projectId], references: [projects.id] }),
}))

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(profiles, { fields: [usageEvents.userId], references: [profiles.id] }),
  project: one(projects, { fields: [usageEvents.projectId], references: [projects.id] }),
}))
```

## Credit Flow

**File**: `server/lib/credits.ts`

The credit system uses pessimistic reservation to prevent race conditions during concurrent generations.

```
User triggers POST /api/agent
          │
          ▼
reserveCredits(userId, 50)
  ┌─ atomic SQL: UPDATE profiles
  │              SET credits_remaining = credits_remaining - 50
  │              WHERE id = ? AND credits_remaining >= 50
  │              RETURNING credits_remaining
  │
  ├─ rows.length > 0 → reserved (proceed)
  └─ rows.length === 0 → insufficient credits → 402

Agent streams and executes...
          │
          ▼
settleCredits(userId, reserved=50, actual=creditsUsed)
  diff = 50 - actual  (positive = refund, negative = additional charge)
  ┌─ atomic SQL: UPDATE profiles
  │              SET credits_remaining = GREATEST(0, credits_remaining + diff)
  │              WHERE id = ?
  │              RETURNING credits_remaining

Client disconnect / error → settleCredits(userId, 50, 0)
  (refunds the full reservation, charges 0)
```

**Key properties**:
- Both `reserveCredits()` and `settleCredits()` use raw SQL for atomicity (no Drizzle ORM abstraction)
- `GREATEST(0, ...)` in `settleCredits()` prevents negative credit balances
- In-flight generations always complete even if credits go negative during long generations (no mid-stream cancellation)
- `settled = false` flag in the route handler ensures `settleCredits()` is always called exactly once, even on exceptions

## Query Function Reference

**File**: `server/lib/db/queries.ts`

### Project Queries

```typescript
// Get all projects for a user, ordered by created_at DESC
async function getUserProjects(userId: string): Promise<Project[]>

// Get single project with ownership check (returns null if not found or not owned)
async function getProject(projectId: string, userId: string): Promise<Project | null>

// Update project fields. userId is optional — omit for server-side updates (no ownership check)
async function updateProject(
  projectId: string,
  fields: Partial<typeof projects.$inferInsert>,
  userId?: string,
): Promise<Project | null>

// Create a new project (returns the inserted row)
async function createProject(data: typeof projects.$inferInsert): Promise<Project>

// Get project with its chat messages (relational query)
async function getProjectWithMessages(
  projectId: string,
  userId: string,
): Promise<Project & { chatMessages: ChatMessage[] } | undefined>
```

### Credit / Profile Queries

```typescript
// Get credit balance and plan for a user
async function getUserCredits(userId: string): Promise<{
  creditsRemaining: number
  creditsMonthly: number
  creditsResetAt: Date | null
  plan: string
} | null>

// Get email + stripeCustomerId for checkout
async function getProfileForCheckout(userId: string): Promise<{
  email: string | null
  stripeCustomerId: string | null
} | null>

// Set stripeCustomerId on first checkout
async function setStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void>

// Update plan + credits on checkout.session.completed
async function updateProfilePlan(
  userId: string,
  plan: string,
  creditsMonthly: number,
  creditsRemaining: number,
): Promise<void>

// Find profile by Stripe customer ID (for webhook lookups)
async function getProfileByStripeId(stripeCustomerId: string): Promise<{
  id: string
  creditsMonthly: number
} | null>

// Update profile by Stripe customer ID (for webhooks)
async function updateProfileByStripeId(
  stripeCustomerId: string,
  fields: Partial<Pick<typeof profiles.$inferInsert,
    'plan' | 'creditsMonthly' | 'creditsRemaining' | 'creditsResetAt'
  >>,
): Promise<void>

// Get stripeCustomerId for Stripe meter reporting
async function getStripeCustomerId(userId: string): Promise<string | null>
```

### Chat Message Queries

```typescript
// Get all messages for a project, ordered by created_at ASC
async function getProjectMessages(projectId: string): Promise<{
  id: string
  role: string
  type: string
  parts: unknown
  createdAt: Date
}[]>

// Insert a chat message. ON CONFLICT DO NOTHING for idempotency.
// parts is always stored as an array (wraps non-arrays automatically).
async function insertChatMessage(
  id: string,
  projectId: string,
  role: string,
  parts: unknown,
  type?: string,   // default: 'message'
): Promise<ChatMessage | null>
```

### Usage Pattern Notes

- **Ownership enforcement**: `getProject(projectId, userId)` always includes the user ID filter. Never call `db.select().from(projects).where(eq(projects.id, projectId))` without the user check — this would allow IDOR attacks.
- **Relational queries**: Use `db.query.projects.findFirst({ with: { chatMessages: true } })` for eager loading. Requires the `schema` and `relations` to be passed to `drizzle()`.
- **Server-side updates**: Pass `userId = undefined` to `updateProject()` for updates made by the server (e.g., the agent route updating `sandboxId` after `createSandbox` completes) to bypass ownership scoping.
