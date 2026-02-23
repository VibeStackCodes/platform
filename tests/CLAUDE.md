# Tests — Vitest

57 test files, ~16.9k lines. Config in `vitest.config.ts` (happy-dom, globals enabled).

## Setup
- `setup.ts` — Minimal: sets API key env stubs for isolation
- Path aliases: `@/` → `src/`, `@server/` → `server/`
- Coverage thresholds: 50% statements, 40% branches, 45% functions, 50% lines

## Test Categories
- **Contract/schema** (8 files): SchemaContract parsing, SQL generation, seed, pages, property-based (fast-check)
- **Agent/orchestrator** (9 files): XState machine, SSE streaming, design agent, edit machine, analysis/validation/codegen/deployment
- **Assembly/validation** (6 files): Page assembler, page validator, deterministic assembly, build validator, section composition
- **A11y** (2 files): axe-core on 50 section renderers + assembled pages (109 tests)
- **Route/API** (5 files): Admin, projects, agent tools, Stripe webhook/checkout, Supabase proxy
- **Security** (2 files): RLS + auth gates, SQL injection, XSS

## Helpers
- `helpers/axe-helper.ts` — JSX→HTML transform + axe-core runner. `SEMANTIC_MAP` maps PascalCase→HTML (Button→button, Link→a, Label→label). Test-only — never uses user input.

## Key Patterns
- Property-based tests: `fast-check` for schema invariants (500 random schemas per test)
- Mocking: `vi.mock()` for external services; env stubs in setup.ts
- A11y tests: Transform JSX strings → HTML → axe-core analysis in happy-dom
- Naming: `<module>.test.ts` mirrors source file (e.g., `machine.test.ts` ↔ `agents/machine.ts`)

## Run
```bash
bun run test          # All tests
bun run test:ui       # Vitest UI
```
