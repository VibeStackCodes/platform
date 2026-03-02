# Agents — Single Orchestrator

Single Mastra agent handles all generation. No state machine, no multi-agent pipeline.

## Files
- `mastra.ts` — Central Mastra registry: `PostgresStore` (storage + memory backend), `Memory` (thread-based with working memory schema), `Observability` (Langfuse via `@mastra/langfuse` with `requestContextKeys` for userId/projectId/model/provider enrichment + environment/release tagging), `PinoLogger`. Exports `memory`, `storage`, `mastra`, `workingMemorySchema`.
- `orchestrator.ts` — Single Mastra Agent: system prompt + 11 tools + memory. Factory: `createOrchestrator()`. The LLM decides what to do — creates sandbox, writes files, runs build, commits.
- `provider.ts` — Multi-provider routing: `PROVIDER_REGISTRY` (OpenAI + Anthropic, direct connections), `MODEL_CONFIGS` maps user-facing model IDs→provider+modelId+roleOverrides, `createAgentModelResolver(role)` reads `selectedModel` from RequestContext
- `tools.ts` — 11 Mastra tools: sandbox lifecycle, file I/O (write/read/edit/list), build/command execution, package install, web search, preview URL, `commitAndPush` (git + GitHub). `commitAndPush` detects `vibestack-template` remote and uses `set-url` instead of `add`; force-pushes for new repos since local history diverges from template.
- `memory.ts` — Central Mastra registry: `PostgresStore` (storage + memory backend), `Memory` (thread-based with working memory schema). Exports `memory` for use by deploy route (persisting deploy messages).
- `langfuse-client.ts` — Shared `LangfuseClient` singleton (`@langfuse/client` v4). Used for prompt management (fetch versioned system prompts from Langfuse UI) and direct scoring (build-success, token-efficiency). Gated on `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`.

## Key Patterns
- All models resolved via `createAgentModelResolver(role)` — reads `selectedModel` from RequestContext
- `editFile` tool uses Relace Instant Apply API to merge code snippets
- `agent.stream()` returns fullStream — route handler bridges chunks to SSE events
- Tool names are camelCase keys in the agent's `tools` map
- `commitAndPush` returns `repoUrl` — agent route persists it to DB via `updateProject()`

## Gotchas
- `d.get(id)` for full sandbox operations — `d.list()` returns lightweight objects without methods
- Route handler must set `requestContext.set('selectedModel', model)` for multi-provider routing
- Observability via Langfuse: auto-instrumentation in mastra.ts (traces enriched with userId/projectId/model/provider via `requestContextKeys`), prompt management via `@langfuse/client` (orchestrator system prompt versioned in Langfuse UI), and post-generation scoring (build-success + token-efficiency)
- `commitAndPush` detects `vibestack-template` remote origin and replaces it — without this, push goes to template repo instead of app-specific repo
