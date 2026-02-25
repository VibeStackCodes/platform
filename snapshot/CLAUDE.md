# Snapshot — Daytona Sandbox Image

Lovable-style Docker image (`vibestack-workspace`) used as base for generated app sandboxes.

## Build
- **Base**: `oven/bun:1-debian` (Bun runtime, not Node)
- **System deps**: git, curl, tmux
- **OpenVSCode Server**: v1.106.3 on port 13337 (browser IDE)
- **OxLint**: Pre-installed globally (single Rust binary)
- **Template repo**: `git clone https://github.com/VibeStackCodes/vibestack-template.git` — no `git init`, proper git history
- **shadcn/ui**: 46 components pre-installed in template repo's `src/components/ui/`
- **Warmup**: `bun run dev` + `tsc --noEmit` at build time → pre-bundles `.vite/` + `.tsbuildinfo`
- **Entrypoint**: tmux (dev server with auto-restart) + OpenVSCode Server (foreground)

## Template Repo (`VibeStackCodes/vibestack-template`)
Full Lovable-style app template — NOT a throwaway warmup. The agent edits files in-place.
Source of truth is `scaffold/` in this repo. Sync to template with: push scaffold → rebuild snapshot.

Includes: React 19, React Router DOM 7, Tailwind v4, shadcn/ui, Radix UI, Recharts, Framer Motion, React Hook Form + Zod, TanStack Query, and all common utility libraries.

## Gotchas
- Sandbox ready to `bun run dev` in <5s thanks to pre-bundled deps
- Each sandbox ~3 GiB memory; org cap ~10 GiB → max 3-4 concurrent runs
- `cacheDir: '/tmp/.vite'` in generated vite.config prevents EXDEV cross-device rename errors
- Tailwind v4 uses `@tailwindcss/vite` plugin — no postcss.config.js needed
