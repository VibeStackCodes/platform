# Unified Chat Persistence Design

**Date**: 2026-02-24
**Status**: Approved

## Problem

Chat persistence is broken — four symptoms on page reload:
1. Messages disappear
2. Agent timeline cards don't persist
3. Duplicate messages appear
4. State is stale/corrupt (partial data from old + new runs)

**Root cause**: Dual persistence paths that can't be reconciled:
- `chatMessages` table — user/assistant text (fire-and-forget inserts, IDs mismatched between client and server)
- `projects.generation_state` JSONB — timeline events (debounced 2s flush, can be dropped)

## Solution: Unified Conversation Model

Extend `chatMessages` to store ALL conversation events (messages + timeline + validation + progress). Single persistence path, single hydration path.

Matches industry practice: Bolt.diy (IndexedDB with unified messages+artifacts) and Lovable (Supabase unified model).

## Data Model

Add `type` column to `chatMessages`:

```sql
ALTER TABLE chat_messages ADD COLUMN type text NOT NULL DEFAULT 'message';
```

| Type | Description | `parts` shape |
|------|-------------|---------------|
| `message` | User or assistant text | `[{ text: "..." }]` |
| `agent_start` | Agent card opened | `{ agentId, agentName, model }` |
| `agent_complete` | Agent card closed | `{ agentId, agentName, durationMs }` |
| `phase_start` | Phase transition | `{ phase, agentId, agentName }` |
| `page_complete` | Page generation done | `{ route, componentName, status }` |
| `validation` | QA check result | `{ checks: [...], passed, failed }` |
| `build_error` | Build/lint error | `{ errors: [...] }` |
| `checkpoint` | Pipeline checkpoint | `{ state, message }` |
| `completion` | "Your app is ready!" | `{ previewUrl, deployUrl }` |

**ID scheme**: `{runId}-{type}-{agentId|index}` — deterministic, dedup-safe.

## Server-Side Changes (`server/routes/agent.ts`)

### Remove
- `serverTimeline`, `serverPageProgress`, `serverFileAssembly`, `serverValidationChecks`, `serverBuildErrors` arrays
- `scheduleFlush()` and `flushNow()` functions
- `updateGenerationTimeline()` from `queries.ts`

### Add
- Each SSE event that gets `emit()`ed also gets an `insertChatMessage()` call
- Individual inserts per event (not batched)
- One retry with 500ms delay on DB failure, non-blocking for SSE
- `ON CONFLICT DO NOTHING` on insert (dedup safety)

### Keep
- `generation_state` JSONB on projects — slimmed to `{ generationStatus: string }` only

## Client-Side Changes (`src/components/builder-chat.tsx`)

### Single Query
```ts
const { data: conversationEvents } = useQuery({
  queryKey: ['project-conversation', projectId],
  queryFn: () => apiFetch(`/api/projects/${projectId}/messages`).then(r => r.json()),
})
```

### Partition by Type
```ts
const { messages, timelineEvents, validationChecks, pageProgress } = useMemo(() => {
  // Filter conversationEvents by type for rendering
}, [conversationEvents])
```

### Remove
- `hasHydrated` ref and its useEffect
- `generationStatus !== 'idle'` guard
- Separate `projectData.generationState` hydration
- Session messages dedup logic

### Keep
- `sessionMessages` state for real-time rendering during active SSE
- On SSE completion: `invalidateQueries(['project-conversation', projectId])`

## Migration & Backward Compatibility

- Existing rows get `type = 'message'` via DEFAULT — correct
- No backfill for old `generation_state` data (early product, acceptable)
- API endpoint `/api/projects/:id/messages` returns all event types now (with `type` field)

## Edge Cases

- **Mid-generation refresh**: Shows persisted events so far. No auto-reconnect.
- **DB write failure**: SSE continues, timeline not persisted. Log error.
- **Duplicate IDs**: `ON CONFLICT DO NOTHING`
- **Multiple runs**: Each run has unique runId, events coexist chronologically.
