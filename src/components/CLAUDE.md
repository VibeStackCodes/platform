# Components — Builder UI

Split-view chat + preview interface for app generation.

## Core Builder
- `builder-page.tsx` — Top-level container: orchestrates ChatColumn + RightPanel, manages sandbox URLs (polling + signed URL refresh), deploy state, sandbox recreation state. Props hydrated from project DB record.
- `chat-column.tsx` — Left column: SSE streaming chat via `useAgentStream` hook. Exposes `ChatColumnHandle` (with `addSystemMessage`) to parent via `onReady` callback. Fires `onSandboxReady`, `onGenerationComplete`, `onPanelOpen`.
- `right-panel.tsx` — Right column: Preview/Code iframe tabs + diff/artifact/code viewers. Deploy button with 4 states (idle/deploying/deployed/error). Both iframes stay mounted with CSS visibility toggle (no reload on tab switch). `sandboxRecreating` shows spinner overlay.
- `clarification-questions.tsx` — Multi-choice form for analyst clarification requests
- `prompt-bar.tsx` — Chat input bar (Ctrl+Enter to send)
- `editable-preview/` — 4-layer visual editing: hover outlines, click-to-select with contextual toolbar, inline text editing, property inspector sidebar
- `save-indicator.tsx` — Spinner → checkmark auto-save status indicator

## AI Elements (`ai-elements/` — 16 files)
Specialized rendering components for SSE event data:
- `message.tsx` / `message-response.tsx` — Chat bubbles (user vs assistant)
- `conversation.tsx` — Scrollable container with auto-scroll-to-bottom
- `diff-viewer.tsx` — Unified diff rendering for file changes
- `thinking-card.tsx` — LLM reasoning/thinking display
- `tool-activity.tsx` — Collapsible tool call progress: icon per tool type, file badges (clickable → opens diff panel), `+N -N` line counts, duration display
- `theme-tokens-card.tsx` — Theme token display card
- `model-selector.tsx` — LLM model picker
- `prompt-input.tsx` — Chat input component
- `agent-header.tsx` — Collapsible agent avatar/name/timer header (prototype-matched)
- `script-block.tsx` — Terminal command + output card pair
- `plan-block.tsx` — Titled ordered list for plans
- `hitl-actions.tsx` — Approve / Request Changes buttons
- `artifact-card.tsx` — Icon + title + meta artifact display (4 variants: doc/design/code/default, 2 sizes)
- `artifacts-list.tsx` — Card with list of artifact items
- `preview-card.tsx` — iframe preview with URL footer

## UI Kit (`ui/` — 29 shadcn/ui components)
Standard shadcn/ui primitives. Do not modify directly — use `npx shadcn@latest add <component>` to update.

## Gotchas
- `key={previewUrl}` forces iframe remount on URL change (prevents stale preview)
- Preview + Code iframes are **both always mounted** — CSS `invisible` toggles visibility to avoid reload lag on tab switch
- `ChatColumnHandle` exposes `addSystemMessage` for injecting system messages (e.g., deploy status) into the chat from parent
- `apiFetch()` from `@/lib/utils` auto-injects Supabase Bearer token — use it for all API calls
- Deploy state is hydrated from `initialDeployUrl` prop on mount — shows "Live" link immediately on page refresh if already deployed
