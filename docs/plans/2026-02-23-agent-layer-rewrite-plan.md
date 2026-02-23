# Agent Layer Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port 6 proven patterns from the claudeCode conversational coding assistant into the vibestack/platform agent layer in a single coordinated rewrite.

**Architecture:** Extend the existing XState-based pipeline with structured error categories, tool-level SSE streaming, Vercel KV session persistence, explicit cancellation, rich JSONB message parts, and a feature-flagged Claude Agent SDK provider. The XState machines remain unchanged — only the event emission, error handling, session storage, and agent providers are modified.

**Tech Stack:** TypeScript, Hono, XState v5, Vercel KV (`@vercel/kv`), Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), Vitest

---

### Task 1: Structured Error Categories — Types

**Files:**
- Modify: `server/lib/types.ts:370-374` (ErrorEvent interface)
- Modify: `src/lib/types.ts` (mirror ErrorEvent)

**Step 1: Update server ErrorEvent interface**

In `server/lib/types.ts`, replace the `ErrorEvent` interface:

```typescript
// BEFORE (lines 370-374):
export interface ErrorEvent {
  type: 'error'
  message: string
  stage: StageStatus
}

// AFTER:
export type ErrorKind = 'transient' | 'permanent' | 'user_action_required' | 'budget_exceeded' | 'cancelled'

export interface ErrorEvent {
  type: 'error'
  message: string
  stage: StageStatus
  errorKind: ErrorKind
  retryable: boolean
  agentId?: string
}
```

**Step 2: Mirror in client types**

Find `ErrorEvent` in `src/lib/types.ts` and apply the same change. Also export `ErrorKind`.

**Step 3: Fix all emit sites**

Search for `type: 'error'` emissions in `server/routes/agent.ts`. Each must include `errorKind` and `retryable`. Map each existing error to the right kind:

| Location | Error | errorKind | retryable |
|----------|-------|-----------|-----------|
| Line 367 (machine context.error) | Pipeline failed | `permanent` | `false` |
| Line 765 (catch block, SSE) | Agent pipeline failed | `transient` | `true` |
| Line 858 (catch block, resume) | Resume failed | `transient` | `true` |
| Line 1027 (edit failed) | Edit failed | `permanent` | `false` |
| Line 1087 (edit catch) | Edit pipeline failed | `transient` | `true` |
| Signal aborted | User cancelled | `cancelled` | `false` |

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS (no type errors)

**Step 5: Commit**

```bash
git add server/lib/types.ts src/lib/types.ts server/routes/agent.ts
git commit -m "feat: add structured error categories to ErrorEvent"
```

---

### Task 2: Structured Error Categories — Machine Context

**Files:**
- Modify: `server/lib/agents/machine.ts:56` (MachineContext.error)

**Step 1: Extend MachineContext error field**

Replace `error: string | null` with a structured error:

```typescript
// In MachineContext interface:
error: string | null
errorKind: ErrorKind | null
```

Initialize `errorKind: null` in the machine's initial context.

**Step 2: Update all `assign({ error: ... })` calls in the machine**

Search for `assign.*error` in `machine.ts`. Each error assignment should also set `errorKind`. For example:

```typescript
// BEFORE:
assign({ error: (_, event) => event.data.message })

// AFTER:
assign({
  error: (_, event) => event.data.message,
  errorKind: () => 'permanent' as const,
})
```

Classify each error source:
- Analyst/Architect/Design agent failures → `permanent`
- Sandbox/network failures → `transient`
- Repair exhausted retries → `permanent`

**Step 3: Use errorKind in streamActorStates**

In `server/routes/agent.ts`, update the `failed` state handler (line 366-380):

```typescript
} else if (state === 'failed') {
  const errorMsg = snapshot.context.error ?? 'Pipeline failed'
  const errorKind = snapshot.context.errorKind ?? 'permanent'
  // ...
  emit({
    type: 'error',
    message: errorMsg,
    stage: 'error',
    errorKind,
    retryable: errorKind === 'transient',
    agentId: previousState ?? undefined,
  })
}
```

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/machine.ts server/routes/agent.ts
git commit -m "feat: propagate errorKind through XState machine context"
```

---

### Task 3: Tool Execution Streaming — Types

**Files:**
- Modify: `server/lib/types.ts` (add ToolCallStartEvent, ToolCallResultEvent to StreamEvent union)
- Modify: `src/lib/types.ts` (mirror)

**Step 1: Add new event interfaces**

After `AgentCompleteEvent` in `server/lib/types.ts` (~line 419), add:

```typescript
export interface ToolCallStartEvent {
  type: 'tool_call_start'
  agentId: string
  toolName: string
  toolCallId: string
}

export interface ToolCallResultEvent {
  type: 'tool_call_result'
  agentId: string
  toolCallId: string
  result: string
  isError: boolean
  durationMs: number
}
```

**Step 2: Add to StreamEvent union**

Add `| ToolCallStartEvent | ToolCallResultEvent` to the `StreamEvent` type union.

**Step 3: Mirror in `src/lib/types.ts`**

Copy the same interfaces and add to the client's `StreamEvent` union.

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/types.ts src/lib/types.ts
git commit -m "feat: add tool_call_start and tool_call_result SSE event types"
```

---

### Task 4: Tool Execution Streaming — Emit from Agents

**Files:**
- Modify: `server/lib/agents/machine.ts` (add emitToolEvent to context)
- Modify: `server/routes/agent.ts` (wire tool events through streamActorStates)

**Step 1: Add emitToolEvent callback to MachineContext**

```typescript
// In MachineContext:
emitToolEvent: ((event: ToolCallStartEvent | ToolCallResultEvent) => void) | null
```

Initialize to `null`. The route handler sets it before `actor.start()`.

**Step 2: Wire in streamActorStates**

Before `actor.send({ type: 'START', ... })`, set the callback:

```typescript
// Inject tool event emitter into actor context
const actorContext = actor.getSnapshot().context
actorContext.emitToolEvent = (event: ToolCallStartEvent | ToolCallResultEvent) => {
  emit(event)
}
```

**Step 3: Emit tool events from agent invoke handlers**

In the machine's `fromPromise` handlers for each state (codeGeneration, validating, repairing), wrap tool calls:

```typescript
// Example in codegen invoke:
const toolCallId = crypto.randomUUID()
context.emitToolEvent?.({
  type: 'tool_call_start',
  agentId: 'codegen',
  toolName: 'writePage',
  toolCallId,
})
// ... do the work ...
context.emitToolEvent?.({
  type: 'tool_call_result',
  agentId: 'codegen',
  toolCallId,
  result: `Generated ${page.fileName} (${lineCount} lines)`,
  isError: false,
  durationMs: Date.now() - startTime,
})
```

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/machine.ts server/routes/agent.ts
git commit -m "feat: emit tool_call events from pipeline agents"
```

---

### Task 5: Session Persistence — Session Store Module

**Files:**
- Create: `server/lib/session-store.ts`

**Step 1: Write the failing test**

Create `tests/session-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @vercel/kv
vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}))

import { persistRun, loadRun, deleteRun, heartbeat } from '../server/lib/session-store'
import { kv } from '@vercel/kv'

describe('session-store', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('persistRun stores with 1h TTL', async () => {
    const run = {
      runId: 'run-1',
      userId: 'user-1',
      projectId: 'proj-1',
      model: 'gpt-5.2-codex',
      createdAt: Date.now(),
      reservedCredits: 50,
      settled: false,
      machineSnapshot: null,
      lastHeartbeat: Date.now(),
    }
    await persistRun(run)
    expect(kv.set).toHaveBeenCalledWith('run:run-1', run, { ex: 3600 })
  })

  it('loadRun returns null for missing key', async () => {
    vi.mocked(kv.get).mockResolvedValue(null)
    const result = await loadRun('missing')
    expect(result).toBeNull()
  })

  it('deleteRun removes the key', async () => {
    await deleteRun('run-1')
    expect(kv.del).toHaveBeenCalledWith('run:run-1')
  })

  it('heartbeat updates lastHeartbeat and machineSnapshot', async () => {
    const existing = {
      runId: 'run-1',
      lastHeartbeat: 1000,
      machineSnapshot: null,
    }
    vi.mocked(kv.get).mockResolvedValue(existing)
    await heartbeat('run-1', { foo: 'bar' })
    expect(kv.set).toHaveBeenCalledWith(
      'run:run-1',
      expect.objectContaining({
        machineSnapshot: { foo: 'bar' },
        lastHeartbeat: expect.any(Number),
      }),
      { ex: 3600 },
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/session-store.test.ts`
Expected: FAIL — module not found

**Step 3: Install @vercel/kv**

Run: `bun add @vercel/kv`

**Step 4: Write the implementation**

Create `server/lib/session-store.ts`:

```typescript
import { kv } from '@vercel/kv'

const TTL_SECONDS = 3600 // 1 hour

export interface PersistedRun {
  runId: string
  userId: string
  projectId: string
  model: string
  createdAt: number
  reservedCredits: number
  settled: boolean
  machineSnapshot: object | null
  lastHeartbeat: number
}

function key(runId: string): string {
  return `run:${runId}`
}

export async function persistRun(run: PersistedRun): Promise<void> {
  await kv.set(key(run.runId), run, { ex: TTL_SECONDS })
}

export async function loadRun(runId: string): Promise<PersistedRun | null> {
  return kv.get<PersistedRun>(key(runId))
}

export async function deleteRun(runId: string): Promise<void> {
  await kv.del(key(runId))
}

export async function heartbeat(runId: string, snapshot: object): Promise<void> {
  const existing = await kv.get<PersistedRun>(key(runId))
  if (!existing) return
  existing.machineSnapshot = snapshot
  existing.lastHeartbeat = Date.now()
  await kv.set(key(runId), existing, { ex: TTL_SECONDS })
}
```

**Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/session-store.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add server/lib/session-store.ts tests/session-store.test.ts package.json bun.lock
git commit -m "feat: add Vercel KV session store for run persistence"
```

---

### Task 6: Session Persistence — Integrate into Agent Route

**Files:**
- Modify: `server/routes/agent.ts:39-52` (replace in-memory Map with KV)

**Step 1: Replace activeRuns Map**

Keep the in-memory Map for the **live actor** reference (XState actors can't be serialized into KV while running). But add KV persistence for recovery:

```typescript
import { persistRun, loadRun, deleteRun, heartbeat } from '../lib/session-store'
import type { PersistedRun } from '../lib/session-store'

// In-memory: holds live actor references (cannot be serialized)
const activeActors = new Map<string, { actor: any; abortController: AbortController }>()

// KV: holds serializable run metadata for cold start recovery
// (persisted via session-store.ts)
```

**Step 2: Persist run on creation**

After `activeRuns.set(runId, ...)` (line 652), add:

```typescript
await persistRun({
  runId,
  userId: user.id,
  projectId,
  model,
  createdAt: Date.now(),
  reservedCredits: mockMode ? 0 : CREDIT_RESERVATION,
  settled: mockMode,
  machineSnapshot: null,
  lastHeartbeat: Date.now(),
})
```

**Step 3: Heartbeat on state transitions**

In `streamActorStates`, after each state change, call:

```typescript
heartbeat(runId, actor.getPersistedSnapshot?.() ?? {}).catch(() => {})
```

**Step 4: Clean up KV on completion**

In the `finally` block of each route handler, add:

```typescript
await deleteRun(runId)
```

**Step 5: Update `/resume` to check KV**

In the resume handler, if `activeRuns.get(runId)` is null, try `loadRun(runId)` from KV. If found but no live actor, return a specific error: `{ error: 'run_expired', message: 'Generation was interrupted — please restart' }`.

**Step 6: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add server/routes/agent.ts
git commit -m "feat: persist active runs to Vercel KV for cold start recovery"
```

---

### Task 7: Per-Agent Cancellation — Cancel Route

**Files:**
- Modify: `server/routes/agent.ts` (add POST /cancel route)

**Step 1: Add AbortController to activeActors**

This was done in Task 6. Verify `activeActors` Map stores `{ actor, abortController }`.

**Step 2: Create the cancel route**

After the `/edit` route, add:

```typescript
/**
 * POST /api/agent/cancel
 * Cancel a running generation by runId
 */
agentRoutes.post('/cancel', async (c) => {
  const body = await c.req.json<{ runId?: string }>()
  const { runId } = body
  if (!runId) return c.json({ error: 'Missing runId' }, 400)

  const user = c.var.user
  const stored = activeRuns.get(runId)

  if (!stored) return c.json({ error: 'Run not found' }, 404)
  if (stored.userId !== user.id) return c.json({ error: 'Unauthorized' }, 403)

  // Abort the running actor
  const liveActor = activeActors.get(runId)
  if (liveActor) {
    liveActor.abortController.abort()
    try { liveActor.actor.stop() } catch { /* already stopped */ }
    activeActors.delete(runId)
  }

  // Refund credits
  if (!stored.settled) {
    await settleCredits(user.id, stored.reservedCredits, 0)
    stored.settled = true
  }

  // Clean up KV
  await deleteRun(runId)
  activeRuns.delete(runId)

  return c.json({ ok: true })
})
```

**Step 3: Create AbortController per run and register it**

In the POST `/` handler, after creating the actor, register in `activeActors`:

```typescript
const abortController = new AbortController()
activeActors.set(runId, { actor, abortController })
```

Pass `abortController.signal` to `streamActorStates`.

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/agent.ts
git commit -m "feat: add POST /api/agent/cancel with credit refund"
```

---

### Task 8: JSONB Message Persistence — Rich Parts

**Files:**
- Modify: `server/routes/agent.ts` (build rich message parts during streaming)

**Step 1: Collect tool events during streaming**

Add a `messageParts` accumulator alongside the existing `streamActorStates`:

```typescript
const messageParts: unknown[] = []
const originalEmit = emit

const enrichedEmit = (event: StreamEvent) => {
  // Collect tool events for message persistence
  if (event.type === 'agent_start') {
    messageParts.push({ type: 'agent_start', agentId: event.agentId, agentName: event.agentName })
  } else if (event.type === 'agent_complete') {
    messageParts.push({
      type: 'phase_summary',
      phase: 0, // populated from STATE_PHASES
      phaseName: STATE_PHASES[event.agentId]?.name ?? event.agentId,
      durationMs: event.durationMs,
    })
  } else if (event.type === 'tool_call_result') {
    messageParts.push({
      type: 'tool_call',
      agentId: event.agentId,
      toolName: '', // populated from tool_call_start
      inputSummary: '',
      result: event.result.slice(0, 500), // cap at 500 chars
      status: event.isError ? 'error' : 'done',
    })
  }

  originalEmit(event)
}
```

**Step 2: Use enrichedEmit in streamActorStates**

Pass `enrichedEmit` instead of `emit`.

**Step 3: Persist rich assistant message**

Replace the current generic assistant message (line 710-718) with:

```typescript
// Build rich assistant message with build log parts
const appName = finalSnapshot.context.appName || 'App'
const appDesc = finalSnapshot.context.appDescription || ''
const summaryText = appDesc
  ? `I'll build **${appName}** — ${appDesc}`
  : `Building ${appName}...`

const richParts = [{ text: summaryText }, ...messageParts]
insertChatMessage(`assistant-${runId}`, projectId, 'assistant', richParts).catch((err) => {
  console.error('[agent] Failed to save assistant message:', err)
})
```

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/agent.ts
git commit -m "feat: persist rich message parts with tool execution history"
```

---

### Task 9: Agent SDK Migration — Provider

**Files:**
- Modify: `server/lib/agents/provider.ts` (add Claude SDK path)
- Create: `server/lib/agents/claude-provider.ts`

**Step 1: Install Claude Agent SDK**

Run: `bun add @anthropic-ai/claude-agent-sdk`

**Step 2: Create Claude provider module**

Create `server/lib/agents/claude-provider.ts`:

```typescript
/**
 * Claude Agent SDK provider — uses local `claude /login` credentials.
 * Feature-flagged behind USE_CLAUDE_AGENT_SDK=true.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'

export function isClaudeSDKEnabled(): boolean {
  return process.env.USE_CLAUDE_AGENT_SDK === 'true'
}

export interface ClaudeQueryOptions {
  prompt: string
  systemPrompt?: string
  model?: string
  maxTurns?: number
  cwd?: string
  abortController?: AbortController
}

/**
 * Run a Claude Agent SDK query and return the final text result.
 * This wraps the async generator into a simple Promise<string>.
 */
export async function runClaudeQuery(options: ClaudeQueryOptions): Promise<{
  result: string
  totalTokens: number
}> {
  const q = query({
    prompt: options.prompt,
    options: {
      model: options.model ?? 'claude-sonnet-4-6',
      systemPrompt: options.systemPrompt,
      cwd: options.cwd,
      maxTurns: options.maxTurns ?? 20,
      permissionMode: 'bypassPermissions',
      abortController: options.abortController,
    },
  })

  let resultText = ''
  let totalTokens = 0

  for await (const msg of q) {
    if (options.abortController?.signal.aborted) break

    if (msg.type === 'assistant') {
      const content = (msg.message as Record<string, unknown>).content as Array<Record<string, unknown>>
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            resultText += block.text as string
          }
        }
      }
    } else if (msg.type === 'result') {
      const usage = (msg as Record<string, unknown>).usage as Record<string, number> | undefined
      if (usage) {
        totalTokens += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
      }
    }
  }

  return { result: resultText, totalTokens }
}
```

**Step 3: Add feature flag check to model resolver**

In `server/lib/agents/provider.ts`, modify `createAgentModelResolver`:

```typescript
import { isClaudeSDKEnabled } from './claude-provider'

// At top of createAgentModelResolver:
// When Claude SDK is enabled, return a marker that the machine can detect.
// The actual query() call happens in the machine invoke handler, not here.
```

Note: Full integration of Claude SDK into the Mastra agents requires changes in the machine invocations. For this task, we only create the provider and utility. Machine integration is a follow-up once the rest of the rewrite is validated.

**Step 4: Add env var**

Add to `.env.local`:

```
# Feature flag: use Claude Agent SDK instead of OpenAI API
# Requires `claude /login` to be run first
# USE_CLAUDE_AGENT_SDK=true
```

**Step 5: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add server/lib/agents/claude-provider.ts server/lib/agents/provider.ts .env.local package.json bun.lock
git commit -m "feat: add Claude Agent SDK provider behind feature flag"
```

---

### Task 10: Client Error UI — ErrorKind Rendering

**Files:**
- Modify: `src/components/builder-chat.tsx` (render error based on errorKind)

**Step 1: Find the error rendering code**

Search `builder-chat.tsx` for where `StreamEvent` type `error` is handled. Update it to show different UI based on `errorKind`:

```typescript
// Transient: "Something went wrong. Retrying..." with spinner
// Permanent: "Generation failed: {message}. Try rephrasing your prompt."
// Budget exceeded: "Token budget exceeded for {agentId}."
// Cancelled: "Generation cancelled." (neutral tone, no error styling)
// User action required: Show clarification UI (already handled separately)
```

**Step 2: Run build**

Run: `bunx vite build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/builder-chat.tsx
git commit -m "feat: render structured error categories in builder chat"
```

---

### Task 11: Final Verification

**Step 1: Full type check**

Run: `bunx tsc --noEmit`
Expected: PASS with 0 errors

**Step 2: Lint**

Run: `bunx oxlint`
Expected: PASS (or only pre-existing warnings)

**Step 3: Unit tests**

Run: `bunx vitest run`
Expected: All tests pass (including new session-store tests)

**Step 4: Build**

Run: `bun run build`
Expected: Client + server build succeeds

**Step 5: Manual smoke test**

1. Start dev server: `bun run dev`
2. Open http://localhost:5173
3. Create a new project, submit a prompt
4. Verify SSE stream includes `tool_call_start`/`tool_call_result` events
5. Verify errors include `errorKind` field
6. Cancel mid-generation, verify credit refund in DB

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: agent layer rewrite — 6 patterns from claudeCode

- Structured error categories (5 kinds: transient, permanent, user_action_required, budget_exceeded, cancelled)
- Tool execution streaming (tool_call_start/tool_call_result SSE events)
- Vercel KV session persistence (replaces in-memory activeRuns Map)
- Per-agent cancellation with POST /api/agent/cancel
- Rich JSONB message parts (build log with tool calls and phase summaries)
- Claude Agent SDK provider (feature-flagged behind USE_CLAUDE_AGENT_SDK)"
```
