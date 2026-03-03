# Visual Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Wix-style visual editing (inline text, image replace, style tweaks, section reorder, resize, undo) to the builder preview iframe, with edits reflected back to React source code in the Daytona sandbox.

**Architecture:** Onlook-inspired two-phase editing — instant CSS preview via injected `<style>` rules (16ms feedback), followed by async AST source patching via `@babel/parser`. Parent communicates with cross-origin iframe via Penpal RPC. GestureScreen captures mouse events in parent, resolves elements via Penpal calls to preload script inside iframe.

**Tech Stack:** Penpal (RPC), @babel/standalone (OID injection), @babel/parser+traverse+generator (AST patching), tailwind-merge (class manipulation), nanoid (OID generation), css-tree (CSS Manager), re-resizable (resize handles), @floating-ui/react (toolbar positioning)

---

## Task 1: Shared Types & Protocol

**Files:**
- Create: `src/lib/editor-types.ts`

Defines all shared types used across the visual editor system. Must be created first as all other tasks depend on these types.

```typescript
// src/lib/editor-types.ts
import type { CSSProperties } from 'react'

/** Element info serialized from iframe to parent via Penpal */
export interface EditorElementInfo {
  oid: string                    // data-oid value (7-char nanoid, source-stable)
  odid: string                   // data-odid value (runtime, for CSS targeting)
  tagName: string
  textContent: string
  rect: SerializedRect
  tailwindClasses: string[]
  computedStyles: Record<string, string>
  elementType: 'text' | 'image' | 'button' | 'container'
  isEditable: boolean            // true if text content is a string literal (Tier 1)
  imageSrc?: string              // for img elements
  parentOid?: string             // parent element's OID
}

export interface SerializedRect {
  x: number
  y: number
  width: number
  height: number
}

/** Methods exposed by iframe preload script (Penpal child) */
export interface PreloadChildMethods {
  getElementAtPoint(x: number, y: number): EditorElementInfo | null
  getElementByOid(oid: string): EditorElementInfo | null
  getAllElements(): EditorElementInfo[]
  startTextEditing(oid: string): void
  stopTextEditing(): { oid: string; newText: string } | null
  applyStylePreview(odid: string, styles: Record<string, string>): void
  clearStylePreviews(): void
  clearStylePreview(odid: string): void
  getComputedStyles(oid: string): Record<string, string>
  getTailwindClasses(oid: string): string[]
  scrollToElement(oid: string): void
  getViewportScroll(): { x: number; y: number }
  setEditMode(enabled: boolean): void
  highlightElement(oid: string): void
  unhighlightElement(): void
}

/** Methods exposed by parent (Penpal parent) */
export interface ParentMethods {
  onTextEditCommit(oid: string, newText: string): void
  onElementClicked(info: EditorElementInfo): void
}

/** Edit command for undo stack */
export interface EditCommand {
  id: string
  file: string
  previousContent: string
  newContent: string
  timestamp: number
  description: string
}

/** Edit request sent to /api/editor/patch */
export interface PatchRequest {
  projectId: string
  sandboxId: string
  edits: PatchEdit[]
}

export interface PatchEdit {
  file: string
  oid: string
  type: 'text' | 'className' | 'attribute' | 'reorder'
  value: string
  previousValue?: string
}

export interface PatchResponse {
  success: boolean
  results: Array<{
    file: string
    previousContent: string
    newContent: string
    error?: string
  }>
}

/** Editor state for zustand store */
export type EditorMode = 'off' | 'select' | 'editing'

export interface EditorState {
  mode: EditorMode
  hoveredElement: EditorElementInfo | null
  selectedElement: EditorElementInfo | null
  isTextEditing: boolean
  undoStack: EditCommand[]
  redoStack: EditCommand[]
  isPatchInFlight: boolean
}
```

---

## Task 2: OID Injector Utility

**Files:**
- Create: `server/lib/editor/oid-injector.ts`
- Create: `tests/oid-injector.test.ts`

Server-side utility that adds `data-oid` attributes to JSX elements in source files using `@babel/parser` + `@babel/traverse` + `@babel/generator`. Called after `writeFile` and `editFile` tool executions.

Key behaviors:
- Parse TSX/JSX files only (skip .css, .json, etc.)
- Add `data-oid="<7-char-nanoid>"` to JSX elements that don't already have one
- Preserve existing `data-oid` attributes (stable across edits)
- Use `retainLines: true` to minimize diff noise
- Return the modified source code string

---

## Task 3: Wire OID Injection into Agent Tools

**Files:**
- Modify: `server/lib/agents/tools.ts` (writeFileTool, editFileTool, writeFilesTool)

After each file write/edit, if the file is `.tsx` or `.jsx`, run the OID injector on the content before uploading to sandbox.

---

## Task 4: Preload Script (iframe-side)

**Files:**
- Create: `snapshot/scaffold/src/__vibestack-preload.ts`

~200 lines. Runs inside the iframe. Uses Penpal to expose child methods to parent. Handles:
- Runtime `data-odid` assignment via MutationObserver
- CSS Manager (`<style>` element with `[data-odid]` selectors)
- Element resolution (`document.elementFromPoint` → walk to nearest `[data-oid]`)
- Text editing (contentEditable toggle)
- Viewport scroll reporting

---

## Task 5: Vite Plugin (sandbox scaffold)

**Files:**
- Create: `snapshot/scaffold/vite-plugin-vibestack-editor.ts`
- Modify: `snapshot/scaffold/vite.config.ts`
- Modify: `snapshot/scaffold/package.json` (add penpal, css-tree deps)

Vite plugin that:
1. Injects preload script into `index.html` via `transformIndexHtml`
2. Dev-only (not included in production builds)

---

## Task 6: useEditorBridge Hook

**Files:**
- Create: `src/hooks/use-editor-bridge.ts`

Parent-side React hook managing Penpal connection to iframe. Returns typed proxy to iframe's methods, connection state, and convenience methods.

---

## Task 7: Editor Zustand Store

**Files:**
- Create: `src/lib/editor-store.ts`

Zustand store for editor state: mode, hovered/selected element, undo/redo stacks, patch-in-flight flag.

---

## Task 8: GestureScreen Component

**Files:**
- Create: `src/components/editor/gesture-screen.tsx`

Transparent div over iframe. Captures mouse events, translates coordinates, calls Penpal methods to resolve elements. Fires hover/select/deselect actions to editor store.

---

## Task 9: EditorOverlay Component

**Files:**
- Create: `src/components/editor/editor-overlay.tsx`

Renders HoverRect, SelectRect, TagLabel, resize handles, section move buttons, contextual toolbar over the iframe. Positioned using element rects from editor store + iframe bounding rect.

---

## Task 10: AST Patch Server Endpoint

**Files:**
- Create: `server/lib/editor/ast-patcher.ts`
- Create: `server/routes/editor-patch.ts`
- Modify: `server/index.ts` (mount route)

`POST /api/editor/patch` — receives edit commands, finds source files by OID grep, applies AST patches (text, className, attribute, reorder), writes back to sandbox.

---

## Task 11: Integration — Wire into Builder

**Files:**
- Modify: `src/components/builder-page.tsx`
- Modify: `src/components/right-panel.tsx`

Add Edit toggle button, mount GestureScreen + EditorOverlay over preview iframe, connect editor store to existing builder state.

---

## Task 12: Image Replacement Flow

**Files:**
- Modify: `src/components/editor/editor-overlay.tsx` (add Replace button)
- Modify: `server/routes/editor-patch.ts` (add image upload handler)

Upload image to sandbox `/public/images/`, patch `src` attribute in source file.

---

## Task 13: Undo/Redo

**Files:**
- Modify: `src/lib/editor-store.ts` (undo/redo actions)
- Modify: `src/components/editor/editor-overlay.tsx` (keyboard shortcuts)

Ctrl+Z / Ctrl+Shift+Z writes previous/new content back to sandbox via patch endpoint.
