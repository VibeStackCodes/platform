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

> **Inspired by Onlook** ([github.com/onlook-dev/onlook](https://github.com/onlook-dev/onlook)). We study their patterns but implement our own versions tailored to VibeStack's browser-based SPA + Daytona sandbox architecture. Onlook is an Electron desktop app — its packages are coupled to Electron's `webview` tag and local filesystem, neither of which apply here.

### Key Patterns Borrowed from Onlook

1. **Two ID systems**: `data-oid` (source-stable, in JSX) for AST mapping + `data-odid` (runtime, assigned by preload) for CSS targeting
2. **Two-phase style application**: instant CSS `<style>` injection via `[data-odid]` selectors for 16ms visual feedback, async Babel AST patch for source-of-truth
3. **Penpal RPC**: typed promise-based RPC over postMessage (replaces raw postMessage protocol)
4. **GestureScreen**: transparent div over iframe captures mouse events, calls Penpal methods to find elements at coordinates
5. **OID injection at setup/save time**: `@babel/standalone` parses and injects `data-oid` attributes (NOT a Vite compile-time plugin)

### System Diagram

```
┌─────────────────── VibeStack Platform (Parent) ──────────────────────┐
│                                                                       │
│  RightPanel Header: [Preview] [Code]  ........  [✏️ Edit] [Deploy]   │
│                                                                       │
│  ┌─── GestureScreen (transparent div, captures mouse events) ────┐   │
│  │  pointer-events: auto when edit mode on, none when off         │   │
│  │  mousemove → Penpal getElementAtPoint(x,y) → HoverRect        │   │
│  │  click → Penpal getElementAtPoint(x,y) → SelectRect           │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─── iframe (Daytona sandbox preview, cross-origin) ────────────┐   │
│  │                                                                │   │
│  │  Preload script (injected via Vite plugin):                    │   │
│  │  ├─ Exposes ~20 Penpal child methods to parent                 │   │
│  │  ├─ Assigns runtime data-odid to all DOM elements              │   │
│  │  ├─ CSS Manager: injects <style> with [data-odid] selectors    │   │
│  │  └─ Dev-only (stripped from production builds)                  │   │
│  │                                                                │   │
│  │  Source files have data-oid="<7-char-nanoid>" on JSX elements  │   │
│  │  (injected by @babel/standalone at file write time)             │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─── EditorOverlay (position:absolute over iframe) ─────────────┐   │
│  │  - HoverRect, SelectRect, TagLabel                             │   │
│  │  - ContextualToolbar, FormatMiniToolbar                        │   │
│  │  - SectionMoveButtons (↑ ↓), ResizeHandles                    │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─── PropertyInspector (sidebar, 240px) ────────────────────────┐   │
│  ┌─── useEditorBridge (Penpal connection hook) ──────────────────┐   │
│  ┌─── Edit Executor (two-phase: instant CSS + async AST) ────────┐   │
│  ┌─── UndoStack (command pattern) ───────────────────────────────┐   │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. OID Injection — `@babel/standalone` at File Write Time

**NOT a Vite compile-time plugin.** Following Onlook's pattern, OIDs are injected into source files when they are written to the sandbox. This means `data-oid` attributes exist in the actual `.tsx` source code, making source mapping trivial (grep for the OID).

The orchestrator agent's `writeFile` and `editFile` tools run a post-write pass:

```jsx
// After agent writes file, OID injector runs:
// Input
<h1 className="text-xl">Hello</h1>

// Output (written to disk)
<h1 data-oid="a7x3kf2" className="text-xl">Hello</h1>
```

- **OID format**: 7-character nanoid (stable, unique per element)
- **Implementation**: `@babel/standalone` → `traverse` JSX elements → insert `data-oid` attribute if missing
- **~30 lines of code** — runs on individual files, not the whole project
- **OIDs survive edits**: existing `data-oid` attributes are preserved; only new elements get new OIDs

#### 2. Preload Script (~200 lines, injected via Vite plugin)

Replaces the original `bridge.js` design. Runs inside the iframe, exposes Penpal child methods.

**Vite plugin** (`vite-plugin-vibestack-editor`): injects the preload script into `index.html` via `transformIndexHtml`. Dev-only; stripped from production builds.

**Preload responsibilities:**
- **Penpal child connection**: exposes ~20 typed methods callable from parent
- **Runtime `data-odid` assignment**: on DOM mutation (MutationObserver), assigns unique runtime IDs to all elements for CSS targeting
- **CSS Manager**: maintains a `<style>` element with `[data-odid]` selectors for instant style preview
- **Element resolution**: `getElementAtPoint(x, y)` → `document.elementFromPoint()` → walk up to nearest `[data-oid]` → return element info
- **Text editing**: `startTextEditing(oid)` → enable `contentEditable`, focus, select all

**Key Penpal child methods:**
```typescript
// Exposed by preload script, callable from parent
{
  getElementAtPoint(x: number, y: number): ElementInfo | null
  getElementByOid(oid: string): ElementInfo | null
  getAllElements(): ElementInfo[]
  startTextEditing(oid: string): void
  stopTextEditing(): { oid: string; newText: string }
  applyStylePreview(odid: string, styles: Record<string, string>): void
  clearStylePreviews(): void
  getComputedStyles(oid: string): Record<string, string>
  getTailwindClasses(oid: string): string[]
  scrollToElement(oid: string): void
  getViewportScroll(): { x: number; y: number }
}
```

#### 3. Penpal RPC (replaces raw postMessage)

**Library**: `penpal` v7 — typed promise-based RPC over postMessage. ~3KB. Handles connection lifecycle, error propagation, and origin validation.

**Why Penpal over raw postMessage:**
- Type-safe method calls (no string-based message discrimination)
- Promise-based (no manual request/response correlation)
- Built-in connection timeout and error handling
- Origin validation built-in
- Used by Onlook in production

```typescript
// Parent side (in useEditorBridge hook)
import { connectToChild } from 'penpal'

const connection = connectToChild({
  iframe: iframeRef.current,
  methods: {
    // Parent methods the iframe can call
    onElementHovered(info: ElementInfo) { /* update overlay */ },
    onTextEditCommit(oid: string, newText: string) { /* trigger AST patch */ },
  }
})
const child = await connection.promise // typed proxy to iframe's methods

// Now call iframe methods directly:
const element = await child.getElementAtPoint(x, y)
```

#### 4. GestureScreen — Mouse Event Capture

Transparent `<div>` positioned over the iframe. Captures all mouse events in the parent coordinate space, then uses Penpal RPC to resolve what's under the cursor in the iframe.

```
┌─ GestureScreen (pointer-events: auto in edit mode) ──────┐
│  mousemove → child.getElementAtPoint(x, y) → HoverRect   │
│  click → child.getElementAtPoint(x, y) → SelectRect      │
│  dblclick → child.startTextEditing(oid) → TextEditor      │
│                                                            │
│  ┌─ iframe (pointer-events: none in edit mode) ─────────┐ │
│  │  (preload script handles getElementAtPoint calls)      │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

**Why GestureScreen (from Onlook) instead of iframe event forwarding:**
- No cross-origin event access issues
- Parent has full control over mouse state machine
- Can implement drag-to-select, resize handles, etc. in parent coordinates
- Penpal RPC latency (~1-2ms) is imperceptible for hover/click

**Coordinate translation:** `iframeCoord = mouseEvent.clientXY - iframeBoundingRect.topLeft + iframeScrollOffset`. The scroll offset comes from periodic Penpal calls.

#### 5. useEditorBridge Hook

Parent-side React hook managing the Penpal connection lifecycle.

```typescript
function useEditorBridge(iframeRef: RefObject<HTMLIFrameElement>, editMode: boolean) {
  // Returns:
  hoveredElement: ElementInfo | null
  selectedElement: ElementInfo | null
  isEditing: boolean
  iframeReady: boolean
  child: PenpalChild | null  // typed proxy to iframe methods

  // Methods:
  deselect(): void
  applyStylePreview(oid: string, styles: Record<string, string>): void
  moveSection(oid: string, direction: 'up' | 'down'): void
}
```

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

#### 7. Edit Executor — Two-Phase (Instant CSS + Async AST)

Following Onlook's two-phase pattern, all visual edits have instant visual feedback followed by durable source patching.

**Phase 1 — Instant CSS Preview (~16ms):**
Via Penpal → preload script's CSS Manager → inject `<style>` rule targeting `[data-odid="xxx"]`. User sees the change immediately. No file I/O.

**Phase 2 — Async AST Source Patch (~50-200ms for Tier 1, ~3-5s for Tier 2):**
After CSS preview is applied, the source patch runs in background.

**Tier 1 — Deterministic AST Patch (~50-200ms):**
- Text literal: `<h1>Hello</h1>` → `<h1>Welcome</h1>`
- Simple className swap: `bg-blue-500` → `bg-red-600` (via `tailwind-merge`)
- Attribute change: `src="/old.jpg"` → `src="/new.jpg"`
- Section reorder: swap sibling JSX nodes by OID
- Implementation: Read file from sandbox → `@babel/parser` + `traverse` (find node by `data-oid`) + `generator` (`retainLines: true`) → write file back → Vite HMR → CSS preview auto-cleared

**Tier 2 — AI Agent (~3-5s):**
- Dynamic text: `{title}`, `t('hero.title')`, `.map()` items
- Complex className: `cn('bg-blue', isActive && 'bg-green')`
- Layout restructuring
- Implementation: Send structured prompt to orchestrator agent with file path, OID, and desired change → agent calls editFile/writeFile → Vite HMR

**Tier 3 — User Clarification:**
- Multiple elements at same source location (ambiguous `.map()`)
- Unknown edit intent
- Show inline dialog in EditorOverlay asking user to specify

**Tier detection logic:** Find source file by grepping for `data-oid="<oid>"`. Parse the file. If the JSX text/attribute is a string literal → Tier 1. If it's a JSX expression (`{...}`) → Tier 2.

**Class manipulation**: Use `tailwind-merge` (already in deps via shadcn) for Tailwind class deduplication. Use `CssToTailwindTranslator` if user edits raw CSS values in PropertyInspector → convert to Tailwind classes before AST patch.

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
| penpal | v7 | ~3KB | Typed promise-based RPC over postMessage. Used by Onlook in production. Handles connection lifecycle, error propagation, origin validation. Replaces raw postMessage protocol. [Source](https://github.com/nicknisi/penpal) |
| @babel/standalone | Current | Sandbox-side | OID injection at file write time (not compile-time). Same pattern as Onlook's `addOidsToAst()`. Runs on individual files when agent writes them. [Source](https://github.com/onlook-dev/onlook/blob/main/packages/parser/src/ids.ts) |
| @babel/parser + traverse + generator | Current | Server-only | AST-based source patching (Tier 1 edits). `retainLines: true` preserves formatting. OXC lacks JS plugin API as of March 2026. [Source](https://oxc.rs/blog/2024-09-29-transformer-alpha) |
| nanoid | Already installed | ~1KB | 7-character OID generation. Already in deps. [Source](https://www.npmjs.com/package/nanoid) |
| tailwind-merge | Already installed | — | Tailwind class deduplication for className swaps. Already in deps via shadcn. Same approach as Onlook's `customTwMerge`. [Source](https://github.com/dcastil/tailwind-merge) |
| @floating-ui/react | Already installed | — | De facto positioning standard. 4.4M downloads/week. Used by Radix/shadcn (already in our deps). [Source](https://www.npmjs.com/package/@floating-ui/react) |
| re-resizable | 6.11.2 | ~4.5KB | React resize handles. Works in parent overlay without iframe-specific config. [Source](https://www.npmjs.com/package/re-resizable) |
| css-tree | 3.x | ~50KB | CSS AST parsing for the preload script's CSS Manager (inject/remove style rules). Same as Onlook's approach. [Source](https://www.npmjs.com/package/css-tree) |

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

1. **New Vite plugin file:** `vite-plugin-vibestack-editor.ts` (preload script injection via `transformIndexHtml`)
2. **New preload script:** `src/__vibestack-preload.ts` (~200 lines — Penpal child, CSS Manager, element resolution, runtime ODID assignment)
3. **New dev dependencies:** `penpal` (RPC), `css-tree` (CSS AST for style injection), `nanoid` (OID generation)
4. **vite.config.ts update:** Add the editor plugin to the plugins array (dev-only)
5. **OID injector**: Runs as a post-write hook in the orchestrator agent's `writeFile`/`editFile` tools — adds `data-oid` attributes to JSX elements using `@babel/standalone`

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

## Industry Landscape (March 2026)

Three architectural models exist for visual editing of web apps:

### Model A: JSON Document (Webflow, Wix, Puck, Builder.io, json-render)
Visual edits modify a JSON tree. A renderer converts JSON → React at runtime. Simple to implement visual editing but constrains output to a pre-defined component catalog.

### Model B: Source Code + AST (Lovable, Onlook, v0.dev)
Visual edits patch actual source code via AST manipulation. Full expressiveness but complex implementation.

### Model C: AI-First with Visual Refinement (Bolt.new)
AI generates code; visual mode provides token-free style tweaks on top.

**VibeStack uses Model B** — same as Lovable and Onlook. Rationale: the AI agent generates arbitrary React code (no catalog constraint), source code is the single truth, and the output is developer-friendly .tsx files that users can eject and modify in their own IDE.

### Key Prior Art

**Lovable** ([lovable.dev/blog/visual-edits](https://lovable.dev/blog/visual-edits)):
- Custom Vite plugin assigns stable IDs to JSX elements at build time
- Client-side AST using Babel parser (SWC alternative)
- DOM click → trace back to JSX node via stable IDs → AST mutation → code generation
- Optimistic preview with custom client-side Tailwind generator
- 4,000+ fly.io dev server instances

**Onlook** ([github.com/onlook-dev/onlook](https://github.com/onlook-dev/onlook), 10K GitHub stars):
- Compiler plugin injects `data-oid` attributes into DOM elements (sourcemap-like)
- Visual selection → `data-oid` → locate exact JSX node in source
- AST patching → write file → HMR reload
- Actions-based system (serializable edits, undo, AI-generated modifications)
- Stack: Next.js, Tailwind, Supabase, Drizzle, shadcn — nearly identical to VibeStack

**v0.dev** ([v0.app/docs/design-mode](https://v0.app/docs/design-mode)):
- Design Mode (Option+D) provides zero-token visual tweaks
- Reads tailwind.config.js design tokens for the style panel
- Composite model family: base LLM + quick edit model + autofix model

**Vercel json-render** ([github.com/vercel-labs/json-render](https://github.com/vercel-labs/json-render)):
- Considered but rejected for VibeStack — constrains AI to component catalog
- Interesting for future: Zod-validated catalogs, streaming JSONL patches, export to standalone React

**WordPress Gutenberg**:
- Blocks stored as HTML with JSON in comments: `<!-- wp:heading {"level":2} -->`
- Each block has `edit` (React editor component) and `save` (static HTML output)
- Redux-based undo with entity-level snapshots
- Iframe-isolated canvas since ~2023

**Webflow**:
- Proprietary JSON document model (not HTML files)
- XscpData clipboard format with nodes, styles, variants
- CSS class system with breakpoint cascade
- Exports static HTML/CSS/JS (no React)

## References

- [Lovable Visual Edits Blog](https://lovable.dev/blog/visual-edits) — AST-based source code editing architecture
- [Onlook GitHub](https://github.com/onlook-dev/onlook) — data-oid compiler plugin + visual overlay + AST patching
- [v0 Design Mode](https://v0.app/docs/design-mode) — zero-token visual style tweaks
- [Vercel json-render](https://github.com/vercel-labs/json-render) — AI-generated JSON → React rendering
- [Wix Harmony Architecture](https://www.wix.com/harmony) — iframe + overlay + JSON document model
- [Codux Elements Tree Panel](https://medium.com/wix-engineering/codux-by-wix-case-study-how-we-built-the-elements-tree-panel-d1952ff8808e) — TypeScript AST + FiberNode correlation
- [React Dev Inspector](https://react-dev-inspector.zthxxx.me/docs/compiler-plugin) — Babel plugin pattern for data-inspector-* attributes
- [WordPress Block Editor Handbook](https://developer.wordpress.org/block-editor/) — Gutenberg architecture
- [Webflow Designer API](https://developers.webflow.com/designer/reference/introduction) — Webflow's element model
- [Strongly-typed iframe messaging](https://www.nickwhite.cc/blog/strongly-typed-iframe-messaging/) — TypeScript discriminated union postMessage protocol
