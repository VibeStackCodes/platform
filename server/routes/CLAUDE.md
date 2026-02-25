# API Routes

All routes mounted under `/api` basePath in server/index.ts.

## Route Map
- `POST /api/agent` — Single orchestrator SSE stream (credit-gated, 5 req/min)
- `GET /api/admin/health` — System diagnostics (DB, Daytona, env vars)
- `GET/POST /api/projects` — Project CRUD (ownership-verified)
- `GET /api/projects/:id/messages` — Chat message history
- `POST /api/projects/deploy` — Vercel deployment + GitHub repo creation
- `GET /api/projects/:id/sandbox-urls` — Signed preview + code server URLs (1h expiry)
- `POST /api/stripe/checkout` — Stripe checkout session ($20/mo, 2000 credits)
- `POST /api/stripe/webhook` — Stripe events (NO auth middleware)
- `GET /api/auth/callback` — OAuth code exchange (NO auth middleware)

## Key Patterns
- Auth: `authMiddleware` on all routes except webhooks and auth-callback
- Ownership: Project routes verify `userId` to prevent IDOR
- SSE: Only agent.ts uses `createSSEStream()` — all others return JSON
- Credit gating: `reserveCredits()` pre-execution, `settleCredits()` post-execution. Returns 402 if insufficient.
- Agent route bridges Mastra `agent.stream()` fullStream chunks to typed SSE events (AgentStreamEvent)

## Gotchas
- Signed preview URLs expire in 1 hour
- Stripe webhook verifies signature; never trusts request body without it
- Auth callback uses hardcoded allowed origins — never reflects Host header
