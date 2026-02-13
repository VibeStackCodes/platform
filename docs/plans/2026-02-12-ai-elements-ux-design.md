# AI Elements UX Improvements Design

**Date**: 2026-02-12
**Status**: Approved

## Overview

Integrate 5 unused Vercel AI Elements into the builder page to improve UX across plan approval and code generation phases. No new components — only wiring existing installed elements.

## Elements to Integrate

| Element | Phase | Purpose |
|---------|-------|---------|
| ChainOfThought | Plan approval | Show AI's planning steps before presenting the plan |
| Confirmation | Plan approval | Proper approve/reject UX replacing raw Button |
| StackTrace | Generation | Display build errors with parsed frames and copy |
| Checkpoint | Generation | Milestone markers between generation stages |
| Commit | Generation | Show git commits per layer with file list |

## Phase 1: Plan Approval Polish

### ChainOfThought
- New `thinking_steps` chat tool that the model calls before `show_plan`
- Renders `ChainOfThoughtStep` items with `active`/`complete` status
- Steps: "Analyzing requirements" → "Designing schema" → "Planning architecture" → "Selecting dependencies"
- Collapsible via `ChainOfThoughtHeader`

### Confirmation
- Replace the raw `<Button>Approve & Generate</Button>` with `<Confirmation>`
- `ConfirmationRequest` shows "Approve" and "Request Changes" actions
- `ConfirmationAccepted` shows green confirmation state, triggers generation
- `ConfirmationRejected` sends rejection reason back to chat via `addToolResult`
- Uses the AI SDK's `approval` tool state (`approval-requested` → `approval-responded`)

## Phase 2: Generation Feedback

### StackTrace
- When `verifyAndFix` encounters build errors, emit `build_error` stream events with the raw error text
- Render `<StackTrace trace={error}>` inline in the generation queue
- Collapsible frames, error type highlighting, copy button
- Shows file paths with line numbers from TypeScript/ESLint errors

### Checkpoint
- Rendered between generation stages as horizontal separator markers
- Events: layer transitions, build verification start, verification pass/fail
- `<Checkpoint><CheckpointIcon /><CheckpointTrigger>Build verification</CheckpointTrigger></Checkpoint>`

### Commit
- After each layer's git commit in the sandbox, emit `layer_commit` event
- Render `<Commit>` with hash, message ("Generated layer 2: UI components"), and file list
- `CommitFile` entries show file paths with `added` status badges
- Collapsible content showing all files in the commit

## Stream Event Changes

New `StreamEvent` types in `lib/types.ts`:

```typescript
| { type: 'build_error'; error: string }
| { type: 'checkpoint'; label: string; status: 'active' | 'complete' }
| { type: 'layer_commit'; layer: number; hash: string; message: string; files: string[] }
```

## Files Modified

| File | Changes |
|------|---------|
| `lib/types.ts` | Add `build_error`, `checkpoint`, `layer_commit` to StreamEvent union |
| `lib/chat-tools.ts` | Add `thinking_steps` tool |
| `lib/generator.ts` | Emit `checkpoint` and `layer_commit` events |
| `lib/verifier.ts` | Emit `build_error` and `checkpoint` events |
| `components/builder-chat.tsx` | Render ChainOfThought, Confirmation, StackTrace, Checkpoint, Commit |
| `app/api/chat/route.ts` | Wire `thinking_steps` tool in mock mode |

## Dropped (Daytona provides these)

- Terminal (Daytona IDE has integrated terminal)
- FileTree (Daytona IDE has file explorer)
- CodeBlock (Daytona IDE has syntax-highlighted editor)
- EnvironmentVariables (security risk — don't leak credentials in UI)
