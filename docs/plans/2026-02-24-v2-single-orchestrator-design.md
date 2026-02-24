# V2: Single Orchestrator Architecture

*Replaces the XState multi-stage pipeline with a single LLM orchestrator that has tools.*

---

## Problem

The current pipeline (analyst → creative director → page generator → deterministic assembly → validation → repair) is:

1. **Slow** — 6 sequential stages, each with its own LLM call
2. **Over-engineered** — design tokens, CreativeSpec schema, closed import vocabulary, forbidden lists
3. **Rigid** — every request goes through every stage, even "build a snake game"
4. **Not how Lovable works** — Lovable goes from prompt → app in ~15s with one pass

## Design Principles

1. **Trust the LLM** — no closed vocabularies, no forbidden lists, no forced libraries
2. **Design quality lives in the system prompt** — not in structured schemas
3. **Speed over safety** — loose TypeScript, no unused-var errors, maximize build success rate
4. **Scaffold-based generation** — LLM edits a pre-baked template, not generate from scratch
5. **Web search for design context** — anchor to real products, not LLM defaults
6. **Auto-scope simple requests** — skip clarification, make opinionated decisions
7. **Minimal output** — brief plan for first prompt, one-line summary for edits

## Architecture

### Single Orchestrator Agent

One Mastra agent with tools. No XState state machine. The LLM decides what tools to call based on the prompt.

```
User: "Build a todo app"
  → Orchestrator thinks: "I'll build a clean todo app inspired by Things 3 — warm stone palette, coral accent"
  → Calls: provisionSandbox() → editFile(index.css, colors) → createFile(pages/Index.tsx) → createFile(components/TodoItem.tsx) → createFile(hooks/useTodos.ts) → runBuild()
  → Returns: "Your to-do app is live! Features: add/complete/delete tasks, filter, localStorage persistence."

User: "Make the header blue"
  → Orchestrator reads the relevant file, makes the change
  → Returns: "Updated header color to blue."
```

### Tool Belt

| Tool | Purpose | When called |
|------|---------|-------------|
| `searchWeb` | Design inspiration, library docs, reference UIs | Novel/niche requests |
| `provisionSandbox` | Create Daytona sandbox from snapshot | Always (first prompt) |
| `createFile` | Write a brand-new file to sandbox | New files not in scaffold |
| `editFile` | Edit existing file via Relace Instant Apply | Modifying scaffold or existing files |
| `readFile` | Read a file from sandbox | Before editing, understanding context |
| `installPackage` | `bun add <package>` in sandbox | When LLM wants a library not in snapshot |
| `runCommand` | Run any shell command in sandbox | Build, lint, custom commands |
| `runBuild` | `vite build` in sandbox | After writing files, to validate |
| `listFiles` | List files in sandbox directory | Orientation |

### Relace Instant Apply

For edits to existing files, the orchestrator outputs a lazy edit snippet (abbreviated code with `// ... keep existing code` markers). Relace Apply merges it into the full file at 10,000 tok/s.

```
POST https://instantapply.endpoint.relace.run/v1/code/apply
{
  "model": "relace-apply-3",
  "initial_code": "<current file content>",
  "edit_snippet": "<LLM's abbreviated edit>",
  "stream": true
}
→ { "mergedCode": "<complete updated file>" }
```

**Cost**: ~$0.85/1M input, ~$1.25/1M output (trivial vs frontier model costs).

**Impact**: ~40% fewer frontier tokens (LLM only generates novel code), near-instant edits.

### Sandbox Snapshot

Matches Lovable's scaffold structure, upgraded to our modern stack:

**Stack**: Vite 8, React 19, Tailwind v4.1, react-router-dom, shadcn/ui

**Pre-installed libraries** (LLM can use without installing):
- All 40+ shadcn/ui components in `src/components/ui/`
- framer-motion, recharts, react-hook-form, zod, date-fns
- lucide-react, class-variance-authority, clsx, tailwind-merge
- @tanstack/react-query, sonner, vaul, cmdk, embla-carousel-react
- lovable-tagger (visual editing)

**Pre-baked files** (LLM edits these, doesn't generate them):

```
index.html                   # HTML shell with TODO placeholders for title/meta
package.json                 # All deps pre-resolved
vite.config.ts               # Vite + React + lovable-tagger
tailwind.config.ts           # shadcn theme with HSL CSS variables (Tailwind v4 equivalent)
tsconfig.json                # LOOSE — strict:false, noImplicitAny:false
postcss.config.js            # Standard
eslint.config.js             # Unused-vars OFF
components.json              # shadcn config

src/
  main.tsx                   # 3-line entry (createRoot + App + CSS)
  index.css                  # CSS variable SLOTS — LLM fills in colors per app
  App.tsx                    # Shell: BrowserRouter + Routes + providers
  App.css                    # Empty/minimal
  vite-env.d.ts              # Vite types
  lib/utils.ts               # cn() helper
  components/ui/*.tsx         # ALL shadcn components (40+)
  components/NavLink.tsx      # Router NavLink wrapper
  hooks/use-mobile.tsx        # useIsMobile() breakpoint hook
  hooks/use-toast.ts          # Toast hook
  pages/Index.tsx             # Placeholder — LLM replaces this
  pages/NotFound.tsx          # Generic 404
  test/setup.ts              # Vitest setup (matchMedia mock)
  test/example.test.ts       # Dummy test (expect(true).toBe(true))
```

**TypeScript config** (deliberately loose):
```json
{
  "strict": false,
  "noImplicitAny": false,
  "noUnusedParameters": false,
  "noUnusedLocals": false,
  "strictNullChecks": false,
  "allowJs": true
}
```

**Quality gate**: `vite build` passes = ship it. No typecheck, no lint, no tests.

### SSE Streaming

Tool calls become progress events. Orchestrator text becomes "thinking" display.

```
User: "Build a snake game"
→ SSE: { type: "thinking", content: "I'll build a retro Nokia-style Snake game..." }
→ SSE: { type: "tool_start", tool: "provisionSandbox" }
→ SSE: { type: "tool_complete", tool: "provisionSandbox" }
→ SSE: { type: "tool_start", tool: "editFile", label: "Setting up retro LCD theme" }
→ SSE: { type: "tool_complete", tool: "editFile" }
→ SSE: { type: "tool_start", tool: "createFile", label: "Building snake game" }
→ SSE: { type: "tool_complete", tool: "createFile" }
→ SSE: { type: "tool_start", tool: "runBuild" }
→ SSE: { type: "tool_complete", tool: "runBuild", success: true }
→ SSE: { type: "done", summary: "Your retro Snake game is live!" }
```

For edits:
```
User: "Make the header blue"
→ SSE: { type: "tool_start", tool: "editFile" }
→ SSE: { type: "tool_complete", tool: "editFile" }
→ SSE: { type: "done", summary: "Updated header color to blue." }
```

### Web Search for Design Context

The orchestrator can call `searchWeb` to look up design references before building. Examples:

- "Build a construction dashboard" → searches "Procore dashboard UI design" → learns safety orange, slate grays, data-dense cards
- "Build a snake game" → searches "Nokia snake game retro UI" → learns green LCD, pixel fonts, scanline effects
- "Build a todo app" → probably skips search (LLM already knows todo app patterns)

The LLM decides whether to search. Not every request needs it.

## What Gets Deleted

| File | Why |
|------|-----|
| `server/lib/agents/machine.ts` | XState state machine — replaced by agent loop |
| `server/lib/agents/edit-machine.ts` | Edit state machine — edits are just another orchestrator call |
| `server/lib/agents/orchestrator.ts` | Actor implementations — replaced by tool calls |
| `server/lib/creative-director.ts` | Design token generation — LLM writes CSS directly |
| `server/lib/page-generator.ts` | Page generation with closed vocabulary — LLM writes pages freely |
| `server/lib/deterministic-assembly.ts` | Route tree / nav / footer generation — scaffold handles this |
| `server/lib/agents/schemas.ts` | CreativeSpec schema — no structured design output |
| `server/lib/app-blueprint.ts` | Blueprint types — no blueprint concept |
| `server/lib/page-validator.ts` | Post-assembly validation — build gate is enough |
| `server/lib/themed-code-engine.ts` | CSS generation from design tokens — LLM writes CSS |
| `server/lib/design-knowledge.ts` | Design rules for page gen — moves into orchestrator prompt |

## What Gets Kept

| File | Why |
|------|-----|
| `server/lib/sandbox.ts` | Daytona lifecycle — clean, proven |
| `server/lib/agents/tools.ts` | Existing sandbox tools — extended with Relace |
| `server/lib/agents/provider.ts` | Multi-provider model routing — user-selectable models |
| `server/lib/agents/registry.ts` | Agent definitions — repurposed for single orchestrator |
| `server/lib/agents/repair.ts` | Repair logic — becomes part of orchestrator's build-fix loop |
| `server/routes/sandbox-urls.ts` | Preview URL endpoint — unchanged |
| `server/lib/credits.ts` | Credit management — unchanged |
| `server/lib/sse.ts` | SSE helper — reused |
| `server/lib/github.ts` | GitHub integration — optional, kept |

## What Gets Created

| File | Purpose |
|------|---------|
| `server/lib/relace.ts` | Relace Instant Apply API client |
| `server/lib/agents/v2-orchestrator.ts` | Single orchestrator agent + system prompt |
| `server/routes/v2-agent.ts` | Simplified SSE endpoint (no XState) |
| `snapshot-v2/` | New Lovable-style scaffold snapshot |

## Orchestrator System Prompt (Summary)

The full prompt will:
- Define the role: "You are a world-class app builder"
- Instruct design-first thinking: "Anchor to real products for inspiration"
- Describe the scaffold: "The sandbox has React, Tailwind, shadcn/ui pre-installed"
- Set response style: first prompt = brief plan + build, edits = one-line summary
- Include design taste rules (from current creative director prompt, but as guidance not enforcement)
- No closed vocabulary, no forbidden lists

## Lovable Reference (Reverse-Engineered)

From `github.com/amreshtech/my-lovable-tasks`:

- **Snapshot**: `template: new_style_vite_react_shadcn_ts_testing_2026-01-08` — 76 files, all pre-baked
- **Stack**: Vite 5, React 18, Tailwind v3, react-router-dom, shadcn/ui
- **TypeScript**: strict OFF, noImplicitAny OFF, noUnusedLocals OFF
- **ESLint**: @typescript-eslint/no-unused-vars OFF
- **Quality gate**: `vite build` only — no typecheck, no lint, no tests
- **Generated files per app**: 3-4 files (pages/Index.tsx, components/*.tsx, hooks/*.ts, index.css edits)
- **Commit pattern**: template commit → LLM commit → edit commits
- **Test scaffolding**: present but dummy (expect(true).toBe(true))
- **Pre-installed deps**: 40+ shadcn/ui components, framer-motion, recharts, react-hook-form, zod, date-fns, lucide-react, @tanstack/react-query, sonner, vaul, cmdk
