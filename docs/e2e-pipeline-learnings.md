# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-17
**Test Prompt**: Test 1 (Simple CRUD — Bookmarks Manager)
**Models**: gpt-5.2 (analyst), gpt-5.2-codex (codegen/repair/edit), gpt-5.2 (review)
**Total Duration**: 391.5s (~6.5 min)
**Total Tokens**: 69,936 (~$0.70 estimated)
**Helicone Session**: e2e-1771348107813

---

## Pipeline Phases

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
| 1 | Analysis | PASS | 45.6s | 7,087 | 4 tables, no clarification needed |
| 2 | Blueprint | PASS | 0.0s | 0 | 60 files, 8 LLM slots (deterministic) |
| 3 | Provisioning | PASS | 99.2s | 0 | Supabase cold creation bottleneck |
| 4 | Code Generation | PASS | 14.1s | 10,213 | 8 assembled files |
| 5 | Validation | FAIL | 21.5s | 0 | lint parse error + build fail |
| 6 | Repair #1 | DONE | 24.5s | 24,129 | Fixed some issues, not parse error |
| 7 | Re-Validation #1 | FAIL | 20.7s | 0 | Same parse error persists |
| 8 | Repair #2 | DONE | 77.7s | 28,507 | Fixed scaffold, not parse error |
| 9 | Re-Validation #2 | FAIL | 20.5s | 0 | Still parse error in user-profiles.tsx |
| 10 | Code Review | SKIP | 0.0s | 0 | Skipped (validation failed) |
| 11 | GitHub Push | PASS | 67.6s | 0 | Code pushed despite build failure |

## Token Distribution

| Category | Tokens | % of Total |
|----------|--------|-----------|
| Analysis (gpt-5.2) | 7,087 | 10% |
| Code Generation (gpt-5.2-codex) | 10,213 | 15% |
| Repair #1 (gpt-5.2-codex) | 24,129 | 34% |
| Repair #2 (gpt-5.2-codex) | 28,507 | 41% |
| **Total** | **69,936** | **100%** |

**Key finding**: Repair consumed 75% of total tokens but failed to fix the root issue.

---

## Analysis Output

- **App Name**: MarkNest
- **Description**: A personal bookmarks manager to save, tag, search, and star favorite links.
- **Tables**: user_profile(5 cols), bookmark(8 cols), tag(5 cols), bookmark_tag(5 cols)
- **Tokens**: 7,087

## Blueprint Output

- **Total Files**: 60
- **LLM Slot Files**: 8 (4 list pages + 4 detail pages)
- **Layers**: L0 (config), L1 (UI kit + schema), L2 (tRPC routers + SQL), L3 (route layout), L4 (page slots), L5 (routeTree + main)

## Provisioning Output

- **Sandbox**: a7e97d42-fb9e-4ed8-be0c-1d18f54d3696
- **Supabase**: uwrfovgwlqhgrcllrqxp (https://uwrfovgwlqhgrcllrqxp.supabase.co)
- **GitHub**: https://github.com/VibeStackCodes-Generated/vibestack-e2e-test-1771348153466

## Code Generation Output

- **Assembled Files**: 8
- **Tokens**: 10,213
- **Migration**: FAILED (syntax error in SQL)
- **Seed**: FAILED (tables don't exist because migration failed)
- **Procedure schemas**: ALL 4 FAILED (undefined — LLM returned empty)

## Validation Output

- **Manifest**: PASS
- **Scaffold**: Initial FAIL (hardcoded localhost, generic placeholders) → PASS after Repair #2
- **TypeCheck**: PASS (all 3 rounds)
- **Lint**: FAIL (parse error line 67 in user-profiles.tsx — truncated `const`)
- **Build**: FAIL (Vite can't parse multiple route files)
- **Overall**: FAILED

---

## Root Cause Analysis

### Bug 1: SQL Migration `REFERENCES ()` (CRITICAL)

**Error**: `syntax error at or near "(" — display_name TEXT REFERENCES () ON DELETE CASCADE`

**Root cause**: The analyst LLM produced a `user_profile.display_name` column with a `references` field containing empty table/column. The deterministic `contract-to-sql.ts` (line 104) trusts the contract blindly:
```typescript
if (col.references) {
  parts.push(`REFERENCES ${col.references.table}(${col.references.column}) ON DELETE CASCADE`)
}
```
When `references.table` is empty string, this produces `REFERENCES ()`.

**Fix**: Add guard in `contract-to-sql.ts`:
```typescript
if (col.references?.table && col.references?.column) {
  // ... emit REFERENCES clause
}
```
Also add a `SchemaContract` post-validation step that strips invalid references before SQL generation.

### Bug 2: Procedure Schema Returns `undefined` (HIGH)

**Error**: `"Invalid input: expected object, received undefined"` for all 4 tables.

**Root cause**: `backendAgent.generate()` with `structuredOutput: { schema: CustomProcedureSchema }` returned `result.object === undefined` for all 4 entity procedure prompts. The LLM either:
- Didn't engage with the constrained decoding schema
- Returned free-form text instead of JSON
- Hit a token limit before producing structured output

**Fix**: Add fallback — when `result.object` is `undefined`, generate a default set of procedures deterministically from the contract (search by name, filter by FK, etc.).

### Bug 3: Truncated LLM Output in user-profiles.tsx (HIGH)

**Error**: Parse error at line 67 — `cons` instead of `const`. The generated code was cut off mid-token.

**Root cause**: The frontend code generation for `user-profiles.tsx` produced 8,933 characters. The output appears to have been truncated — line 67 contains `cons` (missing the `t` from `const`). This persisted through 2 repair attempts because:
1. The repair agent reads the file, sees a parse error, but may not have enough context to know the full intended code
2. The repair prompt may not convey the exact error location clearly enough

**Fix**:
- Increase `maxSteps` or output token limit for frontend agent
- Add a truncation detection heuristic: if generated code ends mid-token or mid-line, re-request
- The repair agent should be more aggressive about rewriting truncated files from scratch

---

## Performance Analysis

| Phase | Duration | % of Total |
|-------|----------|-----------|
| Provisioning | 99.2s | 25% |
| Repair #2 | 77.7s | 20% |
| GitHub Push | 67.6s | 17% |
| Analysis | 45.6s | 12% |
| Repair #1 | 24.5s | 6% |
| Validation (3x) | 62.7s | 16% |
| Code Generation | 14.1s | 4% |
| Blueprint | 0.0s | 0% |

**Provisioning bottleneck**: Supabase cold creation (99.2s) dominated. Warm pool table (`supabase_warm_pool`) doesn't exist in the platform DB — this is expected to be <5s with a warm pool.

**Repair cost**: 2 repair cycles consumed 102.2s (26%) of wall time and 52,636 (75%) of tokens.

**Git push**: 67.6s for initial push is slow — likely because `git add -A` includes node_modules or build artifacts.

---

## Observability

### Helicone Session
- Session ID: `e2e-1771348107813`
- All LLM calls should appear under Sessions tab with per-agent breakdown
- Global context pattern (`setGlobalHeliconeContext()`) enables session tracking for scripts outside Hono scope

### XState Inspector
- Enabled via `XSTATE_INSPECT=true`
- `createSkyInspector()` streams to stately.ai/inspect
- Should show state machine transitions: idle → analyzing → blueprinting → provisioning → codeGenerating → validating → repairing → githubPushing

---

## Recommendations

### P0 (Critical — Fix Before Next Run)

1. **Guard empty FK references in contract-to-sql.ts** — check `col.references?.table && col.references?.column` before emitting REFERENCES clause
2. **Default procedures fallback** — when `result.object` is undefined, generate default CRUD procedures deterministically
3. **Truncation detection** — check if generated code ends with incomplete syntax (unclosed braces, truncated tokens) and re-request

### P1 (High — Quality Improvements)

4. **Warm pool Supabase projects** — saves ~95s per run
5. **Git push should exclude node_modules** — add `.gitignore` to blueprint before push
6. **Repair agent should rewrite truncated files** — instead of patching, fully regenerate files with parse errors
7. **Scaffold validation is too strict** — `localhost:3001` in vite.config.ts and `placeholder` in UI components are false positives from deterministic templates

### P2 (Medium — Cost Optimization)

8. **Cap repair attempts at 1 for parse errors** — if the same parse error persists after repair, the issue is in generation, not repair
9. **Reduce procedure prompt complexity** — the procedure schema prompt asks for too much; default procedures would cover 80% of use cases
10. **Front-load validation** — validate LLM output structure before writing to sandbox (catch truncation before expensive repair cycles)
