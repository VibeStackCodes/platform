# Subdirectory CLAUDE.md Files — Design

**Date**: 2026-02-23
**Goal**: Add CLAUDE.md files across key subdirectories so LLM subagents always have full domain context wherever they work.

## Principles

1. **Under 60 lines per file** — concise orientation, not documentation
2. **WHAT/WHY/HOW** — file inventory, key patterns, gotchas
3. **Progressive disclosure** — link to docs/files, don't inline code
4. **No linter/style rules** — OxLint + Biome handle that
5. **Universally applicable** — only what matters for every task in that directory
6. **File:line references** — stays accurate as code evolves

## Files to Create (13)

| File | ~Lines | Purpose |
|------|--------|---------|
| `server/CLAUDE.md` | 30 | Server boundary: Hono, relative imports, env vars |
| `server/lib/agents/CLAUDE.md` | 50 | XState machines, Mastra agents, model routing |
| `server/lib/sections/CLAUDE.md` | 40 | Section renderers, primitives, registry |
| `server/lib/db/CLAUDE.md` | 25 | Drizzle schema, relations, queries |
| `server/routes/CLAUDE.md` | 35 | Route patterns, SSE, auth, credit gating |
| `server/middleware/CLAUDE.md` | 15 | Auth middleware |
| `server/lib/skills/CLAUDE.md` | 20 | Mastra skill structure |
| `src/CLAUDE.md` | 30 | Client SPA boundary |
| `src/components/CLAUDE.md` | 35 | Builder UI, shadcn, chat/preview |
| `src/routes/CLAUDE.md` | 25 | TanStack file-based routing |
| `tests/CLAUDE.md` | 30 | Vitest, axe-core, mocking |
| `snapshot/CLAUDE.md` | 20 | Daytona sandbox image |
| `e2e/CLAUDE.md` | 20 | Playwright E2E |

## Content Template

Each file follows this structure:
```
# {Domain} — {One-line purpose}

{1-2 sentence context on what this module does and why it exists.}

## Files
- `filename.ts` — one-line purpose

## Key Patterns
- Pattern with file:line reference where helpful

## Gotchas
- Non-obvious traps specific to this domain
```

## What's Excluded

- Code style/formatting (OxLint + Biome)
- General architecture (root CLAUDE.md)
- Inline code snippets (use file references)
- Task-specific or one-off instructions
- Database schema details (use @schema.ts references)
