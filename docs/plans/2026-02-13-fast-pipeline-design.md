# Fast Pipeline Design

**Goal**: Reduce generation-to-preview from ~10 minutes to ~60 seconds.

## Current Bottlenecks

| Step | Current | Target |
|------|---------|--------|
| Supabase provisioning | 3-5 min | <2s (local) / hidden (cloud parallel) |
| Template generation | 20s | 20s (unchanged) |
| bun install | 20s | 5s (cached in snapshot) |
| Build verification | 1-4 min | 5-10s (tsc --noEmit) |
| GitHub push | 15s | 15s (unchanged) |
| Vercel deploy | 2-3 min | 15s (pre-built upload) |
| **Total** | **5-10 min** | **~60s to preview, ~90s to deploy** |

## Architecture

```
User clicks "Approve & Generate"
  │
  ├── [Parallel A] Cloud Supabase provisioning (3-5 min, background)
  │
  ├── [Parallel B] Sandbox (from pre-baked snapshot)
  │     ├── Postgres + GoTrue already running (from snapshot)
  │     ├── Apply migration SQL to local Postgres (<1s)
  │     ├── Write scaffold files
  │     ├── bun install (fast — deps cached in snapshot)
  │     └── bun run dev (start HMR server)
  │
  ├── [Sequential, after B ready] Write template files
  │     ├── Each file triggers HMR → user sees live preview building
  │     ├── Files written in layer order (types → lib → hooks → components → pages)
  │     └── Preview URL available from the moment dev server starts
  │
  ├── tsc --noEmit (type-check only, 5-10s)
  ├── Git commit + push to GitHub
  │
  │   ... user explores live preview ...
  │
  └── User clicks "Deploy"
        ├── Cloud Supabase ready (provisioned in background)
        ├── Apply migration to cloud Supabase
        ├── Write .env.production with cloud Supabase credentials
        ├── bun run build (in sandbox, with cloud env vars)
        └── Upload dist/ to Vercel (pre-built, no Vercel build step)
```

## Component 1: Sandbox Snapshot with Supabase

Pre-bake the Daytona snapshot with:
- Node/Bun runtime
- Postgres 16 + GoTrue + PostgREST running as services
- Base `/workspace` with Vite scaffold and `node_modules` pre-cached
- Supabase local anon key + service role key pre-configured

Each sandbox gets its own isolated Postgres instance from the snapshot. No shared database.

## Component 2: HMR Dev Server

Start `bun run dev` after scaffold + `bun install`, before writing feature files.

Each template file write triggers Vite HMR. The user watches the app build itself in the preview panel — layout appears, then nav, then data tables, then forms.

**Risk**: Half-written app may have import errors causing HMR errors. Mitigated by writing files in dependency order (the template system already layers: scaffold → auth/data → features/UI).

## Component 3: tsc --noEmit Verification

Replace `bun run build` (full Vite bundle) with `tsc --noEmit` (type-check only) for build verification.

- Type checking catches 95%+ of build errors
- ~5-10x faster than full build
- Full build only happens once at deploy time

## Component 4: Dual Supabase Strategy

**During generation** (local, instant):
- Sandbox-local Postgres from snapshot
- Migration applied directly via `psql -h localhost`
- Generated app's `.env` → `localhost` Supabase

**During deploy** (cloud, pre-provisioned):
- Cloud Supabase provisioning started at the same time as generation
- By the time user clicks Deploy (~3-5 min later), cloud project is ready
- Migration applied to cloud project
- Production build uses cloud Supabase URL/keys
- If cloud Supabase isn't ready yet, poll until ready (should be rare)

## Component 5: Vercel Pre-Built Deploy

Instead of Vercel pulling from GitHub and rebuilding:
1. Run `bun run build` in the sandbox (with cloud env vars)
2. Download `dist/` from sandbox
3. Upload to Vercel as pre-built static files
4. Vercel serves immediately — no build step

Uses Vercel's Build Output API / file upload deployment endpoint.

## Implementation Order

1. **Snapshot**: Bake Supabase services into Daytona snapshot
2. **HMR**: Restructure template-pipeline to start dev server early
3. **tsc**: Replace `bun run build` with `tsc --noEmit` in verifier
4. **Dual Supabase**: Local migration + parallel cloud provisioning
5. **Pre-built deploy**: Build in sandbox, upload dist/ to Vercel

## Risks

| Risk | Mitigation |
|------|-----------|
| HMR crashes on partial writes | Layer-ordered file writing (already done) |
| tsc misses runtime errors | Rare for generated templates; full build at deploy catches these |
| Cloud Supabase not ready at deploy | Poll with timeout; user sees "Preparing database..." |
| Snapshot size increases | Postgres + GoTrue add ~200MB; acceptable for generation speed |
| Self-hosted Supabase maintenance | Only in sandbox (ephemeral); cloud Supabase for production |
