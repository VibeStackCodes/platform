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
- `agent.tsx` — Accordion wrapper (BotIcon, model badge)
- `message.tsx` / `message-response.tsx` — Chat bubbles (user vs assistant)
- `code-block.tsx` — Syntax-highlighted code (Shiki)
- `conversation.tsx` — Scrollable container with auto-scroll-to-bottom
- `file-tree.tsx` — Recursive folder/file tree
- `plan.tsx` — Collapsible plan display
- `web-preview.tsx` — iframe wrapper with loading state
- `theme-tokens-card.tsx`, `architecture-card.tsx`, `page-progress-card.tsx`, `file-assembly-card.tsx` — Timeline cards
- `prompt-input.tsx` — Chat input component
- `stack-trace.tsx` — Error frames + copy button

## UI Kit (`ui/` — 29 shadcn/ui components)
Standard shadcn/ui primitives. Do not modify directly — use `npx shadcn@latest add <component>` to update.

## Gotchas
- `key={previewUrl}` forces iframe remount on URL change (prevents stale preview)
- iframe `postMessage` origin validated against Daytona domain regex
- `apiFetch()` from `@/lib/utils` auto-injects Supabase Bearer token — use it for all API calls
