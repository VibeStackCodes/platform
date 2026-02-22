# Dead Code Cleanup — Feb 22, 2026

## Dead Server Files

- [ ] `server/lib/agents/code-review.ts` — Code review agent removed from pipeline
- [ ] `server/lib/agents/assembler.ts` — Replaced by `page-assembler.ts` + sections engine
- [ ] `server/lib/skill-classifier.ts` — Never imported in production
- [ ] `server/lib/layer-diagnostics.ts` — Never imported anywhere
- [ ] `server/lib/local-supabase.ts` — Never imported anywhere
- [ ] `server/lib/lsp.ts` — Daytona LSP prototype, never wired in
- [ ] `server/lib/pipeline-dag.ts` — XState replaced it
- [ ] `server/lib/design-spec.ts` — Superseded by Creative Director; inline `HeroImage` into `unsplash.ts`
- [ ] `server/lib/shadcn-manifest.ts` — Never imported in production
- [ ] `server/lib/theme-layouts.ts` — `deriveArchetype()` never used in production
- [ ] `server/lib/supabase-pool.ts` — Entire file dead (pool not used)
- [ ] `server/lib/design-knowledge.ts` — PARTIAL: `getDesignKnowledge()` + `getCondensedDesignRules()` dead; keep `getStaticDesignRules()`

## Dead Client Files

- [ ] `src/components/ai-elements/validation-card.tsx` — Never imported anywhere
- [ ] `src/components/supabase-manager/database.tsx` — `DatabaseManager` never rendered
- [ ] `src/components/dynamic-form.tsx` — Only used by dead `database.tsx`
- [ ] `src/components/results-table.tsx` — Only used by dead `database.tsx`
- [ ] `src/hooks/use-run-query.ts` — Only used by dead files
- [ ] `src/hooks/use-tables.ts` — Only used by dead `database.tsx`
- [ ] `src/lib/platform-kit/management-api.ts` — Only used by dead `use-run-query.ts`
- [ ] `src/lib/platform-kit/pg-meta/index.ts` — Only used by dead `use-tables.ts`
- [ ] `src/lib/platform-kit/pg-meta/sql.ts` — Only used by dead `pg-meta/index.ts`
- [ ] `src/lib/platform-kit/pg-meta/types.ts` — No consumer anywhere
- [ ] `src/components/ui/carousel.tsx` — Never imported
- [ ] `src/components/ui/tabs.tsx` — Never imported
- [ ] `src/components/ui/progress.tsx` — Never imported
- [ ] `src/components/ui/avatar.tsx` — Never imported

## Dead Tests

- [ ] `tests/assembler.test.ts` — Tests dead `assembler.ts`
- [ ] `tests/assembler-detail.test.ts` — Tests dead `assembler.ts`
- [ ] `tests/assembler-procedures.test.ts` — Empty placeholder
- [ ] `tests/capability-manifest-persist.test.ts` — Tests fabricated data for deleted system
- [ ] `tests/code-review.test.ts` — Tests dead `code-review.ts`
- [ ] `tests/pipeline-dag.test.ts` — Tests dead `pipeline-dag.ts`
- [ ] `tests/skill-classifier.test.ts` — Tests dead `skill-classifier.ts`
- [ ] `tests/design-spec.test.ts` — Tests functions with no production callers
- [ ] `tests/shadcn-manifest.test.ts` — Tests dead `shadcn-manifest.ts`
- [ ] `tests/page-generator-callbacks.test.ts` — BROKEN: wrong import path
- [ ] `tests/structured-output-integration.test.ts` — BROKEN: imports nonexistent `CustomProcedureSchema`
- [ ] `tests/SECURITY-AUDIT-REPORT.md` — Doc in wrong directory
- [ ] `tests/SECURITY-TEST-SUMMARY.md` — Doc in wrong directory

## Dead Scripts

- [ ] `scripts/deploy-e2e-repos.ts` — Hardcoded past session repos
- [ ] `scripts/fix-skill-metadata.ts` — Populates empty catalog dirs, catalog system deleted
- [ ] `scripts/deploy-project.ts` — One-off manual tool, unused

## Dead Directories

- [ ] `server/lib/skills/catalog/` — All 13 subdirs empty, loader deleted
- [ ] `components/` (top-level) — Empty except `.DS_Store`
- [ ] `src/lib/platform-kit/pg-meta/` — All 3 files dead

## Dead Top-Level Files

- [ ] `package-lock.json` — Bun project, stale npm lockfile (20K lines)
- [ ] `public/next.svg` — Next.js template leftover
- [ ] `public/vercel.svg` — Next.js template leftover
- [ ] `public/file.svg` — Next.js template leftover
- [ ] `public/globe.svg` — Next.js template leftover
- [ ] `grand_report.md` — One-time audit output
- [ ] `grand_report_libraries.md` — One-time audit output
- [ ] `grand_report_process.md` — One-time audit output
- [ ] `grand_report_quality.md` — One-time audit output
- [ ] `grand_report_security.md` — One-time audit output
- [ ] `grand_report_testing.md` — One-time audit output
- [ ] `e2e/debug-signup.ts` — One-off debug script

## Unused Dependencies (remove from package.json)

### dependencies to remove
- `@ai-sdk/anthropic`
- `@ai-sdk/react`
- `@hono/node-server`
- `@mastra/loggers`
- `@rive-app/react-webgl2`
- `@upstash/ratelimit`
- `@xyflow/react`
- `@tanstack/react-table`
- `@tanstack/zod-adapter`
- `ansi-to-react`
- `diff`
- `glob`
- `jsonrepair`
- `media-chrome`
- `openai`
- `react-jsx-parser`
- `tokenlens`

### Move to devDependencies
- `@mendable/firecrawl-js` (only in `scripts/ingest-theme.ts`)
- `@anthropic-ai/sdk` (only in `scripts/ingest-theme.ts`)

### devDependencies to remove
- `@mastra/deployer` (redundant transitive)
- `@testing-library/dom` (redundant transitive)
- `vitest-axe` (replaced by raw `axe-core`)

## Post-Deletion Tasks

- [ ] Inline `HeroImage` type from `design-spec.ts` into `unsplash.ts`
- [ ] Remove dead exports from `design-knowledge.ts` (keep `getStaticDesignRules()`)
- [ ] Clean dead exports from `src/lib/types.ts` (~60% unused)
- [ ] Remove dead admin route for `supabase-pool` in `server/routes/admin.ts`
- [ ] Run `bunx tsc --noEmit && bunx tsc --noEmit -p tsconfig.server.json`
- [ ] Run `bun run lint`
- [ ] Run `bun run test`
- [ ] Run `bun install` after dep removal to update `bun.lock`
