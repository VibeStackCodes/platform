# Visual Editor Redesign — Lovable-Style Layout

**Date**: 2026-03-03
**Status**: Approved

## Overview

Redesign the visual editor to match Lovable's UX: when "Editing" is toggled, the chat column is replaced by a full property inspector sidebar (320px), and the preview expands to fill remaining width. A floating toolbar appears on selected elements. A mini prompt bar at the bottom of the sidebar allows AI-assisted edits without leaving edit mode.

## Layout Architecture

### Chat mode (current, unchanged)
```
┌─────────────────┬──────────────────────────────┐
│   ChatColumn    │         RightPanel           │
│   (left, ~40%)  │    (preview/code, ~60%)      │
└─────────────────┴──────────────────────────────┘
```

### Editing mode (new)
```
┌─────────────────┬──────────────────────────────┐
│  EditorSidebar  │       Preview (expanded)     │
│   (left, 320px) │                              │
│  ← Back to Chat │  header: tabs/deploy         │
│  Design / div   │  iframe preview              │
│  [Select parent]│  floating toolbar on elem    │
│  CLASSES        │  GestureScreen               │
│  COLORS         │  EditorOverlay               │
│  SPACING        │                              │
│  ...sections... │                              │
│  ADVANCED       │                              │
│  ─────────────  │                              │
│  prompt input   │                              │
└─────────────────┴──────────────────────────────┘
```

**Toggle**: `editorStore.mode !== 'off'` — ChatColumn hidden (CSS display:none, stays mounted), EditorSidebar shown, RightPanel expands.

## EditorSidebar Sections

### For text/button/container elements:
1. **CLASSES** — Tailwind pills (read-only)
2. **COLORS** — Text color (swatch + Inherit), Background color (swatch + Inherit)
3. **SPACING** — Box model diagram + per-side margin (4 inputs) + per-side padding (4 inputs)
4. **LAYOUT** — Display dropdown (block/flex/grid/inline/none)
5. **SIZE** — Width + Height inputs
6. **TYPOGRAPHY** — Font Size, Weight (dropdown), Align (dropdown)
7. **BORDER** — Width (dropdown), Color (swatch + Inherit), Style (dropdown)
8. **EFFECTS** — Border radius (dropdown), Shadow (dropdown), Opacity (dropdown)
9. **ADVANCED** — Collapsible, raw Tailwind class input

### For image elements:
1. **IMAGE** — Preview thumbnail, file upload button, "Edit with VibeStack" textarea + Generate button
2. **LAYOUT** — Object-fit dropdown (Cover/Contain/Fill/None)
3. **SIZE** — Width + Height
4. **BORDER** — Width, Color, Style dropdowns
5. **EFFECTS** — Border radius, Shadow, Opacity dropdowns
6. **ADVANCED** — Raw Tailwind class input

## Floating Toolbar

Positioned above selected element in EditorOverlay. Buttons:
- AI prompt input ("Ask VibeStack...") + send
- Text edit (T icon) — starts inline text editing
- Code view (</> icon) — opens file in Code tab
- Delete (trash icon) — removes element via AST

## Data Flow

1. User edits input → setLocalStyles() (instant) → penpal.applyStylePreview() (instant visual) → debounce 300ms → POST /api/editor/patch (persist) → auto-commit+push
2. Mini prompt → prepend element context → POST /api/agent (SSE) → response inline
3. Select parent → read parentOid → penpal.getElementByOid() → setSelectedElement()
4. Delete → POST /api/editor/patch { type: 'delete' } → AST removes JSX element → HMR

## New Backend Support

### AST patcher: `delete` operation
Remove the entire JSX element matching `data-oid` from its parent's children array.

### Preload script: expanded computedStyles
Return per-side margin/padding (marginTop, marginRight, etc.) and additional properties (borderWidth, borderStyle, borderColor, borderRadius, opacity, boxShadow, objectFit, flexDirection, gap).

## Files Changed

### New files:
- `src/components/editor/editor-sidebar.tsx` — Full sidebar with all property sections
- `src/components/editor/floating-toolbar.tsx` — Floating bar on selected element

### Modified files:
- `src/components/builder-page.tsx` — Layout swap: ChatColumn hidden ↔ EditorSidebar shown
- `src/components/right-panel.tsx` — Remove PropertyInspector overlay, accept expanded width
- `src/components/editor/editor-overlay.tsx` — Integrate FloatingToolbar
- `server/lib/editor/ast-patcher.ts` — Add 'delete' operation type
- `server/routes/editor-patch.ts` — Add 'delete' to schema enum
- `snapshot/scaffold/src/__vibestack-preload.ts` — Expand computedStyles, add deleteElement method
