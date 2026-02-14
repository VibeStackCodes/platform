# Agentic Pipeline Design: Full Platform Overhaul

**Date:** 2026-02-14
**Branch:** `feature/mastra-agent-architecture`
**Approach:** Fully agentic pipeline using Mastra `.network()` with 9 specialist agents

## Problem

The current platform has two pipelines:
- **v1** (template-based): Deterministic Handlebars templates → rigid, every app looks the same, new features require new templates
- **v2** (Mastra remediation): Fixed critical bugs but still a linear `createWorkflow` DAG that produces structured output without sandbox integration

Neither pipeline leverages Mastra's full capabilities (`.network()`, observational memory, human-in-the-loop) or the industry-standard Orchestrator-Workers pattern.

## Vision

One supervisor agent manages the entire app generation lifecycle — from conversation through deployment. No separate chat and generate routes. No templates. Agents compose pages from shadcn components, write directly to sandbox, and iterate on feedback without regenerating everything.

## Architecture

### The Agent Team (9 Agents)

| Agent | Role | Model | Tools |
|-------|------|-------|-------|
| **Supervisor** | Pure orchestrator — routes tasks, tracks completion | `gpt-5.2` | None (delegates everything) |
| **Analyst** | Converses with user, extracts requirements | `gpt-5.2` | `searchDocs` (context7) |
| **Infra Engineer** | Provisions sandbox, GitHub repo | `gpt-5-mini` | `createSandbox`, `runCommand`, `getPreviewUrl` |
| **Database Admin** | Designs schema, creates Supabase project, runs migrations | `gpt-5.2` | `runCommand`, `writeFile`, `readFile`, `validateSQL`, `searchDocs` |
| **Backend Engineer** | Types, hooks, Supabase client, auth utilities | `gpt-5.1-codex-max` | `writeFile`, `readFile`, `listFiles`, `createDirectory`, `searchDocs` |
| **Frontend Engineer** | UI pages + components using shadcn registry | `gpt-5.1-codex-max` | `writeFile`, `readFile`, `listFiles`, `createDirectory`, `searchDocs` |
| **Code Reviewer** | Reviews code quality in real-time (read-only) | `gpt-5.2` | `readFile`, `listFiles` (never writes) |
| **QA Engineer** | Continuous build validation, type-checking | `gpt-5-mini` | `runCommand`, `readFile`, `listFiles`, `validateSQL` |
| **DevOps Engineer** | Vercel deployment, DNS, deploy-time errors | `gpt-5-mini` | `pushToGitHub`, `deployToVercel`, `runCommand` |

### Model Routing

| Tier | Model | Used By | Rationale |
|------|-------|---------|-----------|
| ORCHESTRATOR | `openai/gpt-5.2` | Supervisor, Analyst, DBA, Code Reviewer | Strong reasoning for routing, conversation, schema design, code review |
| CODEGEN | `openai/gpt-5.1-codex-max` | Backend Engineer, Frontend Engineer | Code-optimized model for generation |
| VALIDATOR | `openai/gpt-5-mini` | Infra, QA, DevOps | Mostly tool calls, light reasoning — fast and cheap |

### Network Registration

```typescript
const supervisorAgent = new Agent({
  id: 'supervisor',
  model: 'openai/gpt-5.2',
  instructions: `You orchestrate app generation. Delegate to specialists...`,
  agents: {
    analyst: analystAgent,
    infraEngineer: infraAgent,
    databaseAdmin: dbaAgent,
    backendEngineer: backendAgent,
    frontendEngineer: frontendAgent,
    codeReviewer: reviewerAgent,
    qaEngineer: qaAgent,
    devOpsEngineer: devOpsAgent,
  },
  memory: new Memory({
    options: {
      observationalMemory: {
        model: 'google/gemini-2.5-flash',
        scope: 'thread',
      },
    },
    storage: new LibSQLStore({ url: `file:./memory/mastra.db` }),
  }),
});
```

## Pipeline Flow

### Phase 1: Requirements + Provisioning (Parallel)

```
├── Analyst ↔ User: conversation → ClarifiedRequirements
│     └── Human-in-the-loop: plan approval
└── Infra Engineer: provision sandbox + Supabase project (fire-and-forget)
```

Analyst converses naturally with the user, extracts structured requirements. Infra Engineer provisions in parallel — sandbox ready by the time requirements are clear.

### Phase 2: Schema Design (Sequential)

```
└── Database Admin: ClarifiedRequirements → SchemaContract
      └── contractToSQL() produces deterministic migration
      └── QA Engineer validates SQL via PGlite (immediately)
      └── DBA uploads migration to sandbox
```

SchemaContract remains the single source of truth. SQL generation stays deterministic via `contractToSQL()`. QA validates the migration immediately — no waiting for Phase 4.

### Phase 3: Code Generation (Parallel, Continuous)

```
├── Backend Engineer: types, hooks, auth, Supabase client
│     └── Writes to lib/types/, lib/hooks/, lib/supabase.ts, lib/auth/
├── Frontend Engineer: pages, components using shadcn
│     └── Writes to components/, pages/, App.tsx
│     └── Imports Backend's hooks (shared SchemaContract as interface)
├── Code Reviewer: reads all files, flags quality issues → Supervisor
└── QA Engineer: incremental tsc --noEmit after each file batch → Supervisor
      └── Errors routed to responsible agent (Backend or Frontend)
```

Backend and Frontend work in parallel — SchemaContract is their shared interface. Code Reviewer and QA Engineer run continuously alongside, catching issues as they happen.

### Phase 4: Final Build Verification (Sequential)

```
└── QA Engineer: full `bun run build`
      └── Usually a no-op (most issues caught in Phase 3)
      └── If errors: Supervisor routes to Backend/Frontend (max 5 cycles)
```

### Phase 5: Deployment (Sequential)

```
└── DevOps Engineer: GitHub push → Vercel deploy → preview URL
      └── Updates project record with URLs
```

### Iteration (Dynamic)

```
└── User feedback → Supervisor routes to relevant specialist
      └── "Make header blue" → Frontend Engineer (just that file)
      └── "Add settings page" → Analyst (clarify) → DBA (schema?) → Backend + Frontend
      └── "Deploy to production" → DevOps Engineer
```

## Frontend/Backend Split

The **SchemaContract** is the interface between Backend and Frontend engineers:

**Backend Engineer writes:**
- `lib/types/database.ts` — TypeScript types from SchemaContract
- `lib/db/schema.ts` — Kysely schema definitions from SchemaContract (type-safe SQL)
- `lib/db/client.ts` — Kysely + Supabase client initialization
- `lib/hooks/use-*.ts` — Data fetching hooks per table (CRUD via Kysely, type-checked at compile time)
- `lib/auth/` — Auth context, protected route wrapper, sign-in/sign-out
- `lib/utils/` — Shared utilities (formatting, validation)
- `lib/sentry.ts` — Sentry initialization with DSN from environment

**Frontend Engineer writes:**
- `components/` — UI components using shadcn, imports hooks from `lib/hooks/`
- `pages/` — Page composition, routing, layout
- `App.tsx` — Root component with routing

Frontend never writes data fetching logic — uses Backend's hooks.

## shadcn Component Registry

No Handlebars templates. Frontend Engineer receives the shadcn registry manifest (component name → exports → props → import path) as context and composes pages from those primitives.

```json
{
  "button": { "import": "@/components/ui/button", "exports": ["Button"], "props": ["variant", "size", "asChild"] },
  "card": { "import": "@/components/ui/card", "exports": ["Card", "CardHeader", "CardTitle", "CardContent"] },
  "data-table": { "import": "@/components/ui/data-table", "exports": ["DataTable"], "props": ["columns", "data"] }
}
```

## Agent Communication

Using Mastra `.network()` — Supervisor acts as routing agent:

- Supervisor interprets context and delegates to the appropriate specialist
- Memory (observational) tracks task history and determines completion
- Agents report results to Supervisor, which decides next action
- QA/Code Reviewer failures route back to the responsible specialist via Supervisor
- No rigid step ordering — Supervisor decides dynamically

**QA as Continuous Validator:**

| Phase | QA Action | Catches |
|-------|-----------|---------|
| Phase 2 | Validate SQL via PGlite | Invalid SQL, missing RLS roles |
| Phase 3 | Incremental `tsc --noEmit` after each file | Bad types, missing imports |
| Phase 4 | Full `bun run build` | Vite bundling, asset errors |

QA never writes files — only reads and runs commands. Fixes always go through the responsible agent via Supervisor.

## Mastra Features Used

| Feature | Purpose |
|---------|---------|
| Agent class | All 9 agent definitions with tools and instructions |
| `.network()` | Supervisor orchestration, dynamic routing |
| Observational Memory | Long-session context — Observer + Reflector compress conversation history |
| Human-in-the-Loop | Plan approval after Analyst produces requirements |
| Evals | Quality gates: schema completeness, type safety, accessibility |
| Structured Output | Requirements extraction, schema generation |
| Streaming | Network stream chunks → SSE events |
| Mastra Cloud | Observability, tracing, cost tracking |
| Mastra instance | Central agent registry |

## Third-Party Integrations

| Service | Purpose | Integration Point |
|---------|---------|-------------------|
| **Mastra Cloud** | Observability, tracing, cost tracking, retries | Native exporter |
| **context7** | Real-time doc retrieval for agents (replaces RAG) | Agent `searchDocs` tool via MCP |
| **Biome** | Auto-format all agent-generated code | Post-write hook in `writeFile` tool |
| **PGlite** | SQL migration validation | QA agent `validateSQL` tool |
| **Upstash** | Rate limiting per user/tier | Route middleware |
| **axe-core** | Accessibility validation of generated components | Code Reviewer tool |
| **Kysely** | Type-safe SQL queries in generated apps | Backend Engineer generates Kysely schemas from SchemaContract |
| **Sentry** | Error tracking in generated apps from day one | Infra Engineer adds Sentry DSN during scaffold |

### context7 Replaces RAG

Instead of pre-embedding docs in vector stores, agents query context7 on-demand for latest documentation:

| Agent | Queries |
|-------|---------|
| Database Admin | PostgreSQL docs, Supabase RLS patterns |
| Backend Engineer | Supabase JS v2 SDK, React Query patterns |
| Frontend Engineer | shadcn component APIs, Tailwind v4, Radix UI |
| Code Reviewer | TypeScript strict mode, React 19 patterns |

Zero maintenance, always up-to-date, no vector store infrastructure.

## SSE Streaming

Single unified route bridges `.network()` chunks to SSE events:

```typescript
export async function POST(request: NextRequest) {
  const { message, projectId } = await request.json();
  return createSSEStream(async (emit) => {
    const stream = await supervisorAgent.network(message, {
      memory: { threadId: projectId },
    });
    for await (const chunk of stream) {
      // Bridge network chunks to StreamEvent types
      // agent_start, agent_complete, file_complete, text_delta, etc.
    }
  });
}
```

## Error Handling

| Failure Mode | Response |
|-------------|----------|
| Agent fails (LLM error) | Supervisor retries same agent (max 2). If still failing, reports to user. |
| Build fails (QA errors) | Supervisor routes errors to responsible agent. Max 5 cycles. |
| Infra fails (sandbox/Supabase) | Infra agent retries. Non-recoverable failures surface to user. |
| Contract violation (eval fails) | Supervisor sends back to producing agent for revision. |

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | Schemas, contractToSQL, contractToTypes | Vitest (existing tests) |
| Agent unit | Each agent's output quality | Mastra Evals with mock inputs |
| Tool unit | Sandbox tools correctness | Vitest with mocked Daytona SDK |
| Integration | Supervisor routing decisions | Mock agents, test routing |
| E2E | Full generation prompt → preview | Playwright with real sandbox |

## What's Deleted

| File/Directory | Replaced By |
|---------------|-------------|
| `app/api/chat/route.ts` | Supervisor handles conversation |
| `app/api/projects/generate/route.ts` | Unified agent route |
| `app/api/projects/generate-v2/route.ts` | Unified agent route |
| `lib/template-pipeline.ts` | Frontend agent composes from shadcn |
| `lib/template-registry.ts` | Gone — no templates |
| `lib/feature-classifier.ts` | Supervisor decides based on conversation |
| `lib/verifier.ts` | QA agent with sandbox tools |
| `lib/chat-tools.ts` | Supervisor has native tools |
| `lib/generator.ts` | Agents generate directly |
| `lib/agents/workflow.ts` | `.network()` replaces `createWorkflow` |
| `lib/agents/planner.ts` | Already deleted in remediation |
| `lib/agents/steps.ts` | Already deleted in remediation |
| `lib/agents/observability.ts` | Already deleted in remediation |
| `templates/**/*.hbs` | Agents generate from shadcn registry |

## What's Kept

| File | Why |
|------|-----|
| `lib/schema-contract.ts` | Contract-first is correct — agents produce contracts, not raw SQL |
| `lib/contract-to-sql.ts` | Deterministic SQL generation is a feature |
| `lib/contract-to-types.ts` | Deterministic type generation |
| `lib/sandbox.ts` | Daytona lifecycle management |
| `lib/github.ts` | GitHub push logic |
| `lib/sse.ts` | SSE streaming (network chunks → SSE events) |
| `lib/agents/schemas.ts` | Zod schemas validated and correct |
| `lib/agents/tools.ts` | Sandbox tools (expanded) |
| `lib/agents/registry.ts` | Agent definitions (rewritten for 9 agents + network) |
| `shadcn-registry/` | Component registry for frontend agent context |

## What's New

| File/Component | Purpose |
|---------------|---------|
| `lib/agents/registry.ts` (rewrite) | 9 agent definitions + supervisor network |
| `lib/agents/tools.ts` (expand) | 14+ tools following Daytona guide pattern |
| `lib/agents/evals.ts` | Quality gate evaluations |
| `lib/agents/knowledge.ts` | context7 doc retrieval tool |
| `app/api/agent/route.ts` | Unified agent endpoint (replaces chat + generate) |
| Biome config | Auto-formatting in sandbox |
| Upstash rate limiting | Route middleware |

## Dependencies

### Add
- `@upstash/ratelimit` — rate limiting
- `biome` (in sandbox snapshot) — code formatting
- `axe-core` (in sandbox snapshot) — accessibility validation
- `kysely` (in sandbox snapshot + generated apps) — type-safe SQL queries
- `@sentry/react` (in sandbox snapshot + generated apps) — error tracking

### Remove
- `@ai-sdk/anthropic` — not used (OpenAI models only)
- `handlebars` — no more templates
- `change-case` — was for template helpers

### Keep
- `@mastra/core@^1.4.0` — Agent, .network(), Memory, Evals
- `@ai-sdk/openai` — model provider
- `@daytonaio/sdk` — sandbox management
- `zod` — schema validation
- `@electric-sql/pglite` — SQL validation
