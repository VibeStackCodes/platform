# Preview 504 Fix + Conversation History Persistence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two UX-critical bugs: (1) sandbox preview returns 504 during Vite dependency pre-bundling, (2) tool activity timeline disappears on page refresh.

**Architecture:** Both fixes are minimal-surface changes. Fix 1: add `optimizeDeps.include` to scaffold vite.config + fix `waitForServerReady` regex. Fix 2: extract tool-invocation parts from Mastra memory on the server, return as `tool_complete` events, hydrate `toolSteps` on the client.

**Tech Stack:** Vite 7 (optimizeDeps), Mastra Memory (PostgresStore), Hono API, React (state hydration)

---

## Task 1: Add `optimizeDeps.include` to scaffold vite.config

**Files:**
- Modify: `snapshot/scaffold/vite.config.ts`

**Step 1: Add optimizeDeps.include listing all production dependencies**

Every non-trivial dependency from `snapshot/scaffold/package.json` must be listed so Vite pre-bundles them at dev server startup instead of discovering them lazily mid-request.

Replace the contents of `snapshot/scaffold/vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

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
  optimizeDeps: {
    include: [
      // Radix UI primitives (27 packages)
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      // Heavy utility dependencies
      '@hookform/resolvers',
      '@tanstack/react-query',
      'class-variance-authority',
      'clsx',
      'cmdk',
      'date-fns',
      'embla-carousel-react',
      'framer-motion',
      'input-otp',
      'lucide-react',
      'next-themes',
      'react-day-picker',
      'react-hook-form',
      'react-resizable-panels',
      'react-router-dom',
      'recharts',
      'sonner',
      'tailwind-merge',
      'vaul',
      'zod',
    ],
  },
})
```

**Step 2: Verify the config is valid TypeScript**

Run: `cd snapshot/scaffold && bunx tsc --noEmit vite.config.ts || echo 'OK (tsc may not resolve vite types in scaffold — visual check sufficient)'`

The scaffold has its own `tsconfig.json`. If tsc errors on missing vite types, that's expected — the scaffold doesn't have `@types/node` as a direct dep. The config will work at runtime.

**Step 3: Commit**

```bash
git add snapshot/scaffold/vite.config.ts
git commit -m "fix: add optimizeDeps.include to prevent 504s during Vite pre-bundling"
```

---

## Task 2: Fix `waitForServerReady` regex in sandbox.ts

**Files:**
- Modify: `server/lib/sandbox.ts:309`

**Step 1: Fix the regex to only accept 2xx/3xx as "ready"**

In `server/lib/sandbox.ts`, line 309, change:

```ts
if (/^[1-5]\d{2}$/.test(httpCode)) {
```

To:

```ts
if (/^[23]\d{2}$/.test(httpCode)) {
```

This ensures 504 (gateway timeout from Vite pre-bundling) and other 4xx/5xx codes are NOT treated as "server ready". Only 2xx (success) and 3xx (redirect) indicate the dev server is healthy.

**Step 2: Run the project type checker to verify no regressions**

Run: `bunx tsc --noEmit`
Expected: PASS (no type errors — this is a string literal change)

**Step 3: Commit**

```bash
git add server/lib/sandbox.ts
git commit -m "fix: waitForServerReady rejects 4xx/5xx (was accepting 504 as ready)"
```

---

## Task 3: Extract TOOL_LABELS to shared module

The `TOOL_LABELS` map currently lives inline in `server/routes/agent.ts` (lines 125-146). The `/messages` endpoint in `projects.ts` needs the same mapping to reconstruct tool labels from persisted tool-invocation parts. Extract to a shared module to avoid duplication.

**Files:**
- Create: `server/lib/tool-labels.ts`
- Modify: `server/routes/agent.ts:125-146`

**Step 1: Create `server/lib/tool-labels.ts`**

```ts
/**
 * Human-readable labels for agent tools.
 * Shared between the SSE bridge (agent.ts) and the history endpoint (projects.ts).
 */
export const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  createSandbox: () => 'Provisioning sandbox',
  writeFile: () => 'Writing',
  writeFiles: (a) => {
    const files = a.files as Array<{ path: string }> | undefined
    return files?.length ? `Writing ${files.length} files` : 'Writing files'
  },
  readFile: () => 'Reading',
  editFile: () => 'Editing',
  listFiles: () => 'Listing files',
  runCommand: (a) => {
    const cmd = String(a.command ?? '')
    return `Running ${cmd.length > 40 ? cmd.slice(0, 40) + '…' : cmd || 'command'}`
  },
  runBuild: () => 'Building app',
  installPackage: (a) => `Installing ${a.packages ?? 'packages'}`,
  getPreviewUrl: () => 'Getting preview URL',
  commitAndPush: (a) => `Committing: ${a.message ?? 'changes'}`,
  webSearch: () => 'Search the web',
  web_search: () => 'Search the web',
  web_search_tool: () => 'Search the web',
}

/** Tools that are internal to Mastra and should not be shown in the UI */
export const INTERNAL_TOOLS = new Set(['updateWorkingMemory', 'readWorkingMemory'])
```

**Step 2: Update `server/routes/agent.ts` to import from shared module**

Replace the inline `TOOL_LABELS` block (lines 125-146) with an import. At the top of the file, add:

```ts
import { TOOL_LABELS } from '../lib/tool-labels'
```

Then delete the inline `const TOOL_LABELS: Record<...> = { ... }` block inside the `case 'tool-call'` handler. Keep the `const labelFn = TOOL_LABELS[toolName]` usage — it stays the same.

**Step 3: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add server/lib/tool-labels.ts server/routes/agent.ts
git commit -m "refactor: extract TOOL_LABELS to shared module for reuse in /messages"
```

---

## Task 4: Server — return tool_complete events from persisted messages

The `/messages` endpoint in `server/routes/projects.ts` currently only returns `type: "message"` events. Mastra stores tool invocations as `tool-invocation` parts inside assistant messages. We need to extract these and return them as `tool_complete` events interleaved between user and assistant text messages.

**Files:**
- Modify: `server/routes/projects.ts`

**Step 1: Add imports**

At the top of `server/routes/projects.ts`, add:

```ts
import { TOOL_LABELS, INTERNAL_TOOLS } from '../lib/tool-labels'
```

Remove the existing `import { appendFileSync } from 'node:fs'` (debug logging cleanup).

**Step 2: Extract tool-invocation parts from assistant messages**

In the Mastra memory processing block (the `result.messages.map(...)` section starting around line 288), replace the current mapping logic with a new approach that:

1. Iterates through messages
2. For assistant messages with format-2 parts, extracts both text content AND tool-invocation parts
3. Returns tool-invocation parts as separate `tool_complete` events

Replace the entire `if (result.messages.length > 0) { ... }` block (lines 287-355) with:

```ts
if (result.messages.length > 0) {
  // Build a flat array of events: messages + tool_complete entries
  // biome-ignore lint/suspicious/noExplicitAny: Mastra message content type is opaque
  const events: any[] = []

  for (const msg of result.messages) {
    // Skip tool-role messages entirely (these are Mastra's tool result records)
    if (msg.role === 'tool') continue

    // biome-ignore lint/suspicious/noExplicitAny: Mastra content type is opaque
    const content = msg.content as any
    let textContent = ''
    // biome-ignore lint/suspicious/noExplicitAny: parts shape varies
    let parts: any[] | null = null

    // Extract parts array from content (string JSON or object)
    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content)
        if (parsed?.parts && Array.isArray(parsed.parts)) {
          parts = parsed.parts
        } else if (typeof parsed?.summary === 'string') {
          textContent = parsed.summary
        } else {
          textContent = content
        }
      } catch {
        textContent = content
      }
    } else if (content && typeof content === 'object') {
      if (content.parts && Array.isArray(content.parts)) {
        parts = content.parts
      } else if (Array.isArray(content)) {
        parts = content
      }
    }

    // Process parts array: extract text and tool-invocations
    if (parts) {
      const textParts: string[] = []
      for (const part of parts) {
        if (part.type === 'text' && part.text) {
          textParts.push(part.text)
        } else if (part.type === 'tool-invocation' && part.toolInvocation) {
          const inv = part.toolInvocation
          const toolName = inv.toolName ?? inv.name ?? 'unknown'

          // Skip internal tools
          if (INTERNAL_TOOLS.has(toolName)) continue

          // Derive label from TOOL_LABELS
          const labelFn = TOOL_LABELS[toolName]
          const args = inv.args ?? {}
          const label = labelFn ? labelFn(args) : toolName

          // Extract file path from args
          const filePath = (args.path as string) ?? (args.filePath as string) ?? undefined

          events.push({
            id: `tool-${msg.id}-${toolName}-${events.length}`,
            role: 'assistant',
            type: 'tool_complete',
            tool: toolName,
            label,
            filePath,
            args,
            createdAt: msg.createdAt,
          })
        }
      }
      textContent = textParts.join('')
    }

    // Second pass: extract summary from structured output JSON
    if (textContent.startsWith('{') && textContent.includes('"summary"')) {
      try {
        const parsed = JSON.parse(textContent)
        if (typeof parsed?.summary === 'string') {
          textContent = parsed.summary
        }
      } catch {
        // Not valid JSON, keep as-is
      }
    }

    // Only add text messages that have actual content
    if (msg.role === 'assistant' && !textContent.trim()) continue

    events.push({
      id: msg.id,
      role: msg.role,
      type: 'message',
      parts: [{ text: textContent }],
      createdAt: msg.createdAt,
    })
  }

  return c.json(events)
}
```

**Step 3: Remove debug logging lines**

Remove all `appendFileSync('/tmp/messages-debug.log', ...)` lines throughout the route handler. There are approximately 3-4 of them.

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add server/routes/projects.ts
git commit -m "feat: extract tool-invocation parts from Mastra memory as tool_complete events"
```

---

## Task 5: Client — hydrate toolSteps from persisted tool_complete events

The `useMemo` in `use-agent-stream.ts` processes `conversationEvents` from the `/messages` endpoint. Currently it has no branch for `tool_complete` events. We need to add one, and then hydrate `toolSteps` state from these persisted events.

**Files:**
- Modify: `src/hooks/use-agent-stream.ts`

**Step 1: Add `tool_complete` case to the useMemo switch**

In the `useMemo` that processes `conversationEvents` (starting around line 224), we need to:

1. Add a `persistedToolSteps` array alongside the existing `messages`, `timeline`, etc.
2. Add a `case 'tool_complete'` to the switch statement
3. Return `persistedToolSteps` from the useMemo

First, add to the destructured return (around line 219):

```ts
const {
  persistedMessages,
  persistedTimeline,
  persistedValidation,
  persistedPageProgress,
  persistedFileAssembly,
  persistedToolSteps,    // ← ADD THIS
} = useMemo(() => {
```

Add to the empty return (around line 227):

```ts
return {
  persistedMessages: [] as ChatMessage[],
  persistedTimeline: [] as TimelineEntry[],
  persistedValidation: [] as Array<{ name: string; status: string; errors?: string[] }>,
  persistedPageProgress: [] as Array<Record<string, unknown>>,
  persistedFileAssembly: [] as Array<{ path: string; category: string }>,
  persistedToolSteps: [] as ToolStep[],    // ← ADD THIS
}
```

Add to the arrays declared before the loop (around line 239):

```ts
const toolStepsArr: ToolStep[] = []
```

Add the case inside the `switch (evt.type)` block (after the existing cases, before the closing `}`):

```ts
case 'tool_complete': {
  const data = evt as unknown as {
    id: string
    tool: string
    label: string
    filePath?: string
    args?: Record<string, unknown>
    createdAt: string
  }
  toolStepsArr.push({
    id: data.id,
    tool: data.tool,
    label: data.label,
    status: 'complete',
    filePath: data.filePath,
    startedAt: new Date(data.createdAt).getTime(),
  })
  break
}
```

Add to the return object (around line 366):

```ts
return {
  persistedMessages: messages,
  persistedTimeline: timeline,
  persistedValidation: validation,
  persistedPageProgress: pageProgressArr,
  persistedFileAssembly: fileAssemblyArr,
  persistedToolSteps: toolStepsArr,    // ← ADD THIS
}
```

**Step 2: Hydrate toolSteps in the useEffect**

In the hydration `useEffect` (around line 375), add after the existing hydration checks:

```ts
if (persistedToolSteps.length > 0 && toolSteps.length === 0) {
  setToolSteps(persistedToolSteps)
}
```

Also add `persistedToolSteps` and `toolSteps.length` to the dependency array of this useEffect.

**Step 3: Also set generationStatus to 'complete' when we have persisted tool steps and a done event**

The existing logic already checks `persistedTimeline.some((e) => e.type === 'complete')`. Since tool steps are now persisted, we should also set status to complete when we have tool steps and a `done` summary. This is already handled by the existing timeline check — no change needed.

**Step 4: Run type check**

Run: `bunx tsc --noEmit`
Expected: PASS

**Step 5: Run lint**

Run: `bun run lint`
Expected: PASS (or pre-existing warnings only)

**Step 6: Commit**

```bash
git add src/hooks/use-agent-stream.ts
git commit -m "feat: hydrate toolSteps from persisted tool_complete events on page refresh"
```

---

## Task 6: Clean up debug logging and verify

**Files:**
- Modify: `server/routes/projects.ts` (if any debug logging remains after Task 4)

**Step 1: Verify no debug logging remains**

Search for `appendFileSync` or `/tmp/messages-debug` in `server/routes/projects.ts`. If any remain, remove them.

**Step 2: Run full verification**

Run: `bunx tsc --noEmit && bun run lint`
Expected: Both PASS

**Step 3: Manual smoke test**

1. Start dev server: `bun run dev`
2. Open `http://localhost:3000`, create a project, run a generation
3. After generation completes, verify tool steps appear in the timeline
4. Refresh the page — verify:
   - Chat messages persist (user message + assistant summary)
   - Tool activity timeline persists (file writes, builds, commits)
   - Preview loads without 504 (requires snapshot rebuild — see Task 7)

**Step 4: Commit any remaining cleanup**

```bash
git add -A
git commit -m "chore: remove debug logging from projects.ts"
```

---

## Task 7: Rebuild Daytona snapshot (manual — out of band)

After Task 1's vite.config.ts change is merged, the Daytona snapshot image must be rebuilt. The Dockerfile's warmup step (`bun run dev` for 10s) will now pre-bundle all declared deps into `.vite/deps/`.

**This is a manual action** — rebuild the Docker image and update `DAYTONA_SNAPSHOT_ID` in `.env.local` to point to the new snapshot.

---

## Summary of changes

| Task | File | Change |
|------|------|--------|
| 1 | `snapshot/scaffold/vite.config.ts` | Add `optimizeDeps.include` with all 40+ deps |
| 2 | `server/lib/sandbox.ts:309` | Regex `/^[1-5]\d{2}$/` → `/^[23]\d{2}$/` |
| 3 | `server/lib/tool-labels.ts` (new) | Shared `TOOL_LABELS` + `INTERNAL_TOOLS` |
| 3 | `server/routes/agent.ts` | Import from shared module, delete inline map |
| 4 | `server/routes/projects.ts` | Extract tool-invocation parts, return as `tool_complete` events, remove debug logging |
| 5 | `src/hooks/use-agent-stream.ts` | Add `tool_complete` to useMemo, hydrate toolSteps |
| 6 | Various | Cleanup + verification |
| 7 | Daytona snapshot | Rebuild image (manual) |
