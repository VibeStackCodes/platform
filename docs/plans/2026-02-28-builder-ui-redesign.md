# Builder UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the builder UI to match the Claude.ai-inspired prototype with Vercel AI Elements, Claude-style design tokens, and 3-column layout (sidebar + chat + resizable panel).

**Architecture:** Full page rewrite (Approach C). Install Vercel AI Elements via CLI (replaces `src/components/ai-elements/`), update Tailwind v4 theme to warm cream/orange tokens, restructure layout so sidebar wraps all authenticated routes, and rewrite `BuilderChat` as `ChatColumn` + extracted `useAgentStream` hook + `RightPanel`.

**Tech Stack:** React 19, TanStack Router (file-based), Tailwind CSS v4, shadcn/ui, Vercel AI Elements, Hono SSE backend (unchanged)

**Design Doc:** `docs/plans/2026-02-28-builder-ui-redesign-design.md`

---

## Task 1: Update Design Tokens (Theme)

**Files:**
- Modify: `src/index.css:7-118`

**Step 1: Update font families in `@theme inline`**

Replace lines 10-12 in `src/index.css`:

```css
/* Before */
--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
--font-display: "DM Serif Display", "Georgia", serif;
--font-mono: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;

/* After */
--font-sans: "DM Sans", -apple-system, system-ui, sans-serif;
--font-display: "DM Serif Display", Georgia, serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;
```

**Step 2: Replace `:root` light mode tokens (lines 51-84)**

Replace the entire `:root` block with Claude-style warm tokens:

```css
:root {
  --radius: 0.625rem;
  --background: #faf9f5;
  --foreground: #141413;
  --card: #f5f3ed;
  --card-foreground: #141413;
  --popover: #ffffff;
  --popover-foreground: #141413;
  --primary: #d97757;
  --primary-foreground: #ffffff;
  --secondary: #f0ede6;
  --secondary-foreground: #141413;
  --muted: #f0ede6;
  --muted-foreground: #6b6960;
  --accent: #f0ede6;
  --accent-foreground: #141413;
  --destructive: oklch(0.577 0.245 27.325);
  --border: #e8e6dc;
  --input: #ffffff;
  --ring: #d97757;
  --chart-1: #d97757;
  --chart-2: #6a9bcc;
  --chart-3: #788c5d;
  --chart-4: #8b5cf6;
  --chart-5: #6366f1;
  --sidebar: #f0ede6;
  --sidebar-foreground: #141413;
  --sidebar-primary: #d97757;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e8e6dc;
  --sidebar-accent-foreground: #141413;
  --sidebar-border: #e8e6dc;
  --sidebar-ring: #d97757;
}
```

**Step 3: Replace `.dark` mode tokens (lines 86-118)**

```css
.dark {
  --background: #1C1B1A;
  --foreground: #E8E6DC;
  --card: #232220;
  --card-foreground: #E8E6DC;
  --popover: #232220;
  --popover-foreground: #E8E6DC;
  --primary: #d97757;
  --primary-foreground: #ffffff;
  --secondary: #2A2926;
  --secondary-foreground: #E8E6DC;
  --muted: #2A2926;
  --muted-foreground: #8A8780;
  --accent: #2A2926;
  --accent-foreground: #E8E6DC;
  --destructive: oklch(0.704 0.191 22.216);
  --border: #333230;
  --input: #2A2926;
  --ring: #d97757;
  --chart-1: #d97757;
  --chart-2: #6a9bcc;
  --chart-3: #788c5d;
  --chart-4: #a78bfa;
  --chart-5: #818cf8;
  --sidebar: #1C1B1A;
  --sidebar-foreground: #E8E6DC;
  --sidebar-primary: #d97757;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #2A2926;
  --sidebar-accent-foreground: #E8E6DC;
  --sidebar-border: #333230;
  --sidebar-ring: #d97757;
}
```

**Step 4: Add Google Fonts link**

Add to `index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Step 5: Verify build compiles**

Run: `bunx tsc --noEmit && bun run build`
Expected: SUCCESS — no type or build errors (theme changes are CSS-only)

**Step 6: Commit**

```bash
git add src/index.css index.html
git commit -m "style: update design tokens to Claude-style warm palette"
```

---

## Task 2: Install Vercel AI Elements

**Files:**
- Replace: `src/components/ai-elements/` (all files)

**Step 1: Back up current custom components list**

Run: `ls src/components/ai-elements/` — record the list for reference during rewiring.

Current custom files that will be replaced:
- `conversation.tsx`, `message.tsx`, `message-response.tsx`, `prompt-input.tsx`
- `thinking-card.tsx`, `action-card.tsx`, `suggestion.tsx`, `code-block.tsx`
- `shimmer.tsx`, `web-preview.tsx`, `plan.tsx`, `file-tree.tsx`
- `agent.tsx` (unused after rewrite)

Custom files to **preserve** (move out before install):
- `model-selector.tsx`, `architecture-card.tsx`, `theme-tokens-card.tsx`
- `page-progress-card.tsx`, `file-assembly-card.tsx`, `operation-summary-card.tsx`
- `stack-trace.tsx`, `plan-approval-card.tsx`, `property-panel.tsx`
- `test-results.tsx`

**Step 2: Move custom components to safety**

```bash
mkdir -p src/components/ai-custom
# Move project-specific components that won't be replaced
cp src/components/ai-elements/model-selector.tsx src/components/ai-custom/
cp src/components/ai-elements/architecture-card.tsx src/components/ai-custom/
cp src/components/ai-elements/theme-tokens-card.tsx src/components/ai-custom/
cp src/components/ai-elements/page-progress-card.tsx src/components/ai-custom/
cp src/components/ai-elements/file-assembly-card.tsx src/components/ai-custom/
cp src/components/ai-elements/operation-summary-card.tsx src/components/ai-custom/
cp src/components/ai-elements/stack-trace.tsx src/components/ai-custom/
cp src/components/ai-elements/plan-approval-card.tsx src/components/ai-custom/
cp src/components/ai-elements/property-panel.tsx src/components/ai-custom/
cp src/components/ai-elements/test-results.tsx src/components/ai-custom/
```

**Step 3: Install Vercel AI Elements**

```bash
npx ai-elements@latest
```

If interactive, select "all" components. This replaces files in `src/components/ai-elements/`.

If the CLI doesn't work with bun or the path is different, use the shadcn registry:

```bash
npx shadcn@latest add https://ai-sdk.dev/elements/api/registry/all.json
```

**Step 4: Move preserved custom components back**

```bash
cp src/components/ai-custom/* src/components/ai-elements/
rm -rf src/components/ai-custom
```

**Step 5: Fix import paths if needed**

The AI Elements CLI may install to a different path (e.g., `@/components/ui/` instead of `@/components/ai-elements/`). Check the installed files and update paths if necessary.

**Step 6: Verify build**

Run: `bunx tsc --noEmit`
Expected: ERRORS — the old `builder-chat.tsx` imports custom component APIs that have changed. This is expected and will be resolved in Task 5.

**Step 7: Commit**

```bash
git add src/components/ai-elements/ src/components/ai-custom/
git commit -m "feat: install Vercel AI Elements, preserve custom components"
```

---

## Task 3: Move Sidebar to Authenticated Layout

**Files:**
- Modify: `src/routes/_authenticated/route.tsx`
- Modify: `src/routes/_authenticated/_dashboard/route.tsx`

**Step 1: Update `_authenticated/route.tsx` to include sidebar**

Replace `src/routes/_authenticated/route.tsx`:

```tsx
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/auth/login' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Step 2: Strip sidebar from dashboard layout**

Replace `src/routes/_authenticated/_dashboard/route.tsx`:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/_dashboard')({
  component: () => <Outlet />,
})
```

**Step 3: Verify build compiles**

Run: `bunx tsc --noEmit`
Expected: SUCCESS — sidebar is now shared across all authenticated routes

**Step 4: Commit**

```bash
git add src/routes/_authenticated/route.tsx src/routes/_authenticated/_dashboard/route.tsx
git commit -m "refactor: move sidebar to authenticated layout (shared across all routes)"
```

---

## Task 4: Extract `useAgentStream` Hook

**Files:**
- Create: `src/hooks/use-agent-stream.ts`

This is the core state + SSE logic extracted from `src/components/builder-chat.tsx`. Copy the SSE parsing, state management, and event handling **verbatim** from `builder-chat.tsx`.

**Step 1: Create the hook file**

Create `src/hooks/use-agent-stream.ts` with:

- All state declarations from `BuilderChat` (lines 260-291): `model`, `generationStatus`, `generationFiles`, `buildErrors`, `pageProgress`, `fileAssembly`, `validationChecks`, `timelineEvents`, `pendingClarification`, `resumeRunId`, `pendingPlan`, `planRunId`, `userCredits`, `abortControllerRef`, `hasAutoSubmitted`
- The `parseSSEBuffer` function (line 737)
- The `handleGenerationEvent` callback (line 532)
- The `sendChatMessage` function (line 772)
- The `handleStop` function (line 343)
- The `handleClarificationSubmit` function (line 898)
- The `handlePlanApprove` function (line 960)
- The conversation hydration query (line 294)
- The initial prompt auto-submit effect (line 873)

Return interface:

```typescript
export interface UseAgentStreamReturn {
  // State
  model: string
  setModel: (model: string) => void
  generationStatus: 'idle' | 'generating' | 'complete' | 'error'
  generationFiles: FileEntry[]
  buildErrors: BuildError[]
  pageProgress: PageProgressEntry[]
  fileAssembly: FileAssemblyEntry[]
  validationChecks: ValidationCheckEntry[]
  timelineEvents: TimelineEntry[]
  pendingClarification: ClarificationQuestion[] | null
  pendingPlan: PlanReadyEvent['plan'] | null
  userCredits: UserCreditsState | null
  messages: ChatMessage[]
  chatStatus: 'idle' | 'streaming'

  // Actions
  sendMessage: (text: string) => void
  handleStop: () => void
  handleClarificationSubmit: (answers: Record<string, string[]>) => void
  handlePlanApprove: () => Promise<void>
  handlePlanReject: (feedback: string) => Promise<void>
}
```

**Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: The hook itself should compile. `builder-chat.tsx` will be broken (we'll delete it later).

**Step 3: Commit**

```bash
git add src/hooks/use-agent-stream.ts
git commit -m "refactor: extract useAgentStream hook from BuilderChat"
```

---

## Task 5: Create `useResizablePanel` Hook

**Files:**
- Create: `src/hooks/use-resizable-panel.ts`

**Step 1: Write the hook**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseResizablePanelOptions {
  defaultWidth?: number    // percentage, default 50
  minWidth?: number        // px, default 340
  maxWidth?: number        // percentage, default 75
}

export function useResizablePanel(options: UseResizablePanelOptions = {}) {
  const { defaultWidth = 50, minWidth = 340, maxWidth = 75 } = options
  const [isOpen, setIsOpen] = useState(false)
  const [width, setWidth] = useState(defaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newWidth = ((rect.right - e.clientX) / rect.width) * 100
      const clampedPx = Math.max(minWidth, (newWidth / 100) * rect.width)
      const clampedPct = Math.min(maxWidth, (clampedPx / rect.width) * 100)
      setWidth(clampedPct)
    }

    const handleMouseUp = () => setIsDragging(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, minWidth, maxWidth])

  return {
    isOpen, width, isDragging, containerRef,
    open, close, toggle,
    handleDragStart,
  }
}
```

**Step 2: Verify types compile**

Run: `bunx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/hooks/use-resizable-panel.ts
git commit -m "feat: add useResizablePanel hook for drag-to-resize"
```

---

## Task 6: Create `RightPanel` Component

**Files:**
- Create: `src/components/right-panel.tsx`

**Step 1: Write the component**

The right panel is a collapsible/resizable container with a drag handle, panel header, and panel body. It supports three content types: artifact document viewer, code viewer, and web preview (iframe).

Panel content type:

```typescript
export type PanelContent =
  | { type: 'preview'; previewUrl: string }
  | { type: 'code'; filename: string; code: string }
  | { type: 'artifact'; title: string; content: string }
  | null
```

The component renders:
- A drag handle on the left edge (6px wide, `cursor: col-resize`)
- A panel header with title, badge, close button, and action buttons (copy, deploy)
- A panel body that switches on `PanelContent.type`:
  - `preview` → iframe (`<WebPreview>` from AI Elements)
  - `code` → `<CodeBlock>` from AI Elements with filename tab
  - `artifact` → rendered HTML/markdown document

Use the prototype's CSS patterns:
- Transition: `all 0.4s cubic-bezier(0.4, 0, 0.2, 1)`
- When open: `width: {panelWidth}%`, `min-width: 340px`, `border-left: 1px solid var(--border)`
- When closed: `width: 0`, `min-width: 0`, `border-left: 0`, `opacity: 0`

**Step 2: Verify types compile**

Run: `bunx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/right-panel.tsx
git commit -m "feat: add RightPanel resizable component"
```

---

## Task 7: Create `ArtifactCard` Component

**Files:**
- Create: `src/components/artifact-card.tsx`

**Step 1: Write the component**

Inline chat card that represents a generated artifact (app preview, document, code). Clicking opens the right panel.

```typescript
interface ArtifactCardProps {
  icon: React.ReactNode
  title: string
  meta: string
  actionLabel?: string   // "Open Preview" | "Download"
  onClick: () => void
  onAction?: () => void  // secondary action (download)
}
```

Use the prototype's `artifact-card-lg` styling:
- `flex items-center gap-3.5 p-3.5 bg-background border rounded-xl max-w-lg cursor-pointer`
- Thumbnail: 48x48 rounded icon
- Info: title (font-medium) + meta (text-xs text-muted-foreground)
- Action button: border rounded-md px-4 py-1.5

**Step 2: Commit**

```bash
git add src/components/artifact-card.tsx
git commit -m "feat: add ArtifactCard component for inline chat artifacts"
```

---

## Task 8: Create `ChatColumn` Component

**Files:**
- Create: `src/components/chat-column.tsx`

This replaces `builder-chat.tsx`. It consumes `useAgentStream()` and renders using Vercel AI Elements.

**Step 1: Write the component**

Structure (from design doc):

```tsx
function ChatColumn({ projectId, initialPrompt, onSandboxReady, onPanelOpen }: ChatColumnProps) {
  const stream = useAgentStream({ projectId, initialPrompt, onSandboxReady })

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-w-[340px]">
      <div className="flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto flex w-full max-w-[768px] flex-col gap-5">
          {/* Messages + timeline rendering */}
          <Conversation>
            <ConversationContent>
              {stream.messages.length === 0 && stream.generationStatus === 'idle' ? (
                <ConversationEmptyState
                  title="What do you want to build?"
                  description="Describe your app and I'll generate it"
                />
              ) : (
                <>
                  {stream.messages.map(msg => (
                    <Message key={msg.id} from={msg.role}>
                      <MessageContent>
                        <MessageResponse>{msg.content}</MessageResponse>
                      </MessageContent>
                    </Message>
                  ))}

                  {/* Timeline events: tool calls, reasoning, artifacts */}
                  {stream.timelineEvents.map((event, i) => renderTimelineEvent(event, i, onPanelOpen))}

                  {/* Build errors */}
                  {stream.buildErrors.map((err, i) => (
                    <StackTrace key={i}>...</StackTrace>
                  ))}

                  {/* Clarification questions */}
                  {stream.pendingClarification && (
                    <ClarificationQuestions
                      questions={stream.pendingClarification}
                      onSubmit={stream.handleClarificationSubmit}
                    />
                  )}

                  {/* Plan approval */}
                  {stream.pendingPlan && (
                    <PlanApprovalCard
                      plan={stream.pendingPlan}
                      onApprove={stream.handlePlanApprove}
                      onReject={stream.handlePlanReject}
                    />
                  )}

                  {/* Completion banner */}
                  {stream.generationStatus === 'complete' && (
                    <div className="flex items-center gap-2 rounded-xl bg-green-50 p-4">
                      <Rocket className="size-5 text-green-600" />
                      <span className="font-medium text-green-800">Your app is ready!</span>
                    </div>
                  )}
                </>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t p-6">
        {stream.userCredits && <CreditDisplay credits={stream.userCredits} />}
        <PromptBar
          model={stream.model}
          onModelChange={stream.setModel}
          onSubmit={({ text }) => stream.sendMessage(text)}
          isGenerating={stream.generationStatus === 'generating'}
          onStop={stream.handleStop}
        />
      </div>
    </div>
  )
}
```

The `renderTimelineEvent` function maps timeline entries to AI Elements:
- `agent` entry with `analyst` → `<Reasoning>` component
- `agent` entry with `architect` → `<Tool>` with design tokens/architecture inside
- `agent` entry with `frontend` → `<Tool>` with page progress inside
- `agent` entry with `backend` → `<Tool>` with file assembly inside
- `agent` entry with `qa` → `<Tool>` with validation checks inside
- `complete` entry → completion banner + `<ArtifactCard>` for preview
- `error` entry → `<StackTrace>`

**Step 2: Verify types compile**

Run: `bunx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/chat-column.tsx
git commit -m "feat: add ChatColumn with Vercel AI Elements"
```

---

## Task 9: Create `BuilderPage` Component

**Files:**
- Create: `src/components/builder-page.tsx`
- Modify: `src/routes/_authenticated/project.$id.tsx`

**Step 1: Write `BuilderPage`**

Top-level builder component that orchestrates `ChatColumn` + `RightPanel`. Manages:
- Panel content state (`PanelContent | null`)
- Sandbox URLs (preview, code server) via polling
- Element selection for visual edit mode

```tsx
import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChatColumn } from '@/components/chat-column'
import { RightPanel, type PanelContent } from '@/components/right-panel'
import { useResizablePanel } from '@/hooks/use-resizable-panel'
import { apiFetch } from '@/lib/utils'

interface BuilderPageProps {
  projectId: string
  initialPrompt?: string
  initialSandboxId?: string
}

export function BuilderPage({ projectId, initialPrompt, initialSandboxId }: BuilderPageProps) {
  const [panelContent, setPanelContent] = useState<PanelContent>(null)
  const [sandboxId, setSandboxId] = useState(initialSandboxId)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [codeServerUrl, setCodeServerUrl] = useState<string>()
  const panel = useResizablePanel()

  // Poll sandbox URLs (same logic as current project-layout.tsx)
  useQuery({
    queryKey: ['sandbox-urls', projectId],
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${projectId}/sandbox-urls`)
      if (!res.ok) return null
      const data = await res.json()
      if (data.previewUrl) setPreviewUrl(data.previewUrl)
      if (data.codeServerUrl) setCodeServerUrl(data.codeServerUrl)
      return data
    },
    refetchInterval: previewUrl ? false : 2000,
    enabled: !!sandboxId,
  })

  const handleSandboxReady = useCallback((id: string) => {
    setSandboxId(id)
    setPreviewUrl(undefined)
  }, [])

  const handlePanelOpen = useCallback((content: PanelContent) => {
    setPanelContent(content)
    panel.open()
  }, [panel])

  return (
    <div ref={panel.containerRef} className="flex h-screen overflow-hidden">
      <ChatColumn
        projectId={projectId}
        initialPrompt={initialPrompt}
        onSandboxReady={handleSandboxReady}
        onPanelOpen={handlePanelOpen}
      />
      <RightPanel
        isOpen={panel.isOpen}
        width={panel.width}
        isDragging={panel.isDragging}
        content={panelContent}
        previewUrl={previewUrl}
        codeServerUrl={codeServerUrl}
        onDragStart={panel.handleDragStart}
        onClose={panel.close}
      />
    </div>
  )
}
```

**Step 2: Update `project.$id.tsx` to use `BuilderPage`**

Replace `src/routes/_authenticated/project.$id.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { BuilderPage } from '@/components/builder-page'
import { apiFetch } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/project/$id')({
  component: ProjectPage,
})

function ProjectPage() {
  const { id } = Route.useParams()

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${id}`)
      if (!res.ok) throw new Error('Project not found')
      return res.json() as Promise<{
        id: string
        name: string
        prompt: string | null
        status: string
        sandboxId: string | null
      }>
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  return (
    <BuilderPage
      projectId={id}
      initialPrompt={project.status === 'pending' ? (project.prompt ?? undefined) : undefined}
      initialSandboxId={project.sandboxId ?? undefined}
    />
  )
}
```

**Step 3: Verify build**

Run: `bunx tsc --noEmit && bun run build`

**Step 4: Commit**

```bash
git add src/components/builder-page.tsx src/routes/_authenticated/project.\$id.tsx
git commit -m "feat: add BuilderPage with ChatColumn + RightPanel layout"
```

---

## Task 10: Enhance AppSidebar with Recents

**Files:**
- Modify: `src/components/app-sidebar.tsx`

**Step 1: Add project recents section**

Add a "Recents" section to the sidebar that queries `/api/projects` and shows the 5 most recent projects. Each item links to `/project/:id`.

Add between the nav items and footer:

```tsx
// New imports
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Plus, Search } from 'lucide-react'

// Inside AppSidebar, after the nav SidebarGroup:
const { data: recentProjects } = useQuery({
  queryKey: ['recent-projects'],
  queryFn: async () => {
    const res = await apiFetch('/api/projects')
    if (!res.ok) return []
    const projects = await res.json()
    return projects.slice(0, 5)
  },
})

// Render:
<SidebarGroup>
  <SidebarGroupLabel>Recents</SidebarGroupLabel>
  <SidebarGroupContent>
    <SidebarMenu>
      {recentProjects?.map(project => (
        <SidebarMenuItem key={project.id}>
          <SidebarMenuButton asChild tooltip={project.name}>
            <Link to="/project/$id" params={{ id: project.id }}>
              <MessageSquare />
              <span>{project.name}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  </SidebarGroupContent>
</SidebarGroup>
```

Also update nav items to match prototype (New Project + Search):

```tsx
const NAV_ITEMS = [
  { label: 'New project', icon: Plus, to: '/dashboard' as const },
  { label: 'Search', icon: Search, to: '/dashboard' as const },
] as const
```

**Step 2: Verify build**

Run: `bunx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: add recent projects to sidebar"
```

---

## Task 11: Delete Old Components

**Files:**
- Delete: `src/components/builder-chat.tsx`
- Delete: `src/components/builder-preview.tsx`
- Delete: `src/components/project-layout.tsx`

**Step 1: Verify no remaining imports**

Run: `grep -r 'builder-chat\|builder-preview\|project-layout' src/ --include='*.tsx' --include='*.ts'`

Expected: No results (all references have been replaced in earlier tasks).

If there are still references, update them before deleting.

**Step 2: Delete old files**

```bash
rm src/components/builder-chat.tsx
rm src/components/builder-preview.tsx
rm src/components/project-layout.tsx
```

**Step 3: Verify build**

Run: `bunx tsc --noEmit && bun run build`
Expected: SUCCESS

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old builder components (replaced by new layout)"
```

---

## Task 12: Restyle AI Elements to Match Prototype

**Files:**
- Modify: Various files in `src/components/ai-elements/`

**Step 1: Restyle Message component**

Update the user message bubble to use the prototype's warm style:
- User bubble: `bg-[#f0ede6] rounded-xl rounded-br-md`
- Assistant text: No bubble, max-width 100%, `text-[15px] leading-[1.7]`

**Step 2: Restyle PromptInput**

Match the prototype's input bar:
- Outer: `bg-white border rounded-3xl p-3.5 shadow-sm`
- Focus: `border-[#d97757]`
- Send button: `rounded-full bg-[#d97757] text-white`
- Model chip: `border rounded-full px-2.5 py-1 text-xs`

**Step 3: Restyle Conversation**

Match the prototype's centered chat with `max-width: 768px`.

**Step 4: Restyle Tool component**

Match the prototype's tool activity traces:
- Collapsible header with chevron
- Step items with vertical connector line
- File links as monospace chips
- Diff badges (`+N` green, `-N` orange)

**Step 5: Verify build**

Run: `bun run build`

**Step 6: Commit**

```bash
git add src/components/ai-elements/
git commit -m "style: restyle AI Elements to match Claude-style prototype"
```

---

## Task 13: Full Integration Test

**Step 1: Run full build**

Run: `bun run build`
Expected: SUCCESS

**Step 2: Run lint**

Run: `bun run lint`
Expected: 0 errors

**Step 3: Run tests**

Run: `bun run test`
Expected: All passing (UI tests may need updates for changed component structure)

**Step 4: Manual verification**

Run: `bun run dev`

Verify:
- [ ] Sidebar appears on both dashboard and builder pages
- [ ] Sidebar collapses/expands correctly
- [ ] Recent projects appear in sidebar
- [ ] User menu in sidebar footer works
- [ ] Chat messages render with warm styling
- [ ] Input bar has Claude-style rounded design
- [ ] Model chip is visible in input bar
- [ ] SSE streaming works (text appears progressively)
- [ ] Tool activity traces render in chat
- [ ] Clicking an artifact opens the right panel
- [ ] Right panel is resizable via drag handle
- [ ] Right panel shows preview iframe when available
- [ ] Build errors display as StackTrace
- [ ] Clarification questions work
- [ ] Plan approval/reject works
- [ ] Dark mode works with warm dark tokens
- [ ] Credit display shows in input bar area

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete builder UI redesign with Claude-style prototype"
```
