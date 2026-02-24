# V2 Single Orchestrator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the XState multi-stage pipeline with a single Mastra orchestrator agent + Relace Instant Apply, inspired by Lovable's architecture.

**Architecture:** One Mastra agent with a tool belt (sandbox I/O, Relace edit, web search, build) replaces the 6-stage XState state machine. The agent streams via `fullStream`, and a lightweight SSE bridge translates Mastra stream chunks to our custom SSE events. A new Lovable-style scaffold snapshot provides the pre-baked project template.

**Tech Stack:** Mastra Agent (`@mastra/core`), Relace Instant Apply API, Daytona SDK, Hono SSE, Vitest

---

## Context

- **Worktree**: `.worktrees/v2-orchestrator` on branch `feature/v2-single-orchestrator`
- **Design doc**: `docs/plans/2026-02-24-v2-single-orchestrator-design.md`
- **Key files to keep unchanged**: `server/lib/sandbox.ts`, `server/lib/agents/provider.ts`, `server/lib/credits.ts`, `server/lib/sse.ts`, `server/lib/github.ts`, `server/routes/sandbox-urls.ts`

---

### Task 1: Create Relace Instant Apply Client

**Files:**
- Create: `server/lib/relace.ts`
- Test: `tests/relace.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/relace.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyEdit, type RelaceResult } from '@server/lib/relace'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('applyEdit', () => {
  beforeEach(() => {
    vi.stubEnv('RELACE_API_KEY', 'test-key')
    mockFetch.mockReset()
  })

  it('sends correct request and returns merged code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mergedCode: 'const x = 1\nconst y = 2\n',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    })

    const result = await applyEdit({
      initialCode: 'const x = 1\n',
      editSnippet: 'const x = 1\nconst y = 2\n',
    })

    expect(result.mergedCode).toBe('const x = 1\nconst y = 2\n')
    expect(result.usage.total_tokens).toBe(150)

    // Verify request shape
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('https://instantapply.endpoint.relace.run/v1/code/apply')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.model).toBe('relace-apply-3')
    expect(body.initial_code).toBe('const x = 1\n')
    expect(body.edit_snippet).toBe('const x = 1\nconst y = 2\n')
    expect(body.stream).toBe(false)
    expect(opts.headers.Authorization).toBe('Bearer test-key')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    await expect(applyEdit({
      initialCode: 'x',
      editSnippet: 'y',
    })).rejects.toThrow('Relace API error 500')
  })

  it('throws when RELACE_API_KEY is missing', async () => {
    vi.stubEnv('RELACE_API_KEY', '')

    await expect(applyEdit({
      initialCode: 'x',
      editSnippet: 'y',
    })).rejects.toThrow('RELACE_API_KEY')
  })

  it('passes optional instruction', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mergedCode: 'result',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    })

    await applyEdit({
      initialCode: 'code',
      editSnippet: 'edit',
      instruction: 'Make it blue',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.instruction).toBe('Make it blue')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/relace.test.ts`
Expected: FAIL — `@server/lib/relace` does not exist

**Step 3: Write minimal implementation**

```typescript
// server/lib/relace.ts
/**
 * Relace Instant Apply API Client
 *
 * Sends edit snippets (abbreviated code with "// ... keep existing code" markers)
 * to Relace's apply model, which merges them into the full file at ~10k tok/s.
 *
 * API: POST https://instantapply.endpoint.relace.run/v1/code/apply
 * Pricing: ~$0.85/1M input, ~$1.25/1M output (trivial vs frontier model costs)
 */

const RELACE_API_URL = 'https://instantapply.endpoint.relace.run/v1/code/apply'
const RELACE_MODEL = 'relace-apply-3'

export interface RelaceInput {
  initialCode: string
  editSnippet: string
  instruction?: string
}

export interface RelaceUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface RelaceResult {
  mergedCode: string
  usage: RelaceUsage
}

/**
 * Apply an edit snippet to existing code using Relace Instant Apply.
 * The edit snippet can use "// ... keep existing code" markers for brevity.
 */
export async function applyEdit(input: RelaceInput): Promise<RelaceResult> {
  const apiKey = process.env.RELACE_API_KEY
  if (!apiKey) {
    throw new Error('RELACE_API_KEY environment variable is required')
  }

  const body: Record<string, unknown> = {
    model: RELACE_MODEL,
    initial_code: input.initialCode,
    edit_snippet: input.editSnippet,
    stream: false,
  }
  if (input.instruction) {
    body.instruction = input.instruction
  }

  const response = await fetch(RELACE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Relace API error ${response.status}: ${text}`)
  }

  const data = (await response.json()) as {
    mergedCode: string
    usage: RelaceUsage
  }

  return {
    mergedCode: data.mergedCode,
    usage: data.usage,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/relace.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
cd .worktrees/v2-orchestrator
git add server/lib/relace.ts tests/relace.test.ts
git commit -m "feat(v2): add Relace Instant Apply API client"
```

---

### Task 2: Create editFile Tool (Relace-Backed)

**Files:**
- Modify: `server/lib/agents/tools.ts` (add `editFileTool` and `searchWebTool`)
- Test: `tests/v2-tools.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/v2-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock relace module before importing tools
vi.mock('@server/lib/relace', () => ({
  applyEdit: vi.fn(),
}))

// Mock sandbox module
vi.mock('@server/lib/sandbox', () => ({
  getSandbox: vi.fn(),
  createSandbox: vi.fn(),
  getPreviewUrl: vi.fn(),
  buildProxyUrl: vi.fn(),
  downloadDirectory: vi.fn(),
  pushToGitHub: vi.fn(),
}))

// Mock github module
vi.mock('@server/lib/github', () => ({
  buildRepoName: vi.fn(),
  createRepo: vi.fn(),
  getInstallationToken: vi.fn(),
}))

import { applyEdit } from '@server/lib/relace'
import { getSandbox } from '@server/lib/sandbox'

describe('editFileTool', () => {
  beforeEach(() => {
    vi.mocked(getSandbox).mockResolvedValue({
      fs: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('const x = 1\n')),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      },
    } as any)

    vi.mocked(applyEdit).mockResolvedValue({
      mergedCode: 'const x = 1\nconst y = 2\n',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })
  })

  it('reads file, calls Relace, writes merged result', async () => {
    // Import dynamically to pick up mocks
    const { editFileTool } = await import('@server/lib/agents/tools')

    const result = await editFileTool.execute!({
      sandboxId: 'sandbox-1',
      path: 'src/App.tsx',
      editSnippet: 'const x = 1\nconst y = 2\n',
    }, {} as any)

    expect(result.success).toBe(true)
    expect(result.mergedCode).toBe('const x = 1\nconst y = 2\n')
    expect(applyEdit).toHaveBeenCalledWith({
      initialCode: 'const x = 1\n',
      editSnippet: 'const x = 1\nconst y = 2\n',
      instruction: undefined,
    })
  })

  it('returns error when file does not exist', async () => {
    vi.mocked(getSandbox).mockResolvedValue({
      fs: {
        downloadFile: vi.fn().mockRejectedValue(new Error('File not found')),
      },
    } as any)

    const { editFileTool } = await import('@server/lib/agents/tools')
    const result = await editFileTool.execute!({
      sandboxId: 'sandbox-1',
      path: 'nonexistent.ts',
      editSnippet: 'code',
    }, {} as any)

    expect(result.success).toBe(false)
    expect(result.error).toContain('File not found')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/v2-tools.test.ts`
Expected: FAIL — `editFileTool` not exported from tools.ts

**Step 3: Add editFileTool and searchWebTool to tools.ts**

Add these tools at the end of `server/lib/agents/tools.ts`, before the `submitRequirementsTool` section:

```typescript
// ============================================================================
// Relace Edit (V2 Orchestrator)
// ============================================================================

import { applyEdit } from '../relace'

export const editFileTool = createTool({
  id: 'edit-file',
  description: `Edit an existing file in the sandbox using Relace Instant Apply.
Provide a lazy edit snippet — you can use "// ... keep existing code" markers
to abbreviate unchanged sections. Relace merges your snippet into the full file.
This is faster and cheaper than rewriting the entire file.`,
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('File path relative to /workspace'),
    editSnippet: z.string().describe('Edit snippet with "// ... keep existing code" markers for unchanged parts'),
    instruction: z.string().optional().describe('Optional natural language instruction for the merge'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    mergedCode: z.string(),
    relaceTokens: z.number(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const fullPath = sanitizeSandboxPath(inputData.path)

      // Read current file content
      const buffer = await sandbox.fs.downloadFile(fullPath)
      const initialCode = buffer.toString('utf-8')

      // Apply edit via Relace
      const result = await applyEdit({
        initialCode,
        editSnippet: inputData.editSnippet,
        instruction: inputData.instruction,
      })

      // Write merged result back
      await sandbox.fs.uploadFile(Buffer.from(result.mergedCode), fullPath)

      return {
        success: true,
        mergedCode: result.mergedCode,
        relaceTokens: result.usage.total_tokens,
      }
    } catch (e) {
      return {
        success: false,
        mergedCode: '',
        relaceTokens: 0,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

// ============================================================================
// Web Search (V2 Orchestrator)
// ============================================================================

export const searchWebTool = createTool({
  id: 'search-web',
  description: `Search the web for design inspiration, library documentation, or reference UIs.
Use this when building apps in unfamiliar domains to anchor your design to real products.
Examples: "Procore dashboard UI" for construction apps, "Stripe dashboard design" for fintech.`,
  inputSchema: z.object({
    query: z.string().describe('Search query — be specific about what you need'),
  }),
  outputSchema: z.object({
    results: z.string().describe('Search results summary'),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    // V2: Placeholder — will be replaced with actual search API (Brave/Serper/Tavily)
    // For now, returns guidance to use training knowledge
    return {
      results: `Web search for "${inputData.query}" — use your training knowledge to provide design context for this domain. In production, this will call a search API.`,
    }
  },
})

// ============================================================================
// Install Package (V2 Orchestrator)
// ============================================================================

export const installPackageTool = createTool({
  id: 'install-package',
  description: `Install an npm package in the sandbox using bun add.
Use this when you need a library not included in the pre-installed snapshot.
The LLM is free to install any package it needs.`,
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    packages: z.string().describe('Package names to install, space-separated (e.g. "dnd-kit @dnd-kit/core")'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const result = await sandbox.process.executeCommand(
        `bun add ${inputData.packages}`,
        '/workspace',
        undefined,
        60,
      )
      return {
        success: result.exitCode === 0,
        output: result.result,
        error: result.exitCode !== 0 ? result.result : undefined,
      }
    } catch (e) {
      return {
        success: false,
        output: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/v2-tools.test.ts`
Expected: PASS

**Step 5: Run lint**

Run: `cd .worktrees/v2-orchestrator && bun run lint`
Expected: 0 errors

**Step 6: Commit**

```bash
cd .worktrees/v2-orchestrator
git add server/lib/agents/tools.ts tests/v2-tools.test.ts
git commit -m "feat(v2): add editFile (Relace), searchWeb, installPackage tools"
```

---

### Task 3: Create V2 Orchestrator Agent

**Files:**
- Create: `server/lib/agents/v2-orchestrator.ts`
- Test: `tests/v2-orchestrator.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/v2-orchestrator.test.ts
import { describe, it, expect } from 'vitest'
import { createV2Orchestrator, V2_ORCHESTRATOR_TOOLS } from '@server/lib/agents/v2-orchestrator'

describe('createV2Orchestrator', () => {
  it('creates an agent with the correct tool belt', () => {
    const agent = createV2Orchestrator()
    expect(agent.id).toBe('v2-orchestrator')
    expect(agent.name).toBe('V2 Orchestrator')
  })

  it('has all expected tools', () => {
    const toolNames = Object.keys(V2_ORCHESTRATOR_TOOLS)
    expect(toolNames).toContain('createSandbox')
    expect(toolNames).toContain('writeFile')
    expect(toolNames).toContain('writeFiles')
    expect(toolNames).toContain('readFile')
    expect(toolNames).toContain('editFile')
    expect(toolNames).toContain('listFiles')
    expect(toolNames).toContain('runCommand')
    expect(toolNames).toContain('runBuild')
    expect(toolNames).toContain('installPackage')
    expect(toolNames).toContain('searchWeb')
    expect(toolNames).toContain('getPreviewUrl')
  })

  it('system prompt contains key instructions', () => {
    const agent = createV2Orchestrator()
    // instructions is a string on Agent
    const instructions = (agent as any).instructions
    expect(instructions).toContain('world-class app builder')
    expect(instructions).toContain('scaffold')
    expect(instructions).toContain('editFile')
    expect(instructions).toContain('vite build')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/v2-orchestrator.test.ts`
Expected: FAIL — module not found

**Step 3: Write the orchestrator agent**

```typescript
// server/lib/agents/v2-orchestrator.ts
/**
 * V2 Single Orchestrator Agent
 *
 * Replaces the XState pipeline with a single Mastra agent + tool belt.
 * The LLM decides what tools to call based on the user's prompt.
 *
 * Design: Trust the LLM completely. No closed vocabularies, no forbidden lists.
 * Quality gate: `vite build` passes = ship it.
 */

import { Agent } from '@mastra/core/agent'
import { createAgentModelResolver } from './provider'
import {
  createSandboxTool,
  writeFileTool,
  writeFilesTool,
  readFileTool,
  editFileTool,
  listFilesTool,
  runCommandTool,
  runBuildTool,
  installPackageTool,
  searchWebTool,
  getPreviewUrlTool,
  createGitHubRepoTool,
  getGitHubTokenTool,
  pushToGitHubTool,
  deployToVercelTool,
} from './tools'

// Orchestrator uses the user-selected model via provider routing
const orchestratorModel = createAgentModelResolver('orchestrator')

/** Tool belt for the V2 orchestrator — all tools the agent can call */
export const V2_ORCHESTRATOR_TOOLS = {
  createSandbox: createSandboxTool,
  writeFile: writeFileTool,
  writeFiles: writeFilesTool,
  readFile: readFileTool,
  editFile: editFileTool,
  listFiles: listFilesTool,
  runCommand: runCommandTool,
  runBuild: runBuildTool,
  installPackage: installPackageTool,
  searchWeb: searchWebTool,
  getPreviewUrl: getPreviewUrlTool,
  createGitHubRepo: createGitHubRepoTool,
  getGitHubToken: getGitHubTokenTool,
  pushToGitHub: pushToGitHubTool,
  deployToVercel: deployToVercelTool,
}

/** System prompt for the V2 orchestrator */
const ORCHESTRATOR_PROMPT = `You are a world-class app builder. You take a user's description and build a complete, polished web application.

## Your Environment

You work in a sandbox with a pre-baked React project scaffold:
- **Stack**: Vite 8, React 19, Tailwind v4.1, react-router-dom, shadcn/ui
- **Pre-installed**: All 40+ shadcn/ui components, framer-motion, recharts, react-hook-form, zod, date-fns, lucide-react, @tanstack/react-query, sonner, vaul, cmdk
- **TypeScript**: Loose config (strict:false) — focus on working code, not type perfection
- **Quality gate**: \`vite build\` passing is the only requirement

## How You Work

### First Prompt (New App)
1. **Think about design first** — anchor to real products for inspiration. If the domain is unfamiliar, use searchWeb to research.
2. Create a brief mental plan (2-3 sentences about your approach), then start building.
3. Call \`createSandbox\` to provision your workspace.
4. Edit \`src/index.css\` to set the color theme (CSS variables).
5. Create/edit files: pages in \`src/pages/\`, components in \`src/components/\`, hooks in \`src/hooks/\`.
6. Update \`src/App.tsx\` with routes for your pages.
7. Call \`runBuild\` to validate. If it fails, read the errors and fix them.
8. End with a brief summary: "Your [app name] is live! Features: [list]."

### Edit Requests (Existing App)
1. Read the relevant file(s) to understand current state.
2. Use \`editFile\` for modifications (faster + cheaper via Relace Instant Apply).
3. Use \`writeFile\` only for brand-new files.
4. Call \`runBuild\` to validate.
5. End with a one-line summary: "Updated [what changed]."

## Design Principles

- **Anchor to real products**: "Build a construction dashboard" → think Procore (safety orange, slate grays, data-dense cards). "Build a snake game" → think Nokia retro (green LCD, pixel aesthetic).
- **Colors are paramount**: Every app gets a custom color palette via CSS variables in index.css. Never use default gray themes.
- **Mobile-first**: Use responsive Tailwind classes. Test mental model at 375px width.
- **Whitespace and hierarchy**: Use generous spacing. Clear visual hierarchy with size and weight.
- **shadcn/ui first**: Prefer shadcn components (Card, Button, Dialog, etc.) over raw HTML.
- **No placeholder content**: Use realistic data, names, numbers. "John's Construction Co." not "Company Name".

## Tool Usage

- \`createSandbox\`: Always first for new apps. Labels with project metadata.
- \`writeFile\`: Write a complete file. Use for NEW files only.
- \`writeFiles\`: Batch write multiple files at once (more efficient for scaffolding).
- \`editFile\`: Edit existing files via Relace. Use "// ... keep existing code" markers. PREFERRED over writeFile for modifications.
- \`readFile\`: Read before editing. Always check current state.
- \`listFiles\`: Explore what exists in the sandbox.
- \`runCommand\`: Run any shell command (\`bun add\`, \`ls\`, etc.).
- \`runBuild\`: Run \`vite build\`. The quality gate — must pass before you're done.
- \`installPackage\`: \`bun add\` packages not in the snapshot. You are free to install anything.
- \`searchWeb\`: Research design inspiration, library APIs, reference UIs.
- \`getPreviewUrl\`: Get the live preview URL for the sandbox.

## Important Rules

1. **You decide everything** — library choices, architecture, data model, design. Make opinionated decisions.
2. **Never ask clarifying questions for simple requests** — "Build a todo app" needs no clarification. Just build it with good taste.
3. **Only ask for clarification when truly ambiguous** — e.g., "Build an app" (what kind?).
4. **Show packages you install** — when calling installPackage, mention what you're adding and why.
5. **Build loop**: write code → runBuild → if errors, read them, fix, rebuild. Max 3 repair attempts.
6. **File size limit**: Keep individual files under 500 lines. Split into components.
7. **No TODO/FIXME/placeholder comments** — ship complete code.`

/** Create a fresh V2 orchestrator agent instance */
export function createV2Orchestrator(): Agent {
  return new Agent({
    id: 'v2-orchestrator',
    name: 'V2 Orchestrator',
    model: orchestratorModel,
    description: 'Single orchestrator that builds apps from user descriptions',
    instructions: ORCHESTRATOR_PROMPT,
    tools: V2_ORCHESTRATOR_TOOLS,
    defaultOptions: {
      maxSteps: 50,
      modelSettings: { temperature: 0.3 },
    },
  })
}
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/v2-orchestrator.test.ts`
Expected: PASS (all 3 tests)

**Step 5: Run typecheck**

Run: `cd .worktrees/v2-orchestrator && bunx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
cd .worktrees/v2-orchestrator
git add server/lib/agents/v2-orchestrator.ts tests/v2-orchestrator.test.ts
git commit -m "feat(v2): create single orchestrator agent with tool belt"
```

---

### Task 4: Create V2 SSE Stream Types

**Files:**
- Modify: `server/lib/types.ts` (add V2StreamEvent type)

**Step 1: Add V2 stream event types**

Add to the end of `server/lib/types.ts`:

```typescript
// ============================================================================
// V2 Stream Events (Single Orchestrator)
// ============================================================================

export interface V2ThinkingEvent {
  type: 'v2_thinking'
  content: string
}

export interface V2ToolStartEvent {
  type: 'v2_tool_start'
  tool: string
  /** Human-readable label like "Setting up retro LCD theme" */
  label?: string
  args?: Record<string, unknown>
}

export interface V2ToolCompleteEvent {
  type: 'v2_tool_complete'
  tool: string
  success: boolean
  /** Summary of what the tool did */
  result?: string
  durationMs?: number
}

export interface V2DoneEvent {
  type: 'v2_done'
  summary: string
  sandboxId?: string
  tokensUsed?: number
}

export interface V2ErrorEvent {
  type: 'v2_error'
  message: string
}

export interface V2SandboxReadyEvent {
  type: 'v2_sandbox_ready'
  sandboxId: string
}

export interface V2PackageInstalledEvent {
  type: 'v2_package_installed'
  packages: string
}

export type V2StreamEvent =
  | V2ThinkingEvent
  | V2ToolStartEvent
  | V2ToolCompleteEvent
  | V2DoneEvent
  | V2ErrorEvent
  | V2SandboxReadyEvent
  | V2PackageInstalledEvent
  | CreditsUsedEvent
```

**Step 2: Run typecheck**

Run: `cd .worktrees/v2-orchestrator && bunx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
cd .worktrees/v2-orchestrator
git add server/lib/types.ts
git commit -m "feat(v2): add V2StreamEvent types for orchestrator SSE"
```

---

### Task 5: Create V2 Agent Route (SSE Bridge)

This is the core integration — bridges Mastra's `agent.stream()` fullStream to our SSE output.

**Files:**
- Create: `server/routes/v2-agent.ts`
- Test: `tests/v2-agent-route.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/v2-agent-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all external dependencies
vi.mock('@server/lib/agents/v2-orchestrator', () => ({
  createV2Orchestrator: vi.fn(),
}))
vi.mock('@server/lib/agents/provider', () => ({
  createHeliconeProvider: vi.fn(() => vi.fn(() => ({}))),
  isAllowedModel: vi.fn(() => true),
}))
vi.mock('@server/lib/db/queries', () => ({
  getProject: vi.fn(() => ({ id: 'proj-1', userId: 'user-1' })),
  getUserCredits: vi.fn(() => ({ creditsRemaining: 100 })),
  updateProject: vi.fn(),
  insertChatMessage: vi.fn(),
  getProjectGenerationState: vi.fn(),
}))
vi.mock('@server/lib/credits', () => ({
  reserveCredits: vi.fn(() => true),
  settleCredits: vi.fn(() => ({ creditsRemaining: 95 })),
}))

describe('v2-agent route', () => {
  it('module exports v2AgentRoutes as Hono instance', async () => {
    const { v2AgentRoutes } = await import('@server/routes/v2-agent')
    expect(v2AgentRoutes).toBeDefined()
    // Hono instance check — has .post method
    expect(typeof v2AgentRoutes.post).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/v2-agent-route.test.ts`
Expected: FAIL — module not found

**Step 3: Write the V2 agent route**

```typescript
// server/routes/v2-agent.ts
/**
 * POST /api/v2/agent
 * V2 Single Orchestrator SSE endpoint
 *
 * Bridges Mastra agent.stream() fullStream → SSE events.
 * Replaces the XState-based agent.ts route for v2 pipeline.
 *
 * Request: { message: string, projectId: string, model?: string, sandboxId?: string }
 * Response: SSE stream with V2StreamEvent types
 */

import crypto from 'node:crypto'
import { Hono } from 'hono'
import * as Sentry from '@sentry/node'
import { RequestContext } from '@mastra/core/di'
import { createV2Orchestrator } from '../lib/agents/v2-orchestrator'
import { createHeliconeProvider, isAllowedModel } from '../lib/agents/provider'
import {
  getProject,
  getUserCredits,
  updateProject,
  insertChatMessage,
} from '../lib/db/queries'
import { reserveCredits, settleCredits } from '../lib/credits'
import { createSSEStream } from '../lib/sse'
import type { V2StreamEvent, CreditsUsedEvent } from '../lib/types'
import { authMiddleware } from '../middleware/auth'
import { log } from '../lib/logger'

export const v2AgentRoutes = new Hono()

// Auth middleware on all routes
v2AgentRoutes.use('*', authMiddleware)

/**
 * Bridge Mastra agent.stream() fullStream chunks to our V2 SSE events.
 *
 * Mastra fullStream chunk types:
 * - text-delta: LLM thinking text → V2ThinkingEvent
 * - tool-call: Tool invocation started → V2ToolStartEvent
 * - tool-result: Tool execution completed → V2ToolCompleteEvent
 * - step-finish: Agent step completed (may have multiple per generation)
 * - finish: Final chunk → triggers V2DoneEvent
 */
async function bridgeStreamToSSE(
  // biome-ignore lint/suspicious/noExplicitAny: Mastra stream types are complex generics
  streamOutput: any,
  emit: (event: V2StreamEvent | CreditsUsedEvent) => void,
  signal: AbortSignal,
  meta: { projectId: string; userId: string; runId: string },
): Promise<{ totalTokens: number; sandboxId?: string }> {
  let totalTokens = 0
  let sandboxId: string | undefined
  let lastTextChunk = ''
  const toolStartTimes = new Map<string, number>()

  const reader = streamOutput.fullStream.getReader()

  try {
    while (true) {
      if (signal.aborted) break

      const { done, value: chunk } = await reader.read()
      if (done) break

      if (!chunk || !chunk.type) continue

      switch (chunk.type) {
        case 'text-delta': {
          const text = chunk.payload?.textDelta ?? chunk.payload?.text ?? ''
          if (text) {
            lastTextChunk += text
            // Emit thinking in batches (every ~100 chars) to reduce event frequency
            if (lastTextChunk.length > 100) {
              emit({ type: 'v2_thinking', content: lastTextChunk })
              // Fire-and-forget persistence
              insertChatMessage(
                `thinking-${meta.runId}-${Date.now()}`,
                meta.projectId,
                'assistant',
                [{ text: lastTextChunk }],
                'thinking',
              ).catch(() => {})
              lastTextChunk = ''
            }
          }
          break
        }

        case 'tool-call': {
          const toolName = chunk.payload?.toolName ?? 'unknown'
          const args = chunk.payload?.args ?? {}
          toolStartTimes.set(toolName + '-' + (chunk.payload?.toolCallId ?? ''), Date.now())

          // Generate human-readable label
          let label: string | undefined
          if (toolName === 'writeFile' || toolName === 'editFile') {
            label = `Editing ${args.path ?? 'file'}`
          } else if (toolName === 'createSandbox') {
            label = 'Provisioning sandbox'
          } else if (toolName === 'runBuild') {
            label = 'Building app'
          } else if (toolName === 'installPackage') {
            label = `Installing ${args.packages ?? 'packages'}`
          } else if (toolName === 'searchWeb') {
            label = `Searching: ${args.query ?? ''}`
          }

          emit({ type: 'v2_tool_start', tool: toolName, label, args })
          break
        }

        case 'tool-result': {
          const toolName = chunk.payload?.toolName ?? 'unknown'
          const result = chunk.payload?.result
          const toolCallId = chunk.payload?.toolCallId ?? ''
          const startTime = toolStartTimes.get(toolName + '-' + toolCallId)
          const durationMs = startTime ? Date.now() - startTime : undefined

          // Check if tool succeeded
          const success = result?.success !== false && result?.exitCode !== 1
          let resultSummary: string | undefined

          // Detect sandboxId from createSandbox result
          if (toolName === 'createSandbox' && result?.sandboxId) {
            sandboxId = result.sandboxId
            emit({ type: 'v2_sandbox_ready', sandboxId })
            // Update project with sandboxId
            updateProject(meta.projectId, { sandboxId }, meta.userId).catch(() => {})
          }

          // Detect package installs
          if (toolName === 'installPackage' && result?.success) {
            emit({ type: 'v2_package_installed', packages: result.output ?? '' })
          }

          // Build result summary
          if (toolName === 'runBuild') {
            resultSummary = success ? 'Build passed' : `Build failed: ${result?.output?.slice(0, 200) ?? ''}`
          } else if (toolName === 'writeFile' || toolName === 'editFile') {
            resultSummary = `${result?.path ?? 'file'} updated`
          }

          emit({
            type: 'v2_tool_complete',
            tool: toolName,
            success,
            result: resultSummary,
            durationMs,
          })
          break
        }

        case 'step-finish': {
          // Accumulate token usage from each step
          const usage = chunk.payload?.usage
          if (usage) {
            totalTokens += usage.totalTokens ?? 0
          }
          break
        }

        case 'finish': {
          // Flush any remaining text
          if (lastTextChunk) {
            emit({ type: 'v2_thinking', content: lastTextChunk })
            lastTextChunk = ''
          }
          break
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  // Get final usage from stream output
  try {
    const usage = await streamOutput.usage
    if (usage?.totalTokens) {
      totalTokens = usage.totalTokens
    }
  } catch {
    // Usage may not be available if stream was aborted
  }

  // Get final text as summary
  let summary = 'App built successfully.'
  try {
    const text = await streamOutput.text
    if (text) {
      // Extract last sentence as summary
      const sentences = text.split(/[.!]\s/)
      summary = sentences[sentences.length - 1]?.trim() || summary
    }
  } catch {
    // Text may not be available
  }

  emit({
    type: 'v2_done',
    summary,
    sandboxId,
    tokensUsed: totalTokens,
  })

  return { totalTokens, sandboxId }
}

/**
 * POST /api/v2/agent
 * Stream orchestrator execution via SSE
 */
v2AgentRoutes.post('/', async (c) => {
  const agentLog = log.child({ module: 'v2-agent' })

  let body: {
    message?: string
    projectId?: string
    model?: string
    sandboxId?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { message, projectId, model = 'gpt-5.2-codex', sandboxId } = body
  agentLog.info(`V2 generation: project=${projectId} model=${model}`, { projectId, model })

  if (!message || !projectId) {
    return c.json({ error: 'Missing message or projectId' }, 400)
  }

  if (!isAllowedModel(model)) {
    return c.json({ error: `Model "${model}" is not available` }, 400)
  }

  const user = c.var.user

  // Verify project ownership
  const project = await getProject(projectId, user.id)
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // Credit reservation
  const CREDIT_RESERVATION = 50
  const reserved = await reserveCredits(user.id, CREDIT_RESERVATION)
  if (!reserved) {
    const credits = await getUserCredits(user.id)
    return c.json({
      error: 'insufficient_credits',
      message: 'Not enough credits to start generation',
      credits_remaining: credits?.creditsRemaining ?? 0,
    }, 402)
  }

  const runId = crypto.randomUUID()

  // Set up Mastra request context for model routing + Helicone
  const requestContext = new RequestContext()
  requestContext.set('selectedModel', model)
  requestContext.set('heliconeContext', {
    userId: user.id,
    projectId,
    sessionId: `${projectId}:${Date.now()}`,
    agentName: 'v2-orchestrator',
  })

  return createSSEStream(async (emit: (event: V2StreamEvent | CreditsUsedEvent) => void, signal: AbortSignal) => {
    let settled = false

    try {
      // Persist user message
      insertChatMessage(`user-${runId}`, projectId, 'user', [{ text: message }]).catch(() => {})

      // Build the user message with context
      let fullMessage = message
      if (sandboxId) {
        fullMessage = `[Existing sandbox: ${sandboxId}]\n\n${message}`
      }

      // Create agent and stream
      const agent = createV2Orchestrator()
      const streamOutput = await agent.stream(fullMessage, {
        requestContext,
        maxSteps: 50,
      })

      // Bridge Mastra stream to SSE
      const result = await bridgeStreamToSSE(streamOutput, emit, signal, {
        projectId,
        userId: user.id,
        runId,
      })

      // Update project status
      updateProject(projectId, {
        status: 'complete',
        sandboxId: result.sandboxId,
      }, user.id).catch(() => {})

      // Persist assistant message
      insertChatMessage(
        `assistant-${runId}`,
        projectId,
        'assistant',
        [{ text: `Generation complete. Tokens: ${result.totalTokens}` }],
      ).catch(() => {})

      // Settle credits
      const creditsUsed = Math.ceil(result.totalTokens / 1000)
      const settlement = await settleCredits(user.id, CREDIT_RESERVATION, creditsUsed)
      settled = true

      emit({
        type: 'credits_used',
        creditsUsed,
        creditsRemaining: settlement.creditsRemaining,
        tokensTotal: result.totalTokens,
      })
    } catch (error) {
      if (signal.aborted) {
        agentLog.info('V2 stream aborted by client', { projectId, runId })
        if (!settled) {
          await settleCredits(user.id, CREDIT_RESERVATION, 0)
          settled = true
        }
        return
      }

      if (!settled) {
        await settleCredits(user.id, CREDIT_RESERVATION, 0)
        settled = true
      }

      Sentry.captureException(error, {
        tags: { route: '/api/v2/agent' },
        extra: { projectId, model, userId: user.id },
      })

      emit({
        type: 'v2_error',
        message: error instanceof Error ? error.message : 'Generation failed',
      })
    }
  })
})
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/v2-orchestrator && bun run test -- tests/v2-agent-route.test.ts`
Expected: PASS

**Step 5: Run typecheck**

Run: `cd .worktrees/v2-orchestrator && bunx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
cd .worktrees/v2-orchestrator
git add server/routes/v2-agent.ts tests/v2-agent-route.test.ts
git commit -m "feat(v2): create SSE route bridging Mastra stream to V2 events"
```

---

### Task 6: Mount V2 Routes in Server

**Files:**
- Modify: `server/index.ts`

**Step 1: Read current server/index.ts**

Read: `server/index.ts`

**Step 2: Add v2 route import and mount**

Add to imports section:
```typescript
import { v2AgentRoutes } from './routes/v2-agent'
```

Add to route mounting section (alongside existing routes):
```typescript
app.route('/api/v2/agent', v2AgentRoutes)
```

**Step 3: Run typecheck**

Run: `cd .worktrees/v2-orchestrator && bunx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
cd .worktrees/v2-orchestrator
git add server/index.ts
git commit -m "feat(v2): mount /api/v2/agent route"
```

---

### Task 7: Create V2 Snapshot Scaffold

**Files:**
- Create: `snapshot-v2/` directory with Lovable-style scaffold
- Key files: `package-base.json`, `scaffold/` directory with pre-baked files

This task creates the scaffold that will be baked into a Daytona snapshot image. It matches Lovable's structure but with modern deps (Vite 8, React 19, Tailwind v4.1).

**Step 1: Create scaffold directory structure**

```bash
cd .worktrees/v2-orchestrator
mkdir -p snapshot-v2/scaffold/src/{components/ui,pages,hooks,lib,test}
mkdir -p snapshot-v2/scaffold/public
```

**Step 2: Create package.json with all deps pre-installed**

Create `snapshot-v2/scaffold/package.json`:

```json
{
  "name": "vibestack-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host --port 3000",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.2.0",
    "@tanstack/react-query": "^5.62.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.0",
    "lucide-react": "^0.469.0",
    "date-fns": "^4.1.0",
    "recharts": "^2.15.0",
    "react-hook-form": "^7.54.0",
    "zod": "^3.24.0",
    "@hookform/resolvers": "^5.0.0",
    "framer-motion": "^12.0.0",
    "sonner": "^2.0.0",
    "vaul": "^1.1.0",
    "cmdk": "^1.0.0",
    "embla-carousel-react": "^8.5.0",
    "input-otp": "^1.4.0",
    "react-day-picker": "^9.5.0",
    "react-resizable-panels": "^2.1.0",
    "next-themes": "^0.4.0",
    "@radix-ui/react-accordion": "^1.2.0",
    "@radix-ui/react-alert-dialog": "^1.1.0",
    "@radix-ui/react-aspect-ratio": "^1.1.0",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-checkbox": "^1.1.0",
    "@radix-ui/react-collapsible": "^1.1.0",
    "@radix-ui/react-context-menu": "^2.2.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-hover-card": "^1.1.0",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-menubar": "^1.1.0",
    "@radix-ui/react-navigation-menu": "^1.2.0",
    "@radix-ui/react-popover": "^1.1.0",
    "@radix-ui/react-progress": "^1.1.0",
    "@radix-ui/react-radio-group": "^1.2.0",
    "@radix-ui/react-scroll-area": "^1.2.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-slider": "^1.2.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.0",
    "@radix-ui/react-toggle": "^1.1.0",
    "@radix-ui/react-toggle-group": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react-swc": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

**Step 3: Create core scaffold files**

Create `snapshot-v2/scaffold/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": false,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "strictNullChecks": false,
    "allowJs": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

Create `snapshot-v2/scaffold/vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
})
```

Create `snapshot-v2/scaffold/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `snapshot-v2/scaffold/src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(<App />)
```

Create `snapshot-v2/scaffold/src/App.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import Index from './pages/Index'
import NotFound from './pages/NotFound'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
```

Create `snapshot-v2/scaffold/src/index.css`:
```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
  --sidebar-background: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.145 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.396 0.141 25.723);
  --destructive-foreground: oklch(0.637 0.237 25.331);
  --border: oklch(0.269 0 0);
  --input: oklch(0.269 0 0);
  --ring: oklch(0.439 0 0);
  --sidebar-background: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(0.269 0 0);
  --sidebar-ring: oklch(0.439 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

Create `snapshot-v2/scaffold/src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Create `snapshot-v2/scaffold/src/pages/Index.tsx`:
```tsx
const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-4xl font-bold">Welcome</h1>
    </div>
  )
}

export default Index
```

Create `snapshot-v2/scaffold/src/pages/NotFound.tsx`:
```tsx
import { Link } from 'react-router-dom'

const NotFound = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="text-primary hover:underline">
        Go home
      </Link>
    </div>
  )
}

export default NotFound
```

Create `snapshot-v2/scaffold/src/hooks/use-mobile.tsx`:
```tsx
import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
```

Create `snapshot-v2/scaffold/src/hooks/use-toast.ts`:
```typescript
import { toast } from 'sonner'
export { toast }
export const useToast = () => ({ toast })
```

Create `snapshot-v2/scaffold/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

Create `snapshot-v2/scaffold/components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Step 4: Note on shadcn/ui components**

The `src/components/ui/` directory needs ALL shadcn/ui components pre-installed. This should be done by running `bunx shadcn@latest add --all` inside the scaffold directory during snapshot build. The Dockerfile handles this — see Task 8.

**Step 5: Commit scaffold**

```bash
cd .worktrees/v2-orchestrator
git add snapshot-v2/
git commit -m "feat(v2): create Lovable-style scaffold snapshot"
```

---

### Task 8: Create V2 Snapshot Dockerfile

**Files:**
- Create: `snapshot-v2/Dockerfile`
- Create: `snapshot-v2/entrypoint.sh`

**Step 1: Create Dockerfile**

```dockerfile
# snapshot-v2/Dockerfile
# Lovable-style scaffold: all deps pre-installed, caches warmed
FROM oven/bun:1-debian

WORKDIR /workspace

# Install system deps for canvas/sharp if needed
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

# Copy scaffold files
COPY scaffold/ /workspace/

# Install all dependencies
RUN bun install --frozen-lockfile || bun install

# Install ALL shadcn/ui components
RUN bunx --bun shadcn@latest add --all --yes --overwrite

# Warm Vite cache by running a dev build
RUN timeout 30 bun run dev &>/dev/null & sleep 10 && kill %1 2>/dev/null || true

# Warm TypeScript cache
RUN bunx tsc --noEmit 2>/dev/null || true

# Initialize git repo (LLM commits into this)
RUN git init && git add -A && git commit -m "scaffold: vibestack-v2-template"

# Set up entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000 13337

ENTRYPOINT ["/entrypoint.sh"]
```

**Step 2: Create entrypoint**

```bash
#!/bin/bash
# snapshot-v2/entrypoint.sh
# Start dev server in background
cd /workspace
bun run dev &

# Keep container running
exec sleep infinity
```

**Step 3: Commit**

```bash
cd .worktrees/v2-orchestrator
git add snapshot-v2/Dockerfile snapshot-v2/entrypoint.sh
git commit -m "feat(v2): add Dockerfile and entrypoint for snapshot build"
```

---

### Task 9: Add RELACE_API_KEY to Environment Config

**Files:**
- Modify: `CLAUDE.md` — add `RELACE_API_KEY` to env vars table
- Modify: `server/routes/admin.ts` — add to health check (if env check exists)

**Step 1: Update CLAUDE.md environment variables table**

Add to the Environment Variables table:
```
| `RELACE_API_KEY` | Relace Instant Apply API key |
```

**Step 2: Commit**

```bash
cd .worktrees/v2-orchestrator
git add CLAUDE.md
git commit -m "docs: add RELACE_API_KEY to environment variables"
```

---

### Task 10: Integration Test — V2 Agent E2E

**Files:**
- Create: `tests/v2-integration.test.ts`

Write an integration test that verifies the full V2 flow with mocked externals.

**Step 1: Write integration test**

```typescript
// tests/v2-integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// This test verifies that all V2 pieces connect correctly:
// 1. v2-orchestrator agent is created with correct tools
// 2. V2StreamEvent types are valid
// 3. Relace client has correct API shape
// 4. Route module exports correctly

describe('V2 Integration', () => {
  it('orchestrator agent has all required tools', async () => {
    const { V2_ORCHESTRATOR_TOOLS } = await import('@server/lib/agents/v2-orchestrator')
    const toolNames = Object.keys(V2_ORCHESTRATOR_TOOLS)

    // Must have sandbox tools
    expect(toolNames).toContain('createSandbox')
    expect(toolNames).toContain('writeFile')
    expect(toolNames).toContain('readFile')
    expect(toolNames).toContain('editFile')
    expect(toolNames).toContain('runBuild')

    // Must have v2-specific tools
    expect(toolNames).toContain('installPackage')
    expect(toolNames).toContain('searchWeb')

    // Must have deployment tools
    expect(toolNames).toContain('deployToVercel')
    expect(toolNames).toContain('pushToGitHub')
  })

  it('relace client exports expected functions', async () => {
    const relace = await import('@server/lib/relace')
    expect(typeof relace.applyEdit).toBe('function')
  })

  it('V2StreamEvent types are importable', async () => {
    // Just verify the module compiles and exports the types
    const types = await import('@server/lib/types')
    // V2StreamEvent is a type, can't check at runtime,
    // but we can verify related exports exist
    expect(types).toBeDefined()
  })
})
```

**Step 2: Run all tests**

Run: `cd .worktrees/v2-orchestrator && bun run test`
Expected: All tests pass

**Step 3: Run full checks**

```bash
cd .worktrees/v2-orchestrator
bunx tsc --noEmit
bun run lint
bun run test
```

**Step 4: Commit**

```bash
cd .worktrees/v2-orchestrator
git add tests/v2-integration.test.ts
git commit -m "test(v2): add integration test for V2 orchestrator pipeline"
```

---

### Task 11: Final Verification

**Step 1: Run full verification suite**

```bash
cd .worktrees/v2-orchestrator
bunx tsc --noEmit   # Typecheck
bun run lint         # Lint
bun run test         # All tests
```

All three must pass with 0 errors.

**Step 2: Verify git log**

```bash
cd .worktrees/v2-orchestrator
git log --oneline -15
```

Expected: Clean commit history with all V2 tasks.

**Step 3: Verify no regressions to existing v1 code**

The V2 pipeline is additive — all existing v1 code remains functional. The new code is:
- `server/lib/relace.ts` (new)
- `server/lib/agents/v2-orchestrator.ts` (new)
- `server/routes/v2-agent.ts` (new)
- `server/lib/agents/tools.ts` (extended with 3 new tools)
- `server/lib/types.ts` (extended with V2StreamEvent)
- `server/index.ts` (one new route mount)
- `snapshot-v2/` (new directory)
- `tests/relace.test.ts`, `tests/v2-tools.test.ts`, `tests/v2-orchestrator.test.ts`, `tests/v2-agent-route.test.ts`, `tests/v2-integration.test.ts` (new tests)

No existing files are deleted in this implementation — deletion of old pipeline happens in a separate cleanup task after V2 is validated in production.

---

## Future Tasks (Not in This Plan)

These are deferred for after V2 is validated:

1. **Web search implementation** — Replace placeholder `searchWebTool` with actual search API (Brave/Serper/Tavily)
2. **Client-side V2 integration** — Update `builder-chat.tsx` to consume V2StreamEvent types
3. **V1 pipeline cleanup** — Delete machine.ts, edit-machine.ts, orchestrator.ts, creative-director.ts, page-generator.ts, deterministic-assembly.ts, schemas.ts, etc.
4. **Snapshot Docker build** — Build and publish the `snapshot-v2` image to Daytona
5. **DAYTONA_V2_SNAPSHOT_ID** — Add new env var pointing to the V2 snapshot
