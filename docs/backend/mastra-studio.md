---
title: Mastra Studio
description: Agent dev UI, tool playground, and observability
---

# Mastra Studio — Agent & Tool Playground

Mastra Studio is a local developer UI for testing the VibeStack orchestrator agent
interactively — without triggering the full Hono API stack, Stripe billing, or credit
deductions. Use it to iterate on prompts, test individual tools, and inspect traces.

## Quick Start

```bash
bun run mastra:dev
# Opens at http://localhost:4111
```

The `mastra:dev` script runs `mastra dev`, which reads `src/mastra/index.ts` as the
entry point and serves the Studio UI. Your Hono server (`localhost:8787`) and Vite
dev server (`localhost:5173`) run on separate ports — no conflict.

## What You Can Do

### Agent Chat

- Test the orchestrator agent interactively
- Switch between models (GPT-5.2 Codex, Claude Opus 4.6, Claude Sonnet 4.6)
- Adjust temperature and max tokens per session
- View conversation history per thread (keyed by project ID in production)

### Tool Playground

Test each of the 11 tools in isolation without running the full agent:

| Tool | Purpose |
|------|---------|
| `createSandbox` | Provision a new Daytona sandbox from the snapshot |
| `writeFile` | Write a single file into the sandbox |
| `writeFiles` | Write multiple files in one call |
| `readFile` | Read a file from the sandbox |
| `editFile` | Merge a code snippet via the Relace Instant Apply API |
| `listFiles` | List directory contents in the sandbox |
| `runCommand` | Execute an arbitrary shell command |
| `runBuild` | Run `vite build` and return stdout/stderr |
| `installPackage` | Install npm packages via bun |
| `getPreviewUrl` | Retrieve the signed Daytona preview URL |
| `commitAndPush` | Commit all changes and push to the GitHub repo |
| `webSearch` | Provider-native web search (OpenAI or Anthropic) |

Input custom parameters for each tool, inspect the raw output, and debug failures
without waiting for the full agent loop.

### Observability

When `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are present in `.env.local`,
the Studio exports traces to Langfuse for every LLM call and tool execution:

- Token usage, latency, and estimated cost per call
- Full prompt and completion payloads
- Tool input/output pairs
- Thread-level conversation history

Without those keys the Langfuse exporter is skipped entirely (no-op) — all other
Studio features work normally.

### Swagger / OpenAPI

- Interactive API reference: `http://localhost:4111/swagger-ui`
- Raw OpenAPI spec: `http://localhost:4111/openapi.json`

The spec is auto-generated from the Mastra instance — it reflects the registered
agent and all tool schemas with no manual authoring required.

## Architecture

```
bun run mastra:dev
  └── mastra dev
        └── src/mastra/index.ts          # CLI entry point
              └── re-exports mastra from
                  server/lib/agents/mastra.ts   # Mastra registry
                        ├── createOrchestrator()     # Agent + 11 tools + memory
                        ├── Memory (PostgresStore)   # Thread-based working memory
                        ├── PinoLogger               # Structured logging
                        └── LangfuseExporter         # Optional observability
```

`src/mastra/index.ts` is a single re-export shim so the CLI can resolve the entry
without crossing client/server build boundaries:

```ts
// src/mastra/index.ts
export { mastra } from '../../server/lib/agents/mastra'
```

The Mastra instance registers the orchestrator agent under the key `orchestrator`.
Production route (`server/routes/agent.ts`) creates per-request agents for dynamic
provider switching — the registry agent uses the default OpenAI provider.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgresStore for agent memory and storage |
| `OPENAI_API_KEY` | Yes | Default LLM provider for the orchestrator |
| `ANTHROPIC_API_KEY` | No | Required only when testing Claude models |
| `LANGFUSE_PUBLIC_KEY` | No | Enables Langfuse observability traces |
| `LANGFUSE_SECRET_KEY` | No | Enables Langfuse observability traces |
| `LANGFUSE_BASEURL` | No | Langfuse host (default: `https://cloud.langfuse.com`) |
| `DAYTONA_API_KEY` | No | Required only when testing sandbox tools |
| `DAYTONA_SNAPSHOT_ID` | No | Required only when testing `createSandbox` |
| `RELACE_API_KEY` | No | Required only when testing the `editFile` tool |

All variables are loaded from `.env.local` at the project root. The Mastra CLI
respects the same dotenv loading as the Hono server.

## Ports

| Service | Port | Notes |
|---------|------|-------|
| Mastra Studio | `4111` | `bun run mastra:dev` |
| Hono dev server | `8787` | `bun run dev` (server half) |
| Vite dev server | `5173` | `bun run dev` (client half) |

All three can run simultaneously with no port conflicts.

## CLI Version

The project uses `mastra@1.3.1` (installed as a devDependency). The CLI binary is
invoked via the `mastra:dev` and `mastra:build` scripts in `package.json`:

```json
"mastra:dev":   "mastra dev",
"mastra:build": "mastra build"
```

To check the installed version:

```bash
bunx mastra --version
```

## Troubleshooting

**Studio fails to start — "cannot find module"**

The CLI resolves `src/mastra/index.ts` from the project root. Make sure you run
`bun run mastra:dev` from `/Users/ammishra/VibeStack/platform`, not from a subdirectory.

**Tool calls fail with "DAYTONA_API_KEY not set"**

Sandbox tools require a live Daytona key. Set `DAYTONA_API_KEY` and
`DAYTONA_SNAPSHOT_ID` in `.env.local`, or test non-sandbox tools (file I/O, web
search) without it.

**Memory queries fail with "relation does not exist"**

The PostgresStore requires the Mastra schema to be present in the database. Run the
platform migrations first:

```bash
bun run db:migrate
```

**Port 4111 already in use**

A previous `mastra dev` process may still be running. Find and kill it:

```bash
lsof -ti :4111 | xargs kill -9
```
