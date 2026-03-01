# Tests — Vitest

132 test files across 3 projects. Config in `vitest.config.ts` (Vitest 4 `projects` API).

## Projects

| Project | Env | Files | What |
|---------|-----|-------|------|
| `unit` | Node.js | 18 `.test.ts` | Server routes, tools, credits, rate-limit |
| `component` | Chromium (Playwright) | 8 `.test.tsx` | React component tests via `@testing-library/react` |
| `storybook` | Chromium (Playwright) | 106 `.stories.tsx` | Storybook portable stories (auto-discovered) |

## Setup
- `tests/setup.ts` — Unit project: sets API key env stubs
- `.storybook/vitest.setup.ts` — Browser projects: `setProjectAnnotations` + `@testing-library/jest-dom`
- Path aliases: `@/` → `src/`, `@server/` → `server/`

## Key Patterns
- Mocking: `vi.mock()` for external services; env stubs in setup.ts
- Naming: `<module>.test.ts` mirrors source file; stories are colocated next to components
- `local-gen.test.ts` requires OPENAI_API_KEY + DAYTONA_API_KEY — auto-skipped when missing
- Storybook stories are auto-included by `@storybook/addon-vitest` plugin — no manual include needed

## Run
```bash
bun run test                   # All 3 projects (unit + component + storybook)
bun run test -- --project unit # Server tests only (fast, ~1.5s)
bun run test -- --project component  # Component tests in Chromium (~3s)
bun run test -- --project storybook  # All 106 stories in Chromium (~33s)
```

## Scalar Tools
```bash
bun run docs:validate  # Validate OpenAPI spec (requires dev server running)
bun run docs:mock      # Start mock API server on port 8788 (from OpenAPI spec)
bun run docs:preview   # Preview Scalar docs locally on port 8789
bun run docs:export    # Export both Hono + Mastra OpenAPI specs to docs/ (requires both servers)
```

## OpenAPI Specs
- `docs/openapi.json` — Platform API (Hono, from `localhost:8787/api/doc`)
- `docs/mastra-openapi.json` — Mastra Studio API (168 endpoints, from `localhost:4111/api/openapi.json`)
- Both referenced in `scalar.config.json` for Scalar Docs hosted site
