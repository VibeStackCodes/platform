# Vercel Deployment Fix — Revert to Working State

## Problem

Adding `"type": "module"` to `package.json` (commit `b89cda1`) broke Vercel serverless functions. With `"type": "module"`, Vercel's nft (Node File Trace) fails to resolve cross-directory ESM imports — `api/index.ts` importing `../server/index` results in `ERR_MODULE_NOT_FOUND` at runtime.

18 subsequent commits attempted workarounds (esbuild pre-bundling, CJS polyfills, ESM externals, mainFields) — all failed because the underlying issue was `"type": "module"` breaking nft's import tracing.

## Root Cause

- **Working state** (`b9e7a4a`): `api/index.ts` re-exports `../server/index`. Vercel compiles `.ts` → CJS `.js`, nft traces the require, bundles `server/` into the function. No `"type": "module"`.
- **Broken state** (`b89cda1`+): `"type": "module"` added. Vercel's compiled output uses ESM. nft can't resolve cross-directory ESM imports. Runtime: `Cannot find module '/var/task/server/index'`.
- **Secondary failure**: esbuild bundling hit `jsonc-parser` UMD pattern (`t("./impl/format")`) — a dynamic require through a function parameter that no bundler can statically resolve.

## Fix

Revert deployment files to `b9e7a4a` state. `"type": "module"` is unnecessary:
- Source files are `.ts` (TypeScript handles ESM via tsconfig, not package.json)
- Bun treats all files as ESM by default
- Vite handles module format internally
- The only consumer of `"type": "module"` was Vercel's Node.js runtime — which it broke

## Changes

| File | Action |
|------|--------|
| `package.json` | Remove `"type": "module"`, revert build to `vite build && tsc --noEmit` |
| `api/index.ts` | Restore: `export { default } from '../server/index'` |
| `api/index.js` | Delete |
| `api/package.json` | Delete |
| `scripts/bundle-server.mjs` | Delete |
| `vercel.json` | Restore: functions → `api/index.ts`, rewrites → `/api/index.ts` |
| `server.ts` | Delete (zero-config entry, unused) |

## Verification

```bash
git push
# Wait ~50s
curl https://platform-dusky-tau.vercel.app/api/health
# Expected: {"status":"ok","db":"connected","timestamp":"..."}
```
