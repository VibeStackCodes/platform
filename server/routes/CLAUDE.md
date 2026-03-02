# API Routes

All routes mounted under `/api` basePath in server/index.ts. OpenAPI spec auto-generated via `hono-openapi` at `GET /api/doc`, interactive Scalar docs at `GET /api/reference`.

## Route Map
- `POST /api/agent` — Single orchestrator SSE stream (credit-gated, 5 req/min). Persists `sandboxId` and `githubRepoUrl` from tool results to DB.
- `GET /api/admin/health` — System diagnostics (DB, Daytona, env vars)
- `GET/POST /api/projects` — Project CRUD (ownership-verified). ProjectSchema includes `deployUrl`.
- `GET /api/projects/:id/messages` — Chat message history (via Mastra memory threads, falls back to chatMessages table). Extracts tool-invocation parts as `tool_complete` events.
- `POST /api/projects/deploy` — Vercel deployment (GitHub-first, file-upload fallback). Uses GitHub App installation token. Persists deploy message to Mastra memory. Assigns custom wildcard domain if `VERCEL_WILDCARD_DOMAIN` set.
- `GET /api/projects/:id/sandbox-urls` — Signed preview + code server URLs (1h expiry). Returns `recreating: true` while auto-recreating expired sandboxes. Race-guarded with in-memory `recreatingProjects` Set.
- `POST /api/stripe/checkout` — Stripe checkout session ($20/mo, 2000 credits)
- `POST /api/stripe/webhook` — Stripe events (NO auth middleware)
- `GET /api/auth/callback` — OAuth code exchange (NO auth middleware)

## Key Patterns
- Auth: `authMiddleware` on all routes except webhooks and auth-callback
- Ownership: Project routes verify `userId` to prevent IDOR
- SSE: Only agent.ts uses `createSSEStream()` — all others return JSON
- Credit gating: `reserveCredits()` pre-execution, `settleCredits()` post-execution. Returns 402 if insufficient.
- Agent route bridges Mastra `agent.stream()` fullStream chunks to typed SSE events (AgentStreamEvent)
- OpenAPI schemas defined via Zod + `describeRoute()` — export with `curl localhost:8787/api/doc > docs/openapi.json`

## Gotchas
- Signed preview URLs expire in 1 hour — client polls every 2s until available, then stops
- Sandbox recreation is fire-and-forget — `sandbox-urls` returns `{ recreating: true }` immediately while async recreation runs
- Deploy route uses `getInstallationToken()` (GitHub App), NOT `process.env.GITHUB_TOKEN`
- Deploy message persisted to Mastra memory with `MastraMessageContentV2` format (`{ format: 2, parts: [...] }`)
- Stripe webhook verifies signature; never trusts request body without it
- Auth callback uses hardcoded allowed origins — never reflects Host header
