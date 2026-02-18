# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-18
**Test Scope**: 10 diverse apps across all genres (simple CRUD → complex multi-table SaaS)
**Model**: gpt-5.2 via Helicone proxy
**Final Result**: 10/10 apps deployed to Vercel

---

## Final Results Summary

| # | App | Tables | Duration | Tokens | URL | Status |
|---|-----|--------|----------|--------|-----|--------|
| 1 | Recipe App | recipe, recipe_ingredient, recipe_step, recipe_favorite | 99s | 7347 | [openrecipe](https://openrecipe-mlreoulk-8pt5qhh8h-vibe-stack-team.vercel.app) | ✅ |
| 2 | Book Reading Tracker | reading_list, book, book_reading_list | 86s | 6331 | [booktrail](https://booktrail-mlreskb3-2kv3lczx6-vibe-stack-team.vercel.app) | ✅ |
| 3 | Remote Dev Job Board | job, tech_tag, job_tech_tag | 77s | 6888 | [remotedevboard](https://remotedevboard-mlresg26-ovdlymk81-vibe-stack-team.vercel.app) | ✅ |
| 4 | Personal Finance Tracker | transaction, recurring_rule | 82s | 6666 | [ledgerleaf](https://ledgerleaf-mlresg3s-f45dxekuc-vibe-stack-team.vercel.app) | ✅ |
| 5 | Luxury Watch Catalog | watch, collection, collection_watch | 86s | 6473 | [meridian](https://meridian-mlresgs0-irzao4j2b-vibe-stack-team.vercel.app) | ✅ |
| 6 | Medical Clinic Scheduling | patients, doctors, appointments, profiles | 98s | 8629 | [clinicsched](https://clinicsched-mlrgh1jf-cpg4mpxwp-vibe-stack-team.vercel.app) | ✅ |
| 7 | SaaS CRM | company, contact, deal, activity | 91s | 9827 | [studiopulse](https://studiopulse-crm-mlrf5qm6-nq650z0e4-vibe-stack-team.vercel.app) | ✅ |
| 8 | Travel Blog CMS | author, destination, tag, article, article_tag | 93s | 9357 | [wanderlust](https://wanderlust-journal-mlrf5rsp-5gzr6u03v-vibe-stack-team.vercel.app) | ✅ |
| 9 | Agency Project Mgmt | client, project, deliverable, time_entry | 101s | 10275 | [studiosprint](https://studiosprint-mlrf5wto-3ejcb9aa5-vibe-stack-team.vercel.app) | ✅ |
| 10 | Restaurant Mgmt (La Piazza) | menu_categories, menu_items, restaurant_tables, reservations, orders, order_items | 104s | 9507 | [la-piazza-manager](https://la-piazza-manager-mlrh0t0g-p7fnvjqo9-vibe-stack-team.vercel.app) | ✅ |

**Average duration**: 92s | **Average tokens**: ~8,030 (~$0.02/app) | **Total pipeline cost**: ~$0.20

---

## Bugs Found & Fixed During 10-App Run

These bugs were discovered by running diverse prompts and fixed in-session.

### Bug 1: Unknown SQL Type Names (`SQLTypeSchema` validation failure)

**Error**: `Invalid option: expected one of "uuid"|"text"|"integer"... got "decimal"`

**Root Cause**: LLMs emit non-canonical PostgreSQL type names not in our enum:
- Numeric: `decimal`, `float`, `double`, `real`, `money`
- Integer: `int`, `smallint`, `serial`, `tinyint`, `mediumint`
- Text: `varchar`, `char`, `character varying(255)`
- Timestamp: `date`, `datetime`, `timestamp`, `time without time zone`
- Enum-named: `appointment_status`, `order_status`, `order_item_status` (custom names LLMs invent)

**Fix**: Multi-stage `z.preprocess()` in `SQLTypeSchema`:
1. Exact alias map (`decimal` → `numeric`, `varchar` → `text`, etc.)
2. Explicit `Set` lookups for integer/bigint variants (avoids false positives — "appointment" contains "int")
3. Substring patterns for compound types (`time without time zone` → `text`)
4. Final `text` fallback with `console.warn` (LLM-invented enum names → `text`)

**Key Lesson**: Use explicit Sets for integer detection, NOT `str.includes('int')` — "appointment" contains "int" and would false-positive to `integer`.

---

### Bug 2: Custom PostgreSQL Type Casts in Default Values

**Error**: `column "status" is of type integer but default expression is of type appointment_status`

**Root Cause**: LLMs generate defaults with custom type casts: `'scheduled'::appointment_status`. These fail because `appointment_status` is not a real PostgreSQL type in generated schemas (all enums are stored as `text`). Additionally, after Bug 1 fix mapped `appointment_status` → `text`, the column became `text` but the default still had `::appointment_status` cast → type mismatch.

**Fix**: Added preprocessing to `ColumnDefSchema.default` that:
1. Strips `::custom_type` casts where the type is NOT in the canonical set (`uuid|text|numeric|boolean|timestamptz|jsonb|integer|bigint`)
2. Drops bare identifier defaults (e.g., `appointment_status` alone is not a valid SQL expression)
- `'scheduled'::appointment_status` → `'scheduled'` ✓
- `appointment_status` (bare) → `undefined` (dropped) ✓

---

### Bug 3: Non-PK FK Column References

**Error**: `ERROR: 42830: there is no unique constraint matching given keys for referenced table "menu_categories"`

**Root Cause**: LLMs reference non-PK columns in FK definitions. The `menu_items` table had `FK → menu_categories(name)` instead of `FK → menu_categories(id)`. PostgreSQL requires the referenced column to have a UNIQUE or PRIMARY KEY constraint; `name` has neither.

**Fix**: Added normalization in `applyFKRenames()` to force FK column to `id`:
```typescript
if (column !== 'id' && !column.endsWith('_val')) {
  console.warn(`[FKReference] Non-PK FK column "${column}" → normalized to "id"`)
  column = 'id'
}
```
The `_val` suffix exclusion preserves reserved-word renames (e.g., `order_val`).

---

### Bug 4: Schema-Qualified FK References Misidentified as Table.Column

**Error**: `auth.users` FK string was parsed as `{ table: 'auth', column: 'users' }` instead of `{ table: 'auth.users', column: 'id' }`, generating wrong SQL: `REFERENCES "auth"("users")`.

**Root Cause**: Dot-notation parser `val.match(/^([^.(]+)\.([^.(]+)$/)` splits on the dot without knowing if it's a `schema.table` separator vs. `table.column` separator. Both look identical syntactically.

**Fix**: Added `KNOWN_SCHEMAS = new Set(['auth', 'public', 'extensions', 'storage', ...])`. When the first dot-segment is a known schema, treat the full string as the table name with default column `id`:
- `auth.users` → `{ table: 'auth.users', column: 'id' }` → `REFERENCES "auth"."users"("id")` ✓
- `users.id` → `{ table: 'users', column: 'id' }` (unchanged — 'users' is not a schema) ✓

The `qi()` function in `contract-to-sql.ts` already handled schema-qualified table names correctly (splits on `.` and quotes per part).

---

## Architecture Observations

### Token Usage by App Complexity
- Simple (2-3 tables, no auth): 6,300–7,400 tokens
- Medium (4-5 tables, with auth): 8,600–9,800 tokens
- Complex (6+ tables, with auth + relations): 9,500–10,600 tokens

### Pipeline Timing
- Analysis (LLM): 42–55s — the only LLM call
- Blueprint (deterministic): <1s
- Provisioning (parallel: sandbox + Supabase + GitHub): 1-2s
- Code Gen (deterministic assembler): 8-12s
- Validation (TypeCheck + Build in sandbox): 15-25s
- Code Review (deterministic checks): <1s
- GitHub Push: 4-8s
- Vercel Deploy: 12-20s

### Blueprint File Count Scaling
- 3 tables → ~52 files, 8 LLM slots
- 4 tables → ~55-57 files, 10-12 LLM slots
- 6 tables → ~60-62 files, 12-14 LLM slots

### Code Review Deterministic Issues
The review reports 8-13 "issues" even on passing apps — these are informational (missing JSDoc, console.log, etc.) not errors. The LLM gate only fires if there are 0 critical issues.

---

## Prior Run (2026-02-17)

**Date**: 2026-02-17
**Test Prompt**: Test 1 (Simple CRUD — Bookmarks Manager)
**Model**: gpt-5.2 via Helicone proxy
**Total Duration**: 127.6s | **Total Tokens**: 6763

| Phase | Status | Duration |
|-------|--------|----------|
| 1. Analysis | PASS | 35.0s |
| 2. Blueprint | PASS | 0.0s |
| 3. Provisioning | PASS | 1.7s |
| 4. Code Generation | PASS | 7.7s |
| 5. Validation | PASS | 19.1s |
| 7. Code Review | PASS | 0.0s |
| 10. GitHub Push | PASS | 63.9s |

Bugs: none
