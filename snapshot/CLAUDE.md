# Snapshot — Daytona Sandbox Image

Docker image (`vibestack-workspace`) used as base for generated app sandboxes.

## Build
- **Base**: `oven/bun:1-debian` (Bun runtime, not Node)
- **System deps**: git, curl, tmux
- **OpenVSCode Server**: v1.106.3 on port 13337 (browser IDE)
- **OxLint**: Pre-installed globally (single Rust binary)
- **Warmup**: `bun run dev` + `tsc --noEmit` at build time → pre-bundles `.vite/` + `.tsbuildinfo`
- **Entrypoint**: tmux (dev server) + OpenVSCode Server (foreground)

## Pre-Cached Deps (`package-base.json`)
React 19, TanStack Router v1, Radix UI, Tailwind v4, Vite 8, Recharts, PGlite, shadcn/ui stubs

## UI Kit (`ui-kit/` — 37 components)
Pre-copied shadcn/ui components — generated apps never need `shadcn-ui add`

## Warmup Scaffold (`warmup-scaffold/`)
Minimal React+Vite app used ONLY for cache warming. Deleted after build; caches retained.

## Gotchas
- Sandbox ready to `bun run dev` in <5s thanks to pre-bundled deps
- Each sandbox ~3 GiB memory; org cap ~10 GiB → max 3-4 concurrent runs
- `cacheDir: '/tmp/.vite'` in generated vite.config prevents EXDEV cross-device rename errors
