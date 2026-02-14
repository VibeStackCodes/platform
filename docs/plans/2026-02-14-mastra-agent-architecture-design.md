# Mastra Agent Architecture Design

**Date**: 2026-02-14
**Status**: Approved
**Scope**: Full agent framework architecture for VibeStack's product lifecycle platform

## 1. Problem Statement

VibeStack's current generation pipeline is a procedural monolith (`generate/route.ts` → `template-pipeline.ts` → `generator.ts` → `verifier.ts`). It generates code via templates + LLM, runs a build, and deploys. This architecture cannot scale to the product vision: 13+ specialized agents producing 30+ artifact types across 4 execution phases with real-time UI streaming, plan approval, and full observability.

## 2. Vision (from demo)

A single user prompt ("Build a scalable ecommerce platform for fashion retail") triggers:

- **13 specialized agents** across 6 organizational layers:
  - Strategy & Vision: Product Strategist
  - Market Intelligence: User Researcher, UX/UI Designer
  - Core Engineering: Frontend Engineer, Backend Engineer, Data Engineer
  - Platform Reliability: DevOps Engineer, Security Engineer
  - Growth & Ops: Growth Strategist, Pricing Strategist, Customer Success
  - Governance: Compliance Officer, Data Analyst

- **30+ artifact types**: PRDs, design systems, GraphQL schemas, database schemas, component libraries, security audits, Lighthouse reports, infrastructure IaC, deployment pipelines, marketing assets, analytics dashboards

- **4-phase parallel execution**:
  1. Strategy, Compliance & Data Architecture
  2. Core Infrastructure & Security Layer
  3. Frontend Experience & Design System
  4. Growth, QA & Launch Operations

- **Human-in-the-loop**: Plan approval before build execution
- **Real-time UI streaming**: Agent-to-agent communication visible in ExecutionSteps UI

## 3. Framework Decision: Mastra

### Why Mastra

| Requirement | Mastra | AI SDK v6 (raw) | Inngest AgentKit | LangGraph.js |
|---|---|---|---|---|
| TypeScript-native | Yes (built ON AI SDK) | Yes | Yes | JS is secondary |
| DAG workflows | `.then()`, `.branch()`, parallel | Build yourself | Network+Router only | State machine |
| 13+ agent registry | First-class `Agent` class | Manual | Agent class | Agent nodes |
| Suspend/resume (plan approval) | Built-in `suspendPayload` | Build yourself | Built-in | Checkpoints |
| Memory (shared + working) | Message history, working memory, semantic recall | Build yourself | Network State only | State dict |
| Streaming to UI | `.stream()` + `fullStream` events | `toUIMessageStream()` | `useAgent` hook | LangServe |
| Multi-model routing (40+ providers) | Yes (inherits from AI SDK) | Yes | 3 providers | LangChain providers |
| Observability + token tracking | Built-in AI Tracing | `onStepFinish` only | Inngest dashboard | LangSmith (paid) |
| Evals (artifact quality) | Built-in scorers | Build yourself | None | LangSmith (paid) |
| Vendor lock-in risk | Low (AI SDK foundation) | None | Inngest platform | LangChain ecosystem |

### Rationale

1. **Builds ON AI SDK v6** — additive, not a replacement. Every AI SDK pattern works inside Mastra agents. Can drop down to raw AI SDK anywhere.
2. **Workflow DAG maps to 4-phase build** — Phase 1 feeds Phase 2 feeds Phase 3 feeds Phase 4. `.then()` chaining and parallel step execution model this directly.
3. **Suspend/resume = plan approval** — Demo flow: INPUT -> CLARIFY -> AGENTS -> PLAN -> APPROVE -> BUILD. Workflow suspends at approval, resumes when user clicks approve.
4. **Memory solves artifact passing** — Product Strategist's PRD goes into shared working memory. Backend Engineer reads it to generate GraphQL schema. Frontend reads schema to generate components.
5. **Streaming maps to ExecutionSteps UI** — `fullStream` events feed the build execution UI (task groups, log entries, status indicators).
6. **Built-in evals** — Scorer system validates each agent's artifact quality before proceeding to next phase.

### Pros

- TypeScript-native — single-language stack
- Workflow DAG perfectly models 4-phase execution
- Suspend/resume eliminates custom plan-approval state management
- Memory system solves artifact passing without custom code
- Multi-model routing keeps costs manageable at 13-agent scale
- YC-backed (Gatsby team) — credible long-term bet
- Deploys inside existing Next.js app

### Cons

- Younger than LangChain/LangGraph — smaller community
- No built-in durability (unlike Inngest) — Vercel 300s timeout concern
- Added abstraction layer
- Lock-in risk if Mastra pivots (mitigated by AI SDK foundation)

## 4. Architecture

```
CLIENT (Next.js)
  InitialInput -> ClarificationCard -> AgentCard reveal
  -> PlanCard (approve) -> ExecutionSteps (streaming)
  Consumes: Mastra workflow .stream() events via SSE
        |
MASTRA WORKFLOW ENGINE
  createWorkflow("generate-product")
    .then(clarifyRequirements)       // Agent: Planner
    .then(assembleAgentTeam)         // Selects relevant agents
    .then(generatePlan)              // Agent: Planner
    .suspend("plan-approval")        // Human-in-the-loop
    .then(phase1_strategy)           // Parallel agents within phase
      .then(phase2_infrastructure)
      .then(phase3_frontend)
      .then(phase4_launch)
    .commit()
        |
AGENT REGISTRY (13+ agents)
  Each agent = Mastra Agent with:
    - Unique system prompt + persona
    - Domain-specific tools (MCP or custom)
    - Artifact schema (Zod) for structured output
    - Model assignment (cost tier routing)
    - maxSteps limit
        |
EXECUTION LAYER
  Daytona Sandbox    Supabase DB       Vercel
  (code gen + build) (schema + data)   (deploy)
  (preview URL)      (auth setup)      (edge + DNS)
```

## 5. Agent Registry

### Cost Tier Routing

| Tier | Model | Cost/1M tokens | Agents |
|---|---|---|---|
| Architect (complex reasoning) | Claude Sonnet 4.5 | ~$3/in, $15/out | Product Strategist, Backend Engineer, Frontend Engineer, Security Engineer |
| Specialist (domain knowledge) | GPT-4o | ~$2.5/in, $10/out | UX/UI Designer, Data Engineer, DevOps Engineer, Compliance Officer |
| Analyst (classification + config) | Claude Haiku 4.5 | ~$0.80/in, $4/out | User Researcher, Growth Strategist, Pricing Strategist, Customer Success, Data Analyst |
| Validator (verification) | Claude Haiku 4.5 | ~$0.80/in, $4/out | Build verification, lint analysis, error classification |

**Estimated cost per full generation**: $0.50-2.00 (vs $5-15 if all on Opus)

### Agent Definitions

Each agent produces a typed artifact:

```typescript
// Example: Product Strategist
const productStrategist = new Agent({
  id: "product-strategist",
  name: "Product Strategist",
  instructions: "You are a product strategist defining vision, roadmap, and success metrics...",
  model: "claude-sonnet-4-5",
  tools: { webSearch, analyzeCompetitors },
  structuredOutput: PRDArtifactSchema,  // Zod schema
  maxSteps: 5,
});

// Example: Backend Engineer
const backendEngineer = new Agent({
  id: "backend-engineer",
  name: "Backend Engineer",
  instructions: "You are a backend engineer designing APIs and database schemas...",
  model: "claude-sonnet-4-5",
  tools: { sandboxExec, sqlValidate, graphqlValidate },
  structuredOutput: BackendArtifactSchema,
  maxSteps: 10,
});
```

## 6. Workflow Definition

```typescript
const generateProduct = createWorkflow("generate-product")
  .then(createStep({
    id: "clarify",
    inputSchema: UserPromptSchema,
    outputSchema: ClarifiedRequirementsSchema,
    execute: async ({ input }) => {
      // Planner agent asks clarifying questions
      return plannerAgent.generate({ prompt: input.userPrompt });
    }
  }))
  .then(createStep({
    id: "assemble-team",
    execute: async ({ input }) => {
      // Select which of the 13 agents are relevant
      return selectAgents(input.requirements);
    }
  }))
  .then(createStep({
    id: "generate-plan",
    execute: async ({ input }) => {
      // Generate execution plan for user approval
      return plannerAgent.generate({ prompt: buildPlanPrompt(input) });
    }
  }))
  .suspend("plan-approval")  // Pauses until user approves
  .then(phase1Strategy)       // Parallel: Strategist + Compliance + Data + Researcher
  .then(phase2Infrastructure) // Parallel: DevOps + Security + Backend
  .then(phase3Frontend)       // Parallel: UX/UI + Frontend + Performance
  .then(phase4Launch)         // Parallel: Pricing + Growth + CS + Deploy
  .commit();
```

## 7. Observability

```
Mastra AI Tracing (built-in)
  Per-agent traces:
    - LLM calls (model, tokens in/out, latency)
    - Tool calls (name, args, result, duration)
    - Artifact production (type, size, quality score)
    - Step transitions (phase progression)
  Workflow-level traces:
    - Phase start/complete events
    - Total token usage + cost
    - Wall-clock time per phase
    - Suspend/resume timestamps
  Storage: Supabase (platform DB) for debugging + analytics
```

## 8. Migration Path: Current -> Future

| Current | Future |
|---|---|
| `template-pipeline.ts` (procedural) | Mastra Workflow DAG (4-phase) |
| `generator.ts` (monolithic file gen) | Per-agent artifact generation with structured output |
| `verifier.ts` (build-fix retry) | Dedicated QA Agent with eval scorers |
| `live-fixer.ts` (polling error log) | Agent tool-use loop (read error -> fix -> verify) |
| `generate/route.ts` (445-line monolith) | Thin SSE endpoint that starts a Mastra workflow |
| SSE streaming (custom) | Mastra `.stream()` -> `fullStream` events -> SSE |
| No memory | Mastra working memory (artifacts passed between phases) |
| No plan approval | Mastra `suspend("plan-approval")` -> approve -> `resume()` |
| Single model (OpenAI) | Multi-model routing per agent tier |
| No quality validation | Mastra evals (scorers per artifact type) |

## 9. Durability Concern

Vercel Pro's 300s limit is tight for 13 agents. Options (in priority order):

1. **Phase-based invocations** — Break into 4 Vercel function calls (one per phase), with Supabase as state store between invocations. Each phase < 60s.
2. **Long-lived server** — Run Mastra workflow on Railway/Fly.io, stream events to Next.js frontend via WebSocket/SSE.
3. **Inngest wrapper** — Use Inngest for durable execution around Mastra workflow (they compose — Inngest handles retries/timeouts, Mastra handles agent orchestration).

## 10. UI Mapping

| Demo Component | Data Source |
|---|---|
| `InitialInput` | User prompt submission |
| `ClarificationCard` | `clarify` step output (questions + answers) |
| `AgentCard` (staggered reveal) | `assemble-team` step output (selected agents) |
| `PlanCard` (approve button) | `generate-plan` step output + `suspend("plan-approval")` |
| `ExecutionSteps` (task groups + logs) | Phase step `fullStream` events |
| Artifact viewers (PRD, Design System, etc.) | Agent structured output artifacts |
