# VibeStack Architecture Design

> **Date**: 2026-02-11
> **Goal**: Ship by Feb 18. Beat Orchids on AppBench (>90%) and UIBench (>67.5% win rate).
> **Constraint**: ~3200 LOC custom code. Everything else is off-the-shelf.
> **Stack**: TypeScript monorepo, Next.js on Vercel, pnpm

---

## 1. Competitive Landscape

### AppBench (functional quality)
- 6 full-stack apps, 151 rubric items, binary pass/fail, best-of-3 one-shot
- Orchids #1 at 76.8%, Claude Code #2 at 67.5%
- Key failure modes: missing features, broken multi-role flows, outdated API usage, realtime failures

### UIBench (visual design quality)
- 30 prompts, 5 categories, expert pairwise comparison, TrueSkill ranking
- Orchids #1 at 67.5% win rate, Figma Make #2 at 57.1%
- Gap explained by orchestration, template libraries, asset pipelines — NOT model choice

### Orchids Architecture (from reverse engineering)
- Python backend → sequential LLM file generation → Daytona sandbox
- shadcn/ui + Next.js 16 + Supabase + Turbopack
- ~7 min for 12 files, no tests, `ignoreBuildErrors: true`
- Todo-driven UX, auto Supabase provisioning, build-error retry loop

---

## 2. How We Beat 76.8%

| Gap | Orchids Problem | VibeStack Solution |
|-----|----------------|-------------------|
| Missing features | Single LLM pass skips requirements | Requirement-aware planner with 1:1 checklist |
| Outdated APIs | LLM uses stale patterns | Skills with curated code + Context7 live docs |
| Multi-role flows | No validation of role logic | Automated smoke tests after generation |
| Design quality | No design system variation | Curated design tokens via tailwind-v4-shadcn skill |
| Speed | Sequential ~7 min | Parallel generation via dependency graph ~2.5 min |
| Error suppression | `ignoreBuildErrors: true` | Fix errors, don't suppress them |

---

## 3. Third-Party Services

| Service | Purpose | Why |
|---------|---------|-----|
| **Supabase** | Platform auth, generated app DB, realtime progress, management API | One service for 4 concerns |
| **Daytona** | Sandbox containers + code-server (VS Code + terminal) | Proven by Orchids, TS SDK verified |
| **Anthropic** | Claude Opus 4.6 for code generation | Best coding model |
| **Vercel** | Host entire VibeStack app (frontend + API routes) + deploy generated apps | Single platform, Pro plan, native Next.js |
| **Stripe** | VibeStack billing | Standard |
| **Context7** | Inject latest library docs at generation time | Prevents stale API patterns |

---

## 4. System Architecture

Single Next.js app on Vercel (Pro plan). No separate backend service.

```
VibeStack (Next.js monorepo on Vercel)
├── Pages (React, client)
│   Supabase Auth (platform login)
│   Vercel AI SDK useChat (streaming chat + file cards)
│   Supabase Realtime Broadcast (progress updates)
│   iframe → Daytona preview URL (live app on port 3000)
│   iframe → Daytona code-server (VS Code on port 13337)
│
├── API Routes (server-side, streaming)
│   POST /api/projects/generate
│     a. Planner: 1 Claude call → structured JSON plan
│     b. Supabase Mgmt API: create project + run migration + seed
│     c. Skill Injector: read SKILL.md files, concat into prompts
│     d. Parallel Generator: Promise.all() N Claude calls per layer
│     e. Build Verifier: read dev server logs, retry failed files
│     f. Requirement Verifier: automated smoke tests per requirement
│   POST /api/projects/edit (followup refinement)
│   POST /api/projects/deploy (push to Vercel)
│
│   @anthropic-ai/sdk · daytona (TS SDK) · Supabase Mgmt API
│
└── Daytona Sandbox (per project, external)
    Session "dev": bun install + bun run dev
    Generated Next.js app (shadcn/ui + Supabase)
    code-server on port 13337
    Preview URL on port 3000
```

Streaming keeps the Vercel function connection alive for the full generation (~5.5 min).
Progress updates also sent via Supabase Realtime as a fallback channel.

---

## 5. Generation Pipeline (5 Stages)

### Stage 1: Requirement Extraction
- 1 Claude call with structured JSON output
- Decomposes prompt into individual requirements (maps 1:1 to AppBench rubric items)
- Produces file dependency graph with layers (layer 0 = no deps, layer 1 = depends on layer 0, etc.)
- Identifies which skills/blueprints to inject
- Generates Supabase schema SQL + seed data SQL

### Stage 2: Supabase Provisioning (parallel with Stage 3)
- Supabase Management API: create project, run migration, seed data
- Returns URL + anon key for injection into generated code

### Stage 3: Parallel File Generation
- For each layer in dependency graph:
  - Fan out N concurrent Claude calls (Promise.all)
  - Each call gets: skill content + requirement checklist + already-generated dependency files
  - Stream each file to frontend via Vercel AI SDK
  - Upload completed files to Daytona via sandbox.fs.uploadFile()
  - Broadcast progress via Supabase Realtime

### Stage 4: Build Verification + Retry
- Read Turbopack dev server logs from Daytona session
- Parse BuildErrors, map to source files
- Re-generate ONLY broken files with error message in context
- Max 5 retries per file
- Wait for hot reload between retries

### Stage 5: Requirement Verification
- After clean build, run automated checks per requirement category:
  - Auth: Playwright clicks Sign Up, checks DB for new row
  - CRUD: API calls to verify data persistence
  - Realtime: Open 2 connections, verify broadcast
  - UI elements: Claude Vision checks screenshots
- Failed requirements trigger targeted code fixes
- This is the 76% → 90% jump

### Timing Estimate
| Stage | Orchids | VibeStack |
|-------|---------|-----------|
| Planning | ~15s | ~10s |
| Supabase setup | ~30s | ~30s (parallel) |
| File generation | ~7 min | ~2.5 min (parallel) |
| Build fix retries | ~2 min | ~1.5 min |
| Requirement verification | NONE | ~1.5 min |
| **Total** | **~10 min** | **~5.5 min** |

---

## 6. Blueprint Library (Installed Skills)

All blueprints are community-maintained skills. Zero hand-written markdown.

| Capability | Skill | Install |
|-----------|-------|---------|
| Auth | nextjs-supabase-auth | `sickn33/antigravity-awesome-skills` |
| RBAC | access-control-rbac | `aj-geddes/useful-ai-prompts` |
| Realtime | supabase-realtime | `nice-wolf-studio/claude-code-supabase-skills` |
| Forms | react-hook-form-zod | `jezweb/claude-skills` |
| Payments | stripe-integration | `wshobson/agents` |
| Email | send-email | `resend/resend-skills` (official) |
| AI Chat | vercel-ai-sdk | `fluid-tools/claude-skills` |
| Charts | recharts-patterns | `yonatangross/orchestkit` |
| File Upload | supabase-storage | `nice-wolf-studio/claude-code-supabase-skills` |
| Design System | tailwind-v4-shadcn | `secondsky/claude-skills` |

Injection mechanism: planner identifies needed capabilities → API route reads SKILL.md from installed skills → concatenates into per-file system prompts.

---

## 7. Frontend Design

### Layout: 40/60 split
- Left 40%: Chat panel (messages, todo progress, file cards, followup input, model selector)
- Right 60%: Tabbed panel (Preview | Code | Database | Terminal)

### Tab Implementation
| Tab | Source | Custom code |
|-----|--------|-------------|
| Preview | `iframe src={daytona.getPreviewLink(3000).url}` | 0 LOC |
| Code | `iframe src={daytona.getPreviewLink(13337).url}` (code-server) | 0 LOC |
| Database | `iframe src={supabaseStudioUrl}` or external link | 0 LOC |
| Terminal | Inside code-server's integrated terminal | 0 LOC |

### Chat Panel Components (5 total)
- `MessageList.tsx` — Vercel AI SDK useChat messages
- `TodoProgress.tsx` — Checklist from planner JSON, updated via Supabase Realtime
- `FileCard.tsx` — Shows filename + lines added
- `FollowupInput.tsx` — Text input for iterative refinement
- `ModelSelector.tsx` — Dropdown: Opus 4.6 / Sonnet 4.5

### What We Skip (v1)
- Click-to-edit visual overlay (v2)
- Mobile responsive layout (desktop-only, like all competitors)
- Team collaboration (v2)
- Version history UI (git exists in code-server)
- Custom file explorer (code-server has it)

---

## 8. Project Structure

Single Next.js monorepo at `/Users/ammishra/VibeStack/platform/`

```
platform/
├── package.json                        — pnpm, Next.js 16, all deps
├── next.config.ts
├── tsconfig.json
│
├── app/
│   ├── page.tsx                        — Landing/marketing (~200 LOC)
│   ├── layout.tsx                      — Root layout + Supabase auth provider
│   ├── dashboard/
│   │   └── page.tsx                    — Project list (~100 LOC)
│   ├── project/
│   │   └── [id]/
│   │       └── page.tsx                — Main builder layout (~200 LOC)
│   └── api/
│       └── projects/
│           ├── generate/route.ts       — Generation pipeline entry (~150 LOC)
│           ├── edit/route.ts           — Followup refinement (~80 LOC)
│           └── deploy/route.ts         — Vercel deploy (~50 LOC)
│
├── components/
│   ├── chat-panel.tsx                  — Chat container (~150 LOC)
│   ├── message-list.tsx                — Vercel AI SDK messages (~80 LOC)
│   ├── todo-progress.tsx               — Requirement checklist (~60 LOC)
│   ├── file-card.tsx                   — File generation card (~40 LOC)
│   ├── followup-input.tsx              — Chat input (~40 LOC)
│   ├── model-selector.tsx              — LLM picker (~30 LOC)
│   ├── preview-panel.tsx               — Tabbed right panel (~100 LOC)
│   └── deploy-button.tsx               — Deploy flow (~50 LOC)
│
├── lib/
│   ├── planner.ts                      — 1 Claude call → JSON plan (~200 LOC)
│   ├── injector.ts                     — Read SKILL.md, concat prompts (~80 LOC)
│   ├── generator.ts                    — Promise.all Claude calls per layer (~250 LOC)
│   ├── sandbox.ts                      — Daytona TS SDK wrapper (~200 LOC)
│   ├── verifier.ts                     — Build error parser + retry (~150 LOC)
│   ├── requirement-check.ts            — Automated smoke tests (~200 LOC)
│   ├── supabase-mgmt.ts               — Project provisioning via REST (~100 LOC)
│   ├── supabase.ts                     — Platform auth client (~50 LOC)
│   └── types.ts                        — Shared types (~80 LOC)
│
└── skills/                             — Installed SKILL.md files (read at runtime)
    ├── nextjs-supabase-auth/
    ├── stripe-integration/
    ├── supabase-realtime/
    └── ... (10 skills)

Total: ~2700 LOC (down from ~3200 due to shared types + no cross-service plumbing)
```

---

## 9. Generated App Stack (what VibeStack outputs)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 16 (Turbopack) | Same as Orchids, proven on benchmarks |
| UI | shadcn/ui (full Radix suite) | 50+ components, benchmark-proven |
| CSS | Tailwind CSS 4 + oklch tokens | Modern, matches Orchids |
| Icons | Lucide | Standard with shadcn |
| Animation | Framer Motion | Standard with shadcn |
| Charts | Recharts | Covered by skill |
| DB/Auth | Supabase | Auto-provisioned per project |
| Forms | React Hook Form + Zod 4 | Covered by skill |
| Font | Variable (not locked to Geist) | Design token variety for UIBench |
| Package manager | bun (inside Daytona sandbox) | Fast installs, matches Orchids |

---

## 10. One-Week Ship Plan

| Day | Focus | Deliverable |
|-----|-------|-------------|
| Day 1 (Wed) | Contracts + skeleton | Next.js app init, types.ts, Daytona SDK wrapper, Supabase provisioning |
| Day 2 (Thu) | Generation pipeline | Planner → skill injection → parallel file gen → Daytona upload |
| Day 3 (Fri) | Build verification | Error parser, retry loop, dev server log monitoring |
| Day 4 (Sat) | Frontend | Chat UI with Vercel AI SDK, preview iframe, tabs, todo progress |
| Day 5 (Sun) | Requirement verification | Smoke tests (auth, CRUD, realtime, UI), targeted fix loop |
| Day 6 (Mon) | Integration + polish | End-to-end flow, deploy button, billing (Stripe), landing page |
| Day 7 (Tue) | Test against benchmarks | Run AppBench tasks, measure scores, fix gaps |

---

## 11. Cost Estimates

### Per generation (user-facing)
- ~15 Claude Opus calls x ~4K output tokens = ~60K output tokens
- At $75/M output tokens = ~$4.50 per generation
- Daytona sandbox: ~$0.01/min x 10 min = ~$0.10
- Supabase: free tier per project
- **Total: ~$5 per generation**

### Platform costs (monthly)
- Vercel Pro: $20/mo
- Supabase Pro (platform DB): $25/mo
- Daytona: usage-based
- **Fixed: ~$45/mo + Daytona usage**

---

## 12. Key Architectural Decisions

1. **TypeScript monorepo** — One language, one deploy, shared types, Vercel AI SDK native streaming
2. **Vercel-only deployment** — No separate backend service. API routes handle everything.
3. **pnpm for platform, bun for generated apps** — pnpm for strictness in our code, bun for speed in sandboxes
4. **Skills over hand-written blueprints** — Community-maintained, auto-updated, zero maintenance
5. **Parallel generation via dependency graph** — 3x faster than Orchids' sequential approach
6. **Requirement verification loop** — The single biggest differentiator. Verify, then fix.
7. **Supabase for everything** — Auth, DB, realtime, management API. One vendor.
8. **Iframes over custom components** — Code editor, terminal, DB browser all come free
9. **No agent framework** — Raw Promise.all + Anthropic TS SDK. Simplest possible orchestration.
10. **Fix errors, don't suppress them** — Unlike Orchids' `ignoreBuildErrors: true`
