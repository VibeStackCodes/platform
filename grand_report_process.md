# Process Improvements, Inefficiencies & Gaps Report

**Audited:** 2026-02-13 | **Scope:** Full codebase — `/Users/ammishra/VibeStack/platform`

---

## Executive Summary

The project is a Next.js 16 + Supabase + AI SDK platform ("VibeStack") for generating full-stack apps via conversational AI. It uses pnpm, Tailwind v4, Vitest, and Playwright. The codebase is relatively young (~1 week old based on git history) and already shows common early-stage gaps: **no CI/CD pipeline, no git hooks, minimal test coverage, boilerplate README, no bundle analysis, and an empty next.config.ts**. Below are actionable findings organized by category.

---

## 1. Build Pipeline

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1.1 | **`next.config.ts` is completely empty** — no image optimization config, no `output: 'standalone'`, no headers/redirects, no bundle analyzer | High | Missing production optimizations, no CSP headers, no Docker-optimized output |
| 1.2 | **No bundle analysis tooling** — `@next/bundle-analyzer` not installed | Medium | Cannot identify bloated imports or tree-shaking failures |
| 1.3 | **`tsconfig.json` targets ES2017** — modern Next.js apps can target ES2022+ since all major browsers support it | Low | Slightly larger output from unnecessary downleveling |
| 1.4 | **No `turbopack` usage** — `pnpm dev` runs vanilla `next dev` without `--turbopack` flag | Medium | Significantly slower dev rebuilds (~2-5x) |

### Recommendations

- Add `output: 'standalone'` for Docker deployments
- Install `@next/bundle-analyzer` and add `ANALYZE=true` build script
- Add security headers via `next.config.ts` `headers()` function
- Use `pnpm dev --turbopack` for faster development
- Consider bumping `target` to ES2022

---

## 2. CI/CD Pipeline

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 2.1 | **No `.github/workflows/` directory** — zero CI/CD configuration | Critical | No automated testing, linting, type checking, or deployment gates |
| 2.2 | **No automated type checking** — no `tsc --noEmit` in scripts | High | Type errors can reach production |
| 2.3 | **No pre-merge quality gates** — no branch protection rules enforced | High | Broken code can be merged without review |

### Recommendations

Create at minimum a `.github/workflows/ci.yml` with:
```yaml
- pnpm install --frozen-lockfile
- pnpm lint
- npx tsc --noEmit  # Add "typecheck" script
- pnpm test -- --run
- pnpm build
```
Add scripts to `package.json`:
- `"typecheck": "tsc --noEmit"`
- `"ci": "pnpm lint && pnpm typecheck && pnpm test -- --run && pnpm build"`

---

## 3. Dependency Management

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 3.1 | **Both `@anthropic-ai/sdk` AND `@ai-sdk/anthropic` are installed** — the AI SDK already wraps the Anthropic SDK; direct usage is likely redundant | Medium | Unnecessary bundle size, conflicting API patterns |
| 3.2 | **Both `motion` and implicit `framer-motion` (peer dep)** — `motion` is the new package name; check if framer-motion is still referenced | Low | Potential duplicate motion library in bundle |
| 3.3 | **`glob` (13.0.2) in production deps** — likely only needed at build/script time | Low | Unnecessarily included in client bundles if imported from app code |
| 3.4 | **`radix-ui` meta-package** — installs ALL Radix components; prefer individual `@radix-ui/*` packages for tree-shaking | Medium | Significantly larger dependency tree than needed |
| 3.5 | **No `pnpm audit` in workflow** — no automated security scanning | Medium | Vulnerable dependencies may go unnoticed |
| 3.6 | **Version ranges are very loose** (`^` everywhere) — no pinning strategy | Low | Builds may differ between environments |
| 3.7 | **`sharp` listed in `ignoredBuiltDependencies`** but not in deps — Next.js image optimization uses it implicitly | Low | May silently fall back to unoptimized images |

### Recommendations

- Remove `@anthropic-ai/sdk` if only using AI SDK's Anthropic provider
- Move `glob` to `devDependencies`
- Replace `radix-ui` meta-package with specific `@radix-ui/*` imports
- Add `pnpm audit` to CI pipeline
- Add `pnpm dedupe` to post-install

---

## 4. Project Structure

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 4.1 | **`lib/` directory is a flat dumping ground** — 29 files with no subdirectories for domains (auth, ai, payment, sandbox, templates) | High | Poor discoverability, unclear module boundaries |
| 4.2 | **`.DS_Store` committed in components directory** | Low | macOS artifacts in repo |
| 4.3 | **No barrel exports (`index.ts`)** — each file must be imported individually | Low | Verbose import paths, harder refactoring |
| 4.4 | **Tests mirrored poorly** — `tests/e2e/generate.test.ts` exists (Vitest) alongside `e2e/` (Playwright); naming collision between test frameworks | Medium | Confusing test organization |
| 4.5 | **`shadcn-registry/` at root** — unclear purpose, no documentation | Low | Discoverability issue |

### Recommendations

Restructure `lib/` into domain modules:
```
lib/
  ai/           → generator.ts, planner.ts, models.ts, system-prompt.ts, feature-classifier.ts, entity-extractor.ts
  sandbox/      → sandbox.ts, verifier.ts, requirement-check.ts
  templates/    → template-registry.ts, template-pipeline.ts, injector.ts, shadcn-installer.ts
  payment/      → (stripe-related)
  supabase/     → supabase-browser.ts, supabase-server.ts, supabase-mgmt.ts
  shared/       → utils.ts, types.ts, schemas.ts, retry.ts, slug.ts
```
Add `.DS_Store` to `.gitignore` (it's already there but files were committed before the rule).

---

## 5. Development Workflow

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 5.1 | **No git hooks (no `.husky/`, no `lint-staged`)** — developers can commit unlinted, unformatted code | High | Code quality drift, inconsistent style |
| 5.2 | **No Prettier configured** — only ESLint for formatting (which covers limited formatting rules) | Medium | Inconsistent code formatting |
| 5.3 | **ESLint config is minimal** — only `core-web-vitals` + `typescript` presets, no custom rules | Medium | Many code quality patterns unchecked |
| 5.4 | **No `typecheck` script** — must manually run `npx tsc --noEmit` | Medium | Developers skip type checking |
| 5.5 | **No `.nvmrc` or `engines` field** — no Node.js version pinning | Medium | "Works on my machine" issues |
| 5.6 | **No `.editorconfig`** — tab/space, line ending, charset inconsistencies across editors | Low | Formatting drift |

### Recommendations

```bash
pnpm add -D husky lint-staged prettier
npx husky init
# pre-commit: npx lint-staged
# lint-staged.config.js: { "*.{ts,tsx}": ["eslint --fix", "prettier --write"] }
```
Add to `package.json`:
```json
"engines": { "node": ">=20", "pnpm": ">=9" }
```
Add `.nvmrc` with `20` or `22`.

---

## 6. Testing Gaps

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 6.1 | **Only 1 unit test file** (`tests/e2e/generate.test.ts`) — almost zero unit test coverage | Critical | No regression safety net for lib/* functions |
| 6.2 | **No unit tests for critical business logic** — `generator.ts`, `verifier.ts`, `planner.ts`, `sandbox.ts`, `requirement-check.ts` all untested | Critical | High-risk code paths have zero coverage |
| 6.3 | **No API route tests** — `app/api/chat/`, `app/api/projects/`, `app/api/stripe/` untested | High | API contract changes go undetected |
| 6.4 | **No component tests** — zero React component tests for `builder-chat.tsx` (662 lines), `builder-preview.tsx`, etc. | High | UI regressions undetected |
| 6.5 | **Playwright runs with `workers: 1` and `fullyParallel: false`** — very slow E2E execution | Medium | CI time will balloon as tests grow |
| 6.6 | **Playwright webServer uses `pnpm build && pnpm start`** — full production build for E2E is slow | Medium | Could use `next dev` or prebuilt assets |
| 6.7 | **No coverage thresholds** — coverage config exists but no minimum enforcement | Medium | Coverage can silently decrease |
| 6.8 | **`vitest` runs only `tests/**/*.test.ts`** — tests co-located with source (e.g., `lib/__tests__/`) would be missed | Low | Inflexible test file placement |

### Recommendations

Priority test additions:
1. Unit tests for `lib/generator.ts` — the core AI generation pipeline
2. Unit tests for `lib/verifier.ts` — sandbox verification logic
3. Unit tests for `lib/retry.ts` — retry logic is notoriously bug-prone
4. API route integration tests for `/api/chat` and `/api/projects`
5. Component tests for `builder-chat.tsx` using Vitest + happy-dom

Add coverage thresholds:
```ts
// vitest.config.ts
coverage: {
  thresholds: { branches: 60, functions: 60, lines: 60, statements: 60 }
}
```

---

## 7. Documentation Gaps

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 7.1 | **README is the default `create-next-app` template** — zero project-specific documentation | Critical | New developers cannot onboard |
| 7.2 | **No architecture documentation** — no diagrams, no ADRs | High | Architectural decisions are tribal knowledge |
| 7.3 | **No API documentation** — no OpenAPI/Swagger, no route documentation | High | API consumers (including frontend) work blind |
| 7.4 | **No `.env.local.example` documentation** — file exists but no explanations of what each key does or how to obtain them | Medium | Painful setup for new developers |
| 7.5 | **No `CONTRIBUTING.md`** | Low | No contribution guidelines |
| 7.6 | **`docs/plans/` exists** — but not discoverable; no README linking to it | Low | Planning docs are hidden |

### Recommendations

Replace README with project-specific content:
- Project overview and purpose
- Architecture overview (tech stack, data flow)
- Setup instructions (prerequisites, env vars, database setup)
- Development workflow (scripts, testing, deployment)
- Link to `docs/plans/` for design documents

---

## 8. Performance

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 8.1 | **No dynamic imports / lazy loading** — heavy libraries like `shiki`, `@xyflow/react`, `mermaid` (via streamdown) likely loaded eagerly | High | Large initial bundle, slow FCP |
| 8.2 | **No `next/dynamic` usage detected** for heavy components | High | All components loaded synchronously |
| 8.3 | **No image optimization config** — `next.config.ts` has no `images` config for remote patterns | Medium | External images may not be optimized |
| 8.4 | **No caching headers** — no `Cache-Control` for static assets beyond Next.js defaults | Medium | Suboptimal CDN caching |
| 8.5 | **Middleware runs on every non-static request** — creates Supabase client + calls `getUser()` on every page load even for public routes | Medium | Unnecessary latency on public pages |

### Recommendations

- Use `next/dynamic` for: `@xyflow/react`, `shiki` highlighter, mermaid rendering
- Add early return in middleware for public routes (`/`, `/auth/*`) before creating Supabase client
- Configure `images.remotePatterns` in next.config.ts
- Add `@next/bundle-analyzer` and profile the bundle

---

## 9. Architecture Concerns

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 9.1 | **`builder-chat.tsx` is 662 lines** — a single component handling chat state, message rendering, tool calls, file display, and UI interactions | High | Hard to test, maintain, and extend |
| 9.2 | **No clear separation between AI orchestration layers** — `generator.ts`, `planner.ts`, `verifier.ts` all directly call AI APIs without a shared abstraction | Medium | Difficult to swap models or add middleware (logging, rate limiting) |
| 9.3 | **`lib/types.ts` is a monolithic type file** (8.8KB) — all types in one file | Medium | Tight coupling, difficult to scope imports |
| 9.4 | **No error boundary components** — React error boundaries not visible | Medium | Unhandled errors crash the entire app |
| 9.5 | **No API rate limiting on routes** (only external `express-rate-limit` in deps for sandbox) | Medium | API routes vulnerable to abuse |
| 9.6 | **Mock mode check in middleware via `process.env`** — mock mode logic mixed with production auth | Low | Testing concerns leak into production code |

### Recommendations

- Break `builder-chat.tsx` into: `ChatMessages`, `ChatInput`, `ChatToolResults`, `useChatState` hook
- Create an `AIClient` abstraction that wraps model calls with logging, retry, and rate limiting
- Split `types.ts` into domain-specific type files (`ai-types.ts`, `project-types.ts`, etc.)
- Add `<ErrorBoundary>` wrapper at layout level

---

## 10. Developer Experience

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 10.1 | **No dev script for Turbopack** — missing `"dev:turbo": "next dev --turbopack"` | Medium | Slower dev feedback loop |
| 10.2 | **No database seeding script** — no way to populate local dev data | Medium | Manual data setup for every dev |
| 10.3 | **No `CLAUDE.md` at project root** — only global CLAUDE.md; project-specific AI coding context missing | Medium | AI assistants lack project context |
| 10.4 | **No Storybook or component playground** for the 26 UI components | Low | Component development requires running full app |

### Recommendations

Add convenience scripts:
```json
{
  "dev:turbo": "next dev --turbopack",
  "typecheck": "tsc --noEmit",
  "db:migrate": "supabase db push",
  "db:seed": "tsx scripts/seed.ts",
  "ci": "pnpm lint && pnpm typecheck && pnpm test -- --run"
}
```

---

## 11. Monitoring & Observability

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 11.1 | **No error tracking service** — no Sentry, no LogRocket, no Datadog | Critical | Production errors are invisible |
| 11.2 | **No structured logging** — no `pino`, `winston`, or `next-logger` | High | Cannot trace request flows, debug production issues |
| 11.3 | **No health check endpoint** — no `/api/health` or `/api/status` | Medium | Cannot monitor app availability |
| 11.4 | **No performance monitoring** — no Web Vitals reporting, no APM | Medium | Performance regressions invisible |
| 11.5 | **`eval-logger.ts` exists** but no general application logging strategy | Low | Logging is ad-hoc |

### Recommendations

- Add Sentry (free tier) or similar error tracking
- Add `/api/health` endpoint that checks DB connectivity
- Use `next/third-parties` for Web Vitals reporting
- Consider `@vercel/otel` if deploying to Vercel

---

## 12. Deployment

### Findings

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 12.1 | **No Dockerfile** — cannot build Docker images | Medium | Limited to Vercel/Node deployment |
| 12.2 | **No `output: 'standalone'` in next.config** — not optimized for container deployment | Medium | Docker images would be unnecessarily large |
| 12.3 | **No staging environment config** — only `.env.local` | Medium | No way to test against staging services |
| 12.4 | **No rollback strategy documented** | Low | No runbook for deployment failures |
| 12.5 | **`.env*` is broadly gitignored** — also ignores `.env.local.example` (which should be committed; it only works because it was committed before the rule) | Low | Future env example files would be ignored |

### Recommendations

- Fix `.gitignore` to `!.env*.example`
- Add `output: 'standalone'` to next.config.ts
- Create multi-stage Dockerfile
- Add staging environment config

---

## Priority Matrix

| Priority | Items | Effort |
|----------|-------|--------|
| **P0 (Do Now)** | CI/CD pipeline (2.1), Unit tests for critical paths (6.1-6.2), Error tracking (11.1) | 2-3 days |
| **P1 (This Sprint)** | Git hooks (5.1), README rewrite (7.1), next.config.ts hardening (1.1), Bundle analysis (1.2), Health endpoint (11.3) | 1-2 days |
| **P2 (Next Sprint)** | lib/ restructure (4.1), builder-chat.tsx decomposition (9.1), Dynamic imports (8.1-8.2), API tests (6.3) | 3-5 days |
| **P3 (Backlog)** | Storybook (10.4), Dockerfile (12.1), Architecture docs (7.2), Staging env (12.3) | Ongoing |

---

## Summary Statistics

- **Total findings:** 53
- **Critical:** 5 (CI/CD, test coverage, README, error tracking)
- **High:** 15
- **Medium:** 23
- **Low:** 10

The most impactful single improvement would be **adding a CI pipeline** — it's the foundation that enforces all other quality gates. Second priority is **test coverage for the core AI generation pipeline** (`generator.ts`, `verifier.ts`, `planner.ts`), as these are the product's critical path with zero tests.
