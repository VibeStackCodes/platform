# VibeStack Platform — Grand Audit Report

**Date:** 2026-02-13
**Scope:** Full codebase audit (`/Users/ammishra/VibeStack/platform`)
**Agents:** 5 specialized Opus agents (Security, Libraries, Code Quality, Process, Test Tracking)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Audit](#security-audit)
3. [Code Quality Audit (SonarQube-Style)](#code-quality-audit)
4. [Library Replacement Opportunities](#library-replacement-opportunities)
5. [Process Improvements & Inefficiencies](#process-improvements--inefficiencies)
6. [Playwright Test Tracking Services](#playwright-test-tracking-services)
7. [Unified Action Plan](#unified-action-plan)

---

## Executive Summary

### Overall Health: NEEDS ATTENTION

| Audit Area | Findings | Critical/Blocker |
|------------|----------|-----------------|
| Security | 23 findings | 3 Critical, 5 High |
| Code Quality | 91 findings | 2 Blocker, 15 Critical |
| Library Replacements | 13 opportunities | 1 Security fix (immediate) |
| Process Improvements | 53 findings | 5 Critical |
| Test Tracking | 11 services evaluated | Top pick: Currents.dev |

### Top 5 Most Urgent Actions

1. **Rotate all exposed API keys** in `.env.local` (Anthropic, OpenAI, Stripe, Vercel, GitHub RSA key)
2. **Fix SQL injection** in `lib/supabase-mgmt.ts` DatabaseSchema path — table names interpolated without validation
3. **Fix auth bypass** — `NEXT_PUBLIC_MOCK_MODE=true` skips ALL authentication; rename to non-public prefix + gate behind `NODE_ENV`
4. **Replace `Math.random()`** with `crypto.randomBytes()` for database password generation (`lib/supabase-mgmt.ts:122-128`)
5. **Add CI/CD pipeline** — zero automated testing, linting, or type checking currently exists

---

## Security Audit

**Auditor:** Security Auditor Agent
**Framework:** OWASP Top 10, CWE, NIST

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High     | 5 |
| Medium   | 6 |
| Low      | 5 |
| Info     | 4 |

### Critical Findings

#### C1. Real API Keys, Secrets, and RSA Private Key in `.env.local`
**CWE:** CWE-798, CWE-312
**Location:** `.env.local`

The `.env.local` file contains **real, live credentials** including Anthropic API key, OpenAI API key, Supabase access token, Stripe secret key, Daytona API key, Vercel token, and a **full RSA Private Key** for the GitHub App. While gitignored, any process with filesystem access can read these.

**Remediation:**
1. Immediately rotate ALL exposed keys
2. Use a secrets manager (Vercel env vars, AWS Secrets Manager, 1Password CLI)
3. Add pre-commit hook blocking key patterns (`sk-ant-`, `sk-proj-`, `sk_test_`)

#### C2. Authentication Bypass via `MOCK_MODE`
**CWE:** CWE-287
**Location:** `middleware.ts:11`, all API routes

When `NEXT_PUBLIC_MOCK_MODE=true`, **all authentication is bypassed**. The variable is `NEXT_PUBLIC_*` prefixed (client-exposed). If set in production, the entire app becomes unauthenticated.

**Remediation:**
1. Remove `NEXT_PUBLIC_` prefix
2. Add build-time check preventing `MOCK_MODE=true` in production
3. Gate behind `NODE_ENV !== 'production'`

#### C3. SQL Injection in Supabase Management Module
**CWE:** CWE-89
**Location:** `lib/supabase-mgmt.ts:314-367`

The `setupSchema()` function for `DatabaseSchema` path constructs SQL via string interpolation without input validation. Table names, column definitions, policy SQL, and function SQL are all interpolated directly. LLM prompt injection could produce malicious schemas.

**Remediation:**
1. Validate all identifiers against `/^[a-z][a-z0-9_]*$/`
2. Use parameterized queries where possible
3. Sandbox `policy.definition` and `func.sql`

### High Findings

| ID | Finding | Location |
|----|---------|----------|
| H1 | No rate limiting on any API route | All `app/api/**` |
| H2 | No CORS configuration | `next.config.ts` |
| H3 | Stripe webhook secret empty | `app/api/stripe/webhook/route.ts:15` |
| H4 | Unsafe raw HTML rendering with partially controlled input | `components/ai-elements/schema-display.tsx:180` |
| H5 | Open redirect in auth callback (unencoded error.message) | `app/auth/callback/route.ts:22` |

### Medium Findings

| ID | Finding | Location |
|----|---------|----------|
| M1 | `SUPABASE_SERVICE_ROLE_KEY` used with cookie-based client | `lib/supabase-server.ts:66-89` |
| M2 | Insecure `Math.random()` for DB password generation | `lib/supabase-mgmt.ts:122-128` |
| M3 | Error messages leak internal details | Deploy/edit routes |
| M4 | Unvalidated `model` parameter in API routes | Chat/generate/edit routes |
| M5 | iframe sandbox allows `allow-same-origin` + `allow-scripts` (negates sandbox) | `components/ai-elements/web-preview.tsx:203` |
| M6 | Auth check after body parsing in generate route | `app/api/projects/generate/route.ts:30-55` |

### Low/Info Findings

- Verbose console logging in production (CWE-532)
- No Content Security Policy headers
- Cookie security settings not explicitly set
- Non-standard Supabase anon key prefix
- GitHub repos created as public by default
- No request body size limits
- No audit logging
- No input sanitization on `chatPlan.appName`
- Dependency versions not pinned

### Remediation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | C1: Rotate all exposed secrets | Immediate |
| 2 | C2: Fix mock mode auth bypass | 1 hour |
| 3 | C3: Fix SQL injection | 2-4 hours |
| 4 | H3: Set Stripe webhook secret | 10 minutes |
| 5 | H1: Add rate limiting | 4-8 hours |
| 6 | H2: Configure CORS | 1-2 hours |
| 7 | H4: Sanitize HTML rendering | 1 hour |
| 8 | H5: Fix open redirect | 30 minutes |
| 9 | M2: Use crypto-secure random | 15 minutes |
| 10 | M5: Fix iframe sandbox | 30 minutes |

---

## Code Quality Audit

**Auditor:** Code Quality Auditor Agent
**Scale:** Blocker / Critical / Major / Minor / Info

| Category | Blocker | Critical | Major | Minor | Info |
|----------|---------|----------|-------|-------|------|
| Bugs | 1 | 3 | 5 | 4 | 0 |
| Code Smells | 0 | 1 | 6 | 8 | 3 |
| Complexity | 0 | 0 | 2 | 3 | 0 |
| Duplication | 0 | 1 | 3 | 2 | 0 |
| Dead Code | 0 | 0 | 1 | 4 | 2 |
| Type Safety | 0 | 2 | 4 | 3 | 0 |
| Error Handling | 0 | 2 | 3 | 3 | 0 |
| Naming | 0 | 0 | 0 | 3 | 2 |
| Architecture | 0 | 1 | 2 | 1 | 0 |
| Security | 1 | 3 | 2 | 0 | 0 |
| Testing | 0 | 1 | 2 | 1 | 0 |
| Performance | 0 | 1 | 3 | 2 | 0 |
| **Total** | **2** | **15** | **33** | **34** | **7** |

**Quality Gate:** FAIL (2 Blockers, 15 Criticals)

### Blocker Issues

1. **BUG-001:** `as any` cast in `sandbox.ts:188-189` suppresses type checking on critical Daytona SDK call
2. **SEC-001:** SQL injection in `setupSchema` DatabaseSchema path (also flagged by security audit)

### Critical Issues (Top 10)

| ID | Finding | File |
|----|---------|------|
| BUG-002 | Race condition in `generateLayerWithStreaming` shared map | `lib/generator.ts:325-393` |
| BUG-003 | Cookie-setting errors silently swallowed | `lib/supabase-server.ts:51-53` |
| BUG-004 | `identifyAffectedFiles` trusts LLM output without validation | `app/api/projects/edit/route.ts:270` |
| SMELL-001 | `builder-chat.tsx` is 662-line monolith | `components/builder-chat.tsx` |
| DUP-001 | `pluralizeTable` implemented 3 times | 3 files |
| TYPE-001 | Non-null assertions on env vars (crash on missing) | 6+ files |
| TYPE-002 | `as any` casts in 4 locations | Multiple |
| ERR-001 | Generate route doesn't close SSE stream on all error paths | `generate/route.ts:183-197` |
| ERR-002 | `provisionProject` is fire-and-forget | `chat/route.ts:56` |
| ARCH-001 | No Zod validation on any API request body | All API routes |

### Key Duplication Issues

- **`pluralizeTable`** — identical logic in 3 files
- **Markdown fence stripping** — same regex in 7+ locations
- **`error instanceof Error ? error.message : String(error)`** — 20+ occurrences
- **Poll-until-ready pattern** — 3 separate implementations

### Performance Issues

- `downloadDirectory` creates unlimited concurrent HTTP requests (needs `p-limit`)
- `buildFilePrompt` includes full dependency contents in every prompt (expensive tokens)
- `glob.sync` blocking call during generation
- `setupSchema` runs migrations sequentially (20+ HTTP requests)

### Dead Code

- `eval-logger.ts` — never imported anywhere
- `requirement-check.ts` — `runPlaywrightCheck` never called from pipeline
- `MOCK_PLAN` alias likely unused

---

## Library Replacement Opportunities

**Auditor:** Dependency Manager Agent
**Files Analyzed:** All `app/`, `lib/`, `components/`

| Priority | Count | Estimated Effort |
|----------|-------|-----------------|
| High     | 4     | ~3-5 days       |
| Medium   | 5     | ~2-4 days       |
| Low      | 4     | ~1-2 days       |

### High Priority

| # | Custom Code | Replacement | File | Effort |
|---|-------------|-------------|------|--------|
| 1 | Custom retry with backoff (122 lines) | OpenAI SDK built-in retry or `p-retry` | `lib/retry.ts` | 2 hours |
| 2 | Naive pluralization (3 rules, duplicated 3x) | `pluralize` (440+ rules) | 3 files | 1 hour |
| 3 | Hand-rolled hex-to-HSL (only 6-digit hex) | `colord` (1.7KB, all formats) | `lib/template-registry.ts:83-108` | 30 min |
| 4 | Markdown fence stripping (duplicated 6+ times) | Shared utility | 5+ files | 1 hour |

### Medium Priority

| # | Custom Code | Replacement | File | Effort |
|---|-------------|-------------|------|--------|
| 5 | Manual SSE construction | AI SDK `createDataStream` | `generate/route.ts:59-207` | 4 hours |
| 6 | Raw Vercel API calls (~220 lines) | `@vercel/client` | `deploy/route.ts:160-378` | 4-6 hours |
| 7 | Raw Supabase Management API (~370 lines) | `supabase-management-js` | `lib/supabase-mgmt.ts` | 6-8 hours |
| 8 | `Math.random()` password generation | `nanoid` (already installed) or `crypto.randomBytes` | `lib/supabase-mgmt.ts:122-128` | 15 min |
| 9 | Fragile regex build error parser | TypeScript Compiler API | `lib/verifier.ts:155-217` | 4 hours |

### Low Priority

| # | Custom Code | Replacement | File | Effort |
|---|-------------|-------------|------|--------|
| 10 | Direct Anthropic SDK in edit route | AI SDK `generateText()` (used everywhere else) | `edit/route.ts` | 2 hours |
| 11 | Hand-rolled case conversion | `change-case` | `lib/template-registry.ts:10-17` | 30 min |
| 12 | Custom slug generation | `slugify` (handles Unicode) | `lib/slug.ts` | 30 min |
| 13 | Custom JSONL eval logger (255 lines) | `pino` with `pino-roll` | `lib/eval-logger.ts` | 3 hours |

### Not Recommended for Replacement

Core business logic files (`generator.ts`, `planner.ts`, `injector.ts`, `template-registry.ts`), thin SDK wrappers (`sandbox.ts`, `github.ts`), and already-correct library usage (Zod schemas, shadcn/ui, Supabase SSR, Stripe SDK, Octokit) should remain as-is.

---

## Process Improvements & Inefficiencies

**Auditor:** Architecture Reviewer Agent
**Total Findings:** 53

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High     | 15 |
| Medium   | 23 |
| Low      | 10 |

### Critical Gaps

1. **No CI/CD pipeline** — zero `.github/workflows/` configuration
2. **Near-zero unit test coverage** — only 1 test file for all of `lib/`
3. **Boilerplate README** — default `create-next-app` template
4. **No error tracking** — no Sentry, LogRocket, or Datadog
5. **No automated type checking** — no `tsc --noEmit` in scripts

### Build Pipeline Issues

- `next.config.ts` is completely empty (no image optimization, no CSP headers, no `output: 'standalone'`)
- No bundle analysis tooling
- `tsconfig.json` targets ES2017 (can target ES2022+)
- No Turbopack usage in dev

### Dependency Management Issues

- Both `@anthropic-ai/sdk` AND `@ai-sdk/anthropic` installed (redundant)
- `radix-ui` meta-package instead of individual `@radix-ui/*` packages
- `glob` in production deps (should be devDependencies)
- No `pnpm audit` in workflow

### Development Workflow Gaps

- No git hooks (no Husky, no lint-staged)
- No Prettier configured
- Minimal ESLint config (only `core-web-vitals` + `typescript`)
- No `.nvmrc` or `engines` field
- No `.editorconfig`

### Testing Gaps

- Zero unit tests for critical business logic (`generator.ts`, `verifier.ts`, `planner.ts`)
- No API route tests
- No component tests
- Playwright runs with `workers: 1` (slow)
- No coverage thresholds

### Architecture Concerns

- `builder-chat.tsx` is 662 lines (monolith component)
- `lib/` is a flat directory with 29 files (no domain organization)
- No error boundary components
- No health check endpoint
- No structured logging

### Recommended `lib/` Restructure

```
lib/
  ai/           → generator.ts, planner.ts, models.ts, system-prompt.ts, feature-classifier.ts, entity-extractor.ts
  sandbox/      → sandbox.ts, verifier.ts, requirement-check.ts
  templates/    → template-registry.ts, template-pipeline.ts, injector.ts, shadcn-installer.ts
  payment/      → (stripe-related)
  supabase/     → supabase-browser.ts, supabase-server.ts, supabase-mgmt.ts
  shared/       → utils.ts, types.ts, schemas.ts, retry.ts, slug.ts
```

### Priority Matrix

| Priority | Items | Effort |
|----------|-------|--------|
| **P0 (Do Now)** | CI/CD pipeline, Unit tests for critical paths, Error tracking | 2-3 days |
| **P1 (This Sprint)** | Git hooks, README rewrite, next.config.ts, Bundle analysis, Health endpoint | 1-2 days |
| **P2 (Next Sprint)** | lib/ restructure, builder-chat.tsx decomposition, Dynamic imports, API tests | 3-5 days |
| **P3 (Backlog)** | Storybook, Dockerfile, Architecture docs, Staging env | Ongoing |

---

## Playwright Test Tracking Services

**Auditor:** QA Expert Agent
**Current Setup:** Video `on`, screenshots `only-on-failure`, HTML reporter, no CI dashboard

### Service Comparison Matrix

| Service | Video | Screenshots | History/Trends | Free Tier | Setup |
|---------|-------|-------------|----------------|-----------|-------|
| **Currents.dev** | Per-test | On failure + on demand | Excellent + flake detection | 500 records/mo | 5 min |
| **Built-in + GH Actions** | Local MP4 | Local PNG | None | Free | 30 min |
| **ReportPortal** | Via attachments | Via attachments | ML-powered analytics | Free self-hosted | 2-4 hours |
| **Allure TestOps** | Step-level | Step-level | Good historical | From $39/mo | Medium |
| **BrowserStack** | Session recording | Auto + on-demand | Dashboard | From $12.50/mo | Medium |
| **LambdaTest** | Session recording | Auto + on-demand | Dashboard | 1 parallel free | Medium |
| **Sauce Labs** | Session recording | Auto | Trends | From $39/mo | Medium |
| **Checkly** | Monitoring-focused | Yes | Uptime/perf | 1,500 runs/mo | Low |
| **Microsoft Playwright Testing** | Cloud only | Cloud only | Basic | Trial | Low-Medium |
| **QA Wolf** | Full recording | Full | Managed | None ($8K/mo) | Zero |

### Top 3 Recommendations

#### #1: Currents.dev (Recommended)
Purpose-built Playwright dashboard. Drop-in npm reporter, instant dashboard, flake detection. Free tier (500 records/mo) covers current ~20 tests.
```bash
pnpm add -D @currents/playwright
# Add to playwright.config.ts reporter array + set CURRENTS_RECORD_KEY
```

#### #2: Playwright Built-in + GitHub Actions Artifacts (Cost-Conscious)
Zero cost. Upload `playwright-report/` as GH Actions artifacts. Powerful trace viewer for debugging. No trends or team dashboard.

#### #3: ReportPortal (Scale / Analytics)
ML-powered failure clustering. Free self-hosted. Best at scale (100+ tests). Operational overhead for self-hosting.

### Staged Approach (Recommended)
1. **Immediate**: GH Actions artifacts for reports + videos (free, 30 min)
2. **When team grows to 3+**: Add Currents.dev free tier
3. **When suite exceeds 100 tests**: Evaluate ReportPortal

---

## Unified Action Plan

### Week 1: Critical Security & Infrastructure

| # | Action | Source | Effort | Impact |
|---|--------|--------|--------|--------|
| 1 | Rotate all exposed API keys | Security C1 | Immediate | Critical |
| 2 | Fix `Math.random()` to `crypto.randomBytes()` for passwords | Security M2, Libraries #8 | 15 min | Critical |
| 3 | Fix SQL injection in `setupSchema` DatabaseSchema path | Security C3, Quality SEC-001 | 2-4 hours | Critical |
| 4 | Fix mock mode auth bypass (remove `NEXT_PUBLIC_` prefix) | Security C2 | 1 hour | Critical |
| 5 | Set Stripe webhook secret | Security H3 | 10 min | High |
| 6 | Add CI/CD pipeline (lint + typecheck + test + build) | Process 2.1 | 4 hours | Critical |
| 7 | URL-encode error in auth callback | Security H5 | 30 min | High |

### Week 2: Code Quality & Testing

| # | Action | Source | Effort | Impact |
|---|--------|--------|--------|--------|
| 8 | Add Zod validation for all API request bodies | Quality ARCH-001 | 4 hours | Critical |
| 9 | Replace env var `!` assertions with validated `env.ts` | Quality TYPE-001 | 2 hours | Critical |
| 10 | Add unit tests for `generator.ts`, `verifier.ts`, `planner.ts` | Process 6.1-6.2 | 2-3 days | Critical |
| 11 | Add rate limiting to API routes | Security H1 | 4-8 hours | High |
| 12 | Configure CORS in next.config.ts | Security H2 | 1-2 hours | High |
| 13 | Add Sentry error tracking | Process 11.1 | 2 hours | Critical |
| 14 | Fix iframe sandbox (remove `allow-same-origin`) | Security M5 | 30 min | Medium |

### Week 3: DRY & Architecture

| # | Action | Source | Effort | Impact |
|---|--------|--------|--------|--------|
| 15 | Extract shared utilities (pluralize, markdown fences, error message) | Quality DUP-001/002/003 | 2 hours | Major |
| 16 | Break up `builder-chat.tsx` (662 lines into components + hooks) | Quality SMELL-001 | 1-2 days | Major |
| 17 | Migrate edit route to AI SDK (remove direct Anthropic SDK) | Libraries #10, Quality ARCH-002 | 2 hours | Medium |
| 18 | Add git hooks (Husky + lint-staged + Prettier) | Process 5.1-5.2 | 1 hour | High |
| 19 | Rewrite README with project-specific content | Process 7.1 | 2 hours | Critical |
| 20 | Set up Playwright CI with GH Actions artifacts | Test Tracking | 30 min | Medium |

### Backlog

- Restructure `lib/` into domain modules
- Replace custom retry with OpenAI SDK built-in
- Replace raw Vercel API calls with `@vercel/client`
- Replace raw Supabase Management API with `supabase-management-js`
- Add structured logging (pino)
- Add health check endpoint
- Add bundle analysis
- Add dynamic imports for heavy components
- Remove/integrate dead code (`eval-logger.ts`, `requirement-check.ts`)
- Add Storybook for UI components
- Create Dockerfile with `output: 'standalone'`
- Add staging environment configuration

---

*Report generated by 5 specialized Claude Opus agents on 2026-02-13. All findings should be verified by the development team before taking action.*
