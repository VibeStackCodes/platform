---
title: AI Agent
description: Single orchestrator agent with 11 tools, memory, and model routing
---

# Agent System

## Overview

The generation pipeline is a single Mastra `Agent` instance called the Orchestrator. There is no state machine, no multi-agent pipeline, and no fixed sequence of operations. The LLM receives a system prompt describing its environment and tool belt, then decides what to do and in what order. The quality gate is simple: `vite build` must pass.

The agent entry point is `POST /api/agent` which streams `AgentStreamEvent` SSE events to the client. The route handler bridges Mastra's `agent.stream()` fullStream to typed SSE events.

## Orchestrator Agent

**File**: `server/lib/agents/orchestrator.ts`

**Factory function**:
```typescript
export function createOrchestrator(provider: ProviderType = 'openai'): Agent
```

The factory creates a fresh `Agent` instance per request (not a singleton). This is required because the provider-specific web search tool (`openai.tools.webSearch()` vs `anthropic.tools.webSearch_20250305()`) must be baked in at construction time.

**Agent configuration**:
```typescript
new Agent({
  id: 'orchestrator',
  name: 'Orchestrator',
  model: orchestratorModel,          // resolved from RequestContext at call time
  memory,                             // SafeMemory from memory.ts
  instructions: ORCHESTRATOR_PROMPT,
  tools: buildTools(provider),        // 11 tools + web search
  defaultOptions: {
    maxSteps: 50,
    modelSettings: { temperature: 0.3 },
  },
})
```

After creation in the route handler, the agent must be registered with the shared Mastra instance:
```typescript
agent.__registerMastra(mastra)
```

This wires the agent into the shared storage, observability, and logger configured in `mastra.ts`.

## System Prompt Summary

The `ORCHESTRATOR_PROMPT` constant (in `orchestrator.ts`) covers the following sections:

**Environment**: The agent works inside a Daytona sandbox pre-loaded with Vite 8, React 19, Tailwind v4.2, react-router-dom v7, and 49 shadcn/ui components. TypeScript is configured with `strict: false`. The only quality gate is `vite build`.

**Working Memory**: The agent is told it has persistent memory across turns that tracks `sandboxId`, `repoUrl`, `projectName`, `filesCreated`, `designDecisions`, and `buildStatus`. It does not need to extract the sandbox ID from user messages.

**First Prompt Workflow** (new app):
1. `webSearch` to find 2–3 real products in the domain for design inspiration
2. `createSandbox` to provision the workspace
3. Edit `src/index.css` for the color theme, `index.html` for title/favicon
4. Create pages, components, hooks
5. Update `src/App.tsx` with routes
6. `runBuild` to validate (up to 3 repair attempts on failure)
7. `commitAndPush` to save to GitHub

**Edit Requests** (existing app):
1. `readFile` relevant files
2. `editFile` for modifications (Relace Instant Apply)
3. `writeFile` for brand-new files only
4. `runBuild` to validate
5. `commitAndPush`

**Image resolver**: `https://img.vibestack.site/s/{query}/{width}/{height}` — URL-encoded 3–5 word query, Unsplash-backed, edge-cached 24h, gradient SVG fallback.

**Rules**: Max 500 lines per file, no TODO/FIXME/placeholder comments, no clarifying questions for unambiguous requests, always end with a one-line summary.

## All 11 Tools

**File**: `server/lib/agents/tools.ts`

All tools are created with `createTool()` from `@mastra/core/tools`. The tool name used in the agent's `tools` map (camelCase) differs from the tool's `id` field (kebab-case). Path traversal outside `/workspace` is blocked by `sanitizeSandboxPath()`. File size is capped at 10MB per file.

---

### `createSandbox` (id: `create-sandbox`)

Creates a new Daytona sandbox from the configured snapshot.

```typescript
// Input
{
  labels?: Record<string, string>  // e.g. { project: 'my-app' }
  // Also accepts a plain string for the 'project' label key
}

// Output
{
  sandboxId: string
  success: boolean
  error?: string
}
```

Calls `createSandboxFn()` from `sandbox.ts` with `language: 'typescript'` and `autoStopInterval: 60` minutes. Uses `DAYTONA_SNAPSHOT_ID` env var.

---

### `writeFile` (id: `write-file`)

Writes a single file to the sandbox. Use for new files only; use `editFile` for modifications.

```typescript
// Input
{
  sandboxId: string
  path: string     // relative to /workspace
  content: string
}

// Output
{
  success: boolean
  path: string
  bytesWritten: number
  error?: string
}
```

Calls `sandbox.fs.uploadFile(Buffer.from(content), fullPath)`.

---

### `writeFiles` (id: `write-files`)

Batch writes multiple files in a single tool call. More efficient than repeated `writeFile` calls for scaffolding.

```typescript
// Input
{
  sandboxId: string
  files: Array<{ path: string; content: string }>
}

// Output
{
  success: boolean
  paths: string[]
  filesWritten: number
  totalBytes: number
  errors: Array<{ path: string; error: string }>
  error?: string
}
```

---

### `readFile` (id: `read-file`)

Reads a file from the sandbox. Always call before `editFile` to understand current state.

```typescript
// Input
{
  sandboxId: string
  path: string   // relative to /workspace
}

// Output
{
  content: string
  exists: boolean
  error?: string
}
```

Calls `sandbox.fs.downloadFile(fullPath)` and returns UTF-8 decoded string.

---

### `editFile` (id: `edit-file`)

Edits an existing file using Relace Instant Apply. The edit snippet can use `// ... keep existing code` markers to abbreviate unchanged sections. Relace merges the snippet into the full file at ~10k tokens/s.

```typescript
// Input
{
  sandboxId: string
  path: string          // relative to /workspace
  editSnippet: string   // abbreviated code with keep-existing markers
  instruction?: string  // optional natural language merge instruction
}

// Output
{
  success: boolean
  path: string
  bytesWritten: number
  error?: string
}
```

Reads the current file, calls `applyEdit()` from `relace.ts`, then writes the merged result back. Preferred over `writeFile` for modifications because it is faster and cheaper.

---

### `listFiles` (id: `list-files`)

Lists all files in a sandbox directory (excluding `node_modules`, `.next`, `.git`).

```typescript
// Input
{
  sandboxId: string
  directory: string   // relative to /workspace
}

// Output
{
  files: string[]
  count: number
  error?: string
}
```

Runs `find <path> -type f ! -path "*/node_modules/*" ...` via `sandbox.process.executeCommand()` with a 30s timeout.

---

### `runCommand` (id: `run-command`)

Executes an arbitrary shell command in the sandbox.

```typescript
// Input
{
  sandboxId: string
  command: string
  cwd?: string    // defaults to /workspace
}

// Output
{
  exitCode: number
  stdout: string
  stderr: string
}
```

120s timeout. `stderr` is populated only if `exitCode !== 0`.

---

### `runBuild` (id: `run-build`)

Runs `bun run build` in `/workspace`. This is the quality gate — must pass before the agent is done.

```typescript
// Input
{
  sandboxId: string
}

// Output
{
  exitCode: number
  output: string   // combined stdout/stderr from bun run build
}
```

120s timeout. Agent should call this after every meaningful code change and repair build failures (max 3 attempts).

---

### `installPackage` (id: `install-package`)

Installs npm packages via `bun add`. Use for packages not pre-installed in the snapshot.

```typescript
// Input
{
  sandboxId: string
  packages: string   // space-separated, e.g. "dnd-kit @dnd-kit/core"
}

// Output
{
  success: boolean
  output: string
  error?: string
}
```

60s timeout.

---

### `getPreviewUrl` (id: `get-preview-url`)

Returns the signed preview URL for a sandbox port, routed through the Cloudflare Worker reverse proxy.

```typescript
// Input
{
  sandboxId: string
  port?: number   // default: 3000
}

// Output
{
  url: string        // https://{port}-{sandboxId}-preview.vibestack.site
  port: number
  expiresAt: string  // ISO timestamp (1 hour)
  error?: string
}
```

The proxy URL format is built by `buildProxyUrl(sandboxId, port)` in `sandbox.ts`. The Cloudflare Worker injects Daytona auth headers transparently.

---

### `commitAndPush` (id: `commit-and-push`)

Commits all changes with `git add -A && git commit` and pushes to GitHub. Creates a new GitHub repo if no remote exists.

```typescript
// Input
{
  sandboxId: string
  message: string   // git commit message
}

// Output
{
  success: boolean
  commitHash?: string
  repoUrl?: string
  error?: string    // push error (commit may still have succeeded)
}
```

Sequence:
1. `git add -A && git commit -m <message> --allow-empty`
2. Check for existing `origin` remote
3. If no remote: calls `createRepo()` and `getInstallationToken()` from `github.ts`, creates repo named `vibestack-<sandboxId>`
4. If remote exists: refreshes the installation token (tokens expire)
5. `git push -u origin main`

GitHub push is skipped if `GITHUB_APP_ID` or `GITHUB_ORG` env vars are absent (returns `success: true` with only `commitHash`).

---

### `webSearch` (provider-native)

Web search is not a Mastra tool created with `createTool()`. It uses provider-native implementations that are injected into the tool belt at agent construction time:

```typescript
// OpenAI provider
openai.tools.webSearch()

// Anthropic provider
anthropic.tools.webSearch_20250305({ maxUses: 5 })
```

The agent uses this tool before writing any code to research domain-specific UI patterns, color palettes, and real product examples.

## Memory Architecture

**File**: `server/lib/agents/memory.ts`

Memory is thread-based, scoped to a project. The thread ID is the `projectId` and the resource ID is the `userId`.

### PostgresStore

```typescript
export const storage = new PostgresStore({
  id: 'vibestack-storage',
  connectionString: process.env.DATABASE_URL,
})
```

Reuses the existing Supabase PostgreSQL instance. Mastra creates its own internal tables for thread history.

### SafeMemory

The exported `memory` is a `SafeMemory` instance — a subclass of Mastra's `Memory` that strips reasoning/redacted-reasoning parts from recalled messages before they are included in the next LLM call:

```typescript
class SafeMemory extends Memory {
  async recall(args: any) {
    const result = await super.recall(args)
    result.messages = stripReasoningFromMessages(result.messages)
    return result
  }
}
```

This prevents OpenAI from rejecting requests with "Item of type 'reasoning' was provided without its required following item" — which happens when a stream is aborted mid-generation, leaving an orphaned reasoning item in the thread history.

### Memory Configuration

```typescript
export const memory = new SafeMemory({
  storage,
  options: {
    lastMessages: 40,        // recall last 40 messages per thread
    semanticRecall: false,   // no vector search — cheaper and faster
    workingMemory: {
      enabled: true,
      scope: 'thread',
      schema: workingMemorySchema,
    },
  },
})
```

### Working Memory Schema

```typescript
export const workingMemorySchema = z.object({
  sandboxId: z.string().optional(),
  projectName: z.string().optional(),
  repoUrl: z.string().optional(),
  filesCreated: z.array(z.string()).optional(),
  designDecisions: z.array(z.string()).optional(),
  buildStatus: z.enum(['pending', 'passing', 'failing']).optional(),
})
```

Working memory is a structured notepad persisted across conversation turns within the same thread. The agent reads and updates it implicitly — no manual extraction needed.

## Provider Routing

**File**: `server/lib/agents/provider.ts`

### PROVIDER_REGISTRY

Defines direct connections (no proxy) to each provider:

```typescript
const PROVIDER_REGISTRY: Record<ProviderType, ProviderEntry> = {
  openai: {
    apiKeyEnv: 'OPENAI_API_KEY',
    create: (opts) => createOpenAI(opts),
  },
  anthropic: {
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    create: (opts) => createAnthropic(opts),
  },
}
```

`ProviderType = 'openai' | 'anthropic'`

### MODEL_CONFIGS

Maps user-facing model IDs to provider + model ID:

```typescript
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt-5.2-codex': {
    provider: 'openai',
    modelId: 'gpt-5.2-codex',
    roleOverrides: { creativeDirector: 'gpt-5.2' },
  },
  'claude-opus-4-6': {
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
  },
}
```

Adding a new model requires only a new entry in `MODEL_CONFIGS`. Adding a new provider requires a new `PROVIDER_REGISTRY` entry plus `bun add @ai-sdk/<provider>`.

`ALLOWED_MODELS = Object.keys(MODEL_CONFIGS)` is used by the route handler to validate the `model` field in POST body.

### createAgentModelResolver

```typescript
export function createAgentModelResolver(role: PipelineRole) {
  return function resolveModel({ requestContext }) {
    const selectedModel = requestContext?.get('selectedModel') ?? 'gpt-5.2-codex'
    const config = MODEL_CONFIGS[selectedModel] ?? MODEL_CONFIGS['gpt-5.2-codex']
    const modelId = config.roleOverrides?.[role] ?? config.modelId
    return createDirectProvider(config.provider)(modelId)
  }
}
```

The resolver is called by Mastra at stream time. It reads `selectedModel` from `RequestContext`, which is set by the route handler before calling `agent.stream()`:

```typescript
const requestContext = new RequestContext()
requestContext.set('selectedModel', model)

await agent.stream(message, { requestContext, ... })
```

## Mastra Registry

**File**: `server/lib/agents/mastra.ts`

The central Mastra instance registers the orchestrator, memory, storage, logger, and Langfuse observability:

```typescript
export const mastra = new Mastra({
  agents: { orchestrator: createOrchestrator() },
  memory: { default: memory },
  storage,
  logger: new PinoLogger({ level: 'info' }),
  observability: createObservability(),  // undefined if LANGFUSE_* not set
})
```

Langfuse is gated on both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`. When absent, no traces are exported. The exporter uses `@mastra/langfuse` with `SamplingStrategyType.ALWAYS`.

Per-request agents (created in the route handler) call `agent.__registerMastra(mastra)` to wire into this shared instance without being permanently registered in the `agents` map.

## Testing with Mastra Studio

Run `bun run mastra:dev` to start the Mastra development studio. This serves the default orchestrator (registered in `mastra.ts`) at `http://localhost:4111`. The studio provides:

- Chat interface to send messages to the orchestrator
- Thread history viewer
- Tool call inspector
- Working memory viewer

The studio uses the default `'openai'` provider unless `selectedModel` is set via the request context UI. To test Anthropic models, the `ANTHROPIC_API_KEY` env var must be present in `.env.local`.

## Sentry AI Instrumentation

**File**: `server/sentry.ts`

Sentry is initialized with two AI SDK integrations:

```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    Sentry.openAIIntegration({ recordInputs: false, recordOutputs: false }),
    Sentry.anthropicAIIntegration({ recordInputs: false, recordOutputs: false }),
  ],
})
```

Two span helpers are exported for wrapping agent and tool calls in custom Sentry spans:

```typescript
export function traceAgent(agentName: string, fn: () => Promise<unknown>)
export function traceTool(toolName: string, fn: () => Promise<unknown>)
```

`recordInputs: false` and `recordOutputs: false` prevent prompt/completion content from being sent to Sentry (privacy).
