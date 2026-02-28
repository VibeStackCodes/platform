# Components — Builder UI

Split-view chat + preview interface for app generation.

## Core Builder
- `project-layout.tsx` — Container: chat + preview split, previewUrl polling (2s), sandbox_ready handler, element selection state, signed URL refresh (10min before 1h expiry)
- `builder-chat.tsx` — SSE streaming chat: Conversation, Agent cards, file trees, stack traces, suggestions. POSTs to `/api/agent`
- `builder-preview.tsx` — iframe preview + code server tabs. Listens for `postMessage('VIBESTACK_ELEMENT_SELECTED')` (validates Daytona origin). Deploy button → `/api/projects/deploy`
- `clarification-questions.tsx` — Multi-choice form for analyst clarification requests
- `prompt-bar.tsx` — Chat input bar (Ctrl+Enter to send)

## AI Elements (`ai-elements/` — 18 files)
Specialized rendering components for SSE event data:
- `message.tsx` / `message-response.tsx` — Chat bubbles (user vs assistant)
- `conversation.tsx` — Scrollable container with auto-scroll-to-bottom
- `file-tree.tsx` — Recursive folder/file tree
- `diff-viewer.tsx` — Unified diff rendering for file changes
- `stack-trace.tsx` — Error frames + copy button
- `action-card.tsx` — Tabbed action card container
- `thinking-card.tsx` — LLM reasoning/thinking display
- `tool-activity.tsx` — Tool call progress indicator
- `operation-summary-card.tsx` — Operation result summary
- `plan-approval-card.tsx` — Plan approval/rejection UI
- `theme-tokens-card.tsx` — Theme token display card
- `architecture-card.tsx` — Architecture diagram card
- `page-progress-card.tsx` — Page generation progress card
- `package-info.tsx` — Package installation info card
- `test-results.tsx` — Test run results display
- `model-selector.tsx` — LLM model picker
- `prompt-input.tsx` — Chat input component

## UI Kit (`ui/` — 29 shadcn/ui components)
Standard shadcn/ui primitives. Do not modify directly — use `npx shadcn@latest add <component>` to update.

## Gotchas
- `key={previewUrl}` forces iframe remount on URL change (prevents stale preview)
- iframe `postMessage` origin validated against Daytona domain regex
- `apiFetch()` from `@/lib/utils` auto-injects Supabase Bearer token — use it for all API calls
