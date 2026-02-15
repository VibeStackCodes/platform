# Audit Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical and moderate issues found in the 5-agent audit of the Mastra agent architecture overhaul.

**Architecture:** Restore deleted infrastructure integrations (Supabase Management API, GitHub App) as Mastra tools, rewire `builder-chat.tsx` to call the new `/api/agent` endpoint, fix model IDs to use real OpenAI models, and clean up remaining dead code.

**Tech Stack:** Mastra SDK (`@mastra/core/tools`), Supabase Management API (`supabase-management-js`), Octokit (`@octokit/auth-app`), Vercel AI SDK (`ai`, `@ai-sdk/react`)

---

## Task Overview

| Task | Title | Severity | Est. |
|------|-------|----------|------|
| 1 | Fix model IDs to real OpenAI models | CRITICAL | 5 min |
| 2 | Add 4 missing infrastructure tools | CRITICAL | 20 min |
| 3 | Implement real deployToVercel tool | CRITICAL | 10 min |
| 4 | Assign new tools to agents | CRITICAL | 5 min |
| 5 | Rewire builder-chat.tsx to /api/agent | CRITICAL | 25 min |
| 6 | Add agent event handling to builder-chat | CRITICAL | 15 min |
| 7 | Clean remaining dead code | MODERATE | 10 min |
| 8 | Update tests for all changes | MODERATE | 15 min |
| 9 | Full build verification | MODERATE | 5 min |

---

### Task 1: Fix Model IDs to Real OpenAI Models

The registry uses fictional model IDs (`gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5-mini`) that don't exist. Agent execution will fail immediately.

**Files:**
- Modify: `lib/agents/registry.ts:28-30`
- Modify: `tests/agent-registry.test.ts:57-71`

**Step 1: Update model constants in registry**

Replace the three model constants at the top of `lib/agents/registry.ts`:

```typescript
// Before (fictional):
const ORCHESTRATOR_MODEL = 'openai/gpt-5.2';
const CODEGEN_MODEL = 'openai/gpt-5.1-codex-max';
const VALIDATOR_MODEL = 'openai/gpt-5-mini';

// After (real):
const ORCHESTRATOR_MODEL = 'openai/gpt-4o';
const CODEGEN_MODEL = 'openai/gpt-4o';
const VALIDATOR_MODEL = 'openai/gpt-4o-mini';
```

Rationale:
- `gpt-4o` is OpenAI's most capable model with extended context (128k)
- `gpt-4o-mini` is fast/cheap for validation tasks (builds, type-checking, linting)
- All 3 are real, currently available model IDs that Mastra's OpenAI provider supports

**Step 2: Update registry test assertions**

In `tests/agent-registry.test.ts`, update the `assigns correct models per tier` test:

```typescript
it('assigns correct models per tier', () => {
  // Orchestrator tier (gpt-4o)
  expect(supervisorAgent.model).toContain('gpt-4o');
  expect(analystAgent.model).toContain('gpt-4o');
  expect(dbaAgent.model).toContain('gpt-4o');
  expect(reviewerAgent.model).toContain('gpt-4o');

  // Codegen tier (gpt-4o)
  expect(backendAgent.model).toContain('gpt-4o');
  expect(frontendAgent.model).toContain('gpt-4o');

  // Validator tier (gpt-4o-mini)
  expect(infraAgent.model).toContain('gpt-4o-mini');
  expect(qaAgent.model).toContain('gpt-4o-mini');
  expect(devOpsAgent.model).toContain('gpt-4o-mini');
});
```

**Step 3: Run tests**

Run: `npx vitest run tests/agent-registry.test.ts`
Expected: All 9 tests PASS

**Step 4: Commit**

```bash
git add lib/agents/registry.ts tests/agent-registry.test.ts
git commit -m "fix: replace fictional model IDs with real OpenAI models"
```

---

### Task 2: Add 4 Missing Infrastructure Tools

The audit found that Supabase project creation, GitHub repo creation, GitHub token retrieval, and SQL migration execution were deleted but never re-implemented as Mastra tools.

**Files:**
- Modify: `lib/agents/tools.ts` (add 4 new tools at bottom)
- Create: `lib/github.ts` (restore from main branch)
- Create: `lib/supabase-mgmt.ts` (restore from main branch — only needed functions)

**Step 1: Restore `lib/github.ts` from main branch**

Run: `git checkout main -- lib/github.ts`

This restores the GitHub App client with `createRepo()`, `getInstallationToken()`, and `buildRepoName()`. It uses `octokit` and `@octokit/auth-app` (both already in package.json).

Verify the file has these exports:
- `createRepo(name: string): Promise<{ cloneUrl: string; htmlUrl: string }>`
- `getInstallationToken(): Promise<string>`
- `buildRepoName(appName: string, projectId: string): string`

**Step 2: Restore `lib/supabase-mgmt.ts` from main branch**

Run: `git checkout main -- lib/supabase-mgmt.ts`

This restores the Supabase Management API client. Key functions:
- `createSupabaseProject(name, region?, dbPassword?, plan?): Promise<SupabaseProject>`
- `runMigration(projectId, sql): Promise<MigrationResult>`
- `setupSchema(projectId, schema): Promise<MigrationResult[]>`
- `deleteSupabaseProject(projectId): Promise<void>`

Note: This file imports `SupabaseProject` and `SupabaseSchema` from `lib/types.ts`. `SupabaseProject` was deleted in the cleanup — we need to restore it.

**Step 3: Restore `SupabaseProject` type in `lib/types.ts`**

Add back the `SupabaseProject` interface (it was deleted as "dead" but is needed by `supabase-mgmt.ts`):

```typescript
// Add after the Platform Database Types section header:

export interface SupabaseProject {
  id: string;
  name: string;
  orgId: string;
  region: string;
  dbHost: string;
  dbPassword: string;
  anonKey: string;
  serviceRoleKey: string;
  url: string;
}
```

Also restore `SupabaseSchema` if it was deleted (check — it's used by `setupSchema()`):

```typescript
export interface SupabaseSchema {
  migrationSQL: string;
  seedSQL: string | null;
  rls: string;
  storageBuckets: string[];
  realtimeTables: string[];
}
```

**Step 4: Add 4 new tools to `lib/agents/tools.ts`**

Add these tool definitions after the existing `deployToVercelTool`:

```typescript
import { createRepo, getInstallationToken, buildRepoName } from '@/lib/github';
import { createSupabaseProject as createSupabaseProjectFn, runMigration } from '@/lib/supabase-mgmt';

// ============================================================================
// Supabase Management
// ============================================================================

export const createSupabaseProjectTool = createTool({
  id: 'create-supabase-project',
  description: 'Create a new Supabase project via Management API and wait for ACTIVE_HEALTHY status. Returns project ID, URL, and API keys.',
  inputSchema: z.object({
    name: z.string().describe('Project name (will be sanitized to lowercase alphanumeric + hyphens)'),
    region: z.string().default('us-east-1').describe('AWS region for the project'),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    url: z.string(),
    anonKey: z.string(),
    serviceRoleKey: z.string(),
    dbHost: z.string(),
  }),
  execute: async (inputData, _context) => {
    const project = await createSupabaseProjectFn(inputData.name, inputData.region);
    return {
      projectId: project.id,
      url: project.url,
      anonKey: project.anonKey,
      serviceRoleKey: project.serviceRoleKey,
      dbHost: project.dbHost,
    };
  },
});

export const runMigrationTool = createTool({
  id: 'run-migration',
  description: 'Execute a SQL migration against a Supabase project via the Management API',
  inputSchema: z.object({
    supabaseProjectId: z.string().describe('Supabase project ID'),
    sql: z.string().describe('SQL migration to execute'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    executedAt: z.string(),
  }),
  execute: async (inputData, _context) => {
    return await runMigration(inputData.supabaseProjectId, inputData.sql);
  },
});

// ============================================================================
// GitHub Repository
// ============================================================================

export const createGitHubRepoTool = createTool({
  id: 'create-github-repo',
  description: 'Create a GitHub repository in the VibeStack org via GitHub App',
  inputSchema: z.object({
    appName: z.string().describe('Application name'),
    projectId: z.string().describe('VibeStack project ID'),
  }),
  outputSchema: z.object({
    cloneUrl: z.string(),
    htmlUrl: z.string(),
    repoName: z.string(),
  }),
  execute: async (inputData, _context) => {
    const repoName = buildRepoName(inputData.appName, inputData.projectId);
    const repo = await createRepo(repoName);
    return {
      cloneUrl: repo.cloneUrl,
      htmlUrl: repo.htmlUrl,
      repoName,
    };
  },
});

export const getGitHubTokenTool = createTool({
  id: 'get-github-token',
  description: 'Get a GitHub App installation token for git push authentication',
  inputSchema: z.object({}),
  outputSchema: z.object({
    token: z.string(),
  }),
  execute: async (_inputData, _context) => {
    const token = await getInstallationToken();
    return { token };
  },
});
```

**Step 5: Update barrel exports in `lib/agents/index.ts`**

Add the 4 new tools to the export list:

```typescript
export {
  writeFileTool, readFileTool, listFilesTool, createDirectoryTool,
  runCommandTool, runBuildTool, runLintTool, runTypeCheckTool,
  validateSQLTool, getPreviewUrlTool, createSandboxTool,
  pushToGitHubTool, deployToVercelTool, searchDocsTool,
  createSupabaseProjectTool, runMigrationTool, createGitHubRepoTool, getGitHubTokenTool,
} from './tools';
```

**Step 6: Run type check**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: 0 errors

**Step 7: Commit**

```bash
git add lib/github.ts lib/supabase-mgmt.ts lib/types.ts lib/agents/tools.ts lib/agents/index.ts
git commit -m "feat: add 4 missing infrastructure tools (Supabase, GitHub)"
```

---

### Task 3: Implement Real deployToVercel Tool

The current `deployToVercelTool` is a placeholder returning mock data. The real implementation exists in the deploy route.

**Files:**
- Modify: `lib/agents/tools.ts` (replace `deployToVercelTool.execute`)

**Step 1: Replace placeholder with real implementation**

Replace the `deployToVercelTool` definition with one that uses the existing deploy route's logic pattern. The tool should:
1. Download sandbox files via `downloadDirectory()` from `lib/sandbox.ts`
2. Deploy to Vercel using `@vercel/client`'s `createDeployment()`
3. Return deployment URL and ID

```typescript
import { getSandbox, downloadDirectory } from '@/lib/sandbox';
import { createDeployment } from '@vercel/client';

export const deployToVercelTool = createTool({
  id: 'deploy-to-vercel',
  description: 'Deploy a sandbox project to Vercel by uploading files directly',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    projectName: z.string().describe('Project name for Vercel'),
  }),
  outputSchema: z.object({
    deploymentUrl: z.string(),
    deploymentId: z.string(),
    status: z.string(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId);
    const files = await downloadDirectory(sandbox, '/workspace');

    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) throw new Error('VERCEL_TOKEN is required');

    const deployment = await createDeployment(
      { token: vercelToken },
      {
        name: inputData.projectName,
        files: files.map(f => ({ file: f.path.replace('/workspace/', ''), data: f.content })),
        projectSettings: {
          framework: 'vite',
          buildCommand: 'bun run build',
          outputDirectory: 'dist',
        },
      }
    );

    return {
      deploymentUrl: `https://${deployment.url}`,
      deploymentId: deployment.id,
      status: deployment.readyState ?? 'pending',
    };
  },
});
```

Note: The exact `@vercel/client` API may differ. Check `app/api/projects/deploy/route.ts` for the pattern used. If the Vercel client import doesn't match, adapt to use `fetch` against Vercel API directly. The key point is replacing the mock with real deployment logic.

**Step 2: Verify type check**

Run: `npx tsc --noEmit --skipLibCheck`

**Step 3: Commit**

```bash
git add lib/agents/tools.ts
git commit -m "feat: implement real deployToVercel tool (replaces placeholder)"
```

---

### Task 4: Assign New Tools to Agents

New tools exist but aren't assigned to any agents yet.

**Files:**
- Modify: `lib/agents/registry.ts` (update tool assignments for infraAgent, dbaAgent, devOpsAgent)

**Step 1: Import new tools**

Add to the import block in `lib/agents/registry.ts`:

```typescript
import {
  writeFileTool, readFileTool, listFilesTool, createDirectoryTool,
  runCommandTool, runBuildTool, runLintTool, runTypeCheckTool,
  validateSQLTool, getPreviewUrlTool, createSandboxTool,
  pushToGitHubTool, deployToVercelTool, searchDocsTool,
  createSupabaseProjectTool, runMigrationTool,
  createGitHubRepoTool, getGitHubTokenTool,
} from './tools';
```

**Step 2: Update infraAgent tools**

```typescript
export const infraAgent = new Agent({
  // ... existing config
  tools: {
    createSandbox: createSandboxTool,
    runCommand: runCommandTool,
    getPreviewUrl: getPreviewUrlTool,
    createSupabaseProject: createSupabaseProjectTool,  // NEW
    createGitHubRepo: createGitHubRepoTool,            // NEW
  },
});
```

**Step 3: Update dbaAgent tools**

```typescript
export const dbaAgent = new Agent({
  // ... existing config
  tools: {
    runCommand: runCommandTool,
    writeFile: writeFileTool,
    readFile: readFileTool,
    validateSQL: validateSQLTool,
    searchDocs: searchDocsTool,
    runMigration: runMigrationTool,  // NEW
  },
});
```

**Step 4: Update devOpsAgent tools**

```typescript
export const devOpsAgent = new Agent({
  // ... existing config
  tools: {
    pushToGitHub: pushToGitHubTool,
    deployToVercel: deployToVercelTool,
    runCommand: runCommandTool,
    getGitHubToken: getGitHubTokenTool,  // NEW
  },
});
```

**Step 5: Run type check and tests**

Run: `npx tsc --noEmit --skipLibCheck && npx vitest run tests/agent-registry.test.ts`

**Step 6: Commit**

```bash
git add lib/agents/registry.ts
git commit -m "feat: assign infrastructure tools to infra, dba, and devops agents"
```

---

### Task 5: Rewire builder-chat.tsx to /api/agent

`builder-chat.tsx` calls 3 deleted API routes. The chat flow (`/api/chat`) uses the Vercel AI SDK `useChat` hook which expects a specific protocol. The generation flow (`/api/projects/generate`) uses a raw SSE fetch. Both need to be rewired.

**Files:**
- Modify: `components/builder-chat.tsx:120-252`

**Context:** The old architecture had 2 separate flows:
1. **Chat flow**: `useChat` → `/api/chat` (Vercel AI SDK protocol, tool calls for show_plan)
2. **Generation flow**: `handleStartGeneration` → `/api/projects/generate` (SSE stream)

The new `/api/agent` route is a raw SSE endpoint that bridges Mastra network chunks. It does NOT implement the Vercel AI SDK chat protocol (no `POST /api/chat` compatible response format).

**Design decision:** Keep the two-flow architecture but point generation to `/api/agent`.

**Step 1: Create a thin `/api/chat` route for the useChat hook**

Create: `app/api/chat/route.ts`

This route needs to implement the Vercel AI SDK chat protocol (not Mastra). The chat phase is requirements gathering — the supervisor agent's Analyst sub-agent handles this, but using `useChat` requires AI SDK's `streamText()` format, not Mastra's `.network()`.

For now, the simplest fix is a thin route that calls the Anthropic provider directly (same as the old chat route):

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { getUser } from '@/lib/supabase-server';

export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, projectId, model } = await req.json();

  const result = streamText({
    model: anthropic(model || 'claude-sonnet-4-5-20250929'),
    system: `You are an AI app builder assistant. Help the user describe their app idea, then present a structured plan using the show_plan tool. Be concise and helpful.`,
    messages,
    tools: {
      thinking_steps: {
        description: 'Internal reasoning steps',
        parameters: { type: 'object', properties: { steps: { type: 'array', items: { type: 'string' } } } },
      },
      show_plan: {
        description: 'Present the app plan for user approval',
        parameters: {
          type: 'object',
          properties: {
            appName: { type: 'string' },
            appDescription: { type: 'string' },
            features: { type: 'array', items: { type: 'object' } },
            designTokens: { type: 'object' },
            shadcnComponents: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

**Step 2: Replace `/api/projects/generate` URL with `/api/agent`**

In `components/builder-chat.tsx`, update `handleStartGeneration`:

```typescript
// Line 217: Change endpoint
const response = await fetch("/api/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: chatPlan.appDescription, projectId }),
});
```

**Step 3: Remove the `/api/chat/messages` persistence call**

The messages persistence endpoint doesn't exist. For now, remove the persistence effect (lines 131-143) or make it no-op. Messages are stored in Mastra memory via the agent route.

```typescript
// Replace lines 131-143 with:
// Message persistence handled by Mastra memory (agent route stores via thread/resource)
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit --skipLibCheck`

**Step 5: Commit**

```bash
git add app/api/chat/route.ts components/builder-chat.tsx
git commit -m "fix: rewire builder-chat to /api/agent for generation, create chat route"
```

---

### Task 6: Add Agent Event Handling to builder-chat

The `handleGenerationEvent` function only handles old pipeline events (`file_start`, `file_complete`, `file_error`, `complete`, `error`, `build_error`, `checkpoint`, `layer_commit`). It silently ignores all new agent events (`agent_start`, `agent_progress`, `agent_complete`, `agent_artifact`, `stage_update`, `plan_ready`).

**Files:**
- Modify: `components/builder-chat.tsx:254-304` (`handleGenerationEvent` switch statement)

**Step 1: Add state for agent progress tracking**

Add after the existing state declarations (~line 117):

```typescript
const [activeAgents, setActiveAgents] = useState<
  { id: string; name: string; status: 'running' | 'complete'; message?: string }[]
>([]);
```

**Step 2: Add new cases to handleGenerationEvent**

Add these cases to the switch statement in `handleGenerationEvent`:

```typescript
case "stage_update":
  if (event.stage === "complete") {
    setGenerationStatus("complete");
  } else if (event.stage === "error") {
    setGenerationStatus("error");
  } else {
    setGenerationStatus("generating");
  }
  break;

case "agent_start":
  setActiveAgents((prev) => [
    ...prev.filter((a) => a.id !== event.agentId),
    { id: event.agentId, name: event.agentName, status: "running" as const },
  ]);
  break;

case "agent_progress":
  setActiveAgents((prev) =>
    prev.map((a) =>
      a.id === event.agentId ? { ...a, message: event.message } : a
    )
  );
  break;

case "agent_complete":
  setActiveAgents((prev) =>
    prev.map((a) =>
      a.id === event.agentId ? { ...a, status: "complete" as const } : a
    )
  );
  break;

case "agent_artifact":
  // Could track artifacts per agent — for now just log
  break;

case "plan_ready":
  // Agent-generated plan received — could show approval UI
  break;
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --skipLibCheck`

**Step 4: Commit**

```bash
git add components/builder-chat.tsx
git commit -m "feat: add agent event handling to builder-chat generation flow"
```

---

### Task 7: Clean Remaining Dead Code

Audit found dead functions in `sandbox.ts` and dead types in `types.ts`.

**Files:**
- Modify: `lib/sandbox.ts` (delete `initGeneratedApp`, `waitForServerReady`, `getDevServerLogs`)
- Modify: `lib/types.ts` (delete 11 dead types)

**Step 1: Delete dead sandbox functions**

Delete these functions from `lib/sandbox.ts`:
- `initGeneratedApp()` (~lines 213-258)
- `waitForServerReady()` (~lines 263-291)
- `getDevServerLogs()` (~lines 297-317)

**Step 2: Delete dead types from `lib/types.ts`**

Delete these types (verify each has 0 imports first):
- `RequirementCategory` (line 10-16)
- `Requirement` (line 18-23)
- `FileSpec` (line 25-32)
- `PackageDependencies` (line 58-60)
- `Plan` (line 99-107) — referenced by `Project.plan` but check if Project.plan is used
- `FileStatus` (line 113-118)
- `FileProgress` (line 130-137)
- `GenerationURLs` (line 161-165)
- `GenerationTimestamps` (line 167-175)
- `GenerationState` (line 177-186)
- `EditRequest` (line 226-230)

**Important:** Do NOT delete types that are transitively used. `Plan` is referenced by `Project.plan`, and `Project` is used by dashboard/project pages. Keep `Plan` if it would break the `Project` interface. Alternatively, make `Project.plan` type `Record<string, unknown> | null` instead.

**Step 3: Run type check**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: 0 errors

**Step 4: Commit**

```bash
git add lib/sandbox.ts lib/types.ts
git commit -m "refactor: delete dead sandbox functions and unused types"
```

---

### Task 8: Update Tests for All Changes

**Files:**
- Modify: `tests/agent-registry.test.ts` (update tool count assertions)
- Modify: `tests/agent-tools.test.ts` (add tests for new tools)
- Delete or fix: `e2e/real-generation.spec.ts` (references deleted routes)

**Step 1: Update registry test for new tool assignments**

In `tests/agent-registry.test.ts`, update assertions for:
- infraAgent should have 5 tools (was 3): `createSandbox`, `runCommand`, `getPreviewUrl`, `createSupabaseProject`, `createGitHubRepo`
- dbaAgent should have 6 tools (was 5): + `runMigration`
- devOpsAgent should have 4 tools (was 3): + `getGitHubToken`

Update the `assigns correct tools per agent` test:
```typescript
expect(Object.keys(infraAgent.listTools())).toContain('createSupabaseProject');
expect(Object.keys(infraAgent.listTools())).toContain('createGitHubRepo');
expect(Object.keys(dbaAgent.listTools())).toContain('runMigration');
expect(Object.keys(devOpsAgent.listTools())).toContain('getGitHubToken');
```

**Step 2: Add tool schema tests for new tools**

In `tests/agent-tools.test.ts`, add describe blocks for:
- `createSupabaseProjectTool` — verify inputSchema has `name`, `region`
- `runMigrationTool` — verify inputSchema has `supabaseProjectId`, `sql`
- `createGitHubRepoTool` — verify inputSchema has `appName`, `projectId`
- `getGitHubTokenTool` — verify inputSchema has empty object (no required inputs)

**Step 3: Fix or delete E2E test**

`e2e/real-generation.spec.ts` intercepts `/api/chat` and `/api/projects/generate`. Either:
- Update to intercept `/api/agent` instead, OR
- Delete the test file (it requires real services and the old pipeline flow)

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add tests/ e2e/
git commit -m "test: update tests for new tools and fixed model IDs"
```

---

### Task 9: Full Build Verification

**Files:** None (verification only)

**Step 1: Type check**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: 0 errors

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (should be ~80+ tests)

**Step 3: Lint**

Run: `pnpm lint 2>&1 | grep -E "^[0-9]+ problem" || echo "lint done"`
Expected: No NEW errors (pre-existing component lint issues are OK)

**Step 4: Git log summary**

Run: `git log --oneline feature/mastra-agent-architecture ^main | head -30`

Verify all commits are clean and logical.

---

## Deferred Items (Not In This Plan)

These were identified in the audit but are not blocking and can be addressed later:

1. **searchDocsTool placeholder** — Integrate Context7 MCP when ready
2. **Abort signal on client disconnect** — Requires changes to `lib/sse.ts` createSSEStream utility
3. **36 unhandled Mastra chunk types** — Most are edge cases (approval flows, abort, validation). Add as needed.
4. **Dashboard mock mode guard** — Add `MOCK_MODE` check to skip Supabase query
5. **shadcn manifest injection** — Pass manifest as agent context for better component selection
6. **Missing .env.example** — Create after all tools are finalized
7. **Documentation drift** — Update docs/plans/*.md references (low priority)
