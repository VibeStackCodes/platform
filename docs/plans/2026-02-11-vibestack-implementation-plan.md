# VibeStack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI app builder that beats Orchids on AppBench (>90%) and UIBench (>67.5% win rate) in 7 days.

**Architecture:** Single Next.js 16 TypeScript monorepo on Vercel. API routes handle the 5-stage generation pipeline (plan, provision, generate, verify build, verify requirements). Daytona sandboxes run generated apps. Supabase handles auth, DB, and realtime progress. Skills inject curated code patterns into Claude prompts.

**Tech Stack:** Next.js 16, TypeScript, pnpm, Vercel AI SDK v6, Anthropic TS SDK, Supabase (auth + DB + realtime + mgmt API), Daytona TS SDK, shadcn/ui, Tailwind CSS 4, Stripe

### Critical Version Notes (verified Feb 2026)

| Library | Version | Key API Notes |
|---------|---------|---------------|
| Next.js | 16.1.x | `cacheComponents` replaces `experimental.dynamicIO`; Turbopack is default bundler |
| Vercel AI SDK | 6.x | `useChat` uses `sendMessage()` + `DefaultChatTransport`; `UIMessage` replaces `Message`; `addToolOutput` replaces return-based tool results; `sendAutomaticallyWhen` replaces `maxSteps`; stream parts use start/delta/end lifecycle with IDs; `textDelta` → `delta` |
| Daytona TS SDK | latest | `sandbox.delete()` (not `daytona.remove()`); `sandbox.getSignedPreviewUrl(port, expiry)` returns `{url, token}`; session-based commands via `createSession()`/`executeSessionCommand()` |
| @supabase/ssr | latest | `createServerClient`/`createBrowserClient` pattern unchanged |
| shadcn/ui | 3.x | CLI is `shadcn` (not `shadcn-ui`) |
| Anthropic TS SDK | latest | `messages.stream()` unchanged; use `content_block_delta` / `text_delta` events |

---

## Phase 1: Foundation (Day 1)

### Task 1: Initialize Next.js Project

**Files:**
- Create: `platform/package.json`
- Create: `platform/next.config.ts`
- Create: `platform/tsconfig.json`
- Create: `platform/.env.local.example`

**Steps:**
1. Run `pnpm dlx create-next-app@latest platform` with TypeScript, Tailwind, ESLint, App Router, Turbopack
2. Install core deps: `@anthropic-ai/sdk @supabase/supabase-js @supabase/ssr ai @ai-sdk/anthropic stripe zod @daytonaio/sdk glob`
3. Run `pnpm dlx shadcn@latest init -d`
4. Add shadcn components: button, input, card, tabs, avatar, badge, scroll-area, separator, dropdown-menu, dialog, toast, progress, textarea, select
5. Create `.env.local.example` with all env vars (Supabase, Anthropic, Daytona, Stripe, Vercel)
6. Verify: `pnpm build` succeeds
7. Commit: "feat: scaffold Next.js 16 platform with shadcn/ui and core deps"

---

### Task 2: Shared Types (`lib/types.ts`)

**Files:**
- Create: `platform/lib/types.ts`

**Types to define:**
- `Requirement` — id, description, category (auth|crud|realtime|ui|integration|navigation), verifiable
- `FileSpec` — path, description, layer, dependsOn[], requirements[], skills[]
- `SupabaseSchema` — migrationSQL, seedSQL, rls, storageBuckets[], realtimeTables[]
- `Plan` — appName, appDescription, requirements[], files[], supabase, designTokens, packageDeps
- `FileStatus` / `StageStatus` — union type enums
- `FileProgress` — path, status, content?, error?, retryCount, linesOfCode
- `GenerationState` — projectId, stage, plan?, files[], URLs, buildErrors[], requirementResults[], timestamps
- `BuildError` — file, line?, message, raw
- `RequirementResult` — requirementId, passed, evidence, fixAttempted
- `SupabaseProject` — id, name, orgId, region, dbHost, dbPassword, anonKey, serviceRoleKey, url
- `Project` — platform DB row type (id, userId, name, prompt, status, plan, generationState, sandbox/preview/deploy URLs, model, timestamps)
- `GenerateRequest` / `EditRequest` / `DeployRequest` — API request types
- `StreamEvent` — discriminated union of all SSE event types (stage_update, plan_complete, file_start, file_chunk, file_complete, file_error, build_error, build_fix, requirement_result, preview_ready, code_server_ready, complete, error)

**Verify:** `npx tsc --noEmit lib/types.ts`
**Commit:** "feat: add shared types for generation pipeline"

---

### Task 3: Supabase Platform Clients

**Files:**
- Create: `platform/lib/supabase-server.ts` — uses `createServerClient` from `@supabase/ssr` with `cookies()` from `next/headers`
- Create: `platform/lib/supabase-browser.ts` — uses `createBrowserClient` from `@supabase/ssr`

**Commit:** "feat: add Supabase SSR clients (server + browser)"

---

### Task 4: Daytona Sandbox Wrapper (`lib/sandbox.ts`)

**Files:**
- Create: `platform/lib/sandbox.ts`

**Functions to implement:**
- `createSandbox()` — instantiate Daytona client, call `daytona.create()` with language: "typescript"
- `uploadFile(sandbox, path, content)` — `sandbox.fs.uploadFile()`
- `uploadFiles(sandbox, files[])` — batch upload
- `runCommand(sandbox, sessionId, command)` — use session-based API: `sandbox.process.createSession(id)` then `sandbox.process.executeSessionCommand(id, { command })`, return `{ exitCode, stdout, stderr, output }`
- `getPreviewUrl(sandbox, port)` — `sandbox.getSignedPreviewUrl(port, 3600)` returns `{ url, token }`
- `initGeneratedApp(sandbox, packageJson, supabaseUrl, supabaseAnonKey)` — upload package.json + .env.local, run `bun install`, start `bun run dev` in background via `runAsync: true`
- `getDevServerLogs(sandbox, sessionId, cmdId)` — `sandbox.process.getSessionCommandLogs(sessionId, cmdId)` returns `{ stdout, stderr, output }`
- `destroySandbox(sandbox)` — `sandbox.delete()`

**Commit:** "feat: add Daytona sandbox wrapper"

---

### Task 5: Supabase Management API (`lib/supabase-mgmt.ts`)

**Files:**
- Create: `platform/lib/supabase-mgmt.ts`

**Functions to implement:**
- `mgmtFetch(path, options)` — helper wrapping `fetch("https://api.supabase.com/v1" + path)` with Bearer token auth
- `createSupabaseProject(name, region)` — POST /projects, poll until ACTIVE_HEALTHY (up to 60 attempts x 2s), fetch API keys, return SupabaseProject
- `runMigration(projectId, sql)` — POST /projects/{id}/database/query
- `setupSchema(projectId, schema)` — run migrationSQL, RLS, seedSQL, enable realtime for specified tables
- `deleteSupabaseProject(projectId)` — DELETE /projects/{id}

**Commit:** "feat: add Supabase Management API client for project provisioning"

---

### Task 6: Install Skills

**Steps:**
1. Create `platform/skills/` directory
2. Install 10 skills via `npx skills add` — copy SKILL.md files into `platform/skills/<name>/SKILL.md`:
   - nextjs-supabase-auth (sickn33/antigravity-awesome-skills)
   - access-control-rbac (aj-geddes/useful-ai-prompts)
   - supabase-realtime (nice-wolf-studio/claude-code-supabase-skills)
   - react-hook-form-zod (jezweb/claude-skills)
   - stripe-integration (wshobson/agents)
   - send-email (resend/resend-skills)
   - vercel-ai-sdk (fluid-tools/claude-skills)
   - recharts-patterns (yonatangross/orchestkit)
   - supabase-storage (nice-wolf-studio/claude-code-supabase-skills)
   - tailwind-v4-shadcn (secondsky/claude-skills)
   - playwright-testing (alinaqi/claude-bootstrap) — for Task 11 requirement verification
   - daytona-integration (seanchiuai/multishot) — for Task 4 sandbox wrapper
3. Verify: `ls platform/skills/*/SKILL.md` shows 12 files
4. Commit: "feat: install 12 community skills for generation pipeline"

---

## Phase 2: Generation Pipeline (Day 2)

### Task 7: Skill Injector (`lib/injector.ts`)

**Files:**
- Create: `platform/lib/injector.ts`

**Functions:**
- `findSkillContent(skillName)` — check local `skills/` dir, then global `~/.claude/skills/`, use glob for fuzzy matching
- `injectSkills(skillNames[])` — concat all found SKILL.md contents with delimiters
- `buildFilePrompt(fileSpec, dependencyContents, designTokens, supabaseUrl, supabaseAnonKey)` — assemble full prompt with: file purpose, requirements, design tokens, Supabase config, already-generated dependency file contents, skill references, generation rules (no markdown fences, use shadcn/ui, use client only if needed, handle loading/error states)

**Commit:** "feat: add skill injector for prompt construction"

---

### Task 8: Planner (`lib/planner.ts`)

**Files:**
- Create: `platform/lib/planner.ts`

**Implementation:**
- `generatePlan(prompt, model)` — single Claude call with structured system prompt
- System prompt tells Claude to output JSON matching `Plan` type
- Rules in system prompt: 8-20 files, every requirement covered, layer 0 = no deps, available skills list, vary design tokens, include seed data
- Parse response, strip markdown fences, validate requirement coverage
- Return `Plan` object

**Commit:** "feat: add planner — 1 Claude call produces structured JSON plan"

---

### Task 9: Parallel File Generator (`lib/generator.ts`)

**Files:**
- Create: `platform/lib/generator.ts`

**Implementation:**
- `generateFiles(plan, sandbox, supabaseUrl, supabaseAnonKey, model, emit)` — returns `Map<string, string>` of path→content
- Group files by layer number
- For each layer (ascending): `Promise.all()` over files in that layer
- Each file: build prompt via `buildFilePrompt()`, stream from Claude via `anthropic.messages.stream()`, emit file_start/file_chunk/file_complete events, upload to sandbox
- Store generated content for next layer's dependency injection

**Commit:** "feat: add parallel file generator with dependency-graph layering"

---

### Task 10: Build Verifier (`lib/verifier.ts`)

**Files:**
- Create: `platform/lib/verifier.ts`

**Implementation:**
- `parseBuildErrors(output)` — regex patterns for Next.js/Turbopack errors, module-not-found, type errors
- `verifyAndFix(sandbox, generatedContents, model, emit)` — up to 5 retries:
  1. Wait 3s for hot reload
  2. Curl localhost:3000 + read dev server logs
  3. Parse build errors
  4. If clean, return
  5. Group errors by file, re-generate broken files with error context
  6. Upload fixes to sandbox

**Commit:** "feat: add build verifier with error parsing and auto-fix retry loop"

---

## Phase 3: Requirement Verification (Day 3)

### Task 11: Requirement Checker (`lib/requirement-check.ts`)

**Files:**
- Create: `platform/lib/requirement-check.ts`

**Approach:** Install Playwright in the Daytona sandbox. Generate a Playwright test script from the plan's requirements, run it, parse results, fix failures.

**Implementation:**
- `generatePlaywrightTest(plan)` — 1 Claude call: given the requirement list + app URL (localhost:3000), output a Playwright test file that checks each verifiable requirement (navigate pages, click buttons, fill forms, check text content, verify auth flows)
- `runPlaywrightCheck(sandbox, plan, generatedContents, model, emit)`:
  1. Install Playwright in sandbox: `bun add -D @playwright/test && bunx playwright install chromium`
  2. Upload generated test file to `e2e/requirements.spec.ts`
  3. Run: `bunx playwright test --reporter=json`
  4. Parse JSON reporter output → map each test to a requirement ID
  5. For failures: emit `requirement_result` with `passed: false` + error message as evidence
  6. Call `attemptRequirementFix()` for failed requirements
- `attemptRequirementFix(sandbox, plan, failedResults, generatedContents, model, emit)` — find responsible files per requirement, re-generate with Playwright failure output as context, upload fix, re-run test

**Commit:** "feat: add Playwright-based requirement verification with auto-fix"

---

## Phase 4: Frontend (Day 4)

### Task 12: Auth + Layout

**Files:**
- Modify: `platform/app/layout.tsx` — root layout with Inter font, dark mode, Toaster
- Create: `platform/app/auth/callback/route.ts` — exchange code for session, redirect to /dashboard
- Create: `platform/middleware.ts` — protect /dashboard and /project routes, redirect unauthenticated to /

**Commit:** "feat: add root layout, auth callback, and middleware"

---

### Task 13: UI Components (AI Elements + 2 custom wrappers)

**Approach:** Use Vercel AI Elements (`elements.ai-sdk.dev`) — a shadcn/ui-based component library built on AI SDK v6. Install pre-built components, write only 2 custom wrappers.

**Step 1: Install AI Elements components**

Run: `npx ai-elements@latest add conversation message prompt-input model-selector plan file-tree web-preview terminal test-results`

Components land in `@/components/ai-elements/`.

**Step 2: Write 2 custom wrappers**

| File | LOC | Description |
|------|-----|-------------|
| `components/builder-chat.tsx` | ~80 | Wires `Conversation` + `PromptInput` + `ModelSelector` + `Plan` to `useChat` with `DefaultChatTransport` → `/api/projects/generate` |
| `components/builder-preview.tsx` | ~60 | Tabs: `WebPreview` (Daytona port 3000), `Terminal` (code-server port 13337), Database link, deploy button |

**AI Elements replaces 6 hand-written components (~450 LOC saved):**

| AI Element | Replaces | Built-in features |
|---|---|---|
| `Conversation` + `Message` | chat-panel + message-list | Auto-scroll, streaming, markdown |
| `Plan` | todo-progress | Collapsible checklist, shimmer, streaming |
| `PromptInput` | followup-input | Textarea + submit |
| `ModelSelector` | model-selector | Dropdown |
| `FileTree` | file-card | File tree display |
| `WebPreview` | preview iframe | Live preview embed |
| `TestResults` | (bonus) | Playwright result display |

**Commit:** "feat: install AI Elements + add builder wrappers"

---

### Task 14: Project Builder Page

**Files:**
- Create: `platform/app/project/[id]/page.tsx` — 40/60 split: ChatPanel left, PreviewPanel right

**Commit:** "feat: add project builder page with 40/60 split layout"

---

### Task 15: Dashboard Page

**Files:**
- Create: `platform/app/dashboard/page.tsx` — project list with "New Project" button

**Commit:** "feat: add dashboard with project list"

---

## Phase 5: API Routes (Day 5)

### Task 16: Generation API Route

**Files:**
- Create: `platform/app/api/projects/generate/route.ts`

**Implementation:**
- `maxDuration = 300` (Vercel Pro 5-min limit)
- POST handler: parse GenerateRequest, create SSE ReadableStream
- Inside stream: run all 5 stages sequentially, emit StreamEvents
- Stage 1: `generatePlan()` → emit plan_complete
- Stage 2+3: `Promise.all([createSupabaseProject(), createSandbox()])` then `Promise.all([setupSchema(), initGeneratedApp()])`
- Stage 3: `generateFiles()` with emit callback
- Stage 4: `verifyAndFix()`
- Stage 5: `verifyRequirements()`
- Emit preview_ready, code_server_ready, complete
- Return SSE Response

**Commit:** "feat: add generation API route — full 5-stage pipeline with streaming"

---

### Task 17: Edit API Route

**Files:**
- Create: `platform/app/api/projects/edit/route.ts`

Re-generates only affected files based on user instruction. Loads existing sandbox, identifies affected files, re-runs generator for those files only.

**Commit:** "feat: add edit API route for iterative refinement"

---

### Task 18: Deploy API Route

**Files:**
- Create: `platform/app/api/projects/deploy/route.ts`

Downloads files from Daytona sandbox, pushes to Vercel via API.

**Commit:** "feat: add deploy API route"

---

## Phase 6: Polish (Day 6)

### Task 19: Landing Page

**Files:**
- Modify: `platform/app/page.tsx` — hero, features, CTA, Supabase Auth login/signup

**Commit:** "feat: add landing page with auth"

---

### Task 20: Stripe Billing

**Files:**
- Create: `platform/app/api/stripe/checkout/route.ts`
- Create: `platform/app/api/stripe/webhook/route.ts`

Standard Stripe Checkout + webhook updating user plan in Supabase.

**Commit:** "feat: add Stripe checkout + webhook"

---

### Task 21: Platform Supabase Schema

**Files:**
- Create: `platform/supabase/migrations/001_init.sql`

Tables: `projects` with RLS (users own their projects), enable realtime.

**Commit:** "feat: add platform Supabase schema with RLS"

---

## Phase 7: Benchmarks (Day 7)

### Task 22: E2E Test

**Files:**
- Create: `platform/tests/e2e/generate.test.ts`

Run generation against Financial Dashboard prompt, verify plan + files + build + 80% requirements pass.

**Commit:** "test: add e2e generation pipeline test"

---

### Task 23: AppBench Evaluation

**Files:**
- Create: `platform/scripts/run-appbench.ts`

Run all 6 AppBench tasks, collect scores.

**Commit:** "feat: add AppBench evaluation script"

---

## Parallel Dispatch Strategy

| Phase | Tasks | Parallelizable |
|-------|-------|---------------|
| 1 | Task 1 first, then Tasks 2-6 in parallel | Yes (after Task 1) |
| 2 | Tasks 7-10 (sequential: injector → planner → generator → verifier) | No |
| 3 | Task 11 | Solo |
| 4 | Tasks 12-15 (12+13 parallel, then 14+15 after 13) | Partial |
| 5 | Task 16 first, then 17+18 parallel | Partial |
| 6 | Tasks 19-21 all parallel | Yes |
| 7 | Tasks 22-23 sequential | No |

## Agent Routing

| Domain | Agent Type |
|--------|-----------|
| Types, pipeline libs (Tasks 2,4,5,7,8,9,10,11) | `voltagent-lang:typescript-pro` |
| React components (Tasks 12,13,14,15,19) | `voltagent-lang:react-specialist` |
| API routes (Tasks 16,17,18) | `voltagent-lang:nextjs-developer` |
| SQL schema (Task 21) | `voltagent-lang:sql-pro` |
| Tests (Tasks 22,23) | `voltagent-qa-sec:test-automator` |
| Review after each phase | `feature-dev:code-reviewer` |
