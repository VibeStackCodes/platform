# OpenAI SDK Feature Integration Design

**Date**: 2026-02-12
**Status**: Approved

## Overview

Integrate ALL OpenAI SDK features into the VibeStack generation pipeline using direct OpenAI SDK (`openai` package) for GPT models, keeping AI SDK for Claude models and chat route (`useChat` compatibility).

## Architecture: Dual SDK Strategy

- **OpenAI SDK direct** → `platform/lib/openai-client.ts` → planner, generator, verifier, requirement-check
- **AI SDK** → chat route (`/api/chat/route.ts`) for `useChat` frontend compatibility

## Feature Inventory (17 features)

1. Structured Outputs (`zodTextFormat`) — planner, verifier error analysis
2. Responses API (`responses.create`) — all pipeline stages
3. Reasoning effort tuning (`none`/`low`/`medium`/`high`) — per-stage
4. Parallel function calls — file generation (Approach B: one call per layer)
5. Strict function calling (`strict: true`) — chat tools
6. Allowed tools (`tool_choice.type: "allowed_tools"`) — chat phases
7. Predicted outputs — verifier (most code unchanged during fixes)
8. Streaming — file generation real-time events
9. GPT-5.1-Codex-Max — file generation model
10. GPT-5-mini — lightweight tasks (test gen)
11. Prompt caching — system prompts reused across requests
12. GPT-5.2 prompting patterns — verbosity clamping, scope discipline
13. Reasoning summaries — debug logging
14. Provider detection — route to correct SDK
15. Model registry expansion — codex-max, mini, nano
16. Compaction-style context management — verifier fix iterations
17. Background mode awareness — long-running generations

## Section 1: Models (`models.ts`)
- Add `gpt-5.1-codex-max`, `gpt-5-mini`, `gpt-5-nano`
- Add `isOpenAIModel()` provider detection
- Keep `resolveModel()` for AI SDK consumers (chat route)

## Section 2: Planner (`planner.ts`)
- Use `openai.responses.create()` with `zodTextFormat(PlanSchema, "plan")`
- Reasoning effort: `high`
- Eliminates fragile JSON.parse + markdown fence stripping
- Plan schema defined as Zod → guaranteed valid JSON

## Section 3: Generator (`generator.ts`) — Approach B
- One API call per layer with N function tools (one per file)
- Each function tool: `{ name: "write_file", parameters: { path, content } }`
- Model generates all files in layer as parallel function calls
- Stream function call deltas for real-time UI
- Model: `gpt-5.1-codex-max`, reasoning effort: `medium`

## Section 4: Verifier (`verifier.ts`)
- Structured error analysis with `zodTextFormat`
- Predicted outputs for fix iterations (original content as prediction)
- Conversation state managed across retries
- Reasoning effort: `high` for error diagnosis

## Section 5: Chat Tools (`chat-tools.ts`)
- Add `strict: true` to all function schemas
- No other changes (stays on AI SDK)

## Section 6: System Prompt (`system-prompt.ts`)
- Add GPT-5.2 prompting patterns
- Verbosity clamping, scope discipline, design system enforcement

## Section 7: Requirement Check (`requirement-check.ts`)
- Use `zodTextFormat` for structured test generation
- Model: `gpt-5-mini` for cost efficiency
