# OxC Ecosystem Full Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Babel/Rollup/esbuild/ESLint with OxC-powered alternatives (Vite 8 Beta, oxlint) across generated apps and platform, and integrate `oxlint --fix` into the generation pipeline.

**Architecture:** Generated sandbox apps upgrade from Vite 7 to Vite 8 Beta (Rolldown + OxC internally). Platform replaces ESLint with oxlint. The diagnostics pipeline gains an `oxlint --fix --fix-suggestions` pass before AI-powered fixes to eliminate trivial lint violations at zero API cost.

**Tech Stack:** Vite 8.0.0-beta.14, @vitejs/plugin-react v5, oxlint, Rolldown, OxC

**Design doc:** `docs/plans/2026-02-14-oxc-ecosystem-design.md`

---

### Task 1: Upgrade Snapshot to Vite 8 Beta

**Files:**
- Modify: `snapshot/package-base.json`

**Step 1: Update package versions**

In `snapshot/package-base.json`, make these changes:

1. Change the build script from `tsc -b && vite build` to `tsc --noEmit && vite build`
2. Change `@vitejs/plugin-react` from `^4.3.0` to `^5.0.0`
3. Change `vite` from `^7.3.1` to `8.0.0-beta.14`
4. Remove `vite-plugin-checker` from devDependencies entirely

The final file should be:

```json
{
  "name": "vibestack-workspace",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0",
    "@supabase/supabase-js": "^2.95.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.0",
    "zod": "^3.24.0",
    "@electric-sql/pglite": "^0.2.0",
    "class-variance-authority": "^0.7.1",
    "radix-ui": "^1.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.7.0",
    "vite": "8.0.0-beta.14",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0"
  }
}
```

**Step 2: Verify the change**

Run: `cat snapshot/package-base.json | python3 -c "import sys,json;json.load(sys.stdin);print('Valid JSON')"`
Expected: `Valid JSON`

**Step 3: Commit**

```bash
git add snapshot/package-base.json
git commit -m "feat: upgrade sandbox to Vite 8 beta (Rolldown + OxC)"
```

---

### Task 2: Remove vite-plugin-checker from Vite Configs

**Files:**
- Modify: `snapshot/warmup-scaffold/vite.config.ts`
- Modify: `templates/scaffold/vite.config.ts.hbs`

**Step 1: Update warmup scaffold vite config**

Replace the entire contents of `snapshot/warmup-scaffold/vite.config.ts` with:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: 'all',
  },
});
```

Key change: removed `import checker from 'vite-plugin-checker'` and `checker({ typescript: true })` from plugins.

**Step 2: Update scaffold template**

Replace the entire contents of `templates/scaffold/vite.config.ts.hbs` with:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: 'all',
  },
});
```

Key change: same removal of `checker` import and plugin. The template had `enableBuild: false` which is now unnecessary since per-layer diagnostics handle error checking.

**Step 3: Verify no remaining checker references**

Run: `grep -r "vite-plugin-checker" snapshot/ templates/`
Expected: no output (no matches)

**Step 4: Commit**

```bash
git add snapshot/warmup-scaffold/vite.config.ts templates/scaffold/vite.config.ts.hbs
git commit -m "feat: remove vite-plugin-checker from sandbox configs"
```

---

### Task 3: Replace ESLint with OxLint on Platform

**Files:**
- Modify: `package.json:15,94-95`
- Delete: `eslint.config.mjs`
- Create: `oxlint.json`

**Step 1: Update package.json lint script**

In `package.json`, change line 15:

```
FROM: "lint": "eslint",
TO:   "lint": "oxlint",
```

**Step 2: Swap dependencies in package.json**

Remove these two lines from `devDependencies`:
```
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
```

Add this line to `devDependencies`:
```
    "oxlint": "^1.0.0",
```

**Step 3: Delete ESLint config**

```bash
rm eslint.config.mjs
```

**Step 4: Create oxlint.json**

Create `oxlint.json` at project root with:

```json
{
  "$schema": "https://raw.githubusercontent.com/nicolo-ribaudo/oxc-project_oxc/json-schema/npm/oxlint/configuration_schema.json",
  "rules": {},
  "ignorePatterns": [".next", "out", "build"]
}
```

**Step 5: Install dependencies**

Run: `pnpm install`
Expected: installs oxlint, removes eslint + eslint-config-next

**Step 6: Verify oxlint runs**

Run: `pnpm lint`
Expected: oxlint runs and reports results (warnings are OK, errors should be reviewed)

**Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml oxlint.json
git rm eslint.config.mjs
git commit -m "feat: replace ESLint with oxlint for platform linting"
```

---

### Task 4: Add `autoFixLintErrors()` to Layer Diagnostics

**Files:**
- Modify: `lib/layer-diagnostics.ts:91-165`

**Step 1: Add the autoFixLintErrors function**

In `lib/layer-diagnostics.ts`, add the following function between the parsers section (after line 89, after `parseOxlintOutput`) and the main entry point section (before the `// Main Entry Point` comment at line 91):

```typescript
// ============================================================================
// Auto-Fix
// ============================================================================

/**
 * Run oxlint --fix --fix-suggestions in the sandbox to auto-fix trivial
 * lint violations (unused imports, let→const, arrow bodies, etc.) at zero
 * API cost before running AI-powered fixes.
 *
 * Uses --fix (safe, no behavior change) + --fix-suggestions (may alter
 * behavior but safe for generated code we fully own).
 * Does NOT use --fix-dangerously (changes type definitions/logic operators).
 */
export async function autoFixLintErrors(sandbox: Sandbox): Promise<string> {
  try {
    const result = await runCommand(
      sandbox,
      'oxlint src/ --fix --fix-suggestions 2>&1 || true',
      'oxlint-autofix',
      { cwd: '/workspace', timeout: 30 },
    );
    console.log(`[layer-diagnostics] oxlint --fix completed (exit ${result.exitCode})`);
    return result.stdout;
  } catch (err) {
    console.warn('[layer-diagnostics] oxlint --fix failed (non-fatal):', err);
    return '';
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add lib/layer-diagnostics.ts
git commit -m "feat: add autoFixLintErrors() for zero-cost lint auto-fix"
```

---

### Task 5: Integrate `oxlint --fix` into Generator Pipeline

**Files:**
- Modify: `lib/generator.ts:1-11,162-181`

**Step 1: Update imports**

In `lib/generator.ts`, change line 9:

```
FROM: import { runLayerDiagnostics } from './layer-diagnostics';
TO:   import { runLayerDiagnostics, autoFixLintErrors } from './layer-diagnostics';
```

**Step 2: Add autofix before diagnostics**

In `lib/generator.ts`, the per-layer diagnostics block starts at line 162. Change lines 162-181 to:

```typescript
    // Per-layer diagnostics: auto-fix trivials, then run tsc + oxlint, fix remaining with AI
    // Skip on final layer — the build verifier handles that with retries
    if (layer < maxLayer) {
      try {
        // Step 1: Auto-fix trivial lint violations (free, instant, no API cost)
        await autoFixLintErrors(sandbox);

        // Step 2: Run diagnostics (tsc + oxlint) on remaining issues
        const diagnostics = await runLayerDiagnostics(sandbox, writtenFiles, pendingFiles);
        if (diagnostics.totalErrors > 0) {
          console.log(`[generator] Layer ${layer}: ${diagnostics.totalErrors} errors found, fixing...`);
          emit({ type: 'checkpoint', label: `Fixing layer ${layer} errors`, status: 'active' });

          // Step 3: AI fix only for what oxlint couldn't fix
          const { fixedFiles } = await fixLayerErrors(sandbox, diagnostics, generatedContents, model, emit);
          // Update generatedContents with fixed versions
          for (const path of fixedFiles) {
            const buf = await sandbox.fs.downloadFile(`/workspace/${path}`);
            generatedContents.set(path, buf.toString('utf-8'));
          }
          emit({ type: 'checkpoint', label: `Fixing layer ${layer} errors`, status: 'complete' });
        }
      } catch (err) {
        console.warn(`[generator] Layer ${layer} diagnostics failed (non-fatal):`, err);
      }
    }
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add lib/generator.ts
git commit -m "feat: add oxlint --fix before AI-powered layer diagnostics"
```

---

### Task 6: Integrate `oxlint --fix` into Edit Executor

**Files:**
- Modify: `lib/edit-executor.ts:1-11,129-158`

**Step 1: Update imports**

In `lib/edit-executor.ts`, change line 4:

```
FROM: import { runLayerDiagnostics } from './layer-diagnostics';
TO:   import { runLayerDiagnostics, autoFixLintErrors } from './layer-diagnostics';
```

**Step 2: Add autofix after upload, before diagnostics**

In `lib/edit-executor.ts`, after the upload loop (line 132: `}`) and before the diagnostics (line 134: `// Step 6`), insert:

```typescript
    // Step 5.5: Auto-fix trivial lint issues in modified files
    await autoFixLintErrors(sandbox);
```

The section should now read:

```typescript
    // Step 5: Upload modified files
    for (const [path, content] of modifiedFiles) {
      await uploadFile(sandbox, content, `/workspace/${path}`);
    }

    // Step 5.5: Auto-fix trivial lint issues in modified files
    await autoFixLintErrors(sandbox);

    // Step 6: Run diagnostics on modified files
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add lib/edit-executor.ts
git commit -m "feat: add oxlint --fix after AI edits in edit executor"
```

---

### Task 7: Integrate `oxlint --fix` into Build Verifier

**Files:**
- Modify: `lib/verifier.ts:1-9,265-276`

**Step 1: Add import**

In `lib/verifier.ts`, after line 9 (`import { stripCodeFences } from './utils';`), add:

```typescript
import { autoFixLintErrors } from './layer-diagnostics';
```

**Step 2: Add autofix before each build attempt**

In `lib/verifier.ts`, inside the `while` loop in `verifyAndFix()`, after the build attempt logging (line 267) and before the build run (line 276: `const buildResult = await runBuild(sandbox);`), add:

```typescript
    // Auto-fix trivial lint violations before build
    await autoFixLintErrors(sandbox);
```

The section should now read:

```typescript
    emit({
      type: 'checkpoint',
      label: `Build attempt ${attempt}/${MAX_FIX_RETRIES}`,
      status: 'active',
    });

    // Auto-fix trivial lint violations before build
    await autoFixLintErrors(sandbox);

    // Run build
    const buildResult = await runBuild(sandbox);
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add lib/verifier.ts
git commit -m "feat: add oxlint --fix before build verification"
```

---

### Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:10`

**Step 1: Update lint command reference**

In `CLAUDE.md`, change line 10:

```
FROM: pnpm lint             # ESLint (next/core-web-vitals + typescript)
TO:   pnpm lint             # OxLint (670+ rules, replaces ESLint)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md lint command reference to oxlint"
```

---

### Task 9: Run Full Verification

**Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 2: Unit tests**

Run: `pnpm test`
Expected: all tests pass

**Step 3: Lint**

Run: `pnpm lint`
Expected: oxlint runs successfully (warnings OK, no blocking errors)

**Step 4: E2E mock tests**

Run: `pnpm test:e2e:mock`
Expected: all tests pass (or only pre-existing failures)

---

## File Summary

| Task | Action | File | Purpose |
|------|--------|------|---------|
| 1 | Modify | `snapshot/package-base.json` | Vite 8, plugin-react v5, drop checker |
| 2 | Modify | `snapshot/warmup-scaffold/vite.config.ts` | Remove vite-plugin-checker |
| 2 | Modify | `templates/scaffold/vite.config.ts.hbs` | Remove vite-plugin-checker |
| 3 | Modify | `package.json` | ESLint → oxlint |
| 3 | Delete | `eslint.config.mjs` | No longer needed |
| 3 | Create | `oxlint.json` | Platform oxlint config |
| 4 | Modify | `lib/layer-diagnostics.ts` | Add autoFixLintErrors() |
| 5 | Modify | `lib/generator.ts` | Call autofix before diagnostics |
| 6 | Modify | `lib/edit-executor.ts` | Call autofix after AI edits |
| 7 | Modify | `lib/verifier.ts` | Call autofix before build |
| 8 | Modify | `CLAUDE.md` | Update lint docs |

## Dependency Graph

```
Task 1 (package-base.json) ─┐
Task 2 (vite configs)       ├── independent, can parallelize
Task 3 (ESLint → oxlint)   ─┘
Task 4 (autoFixLintErrors)  ─── foundation for Tasks 5, 6, 7
Task 5 (generator.ts)       ─┐
Task 6 (edit-executor.ts)    ├── depend on Task 4
Task 7 (verifier.ts)        ─┘
Task 8 (CLAUDE.md)          ─── independent
Task 9 (verification)       ─── depends on all above
```
