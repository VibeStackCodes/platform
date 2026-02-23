# Agent Layer Rewrite: 6 Patterns from ClaudeCode

**Date:** 2026-02-23
**Approach:** Big bang rewrite of agent layer
**Source:** Patterns extracted from `claudeCode/` conversational coding assistant

## Overview

Port 6 proven patterns from the claudeCode app into the vibestack/platform agent layer. This is a single coordinated rewrite touching the agent route, SSE streaming, error handling, state persistence, message storage, and optionally the LLM provider.

## 1. Structured Error Categories

### Current State
Single error path: `emit({ type: 'error', message: '...', stage: 'error' })`. All failures surface as "Pipeline failed."

### Design
Add `errorKind` to `ErrorEvent`:

```typescript
export interface ErrorEvent {
  type: 'error'
  message: string
  stage: StageStatus
  errorKind: 'transient' | 'permanent' | 'user_action_required' | 'budget_exceeded' | 'cancelled'
  retryable: boolean
  agentId?: string
}
```

| Error Kind | Example | Retry? | User Action |
|------------|---------|--------|-------------|
| `transient` | Rate limit, network timeout, sandbox boot failure | Yes (auto 1x) | "Retrying..." |
| `permanent` | Invalid schema, codegen produces invalid TS | No | "Please modify your prompt" |
| `user_action_required` | Ambiguous requirements | No | Show clarification UI |
| `budget_exceeded` | Per-agent token budget hit | No | Show budget warning |
| `cancelled` | User clicked cancel | No | Refund credits silently |

### Files Changed
- `server/lib/types.ts` — Update `ErrorEvent` interface
- `src/lib/types.ts` — Mirror update
- `server/routes/agent.ts` — Emit `errorKind` in all error paths
- `server/lib/agents/machine.ts` — Carry `errorKind` in machine context
- `src/components/builder/` — Render error UI based on `errorKind`

## 2. Tool Execution Streaming

### Current State
Only high-level events: `agent_start`, `agent_progress` (text-only), `agent_complete`. Users see "Code Agent running..." but not what it's doing internally.

### Design
Add tool-level events:

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

### Integration Points
- Codegen agent: `tool_call_start` per page write, `tool_call_result` when done
- QA agent: `tool_call_start` for typecheck/lint/build commands
- Repair agent: `tool_call_start` for each file fix

### Constraint
Existing `file_start`/`file_complete`/`page_complete` events remain unchanged (they drive the file tree UI). New events are supplementary — they populate an agent detail panel.

### Files Changed
- `server/lib/types.ts` — Add `ToolCallStartEvent`, `ToolCallResultEvent` to `StreamEvent` union
- `src/lib/types.ts` — Mirror
- `server/routes/agent.ts` — Emit tool events from `streamActorStates`
- `server/lib/agents/*.ts` — Agent implementations emit tool events via context callback

## 3. Session Persistence (Vercel KV)

### Current State
```typescript
// TODO comment in code: Move to Redis/Vercel KV
const activeRuns = new Map<string, ActiveRun>()
```
In-memory Map. Vercel cold starts lose all running generations.

### Design
```typescript
import { kv } from '@vercel/kv'

interface PersistedRun {
  runId: string
  userId: string
  projectId: string
  model: string
  createdAt: number
  reservedCredits: number
  settled: boolean
  machineSnapshot: object  // XState getPersistedSnapshot()
  lastHeartbeat: number
}
```

### Key Decisions
- **Serialization**: Use XState v5's `actor.getPersistedSnapshot()` for checkpoint/restore
- **Heartbeat**: Update KV every state transition. Stale >60s = orphaned
- **Resume**: `/api/agent/resume` checks KV first, restores actor from snapshot
- **TTL**: 1 hour expiry on KV entries
- **In-memory actor still required**: KV stores checkpoints for recovery, not the live actor

### Trade-off
Cannot resume mid-tool-execution. Cold start during codegen → restarts from last state transition. Acceptable because agents are idempotent (re-generating overwrites in sandbox).

### Files Changed
- `package.json` — Add `@vercel/kv`
- `server/routes/agent.ts` — Replace `activeRuns` Map with KV operations
- `server/lib/session-store.ts` — New module: `persistRun()`, `loadRun()`, `deleteRun()`, `heartbeat()`

## 4. Per-Agent Cancellation with Clean Teardown

### Current State
`AbortSignal` in `streamActorStates` disconnects SSE, but the actor keeps running. No explicit cancel route.

### Design
New route:
```
POST /api/agent/cancel  { runId: string }
```

Flow:
1. Look up run in activeRuns (or KV)
2. Call `abortController.abort()`
3. Settle credits (refund reservation)
4. Emit `{ type: 'error', errorKind: 'cancelled' }`
5. Stop XState actor
6. Clean up KV entry

Pass `AbortController` through machine context so individual agents can check `signal.aborted` before expensive operations.

### Files Changed
- `server/routes/agent.ts` — Add `POST /cancel` route
- `server/lib/agents/machine.ts` — Add `abortController` to `MachineContext`
- `server/lib/agents/*.ts` — Check `signal.aborted` before LLM calls

## 5. JSONB Message Persistence

### Current State
Chat messages stored as `[{ text: "..." }]`. After generation, the assistant message is a generic summary: `"I'll build **TodoApp** — a task management app"`.

### Design
Extend message `parts` to include tool execution history:

```typescript
type MessagePart =
  | { text: string }
  | { type: 'tool_call'; agentId: string; toolName: string;
      inputSummary: string; result: string; status: 'done' | 'error' }
  | { type: 'phase_summary'; phase: number; phaseName: string;
      filesGenerated?: number; durationMs: number }
```

After generation completes, persist a rich assistant message that serves as a build log — users can scroll back and see what each agent did.

### Files Changed
- `server/routes/agent.ts` — Build rich message parts during streaming
- `server/lib/db/queries.ts` — No schema change needed (parts is already JSONB)
- `src/components/builder/BuilderChat.tsx` — Render tool_call and phase_summary parts

## 6. Agent SDK Migration (Feature-Flagged)

### Current State
OpenAI GPT-5.2-codex via Vercel AI SDK + Helicone. Pay-per-token.

### Design
Feature-flagged behind `USE_CLAUDE_AGENT_SDK=true`.

When enabled:
- Replace `createHeliconeProvider(...)(model)` with `query()` from `@anthropic-ai/claude-agent-sdk`
- Each Mastra agent becomes a `query()` call with specific system prompt
- Uses local `claude /login` credentials (Claude Max subscription)
- Eliminates per-token billing for development/internal use

### Constraint
XState machine stays unchanged. Only agent implementations change (how each state's work is done).

### Trade-off
Claude Agent SDK spawns a subprocess per `query()`. For 5-7 sequential agents, that's 5-7 subprocess spawns. Fine for build pipeline (10-60s each), not for low-latency chat.

### Files Changed
- `package.json` — Add `@anthropic-ai/claude-agent-sdk`
- `server/lib/agents/provider.ts` — Add Claude SDK provider behind flag
- `server/lib/agents/*.ts` — Dual implementation: OpenAI path + Claude SDK path
- `.env.local` — Add `USE_CLAUDE_AGENT_SDK=true`

## Implementation Order (within single PR)

1. Error categories (foundation)
2. Tool execution streaming types
3. Session persistence (Vercel KV)
4. Per-agent cancellation
5. JSONB message enrichment
6. Agent SDK migration (behind flag)

## Testing Strategy

- Unit tests for error classification logic
- Unit tests for KV session store (mock `@vercel/kv`)
- E2E test: full generation with tool events in SSE stream
- E2E test: cancel mid-generation, verify credit refund
- E2E test: mock cold start recovery from KV snapshot
