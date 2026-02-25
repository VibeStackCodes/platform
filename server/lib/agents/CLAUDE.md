# Agents — Single Orchestrator

Single Mastra agent handles all generation. No state machine, no multi-agent pipeline.

## Files
- `orchestrator.ts` — Single Mastra Agent: system prompt + 14 tools. Factory: `createOrchestrator()`. The LLM decides what to do — creates sandbox, writes files, runs build, deploys.
- `provider.ts` — Multi-provider routing: `PROVIDER_REGISTRY` (OpenAI + Anthropic via Helicone), `MODEL_CONFIGS` maps user-facing model IDs→provider+modelId+roleOverrides, `createAgentModelResolver(role)` reads `selectedModel` from RequestContext
- `tools.ts` — 14 Mastra tools: sandbox lifecycle, file I/O (write/read/edit/list), build/command execution, package install, web search, preview URL, deployment (Vercel + GitHub)

## Key Patterns
- All models resolved via `createAgentModelResolver(role)` — reads `selectedModel` from RequestContext
- `editFile` tool uses Relace Instant Apply API to merge code snippets
- `agent.stream()` returns fullStream — route handler bridges chunks to SSE events
- Tool names are camelCase keys in the agent's `tools` map

## Gotchas
- `d.get(id)` for full sandbox operations — `d.list()` returns lightweight objects without methods
- Helicone disabled if `HELICONE_API_KEY` unset (fallback direct provider)
- Route handler must set `requestContext.set('selectedModel', model)` for multi-provider routing
- Route handler must set `requestContext.set('heliconeContext', {...})` for per-user tracking
