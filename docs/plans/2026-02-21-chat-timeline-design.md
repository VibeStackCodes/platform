# Chat Timeline Design — Inline Agent Cards

## Problem

When a user submits prompt, the chat panel shows their message bubble and a collapsed "Pipeline Progress" accordion — then nothing for ~90 seconds while the backend pipeline runs 8+ agents. The user has zero visibility into what's happening.

Root causes:
1. **The `preparing` parallel state emits zero SSE events** — `STATE_PHASES` does flat string lookup but `snapshot.value` is a nested object `{ preparing: { analysis: 'running', infrastructure: 'provisioning' } }`.
2. **`file_complete` never emits in real mode** — files stay "generating" forever in the UI.
3. **The `complete` event with URLs is never emitted** — only `stage_update('complete')`.
4. **Client renders timeline as a collapsed accordion** instead of inline agent cards.

## Solution

Render pipeline agents **inline in the chat stream** as individual cards that appear one by one as agents start running. Each agent gets its own collapsible `Task` card from the AI Elements library. Active agent is expanded, completed agents are collapsed to one line with duration.

## Design Rules

1. **Never show pending/future agents** — only render when `agent_start` fires
2. **Individual agents, never grouped** — each agent gets its own card
3. **Deployment is manual** — handled by the Deploy button in `BuilderPreview`, not in the timeline
4. **No checkpoints** — remove horizontal dividers
5. **Plan card only when data arrives** — appears after `plan_ready` event with blueprint summary
6. **Active agent expanded, completed collapsed** — auto-collapse on `agent_complete`

## SSE Event → Component Mapping

| SSE Event | Renders as | AI Element |
|---|---|---|
| `agent_start` | New agent card, expanded | `Task` + `TaskTrigger title={agentName}` |
| `agent_complete` | Collapse card, show duration | `Task` collapsed + "✓ 2.1s" badge |
| `plan_ready` | Blueprint summary card | `Plan` + `PlanTitle` + `PlanContent` |
| `file_start` | Add to FileTree | `FileTree` nested in Code Generator `TaskContent` |
| `file_complete` | Update file icon | `FileTreeFile` with green check |
| `error` | Error panel | `StackTrace` with parsed error |
| `stage_update('complete')` | Success text | "Your app is ready!" + optional deploy link |
| `credits_used` | Update credits | Credit counter in footer |

## Visual Mockup

```
┌─────────────────────────────────────┐
│ [User bubble]  "Build a todo app"   │
│                                     │
│ 🤖 Analyst  ✓ 2.1s                 │  collapsed
│                                     │
│ ⚡ Provisioner  ✓ 1.5s              │  collapsed
│                                     │
│ 📋 Plan: TaskFlow                   │  collapsible plan card
│   3 tables, 13 files                │
│                                     │
│ 🏗️ Blueprint Engine  ✓ 1.0s        │  collapsed
│                                     │
│ 📝 Code Generator  ● running...     │  EXPANDED
│   src/                              │
│   ├─ components/                    │
│   │   ├─ todo-list.tsx  ✓           │
│   │   └─ todo-form.tsx  ⏳          │
│   └─ routes/                        │
│       └─ todos.tsx  ⏳              │
│                                     │
│ [200/200 credits]                   │
│ [Prompt input bar]                  │
└─────────────────────────────────────┘
```

## Server Changes

### 1. Flatten parallel state detection (`server/routes/agent.ts`)

In `streamActorStates()`, add logic to detect when `snapshot.value` is an object (parallel state). Extract nested sub-state strings and emit appropriate events:

- When `analysis.running` detected → emit `phase_start(1)` + `agent_start('analyst')`
- When `infrastructure.provisioning` detected → emit `phase_start(3)` + `agent_start('provisioner')`
- When sub-states reach `done` → emit `agent_complete` for each

Track previous parallel sub-states to detect transitions within the parallel state.

### 2. Emit `file_complete` in real mode

When transitioning from `generating` to `polishing`, batch-emit `file_complete` for all files in `blueprint.fileTree`. All files are done at this point.

### 3. Remove deploying from pipeline phases

Remove `deploying` from `STATE_PHASES`. Deployment is triggered manually via the Deploy button.

### 4. Emit proper `complete` event

When entering the `complete` state, emit `{ type: 'complete', projectId, urls: { deploy: deploymentUrl } }` if `deploymentUrl` exists in context, otherwise just `stage_update('complete')`.

## Client Changes

### 1. Refactor timeline rendering (`src/components/builder-chat.tsx`)

Replace the collapsed "Pipeline Progress" accordion with inline timeline entries:

```tsx
{timelineEvents.map((entry, i) => {
  switch (entry.type) {
    case 'agent':
      return <AgentCard key={i} entry={entry} isActive={...} />
    case 'plan':
      return <PlanCard key={i} plan={entry.plan} />
    case 'error':
      return <ErrorCard key={i} error={entry.error} />
    case 'complete':
      return <CompletionCard key={i} />
    default:
      return null
  }
})}
```

### 2. AgentCard component

Wraps `Task` from AI Elements:
- `TaskTrigger` shows agent icon + name + duration (when complete)
- `TaskContent` shows:
  - For Code Generator: `FileTree` with per-file status
  - For Analyst: streaming text (from `agent_progress` events)
  - For Validator: pass/fail summary
  - For others: empty (just the header)

### 3. PlanCard component

Wraps `Plan` from AI Elements:
- `PlanTitle` = app name
- `PlanContent` = table names + file count
- Collapsible, defaults to open

### 4. Remove unused rendering

- Remove the "Pipeline Progress" `ChainOfThought` accordion
- Remove the separate `generationFiles` rendering at the bottom
- Remove `Checkpoint` rendering
- FileTree moves inside the Code Generator's `TaskContent`

## Timeline Entry Types (keep existing)

```ts
type TimelineEntry =
  | { type: 'agent'; ts: number; agent: AgentStartEvent; status: 'running' | 'complete'; durationMs?: number }
  | { type: 'plan'; ts: number; plan: Record<string, unknown> }
  | { type: 'error'; ts: number; error: string }
  | { type: 'complete'; ts: number; deploymentUrl?: string }
```

Remove `phase`, `checkpoint`, `commit`, `files`, `message` variants — they're not used in this design.

## Files to Modify

- `server/routes/agent.ts` — Fix parallel state detection, emit file_complete in real mode, remove deploying, emit complete event
- `src/components/builder-chat.tsx` — Replace accordion with inline agent cards
- `src/lib/types.ts` — Simplify TimelineEntry (remove unused variants)

## Files to Create

- None — all components come from existing AI Elements library

## Verification

1. `MOCK_PIPELINE=true bun run dev` → submit "Build a todo app"
2. See agent cards appear one by one: Analyst, Provisioner (parallel), Blueprint Engine, Code Generator (with file tree), Validator, Code Reviewer
3. Active agent is expanded, completed agents collapse to one line with duration
4. Plan card appears between Blueprint Engine and Code Generator
5. Pipeline completes with "Your app is ready!" message
6. Credits update in footer
7. `bunx tsc --noEmit` → zero errors
8. `bun run lint` → zero new errors
