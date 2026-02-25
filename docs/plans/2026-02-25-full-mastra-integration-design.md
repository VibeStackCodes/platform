# Full Mastra Integration Design

**Date**: 2026-02-25
**Status**: Approved
**Scope**: Wire all production-relevant Mastra features into the platform

## Context

We use Mastra as our sole agent framework but only import 4 sub-paths (`Agent`, `createTool`, `RequestContext`, `MastraModelConfig`). Five installed packages are completely unused (`@mastra/memory`, `@mastra/pg`, `@mastra/observability`, `@mastra/loggers`, `@mastra/server`). This design wires everything that adds production value.

## Goals

1. Multi-turn conversation memory (agent remembers previous turns per project)
2. Structured working memory (sandboxId, design state persist across turns)
3. Token-bounded sessions (message processors prevent context window blowout)
4. Agent-level observability via Langfuse (replace Helicone)
5. Simplified tool belt (auto git push, remove deployment tools from agent)
6. Typed stream handling (eliminate `any` casts in SSE bridge)
7. Structured output (Zod schema for reliable summary extraction)

## Out of Scope

- Scorers/evals (no automated eval pipeline yet)
- Tool approval / human-in-the-loop (not needed for current tools)
- Voice, A2A, MCP, Workflows, Datasets (not relevant to product shape)
- Semantic recall / vector search (requires pgvector — defer to later)

---

## 1. Mastra Registry + PostgresStore

### New file: `server/lib/agents/mastra.ts`

Central Mastra registry that wires memory, storage, observability, and agents.

```
PostgresStore(DATABASE_URL)
    ↕
Memory(storage, processors, workingMemory)
    ↕
Mastra({ agents, memory, storage, logger, observability })
```

**Storage**: `PostgresStore` from `@mastra/pg`, reusing existing `DATABASE_URL` (Supabase Postgres). Auto-creates its tables on init — no manual migration needed.

**Key decision**: No new infrastructure. PostgresStore shares the Supabase Postgres instance.

### Working Memory Schema

Zod schema gives the agent a structured notepad persisted across turns:

```typescript
const workingMemorySchema = z.object({
  sandboxId: z.string().optional(),
  projectName: z.string().optional(),
  repoUrl: z.string().optional(),
  filesCreated: z.array(z.string()).optional(),
  designDecisions: z.array(z.string()).optional(),
  buildStatus: z.enum(['pending', 'passing', 'failing']).optional(),
})
```

The agent reads/writes this via a Mastra-injected tool. It replaces:
- The `[Existing sandbox: ${sandboxId}]` string hack in agent.ts
- The `sandboxId` extraction from tool results in bridgeStreamToSSE
- The need for `sandboxId` in the request body

### Thread Mapping

- **Thread ID** = Project ID (1:1 mapping)
- **Resource ID** = User ID (ownership verification)
- First turn: Mastra auto-creates the thread
- Subsequent turns: Mastra loads previous messages from storage

---

## 2. Memory Configuration

```typescript
const memory = new Memory({
  storage,
  options: {
    lastMessages: 40,
    semanticRecall: false,  // no pgvector yet
    workingMemory: {
      enabled: true,
      template: workingMemorySchema,
    },
  },
})
```

### Message Processor: Token Bounding

`MessageHistory` processor with sliding window to prevent context blowout on 50-step sessions:

```typescript
import { MessageHistory } from '@mastra/memory'

// Applied as processor — trims older messages before LLM call
// Working memory survives trimming (injected separately)
new MessageHistory({ maxMessages: 40 })
```

**Why 40**: A typical generation uses 15-30 tool calls. 40 messages covers the full current turn plus some prior context. Token cost stays bounded even for long edit sessions.

---

## 3. Observability — Langfuse via OpenTelemetry

### Remove Helicone

Helicone is a proxy that sits between us and the LLM provider. Removing it:
- Simplifies `provider.ts` by ~50% — no more gateway URLs, header building, proxy routing
- `RequestContext` drops `heliconeContext` — only carries `selectedModel`
- Direct provider connections = lower latency (no proxy hop)
- `HELICONE_API_KEY` env var removed

### Add Langfuse

Langfuse accepts OpenTelemetry traces. Mastra's `@mastra/observability` exports OTLP spans.

```typescript
import { Observability } from '@mastra/observability'

const observability = new Observability({
  configs: {
    default: {
      serviceName: 'vibestack-agent',
      sampling: { type: 'always_on' },
      exporters: [
        new OTLPTraceExporter({
          url: `${process.env.LANGFUSE_BASEURL}/api/public/otel/v1/traces`,
          headers: {
            Authorization: `Basic ${btoa(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`)}`,
          },
        }),
      ],
    },
  },
})
```

**What we get**: Per-user cost tracking, per-session traces, token usage per step, tool call timing/args/results, agent step hierarchy — all in Langfuse dashboard.

**Gated**: No-op when `LANGFUSE_PUBLIC_KEY` is unset (same pattern as current Sentry gating).

### Env var changes

| Removed | Added |
|---------|-------|
| `HELICONE_API_KEY` | `LANGFUSE_PUBLIC_KEY` |
| | `LANGFUSE_SECRET_KEY` |
| | `LANGFUSE_BASEURL` |

---

## 4. Tool Belt Changes

### Remove from agent tools

| Tool | Reason |
|------|--------|
| `deployToVercel` | UI button, not agent action. `/api/projects/deploy` route stays. |
| `pushToGitHub` | Replaced by auto-push inside `commitAndPush` |
| `createGitHubRepo` | Internalized into `commitAndPush` |
| `getGitHubToken` | Internalized into `commitAndPush` |

### New tool: `commitAndPush`

Combines git commit + GitHub push into a single atomic tool:

```
Agent calls commitAndPush(sandboxId, message)
  1. git add -A && git commit -m "<message>" in sandbox
  2. Read repoUrl from working memory
     - If no repo: createRepo() + getInstallationToken() → store repoUrl in working memory
     - If repo exists: getInstallationToken()
  3. git remote add/set-url origin <repoUrl>
  4. git push
  5. Return { success, commitHash, repoUrl }
```

**Agent instruction**: "Call `commitAndPush` after each meaningful change (new feature, bug fix, build passing)."

### Final tool belt (11 tools)

1. `createSandbox` — provision workspace
2. `writeFile` — write a new file
3. `writeFiles` — batch write multiple files
4. `readFile` — read file contents
5. `editFile` — edit via Relace Instant Apply
6. `listFiles` — list sandbox files
7. `runCommand` — shell command
8. `runBuild` — vite build
9. `installPackage` — bun add
10. `getPreviewUrl` — live preview URL
11. `commitAndPush` — git commit + auto-push to GitHub
12. `webSearch` — provider-native web search (injected per provider)

---

## 5. Agent Route Changes (`server/routes/agent.ts`)

### Before

```
POST /api/agent { message, projectId, model, sandboxId }
  → insertChatMessage(user)
  → prepend "[Existing sandbox: sandboxId]" to message
  → agent.stream(fullMessage, { requestContext })
  → bridgeStreamToSSE (manual chunk parsing, any casts)
  → insertChatMessage(assistant)
  → settleCredits
```

### After

```
POST /api/agent { message, projectId, model }
  → agent.stream(message, { requestContext, threadId: projectId, resourceId: userId })
    ↳ Mastra auto-loads prior messages from Memory
    ↳ Mastra auto-injects working memory (sandboxId, etc.)
  → bridgeStreamToSSE (typed chunks, no any casts)
    ↳ sandboxId read from working memory update events (not tool-result parsing)
  → settleCredits
```

**Removed**:
- `sandboxId` from request body (lives in working memory)
- All `insertChatMessage()` calls (Memory handles persistence)
- `heliconeContext` setup on RequestContext
- String hack: `[Existing sandbox: ${sandboxId}]`

**Kept**:
- Credit reservation/settlement (unchanged)
- Custom `AgentStreamEvent` SSE shapes (client contract unchanged)
- `bridgeStreamToSSE` function (but with typed chunks instead of `any`)

---

## 6. Structured Output

Replace regex summary extraction with Zod schema:

```typescript
const streamOutput = await agent.stream(message, {
  threadId: projectId,
  resourceId: userId,
  requestContext,
  structuredOutput: {
    schema: z.object({
      summary: z.string().describe('One-line summary of what was built or changed'),
    }),
  },
})

// After stream completes:
const result = await streamOutput.object  // { summary: "Built a construction dashboard with..." }
```

---

## 7. Provider Simplification (`server/lib/agents/provider.ts`)

### Before (~250 lines)

```
PROVIDER_REGISTRY (gateway URLs, API key env, factory functions)
HeliconeContext type + getHeliconeHeaders() + getHeliconeBaseURL()
createHeliconeProvider() — proxied provider factory
createAgentModelResolver() — reads heliconeContext from RequestContext
```

### After (~80 lines)

```
PROVIDER_REGISTRY (API key env, factory functions — no gateway URLs)
createDirectProvider() — direct provider factory (no proxy)
createAgentModelResolver() — reads selectedModel from RequestContext only
MODEL_CONFIGS — unchanged
```

All Helicone-specific code deleted. Provider creates direct connections. Observability handled by Mastra's OpenTelemetry layer (not by proxying through a gateway).

---

## 8. File Change Summary

| File | Action | Description |
|------|--------|-------------|
| **NEW** `server/lib/agents/mastra.ts` | Create | Mastra registry + PostgresStore + Memory + Observability |
| `server/lib/agents/orchestrator.ts` | Modify | Accept memory, remove 4 tools, add commitAndPush, update system prompt |
| `server/lib/agents/tools.ts` | Modify | Remove 4 tools, add commitAndPush tool |
| `server/lib/agents/provider.ts` | Simplify | Remove Helicone proxy, direct providers only |
| `server/routes/agent.ts` | Modify | Add threadId/resourceId, remove insertChatMessage, typed chunks, structured output |
| `server/routes/admin.ts` | Modify | Remove Helicone env check |
| `server/index.ts` | Modify | Remove Helicone references |
| `CLAUDE.md` | Update | Env var table, architecture section |
| Tests | Update | Mock Memory instead of insertChatMessage |

**Zero client-side changes.** SSE event shapes are preserved.

---

## 9. Migration Notes

- `PostgresStore` auto-creates tables (`mastra_threads`, `mastra_messages`, `mastra_working_memory`, etc.) alongside existing Drizzle-managed tables. No conflict — different table names.
- Existing chat messages in `chat_messages` table are NOT migrated. New Memory threads start fresh per project. Old messages still readable via existing queries if needed.
- `HELICONE_API_KEY` becomes unused. Can be removed from `.env.local` and Vercel env.
- Langfuse account needed. Free tier supports 50k observations/month.

---

## 10. Verification

After implementation:

```bash
# 1. All existing tests pass
bun run test

# 2. Typecheck
bunx tsc --noEmit

# 3. Lint
bun run lint

# 4. Manual: run local-gen test to verify memory + commitAndPush
bun run test -- tests/local-gen.test.ts --timeout 300000

# 5. Verify Langfuse receives traces (check dashboard)
```
