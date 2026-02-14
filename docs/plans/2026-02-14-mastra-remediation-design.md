# Mastra Agent Architecture Remediation

**Date:** 2026-02-14
**Branch:** `feature/mastra-agent-architecture`
**Approach:** Full rewrite to Mastra-native primitives (Approach B)

## Problem

The current implementation uses Mastra agents as structured-output wrappers but misses the framework's core value: tool-calling agents and `createWorkflow` step DAGs. An audit against `@mastra/core@^1.4.0` docs found 4 critical bugs, 3 major architectural gaps, and 3 medium API issues.

### Critical Bugs
1. Planner agent runs 3 times — last invocation uses `DatabaseSchemaArtifactSchema` (wrong schema)
2. Sandbox tools (`createSandboxTools`) never connected to any agent
3. Generated `ExecutionPlan` never passed to phase execution (dummy empty plan used)
4. `assembleTeam()` result is dead code — `runPhase()` reads `PHASE_AGENTS` directly

### Major Gaps
5. Custom AsyncGenerator instead of `createWorkflow` with typed steps
6. No `Mastra` instance — agents/tools not centrally registered
7. Custom `TraceCollector` reimplements built-in observability

### Medium Issues
8. Uses `@ai-sdk/anthropic` — project uses OpenAI (gpt-5.2, gpt-5-mini)
9. `result.totalUsage?.totalTokens` is undocumented
10. `createTool` execute missing `context` parameter

## Design

### Model Routing (OpenAI)

| Tier | Model | Used By |
|------|-------|---------|
| ARCHITECT | `openai/gpt-5.2` | planner, data-architect, frontend-engineer |
| CODEGEN | `openai/gpt-5.1-codex-max` | frontend-engineer (alt for code-heavy tasks) |
| VALIDATOR | `openai/gpt-5-mini` | qa-engineer |

### File Structure

```
lib/agents/
  index.ts          — barrel exports (update)
  schemas.ts        — Zod schemas (keep as-is)
  registry.ts       — agents + Mastra instance (rewrite: OpenAI models, tools)
  tools.ts          — sandbox tools (minor fix: execute signature)
  workflow.ts        — createWorkflow + createStep (rewrite)
  steps.ts          — DELETE (merged into workflow.ts)
  planner.ts        — DELETE (merged into registry.ts)
  observability.ts  — DELETE (replaced by Mastra logger)
```

### Workflow DAG

```
clarifyStep → planStep → parallel([dataArchitectStep, frontendStep]) → qaStep
```

Each step is a `createStep` with typed `inputSchema`/`outputSchema`:

- **clarifyStep**: `{ prompt: string }` → `ClarifiedRequirements`
  - Calls `plannerAgent.generate()` with `ClarifiedRequirementsSchema`
- **planStep**: `ClarifiedRequirements` → `{ requirements, plan }`
  - Calls `plannerAgent.generate()` with `ExecutionPlanSchema`
  - Auto-approves (real suspend/resume deferred to UI phase)
- **dataArchitectStep**: `ClarifiedRequirements` → `DatabaseSchemaArtifact`
  - Calls `dataArchitect.generate()` with `DatabaseSchemaArtifactSchema`
  - No tools needed — produces structured schema only
- **frontendStep**: `ClarifiedRequirements` → `FrontendArtifact`
  - Calls `frontendEngineer.generate()` with `FrontendArtifactSchema`
  - No tools — produces file content in structured output
  - Receives db schema from parallel merge
- **qaStep**: `FrontendArtifact + DatabaseSchemaArtifact` → `QAResultArtifact`
  - Calls `qaEngineer.generate()` with sandbox tools (`runBuild`, `writeFile`, `readFile`)
  - Tools passed at generate-time (sandbox-bound, not static)

### Agent Definitions

```typescript
// registry.ts
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';

const ARCHITECT_MODEL = 'openai/gpt-5.2';
const VALIDATOR_MODEL = 'openai/gpt-5-mini';

const plannerAgent = new Agent({
  id: 'planner',
  name: 'Planner',
  model: ARCHITECT_MODEL,
  instructions: '...',  // keep existing instructions
});

// ... data-architect, frontend-engineer (ARCHITECT_MODEL)
// ... qa-engineer (VALIDATOR_MODEL)

export const mastra = new Mastra({
  agents: { plannerAgent, dataArchitect, frontendEngineer, qaEngineer },
});
```

### Tool Binding

Tools are created per-sandbox and passed to agents at generate-time:

```typescript
// In QA step execute function:
const tools = createSandboxTools(sandbox);
const result = await qaEngineer.generate(prompt, {
  structuredOutput: { schema: QAResultArtifactSchema },
  tools: { runBuild: tools.runBuild, writeFile: tools.writeFile, readFile: tools.readFile },
});
```

Fix `createTool` execute signature to `(inputData, context)`:
```typescript
execute: async (inputData, context) => {
  const { path, content } = inputData;
  // ...
}
```

### Route Integration

```typescript
// generate-v2/route.ts
import { mastra } from '@/lib/agents/registry';

const workflow = mastra.getWorkflow('app-generation');
const run = workflow.createRun();
const result = await run.start({ inputData: { prompt, projectId } });
```

SSE events emitted from within steps via shared state or event callback.

### What's Preserved
- All Zod schemas in `schemas.ts` — validated and correct
- Agent instructions — domain-appropriate
- SSE event types — `AgentEvent` discriminated union
- Route structure — POST with SSE streaming

### What's Deleted
- `planner.ts` — `selectAgents()` and `buildPlanPrompt()` inlined where needed
- `steps.ts` — logic moved into `createStep` execute functions
- `observability.ts` — `TraceCollector` replaced by Mastra logger
- `assembleTeam()` — was dead code
- `PHASE_AGENTS` / `PHASE_NAMES` — replaced by workflow step DAG

### Dependencies
- Remove: `@ai-sdk/anthropic` (from mastra branch imports)
- Keep: `@mastra/core@^1.4.0`, `@ai-sdk/openai`, `zod`
- Verify: `@mastra/core` includes `createWorkflow`, `createStep` exports

## Testing Strategy

- Keep `agent-schemas.test.ts` — validates Zod schemas (unchanged)
- Rewrite `agent-registry.test.ts` — verify Mastra instance, agent count, model assignments
- Delete `agent-observability.test.ts` — TraceCollector deleted
- Add `agent-workflow.test.ts` — test step chaining, mock `agent.generate()`
