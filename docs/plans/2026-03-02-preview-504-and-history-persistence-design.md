# Preview 504 Fix + Conversation History Persistence

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two UX-critical bugs: (1) sandbox preview returns 504 during Vite dependency pre-bundling, (2) tool activity timeline disappears on page refresh.

**Architecture:** Both fixes are minimal-surface changes — no new DB tables, no schema migrations. Fix 1 is a Vite config change + server bug fix. Fix 2 extracts already-persisted tool data from Mastra memory and returns it to the client.

**Tech Stack:** Vite 7 (optimizeDeps), Mastra Memory (PostgresStore), Hono API, React (state hydration)

---

## Problem 1: Preview 504s

### Root Cause

The sandbox Vite dev server returns HTTP 504 when the generated app imports a dependency that isn't in the pre-bundled `.vite/deps/` cache. Vite triggers an esbuild optimization pass mid-request, the Daytona proxy times out waiting, and the client gets a 504.

The snapshot Dockerfile warms only a few deps from the scaffold's minimal `App.tsx`. The other 40+ installed packages (27 Radix primitives, framer-motion, recharts, etc.) are discovered lazily on first import.

Additionally, `waitForServerReady()` in `server/lib/sandbox.ts` has a regex bug: `/^[1-5]\d{2}$/` accepts `504` as a valid "ready" response, causing the agent to proceed before the dev server is actually healthy.

### Design

**1. Add `optimizeDeps.include` to `snapshot/scaffold/vite.config.ts`**

List every non-trivial dependency so Vite pre-bundles them all on first dev server start:

```ts
optimizeDeps: {
  include: [
    // All 27 Radix UI packages
    '@radix-ui/react-accordion',
    '@radix-ui/react-alert-dialog',
    // ... (full list from package.json)
    // Heavy utility deps
    'class-variance-authority',
    'cmdk',
    'date-fns',
    'embla-carousel-react',
    'framer-motion',
    'input-otp',
    'lucide-react',
    'react-day-picker',
    'react-hook-form',
    'react-resizable-panels',
    'recharts',
    'sonner',
    'vaul',
    'zod',
    '@hookform/resolvers',
    '@tanstack/react-query',
    'clsx',
    'tailwind-merge',
    'react-router-dom',
  ],
},
```

**2. Fix `waitForServerReady` regex in `server/lib/sandbox.ts`**

Change from:
```ts
if (/^[1-5]\d{2}$/.test(httpCode))  // Accepts 504!
```

To:
```ts
if (/^[23]\d{2}$/.test(httpCode))  // Only 2xx/3xx = ready
```

**3. Rebuild Daytona snapshot**

After the vite.config.ts change, rebuild the snapshot image. The Dockerfile's warmup step (`bun run dev` for 10s) will now pre-bundle all declared deps into `.vite/deps/`.

### Files

- Modify: `snapshot/scaffold/vite.config.ts`
- Modify: `server/lib/sandbox.ts` (line ~310, the regex)
- Action: Rebuild Daytona snapshot image

---

## Problem 2: Conversation History Lost on Refresh

### Root Cause

The tool activity timeline (file reads, writes, builds, commits) lives only in React state (`toolSteps` in `use-agent-stream.ts`). It's populated from SSE events during the live generation stream. On page refresh, the state resets to `[]`.

Mastra memory DOES persist the tool calls — the assistant message contains `tool-invocation` parts with tool name, args, and result. But the `/messages` endpoint strips them: it only returns `type: "text"` parts from the assistant message, and explicitly filters out `role === 'tool'` records.

### Design

**1. Server: Extract tool-invocation parts from Mastra messages**

In `server/routes/projects.ts`, when processing assistant messages with `format: 2` parts, extract `tool-invocation` parts and emit them as separate events in the response array.

For each `tool-invocation` part, create:
```json
{
  "id": "<generated>",
  "role": "assistant",
  "type": "tool_complete",
  "tool": "writeFile",
  "label": "Writing",
  "filePath": "src/pages/Index.tsx",
  "args": { "path": "src/pages/Index.tsx" },
  "createdAt": "<message timestamp>"
}
```

The `label` field is derived from the same `TOOL_LABELS` mapping used in `agent.ts`. Extract this map to a shared module (`server/lib/tool-labels.ts`) to avoid duplication.

Internal tools (`updateWorkingMemory`, `readWorkingMemory`) are filtered out, matching the SSE behavior.

Tool events are interleaved between the user message and assistant text message, in the order they appear in the parts array.

**2. Client: Hydrate toolSteps from persisted events**

In `src/hooks/use-agent-stream.ts`:

a. Add `case 'tool_complete'` to the `useMemo` switch over `conversationEvents`:
```ts
case 'tool_complete': {
  persistedToolSteps.push({
    id: evt.id,
    tool: evt.tool,
    label: evt.label,
    status: 'complete',
    filePath: evt.filePath,
    startedAt: new Date(evt.createdAt).getTime(),
  })
  break
}
```

b. In the hydration `useEffect`, seed `toolSteps` from `persistedToolSteps`:
```ts
if (persistedToolSteps.length > 0 && toolSteps.length === 0) {
  setToolSteps(persistedToolSteps)
}
```

### Files

- Create: `server/lib/tool-labels.ts` (shared TOOL_LABELS map)
- Modify: `server/routes/agent.ts` (import from shared module instead of inline)
- Modify: `server/routes/projects.ts` (extract tool-invocation parts, return as events)
- Modify: `src/hooks/use-agent-stream.ts` (add tool_complete to useMemo, hydrate toolSteps)

---

## Out of Scope

- Persisting `durationMs` per tool (Mastra doesn't store per-tool timing)
- Persisting file diffs (old/new content) — would require storing the before-content at SSE emit time
- WebContainers migration
- New DB tables or schema migrations
