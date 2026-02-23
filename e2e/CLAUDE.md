# E2E Tests — Playwright

Two test projects: mock (fast, no external services) and real (full pipeline).

## Config
- `playwright.config.ts`: 1 worker (sequential — shared auth state), 60s default timeout
- `global-setup.ts`: Cleans up Supabase projects, Daytona sandboxes, Vercel deployments before run

## Projects
- **mock** (`full-flow.spec.ts`, port 3100): `VITE_MOCK_MODE=true` — fake 2-3s agent delays, no OpenAI/Daytona/Supabase
- **real** (`real-generation.spec.ts`, port 3000): Full pipeline (15min timeout), requires all env vars

## Run
```bash
bun run test:e2e:mock   # Mock mode (CI-safe)
bun run test:e2e:real   # Real services (requires all API keys)
```

## Gotchas
- Global setup deletes ALL non-protected resources (Supabase free tier: max 2 projects)
- Sequential execution required — tests share auth state
- Real tests intercept `/api/agent` to force model selection
