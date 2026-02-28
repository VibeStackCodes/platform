# Builder UI Redesign — Design Document

**Date**: 2026-02-28
**Status**: Approved
**Prototype**: `.prototypes/agentic-flow.html`

## Overview

Full rewrite of the builder UI to match the Claude.ai-inspired prototype. Replaces existing custom AI elements with Vercel AI Elements, adopts Claude-style design tokens, and restructures the layout to a 3-column (sidebar + chat + resizable panel) design.

**Scope**: UI only — single orchestrator agent backend is unchanged. SSE event contract is preserved.

## Decisions

| Decision | Choice |
|---|---|
| Backend architecture | Keep single orchestrator agent (no multi-agent) |
| Design tokens | Claude-style warm palette (cream bg, orange accent, DM Sans) |
| AI components | Replace with Vercel AI Elements (`npx ai-elements@latest`) |
| Layout | Full 3-column: sidebar + chat + resizable right panel |
| Approach | Full page rewrite (Approach C) |
| Dark mode | Include (Claude-style dark tokens) |

## 1. Design Tokens

Update `src/index.css` Tailwind v4 CSS theme:

### Light Mode

```css
--background: #faf9f5;       /* warm cream */
--foreground: #141413;        /* near black */
--muted-foreground: #6b6960;  /* warm gray */
--border: #e8e6dc;            /* warm light gray */
--primary: #d97757;           /* claude orange */
--primary-foreground: #ffffff;
--card: #f5f3ed;
--sidebar: #f0ede6;
--input: #ffffff;
--accent-soft: rgba(217, 119, 87, 0.10);
```

### Dark Mode

```css
--background: #1C1B1A;
--foreground: #E8E6DC;
--muted-foreground: #8A8780;
--border: #333230;
--card: #232220;
--sidebar: #1C1B1A;
```

### Typography

- Body: `'DM Sans', -apple-system, system-ui, sans-serif`
- Display: `'DM Serif Display', Georgia, serif`
- Mono: `'JetBrains Mono', ui-monospace, monospace`

### Spacing & Radius

- Radius: SM 6px, MD 10px, LG 16px, XL 20px, 2XL 24px, Pill 9999px
- Shadows: Warm-tinted `rgba(20, 20, 19, 0.04-0.06)`

## 2. Layout Architecture

```
┌──────────┬──────────────────────┬──────────────────────┐
│ Sidebar  │     Chat Column      │    Right Panel       │
│ 267px    │     flex: 1          │    0-50% resizable   │
│ collaps- │  max-w: 768px msgs   │    min-w: 340px      │
│  ible    │                      │                      │
│  to 52px │  Messages (scroll)   │  Panel header        │
│          │  Input bar (bottom)  │  Panel body          │
│ Logo     │                      │  (artifact/code/     │
│ New proj │                      │   preview)           │
│ Search   │                      │                      │
│ Recents  │                      │  Drag handle (left)  │
│ User     │                      │                      │
└──────────┴──────────────────────┴──────────────────────┘
```

### Route Structure

```
_authenticated/route.tsx       ← auth guard + SidebarProvider + AppSidebar
  ├─ _dashboard/
  │   ├─ route.tsx             ← SidebarInset wrapper (no own sidebar)
  │   └─ dashboard.tsx         ← project grid
  └─ project.$id.tsx           ← BuilderPage (chat + panel)
```

The sidebar moves from dashboard-only to shared across all authenticated routes.

### Component Hierarchy

```
BuilderPage
  ├─ ChatColumn
  │   ├─ Conversation (AI Elements)
  │   │   ├─ ConversationContent
  │   │   │   ├─ ConversationEmptyState (with Suggestions)
  │   │   │   ├─ Message × N (user/assistant)
  │   │   │   │   ├─ MessageContent → MessageResponse (markdown)
  │   │   │   │   ├─ Reasoning (thinking)
  │   │   │   │   ├─ Tool (tool activity)
  │   │   │   │   ├─ ArtifactCard (clickable → opens panel)
  │   │   │   │   └─ MessageToolbar + MessageActions
  │   │   │   ├─ StackTrace (build errors)
  │   │   │   └─ Completion banner
  │   │   └─ ConversationScrollButton
  │   └─ PromptInput (AI Elements)
  │       ├─ PromptInputTextarea
  │       ├─ PromptInputFooter
  │       │   ├─ Attachment button
  │       │   ├─ ModelSelector (custom)
  │       │   └─ PromptInputSubmit
  │       └─ Credit display
  └─ RightPanel (resizable)
      ├─ PanelHeader (title, badge, close, actions)
      └─ PanelBody
          ├─ PanelArtifactViewer (document render)
          ├─ PanelCodeViewer (syntax highlighted code)
          └─ WebPreview (iframe for app preview)
```

## 3. AI Elements Component Mapping

### Replaced by Vercel AI Elements

| Current Component | Vercel AI Element |
|---|---|
| `conversation.tsx` | `Conversation`, `ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton` |
| `message.tsx` | `Message`, `MessageContent`, `MessageResponse`, `MessageActions`, `MessageAction`, `MessageToolbar` |
| `message-response.tsx` | `MessageResponse` (built into message) |
| `prompt-input.tsx` | `PromptInput`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputSubmit` |
| `thinking-card.tsx` | `Reasoning`, `ReasoningTrigger`, `ReasoningContent` |
| `action-card.tsx` | `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput` |
| `suggestion.tsx` | `Suggestion`, `Suggestions` |
| `code-block.tsx` | `CodeBlock` |
| `shimmer.tsx` | `Shimmer` |
| `web-preview.tsx` | `WebPreview` |
| `plan.tsx` | `Plan` |

### Keep as Custom

| Component | Reason |
|---|---|
| `model-selector.tsx` | Custom provider routing + logos |
| `architecture-card.tsx` | Project-specific SSE event |
| `theme-tokens-card.tsx` | Project-specific design tokens |
| `page-progress-card.tsx` | Project-specific progress |
| `file-assembly-card.tsx` | Project-specific file assembly |
| `operation-summary-card.tsx` | Project-specific summary |
| `stack-trace.tsx` | Build error display |
| `plan-approval-card.tsx` | HITL approve/reject |
| `property-panel.tsx` | Visual edit mode |

### New Components

| Component | Purpose |
|---|---|
| `artifact-card.tsx` | Clickable card in chat (icon, title, meta, download button) |
| `right-panel.tsx` | Resizable panel with drag handle |
| `panel-code-viewer.tsx` | Code viewer in right panel |
| `panel-artifact-viewer.tsx` | Artifact document viewer in right panel |

## 4. SSE → UI Rendering

### Hook: `useAgentStream(projectId)`

Extracted from current `BuilderChat`. Encapsulates:
- SSE connection (POST to `/api/agent`, ReadableStream parsing)
- State management (messages, timeline, status, files, errors)
- Actions: `sendMessage()`, `approvePlan()`, `answerClarification()`

### Event Mapping

| SSE Event | UI Component |
|---|---|
| `agent_progress` (text) | `Message` + `MessageResponse` (streaming markdown) |
| `thinking` | `Reasoning` with `isStreaming={true}` |
| `tool_start` / `tool_complete` | `Tool` with `ToolHeader` + `ToolContent` |
| `sandbox_ready` | Badge notification + parent callback |
| `package_installed` | `Tool` step (inline) |
| `done` | Completion banner + `ArtifactCard` |
| `agent_error` | `StackTrace` |
| `credits_used` | Credit display update |

### Right Panel Triggers

- Click `ArtifactCard` → `setPanelContent({ type: 'artifact', data })` → opens panel
- Click file in `Tool` → `setPanelContent({ type: 'code', filename })` → opens panel
- "Open Preview" → `setPanelContent({ type: 'preview' })` → opens panel with `WebPreview`

## 5. File Changes

### Modified
- `src/index.css` — theme tokens
- `src/routes/_authenticated/route.tsx` — add SidebarProvider wrapper
- `src/routes/_authenticated/_dashboard/route.tsx` — remove SidebarProvider
- `src/routes/_authenticated/project.$id.tsx` — render BuilderPage
- `src/components/app-sidebar.tsx` — add recents, search, user menu

### New
- `src/components/builder-page.tsx` — top-level builder (chat + panel)
- `src/components/chat-column.tsx` — chat using AI Elements
- `src/components/right-panel.tsx` — resizable right panel
- `src/components/panel-code-viewer.tsx` — code viewer
- `src/components/panel-artifact-viewer.tsx` — artifact viewer
- `src/components/artifact-card.tsx` — chat inline artifact card
- `src/hooks/use-agent-stream.ts` — SSE hook
- `src/hooks/use-resizable-panel.ts` — drag resize hook

### Deleted (after rewrite complete)
- `src/components/builder-chat.tsx` — replaced by chat-column + use-agent-stream
- `src/components/builder-preview.tsx` — replaced by right-panel
- `src/components/project-layout.tsx` — replaced by builder-page

### AI Elements
- `src/components/ai-elements/` — reinstalled via `npx ai-elements@latest`, then restyled

## 6. Risk Mitigation

- **SSE regression**: Extract `useAgentStream` by copying existing SSE parsing logic verbatim from `BuilderChat`, then wire to new UI. This preserves all edge case handling.
- **Feature parity**: Create a checklist of every UI feature in current builder (clarification Q&A, plan approval, visual edit mode, deploy button, credit display, model selector, build errors) and verify each is present in the rewrite.
- **Incremental testing**: Each new component can be tested in isolation before wiring to the SSE stream.
