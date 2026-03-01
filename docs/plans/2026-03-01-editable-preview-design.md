# Editable Preview — Design Document

**Date**: 2026-03-01
**Status**: Approved
**Scope**: Storybook-first implementation (production wiring deferred)

## Problem

The right panel preview tab shows a static, non-interactive view of the generated app. Users cannot visually select, inspect, or edit elements directly — all changes require typing prompts in chat. Competing tools (Lovable, v0, Bolt, Wix, Webflow) offer layered visual editing that separates free/instant style tweaks from AI-mediated structural changes.

## Industry Research

### Competitor Approaches (2025-2026)

| Tool | Hover | Select | Inline Edit | Property Panel | Source Mapping |
|------|-------|--------|-------------|----------------|----------------|
| **Lovable** | Outline | Click + sidebar + floating controls | Yes | Left sidebar | Vite plugin stable IDs + AST |
| **v0** | Design mode outline | Click + right sidebar | Yes | Right sidebar (Tailwind-native) | Tailwind class mapping |
| **Replit** | Label + outline | Click + contextual controls | Yes (source strings) | Color/font/spacing controls | Direct source update |
| **Bolt** | No persistent hover | Select-to-prompt | Limited | Component properties | Bidirectional sync |
| **Cursor** | Browser editor | Click + drag + prompt | Via agent | React props sidebar | Agent-mediated |
| **Webflow** | Blue outline + label | Click + breadcrumb | Double-click | Right sidebar (full CSS) | CSS class generation |
| **Wix** | Outline | Click + contextual toolbar | Double-click | Right sidebar (4-tab Inspector) | Closed system |

### Key Industry Patterns

1. **Two-tier editing**: Direct visual edits (free, instant) vs AI edits (costs tokens).
2. **Contextual floating toolbar**: Element-type-aware actions (Wix, WordPress Gutenberg, Webflow).
3. **Hover outline + tag label**: Blue dashed outline with element name (Webflow, Lovable, Replit).
4. **Double-click for inline text**: Universal pattern across all builders.
5. **"Ask AI" always in toolbar**: Wix Aria, Bolt select-to-prompt, Cursor point-and-prompt.

## Design

### 4-Layer Interaction Model

#### Layer 1: Hover

- **Blue dashed outline** around hovered element
- **Tag label** anchored top-left (e.g. `<div.tf-card>`, `<img>`, `<h2>`)
- Cursor changes to pointer
- Uses `@floating-ui/react` for label positioning

#### Layer 2: Click-to-Select + Contextual Toolbar

- **Solid blue outline** on selected element
- **Floating toolbar** above element (auto-flips near edges via `@floating-ui/react`)
- Toolbar actions are **element-type-aware**:

| Element Type | Toolbar Actions |
|-------------|----------------|
| Text (`h1-h6`, `p`, `span`) | Edit Text, Font, Size, Color, Alignment, **Ask AI** |
| Image (`img`) | Replace Image, Edit Image, Link, Crop, **Ask AI** |
| Button (`button`, `a.btn`) | Edit Label, Link, Style Variant, **Ask AI** |
| Container (`div`, `section`) | Layout, Padding, Background, **Ask AI** |
| Any (fallback) | Inspect, Copy, Delete, **Ask AI** |

- "Ask AI" is always the first action — sends `ElementContext` to chat
- Fires `onElementSelect(ElementContext)`

#### Layer 3: Inline Text Editing

- **Double-click** selected text element enters edit mode
- Uses `react-contenteditable` for React-compatible contentEditable
- **Format mini-toolbar** replaces contextual toolbar: Bold, Italic, Link, Color
- Auto-save via `useDebouncedSave` → fires `onTextSave(elementId, text)`
- **Escape** or **click-away** exits edit mode

#### Layer 4: Property Inspector Sidebar

- Fixed **right sidebar** (~220px) inside preview area, appears when element is selected
- Sections:
  - **Layout**: display, flex direction, gap, alignment
  - **Spacing**: margin + padding (visual box model diagram)
  - **Size**: width, height
  - **Typography** (text only): font, size, weight, line-height, color
  - **Background**: color swatch via `react-colorful`
  - **Border**: width, radius, color
  - **Effects**: opacity, shadow
- Tailwind classes shown as editable chips
- Changes fire `onPropertyChange(elementId, prop, value)`

### Component Architecture

```
EditablePreview
├── PreviewCanvas (wraps inline app HTML)
│   ├── ElementOverlay (hover outline + selection outline + tag label)
│   └── ContextualToolbar (floating, element-type-aware)
├── FormatMiniToolbar (appears during inline text editing)
└── PropertyInspector (fixed right sidebar, ~220px)
```

### State Machine (`useElementInteraction` hook)

```
idle → hovering → selected → editing
         ↑           ↓         ↓
         └───────────┴─────────┘  (click-away / Escape)
```

### Callbacks

```ts
interface EditablePreviewProps {
  children: ReactNode
  onElementSelect?: (ctx: ElementContext) => void
  onElementDeselect?: () => void
  onTextSave?: (elementId: string, text: string) => void
  onPropertyChange?: (elementId: string, prop: string, value: string) => void
}
```

## Libraries

| Purpose | Library | Size |
|---------|---------|------|
| Floating positioning (overlay, toolbar, label) | `@floating-ui/react` | ~12KB |
| Inline text editing | `react-contenteditable` | ~3KB |
| Color picker | `react-colorful` | ~3KB |
| Source mapping (production, sandbox only) | `vite-plugin-react-click-to-component` | Dev dep in snapshot |

Total new deps: 3 runtime (~18KB gzipped).

## Storybook vs Production

| Concern | Storybook | Production |
|---------|-----------|------------|
| Preview content | Inline HTML (TaskFlow mockup) | iframe → Daytona sandbox |
| Element ID mapping | Manual `data-element-id` attributes | `vite-plugin-react-click-to-component` in sandbox snapshot |
| "Ask AI" action | Storybook `fn()` action | Sends `ElementContext` to chat via `onElementSelect` |
| Property changes | Storybook `fn()` action | Calls sandbox API to update source files |
| Text save | Storybook `fn()` action | Calls sandbox `editFile` tool |

## Stories

- `PreviewWithTabs` — all 4 layers active on preview tab
- `PreviewElementHovered` — hover outline on a card element
- `PreviewElementSelected` — selected element with contextual toolbar + property inspector
- `PreviewTextEditing` — inline editing with format toolbar

## Not in Scope

- iframe/postMessage bridge (production concern)
- Vite plugin for sandbox snapshot (separate task)
- Drag-to-reorder elements
- Multi-select
- Undo/redo
- Image upload/replace (needs sandbox file API)
