# Tests — Vitest

26 test files. Config in `vitest.config.ts` (happy-dom, globals enabled).

## Setup
- `setup.ts` — Minimal: sets API key env stubs for isolation
- Path aliases: `@/` → `src/`, `@server/` → `server/`

## Test Categories
- **UI components** (9 files): AI element cards (thinking, action, architecture, theme-tokens, page-progress, plan-approval, operation-summary), prompt bar modes, property panel
- **Route/API** (7 files): Admin, agent-route, projects, sandbox-urls, Stripe webhook/checkout, security-auth
- **Agent/tools** (5 files): Orchestrator factory, agent-tools wiring, integration (tool-belt + event shapes), tools (editFile/installPackage), relace client
- **Infrastructure** (4 files): Credits schema, credits settlement, rate-limit, vibestack-overlay
- **Live generation** (1 file): local-gen.test.ts — real Daytona/LLM, skipped in CI

## Key Patterns
- Mocking: `vi.mock()` for external services; env stubs in setup.ts
- Naming: `<module>.test.ts` mirrors source file
- `local-gen.test.ts` requires OPENAI_API_KEY + DAYTONA_API_KEY — auto-skipped when missing

## Run
```bash
bun run test          # All tests (excludes local-gen by env guard)
bun run test:ui       # Vitest UI
```
