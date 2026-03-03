# Analyst Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Analyst Agent that produces a structured project plan for human approval before the Orchestrator builds the app.

**Architecture:** Separate Mastra Agent (no tools, structured JSON output) called via a `phase: 'analyst'` parameter on `POST /api/agent`. Two-call HITL: analyst streams plan → client shows Approve/Request Changes → second call with `phase: 'build'` runs the Orchestrator. Analyst only runs on first prompts; follow-up edits skip directly to Orchestrator.

**Tech Stack:** Mastra Agent, Zod structured output, Hono SSE, React

---

### Task 1: Create Analyst Agent

**Files:**
- Create: `server/lib/agents/analyst.ts`
- Modify: `server/lib/agents/provider.ts:47-57` (add `analyst` to `PIPELINE_MODELS`)
- Modify: `server/lib/agents/mastra.ts:54-64` (register analyst in Mastra registry)

**Step 1: Create `server/lib/agents/analyst.ts`**

```ts
/**
 * Analyst Agent
 *
 * Pure reasoning agent — no tools. Analyzes user requirements and produces
 * a structured project plan for human approval before building begins.
 */

import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { memory } from './memory'
import { createAgentModelResolver } from './provider'

const analystModel = createAgentModelResolver('analyst')

/** Structured output schema for the project plan */
export const AnalystPlanSchema = z.object({
  projectName: z.string().describe('Short catchy name for the project (e.g. "TaskFlow", "BiteBoard")'),
  features: z
    .array(
      z.object({
        name: z.string().describe('Feature area name (e.g. "Authentication & User Management")'),
        description: z.string().describe('One-line scope description'),
      }),
    )
    .min(3)
    .max(8)
    .describe('Feature areas broken down from the user request'),
})

export type AnalystPlan = z.infer<typeof AnalystPlanSchema>

export const ANALYST_PROMPT = `You are a senior product analyst at a world-class app studio.

Given a user's app description, produce a concise project plan.

## Your Job

1. Read the user's request carefully.
2. Name the project — something catchy and memorable (e.g. "TaskFlow" for a project management app, "BiteBoard" for a recipe app).
3. Break the request into 3-8 feature areas. Each feature has a short name and a one-line description of its scope.
4. Be opinionated — make design decisions, don't punt to the user.
5. If the request is vague ("build me an app"), infer a reasonable interpretation and go with it.

## Rules

- NEVER ask clarifying questions. Always produce a plan.
- Keep feature descriptions to one line (under 100 characters).
- Cover the obvious requirements PLUS 1-2 things the user probably wants but didn't say (e.g. responsive design, dark mode, error handling).
- Order features by implementation priority (foundational first, polish last).`

/**
 * Create a fresh analyst agent instance.
 * No tools — pure reasoning only.
 */
export function createAnalyst(): Agent {
  return new Agent({
    id: 'analyst',
    name: 'Analyst Agent',
    model: analystModel,
    memory,
    description: 'Analyzes user requirements and produces a structured project plan',
    instructions: ANALYST_PROMPT,
    tools: {},
    defaultOptions: {
      maxSteps: 1,
      modelSettings: { temperature: 0.4 },
    },
  })
}
```

**Step 2: Add `analyst` to `PIPELINE_MODELS` in `server/lib/agents/provider.ts`**

In `PIPELINE_MODELS` (line ~47), add:

```ts
analyst: 'gpt-5.2-codex',
```

So it becomes:

```ts
export const PIPELINE_MODELS = {
  orchestrator: 'gpt-5.2-codex',
  analyst: 'gpt-5.2-codex',
  codegen: 'gpt-5.2-codex',
  // ...rest unchanged
}
```

**Step 3: Register analyst in `server/lib/agents/mastra.ts`**

Add import and register:

```ts
import { createAnalyst } from './analyst'

export const mastra = new Mastra({
  agents: {
    orchestrator: createOrchestrator(),
    analyst: createAnalyst(),
  },
  // ...rest unchanged
})
```

**Step 4: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/lib/agents/analyst.ts server/lib/agents/provider.ts server/lib/agents/mastra.ts
git commit -m "feat: add Analyst Agent (no tools, structured plan output)"
```

---

### Task 2: Update SSE Types for `plan_ready` event

The `PlanReadyEvent` already exists in both `server/lib/types.ts` and `src/lib/types.ts`, but with the old pipeline's loose shape (`plan: Record<string, unknown>`). Update it to match the Analyst's structured output.

**Files:**
- Modify: `server/lib/types.ts:396-400`
- Modify: `src/lib/types.ts:392-402`

**Step 1: Update server `PlanReadyEvent` in `server/lib/types.ts`**

Replace:

```ts
export interface PlanReadyEvent {
  type: 'plan_ready'
  runId?: string
  plan: Record<string, unknown>
}
```

With:

```ts
export interface PlanReadyEvent {
  type: 'plan_ready'
  plan: {
    projectName: string
    features: Array<{ name: string; description: string }>
  }
}
```

Also add `PlanReadyEvent` to the `AgentStreamEvent` union (line ~573) if not already there:

```ts
export type AgentStreamEvent =
  | ThinkingEvent
  | ToolStartEvent
  | ToolCompleteEvent
  | DoneEvent
  | AgentErrorEvent
  | SandboxReadyEvent
  | PackageInstalledEvent
  | CreditsUsedEvent
  | PlanReadyEvent
```

**Step 2: Update client `PlanReadyEvent` in `src/lib/types.ts`**

Same change — replace the old `PlanReadyEvent` (line ~392):

```ts
export interface PlanReadyEvent {
  type: 'plan_ready'
  plan: {
    projectName: string
    features: Array<{ name: string; description: string }>
  }
}
```

**Step 3: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: May produce errors in `use-agent-stream.ts` where `plan.appName` was referenced — fix those in the next task.

**Step 4: Commit**

```bash
git add server/lib/types.ts src/lib/types.ts
git commit -m "refactor: update PlanReadyEvent to structured analyst output"
```

---

### Task 3: Add phase routing to agent route

**Files:**
- Modify: `server/routes/agent.ts`

**Step 1: Add `phase` to request schema (line ~36)**

```ts
const AgentRequest = z.object({
  message: z.string().min(1).describe('User prompt describing the app to build or change'),
  projectId: z.string().uuid().describe('Project ID to run the agent against'),
  model: z
    .string()
    .optional()
    .default('gpt-5.2-codex')
    .describe('Model identifier — gpt-5.2-codex | claude-opus-4-6 | claude-sonnet-4-6'),
  phase: z
    .enum(['analyst', 'build'])
    .optional()
    .default('build')
    .describe('Pipeline phase — analyst produces a plan, build runs the orchestrator'),
})
```

**Step 2: Add analyst import at top of file**

```ts
import { createAnalyst, AnalystPlanSchema } from '../lib/agents/analyst'
```

**Step 3: Add analyst bridge function (after `bridgeStreamToSSE`)**

```ts
/**
 * Run the Analyst agent and emit a plan_ready event.
 * The analyst is a pure reasoning agent — no tools, just structured output.
 */
async function runAnalystPhase(
  emit: (event: AgentStreamEvent | CreditsUsedEvent) => void,
  signal: AbortSignal,
  meta: {
    message: string
    projectId: string
    userId: string
    model: string
    requestContext: RequestContext
  },
): Promise<{ totalTokens: number }> {
  const provider = MODEL_CONFIGS[meta.model]?.provider ?? 'openai'
  const agent = createAnalyst()
  agent.__registerMastra(mastra)

  emit({ type: 'thinking', content: '' })

  const streamOutput = await agent.stream(meta.message, {
    requestContext: meta.requestContext,
    memory: {
      thread: meta.projectId,
      resource: meta.userId,
    },
    maxSteps: 1,
    abortSignal: signal,
    structuredOutput: { schema: AnalystPlanSchema },
  })

  // Collect thinking text
  let thinkingText = ''
  const reader = streamOutput.fullStream.getReader()

  try {
    while (true) {
      if (signal.aborted) break
      const { done, value: chunk } = await reader.read()
      if (done) break
      if (!chunk?.type) continue

      const payload = (chunk as any).payload ?? chunk

      if (chunk.type === 'text-delta') {
        const text = payload.textDelta ?? chunk.textDelta ?? ''
        if (text) {
          thinkingText += text
          if (thinkingText.length > 100) {
            emit({ type: 'thinking', content: thinkingText })
            thinkingText = ''
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  // Flush remaining thinking
  if (thinkingText) {
    emit({ type: 'thinking', content: thinkingText })
  }

  // Extract structured plan
  let plan: { projectName: string; features: Array<{ name: string; description: string }> }
  try {
    const output = await streamOutput.object
    plan = AnalystPlanSchema.parse(output)
  } catch {
    // Fallback: try to parse from text
    const text = await streamOutput.text
    plan = { projectName: 'App', features: [{ name: 'Core Features', description: text.slice(0, 200) }] }
  }

  // Emit plan_ready
  emit({ type: 'plan_ready', plan })

  // Get token usage
  let totalTokens = 0
  try {
    const usage = await streamOutput.usage
    if (usage?.totalTokens) totalTokens = usage.totalTokens
  } catch {
    // Usage may not be available
  }

  return { totalTokens }
}
```

**Step 4: Add phase routing in the main handler (line ~431, after body parsing)**

After `const { message, projectId, model = 'gpt-5.2-codex' } = body`, add:

```ts
const phase = (body as { phase?: string }).phase ?? 'build'
```

Then in the `createSSEStream` callback (around line 475), add a branch before the existing orchestrator logic:

```ts
return createSSEStream<AgentStreamEvent | CreditsUsedEvent>(async (emit, signal) => {
  let settled = false

  try {
    // ── Analyst phase ────────────────────────────────────────────
    if (phase === 'analyst') {
      const result = await traceAgent(`analyst:${model}`, async () => {
        return runAnalystPhase(emit, signal, {
          message,
          projectId,
          userId: user.id,
          model,
          requestContext,
        })
      }) as { totalTokens: number }

      // Settle credits (analyst is cheap)
      const creditsUsed = Math.ceil(result.totalTokens / 1000)
      const settlement = await settleCredits(user.id, CREDIT_RESERVATION, creditsUsed)
      settled = true

      emit({
        type: 'credits_used',
        creditsUsed,
        creditsRemaining: settlement.creditsRemaining,
        tokensTotal: result.totalTokens,
      })
      return
    }

    // ── Build phase (existing orchestrator logic) ────────────────
    const provider = MODEL_CONFIGS[model]?.provider ?? 'openai'
    // ... rest of existing code unchanged
```

**Step 5: Update OpenAPI description to include phase parameter**

In the `describeRoute` properties, add:

```ts
phase: {
  type: 'string',
  enum: ['analyst', 'build'],
  default: 'build',
  description: 'Pipeline phase — analyst produces a plan, build runs the orchestrator',
},
```

**Step 6: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add server/routes/agent.ts
git commit -m "feat: add analyst phase routing to /api/agent"
```

---

### Task 4: Update client hook to use two-call pattern

**Files:**
- Modify: `src/hooks/use-agent-stream.ts`

**Step 1: Track whether this is a first message (needs analyst)**

Add state near line 131:

```ts
const [planApproved, setPlanApproved] = useState(false)
```

**Step 2: Update `sendChatMessage` to send `phase: 'analyst'` on first prompt**

In the `sendChatMessage` callback (line ~815), update the body construction:

```ts
// Determine phase: analyst for first prompt (no prior messages), build otherwise
const isFirstMessage = messages.length === 0 && persistedMessages.length === 0
const phase = isFirstMessage && !planApproved ? 'analyst' : 'build'

const body = selectedElement
  ? { message: text, projectId, targetElement: selectedElement, model }
  : { message: text, projectId, model, phase }
```

**Step 3: Update `handlePlanApprove` to use the two-call pattern**

Replace the existing `handlePlanApprove` (line ~1027) with:

```ts
const handlePlanApprove = useCallback(async () => {
  setPendingPlan(null)
  setPlanApproved(true)

  // Send a build-phase message — orchestrator reads the approved plan from memory
  sendChatMessage('Plan approved. Proceed with building the app.')
}, [sendChatMessage])
```

**Step 4: Add `handleRequestChanges` callback**

After `handlePlanApprove`:

```ts
const handleRequestChanges = useCallback(() => {
  setPendingPlan(null)
  // Focus the input bar — user types feedback, sends as another analyst call
  // (No state change needed — the next sendChatMessage will check messages.length > 0
  //  but planApproved is still false, so we need a flag)
}, [])
```

Actually, simpler: when the user clicks "Request Changes", just clear the plan and let them type. The next message should go to the analyst again. Add a `needsReplan` ref:

```ts
const needsReplan = useRef(false)
```

Update phase detection:

```ts
const phase = (isFirstMessage || needsReplan.current) && !planApproved ? 'analyst' : 'build'
if (needsReplan.current && phase === 'analyst') needsReplan.current = false
```

And `handleRequestChanges`:

```ts
const handleRequestChanges = useCallback(() => {
  setPendingPlan(null)
  needsReplan.current = true
}, [])
```

**Step 5: Export `handleRequestChanges` in the return object**

Add to return type and return object:

```ts
handleRequestChanges: () => void
// ...
handleRequestChanges,
```

**Step 6: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/hooks/use-agent-stream.ts
git commit -m "feat: update agent hook for two-call analyst/build pattern"
```

---

### Task 5: Update chat column to render plan + HITL buttons

**Files:**
- Modify: `src/components/chat-column.tsx`

**Step 1: Import `handleRequestChanges` from hook**

The hook already exports `handlePlanApprove`. Destructure `handleRequestChanges` too:

```ts
const {
  // ... existing
  handlePlanApprove,
  handleRequestChanges,
  pendingPlan,
  // ...
} = useAgentStream({ ... })
```

**Step 2: Render PlanBlock + HitlActions when `pendingPlan` is set**

Find where `pendingPlan` is currently rendered (search for `pendingPlan` in the JSX). It should already be there from the old pipeline code. Update it to:

```tsx
{pendingPlan && (
  <div className="flex flex-col gap-3">
    <PlanBlock
      title={`Project Plan — ${pendingPlan.projectName}`}
      items={pendingPlan.features.map((f) => ({
        title: f.name,
        description: f.description,
      }))}
    />
    <HitlActions
      onApprove={handlePlanApprove}
      onRequestChanges={handleRequestChanges}
    />
  </div>
)}
```

**Step 3: Import PlanBlock and HitlActions**

These should already be imported. Verify:

```ts
import { PlanBlock } from '@/components/ai-elements/plan-block'
import { HitlActions } from '@/components/ai-elements/hitl-actions'
```

**Step 4: Run typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/chat-column.tsx
git commit -m "feat: render analyst plan with HITL approve/reject buttons"
```

---

### Task 6: Update HitlActions styling (Approve = Deploy button style)

**Files:**
- Modify: `src/components/ai-elements/hitl-actions.tsx`

**Step 1: Update the approved state to use emerald-600 (matching deployed button)**

The current approved state uses a light green badge. Change it to match the prototype's approved state (green pill like the deployed button):

```tsx
{approved ? (
  <span className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-medium bg-emerald-600 text-white">
    <CheckCircle2 size={14} />
    Approved
  </span>
) : (
```

The Approve button already uses `bg-primary text-primary-foreground` which matches the Deploy button. No change needed there.

**Step 2: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ai-elements/hitl-actions.tsx
git commit -m "style: update approved state to emerald-600 (matches deploy)"
```

---

### Task 7: Verify end-to-end (manual test)

**Step 1: Start dev server**

Run: `bun run dev`

**Step 2: Navigate to a project**

Open `http://localhost:3000/dashboard`, create/open a project.

**Step 3: Send a first message**

Type "Build me a project management app with kanban boards" and send.

Expected:
- Request goes to `POST /api/agent` with `phase: 'analyst'`
- SSE streams `thinking` events
- `plan_ready` event arrives with `{ projectName: "...", features: [...] }`
- PlanBlock renders in chat
- Approve / Request Changes buttons appear below

**Step 4: Click Approve**

Expected:
- Buttons change to green "Approved" pill
- Second request goes to `POST /api/agent` with `phase: 'build'`
- Orchestrator runs normally (sandbox, files, build, etc.)

**Step 5: Test Request Changes**

On a fresh project, send a message, then click "Request Changes".
Type feedback like "Add a calendar view too".

Expected:
- Plan clears, input bar is ready
- Next message goes with `phase: 'analyst'` again
- New plan arrives with updated features

**Step 6: Test follow-up (should skip analyst)**

After the first build completes, send "Change the header color to blue".

Expected:
- Goes directly to `phase: 'build'` (no analyst plan)
- Orchestrator edits files directly

---

### Task 8: Final verification and commit

**Step 1: Run full checks**

```bash
bunx tsc --noEmit
bun run lint
bun run test
```

**Step 2: Fix any issues found**

**Step 3: Final commit if needed**

```bash
git add -A
git commit -m "chore: fix lint/type issues from analyst agent integration"
```
