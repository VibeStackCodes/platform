# Client — Vite SPA (React 19 + TanStack Router)

Single-page application for the VibeStack builder UI.

## Files
- `main.tsx` — Root entry: QueryClient (30s staleTime), RouterProvider, ThemeProvider, deferred Sentry
- `index.css` — Tailwind v4 CSS-first theme: oklch colors, 26 tokens, perspective-grid animation
- `sentry.client.ts` — Conditional init gated on `VITE_SENTRY_DSN` (10% trace/replay rate)

## Key Patterns
- Import alias: `@/` → `src/` (client code only — never use `@server/`)
- Env vars: `import.meta.env.VITE_*` only — server vars not exposed to client
- Auth context passed via TanStack Router's `RouterContext` to all routes
- QueryClient configured globally — no per-route overrides
- Root layout wraps in TooltipProvider (prevents Radix tooltip crashes)

## Libs (`src/lib/`)
- `auth.ts` — `useAuth()` hook: subscribes to `supabase.auth.onAuthStateChange()`
- `supabase-browser.ts` — Singleton Supabase client
- `utils.ts` — `cn()` (clsx + tw-merge), `apiFetch()` (auto-injects Bearer token)
- `types.ts` — 30 SSE event types, Project, GenerationState, ElementContext, TimelineEntry
