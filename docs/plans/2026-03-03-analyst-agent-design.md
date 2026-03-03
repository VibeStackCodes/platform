# Analyst Agent Design

**Date**: 2026-03-03
**Branch**: `feature/parity`
**Status**: Approved

## Summary

Add an Analyst Agent as a separate Mastra Agent that runs before the Orchestrator on first prompts. It analyzes the user's request and produces a structured project plan for human approval before building begins.

## Architecture

### Analyst Agent (`server/lib/agents/analyst.ts`)

- Separate Mastra `Agent` — own system prompt, no tools (pure reasoning)
- Structured output via Zod:
  ```ts
  z.object({
    projectName: z.string(),
    features: z.array(z.object({
      name: z.string(),
      description: z.string(),
    })).min(3).max(8),
  })
  ```
- Uses `createAgentModelResolver('analyst')` — respects user-selected model
- Shares Mastra memory (thread = projectId) so Orchestrator reads the plan

### Two-Call HITL Flow

```
1. POST /api/agent { phase: "analyst", message: "Build me..." }
   -> SSE: thinking -> plan_ready { plan }
   -> Client shows Approve / Request Changes

2a. POST /api/agent { phase: "build", message: "Plan approved. Proceed." }
    -> SSE: tool_start -> tool_complete -> done

2b. POST /api/agent { phase: "analyst", message: "Change X" }
    -> SSE: thinking -> plan_ready { revisedPlan }
```

### Smart Routing

- First message on a project -> client sends `phase: 'analyst'`
- Follow-up edits ("change header") -> client sends `phase: 'build'` (skip analyst)
- "Request Changes" -> client re-sends `phase: 'analyst'` with feedback
- The client controls routing, not the server

### Route Changes (`server/routes/agent.ts`)

Add `phase` field to request schema:
```ts
phase: z.enum(['analyst', 'build']).optional().default('build')
```

- `phase: 'analyst'`: Run Analyst agent, stream thinking, emit `plan_ready` with structured JSON
- `phase: 'build'`: Run Orchestrator (existing behavior, unchanged)

### New SSE Event

```ts
interface PlanReadyEvent {
  type: 'plan_ready'
  plan: {
    projectName: string
    features: Array<{ name: string; description: string }>
  }
}
```

Added to `AgentStreamEvent` union in both `server/lib/types.ts` and `src/lib/types.ts`.

## Client Components

### PlanBlock (`src/components/ai-elements/plan-block.tsx`)

Renders the structured plan in a card:
- Project name as heading (bold)
- Numbered feature list with name (bold) + description
- Styled as a subtle card (bg-card border rounded-lg)

### HITLButtons (`src/components/ai-elements/hitl-buttons.tsx`)

Two states:
- **Active**: "Approve" (`bg-primary text-primary-foreground`, same as Deploy button) + "Request Changes" (outline variant)
- **Done**: "Approved" (`bg-emerald-600 text-white`, same as deployed state, disabled)

### Chat Column Changes

- Handle `plan_ready` events -> render PlanBlock + HITLButtons
- Approve click -> send `phase: 'build'` request, flip buttons to done state
- Request Changes click -> focus input bar for user feedback

## Agent Visual Identity

- **Icon**: Search/magnifying glass (Lucide `Search`)
- **Color**: `--agent-analyst` = muted green (oklch equivalent of `#788c5d`)
- **Name**: "Analyst Agent"
- **Timer**: Shows elapsed seconds

## Files

| File | Action |
|------|--------|
| `server/lib/agents/analyst.ts` | Create |
| `server/lib/agents/provider.ts` | Edit — add `analyst` to `PIPELINE_MODELS` |
| `server/lib/agents/mastra.ts` | Edit — register analyst agent |
| `server/routes/agent.ts` | Edit — add phase routing + analyst bridge |
| `server/lib/types.ts` | Edit — add `PlanReadyEvent` to SSE union |
| `src/components/ai-elements/plan-block.tsx` | Create |
| `src/components/ai-elements/hitl-buttons.tsx` | Create |
| `src/components/chat-column.tsx` | Edit — handle plan_ready, render PlanBlock + HITL |
| `src/lib/types.ts` | Edit — add `PlanReadyEvent` to client types |
