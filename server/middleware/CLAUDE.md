# Middleware — Auth

## auth.ts
Validates Supabase session, extracts user, extends Hono context with `c.var.user`.

- **Token priority**: `Authorization: Bearer` header → `sb-access-token` cookie → hostname-based cookie
- **Mock mode**: Returns `MOCK_USER` if `VITE_MOCK_MODE=true` or non-production
- **Token cache**: 30s TTL in-memory to avoid redundant `getUser()` calls
- **Env fallback**: Reads `NEXT_PUBLIC_SUPABASE_*` or `VITE_SUPABASE_*`

## Gotchas
- Token cache is in-memory — not distributed across Vercel instances
- No auto-renewal of refresh tokens (relies on client-side token lifecycle)
