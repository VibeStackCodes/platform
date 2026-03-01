# Components — Builder UI

Split-view chat + preview interface for app generation.

## Core Builder
- `project-layout.tsx` — Container: chat + preview split, previewUrl polling (2s), sandbox_ready handler, element selection state, signed URL refresh (10min before 1h expiry)
- `builder-chat.tsx` — SSE streaming chat: Conversation, Agent cards, file trees, stack traces, suggestions. POSTs to `/api/agent`
- `builder-preview.tsx` — iframe preview + code server tabs. Listens for `postMessage('VIBESTACK_ELEMENT_SELECTED')` (validates Daytona origin). Deploy button → `/api/projects/deploy`
- `clarification-questions.tsx` — Multi-choice form for analyst clarification requests
- `prompt-bar.tsx` — Chat input bar (Ctrl+Enter to send)

## AI Elements (`ai-elements/` — 16 files)
Specialized rendering components for SSE event data:
- `message.tsx` / `message-response.tsx` — Chat bubbles (user vs assistant)
- `conversation.tsx` — Scrollable container with auto-scroll-to-bottom
- `diff-viewer.tsx` — Unified diff rendering for file changes
- `thinking-card.tsx` — LLM reasoning/thinking display
- `tool-activity.tsx` — Tool call progress indicator
- `theme-tokens-card.tsx` — Theme token display card
- `model-selector.tsx` — LLM model picker
- `prompt-input.tsx` — Chat input component
- `agent-header.tsx` — Collapsible agent avatar/name/timer header (prototype-matched)
- `script-block.tsx` — Terminal command + output card pair
- `plan-block.tsx` — Titled ordered list for plans
- `hitl-actions.tsx` — Approve / Request Changes buttons
- `artifact-card.tsx` — Icon + title + meta artifact display
- `artifacts-list.tsx` — Card with list of artifact items
- `preview-card.tsx` — iframe preview with URL footer

## UI Kit (`ui/` — 29 shadcn/ui components)
Standard shadcn/ui primitives. Do not modify directly — use `npx shadcn@latest add <component>` to update.

## Gotchas
- `key={previewUrl}` forces iframe remount on URL change (prevents stale preview)
- iframe `postMessage` origin validated against Daytona domain regex
- `apiFetch()` from `@/lib/utils` auto-injects Supabase Bearer token — use it for all API calls
