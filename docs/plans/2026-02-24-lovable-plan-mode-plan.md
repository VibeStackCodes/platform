# Phase 2: Plan Mode — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `planning` wait state to the XState machine so the architect's plan is shown to the user for approval before code generation begins.

**Architecture:** Mirror the existing `awaitingClarification` suspend/resume pattern. After `architecting` completes, the machine enters a `planning` wait state. The SSE stream emits `plan_ready` with a `runId`. The client renders a plan approval card. The user approves → client POSTs `/api/agent/approve-plan` → machine receives `PLAN_APPROVED` → transitions to `codeGeneration`.

**Tech Stack:** XState v5, Hono, React 19, SSE streaming

---

### Task 1: Add PLAN_APPROVED Event & Planning State to XState Machine

**Files:**
- Modify: `server/lib/agents/machine.ts:66-89` (MachineEvent union)
- Modify: `server/lib/agents/machine.ts:339-352` (architecting.onDone.target)
- Modify: `server/lib/agents/machine.ts:352` (insert planning state)
- Modify: `server/lib/agents/machine.ts:913-926` (mock machine architecting.onDone.target + planning state)
- Test: `tests/plan-mode.test.ts`

**Step 1: Write the failing test**

Create `tests/plan-mode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createActor } from 'xstate'

describe('Plan mode state machine', () => {
  it('transitions from architecting to planning (not codeGeneration)', async () => {
    // Dynamic import to avoid module-load-time env issues
    const { appGenerationMachine } = await import('@server/lib/agents/machine')
    const machine = appGenerationMachine

    // Verify the machine config has a 'planning' state at the top level
    const states = machine.config.states
    expect(states).toHaveProperty('planning')
  })

  it('planning state transitions to codeGeneration on PLAN_APPROVED', async () => {
    const { appGenerationMachine } = await import('@server/lib/agents/machine')
    const states = appGenerationMachine.config.states as Record<string, any>
    const planning = states.planning

    // Verify planning has a PLAN_APPROVED event handler
    expect(planning.on).toHaveProperty('PLAN_APPROVED')
    expect(planning.on.PLAN_APPROVED.target).toBe('codeGeneration')
  })

  it('planning state has a 30-minute timeout', async () => {
    const { appGenerationMachine } = await import('@server/lib/agents/machine')
    const states = appGenerationMachine.config.states as Record<string, any>
    const planning = states.planning

    // Verify timeout exists (1_800_000ms = 30 minutes)
    expect(planning.after).toBeDefined()
    expect(planning.after).toHaveProperty('1800000')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test tests/plan-mode.test.ts`
Expected: FAIL — no `planning` state exists

**Step 3: Implement the machine changes**

In `server/lib/agents/machine.ts`:

1. Add `PLAN_APPROVED` to `MachineEvent` union (after line 88):
```typescript
  | { type: 'PLAN_APPROVED' }
```

2. Change `architecting.invoke.onDone.target` (line 340) from `'codeGeneration'` to `'planning'`:
```typescript
        onDone: {
          target: 'planning',
```

3. Insert `planning` state after the `architecting` block closing brace (after line 352, before `codeGeneration`):
```typescript
    planning: {
      after: {
        1_800_000: {
          target: 'failed',
          actions: assign({ error: () => 'Plan approval timed out (30 minutes)' }),
        },
      },
      on: {
        PLAN_APPROVED: {
          target: 'codeGeneration',
        },
      },
    },
```

4. Same changes in the mock machine (after line 926): change `target: 'codeGeneration'` to `target: 'planning'` and add `planning` state:
```typescript
    planning: {
      on: {
        PLAN_APPROVED: {
          target: 'codeGeneration',
        },
      },
    },
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test tests/plan-mode.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/machine.ts tests/plan-mode.test.ts
git commit -m "feat: add planning wait state to XState machine"
```

---

### Task 2: Update SSE Route — STATE_PHASES, plan_ready Emit, /approve-plan Endpoint

**Files:**
- Modify: `server/routes/agent.ts:75-85` (STATE_PHASES — add planning entry)
- Modify: `server/routes/agent.ts:101-111` (STATE_TO_DB_STATUS — add planning entry)
- Modify: `server/routes/agent.ts:479-488` (move plan_ready emit to fire on `planning` state, add runId)
- Modify: `server/routes/agent.ts:826-832` (preserve actor when in `planning` state)
- Add: `server/routes/agent.ts` (new POST /approve-plan endpoint after /resume)
- Modify: `src/lib/types.ts:391` (add runId to PlanReadyEvent)
- Test: `tests/plan-mode.test.ts` (add route-level tests)

**Step 1: Write the failing tests**

Append to `tests/plan-mode.test.ts`:

```typescript
import type { PlanReadyEvent } from '@/lib/types'

describe('PlanReadyEvent type', () => {
  it('includes runId field', () => {
    const event: PlanReadyEvent = {
      type: 'plan_ready',
      plan: { appName: 'Test', prd: 'Test PRD' },
      runId: 'run-123',
    }
    expect(event.runId).toBe('run-123')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test tests/plan-mode.test.ts`
Expected: FAIL — `runId` not on PlanReadyEvent

**Step 3: Implement**

1. In `src/lib/types.ts`, add `runId` to `PlanReadyEvent` (after line 392):
```typescript
export interface PlanReadyEvent {
  type: 'plan_ready'
  runId?: string
  plan: {
```

2. In `server/routes/agent.ts`, add to `STATE_PHASES` (after line 79):
```typescript
  planning:             { name: 'Awaiting plan approval',   phase: 2, agentId: 'architect',   agentName: 'Architect Agent' },
```

3. In `STATE_TO_DB_STATUS` (after line 105):
```typescript
  planning: 'planning',
```

4. Change the `plan_ready` emit block (lines 479-488). Replace:
```typescript
        // Emit plan_ready when entering architecting (Analyst PRD is ready)
        if (state === 'architecting') {
```
With:
```typescript
        // Emit plan_ready when entering planning (architect spec is ready, awaiting user approval)
        if (state === 'planning') {
```
And add `runId` to the emitted event:
```typescript
          emit({ type: 'plan_ready', plan, runId })
          persistEvent('plan_ready', { plan, runId })
```

5. Update actor preservation check (lines 826-832). Add `|| stateVal === 'planning'` to the condition:
```typescript
      const isAwaitingClarification =
        (typeof stateVal === 'object' &&
        stateVal !== null &&
        (stateVal as Record<string, any>).preparing?.analysis === 'awaitingClarification') ||
        stateVal === 'planning'
```

6. Add `/approve-plan` endpoint after the `/resume` route (after line ~910):
```typescript
/**
 * POST /api/agent/approve-plan
 * Resume a suspended actor after plan approval
 */
agentRoutes.post('/approve-plan', async (c) => {
  let body: { runId?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { runId } = body
  if (!runId) {
    return c.json({ error: 'Missing runId' }, 400)
  }

  const stored = activeRuns.get(runId)
  if (!stored) {
    return c.json({ error: 'Run not found or expired' }, 404)
  }

  const user = c.var.user
  if (stored.userId !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403)
  }

  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      const streamPromise = streamActorStates(stored.actor, emit, signal, runId, stored.projectId, stored.userId)
      stored.actor.send({ type: 'PLAN_APPROVED' })
      await streamPromise

      const finalSnapshot = stored.actor.getSnapshot()
      const totalTokens = finalSnapshot.context.totalTokens
      const creditsUsed = Math.ceil(totalTokens / 1000)

      if (!stored.settled) {
        const settlement = await settleCredits(user.id, stored.reservedCredits, creditsUsed)
        stored.settled = true
        emit({ type: 'credits_used', creditsUsed, creditsRemaining: settlement.creditsRemaining })
      }
    } catch (err) {
      emit({ type: 'error', message: String(err), stage: 'error' })
    } finally {
      const snapshot = stored.actor.getSnapshot()
      const stateVal = snapshot.value
      if (stateVal !== 'planning') {
        try { stored.actor.stop() } catch {}
        activeRuns.delete(runId)
      }
    }
  })
})
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test tests/plan-mode.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bunx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/routes/agent.ts src/lib/types.ts tests/plan-mode.test.ts
git commit -m "feat: SSE route plan_ready with runId + /approve-plan endpoint"
```

---

### Task 3: Plan Approval UI Card Component

**Files:**
- Create: `src/components/ai-elements/plan-approval-card.tsx`
- Test: `tests/plan-approval-card.test.tsx`

**Step 1: Write the failing test**

Create `tests/plan-approval-card.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PlanApprovalCard } from '@/components/ai-elements/plan-approval-card'

describe('PlanApprovalCard', () => {
  const plan = {
    appName: 'TaskFlow',
    appDescription: 'A task management app',
    prd: '## Features\n- Kanban board\n- User auth',
  }

  it('renders plan details with app name and PRD', () => {
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="pending" />)
    expect(screen.getByText('TaskFlow')).toBeInTheDocument()
    expect(screen.getByText(/Kanban board/)).toBeInTheDocument()
  })

  it('shows approve button when status is pending', () => {
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="pending" />)
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
  })

  it('calls onApprove when approve button is clicked', () => {
    const onApprove = vi.fn()
    render(<PlanApprovalCard plan={plan} onApprove={onApprove} status="pending" />)
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledOnce()
  })

  it('hides approve button when status is approved', () => {
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="approved" />)
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test tests/plan-approval-card.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement**

Create `src/components/ai-elements/plan-approval-card.tsx`:

```tsx
import { CheckCircle2, FileText } from 'lucide-react'
import { ActionCard, ActionCardHeader, ActionCardTabs, ActionCardContent } from './action-card'
import { MessageResponse } from './message-response'

interface PlanApprovalCardProps {
  plan: {
    appName?: string
    appDescription?: string
    prd?: string
  }
  onApprove: () => void
  status: 'pending' | 'approved'
}

export function PlanApprovalCard({ plan, onApprove, status }: PlanApprovalCardProps) {
  const label = status === 'approved'
    ? `Plan approved — ${plan.appName ?? 'App'}`
    : `Review plan — ${plan.appName ?? 'App'}`

  return (
    <ActionCard>
      <ActionCardHeader
        icon="brain"
        label={label}
        status={status === 'approved' ? 'complete' : 'running'}
      />
      <ActionCardTabs>
        <ActionCardContent tab="details">
          <div className="space-y-3">
            {plan.appName && (
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <span className="font-medium">{plan.appName}</span>
              </div>
            )}
            {plan.appDescription && (
              <p className="text-sm text-muted-foreground">{plan.appDescription}</p>
            )}
            {plan.prd && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <MessageResponse content={plan.prd} />
              </div>
            )}
            {status === 'pending' && (
              <button
                type="button"
                onClick={onApprove}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <CheckCircle2 className="size-4" />
                Approve & Generate
              </button>
            )}
          </div>
        </ActionCardContent>
      </ActionCardTabs>
    </ActionCard>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test tests/plan-approval-card.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ai-elements/plan-approval-card.tsx tests/plan-approval-card.test.tsx
git commit -m "feat: PlanApprovalCard component with approve button"
```

---

### Task 4: Wire Plan Approval into Builder Chat

**Files:**
- Modify: `src/components/builder-chat.tsx:275-278` (add pendingPlan/planRunId state)
- Modify: `src/components/builder-chat.tsx:578-583` (update plan_ready case to set state)
- Modify: `src/components/builder-chat.tsx:1034-1061` (add PlanApprovalCard in architect timeline entry)
- Add: handlePlanApprove function (mirrors handleClarificationSubmit)

**Step 1: Write the failing test**

Append to `tests/plan-approval-card.test.tsx`:

```tsx
describe('PlanApprovalCard integration', () => {
  it('renders with plan data from SSE event', () => {
    const plan = {
      appName: 'MyApp',
      appDescription: 'A cool app',
      prd: '## Plan\n- Feature 1\n- Feature 2',
    }
    render(<PlanApprovalCard plan={plan} onApprove={() => {}} status="pending" />)
    expect(screen.getByText('MyApp')).toBeInTheDocument()
    expect(screen.getByText(/Feature 1/)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it passes (component already exists)**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test tests/plan-approval-card.test.tsx`
Expected: PASS

**Step 3: Implement builder-chat.tsx changes**

1. Add import at top:
```typescript
import { PlanApprovalCard } from '@/components/ai-elements/plan-approval-card'
```

2. Add state variables after `resumeRunId` (line ~278):
```typescript
const [pendingPlan, setPendingPlan] = useState<PlanReadyEvent['plan'] | null>(null)
const [planRunId, setPlanRunId] = useState<string | null>(null)
```

3. Update the SSE `plan_ready` case (lines 578-583) to also set state:
```typescript
        case 'plan_ready':
          setPendingPlan(event.plan)
          if (event.runId) setPlanRunId(event.runId)
          updateTimeline(
            (e) => e.type === 'agent' && e.agent.agentId === 'architect',
            (e) => ({ ...e, plan: event.plan }),
          )
          break
```

4. Add `handlePlanApprove` function after `handleClarificationSubmit` (~line 953):
```typescript
  const handlePlanApprove = useCallback(async () => {
    if (!planRunId) return
    setPendingPlan(null)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      const response = await apiFetch('/api/agent/approve-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: planRunId }),
        signal: abortController.signal,
      })

      if (!response.ok) throw new Error(`Plan approval failed: ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        sseBuffer = parseSSEBuffer(sseBuffer, handleGenerationEvent)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Plan approval error:', err)
      }
    } finally {
      setPlanRunId(null)
    }
  }, [planRunId, parseSSEBuffer, handleGenerationEvent])
```

5. In the architect timeline entry (around line 1062-1080 area, the `architect` case), add `PlanApprovalCard` after the architecture ActionCard:
```tsx
{entry.plan && pendingPlan && (
  <PlanApprovalCard
    plan={entry.plan}
    onApprove={handlePlanApprove}
    status={pendingPlan ? 'pending' : 'approved'}
  />
)}
```

**Step 4: Run typecheck**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bunx tsc --noEmit`
Expected: No errors

**Step 5: Run all tests**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test`
Expected: All tests pass (except 3 pre-existing failures in sandbox-urls.test.ts)

**Step 6: Commit**

```bash
git add src/components/builder-chat.tsx
git commit -m "feat: wire plan approval flow into builder chat"
```

---

### Task 5: Update Existing Tests for Plan Mode

**Files:**
- Modify: `tests/orchestrator-deployment.test.ts` (if it references state transitions through architecting→codeGeneration)

**Step 1: Check if existing tests break**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test`

If any tests fail due to the new `planning` state between `architecting` and `codeGeneration`, update them to expect the intermediate state.

**Step 2: Fix any broken tests**

Update state transition expectations to include `planning` → `PLAN_APPROVED` → `codeGeneration` where needed.

**Step 3: Run full suite**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run test`
Expected: All pass (except 3 pre-existing)

**Step 4: Lint check**

Run: `cd /Users/ammishra/VibeStack/platform/.worktrees/lovable-chat-ux && bun run lint`
Expected: No new errors

**Step 5: Commit (if changes needed)**

```bash
git add -A
git commit -m "fix: update tests for planning state transition"
```
