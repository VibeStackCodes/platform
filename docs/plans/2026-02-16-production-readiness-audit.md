# Production Readiness Audit — VibeStack Agentic Workflow

**Date**: 2026-02-16
**Branch**: `feature/hybrid-workflow`
**Audited by**: 4 parallel code-explorer agents (architecture, resilience, security, code quality)

---

## Overall Verdict: NOT production-ready — strong architecture, weak operational hardening

The core design is sound (contract-first, minimal LLM surface, XState orchestration), but there are critical gaps in security, error handling, and observability that must be addressed before production traffic.

---

## Architecture Summary

The pipeline is a **hybrid XState-orchestrated, deterministic codegen system** with only ~5 LLM calls per generation:

```
User Prompt → [LLM] Analyst → SchemaContract → [DETERMINISTIC] Blueprint
→ [INFRA] Sandbox+Supabase+GitHub → [LLM] Feature Specs → [DETERMINISTIC] Assembler
→ [VALIDATION] tsc+lint+build → [LLM] Repair (up to 2x) → [DEPLOY] GitHub+Vercel
```

**Key strength**: LLMs only produce structured data (feature specs), never code. All JSX/TypeScript is assembled deterministically. This is the right design.

**Surprise finding**: Despite docs referencing "9 agents + supervisor network", the code only uses **4 agents** (analyst, frontend, backend, repair) with no supervisor. Documentation needs updating.

### Agents (4 total, NOT 9)

1. **Analyst** — requirements extraction → `SchemaContract` (tool-as-output: `submitRequirements` or `askClarifyingQuestions`)
2. **Frontend** — feature spec generation → `PageFeatureSpec` (structured output via Zod)
3. **Backend** — procedure spec generation → `CustomProcedureSpec` (structured output via Zod)
4. **Repair** — error fixes → `writeFile` tool calls (freeform, max 2 retries)

### XState Machine States (8)

```
idle → analyzing → [awaitingClarification] → blueprinting → provisioning
→ generating → validating → [repairing] → deploying → complete/failed
```

### LLM vs Deterministic Split

| LLM Calls (~5 per generation) | Deterministic Code (~10 operations) |
|-------------------------------|-------------------------------------|
| Analyst: requirements extraction | Blueprint: contractToBlueprint() |
| Analyst: clarification (optional) | SQL: contractToSQL() |
| Frontend: feature specs (per entity) | Drizzle: contractToDrizzle() |
| Backend: procedure specs (per entity) | tRPC: contractToTrpc() |
| Repair: error fixes (up to 2x) | Pages: assembleListPage(), assembleDetailPage() |
| | Validation: tsc + lint + build |
| | Deployment: GitHub push + Vercel deploy |

---

## Critical Issues by Priority

### P0 — Fix Before Any Production Traffic

| # | Category | Issue | File(s) | Impact |
|---|----------|-------|---------|--------|
| 1 | **Security** | `.env.local` with all production keys potentially in git history | `.env.local` | Full compromise of all services |
| 2 | **Security** | SQL injection in generated SQL — table/enum names not validated against `^[a-z_][a-z0-9_]*$` | `contract-to-sql.ts`, `supabase-mgmt.ts` | DB compromise in generated apps |
| 3 | **Security** | Path traversal in `writeFileTool` — `../../../etc/passwd` bypasses `/workspace/` prefix | `tools.ts:45-46` | Sandbox escape |
| 4 | **Security** | No rate limiting on `/api/agent` | `agent.ts` | DoS, credit exhaustion |
| 5 | **Security** | No request size limits | `agent.ts` | Memory exhaustion |
| 6 | **Security** | Mock mode auth bypass not gated to `NODE_ENV !== 'production'` | `middleware/auth.ts:7-19` | Full auth bypass if env var leaks |
| 7 | **Resilience** | Sandbox resource leaks on error — no cleanup in XState `onError` handlers | `machine.ts:211-214, 246-248` | Daytona quota exhaustion |

### P1 — Fix Within First Sprint

| # | Category | Issue | File(s) | Impact |
|---|----------|-------|---------|--------|
| 8 | **Resilience** | 21 silent tool failures — errors returned to LLM but never shown to user | `tools.ts` (all 18 tools) | User sees partial output, no explanation |
| 9 | **Resilience** | No exponential backoff on Supabase polling (60 fixed 5s requests) | `supabase-mgmt.ts:173-225` | API abuse, transient failure crashes pipeline |
| 10 | **Resilience** | Contract validation warnings logged but ignored — broken pages proceed | `orchestrator.ts:213-217` | Missing columns/forms in generated UI |
| 11 | **Security** | GitHub installation tokens exposed in tool responses (visible in LLM logs) | `tools.ts:721-737` | Token leakage via Helicone |
| 12 | **Security** | Credit check is pre-exec but deduction is post-exec — race condition on concurrent requests | `agent.ts:191-247` | Negative credit balances |
| 13 | **Quality** | `as any` type assertions in orchestrator (4 instances) | `orchestrator.ts:213,224,225,253` | Runtime type errors from malformed LLM output |
| 14 | **Quality** | No structured logging — only 4 `console.*` statements in prod code | `orchestrator.ts`, `tools.ts` | Blind in production |
| 15 | **Quality** | Naming helpers (`snakeToPascal`, `pluralize`) duplicated across 3 files | `assembler.ts`, `contract-to-trpc.ts`, `contract-to-pages.ts` | Drift, maintenance burden |

### P2 — Fix Before Scaling

| # | Category | Issue | File(s) | Impact |
|---|----------|-------|---------|--------|
| 16 | **Resilience** | PGlite singleton never cleaned up, rejected promise cached forever | `tools.ts:329-396` | All SQL validations fail after one OOM |
| 17 | **Resilience** | Repair loop doesn't diff errors between retries — could retry identical failure | `machine.ts:308-333` | Wasted credits, user waits 5min for inevitable fail |
| 18 | **Security** | Sandbox command injection — `runCommandTool` allows arbitrary shell commands | `tools.ts:217-242` | Data exfiltration via prompt injection |
| 19 | **Security** | No CSP headers, no audit logging | `server/index.ts` | XSS in admin panel, no forensics |
| 20 | **Quality** | XState machine tests cover only 2 transitions (78 lines) — no retry loop, error, or clarification tests | `tests/machine.test.ts` | Regressions in core workflow |
| 21 | **Quality** | 240-line `assembleListPage()` function, untestable as unit | `assembler.ts:168-408` | Hard to modify safely |
| 22 | **Architecture** | Provisioning is sequential (sandbox → Supabase → GitHub) — could be parallel | `orchestrator.ts` | ~30s wasted per generation |
| 23 | **Architecture** | No Sentry breadcrumbs for pipeline stages, no OpenTelemetry for non-LLM ops | All agent files | Can't trace failures across stages |

---

## Security Audit Details

### Critical Vulnerabilities (7)

1. **C1: Hardcoded Production Credentials** — All API keys in `.env.local` (Supabase, OpenAI, Stripe, GitHub, Vercel, Daytona, Helicone). Must rotate immediately and scrub git history.

2. **C2: SQL Injection in RLS/Storage Setup** — `supabase-mgmt.ts` interpolates bucket names into SQL without parameterization: `INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', true)`.

3. **C3: Unrestricted Prompt Injection** — User messages pass directly to LLM without length limits, sanitization, or injection detection.

4. **C4: Missing Authorization in `/api/agent/resume`** — `activeRuns` is in-memory Map, not shared across serverless instances. Cross-instance session hijacking possible.

5. **C5: Credential Exposure in SSE** — `supabaseAnonKey` stored in XState context could leak via future SSE changes.

6. **C6: Path Traversal** — `writeFileTool` concatenates paths: `/workspace/${inputData.path}` — no normalization, `..` not stripped.

7. **C7: GitHub Token Leakage** — `getGitHubTokenTool` returns plaintext installation tokens to LLM context.

### High-Risk Patterns (12)

- H1: No credit reservation (race condition on concurrent requests)
- H2: Supabase proxy auth only checks paths containing `/projects/`
- H3: Stripe webhook signature validation fragile if secret is empty
- H4: LLM-generated SQL not validated (enum values, default expressions)
- H5: Sandbox command injection via `runCommandTool`
- H6: PGlite SQL injection via regex-bypass (`CREATE/*comment*/EXTENSION`)
- H7: Mock mode auth bypass not production-gated
- H8: Unlimited file upload size in `writeFileTool`
- H9: Enum values in SchemaContract not sanitized
- H10: No XSS prevention guidance in frontend agent instructions
- H11: `runId` is plain UUID without HMAC
- H12: User UUIDs sent to Helicone in plaintext

### Missing Security Controls (9)

- M1: No rate limiting
- M2: No request size limits
- M3: No CSP headers
- M4: No audit logging
- M5: No secrets rotation policy
- M6: No input validation on project creation
- M7: No sandbox network isolation
- M8: No dependency scanning in generated apps
- M9: No monitoring for anomalous token usage

---

## Error Handling & Resilience Audit Details

### Critical Failures (3)

1. **Sandbox resource leaks** — Failed generations leave sandboxes running. XState `onError` handlers transition to `failed` but never destroy sandbox, Supabase project, or GitHub repo.

2. **Unhandled orchestrator errors** — `runCodeGeneration()` uses `Promise.allSettled()` (good) but silently `continue`s on rejected results (bad). User never knows pages are missing.

3. **XState error states lack cleanup** — All `onError` transitions do `assign({ error: String(event.error) })` with no cleanup actions.

### Silent Failures (21+)

- All 18 tools return `{ success: false, error }` to LLM — user never sees tool errors
- Contract validation warnings logged to console, assembly proceeds with invalid specs
- SSE `emit()` errors caught and ignored in `sse.ts`

### Unbounded Operations (3)

- Supabase project polling: 60 × 5s fixed interval, no backoff
- Validation gate: no short-circuit (runs all 5 checks even if tsc fails)
- Dev server polling: 30 × 1s, all errors swallowed

### Resource Leaks (3)

- Sandboxes on error paths (no cleanup)
- PGlite singleton (rejected promise cached forever)
- Octokit singleton (auth failure cached, all subsequent calls fail)

### Race Conditions (3)

- Concurrent file writes in `assembledFiles` array (sequential loop today, but fragile)
- Sandbox deduplication (network error returns `null`, caller creates duplicate)
- Actor stored in `activeRuns` before stream creation (zombie actors if stream fails)

---

## Code Quality & Test Coverage Audit Details

### Type Safety Issues

- 4 × `as any` in `orchestrator.ts` — feature specs and procedure specs cast from `unknown` to bypass validation
- Generated assembler code emits `as any` for mutation payloads
- Root cause: AI SDK v5 returns `unknown` from `result.object`

### Test Coverage

**Strong (80%+ lines)**:
- `contract-to-sql.test.ts` (168 lines) — topological sort, RLS, enums, FK indexes, triggers
- `contract-to-trpc.test.ts` (522 lines) — CRUD procedures, auth, pagination, sorting
- `contract-to-pages.test.ts` (162 lines) — naming helpers, pluralization, routes
- `assembler.test.ts` — deterministic JSX, badge rendering, form fields, pagination, sorting
- `feature-schema.test.ts` — Zod parsing, field validation, filter validation
- `validation-gate.test.ts` — manifest, scaffold detection
- `repair-agent.test.ts` — prompt building, error categorization

**Critical gaps (0% coverage)**:
- XState retry loop (validation → repair → validation)
- Orchestrator integration (`runCodeGeneration` with `Promise.allSettled`)
- PGlite SQL validation tool (complex regex stripping)
- All 18 Mastra tools (sandbox ops, Vercel deploy, GitHub)
- Error scenarios (LLM timeout, Daytona failure, credit exhaustion)
- Adversarial inputs (SQL injection via table names)

### Code Smells

- 240-line `assembleListPage()` function — should decompose into template builders
- Naming helpers duplicated in 3 files — extract to shared module
- Magic numbers: retry limit (2), maxSteps (15/25/30), timeouts (30s/60s/120s) — undocumented rationale
- 4 `console.*` statements instead of structured logging

### Dead Code

- `schemas.ts`: 12+ unused schemas (`ExecutionPlanSchema`, `QAResultArtifactSchema`, etc.) from earlier architecture
- `workflows.ts`: referenced in docs but file doesn't exist
- Registry comment references `qaWorkflow` and `integrationStep` — neither exists

---

## Architecture Observations

### Strengths

1. **Contract-first** — single `SchemaContract` → all downstream artifacts. No drift.
2. **Minimal LLM surface** — ~5 calls per generation, all structured output. No LLM-generated code.
3. **XState orchestration** — clear state transitions, built-in retry, token accumulation
4. **FK-aware UI** — assembler detects FKs and generates dropdown selects automatically
5. **Topological sorting** — SQL and Drizzle generators sort by FK deps, preventing constraint errors
6. **Cursor-based pagination** — tRPC routers use UUID cursors, not offset
7. **RLS optimization** — `auth.uid()` wrapped in subselect for per-statement caching
8. **Warmup snapshot** — Daytona sandboxes from pre-cached image saves ~5-10s

### Weaknesses

1. **Placeholder handlers** — `runProvisioning()` and `runDeployment()` return empty strings (stubs)
2. **No rollback** — failed generations leave provisioned resources dangling
3. **No seed data** — generated apps have empty tables
4. **Limited pluralization** — basic rules, fails on irregular plurals
5. **Design tokens not applied** — `DesignPreferences.primaryColor` collected but never injected into CSS
6. **No incremental validation** — runs all 5 checks even if first fails
7. **No parallel provisioning** — sandbox, Supabase, GitHub created sequentially

---

## Recommended Remediation Roadmap

### Week 1: Security Hardening

- [ ] Rotate all credentials, scrub git history with BFG Repo-Cleaner
- [ ] Add SQL identifier validation (`^[a-z_][a-z0-9_]*$`) to `contractToSQL()`, `supabase-mgmt.ts`, `SchemaContract`
- [ ] Add path normalization + traversal check to `writeFileTool` and `readFileTool`
- [ ] Add rate limiting (5 req/min/user) + request size limits (10MB) to Hono
- [ ] Gate mock mode: `NODE_ENV === 'test' && VITE_MOCK_MODE === 'true'`
- [ ] Add `bodyLimit()` middleware

### Week 2: Resilience

- [ ] Add resource cleanup to all XState `onError` handlers (destroy sandbox, mark Supabase project)
- [ ] Surface tool errors to SSE stream via event emission (not just LLM context)
- [ ] Add exponential backoff (1s → 2s → 4s → 8s) to Supabase polling
- [ ] Implement credit reservation with pessimistic DB locking
- [ ] Fix PGlite singleton to reset on error
- [ ] Diff validation errors between repair retries, abort if identical

### Week 3: Observability + Tests

- [ ] Replace `console.*` with structured logging (pino) and correlation IDs
- [ ] Add Sentry breadcrumbs for each pipeline stage
- [ ] Write XState machine integration tests: retry loop, clarification flow, all error paths
- [ ] Add adversarial input tests: SQL injection via table names, special characters, reserved words
- [ ] Test PGlite SQL validation with edge-case migrations

### Week 4: Cleanup + Performance

- [ ] Remove dead schemas from `schemas.ts`
- [ ] Update CLAUDE.md and MEMORY.md to reflect 4-agent architecture
- [ ] Extract shared `naming-utils.ts` from assembler/generators
- [ ] Parallelize provisioning (sandbox + Supabase + GitHub concurrent via `Promise.allSettled`)
- [ ] Add short-circuit to validation gate (skip build if tsc fails)
- [ ] Implement cost estimation before generation starts

---

## Files Audited

### Core Workflow (read in order)
1. `server/routes/agent.ts` — SSE endpoint, credit enforcement, actor lifecycle
2. `server/lib/agents/machine.ts` — XState state machine (8 states, transitions, context)
3. `server/lib/agents/orchestrator.ts` — Handler functions per state
4. `server/lib/schema-contract.ts` — SchemaContract type, validation
5. `server/lib/app-blueprint.ts` — Contract → AppBlueprint, layer-based file tree
6. `server/lib/agents/assembler.ts` — Deterministic React component assembly
7. `server/lib/agents/feature-schema.ts` — PageFeatureSchema, CustomProcedureSchema

### Generators (deterministic)
8. `server/lib/contract-to-sql.ts` — SQL migration (topological sort, RLS, triggers)
9. `server/lib/contract-to-trpc.ts` — tRPC routers (CRUD + SLOT markers)
10. `server/lib/contract-to-pages.ts` — Page placeholders
11. `server/lib/contract-to-drizzle.ts` — Drizzle ORM schema (inferred)

### Infrastructure
12. `server/lib/agents/tools.ts` — 18 Mastra tools
13. `server/lib/agents/registry.ts` — Agent definitions (4 agents)
14. `server/lib/agents/provider.ts` — Helicone proxy setup
15. `server/lib/sandbox.ts` — Daytona SDK wrapper
16. `server/lib/supabase-mgmt.ts` — Supabase Management API
17. `server/lib/github.ts` — GitHub App integration

### Validation & Repair
18. `server/lib/agents/validation.ts` — Validation gate (5 checks)
19. `server/lib/agents/repair.ts` — Repair prompt builder

### Utilities
20. `server/lib/sse.ts` — SSE stream helper
21. `server/lib/credits.ts` — Credit checking/deduction
22. `server/middleware/auth.ts` — Auth middleware

### Tests
23. `tests/machine.test.ts` — XState tests (78 lines, 2 transitions only)
24. `tests/assembler*.test.ts` — Assembler tests (comprehensive)
25. `tests/contract-to-*.test.ts` — Generator tests (comprehensive)
26. `tests/feature-schema.test.ts` — Schema validation tests
27. `tests/orchestrator-*.test.ts` — Orchestrator tests (stubs only)

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total files audited | 27 |
| Critical security vulnerabilities | 7 |
| High-risk security patterns | 12 |
| Missing security controls | 9 |
| Critical resilience failures | 3 |
| Silent failure points | 21+ |
| Unbounded operations | 3 |
| Resource leak scenarios | 3 |
| Race conditions | 3 |
| `as any` type assertions | 4+ |
| Dead/unused schema definitions | 12 |
| Test files with 0% coverage on critical paths | 5+ |
| Estimated remediation effort | 4 weeks (1 senior engineer) |
