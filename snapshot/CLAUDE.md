# Snapshot — Daytona Sandbox Image

Lovable-style Docker image (`vibestack-workspace`) used as base for generated app sandboxes.

## Build
- **Base**: `oven/bun:1-debian` (Bun runtime, not Node)
- **System deps**: git, curl, tmux
- **OpenVSCode Server**: v1.106.3 on port 13337 (browser IDE)
- **OxLint**: Pre-installed globally (single Rust binary)
- **Template repo**: `git clone https://github.com/VibeStackCodes/vibestack-template.git` — single source of truth
- **shadcn/ui**: 46 components pre-installed in template repo's `src/components/ui/`
- **Visual editor**: Penpal + Vite plugin (`vite-plugin-vibestack-editor.ts`) for parent ↔ iframe communication
- **Warmup**: `bun run dev` + `tsc --noEmit` at build time → pre-bundles `.vite/` + `.tsbuildinfo`
- **Entrypoint**: tmux (dev server with auto-restart) + OpenVSCode Server (foreground)

## Template Repo (`VibeStackCodes/vibestack-template`)
**Single source of truth for the app scaffold. There is NO local scaffold directory.** The Dockerfile clones this repo directly — all scaffold changes (preload script, vite config, components, etc.) MUST be pushed to the template repo first, then snapshot rebuilt.
To update scaffold: push to `VibeStackCodes/vibestack-template` → `bun snapshot/rebuild.ts`.

Includes: React 19, React Router DOM 7, Tailwind v4, shadcn/ui, Radix UI, Recharts, Framer Motion, React Hook Form + Zod, TanStack Query, Penpal (editor bridge), and all common utility libraries.

## Gotchas
- Sandbox ready to `bun run dev` in <5s thanks to pre-bundled deps
- Each sandbox ~3 GiB memory; org cap ~10 GiB → max 3-4 concurrent runs
- `cacheDir: '/tmp/.vite'` in generated vite.config prevents EXDEV cross-device rename errors
- Tailwind v4 uses `@tailwindcss/vite` plugin — no postcss.config.js needed
- `optimizeDeps.include` in vite.config.ts ensures ALL deps are pre-bundled to prevent 504s during Vite cold starts
- Expired/deleted sandboxes are auto-recreated by `sandbox-urls` route: creates from snapshot → `git fetch + reset --hard` from GitHub repo → `bun install`
