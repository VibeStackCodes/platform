# Server — Hono API

Hono REST API serving the VibeStack platform. All routes under `/api` basePath.

## Files
- `index.ts` — Hono app entry: CORS, Sentry, CSP headers, body limit (10MB), rate limiting, route mounting, Vercel adapter + `Bun.serve({ idleTimeout: 255 })`
- `sentry.ts` — Conditional Sentry init + `traceAgent()`/`traceTool()` span helpers for AI observability

## Key Patterns
- Server code uses **relative imports** (never `@/` alias — that's client-only)
- Env vars via `process.env.*` (never `import.meta.env`)
- Rate limiting: 5 req/min for `/agent`, 60 req/min global — DB-backed (PostgreSQL sliding window), survives Vercel cold starts
- Dual export: `handle(app)` for Vercel serverless, `Bun.serve()` for dev
- Health check: `GET /api/health` verifies DB connectivity

## Gotchas
- `Bun.serve({ idleTimeout: 255 })` is max — prevents SSE drops during long LLM calls (30-120s)
- Rate limiter is DB-backed — survives cold starts; fails open for non-critical paths, fails closed for `/api/agent` and `/api/stripe`
- CORS hardcodes allowed origins — never derives from Host header
