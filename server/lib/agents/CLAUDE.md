# Agents — XState Pipeline + Mastra AI

XState state machines orchestrate app generation; Mastra agents handle LLM calls.

## Files
- `machine.ts` — Main XState machine: idle→preparing(parallel)→designing→codeGen→validating→deploying→complete
- `edit-machine.ts` — Edit machine: Tier 1 Tailwind mutations → Tier 2 LLM fallback
- `orchestrator.ts` — Async invoke handlers for each pipeline state (analysis, design, codegen, validation, repair, deployment)
- `provider.ts` — Multi-provider routing: `PROVIDER_REGISTRY` (OpenAI + Anthropic via Helicone), `MODEL_CONFIGS` maps user-facing model IDs→provider+modelId+roleOverrides, `createAgentModelResolver(role)` reads `selectedModel` from RequestContext
- `registry.ts` — Mastra agent definitions (analyst, repair, edit) with per-role model resolvers
- `tools.ts` — 18+ Mastra tools: file I/O, sandbox commands, docs search, GitHub/Supabase provisioning
- `schemas.ts` — Zod schemas for agent I/O: analyst requirements, creative specs
- `repair.ts` — Repair prompt builder: error categorization, max 5 errors, skeleton filtering
- `validation.ts` — Validation gate: manifest, scaffold detection, tsc, lint, build checks
- `build-validator.ts` — Post-build Vercel checks: dist/, bundle size, process.env scanning
- `edit-agent.ts` — Tier 2 LLM edit: reads file + element context + schema, calls editAgent
- `tailwind-edit.ts` — Tier 1 deterministic: scale arrays, twMerge, color/opacity mutations

## Key Patterns
- All models resolved via `createAgentModelResolver(role)` — reads `selectedModel` from RequestContext, looks up `MODEL_CONFIGS`, dispatches to correct provider via `PROVIDER_REGISTRY`
- Two-stage structured output: Stage 1 free-form reasoning → Stage 2 cheap model formats to schema
- `Agent.generate()` uses `structuredOutput: { schema }`, result in `result.object`
- Tool calls in `result.steps[].content[]` (type: "tool-call", input), NOT `result.steps[].toolCalls`
- Tool names match agent's `tools` map keys (camelCase), not the tool's `id` (kebab-case)
- Sandbox-bound tools: `createBoundSandboxTools(sandboxId)` closes over ID — LLM never sees it
- Parallel `preparing` state runs analysis + provisioning concurrently; both must complete

## Gotchas
- `actor.subscribe()` only fires on FUTURE snapshots — subscribe BEFORE `actor.send({ type: 'START' })`
- Repair capped at 2 retries; returns null if manifest fails (indicates pipeline bug, not repairable)
- `d.get(id)` for full sandbox operations — `d.list()` returns lightweight objects without methods
- Helicone disabled if `HELICONE_API_KEY` unset (fallback direct provider)
- Route handler must set `requestContext.set('selectedModel', model)` for multi-provider routing
- Route handler must set `requestContext.set('heliconeContext', {...})` for per-user tracking
- Never edit files during `mastra dev` workflow execution — file watcher kills in-flight workflows
