# Visual Editor Design — Wix-Style Inline Editing for Generated Apps

**Date:** 2026-03-03
**Branch:** feature/edits
**Status:** Approved

## Summary

Add a visual editor overlay to the builder preview that lets users directly edit text, replace images, tweak styles, resize elements, and reorder sections — all reflected back to the React source code in the Daytona sandbox. Modeled after Wix Harmony's editor architecture (iframe + parent overlay + postMessage bridge).

## Goals

- **Inline text editing** — click → type → source file updated
- **Image replacement** — upload from local file → saved to sandbox `/public/images/` → source `src` updated
- **Style tweaks** — colors, spacing, font size, borders via PropertyInspector sidebar
- **Section reordering** — move sections up/down with arrow buttons
- **Element resize** — drag handles on images and containers
- **Undo/redo** — Ctrl+Z / Ctrl+Shift+Z (session-local)
- **Toggle mode** — Edit button in preview header; off = normal iframe, on = editor overlay

## Non-Goals (Future)

- Drag-and-drop new elements from a component palette
- Responsive breakpoint editing
- Animation controls
- Layer panel / z-index management
- Grid/flexbox visual layout editor

## Architecture

### System Diagram

```
┌─────────────────── VibeStack Platform (Parent) ──────────────────────┐
│                                                                       │
│  RightPanel Header: [Preview] [Code]  ........  [✏️ Edit] [Deploy]   │
│                                                                       │
│  ┌─── iframe (Daytona sandbox preview) ──────────────────────────┐   │
│  │                                                                │   │
│  │  Vite plugin (vite-plugin-vibestack-editor):                   │   │
│  │  ├─ Babel transform: data-vs-id="<file>:<line>:<col>:<sibling>"│   │
│  │  ├─ bridge.js (~3KB, injected via transformIndexHtml)          │   │
│  │  └─ Dev-only (stripped from production builds)                 │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─── EditorOverlay (position:absolute over iframe) ─────────────┐   │
│  │  - HoverRect, SelectRect, TagLabel                             │   │
│  │  - ContextualToolbar, FormatMiniToolbar                        │   │
│  │  - SectionMoveButtons (↑ ↓), ResizeHandles                    │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─── PropertyInspector (sidebar, 240px) ────────────────────────┐   │
│  ┌─── useEditorBridge (hook) ────────────────────────────────────┐   │
│  ┌─── Edit Executor (tiered) ────────────────────────────────────┐   │
│  ┌─── UndoStack (command pattern) ───────────────────────────────┐   │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Vite Plugin — `vite-plugin-vibestack-editor`

Lives in the sandbox scaffold (`snapshot/template/`). Two responsibilities:

**Babel JSX Transform** — Injects `data-vs-id` attribute on every JSX element at compile time via `@vitejs/plugin-react`'s `babel.plugins` array. Custom plugin (~50 lines, zero deps).

```jsx
// Input
<h1 className="text-xl">Hello</h1>

// Output (dev only)
<h1 className="text-xl" data-vs-id="src/App.tsx:14:6:0">Hello</h1>
```

ID format: `<relative-file>:<line>:<column>:<sibling-index>`. The sibling index disambiguates `.map()` elements that share the same source location. Computed at runtime by the Babel transform counting sibling JSX elements at the same parent level.

**Script Injection** — Injects `bridge.js` into `index.html` via Vite's `transformIndexHtml` hook. Dev-only; not included in production builds.

#### 2. bridge.js (~3KB)

Lightweight vanilla JS script running inside the iframe. No React dependencies.

**Responsibilities:**
- Listen for `SET_EDIT_MODE` from parent to activate/deactivate
- On mousemove: find nearest ancestor with `data-vs-id`, send `ELEMENT_HOVERED` with element rect, tag name, computed styles
- On click: send `ELEMENT_SELECTED` with full element info (rect, styles, Tailwind classes, text content)
- On dblclick (text elements): enable `contentEditable`, send `TEXT_EDIT_START`
- On blur/Enter (text edit): send `TEXT_EDIT_COMMIT` with new text
- On scroll: send `VIEWPORT_SCROLL` with scrollX/scrollY (rAF-throttled)
- Listen for `APPLY_STYLE_PREVIEW`: temporarily apply CSS to element for live preview before source edit
- Listen for `DESELECT`: clear selection state

**Element resolution strategy:** On any mouse event, walk up DOM from `event.target` using `element.closest('[data-vs-id]')` to find the nearest annotated ancestor. Report both the `data-vs-id` and the path from the annotated ancestor to the actual event target (for disambiguating children of annotated elements).

#### 3. postMessage Protocol

TypeScript discriminated union — shared type definitions in a protocol file.

```typescript
// Parent → Iframe
type ParentToIframe =
  | { type: 'SET_EDIT_MODE'; enabled: boolean }
  | { type: 'DESELECT' }
  | { type: 'APPLY_STYLE_PREVIEW'; elementId: string; property: string; value: string }
  | { type: 'SECTION_MOVE'; elementId: string; direction: 'up' | 'down' }

// Iframe → Parent
type IframeToParent =
  | { type: 'IFRAME_READY' }
  | { type: 'ELEMENT_HOVERED'; id: string; rect: SerializedRect; tagName: string }
  | { type: 'ELEMENT_SELECTED'; id: string; rect: SerializedRect; tagName: string;
      textContent: string; tailwindClasses: string[]; computedStyles: Record<string, string> }
  | { type: 'ELEMENT_DESELECTED' }
  | { type: 'TEXT_EDIT_START'; id: string; currentText: string }
  | { type: 'TEXT_EDIT_COMMIT'; id: string; newText: string }
  | { type: 'VIEWPORT_SCROLL'; scrollX: number; scrollY: number }
  | { type: 'ELEMENT_RESIZED'; id: string; width: number; height: number }
  | { type: 'SECTION_MOVED'; id: string; direction: 'up' | 'down'; success: boolean }
```

**Handshake:** Parent waits for `IFRAME_READY` (max 10s). Iframe sends it on DOMContentLoaded. Parent responds with `SET_EDIT_MODE { enabled: false }` (edit mode starts off).

**Origin validation:** In dev, accept same-origin. In production, validate against the sandbox's known origin.

#### 4. useEditorBridge Hook

Parent-side React hook managing the bridge lifecycle.

```typescript
function useEditorBridge(iframeRef: RefObject<HTMLIFrameElement>, editMode: boolean) {
  // Returns:
  hoveredElement: ElementInfo | null
  selectedElement: ElementInfo | null
  isEditing: boolean
  scrollOffset: { x: number; y: number }
  iframeReady: boolean

  // Methods:
  sendToIframe(message: ParentToIframe): void
  deselect(): void
  applyStylePreview(elementId: string, prop: string, value: string): void
  moveSection(elementId: string, direction: 'up' | 'down'): void
}
```

**Coordinate translation:** `overlayRect = iframeBoundingRect + elementRect - scrollOffset`. Updated on every `VIEWPORT_SCROLL` message (rAF-throttled from bridge.js) and on iframe resize (ResizeObserver).

#### 5. EditorOverlay

Absolutely positioned `<div>` rendered on top of the iframe in the parent. Reuses existing Storybook-proven components with modifications:

- **HoverRect** — adapted from `ElementOverlay` hover state. `pointer-events: none`.
- **SelectRect** — adapted from `ElementOverlay` select state. `pointer-events: none` except resize handles.
- **ResizeHandles** — 8 corner/edge handles using `re-resizable` (4.5KB). `pointer-events: auto`. On resize end, sends `ELEMENT_RESIZED` to Edit Executor.
- **ContextualToolbar** — reused from `editable-preview/contextual-toolbar.tsx`. Positioned via `@floating-ui/react` relative to overlay rect.
- **FormatMiniToolbar** — reused from `editable-preview/format-mini-toolbar.tsx`. Active during text editing.
- **SectionMoveButtons** — ↑/↓ arrows shown on section-type elements. `pointer-events: auto`. On click, sends `SECTION_MOVE` to iframe.
- **TagLabel** — element tag displayed above hover/select rect.

**Pointer event routing:** Overlay div is `pointer-events: none`. Interactive controls (resize handles, toolbar buttons, move arrows) are individually `pointer-events: auto`. All other clicks pass through to the iframe where bridge.js handles them.

#### 6. PropertyInspector

Reused from `editable-preview/property-inspector.tsx`. Renders as a right sidebar (240px) when an element is selected. Receives `computedStyles` and `tailwindClasses` from the bridge's `ELEMENT_SELECTED` message.

Property changes fire an edit command to the Edit Executor:
- Color changes → find and swap Tailwind color class
- Spacing changes → swap Tailwind margin/padding class
- Font size → swap Tailwind text-size class
- Width/height → swap Tailwind w-/h- class
- Background → swap Tailwind bg- class

#### 7. Edit Executor — Tiered Strategy

All edits flow through a single executor that chooses the fastest viable strategy.

**Tier 1 — Instant AST Patch (~50-200ms):**
- Text literal: `<h1>Hello</h1>` → `<h1>Welcome</h1>`
- Simple className swap: `bg-blue-500` → `bg-red-600`
- Attribute change: `src="/old.jpg"` → `src="/new.jpg"`
- Section reorder: swap sibling JSX nodes by line position
- Implementation: Read file from sandbox → `@babel/parser` + `traverse` + `generator` → patch AST node at line:col → write file back → Vite HMR

**Tier 2 — AI Agent (~3-5s):**
- Dynamic text: `{title}`, `t('hero.title')`, `.map()` items
- Complex className: `cn('bg-blue', isActive && 'bg-green')`
- Layout restructuring
- Implementation: Send structured prompt to orchestrator agent with file path, element ID, and desired change → agent calls editFile/writeFile → Vite HMR

**Tier 3 — User Clarification:**
- Multiple elements at same source location (ambiguous `.map()`)
- Unknown edit intent
- Show inline dialog in EditorOverlay asking user to specify

**Tier detection logic:** Parse the source file at the given line:col. If the JSX text/attribute is a string literal → Tier 1. If it's a JSX expression (`{...}`) → Tier 2. If multiple elements share the same source ID → Tier 3.

**Optimistic updates for text editing:** The contentEditable change in the iframe is the immediate visual state. The source patch runs in background. If Vite HMR result matches the contentEditable state (expected), smooth. If it differs (agent changed more), accept the HMR version (source is truth).

#### 8. UndoStack — Command Pattern

```typescript
interface EditCommand {
  file: string
  previousContent: string
  newContent: string
  timestamp: number
  description: string // "Changed text in Hero.tsx:14"
}

// Stack: EditCommand[]
// Max 50 entries, oldest evicted
// Ctrl+Z → write previousContent → Vite HMR
// Ctrl+Shift+Z → write newContent → Vite HMR
// Cleared on: page refresh, AI agent generation complete
```

Session-local only (matches Wix Harmony's approach).

#### 9. Image Replacement Flow

1. User clicks image → ContextualToolbar shows "Replace" button
2. Click Replace → native file picker (`<input type="file" accept="image/*">`)
3. File selected → upload to sandbox via Daytona file upload API → `/public/images/<filename>`
4. Edit Executor (Tier 1): patch `src` attribute in source file → Vite HMR reloads
5. Image committed to git repo on next `commitAndPush` (persists across sandbox recreation)

#### 10. Conflict Resolution

- During AI agent generation: visual edit mode is **locked** (Edit toggle disabled, grayed out, "AI is working..." tooltip)
- After generation completes: undo stack **cleared** (agent's changes are the new baseline), edit mode re-enabled
- If user queues a visual edit during generation: edit is discarded with a toast notification ("Edit discarded — AI was modifying files")

## Technology Stack

### Chosen (with rationale)

| Tool | Version | Size | Rationale |
|------|---------|------|-----------|
| Custom Babel plugin | N/A | ~50 lines | Same pattern as `@react-dev-inspector/babel-plugin` and Wix Codux's transpiler hints. Custom = full control over ID format, zero runtime. [Source](https://react-dev-inspector.zthxxx.me/docs/compiler-plugin) |
| @dnd-kit — **REMOVED** | — | — | Originally planned for iframe section reorder. Dropped because dnd-kit uses pointer events (not HTML5 DnD) which don't cross iframe boundaries, and injecting React context into the generated app's component tree is infeasible. Replaced with move-up/move-down buttons. |
| @floating-ui/react | 0.27.18 | Already installed | De facto positioning standard. 4.4M downloads/week. Used by Radix/shadcn (already in our deps). [Source](https://www.npmjs.com/package/@floating-ui/react) |
| re-resizable | 6.11.2 | ~4.5KB | React-native resize handles. 639 npm dependents. Works in parent overlay without iframe-specific config. [Source](https://www.npmjs.com/package/re-resizable) |
| @babel/parser + traverse + generator | Current | Server-only | Required for AST-based source patching. OXC is 50x faster but its userspace plugin API is Rust-only (no JS/TS custom transforms as of March 2026). Since this runs on individual file edits (not hot-path), Babel speed is sufficient. [Source](https://oxc.rs/blog/2024-09-29-transformer-alpha) |
| Custom bridge.js | N/A | ~3KB | Too simple for a library — just addEventListener + postMessage + getBoundingClientRect. [Source](https://www.nickwhite.cc/blog/strongly-typed-iframe-messaging/) |

### Discarded (with rationale)

| Tool | Why discarded |
|------|---------------|
| **Puck** (v0.20.2) | Page builder requiring pre-declared component registry. Output is JSON, not .tsx source. Cannot edit arbitrary React projects. [Source](https://puckeditor.com/docs) |
| **GrapeJS** (v0.22.14) | HTML/email editor with jQuery dependency. Operates on raw HTML, not JSX/React. 500KB+. [Source](https://www.npmjs.com/package/grapesjs) |
| **craft.js** (v0.1.0-beta.3) | Abandoned (233 downloads/week). Critical iframe coordinate bug open since 2020. React 18/19 issues. [Source](https://github.com/prevwong/craft.js/issues/16) |
| **interact.js** (v1.10.27) | No release since 2023. No React bindings. Overlaps with re-resizable. [Source](https://github.com/taye/interact.js) |
| **LocatorJS** (v0.5.0) | Devtools-only (alt+click → open editor). 514KB runtime. Reads React fiber internals. Custom plugin is lighter, our format, zero runtime. [Source](https://www.npmjs.com/package/locatorjs) |
| **react-dnd** (v16.0.1) | No release in 4 years. Legacy React patterns. Surpassed by dnd-kit (8M vs 2.7M downloads/week). [Source](https://www.npmjs.com/package/react-dnd) |
| **@hello-pangea/dnd** | List-only DnD (no 2D/canvas). Original react-beautiful-dnd archived by Atlassian Aug 2025. [Source](https://github.com/hello-pangea/dnd) |
| **Builder.io SDK** | Visual editor is closed-source, cloud-only. Cannot self-host. Output is proprietary JSON. [Source](https://forum.builder.io/t/is-builder-io-open-source-software-can-we-self-host/2634) |
| **Plasmic** | Editor (Plasmic Studio) is SaaS-only. Codegen requires Plasmic cloud API. Generates Plasmic-flavored React. [Source](https://forum.plasmic.app/t/self-hosted-limitations/8904) |

## Sandbox Scaffold Changes

The `snapshot/template/` directory (vibestack-template repo) needs:

1. **New Vite plugin file:** `vite-plugin-vibestack-editor.ts` (Babel transform + bridge injection)
2. **New bridge script:** `public/__vibestack-bridge.js` (or served via Vite middleware)
3. **Dev dependency:** None new — `@vitejs/plugin-react` already supports `babel.plugins`
4. **vite.config.ts update:** Add the plugin to the plugins array (dev-only)

## API Changes

### New server endpoint: `POST /api/editor/patch`

Receives edit commands from the frontend, executes AST patches on sandbox files.

```typescript
// Request
{
  projectId: string
  sandboxId: string
  edits: Array<{
    file: string        // relative path in sandbox
    line: number
    column: number
    type: 'text' | 'attribute' | 'className' | 'reorder'
    value: string       // new text, new class, new attribute value
    previousValue?: string // for undo
  }>
}

// Response
{
  success: boolean
  results: Array<{
    file: string
    previousContent: string
    newContent: string
  }>
}
```

For Tier 2 edits, the frontend sends a chat message via the existing `/api/agent` SSE endpoint with structured context about the visual edit.

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dynamic content not patchable by AST | High | Tier 2 falls back to AI agent |
| Coordinate translation jank on scroll | Medium | rAF throttle + ResizeObserver + scroll debounce |
| Vite HMR latency (400ms-1.1s) | Medium | Optimistic contentEditable state; background source patch |
| Image persistence on sandbox destruction | Medium | Images committed to git on commitAndPush |
| Chat + visual edit conflicts | Medium | Lock visual edit during AI generation |
| Sibling index for .map() elements | Medium | Runtime sibling counting in Babel transform; DOM walk fallback |

## References

- [Wix Harmony Architecture](https://www.wix.com/harmony) — iframe + overlay + JSON document model
- [Codux Elements Tree Panel](https://medium.com/wix-engineering/codux-by-wix-case-study-how-we-built-the-elements-tree-panel-d1952ff8808e) — TypeScript AST + FiberNode correlation for source mapping
- [React Dev Inspector](https://react-dev-inspector.zthxxx.me/docs/compiler-plugin) — Babel plugin pattern for `data-inspector-*` attributes
- [Wix Architecture (High Scalability)](https://highscalability.com/nifty-architecture-tricks-from-wix-building-a-publishing-pla/) — JSON storage model, active/archive DB split
- [Strongly-typed iframe messaging](https://www.nickwhite.cc/blog/strongly-typed-iframe-messaging/) — TypeScript discriminated union postMessage protocol
