# API Routes

All routes mounted under `/api` basePath in server/index.ts.

## Route Map
- `POST /api/agent` — XState pipeline SSE stream (credit-gated, 5 req/min)
- `GET /api/admin/health` — System diagnostics (DB, Daytona, env vars)
- `GET/POST /api/projects` — Project CRUD (ownership-verified)
- `GET /api/projects/:id/messages` — Chat message history
- `POST /api/projects/deploy` — Vercel deployment + GitHub repo creation
- `GET /api/projects/:id/sandbox-urls` — Signed preview + code server URLs (1h expiry)
- `POST /api/stripe/checkout` — Stripe checkout session ($20/mo, 2000 credits)
- `POST /api/stripe/webhook` — Stripe events (NO auth middleware)
- `POST /api/supabase-proxy/*` — Read-only Supabase Management API proxy (SELECT only)
- `GET /api/auth/callback` — OAuth code exchange (NO auth middleware)

## Key Patterns
- Auth: `authMiddleware` on all routes except webhooks and auth-callback
- Ownership: Project routes verify `userId` to prevent IDOR
- SSE: Only agent.ts uses `streamSSE()` — all others return JSON
- Credit gating: Returns 402 if credits insufficient; deduction post-execution (can go negative)
- Event persistence: `persistEvent()` in `streamActorStates` writes each agent event to `chatMessages` immediately (no debounce, no flush)

## Gotchas
- `streamActorStates()` MUST be called BEFORE `actor.send({ type: 'START' })` — subscribe-before-send
- `activeRuns` Map is in-memory — doesn't survive Vercel cold starts
- Stripe webhook verifies signature; never trusts request body without it
- Supabase proxy validates queries via regex — only `SELECT`/`WITH...SELECT` allowed
- Signed preview URLs expire in 1 hour
- Auth callback uses hardcoded allowed origins — never reflects Host header
