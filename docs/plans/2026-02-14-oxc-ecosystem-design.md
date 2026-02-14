# OxC Ecosystem Full Integration Design

## Goal

Replace Babel, Rollup, esbuild, and ESLint with OxC-powered alternatives across both the generated sandbox apps (Vite 8 / Rolldown) and the platform (oxlint). Integrate `oxlint --fix` into the generation pipeline for cost-free auto-fixes before AI intervention.

## Architecture

Generated apps move from Vite 7 (Rollup + esbuild + Babel) to Vite 8 Beta (Rolldown + OxC). The platform replaces ESLint with oxlint. The diagnostics pipeline gains an `oxlint --fix` pass before AI-powered fixes.

## Decisions

- **Vite 8 Beta** over `rolldown-vite` alias — official release track, same Rolldown internals
- **Keep `tsc --noEmit`** for type-checking — oxlint type-aware rules are alpha, tsc is battle-tested
- **`oxlint --fix --fix-suggestions`** for generated code — safe since we own the entire codebase
- **No `--fix-dangerously`** — changes type definitions and logic operators, could break apps
- **Drop `vite-plugin-checker`** from generated apps — per-layer diagnostics already run tsc + oxlint independently

---

## Section 1: Generated Apps — Vite 8 Beta with OxC Toolchain

### Package Changes (`snapshot/package-base.json`)

| Package | Before | After |
|---------|--------|-------|
| `vite` | `^7.3.1` | `8.0.0-beta.14` |
| `@vitejs/plugin-react` | `^4.3.0` | `^5.0.0` |
| `vite-plugin-checker` | `^0.8.0` | REMOVED |

### Build Script Change

```
Before: "build": "tsc -b && vite build"
After:  "build": "tsc --noEmit && vite build"
```

`tsc -b` does type-checking + transpilation. With Vite 8, Rolldown/OxC handles transpilation, so tsc only needs `--noEmit`.

### What Vite 8 Replaces Internally

| Layer | Vite 7 | Vite 8 (Rolldown) |
|-------|--------|-------------------|
| JSX Transform | Babel (`plugin-react` v4) | OxC (`plugin-react` v5) |
| Bundler | Rollup | Rolldown (10-30x faster) |
| JS Minifier | esbuild | OxC minifier |
| CSS Minifier | esbuild | Lightning CSS |
| Module Resolver | Vite's JS resolver | OxC resolver (28x faster) |
| Dev Optimizer | esbuild | Rolldown native |

### Vite Config Changes

Remove `vite-plugin-checker` from `warmup-scaffold/vite.config.ts` and `templates/scaffold/vite.config.ts.hbs`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  server: { host: '0.0.0.0', allowedHosts: 'all' },
});
```

---

## Section 2: Platform — Replace ESLint with OxLint

### Why Full Replacement

`eslint-config-next` bundles React, JSX-a11y, TypeScript, and Next.js-specific rules. OxLint covers the first three natively (670+ rules). The gap is ~15 Next.js-specific rules (`no-img-element`, `no-html-link-for-pages`, etc.) which are low-value for this codebase — UI goes through shadcn/ui components.

### Changes

1. Remove `eslint`, `eslint-config-next` from `devDependencies`
2. Add `oxlint` to `devDependencies`
3. Delete `eslint.config.mjs`
4. Create `oxlint.json` with sensible defaults
5. Update `package.json`: `"lint": "oxlint"`
6. Update `CLAUDE.md` lint command reference

### oxlint.json

```json
{
  "$schema": "https://raw.githubusercontent.com/nicolo-ribaudo/oxc-project_oxc/json-schema/npm/oxlint/configuration_schema.json",
  "rules": {},
  "ignorePatterns": [".next", "out", "build"]
}
```

---

## Section 3: Snapshot & Template Updates

### Dockerfile

No changes needed — `oxlint` global install already present. Warmup steps (`bun run dev` + `tsc --noEmit`) remain the same and will pre-warm Rolldown caches.

### warmup-scaffold/vite.config.ts

Remove `vite-plugin-checker` import and plugin entry.

### templates/scaffold/vite.config.ts.hbs

Same — remove `vite-plugin-checker`.

### Impact on Existing Pipeline

- `lib/layer-diagnostics.ts` — no changes to diagnostic detection (tsc + oxlint run independently)
- `lib/verifier.ts` — no changes (`bun run build` maps to updated script)

---

## Section 4: `oxlint --fix` Integration

### Rationale

OxLint has 150+ safe auto-fixable rules (unused imports, let→const, arrow bodies, template literals, JSX booleans, import sorting). Running `--fix` before AI intervention eliminates trivial violations at zero API cost.

Using `--fix --fix-suggestions` for generated code (we own the codebase, no existing behavior to preserve). NOT using `--fix-dangerously` (changes type definitions and logic operators).

### Integration Points

#### A. Per-Layer Diagnostics (`lib/layer-diagnostics.ts`)

New function: `autoFixLintErrors(sandbox: Sandbox): Promise<string>`

Runs `oxlint src/ --fix --fix-suggestions 2>&1` in the sandbox. Returns stdout (fix summary).

Called in `lib/generator.ts` before the diagnostic check + AI fix loop:

```
After each layer:
  1. oxlint --fix --fix-suggestions    ← auto-fix trivial issues (free, instant)
  2. tsc --noEmit + oxlint --format unix  ← detect remaining errors
  3. AI fix (only for what oxlint couldn't fix)
```

#### B. Edit Executor (`lib/edit-executor.ts`)

After AI uploads edited files, before `tsc --noEmit` verification:

```
  1. AI generates edits → upload
  2. oxlint --fix --fix-suggestions    ← clean up AI output
  3. tsc --noEmit verification
```

#### C. Verifier (`lib/verifier.ts`)

Before the `bun run build` step, run `oxlint --fix --fix-suggestions` to clear lint violations that could cause build failures.

---

## File Summary

| Action | File | Purpose |
|--------|------|---------|
| Modify | `snapshot/package-base.json` | Vite 8 beta, plugin-react v5, remove vite-plugin-checker |
| Modify | `snapshot/warmup-scaffold/vite.config.ts` | Remove vite-plugin-checker |
| Modify | `templates/scaffold/vite.config.ts.hbs` | Remove vite-plugin-checker |
| Modify | `package.json` | Replace eslint with oxlint, update lint script |
| Delete | `eslint.config.mjs` | No longer needed |
| Create | `oxlint.json` | OxLint config for platform |
| Modify | `lib/layer-diagnostics.ts` | Add autoFixLintErrors(), update pipeline order |
| Modify | `lib/generator.ts` | Call autoFixLintErrors() before diagnostics |
| Modify | `lib/edit-executor.ts` | Add oxlint --fix after AI edits |
| Modify | `lib/verifier.ts` | Add oxlint --fix before build |
| Modify | `CLAUDE.md` | Update lint command reference |

## Verification

1. `pnpm lint` runs oxlint (not eslint) and passes
2. `pnpm test` passes (unit tests unaffected)
3. `pnpm test:e2e:mock` passes
4. `npx tsc --noEmit` passes
5. Snapshot builds successfully with Vite 8 beta deps
