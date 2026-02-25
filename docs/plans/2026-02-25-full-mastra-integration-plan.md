# Full Mastra Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire all production-relevant Mastra features — memory, observability, simplified tools — into the existing single-orchestrator agent.

**Architecture:** Mastra registry (`new Mastra(...)`) wires PostgresStore (reusing DATABASE_URL), Memory with working memory (Zod schema for sandboxId/project state), Langfuse observability via `@mastra/langfuse`, and a simplified 11-tool agent belt. Helicone proxy is removed; providers connect directly.

**Tech Stack:** `@mastra/core@1.7.0`, `@mastra/memory@1.3.0`, `@mastra/pg@1.4.0`, `@mastra/langfuse@1.0.3`, `@mastra/loggers@1.0.1`, `@mastra/observability@1.2.0`

---

### Task 1: Install `@mastra/langfuse`

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `bun add @mastra/langfuse`

**Step 2: Verify installation**

Run: `ls node_modules/@mastra/langfuse/dist/index.d.ts`
Expected: File exists

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add @mastra/langfuse for observability"
```

---

### Task 2: Create Mastra registry + PostgresStore + Memory

**Files:**
- Create: `server/lib/agents/mastra.ts`
- Test: `tests/mastra-registry.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/mastra-registry.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock @mastra/pg to avoid real DB connection
vi.mock('@mastra/pg', () => ({
  PostgresStore: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    getStore: vi.fn(),
  })),
}))

// Mock @mastra/langfuse
vi.mock('@mastra/langfuse', () => ({
  LangfuseExporter: vi.fn().mockImplementation(() => ({
    name: 'langfuse',
    exportTracingEvent: vi.fn(),
    shutdown: vi.fn(),
  })),
}))

describe('Mastra registry', () => {
  it('exports mastra instance with memory and storage', async () => {
    const { mastra, memory, storage } = await import('@server/lib/agents/mastra')
    expect(mastra).toBeDefined()
    expect(memory).toBeDefined()
    expect(storage).toBeDefined()
  })

  it('exports working memory schema', async () => {
    const { workingMemorySchema } = await import('@server/lib/agents/mastra')
    const result = workingMemorySchema.safeParse({
      sandboxId: 'test-123',
      buildStatus: 'passing',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid working memory', async () => {
    const { workingMemorySchema } = await import('@server/lib/agents/mastra')
    const result = workingMemorySchema.safeParse({
      buildStatus: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- tests/mastra-registry.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// server/lib/agents/mastra.ts
import { Mastra } from '@mastra/core/mastra'
import { Memory } from '@mastra/memory'
import { PostgresStore } from '@mastra/pg'
import { PinoLogger } from '@mastra/loggers'
import { Observability } from '@mastra/observability'
import { LangfuseExporter } from '@mastra/langfuse'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Working Memory Schema — structured notepad persisted across turns
// ---------------------------------------------------------------------------

export const workingMemorySchema = z.object({
  sandboxId: z.string().optional(),
  projectName: z.string().optional(),
  repoUrl: z.string().optional(),
  filesCreated: z.array(z.string()).optional(),
  designDecisions: z.array(z.string()).optional(),
  buildStatus: z.enum(['pending', 'passing', 'failing']).optional(),
})

// ---------------------------------------------------------------------------
// Storage — reuse existing Supabase Postgres
// ---------------------------------------------------------------------------

export const storage = new PostgresStore({
  connectionString: process.env.DATABASE_URL!,
})

// ---------------------------------------------------------------------------
// Memory — thread-based conversation history + working memory
// ---------------------------------------------------------------------------

export const memory = new Memory({
  storage,
  options: {
    lastMessages: 40,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      template: workingMemorySchema,
    },
  },
})

// ---------------------------------------------------------------------------
// Observability — Langfuse exporter (gated on env vars)
// ---------------------------------------------------------------------------

function createObservability(): Observability | undefined {
  if (!process.env.LANGFUSE_PUBLIC_KEY) return undefined

  return new Observability({
    configs: {
      default: {
        serviceName: 'vibestack-agent',
        sampling: { type: 'always' as const },
        exporters: [
          new LangfuseExporter({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY!,
            baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
          }),
        ],
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = new PinoLogger({ level: 'info' })

// ---------------------------------------------------------------------------
// Mastra Registry
// ---------------------------------------------------------------------------

export const mastra = new Mastra({
  memory,
  storage,
  logger,
  observability: createObservability(),
})
```

Note: The `agents` field is NOT set here — the orchestrator is created per-request with provider-specific tools. We register it dynamically in the route handler via `mastra.getAgent()` or pass memory directly.

**Step 4: Run test to verify it passes**

Run: `bun run test -- tests/mastra-registry.test.ts`
Expected: PASS

**Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/lib/agents/mastra.ts tests/mastra-registry.test.ts
git commit -m "feat: add Mastra registry with PostgresStore, Memory, and Langfuse observability"
```

---

### Task 3: Simplify provider.ts — Remove Helicone

**Files:**
- Modify: `server/lib/agents/provider.ts`
- Test: existing `tests/orchestrator.test.ts` should still pass

**Step 1: Rewrite provider.ts**

Remove all Helicone code. The new file should:
- Keep `PROVIDER_REGISTRY` but without gateway URLs — direct connections only
- Keep `MODEL_CONFIGS` unchanged
- Keep `createAgentModelResolver(role)` but simplify: reads only `selectedModel` from RequestContext (no heliconeContext)
- Remove: `HeliconeContext`, `getHeliconeHeaders()`, `getHeliconeBaseURL()`, `createHeliconeProvider()`, `_globalHeliconeContext`, `setGlobalHeliconeContext()`
- Add: `createDirectProvider(providerType)` — creates provider with API key only

The simplified `createAgentModelResolver`:
```typescript
export function createAgentModelResolver(role: PipelineRole) {
  return function resolveModel({
    requestContext,
  }: {
    requestContext: { has: (key: string) => boolean; get: (key: string) => unknown }
  }): MastraModelConfig {
    const selectedModel = requestContext?.has('selectedModel')
      ? (requestContext.get('selectedModel') as string)
      : 'gpt-5.2-codex'
    const config = MODEL_CONFIGS[selectedModel] ?? MODEL_CONFIGS['gpt-5.2-codex']
    const modelId = config.roleOverrides?.[role] ?? config.modelId
    return createDirectProvider(config.provider)(modelId)
  }
}
```

**Step 2: Run tests**

Run: `bun run test`
Expected: All 26 files pass. Some tests may mock `createHeliconeProvider` — update those to mock `createDirectProvider`.

**Step 3: Typecheck + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: Clean

**Step 4: Commit**

```bash
git add server/lib/agents/provider.ts
git commit -m "refactor: remove Helicone proxy — direct provider connections"
```

---

### Task 4: Update agent.ts — Remove Helicone context setup

**Files:**
- Modify: `server/routes/agent.ts`

**Step 1: Remove heliconeContext from RequestContext setup**

Delete these lines:
```typescript
requestContext.set('heliconeContext', {
  userId: user.id,
  projectId,
  sessionId: `${projectId}:${Date.now()}`,
  agentName: 'orchestrator',
})
```

RequestContext now only carries `selectedModel`.

**Step 2: Run tests**

Run: `bun run test`
Expected: PASS

**Step 3: Commit**

```bash
git add server/routes/agent.ts
git commit -m "refactor: remove heliconeContext from agent route"
```

---

### Task 5: Add commitAndPush tool, remove Git/deploy tools

**Files:**
- Modify: `server/lib/agents/tools.ts`
- Test: `tests/tools.test.ts` (update existing)

**Step 1: Update tests**

In `tests/tools.test.ts`, replace tests for `pushToGitHubTool`, `createGitHubRepoTool`, `getGitHubTokenTool`, `deployToVercelTool` with tests for the new `commitAndPushTool`:

```typescript
describe('commitAndPushTool', () => {
  it('has correct schema', () => {
    expect(commitAndPushTool.id).toBe('commit-and-push')
    expect(commitAndPushTool.inputSchema).toBeDefined()
  })
})
```

**Step 2: Implement commitAndPush tool**

In `server/lib/agents/tools.ts`, add:

```typescript
export const commitAndPushTool = createTool({
  id: 'commit-and-push',
  description: 'Commit all changes and push to GitHub. Creates a repo if none exists. Call after each meaningful change.',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    message: z.string().describe('Git commit message'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    commitHash: z.string().optional(),
    repoUrl: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context: inputData }) => {
    const { sandboxId, message } = inputData
    const sandbox = await getSandbox(sandboxId)

    // 1. git add -A && git commit
    const commitResult = await sandbox.process.executeCommand(
      `cd /workspace && git add -A && git commit -m ${escapeShellArg(message)} --allow-empty`,
      { timeout: 30 },
    )
    if (commitResult.exitCode !== 0) {
      return { success: false, error: commitResult.stderr || 'Commit failed' }
    }

    // Extract commit hash
    const hashMatch = commitResult.stdout?.match(/\[[\w-]+ ([a-f0-9]+)\]/)
    const commitHash = hashMatch?.[1]

    // 2. Check if repo exists (GitHub env vars required)
    if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_ORG) {
      return { success: true, commitHash }
    }

    try {
      // Check if origin remote exists
      const remoteResult = await sandbox.process.executeCommand(
        'cd /workspace && git remote get-url origin 2>/dev/null',
        { timeout: 10 },
      )

      let repoUrl: string

      if (remoteResult.exitCode !== 0 || !remoteResult.stdout?.trim()) {
        // No remote — create repo and set origin
        const repoName = buildRepoName(sandboxId)
        const repo = await createRepo(repoName)
        repoUrl = repo.clone_url
        const token = await getInstallationToken()
        const authedUrl = repoUrl.replace('https://', `https://x-access-token:${token}@`)
        await sandbox.process.executeCommand(
          `cd /workspace && git remote add origin ${authedUrl}`,
          { timeout: 15 },
        )
      } else {
        repoUrl = remoteResult.stdout.trim()
        // Refresh token for push
        const token = await getInstallationToken()
        const cleanUrl = repoUrl.replace(/x-access-token:[^@]+@/, '')
        const authedUrl = cleanUrl.replace('https://', `https://x-access-token:${token}@`)
        await sandbox.process.executeCommand(
          `cd /workspace && git remote set-url origin ${authedUrl}`,
          { timeout: 15 },
        )
      }

      // 3. Push
      await sandbox.process.executeCommand(
        'cd /workspace && git push -u origin main',
        { timeout: 60 },
      )

      return { success: true, commitHash, repoUrl }
    } catch (error) {
      // Push failed but commit succeeded — still a success
      return {
        success: true,
        commitHash,
        error: `Push failed: ${error instanceof Error ? error.message : 'unknown'}`,
      }
    }
  },
})
```

Remove exports: `pushToGitHubTool`, `createGitHubRepoTool`, `getGitHubTokenTool`, `deployToVercelTool`.

**Step 3: Run tests**

Run: `bun run test -- tests/tools.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add server/lib/agents/tools.ts tests/tools.test.ts
git commit -m "feat: add commitAndPush tool, remove Git/deploy tools from agent"
```

---

### Task 6: Update orchestrator — Memory + simplified tools + system prompt

**Files:**
- Modify: `server/lib/agents/orchestrator.ts`

**Step 1: Update orchestrator**

Changes:
1. Import `memory` from `./mastra`
2. Pass `memory` to `new Agent({ memory, ... })`
3. Update `BASE_TOOLS`: remove pushToGitHub/createGitHubRepo/getGitHubToken/deployToVercel, add commitAndPush
4. Update `ORCHESTRATOR_PROMPT`:
   - Remove references to deployment tools
   - Add working memory instructions: "Your working memory persists sandboxId, repoUrl, and design decisions across turns. You don't need to track these manually."
   - Add: "Call `commitAndPush` after each meaningful change (new feature, bug fix, build passing)."
   - Remove the `[Existing sandbox: ...]` hack mention

**Step 2: Run tests**

Run: `bun run test`
Expected: PASS (orchestrator tests mock the Agent constructor)

**Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add server/lib/agents/orchestrator.ts
git commit -m "feat: wire Memory into orchestrator, simplify tool belt"
```

---

### Task 7: Update agent route — threadId, remove insertChatMessage, structured output

**Files:**
- Modify: `server/routes/agent.ts`
- Test: `tests/agent-route.test.ts` (update mocks)

**Step 1: Update agent.ts**

Key changes:
1. Remove `insertChatMessage` import and all 3 call sites
2. Remove `sandboxId` from request body — Memory's working memory handles it
3. Pass `threadId: projectId` and `resourceId: userId` to `agent.stream()`
4. Remove the `[Existing sandbox: ${sandboxId}]` string injection
5. Add structured output:
   ```typescript
   const streamOutput = await agent.stream(message, {
     requestContext,
     threadId: projectId,
     resourceId: userId,
     maxSteps: 50,
     structuredOutput: {
       schema: z.object({
         summary: z.string().describe('One-line summary of what was built or changed'),
       }),
     },
   })
   ```
6. In `bridgeStreamToSSE`: extract `sandboxId` from `sandbox_ready` events that we still emit (from `createSandbox` tool result) — this doesn't change
7. Replace regex summary extraction with `await streamOutput.object` (graceful fallback to text if structured output unavailable)

**Step 2: Update test mocks**

In `tests/agent-route.test.ts`:
- Remove mock for `insertChatMessage`
- Update request body to not include `sandboxId`
- Mock `agent.stream` to accept `threadId`/`resourceId`

**Step 3: Run tests**

Run: `bun run test`
Expected: PASS

**Step 4: Commit**

```bash
git add server/routes/agent.ts tests/agent-route.test.ts
git commit -m "feat: wire threadId/resourceId into agent stream, remove insertChatMessage"
```

---

### Task 8: Clean up Helicone references across codebase

**Files:**
- Modify: `server/routes/admin.ts` — remove Helicone env check from health endpoint
- Modify: `server/index.ts` — remove any Helicone imports/references
- Modify: `CLAUDE.md` — update env var table (remove HELICONE_API_KEY, add LANGFUSE_*)
- Modify: `server/CLAUDE.md` — remove Helicone references
- Modify: `server/lib/agents/CLAUDE.md` — remove Helicone references
- Modify: `tests/admin.test.ts` — update env checks if testing Helicone

**Step 1: Search and update all references**

Run: `grep -r "helicone\|HELICONE" --include="*.ts" --include="*.md" -l` to find all files.

Update each file to remove Helicone references and add Langfuse where appropriate.

**Step 2: Run full suite**

Run: `bun run test && bunx tsc --noEmit && bun run lint`
Expected: All pass, 0 lint errors

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove all Helicone references, add Langfuse env vars to docs"
```

---

### Task 9: Update CLAUDE.md files for new architecture

**Files:**
- Modify: `CLAUDE.md` (root)
- Modify: `server/lib/agents/CLAUDE.md`
- Modify: `server/routes/CLAUDE.md`
- Modify: `server/CLAUDE.md`

Update:
- Env var table: remove `HELICONE_API_KEY`, add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASEURL`
- Architecture: mention Mastra registry, Memory, working memory, Langfuse
- Tool belt: 11 tools (not 14), `commitAndPush` replaces 4 Git tools
- Agent route: threadId/resourceId, no insertChatMessage
- Remove "Helicone fallback" from Gotchas
- Add: "Memory tables auto-created by PostgresStore alongside Drizzle tables — no migration needed"

**Step 1: Make updates**

**Step 2: Commit**

```bash
git add CLAUDE.md server/CLAUDE.md server/lib/agents/CLAUDE.md server/routes/CLAUDE.md
git commit -m "docs: update CLAUDE.md files for full Mastra integration"
```

---

### Task 10: Final verification

**Step 1: Full test suite**

Run: `bun run test`
Expected: All pass

**Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: Clean

**Step 3: Lint**

Run: `bun run lint`
Expected: 0 errors

**Step 4: Manual smoke test (optional)**

Run: `bun run test -- tests/local-gen.test.ts --timeout 300000`
This runs a real generation against live services to verify Memory + commitAndPush work end-to-end.

---

## Task Dependency Graph

```
Task 1 (install langfuse)
    ↓
Task 2 (Mastra registry + Memory + Storage)
    ↓
Task 3 (simplify provider.ts) ─── Task 5 (commitAndPush tool)
    ↓                                  ↓
Task 4 (agent.ts helicone cleanup)  Task 6 (orchestrator wiring)
    ↓                                  ↓
    └──────────── Task 7 (agent route: threadId, structured output) ────────────┘
                        ↓
                  Task 8 (Helicone cleanup)
                        ↓
                  Task 9 (CLAUDE.md updates)
                        ↓
                  Task 10 (final verification)
```

Tasks 3 and 5 can run in parallel. Tasks 4 and 6 can run in parallel. Everything else is sequential.
