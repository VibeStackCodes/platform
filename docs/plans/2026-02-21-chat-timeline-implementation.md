# Chat Timeline — Inline Agent Cards — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the collapsed "Pipeline Progress" accordion with inline agent cards that appear one by one in the chat stream as the backend pipeline runs, giving users full visibility into generation progress.

**Architecture:** Three changes: (1) Fix the server's `streamActorStates()` to emit SSE events for the parallel `preparing` state and batch-emit `file_complete` in real mode. (2) Simplify the `TimelineEntry` type to only the 4 variants we use. (3) Refactor `builder-chat.tsx` rendering to replace the `ChainOfThought` accordion with flat inline agent `Task` cards, `Plan` cards, `StackTrace` errors, and a completion banner.

**Tech Stack:** XState (state machine), Hono SSE (server streaming), React 19 + AI Elements library (`Task`, `Plan`, `FileTree`, `StackTrace`), Vitest (tests)

---

### Task 1: Fix parallel state SSE emission

The XState `preparing` state is `type: 'parallel'` with two child sub-machines: `analysis` and `infrastructure`. When active, `snapshot.value` is an object like `{ preparing: { analysis: 'running', infrastructure: 'provisioning' } }`, NOT a flat string. The current `streamActorStates()` does `STATE_PHASES[state]` which fails for objects — so **zero events fire** during the first ~5-10s of pipeline execution.

**Files:**
- Modify: `server/routes/agent.ts:111-293`

**Step 1: Add parallel state flattening helper**

At the top of `streamActorStates()` (after line 126), add a helper function that extracts active sub-state names from a parallel state value:

```ts
/** Extract flat sub-state names from parallel state objects.
 * e.g. { preparing: { analysis: 'running', infrastructure: 'provisioning' } }
 * → ['analyzing', 'provisioning']
 * Maps sub-state machine names to STATE_PHASES keys.
 */
function flattenParallelState(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null) return []
  const result: string[] = []
  for (const childState of Object.values(value as Record<string, unknown>)) {
    if (typeof childState === 'string') {
      // Map sub-state names to STATE_PHASES keys
      // analysis.running → 'analyzing', infrastructure.provisioning → 'provisioning'
      const mapped = childState === 'running' ? null : childState
      if (mapped) result.push(mapped)
    } else if (typeof childState === 'object' && childState !== null) {
      result.push(...flattenParallelState(childState))
    }
  }
  return result
}
```

Wait — the sub-state values are `'running'`, `'awaitingClarification'`, `'done'` for analysis, and `'provisioning'`, `'done'` for infrastructure. But `STATE_PHASES` has keys `'analyzing'` and `'provisioning'`. The sub-state `'running'` under `analysis` means the analyst is running. So we need a mapping:

```ts
// Map parallel sub-state paths to STATE_PHASES keys
const PARALLEL_STATE_MAP: Record<string, Record<string, string>> = {
  analysis: {
    running: 'analyzing',
    awaitingClarification: 'awaitingClarification',
    done: '', // skip
  },
  infrastructure: {
    provisioning: 'provisioning',
    done: '', // skip
  },
}
```

**Step 2: Track parallel sub-state transitions**

Replace the current single `previousState` string with a set-based tracking that handles both flat string states and parallel sub-states. Add this state alongside the existing tracking:

```ts
let previousParallelSubStates = new Set<string>()
```

**Step 3: Update the subscription callback**

Replace the body of the `actor.subscribe` callback. The key change: when `snapshot.value` is an object (parallel state), flatten it into sub-state keys, diff against `previousParallelSubStates`, and emit `agent_start`/`agent_complete` for each new/departed sub-state.

In the subscription handler, BEFORE the existing `if (!phaseInfo) { return }` check at line 148, add:

```ts
// Handle parallel state (preparing): snapshot.value is an object, not a string
if (typeof snapshot.value === 'object' && snapshot.value !== null) {
  const currentSubStates = new Set<string>()
  const stateObj = snapshot.value as Record<string, Record<string, string>>

  for (const [branch, subStateMap] of Object.entries(PARALLEL_STATE_MAP)) {
    const subVal = stateObj.preparing?.[branch]
    if (typeof subVal === 'string') {
      const mappedKey = subStateMap[subVal]
      if (mappedKey) currentSubStates.add(mappedKey)
    }
  }

  // Emit agent_complete for sub-states that just finished
  for (const prev of previousParallelSubStates) {
    if (!currentSubStates.has(prev)) {
      const prevPhase = STATE_PHASES[prev]
      if (prevPhase?.agentId) {
        const entryTime = stateEntryTimes.get(prev)
        const durationMs = entryTime ? Date.now() - entryTime : 0
        emit({ type: 'agent_complete', agentId: prevPhase.agentId, tokensUsed: 0, durationMs })
      }
    }
  }

  // Emit agent_start for newly appeared sub-states
  for (const curr of currentSubStates) {
    if (!previousParallelSubStates.has(curr)) {
      stateEntryTimes.set(curr, Date.now())
      const phase = STATE_PHASES[curr]
      if (phase) {
        emit({ type: 'phase_start', phase: phase.phase, phaseName: phase.name, agentCount: 1 })
        if (phase.agentId && phase.agentName) {
          emit({ type: 'agent_start', agentId: phase.agentId, agentName: phase.agentName, phase: phase.phase })
        }
      }
    }
  }

  previousParallelSubStates = currentSubStates
  return // Skip the flat-string logic below
}

// Reset parallel tracking when leaving parallel state
if (previousParallelSubStates.size > 0) {
  // Emit agent_complete for any remaining parallel sub-states
  for (const prev of previousParallelSubStates) {
    const prevPhase = STATE_PHASES[prev]
    if (prevPhase?.agentId) {
      const entryTime = stateEntryTimes.get(prev)
      const durationMs = entryTime ? Date.now() - entryTime : 0
      emit({ type: 'agent_complete', agentId: prevPhase.agentId, tokensUsed: 0, durationMs })
    }
  }
  previousParallelSubStates = new Set()
}
```

**Step 4: Run TypeScript check**

Run: `bunx tsc --noEmit --project tsconfig.server.json`
Expected: 0 errors

**Step 5: Commit**

```bash
git add server/routes/agent.ts
git commit -m "fix: emit SSE events for parallel preparing state"
```

---

### Task 2: Emit `file_complete` in real mode + remove deploying from phases

Currently `file_complete` only fires in mock mode (the `if (mockMode)` block at line 272). In real mode, files stay `status: 'generating'` forever. Fix: when transitioning from `generating` to the next state (polishing), batch-emit `file_complete` for all files.

Also remove `deploying` from `STATE_PHASES` since deployment is now manual (via Deploy button).

**Files:**
- Modify: `server/routes/agent.ts:74-87` (STATE_PHASES), `server/routes/agent.ts:152-171` (agent_complete emission)

**Step 1: Remove deploying from STATE_PHASES**

In `STATE_PHASES` (line 84), delete the `deploying` entry:

```ts
// DELETE this line:
deploying: { name: 'Deploying application', phase: 6, agentId: 'deployer', agentName: 'Deployer' },
```

Keep the `complete` and `failed` entries — they're still needed for final event emission.

**Step 2: Emit file_complete when leaving generating state**

In the `agent_complete` emission block (lines 152-171), AFTER emitting `agent_complete` for the previous state, add a check: if the previous state was `generating`, batch-emit `file_complete` for all files:

```ts
// When leaving 'generating', mark all files as complete
if (previousState === 'generating') {
  const files = snapshot.context.blueprint?.fileTree?.map((f: { path: string }) => f.path) ?? []
  for (const filePath of files) {
    emit({ type: 'file_complete', path: filePath, linesOfCode: 0 })
  }
}
```

Insert this AFTER the `emit({ type: 'checkpoint' ... })` call at line 168, inside the `if (previousState && previousState !== state)` block.

**Step 3: Run TypeScript check**

Run: `bunx tsc --noEmit --project tsconfig.server.json`
Expected: 0 errors

**Step 4: Commit**

```bash
git add server/routes/agent.ts
git commit -m "fix: emit file_complete in real mode, remove deploying from phases"
```

---

### Task 3: Simplify TimelineEntry type

The current `TimelineEntry` has 9 variants but we only use 4 per the design. Remove unused variants to prevent rendering dead code paths.

**Files:**
- Modify: `src/lib/types.ts:450-459`
- Modify: `server/lib/types.ts:450-459` (keep in sync)

**Step 1: Replace the TimelineEntry type in both files**

Replace the current `TimelineEntry` (lines 450-459 in both files) with:

```ts
export type TimelineEntry =
  | { type: 'agent'; ts: number; agent: AgentStartEvent; status: 'running' | 'complete'; durationMs?: number }
  | { type: 'plan'; ts: number; plan: Record<string, unknown> }
  | { type: 'error'; ts: number; error: string }
  | { type: 'complete'; ts: number; deploymentUrl?: string }
```

Removed: `message`, `phase`, `files`, `checkpoint`, `commit` — none are rendered in the new design.

**Step 2: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: Some errors in `builder-chat.tsx` for the removed `phase`, `checkpoint`, `commit` cases — that's expected. We'll fix those in Task 4.

**Step 3: Commit**

```bash
git add src/lib/types.ts server/lib/types.ts
git commit -m "refactor: simplify TimelineEntry to 4 variants"
```

---

### Task 4: Refactor builder-chat.tsx — remove old rendering

Strip out the `ChainOfThought` accordion wrapper, remove rendering for `phase`, `checkpoint`, `commit` timeline entries, and remove the separate file tree at the bottom.

**Files:**
- Modify: `src/components/builder-chat.tsx`

**Step 1: Remove unused imports**

Remove these imports that are no longer needed:

```ts
// DELETE these imports:
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from '@/components/ai-elements/checkpoint'
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import {
  Commit, CommitContent, CommitFile, CommitFileIcon, CommitFileInfo,
  CommitFilePath, CommitFileStatus, CommitFiles, CommitHash,
  CommitHeader, CommitInfo, CommitMessage,
} from '@/components/ai-elements/commit'
```

Also remove the `Sparkles` import from lucide-react (used only in the old "Generated Files" task trigger).

**Step 2: Remove the `dedupedPhases` memo**

Delete lines 702-711 (the `useMemo` that deduplicates phase entries) — no longer needed since we don't render phase entries.

**Step 3: Remove `phase_start` and `phase_complete` from handleGenerationEvent**

In the `handleGenerationEvent` switch statement:
- Remove the `case 'phase_start'` block (lines 351-358)
- Remove the `case 'phase_complete'` block (lines 360-365)
- Remove the `case 'checkpoint'` block (lines 445-451)
- Remove the `case 'layer_commit'` block (lines 453-455)

**Step 4: Replace the timeline rendering section**

Replace the entire `{showTimeline && ( ... )}` block (lines 793-1018) with the new flat rendering:

```tsx
{/* ── Inline Timeline ── */}
{showTimeline && (
  <div className="space-y-3 px-4 py-3">
    {timelineEvents.map((entry) => {
      switch (entry.type) {
        case 'agent': {
          const isComplete = entry.status === 'complete'
          const isCodegen = entry.agent.agentId === 'codegen'
          return (
            <Task
              key={`agent-${entry.agent.agentId}-${entry.ts}`}
              defaultOpen={!isComplete}
            >
              <TaskTrigger title={entry.agent.agentName}>
                <div className="flex w-full cursor-pointer items-center gap-2 text-sm transition-colors hover:text-foreground">
                  {isComplete ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                  ) : (
                    <Cog className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  <span className={isComplete ? 'text-muted-foreground' : 'text-foreground'}>
                    {entry.agent.agentName}
                  </span>
                  {isComplete && entry.durationMs != null && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {formatDuration(entry.durationMs)}
                    </span>
                  )}
                </div>
              </TaskTrigger>
              {/* Show file tree inside Code Generator */}
              {isCodegen && hasFiles && (
                <TaskContent>
                  <GeneratedFileTree files={generationFiles} />
                </TaskContent>
              )}
            </Task>
          )
        }

        case 'plan':
          return (
            <Plan key={`plan-${entry.ts}`} defaultOpen>
              <PlanHeader>
                <div>
                  <PlanTitle>
                    {(entry.plan.appName as string) || 'App Blueprint'}
                  </PlanTitle>
                  <PlanDescription>
                    {Array.isArray(entry.plan.tables) && entry.plan.tables.length > 0
                      ? `${entry.plan.tables.length} tables \u00b7 ${typeof entry.plan.fileCount === 'number' ? entry.plan.fileCount : '?'} files`
                      : (entry.plan.appDescription as string) || 'Generation plan ready'}
                  </PlanDescription>
                </div>
                <PlanAction>
                  <PlanTrigger />
                </PlanAction>
              </PlanHeader>
              <PlanContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {Array.isArray(entry.plan.tables) &&
                    entry.plan.tables.length > 0 && (
                      <p>
                        Tables:{' '}
                        {(entry.plan.tables as string[]).join(', ')}
                      </p>
                    )}
                </div>
              </PlanContent>
            </Plan>
          )

        case 'error':
          return (
            <StackTrace
              key={`error-${entry.ts}`}
              trace={entry.error}
              defaultOpen
            >
              <StackTraceHeader>
                <StackTraceError>
                  <StackTraceErrorType>Pipeline Error</StackTraceErrorType>
                  <StackTraceErrorMessage>
                    {entry.error}
                  </StackTraceErrorMessage>
                </StackTraceError>
                <StackTraceActions>
                  <StackTraceCopyButton />
                  <StackTraceExpandButton />
                </StackTraceActions>
              </StackTraceHeader>
              <StackTraceContent>
                <StackTraceFrames showInternalFrames={false} />
              </StackTraceContent>
            </StackTrace>
          )

        case 'complete':
          return (
            <div
              key={`complete-${entry.ts}`}
              className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400"
            >
              <Rocket className="size-4" />
              <span>Your app is ready!</span>
            </div>
          )

        default:
          return null
      }
    })}

    {/* Build Errors (outside timeline entries) */}
    {buildErrors.length > 0 && (
      <div className="space-y-2">
        {buildErrors.map((err) => (
          <StackTrace
            key={`${err.file}-${err.message}`}
            trace={err.raw}
            defaultOpen={false}
          >
            <StackTraceHeader>
              <StackTraceError>
                <StackTraceErrorType>Build Error</StackTraceErrorType>
                <StackTraceErrorMessage>
                  {err.message}
                </StackTraceErrorMessage>
              </StackTraceError>
              <StackTraceActions>
                <StackTraceCopyButton />
                <StackTraceExpandButton />
              </StackTraceActions>
            </StackTraceHeader>
            <StackTraceContent>
              <StackTraceFrames showInternalFrames={false} />
            </StackTraceContent>
          </StackTrace>
        ))}
      </div>
    )}
  </div>
)}
```

**Step 5: Run TypeScript check**

Run: `bunx tsc --noEmit`
Expected: 0 errors

**Step 6: Run lint**

Run: `bun run lint`
Expected: 0 new errors (pre-existing only)

**Step 7: Commit**

```bash
git add src/components/builder-chat.tsx
git commit -m "feat: inline agent cards in chat timeline"
```

---

### Task 5: Verify with mock pipeline

Start the dev server with mock mode enabled and visually verify the new timeline renders correctly.

**Step 1: Start the dev server**

```bash
MOCK_PIPELINE=true bun run dev
```

**Step 2: Navigate to a project**

Open `http://localhost:3000` in a browser, log in (or use mock auth), create a project and submit "Build a todo app".

**Step 3: Verify these behaviors**

- [ ] Agent cards appear one by one as agents start (Analyst, Provisioner appear simultaneously)
- [ ] Active agent has spinning Cog icon and expanded card
- [ ] Completed agents have green CheckCircle2 icon, collapsed card, and duration badge
- [ ] Plan card appears after blueprint phase with app name, table count, file count
- [ ] File tree appears inside the Code Generator agent card with per-file status indicators
- [ ] Files transition from spinning (generating) to green check (complete)
- [ ] Pipeline completes with green "Your app is ready!" banner
- [ ] Credits update in the footer
- [ ] No "Pipeline Progress" accordion — everything is flat inline
- [ ] Stop button works (aborts stream)

**Step 4: Run the full test suite**

Run: `bun run test`
Expected: All tests pass (may need to update tests that reference removed timeline types)

**Step 5: Commit any test fixes**

```bash
git add -A
git commit -m "test: fix tests for timeline refactor"
```

---

### Task 6: Update existing tests

Some tests may reference the removed `TimelineEntry` variants (`phase`, `checkpoint`, `commit`, `files`, `message`). Find and update them.

**Step 1: Search for broken references**

```bash
bunx tsc --noEmit 2>&1 | grep -i "timeline\|phase.*entry\|checkpoint.*entry"
```

Also search for test files referencing old variants:

```bash
grep -rn "type: 'phase'\|type: 'checkpoint'\|type: 'commit'\|type: 'files'\|type: 'message'" tests/
```

**Step 2: Fix any broken test code**

For each test referencing removed timeline types:
- If the test is testing removed rendering (phase steps, checkpoints), delete the test
- If the test is testing the event handler, update to use the remaining types (`agent`, `plan`, `error`, `complete`)

**Step 3: Run full test suite**

Run: `bun run test`
Expected: All pass

**Step 4: Run full verification**

Run: `bunx tsc --noEmit && bun run lint && bun run test`
Expected: All green

**Step 5: Commit**

```bash
git add -A
git commit -m "test: update tests for simplified timeline"
```
