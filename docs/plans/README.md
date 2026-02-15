# Architecture Plans (Historical)

> **Note:** Plans dated before 2026-02-14 reference the original template pipeline architecture
> which has been replaced by the Mastra agent architecture. These documents are preserved
> for historical context but are **not** accurate descriptions of the current system.
>
> Current architecture documentation is in the project root `CLAUDE.md`.

## Current Architecture

The platform now uses a 9-agent Mastra-based architecture:

- **Supervisor** — orchestrates the full generation lifecycle
- **Analyst** — extracts requirements from user descriptions
- **Infrastructure Engineer** — provisions Daytona sandbox, Supabase project, GitHub repo
- **Database Administrator** — designs schemas, validates SQL via PGlite, runs migrations
- **Backend Engineer** — generates TypeScript types, hooks, auth utilities
- **Frontend Engineer** — generates React components, routes, pages with shadcn/ui
- **Code Reviewer** — reviews generated code (read-only)
- **QA Engineer** — validates builds (tsc, lint, build)
- **DevOps Engineer** — handles GitHub push and Vercel deployment

See `lib/agents/registry.ts` for agent definitions and `lib/agents/tools.ts` for available tools.
