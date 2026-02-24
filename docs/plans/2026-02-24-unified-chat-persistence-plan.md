# Unified Chat Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken dual-path persistence (chatMessages table + generation_state JSONB) with a single unified conversation model where ALL events are stored as chatMessage rows.

**Architecture:** Extend the existing `chatMessages` table with a `type` discriminator column. Server persists each SSE event as an individual row (non-blocking, with retry). Client loads all events from one endpoint and partitions by type for rendering. Session state used during live SSE, then invalidated on completion.

**Tech Stack:** Drizzle ORM, PostgreSQL, Hono SSE, React + TanStack Query

**Design doc:** `docs/plans/2026-02-24-unified-chat-persistence-design.md`

---

### Task 1: Database Migration — Add `type` column to `chatMessages`

**Files:**
- Create: `supabase/migrations/20260224120000_chat_message_type.sql`
- Modify: `server/lib/db/schema.ts:40-48`

**Step 1: Write the migration SQL**

Create `supabase/migrations/20260224120000_chat_message_type.sql`:

```sql
-- Add type discriminator to chat_messages for unified conversation model
ALTER TABLE chat_messages ADD COLUMN type text NOT NULL DEFAULT 'message';

-- Index for efficient project + type queries
CREATE INDEX idx_chat_messages_project_type ON chat_messages (project_id, type);
```

**Step 2: Update Drizzle schema**

In `server/lib/db/schema.ts`, add `type` column to `chatMessages` table (after `role` on line 45):

```ts
export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  type: text('type').notNull().default('message'),
  parts: jsonb('parts').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**Step 3: Run migration against local DB**

```bash
cd /Users/ammishra/VibeStack/platform
# Apply migration via Supabase CLI or direct psql
bunx drizzle-kit generate
```

**Step 4: Verify typecheck**

```bash
bunx tsc --noEmit
```
Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/20260224120000_chat_message_type.sql server/lib/db/schema.ts
git commit -m "feat: add type column to chatMessages for unified conversation model"
```

---

### Task 2: Update Query Layer — `insertChatMessage` and `getProjectMessages`

**Files:**
- Modify: `server/lib/db/queries.ts:169-205`

**Step 1: Update `insertChatMessage` to accept `type` parameter**

In `server/lib/db/queries.ts`, replace the existing function (lines 183-195):

```ts
/** Insert a chat message/event for a project. Uses ON CONFLICT DO NOTHING for dedup safety. */
export async function insertChatMessage(
  id: string,
  projectId: string,
  role: string,
  parts: unknown,
  type = 'message',
) {
  return db
    .insert(chatMessages)
    .values({ id, projectId, role, type, parts: Array.isArray(parts) ? parts : [parts] })
    .onConflictDoNothing({ target: chatMessages.id })
    .returning()
    .then((rows) => rows[0] ?? null)
}
```

Key changes:
- `parts` type broadened from `unknown[]` to `unknown` (timeline events use objects, not arrays)
- Added `type` parameter with default `'message'`
- Added `onConflictDoNothing` for dedup safety
- Wraps non-array parts in array for consistency

**Step 2: Update `getProjectMessages` to include `type`**

Replace lines 169-181:

```ts
/** Get all conversation events for a project, ordered by created_at asc */
export async function getProjectMessages(projectId: string) {
  return db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      type: chatMessages.type,
      parts: chatMessages.parts,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.projectId, projectId))
    .orderBy(asc(chatMessages.createdAt))
}
```

**Step 3: Verify typecheck**

```bash
bunx tsc --noEmit
```
Expected: PASS (existing callers of `insertChatMessage` still work because `type` defaults to `'message'`)

**Step 4: Commit**

```bash
git add server/lib/db/queries.ts
git commit -m "feat: update query layer for unified chat persistence (type column, ON CONFLICT)"
```

---

### Task 3: Add `persistEvent` helper to agent route

**Files:**
- Modify: `server/routes/agent.ts:119-178`

**Step 1: Add `persistEvent` function**

At the top of `streamActorStates` (after the existing variable declarations on line 143), add a helper that wraps `insertChatMessage` with retry:

```ts
/** Sequence counter for deterministic event ordering within a run */
let eventSeq = 0

/** Persist an SSE event to chatMessages (non-blocking, 1 retry with 500ms delay) */
function persistEvent(type: string, parts: unknown, role = 'system') {
  if (mockMode) return
  const id = `${runId}-${type}-${eventSeq++}`
  insertChatMessage(id, projectId, role, parts, type).catch(async (err) => {
    // One retry after 500ms
    await new Promise((r) => setTimeout(r, 500))
    insertChatMessage(id, projectId, role, parts, type).catch((retryErr) => {
      log.error(`Failed to persist event ${type}: ${String(retryErr)}`, { module: 'agent', projectId })
    })
  })
}
```

Key design decisions:
- Sequential counter (`eventSeq++`) ensures unique IDs and correct chronological ordering
- Non-blocking: uses `.catch()` chain, doesn't `await`
- One retry with 500ms delay on failure
- `role` defaults to `'system'` for timeline events (user/assistant for chat messages)
- Mock mode skips persistence entirely

**Step 2: Remove the old server-side mirror arrays and flush functions**

Delete lines 138-178 (the `serverTimeline`, `serverPageProgress`, `serverFileAssembly`, `serverValidationChecks`, `serverBuildErrors`, `serverGenerationStatus`, `flushTimer`, `scheduleFlush()`, and `flushNow()` declarations).

**Step 3: Verify typecheck**

```bash
bunx tsc --noEmit
```
Expected: FAIL — references to removed variables (`serverTimeline`, `scheduleFlush`, etc.) still exist. These are fixed in Task 4.

**Step 4: Commit (WIP)**

```bash
git add server/routes/agent.ts
git commit -m "wip: add persistEvent helper, remove old flush infrastructure"
```

---

### Task 4: Wire `persistEvent` to all SSE emit sites

**Files:**
- Modify: `server/routes/agent.ts` (throughout `streamActorStates`)

This is the largest task. For each `emit()` call in `streamActorStates`, add a corresponding `persistEvent()` call. Also remove all `serverTimeline.push()`, `serverPageProgress.push()`, `serverFileAssembly.push()`, `serverValidationChecks.push()`, and `scheduleFlush()` calls.

**Step 1: Wire agent lifecycle events**

For every `emit({ type: 'agent_start', ... })` call, add:
```ts
persistEvent('agent_start', { agentId: phase.agentId, agentName: phase.agentName, phase: phase.phase })
```

For every `emit({ type: 'agent_complete', ... })` call, add:
```ts
persistEvent('agent_complete', { agentId: prevPhase.agentId, durationMs })
```

For every `emit({ type: 'agent_progress', ... })` call, add:
```ts
persistEvent('agent_progress', { agentId: '...', message: '...' })
```

**Step 2: Wire content events**

For `emit({ type: 'design_tokens', ... })`:
```ts
persistEvent('design_tokens', { tokens })
```

For `emit({ type: 'architecture_ready', ... })`:
```ts
persistEvent('architecture_ready', { spec })
```

For `emit({ type: 'page_complete', ... })`:
```ts
persistEvent('page_complete', { fileName, route, componentName, lineCount, code, pageIndex, totalPages })
```

For `emit({ type: 'file_assembled', ... })`:
```ts
persistEvent('file_assembled', { path: file.path, category })
```

For `emit({ type: 'validation_check', ... })`:
```ts
persistEvent('validation_check', { name: checkName, status })
```

**Step 3: Wire terminal events**

For the `complete` state (line ~445-490), replace the big `updateProject` call's `generationState` field. Remove `timeline`, `pageProgress`, `fileAssembly`, `validationChecks`, `buildErrors` from it. Keep only essential fields:

```ts
updateProject(
  projectId,
  {
    status: 'complete',
    sandboxId: ctx.sandboxId,
    githubRepoUrl: ctx.githubHtmlUrl,
    generationState: {
      blueprint: ctx.blueprint,
      sandboxId: ctx.sandboxId,
      tokens: ctx.tokens,
      creativeSpec: ctx.creativeSpec,
      appName: ctx.appName,
      appDescription: ctx.appDescription,
      generationStatus: 'complete',
    },
  },
  userId,
).catch(...)
```

Also persist:
```ts
persistEvent('completion', { projectId, deployUrl: snapshot.context.deploymentUrl })
```

For the `failed` state, replace `flushNow()` with:
```ts
persistEvent('error', { message: errorMsg })
```

**Step 4: Remove all `serverTimeline.push(...)`, `serverPageProgress.push(...)`, `serverFileAssembly.push(...)`, `serverValidationChecks.push(...)`, and `scheduleFlush()` calls**

Search for these patterns and remove them. There are approximately:
- 4 `serverTimeline.push(...)` calls
- 1 `serverPageProgress.push(...)` block
- 1 `serverFileAssembly.push(...)` call
- 1 `serverValidationChecks.push(...)` call
- 4 `scheduleFlush()` calls
- 1 `flushNow()` call

**Step 5: Update user/assistant message persistence (lines 821, 852)**

The existing `insertChatMessage` calls for user and assistant messages should now include `type: 'message'`:

Line 821:
```ts
insertChatMessage(`user-${runId}`, projectId, 'user', [{ text: message }], 'message').catch(...)
```

Line 852:
```ts
insertChatMessage(`assistant-${runId}`, projectId, 'assistant', [{ text: assistantText }], 'message').catch(...)
```

(These already work with the default, but being explicit improves clarity.)

**Step 6: Verify typecheck + lint**

```bash
bunx tsc --noEmit && bun run lint
```
Expected: PASS

**Step 7: Commit**

```bash
git add server/routes/agent.ts
git commit -m "feat: wire persistEvent to all SSE emit sites, remove old timeline mirrors"
```

---

### Task 5: Remove `updateGenerationTimeline` from queries.ts

**Files:**
- Modify: `server/lib/db/queries.ts:150-165`

**Step 1: Delete the function**

Remove lines 150-165 (`updateGenerationTimeline` function and its comment).

**Step 2: Remove import if unused**

Check if `updateGenerationTimeline` is imported anywhere else. Search:
```bash
# In the agent, check for imports
```

Use `Grep` to find all references to `updateGenerationTimeline` and remove them.

**Step 3: Verify typecheck**

```bash
bunx tsc --noEmit
```
Expected: PASS

**Step 4: Commit**

```bash
git add server/lib/db/queries.ts server/routes/agent.ts
git commit -m "chore: remove updateGenerationTimeline (replaced by per-event persistence)"
```

---

### Task 6: Update Client — Single Query Hydration

**Files:**
- Modify: `src/components/builder-chat.tsx:303-330` (hydration), `375-407` (messages query + merge)

**Step 1: Update the messages query to include `type`**

Replace lines 375-397:

```ts
// Fetch ALL conversation events (messages + timeline + validation + progress)
const { data: conversationEvents } = useQuery({
  queryKey: ['project-conversation', projectId],
  queryFn: async () => {
    const res = await apiFetch(`/api/projects/${projectId}/messages`)
    if (!res.ok) return []
    return (await res.json()) as Array<{
      id: string
      role: string
      type: string
      parts: unknown
      createdAt: string
    }>
  },
  staleTime: Number.POSITIVE_INFINITY,
})
```

**Step 2: Partition events by type**

Replace the old `messages` useMemo (lines 402-407) and the `hasHydrated` useEffect (lines 315-330):

```ts
// Partition persisted events into messages vs timeline data
const { persistedMessages, persistedTimeline, persistedValidation, persistedPageProgress, persistedFileAssembly } = useMemo(() => {
  if (!conversationEvents?.length) {
    return { persistedMessages: [], persistedTimeline: [], persistedValidation: [], persistedPageProgress: [], persistedFileAssembly: [] }
  }

  const messages: ChatMessage[] = []
  const timeline: TimelineEntry[] = []
  const validation: Array<{ name: string; status: string; errors?: string[] }> = []
  const pageProgress: Array<Record<string, unknown>> = []
  const fileAssembly: Array<{ path: string; category: string }> = []

  for (const evt of conversationEvents) {
    const p = Array.isArray(evt.parts) ? evt.parts[0] : evt.parts
    switch (evt.type) {
      case 'message':
        messages.push({
          id: evt.id,
          role: (evt.role === 'system' ? 'assistant' : evt.role) as 'user' | 'assistant',
          content: (Array.isArray(evt.parts) ? evt.parts : [])
            .map((part: Record<string, unknown>) => (part.text as string) || '')
            .filter(Boolean)
            .join(''),
        })
        break
      case 'agent_start':
        timeline.push({
          type: 'agent',
          ts: new Date(evt.createdAt).getTime(),
          agent: p as any,
          status: 'running',
        })
        break
      case 'agent_complete': {
        const data = p as Record<string, unknown>
        // Find the matching agent_start and update it
        const idx = timeline.findLastIndex(
          (e) => e.type === 'agent' && e.agent.agentId === data.agentId,
        )
        if (idx >= 0) {
          timeline[idx] = { ...timeline[idx], status: 'complete' as const, durationMs: data.durationMs as number }
        }
        break
      }
      case 'agent_progress': {
        const data = p as Record<string, unknown>
        const idx = timeline.findLastIndex(
          (e) => e.type === 'agent' && e.agent.agentId === data.agentId,
        )
        if (idx >= 0) {
          const entry = timeline[idx]
          if (entry.type === 'agent') {
            timeline[idx] = {
              ...entry,
              progressMessages: [...(entry.progressMessages ?? []), data.message as string],
            }
          }
        }
        break
      }
      case 'design_tokens': {
        const data = p as Record<string, unknown>
        const idx = timeline.findLastIndex((e) => e.type === 'agent' && e.agent.agentId === 'architect')
        if (idx >= 0) timeline[idx] = { ...timeline[idx], designTokens: data.tokens }
        break
      }
      case 'architecture_ready': {
        const data = p as Record<string, unknown>
        const idx = timeline.findLastIndex((e) => e.type === 'agent' && e.agent.agentId === 'architect')
        if (idx >= 0) timeline[idx] = { ...timeline[idx], architecture: data.spec }
        break
      }
      case 'plan_ready': {
        const data = p as Record<string, unknown>
        const idx = timeline.findLastIndex((e) => e.type === 'agent' && e.agent.agentId === 'analyst')
        if (idx >= 0) timeline[idx] = { ...timeline[idx], plan: data.plan }
        break
      }
      case 'validation_check': {
        const data = p as Record<string, unknown>
        const existing = validation.findIndex((v) => v.name === data.name)
        if (existing >= 0) validation[existing] = data as any
        else validation.push(data as any)
        break
      }
      case 'page_complete': {
        pageProgress.push(p as Record<string, unknown>)
        break
      }
      case 'file_assembled': {
        const data = p as Record<string, unknown>
        fileAssembly.push({ path: data.path as string, category: data.category as string })
        break
      }
      case 'completion':
        timeline.push({
          type: 'complete',
          ts: new Date(evt.createdAt).getTime(),
          deploymentUrl: (p as Record<string, unknown>)?.deployUrl as string | undefined,
        })
        break
      case 'error':
        timeline.push({
          type: 'error',
          ts: new Date(evt.createdAt).getTime(),
          error: (p as Record<string, unknown>)?.message as string,
        })
        break
    }
  }

  return {
    persistedMessages: messages,
    persistedTimeline: timeline,
    persistedValidation: validation,
    persistedPageProgress: pageProgress,
    persistedFileAssembly: fileAssembly,
  }
}, [conversationEvents])
```

**Step 3: Remove old hydration useEffect**

Delete lines 314-330 (the `hasHydrated` ref and its useEffect that hydrates from `projectData.generationState`).

**Step 4: Merge persisted + session data**

Update the `messages` useMemo to merge persisted messages with session messages:

```ts
const messages = useMemo(() => {
  if (sessionMessages.length === 0) return persistedMessages
  const historyIds = new Set(persistedMessages.map((m) => m.id))
  return [...persistedMessages, ...sessionMessages.filter((m) => !historyIds.has(m.id))]
}, [persistedMessages, sessionMessages])
```

Initialize timeline/validation/pageProgress/fileAssembly from persisted data:

```ts
// Hydrate timeline state from persisted events on mount
useEffect(() => {
  if (persistedTimeline.length > 0 && timelineEvents.length === 0) {
    setTimelineEvents(persistedTimeline)
  }
  if (persistedValidation.length > 0 && validationChecks.length === 0) {
    setValidationChecks(persistedValidation as any)
  }
  if (persistedPageProgress.length > 0 && pageProgress.length === 0) {
    setPageProgress(persistedPageProgress as any)
  }
  if (persistedFileAssembly.length > 0 && fileAssembly.length === 0) {
    setFileAssembly(persistedFileAssembly)
  }
  // Detect completed/errored state
  if (persistedTimeline.some(e => e.type === 'complete')) {
    setGenerationStatus('complete')
  } else if (persistedTimeline.some(e => e.type === 'error')) {
    setGenerationStatus('error')
  }
}, [persistedTimeline, persistedValidation, persistedPageProgress, persistedFileAssembly])
```

**Step 5: Add query invalidation on SSE completion**

In the `sendChatMessage` function, after the SSE stream completes, invalidate the conversation query:

```ts
// After streamPromise resolves or in the complete handler
queryClient.invalidateQueries({ queryKey: ['project-conversation', projectId] })
```

You'll need to get `queryClient` via `useQueryClient()` at the top of the component.

**Step 6: Remove the `projectData.generationState` hydration query if no longer needed**

Check if `projectData` is used for anything else besides timeline hydration. If it's only used for hydration, remove the query entirely. If it's used for other fields (like `sandboxId`, `status`), keep it but stop reading timeline/pageProgress/etc from it.

**Step 7: Verify typecheck + lint**

```bash
bunx tsc --noEmit && bun run lint
```
Expected: PASS

**Step 8: Commit**

```bash
git add src/components/builder-chat.tsx
git commit -m "feat: unified client hydration from chatMessages (single query, partition by type)"
```

---

### Task 7: Handle Edit Machine SSE Events

**Files:**
- Modify: `server/routes/agent.ts` (edit route section, around line 1100+)

The edit machine (`POST /api/agent` with `editMode`) also emits SSE events. Check that the edit route also uses `persistEvent` for its events.

**Step 1: Find edit route event emissions**

Search for `emit` calls in the edit route handler (approximately lines 1100-1200).

**Step 2: Wire `persistEvent` for edit events**

Apply the same pattern: for each `emit()`, add a `persistEvent()` call.

**Step 3: Verify typecheck**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add server/routes/agent.ts
git commit -m "feat: persist edit machine events to unified chatMessages"
```

---

### Task 8: Integration Test — End-to-End Persistence

**Files:**
- Create: `tests/chat-persistence.test.ts`

**Step 1: Write test for message + event persistence roundtrip**

```ts
import { describe, it, expect, vi } from 'vitest'
import { insertChatMessage, getProjectMessages } from '@server/lib/db/queries'

// This test verifies the unified persistence model:
// 1. Insert various event types
// 2. Retrieve all events ordered by createdAt
// 3. Verify type field is correctly stored and returned

describe('Unified Chat Persistence', () => {
  // Note: These tests require a real or mock DB connection.
  // If using PGlite or mock, set up accordingly.

  it('should persist and retrieve events with type discriminator', async () => {
    const projectId = 'test-project-id'
    const runId = 'test-run-id'

    // Insert a user message
    await insertChatMessage(`user-${runId}`, projectId, 'user', [{ text: 'Build a todo app' }], 'message')

    // Insert an agent_start event
    await insertChatMessage(`${runId}-agent_start-0`, projectId, 'system', { agentId: 'analyst', agentName: 'Analyst' }, 'agent_start')

    // Insert an agent_complete event
    await insertChatMessage(`${runId}-agent_complete-1`, projectId, 'system', { agentId: 'analyst', durationMs: 5000 }, 'agent_complete')

    // Retrieve all events
    const events = await getProjectMessages(projectId)

    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('message')
    expect(events[1].type).toBe('agent_start')
    expect(events[2].type).toBe('agent_complete')
  })

  it('should handle ON CONFLICT DO NOTHING for duplicate IDs', async () => {
    const projectId = 'test-project-id'
    const id = 'duplicate-test-id'

    await insertChatMessage(id, projectId, 'user', [{ text: 'First' }], 'message')
    const result = await insertChatMessage(id, projectId, 'user', [{ text: 'Duplicate' }], 'message')

    expect(result).toBeNull() // ON CONFLICT DO NOTHING returns null
  })
})
```

**Step 2: Run tests**

```bash
bun run test -- tests/chat-persistence.test.ts
```

**Step 3: Commit**

```bash
git add tests/chat-persistence.test.ts
git commit -m "test: add integration tests for unified chat persistence"
```

---

### Task 9: E2E Smoke Test — Mock Pipeline Persistence

**Files:**
- Modify: `e2e/` (existing mock E2E tests if applicable)

**Step 1: Verify mock pipeline persists events**

Note: `persistEvent` skips in mock mode (`if (mockMode) return`). For E2E testing with `VITE_MOCK_MODE=true`, events won't be persisted to DB. This is correct behavior — mock mode doesn't use a real DB.

If you need E2E persistence testing, use the `real` E2E project (`bun run test:e2e:real`).

**Step 2: Manual smoke test**

1. Start dev server: `bun run dev`
2. Create a new project, send "Build a todo app"
3. Wait for pipeline to complete
4. Refresh the page
5. Verify: all agent cards, messages, validation checks, and "Your app is ready!" persist

**Step 3: Commit any E2E test updates**

```bash
git add e2e/
git commit -m "test: update E2E for unified chat persistence"
```

---

### Task 10: Cleanup — Remove Dead Code

**Files:**
- Modify: `server/lib/db/queries.ts` (remove `updateGenerationTimeline` if not done in Task 5)
- Modify: `src/lib/types.ts` (check if `GenerationState` type needs updating)
- Modify: `src/components/builder-chat.tsx` (remove unused imports)

**Step 1: Search for remaining references to old persistence**

```bash
# Search for updateGenerationTimeline, serverTimeline, scheduleFlush, flushNow, hasHydrated
```

**Step 2: Remove all dead references**

**Step 3: Verify full build**

```bash
bunx tsc --noEmit && bun run lint && bun run build
```
Expected: ALL PASS

**Step 4: Run full test suite**

```bash
bun run test
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove dead code from old dual-path persistence"
```
