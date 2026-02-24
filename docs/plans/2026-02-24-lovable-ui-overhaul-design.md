# Lovable-Inspired UI Overhaul

**Date:** 2026-02-24
**Status:** Approved
**Approach:** Bottom-Up (Chat UX → Plan Mode → Visual Editing)

## Context

VibeStack's builder UI currently uses per-agent accordion cards in a 30/70 chat/preview split. Lovable.dev has set a higher bar with condensed action cards, plan-mode approval flows, and AST-based visual editing. This design brings those patterns to VibeStack in three independently shippable phases.

## Phase 1: Chat UX Overhaul

### 1.1 Condensed Action Cards

Replace per-agent accordions (Analyst, Architect, Frontend, Backend, QA) with operation-type cards:

| Card | Source Agent | Summary Line | Details Tab | Preview Tab |
|------|-------------|--------------|-------------|-------------|
| Thought for Xs | Analyst | Elapsed time + reasoning text | Full analysis | — |
| Designed architecture | Architect | "8 pages, kanban archetype" | Theme tokens + sitemap | Color swatches |
| Generated N pages | Frontend | "5/8 complete" + progress bar | Per-page status list | Code per page |
| Assembled N files | Backend + provisioner | "12 files, 2 packages" | File list + installed packages | — |
| Validation passed/failed | QA | "14/14 checks" | Test result rows | — |

Cards are collapsed by default. Each has a Details/Preview toggle (like Lovable). Running state shows spinner + elapsed time.

### 1.2 Thinking Indicator

First card in every generation: "Thought for Xs" block.
- Elapsed time counter starts when analyst begins
- Streams reasoning text in real-time
- When complete, freezes to "Thought for 12s"
- Structured format: bold **Features:**, **Design:** sections

### 1.3 Input Area Redesign

Add mode badges to PromptBar: "Edit" (default), "Chat" (talk only), "Plan" (show plan first).
- Visual edits button (hidden until Phase 3)
- Element selection pill badge above input: `Editing <Button> in dashboard.tsx:42`
- Credit display and model selector remain

### 1.4 Chat Polish

- Subtle separator lines between generation runs
- "Your app is ready!" → add inline "Preview" and "Code" quick-action buttons
- Keep user messages right-aligned, assistant left-aligned

## Phase 2: Plan Mode

### 2.1 Pipeline Change

New XState state between `designing` and `codeGeneration`:

```
designing → planning → [PLAN_APPROVED] → codeGeneration
                     → [PLAN_REVISED]  → designing
```

Planning state:
1. Takes architect output (CreativeSpec + sitemap)
2. Generates structured plan: files to create with purposes
3. Emits `plan_ready` SSE event
4. Machine pauses for user input

### 2.2 Plan Card UI

Inline card in chat showing:
- File list with descriptions (e.g., "src/pages/Dashboard.tsx — Kanban board with drag-and-drop")
- "Implement" button → `PLAN_APPROVED` event
- "Revise" button → text input for feedback → `PLAN_REVISED` event

### 2.3 Plan Mode Toggle

Input area mode badge: "Plan" = always show plan before generating. "Edit" = skip plan. Per-generation, not global.

## Phase 3: Visual Editing (Floating Property Panels)

### 3.1 Source Mapping

During codegen in `page-generator.ts`, inject `data-vibe-source="filename:line"` attributes onto JSX elements. Maps DOM elements back to source.

### 3.2 Overlay Script

Inject `vibestack-overlay.js` into preview iframe:
1. Listens for `VIBESTACK_ENTER_EDIT_MODE` postMessage
2. Adds hover outlines to elements with `data-vibe-source`
3. On click, sends `VIBESTACK_ELEMENT_SELECTED` with: source, tagName, textContent, computedStyles (color, bg, fontSize, fontWeight, padding, margin, textAlign), boundingRect

### 3.3 Floating Panel

Renders outside iframe, positioned adjacent to selected element. Controls:
- Text input
- Color pickers (text color, background)
- Font size + weight
- Padding (4 values)
- Text alignment (L/C/R)
- Apply / Cancel buttons

### 3.4 Edit Application

On "Apply":
1. Build diff description from changed properties
2. Send to `/api/agent/edit` (existing edit endpoint)
3. Edit machine applies change via LLM
4. Preview refreshes via HMR

Future optimization (Phase 3b): skip LLM for simple property changes, use direct AST transforms.

## Files Affected

### Phase 1 (Chat UX)
- `src/components/builder-chat.tsx` — major rewrite of timeline rendering
- `src/components/ai-elements/` — new condensed card components
- `src/components/ai-elements/prompt-bar.tsx` — mode badges
- `src/components/ai-elements/thinking-card.tsx` — new
- `src/components/ai-elements/action-card.tsx` — new (generic card with Details/Preview)

### Phase 2 (Plan Mode)
- `server/lib/agents/machine.ts` — add `planning` state
- `server/lib/agents/orchestrator.ts` — plan generation actor
- `server/routes/agent.ts` — handle `PLAN_APPROVED`/`PLAN_REVISED` events
- `src/components/ai-elements/plan-card.tsx` — new
- `src/components/builder-chat.tsx` — plan card rendering + approval buttons

### Phase 3 (Visual Editing)
- `server/lib/page-generator.ts` — inject `data-vibe-source` attributes
- `snapshot/` — include overlay script in sandbox base
- `src/components/builder-preview.tsx` — floating panel positioning
- `src/components/ai-elements/property-panel.tsx` — new
- `src/components/builder-chat.tsx` — visual edit mode toggle

## Non-Goals

- Version history with screenshot thumbnails (separate project)
- Drag-and-drop layout editing (Figma-level design tools)
- Multi-user collaborative editing
