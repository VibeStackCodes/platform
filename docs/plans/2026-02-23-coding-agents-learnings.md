# Learnings: Production Coding Agents at Scale

*Synthesized from Stripe's Minions (Parts 1 & 2) and Emergence AI's GenAgent*

---

## 1. Blueprint/Hybrid Orchestration > Pure Agents or Pure Workflows

**Stripe's key insight**: Neither fixed workflows nor free-flowing agents alone work well. Minions use **Blueprints** — state machines that intermix deterministic code nodes (git ops, linting, pushing) with free-flowing agent nodes (implement task, fix CI failures).

**Why this matters**:
- Deterministic nodes **guarantee completion** of anticipated subtasks
- Saves tokens and CI costs at scale
- Puts LLMs into contained boxes — reduces blast radius of errors
- Context engineering becomes straightforward (constrain tools, simplify system prompt per node)

**GenAgent's parallel**: Their orchestrator went through 18 iterations before settling on **explicit workflow patterns** rather than letting an LLM implicitly discover orchestration. Fixed patterns per task complexity:
- Simple: `blueprint → coder → executor`
- Complex: `planner → critic → context → blueprint → coder → executor`
- Dependency error: re-run executor with auto-fix
- Logic error: `context → coder → executor`

**Takeaway**: Encode observed successful patterns as explicit state machines. Let agents be creative only within bounded nodes. Determinism everywhere you can; LLM only where you must.

---

## 2. Shift Feedback Left — Local Validation Before CI

**Stripe**: Pre-push hooks fix common lint issues in **under 1 second**. Background daemons precompute lint heuristics and cache results. The branch gets "a fair shot at passing CI the first time around."

- Heuristic-based test selection from 3M+ tests
- Many tests include **autofixes** automatically applied on failure
- Maximum **2 CI rounds** — diminishing returns beyond that

**GenAgent**: Multi-stage validation catches failures progressively:
1. `ast.parse()` syntax check (before any env setup)
2. Blueprint specs (typed function signatures — catches type errors early)
3. Isolated execution (venv, timeout, captured streams)
4. Auto-fix for missing packages in `requirements.txt`

**Takeaway**: Build a validation funnel — cheapest checks first, expensive CI last. Each layer should fix what it can automatically. Cap retry loops (Stripe: 2 CI rounds; GenAgent: 3 parallel attempts).

---

## 3. Parallel Generation > Sequential Retry

**GenAgent**: Testing 3 implementations in parallel costs 3× upfront but **reduces total cost** because:
- Lower latency (parallel vs. sequential failures)
- Higher success rates (pick best of 3)
- Output diversity (different solution approaches)
- Avoids LLMs repeating the same fundamental misunderstanding

**Stripe**: Engineers spin up multiple minions in parallel on separate devboxes. Each devbox is isolated — no git worktree overhead, no interference.

**Takeaway**: Pay upfront for diversity rather than paying sequentially for retries. Isolation (devboxes, venvs, worktrees) is the enabler.

---

## 4. Adversarial Review Catches What Single-Pass Misses

**GenAgent's Planner-Critic dynamic**: The Planner proposes, the Critic challenges. This debate surfaces issues **before** implementation:
- Missing error handling
- Incorrect return type assumptions
- Rate limiting gaps
- Unspecified constraints

The Critic reviews across categories: logical completeness, technical accuracy, clarity, robustness, assumptions.

**Takeaway**: A dedicated critique step before implementation is cheaper than debugging after. The critic doesn't need to be a separate model — it's a separate prompt/role with adversarial framing.

---

## 5. Context Engineering is the Real Bottleneck

### Scoped Rules (Stripe)
- Unconditional global rules become impractical at scale
- **Almost all agent rules are conditionally applied based on subdirectories**
- Adopted Cursor's rule format (directory/pattern scoping) so rules work across Minions, Cursor, and Claude Code simultaneously

### Tiered Context Retrieval (GenAgent)
| Tier | Source | Characteristics |
|------|--------|-----------------|
| 1 | Local KB | Highest accuracy, curated |
| 2 | Context7 | Structured API docs, fast |
| 3 | Web Search | Universal but variable accuracy |

- **5 highly relevant sections outperformed comprehensive documentation dumps**
- Semantic similarity scoring to select, not dump

### MCP as Context Layer (Stripe)
- Built **Toolshed** — centralized MCP server with ~500 tools
- Agents receive **curated tool subsets**, not everything
- Deterministically runs relevant MCP tools **before** agent starts to hydrate context
- One MCP server serves hundreds of different agents

**Takeaway**: Context must be surgical — scoped by directory, filtered by relevance, and pre-hydrated before the agent loop starts. More context ≠ better results.

---

## 6. Tiered Model Selection Per Role

**GenAgent**:
| Agent | Model Tier | Why |
|-------|-----------|-----|
| Planner | High | Quality cascades downstream |
| Critic | High | Nuanced feedback needed |
| Context Gatherer | Medium | Retrieval/filtering task |
| Blueprint Designer | High | Specs must be precise |
| Coder | Highest | Code quality is paramount |
| Executor | Medium | Error interpretation |

**Stripe**: Doesn't detail model tiers publicly but uses their "LLM infrastructure" with model routing.

**VibeStack parallel**: Already doing this — `PIPELINE_MODELS` routes `gpt-5.2` for orchestrator/analyst, `gpt-5.2-codex` for codegen, `gpt-5-mini` for repair/edit, `gpt-5-nano` for formatting.

**Takeaway**: Match model capability to cognitive complexity. Planning/design = expensive model. Formatting/parsing = cheap model. This can cut costs 50-80% with no quality loss.

---

## 7. Infrastructure for Humans = Infrastructure for Agents

**Stripe's mantra**: "What's good for humans is good for agents."

- Devboxes built for human engineers turned out perfect for agent isolation
- Pre-push hooks built for humans catch agent errors too
- Scoped rule files serve both Cursor (human) and Minions (agent)
- Same CI pipeline, same test suite, same linters

**Takeaway**: Don't build separate agent infrastructure. Invest in developer productivity — fast builds, good linting, isolated environments, comprehensive tests — and agents get it for free.

---

## 8. Observability is Non-Negotiable

**GenAgent**: "Instrument everything from day one. You can't improve what you can't measure."

Logged:
- Every agent call with inputs
- Decision points and selections
- Tool execution with timestamps
- Duration measurements
- Error contexts with full stack traces

This enabled: identifying slow retrieval, detecting failure patterns, measuring per-agent success rates, and driving architectural improvements.

**Stripe**: Web UI displays all minion actions for engineer review. Engineers can inspect decision-making and iterate.

**Takeaway**: Every agent call, tool invocation, and decision point must be logged with timing. Without this, you're flying blind on what to optimize.

---

## 9. Isolation Enables Fearless Execution

**Stripe**: Devboxes operate in QA environments — no real user data, no production access, no network egress. This means:
- No permission prompts needed
- Full filesystem access
- Agents can't cause production incidents
- Mistakes are confined and disposable

**GenAgent**: Separate `venv` per execution, timeout protection, captured streams.

**Takeaway**: The cheaper mistakes are, the more aggressive agents can be. Invest in isolation so agents can operate without safety theater (confirmation prompts, permission checks).

---

## 10. The One-Shot Ideal

**Stripe's definition of success**: "A typical minion run starts in a Slack message and ends in a pull request which passes CI and is ready for human review, with no interaction in between."

This requires:
1. Rich initial context (thread history, linked resources, rule files, MCP-hydrated context)
2. Deterministic scaffolding around creative work
3. Automated self-healing (autofixes, lint corrections)
4. Hard caps on iteration (2 CI rounds max)
5. Human review at the end, not during

**Takeaway**: Design for zero interaction. Front-load context, automate remediation, cap retries, and accept that some runs will fail — escalate those to humans rather than looping indefinitely.

---

## Appendix A: Tools, Libraries & Services Mentioned

### Stripe Minions

| Category | Tool/Service | Notes |
|----------|-------------|-------|
| Agent framework | **goose** (Block's open-source agent) | Forked internally late 2024 |
| Infrastructure | **AWS EC2** (devboxes) | Pre-warmed, pooled, 10s startup |
| Build system | **Bazel** | Pre-warmed caches in devboxes |
| Code search | **Sourcegraph** | Via MCP tool |
| Context protocol | **MCP** (Model Context Protocol) | Industry standard adopted |
| Internal MCP server | **Toolshed** | ~500 tools, centralized |
| Rule format | **Cursor rule files** | Shared across Minions, Cursor, Claude Code |
| Chat integration | **Slack** | Primary entry point |
| Human coding tools | **Cursor**, **Claude Code** | Used alongside Minions |
| Language/typing | **Ruby** + **Sorbet** | Specialized stack unfamiliar to LLMs |
| Models | Not disclosed | Internal "LLM infrastructure" |

### Emergence AI GenAgent

| Category | Tool/Service | Notes |
|----------|-------------|-------|
| Language | **Python** | Tool generation target |
| Syntax validation | `ast.parse()` (stdlib) | Stage 1 — before env setup |
| Isolation | Python **venv** | Fresh per execution |
| Doc retrieval (Tier 2) | **Context7** | Structured API docs |
| Web search (Tier 3) | Unspecified | Fallback with variable accuracy |
| Local KB (Tier 1) | Custom curated docs | Highest accuracy |
| Package management | Auto-generated `requirements.txt` | Auto-fix for missing packages |
| Models | Not named | Described as "high/medium/highest" tiers per agent role |

### VibeStack (for comparison)

| Category | Tool/Service | Notes |
|----------|-------------|-------|
| Agent framework | **Mastra** + **XState** | Mastra agents, XState state machine orchestration |
| Sandbox isolation | **Daytona SDK** | Docker-based, snapshot pre-warming |
| Sandbox base image | `oven/bun:1-debian` | Pure frontend — React 19, Vite 8, Tailwind v4, shadcn/ui, Recharts |
| Sandbox IDE | **OpenVSCode Server** (Gitpod) | In-browser VS Code on port 13337 |
| Sandbox linting | **OxLint** (global install) | 670+ rules, Rust-based, 50-100x faster than ESLint |
| Sandbox process mgmt | **tmux** | Dev server runs in tmux session with auto-restart |
| Sandbox tagging | **lovable-tagger** | JSX source tagging for visual editing |
| Build/runtime | **Bun** | Package manager + runtime |
| Pre-warming | Vite dep pre-bundle (`.vite/`) + `tsc --noEmit` (`tsbuildinfo`) | Saves ~5-10s on first use |
| UI kit | **shadcn/ui** (37 components in `snapshot/ui-kit/`) | Pre-installed, copied into generated apps |
| SQL validation | **PGlite** (platform server-side) | NOT in sandbox — runs on platform server before deploying |
| Context protocol | **MCP** (via Mastra) | Tool calling |
| Models | **OpenAI** (`gpt-5.2`, `gpt-5.2-codex`, `gpt-5-mini`, `gpt-5-nano`) | Tiered per pipeline role via `PIPELINE_MODELS` |
| Observability | **Helicone** (LLM proxy) + **Sentry** | Per-user tracking + error monitoring |
| Formatter | **Biome** | Formatter only (not linter) |
| Testing | **Vitest** (unit) + **Playwright** (E2E) | 3M+ tests at Stripe; VibeStack uses targeted suites |

---

## Relevance to VibeStack

| Stripe/GenAgent Pattern | VibeStack Current State | Opportunity |
|------------------------|------------------------|-------------|
| Blueprints (hybrid state machine) | XState machine (`machine.ts`) orchestrates deterministic + agent nodes | Already aligned — continue pattern |
| Shift feedback left | OxLint in sandbox, `tsc --noEmit` pre-warmed, PGlite SQL validation on platform server | Add Biome format check in sandbox before build validation |
| Parallel generation | Single-pass codegen per page | Try 2-3 parallel page generators, pick best |
| Adversarial review | No critic step | Add critic between analyst and blueprint |
| Scoped context | Theme-specific schemas + route generators | Formalize per-theme rule scoping (Cursor rule format) |
| Tiered models | `PIPELINE_MODELS`: gpt-5.2 (analyst), gpt-5.2-codex (codegen), gpt-5-mini (repair), gpt-5-nano (format) | Already aligned |
| Observability | Helicone per-user LLM proxy + Sentry (client/server/agent) | Add per-agent timing/success metrics |
| Isolation | Daytona sandboxes — pure frontend (`oven/bun:1-debian`), no DB in sandbox | Closer to Stripe's devbox model than GenAgent's venv |
| Devbox pre-warming | Snapshot pre-bundles deps + `.vite/` cache + `tsbuildinfo` (saves ~5-10s) | Aligned with Stripe's Bazel cache warming |
| In-sandbox IDE | OpenVSCode Server (Gitpod) on port 13337 + lovable-tagger for visual editing | Stripe doesn't expose IDE — VibeStack goes further with user-facing Code tab |
| MCP tools | Mastra tool calling (18 tools: sandbox, GitHub, Supabase, Vercel) | Stripe has ~500 via Toolshed — could centralize VibeStack tools into MCP server |
| One-shot design | SSE pipeline, no mid-flow interaction (except clarification) | Already aligned |
