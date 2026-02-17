# Visual Design Mode — GrapeJS + Tailwind Integration

**Status**: Future work (deferred)
**Date**: 2026-02-16
**Author**: Claude + Anmol

## Context

Phases A-D of the visual editing architecture are complete (lovable-tagger, edit machine, Tier 1/2 edits). All 608 tests pass. Currently, edits require either typing Tailwind class names in chat (Tier 1) or describing changes for an LLM (Tier 2). Both require knowing CSS concepts.

**Goal**: Give users a WordPress/Webflow-like visual design experience — click any element, see a rich style panel with color pickers, spacing controls, typography options, layout tools. Users should never see Tailwind class names or know GrapeJS is under the hood. Long-term plan: fork GrapeJS and build a VibeStack-branded visual editor.

**Key reference**: [grapesjs-tailwindcss-plugin](https://github.com/fasenderos/grapesjs-tailwindcss-plugin) — in-browser Tailwind v4 compilation + class autocomplete.

## Research Findings

| Library | Strengths | Use For Us |
|---------|-----------|------------|
| **GrapeJS** | Battle-tested Style Manager (colors, spacing, typography, borders, shadows, layout), Layer Manager (component tree), Block Manager (drag-drop), undo/redo, 25k stars | Visual editing engine |
| **grapesjs-tailwindcss-plugin** | In-browser Tailwind v4 compilation, class autocomplete, zero build pipeline | Tailwind-native output |
| **@grapesjs/react** | Official React wrapper, `useEditor()` hook, composable layout | Platform integration |
| **Puck** | Lightweight (~200KB), React-native, custom fields, inline text editing | Cherry-pick: field system ideas |
| **Onlook** | Bi-directional visual ↔ source code sync, component inspector | Cherry-pick: source mapping |

## Architecture

```
┌─ PLATFORM (React SPA) ─────────────────────────────────────┐
│                                                              │
│  ┌─ BuilderChat ──┐  ┌─ BuilderPreview ──────────────────┐ │
│  │ Chat panel      │  │                                    │ │
│  │ (existing)      │  │  Tabs: [Preview] [Design] [Code]  │ │
│  │                 │  │                                    │ │
│  │                 │  │  Preview tab: live Vite app iframe │ │
│  │                 │  │  Design tab:  GrapeJS canvas       │ │
│  │                 │  │  Code tab:    code-server iframe   │ │
│  │                 │  │                                    │ │
│  │                 │  │  ┌─ Style Panel (right sidebar) ─┐│ │
│  │                 │  │  │ GrapeJS Style Manager          ││ │
│  │                 │  │  │ + Tailwind class autocomplete  ││ │
│  │                 │  │  │ + Layer Manager (tree view)    ││ │
│  │                 │  │  └────────────────────────────────┘│ │
│  └─────────────────┘  └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         ↕ postMessage              ↕ GrapeJS internal
┌─ PREVIEW IFRAME ────┐   ┌─ GRAPEJS CANVAS IFRAME ──────────┐
│ Live Vite+React app  │   │ Annotated HTML from preview       │
│ lovable-tagger       │   │ grapesjs-tailwindcss-plugin       │
│ vibestack-overlay.js │   │ In-browser Tailwind v4 compilation│
│ __jsxSource__ data   │   │ data-vs-src attributes preserved  │
└──────────────────────┘   └───────────────────────────────────┘
                                      ↕
                           ┌─ SERVER ─────────────────────────┐
                           │ POST /api/projects/:id/design-save│
                           │ Maps element edits → source files │
                           │ Writes to sandbox via Daytona SDK │
                           └───────────────────────────────────┘
```

## Source Annotation Bridge (Key Innovation)

**Problem**: GrapeJS edits static HTML, but our source code is React JSX. We need to map DOM element changes back to source files.

**Solution**: Before loading HTML into GrapeJS, annotate every DOM element with its source location.

```
Preview iframe (live React app)
  ↓ postMessage: VIBESTACK_CAPTURE
  ↓ overlay.js walks DOM, reads __jsxSource__ from React fiber
  ↓ Adds data-vs-src="src/components/Hero.tsx:15:4" to each element
  ↓ Returns annotated outerHTML + extracted CSS
  ↓
GrapeJS canvas loads annotated HTML
  ↓ User edits (classes, text, structure)
  ↓ data-vs-src attributes are preserved through edits
  ↓
On save: read data-vs-src from each changed element
  ↓ POST /api/projects/:id/design-save
  ↓ Server applies changes to source files in sandbox
  ↓ Vite HMR reflects changes in Preview tab
```

## PostMessage Protocol

Existing (unchanged):
- Parent → iframe: `{ type: 'VIBESTACK_EDIT_MODE', enabled: boolean }`
- iframe → parent: `{ type: 'VIBESTACK_ELEMENT_SELECTED', payload: ElementContext }`

New for Design Mode:
- Parent → preview iframe: `{ type: 'VIBESTACK_CAPTURE' }`
- Preview iframe → parent: `{ type: 'VIBESTACK_CAPTURE_RESULT', payload: CaptureResult }`

```typescript
interface CaptureResult {
  html: string      // Full annotated outerHTML
  css: string       // Extracted stylesheets (including Tailwind output)
  customTheme: string // @theme block from app's CSS (for GrapeJS plugin)
}
```

## Implementation

### Step 1: Platform Dependencies

Add to platform `package.json`:
```json
"grapesjs": "^0.22.5",
"@grapesjs/react": "^1.0.0",
"grapesjs-tailwindcss-plugin": "^1.0.0"
```

These run in the **platform** (parent frame), not the sandbox.

### Step 2: `snapshot/warmup-scaffold/public/vibestack-overlay.js` (MODIFY)

Add DOM capture capability:

```javascript
// New handler for VIBESTACK_CAPTURE message
function captureAnnotatedHTML() {
  // Walk all DOM elements
  document.querySelectorAll('*').forEach(el => {
    const source = getSourceInfo(el) // existing function using __jsxSource__
    if (source) {
      el.setAttribute('data-vs-src', `${source.fileName}:${source.lineNumber}:${source.columnNumber}`)
    }
  })

  // Extract CSS from all stylesheets
  const css = Array.from(document.querySelectorAll('style, link[rel=stylesheet]'))
    .map(el => el.textContent || '')
    .join('\n')

  // Extract @theme block for GrapeJS Tailwind plugin
  const themeMatch = css.match(/@theme\s*\{[\s\S]*?\}/)
  const customTheme = themeMatch ? themeMatch[0] : ''

  // Send back annotated HTML
  window.parent.postMessage({
    type: 'VIBESTACK_CAPTURE_RESULT',
    payload: {
      html: document.documentElement.outerHTML,
      css,
      customTheme,
    }
  }, '*')

  // Clean up: remove data-vs-src from live DOM (don't pollute the app)
  document.querySelectorAll('[data-vs-src]').forEach(el => {
    el.removeAttribute('data-vs-src')
  })
}
```

### Step 3: `src/components/visual-editor.tsx` (NEW, ~200 lines)

GrapeJS React wrapper component:

```typescript
import { GjsEditor, Canvas } from '@grapesjs/react'
import type { Editor } from 'grapesjs'
import grapesjsTailwindcss from 'grapesjs-tailwindcss-plugin'

interface VisualEditorProps {
  html: string           // Annotated HTML from capture
  css: string            // Extracted CSS
  customTheme: string    // @theme block
  onSave: (changes: DesignChange[]) => void
}

export function VisualEditor({ html, css, customTheme, onSave }: VisualEditorProps) {
  const onEditor = (editor: Editor) => {
    // Store original HTML for diffing on save
    editor.store({ originalHtml: html })

    // Load content
    editor.setComponents(html)
    editor.setStyle(css)

    // Listen for save command (Ctrl+S or save button)
    editor.on('run:save', () => {
      const changes = diffChanges(editor)
      onSave(changes)
    })
  }

  return (
    <GjsEditor
      className="h-full"
      grapesjs="https://unpkg.com/grapesjs" // or local import
      options={{
        height: '100%',
        storageManager: false,
        plugins: [grapesjsTailwindcss],
        pluginsOpts: {
          [grapesjsTailwindcss as any]: {
            autobuild: true,
            autocomplete: true,
            customCss: customTheme
              ? `@import "tailwindcss";\n${customTheme}`
              : '@import "tailwindcss";',
          },
        },
        styleManager: {
          sectors: [
            {
              name: 'Layout',
              properties: ['display', 'flex-direction', 'justify-content',
                'align-items', 'gap', 'width', 'height'],
            },
            {
              name: 'Spacing',
              properties: ['margin', 'padding'],
            },
            {
              name: 'Typography',
              properties: ['font-family', 'font-size', 'font-weight',
                'color', 'text-align', 'line-height', 'letter-spacing'],
            },
            {
              name: 'Background',
              properties: ['background-color', 'background-image'],
            },
            {
              name: 'Borders',
              properties: ['border-radius', 'border-width', 'border-color', 'border-style'],
            },
            {
              name: 'Effects',
              properties: ['box-shadow', 'opacity'],
            },
          ],
        },
      }}
      onEditor={onEditor}
    />
  )
}
```

### Step 4: `src/components/builder-preview.tsx` (MODIFY, ~80 lines)

Major changes:
1. Add "Design" tab alongside preview/code/database
2. Handle VIBESTACK_CAPTURE flow when Design tab is activated
3. Render `<VisualEditor>` in the Design tab
4. Handle save → POST to server → show success toast
5. On save success, switch to Preview tab to see live result

### Step 5: `src/lib/design-diff.ts` (NEW, ~120 lines)

Diff engine that compares GrapeJS's edited HTML against the original annotated HTML:

```typescript
interface DesignChange {
  sourceFile: string      // e.g. "src/components/Hero.tsx"
  lineNumber: number
  columnNumber: number
  changeType: 'class' | 'text' | 'style'
  oldValue: string
  newValue: string
}

export function diffChanges(editor: Editor): DesignChange[] {
  // 1. Get current HTML from GrapeJS
  // 2. Parse both original and current HTML
  // 3. Walk elements with data-vs-src attributes
  // 4. Compare className, textContent, inline styles
  // 5. Return list of DesignChange objects
}
```

### Step 6: `server/routes/projects.ts` (MODIFY, ~100 lines)

New endpoint: `POST /api/projects/:id/design-save`

```typescript
app.post('/:id/design-save', authMiddleware, async (c) => {
  const projectId = c.req.param('id')
  const { changes } = await c.req.json<{ changes: DesignChange[] }>()

  // 1. Verify project ownership
  // 2. Get sandbox
  // 3. Group changes by source file
  // 4. For each file:
  //    a. Download from sandbox
  //    b. Apply changes at specified lines
  //    c. Upload modified file back
  // 5. Return { success: true, filesModified: string[] }
})
```

Line-level edit application:
```typescript
function applyChange(content: string, change: DesignChange): string {
  const lines = content.split('\n')
  const line = lines[change.lineNumber - 1]

  switch (change.changeType) {
    case 'class':
      // Replace className="old" with className="new"
      lines[change.lineNumber - 1] = line.replace(
        /className="[^"]*"/,
        `className="${change.newValue}"`
      )
      break
    case 'text':
      // Replace text content at the specified position
      const idx = line.indexOf(change.oldValue)
      if (idx !== -1) {
        lines[change.lineNumber - 1] =
          line.slice(0, idx) + change.newValue + line.slice(idx + change.oldValue.length)
      }
      break
    case 'style':
      // Add/replace inline style (less common with Tailwind)
      lines[change.lineNumber - 1] = line.replace(
        /style=\{?\{[^}]*\}\}?/,
        `style={{${change.newValue}}}`
      )
      break
  }
  return lines.join('\n')
}
```

### Step 7: `src/lib/types.ts` (MODIFY, ~20 lines)

Add:
```typescript
export interface DesignChange {
  sourceFile: string
  lineNumber: number
  columnNumber: number
  changeType: 'class' | 'text' | 'style'
  oldValue: string
  newValue: string
}

export interface CaptureResult {
  html: string
  css: string
  customTheme: string
}
```

### Step 8: Tests — `tests/design-save.test.ts` (NEW, ~200 lines)

- Text replacement at correct line
- Class replacement at correct line
- Multiple changes to same file (batched correctly)
- Path traversal prevention
- Auth enforcement
- Diff engine: detects class changes, text changes, added/removed elements

## User Experience Flow

1. User generates an app via chat (existing flow)
2. Live preview appears in Preview tab
3. User clicks **Design** tab
4. Platform captures annotated HTML from preview iframe
5. GrapeJS canvas loads with:
   - Full Style Manager (Typography, Colors, Spacing, Borders, Effects, Layout)
   - Tailwind class autocomplete (type `bg-` → see all background utilities)
   - Layer Manager (component hierarchy tree)
   - Inline text editing (double-click any text)
   - Element inspector (click any element → see all properties)
6. User makes visual changes:
   - Click heading → change color via color picker → sees `text-blue-600` applied
   - Click container → adjust padding via spacing control → sees `p-8` applied
   - Click button → change border-radius → sees `rounded-xl` applied
   - Double-click text → type new content
7. User clicks **Save** (or Ctrl+S)
8. Platform diffs changes, sends to server
9. Server writes modified source files to sandbox
10. Vite HMR picks up changes
11. User switches to Preview tab → sees live result with full React interactivity

## What's In Scope

- Full GrapeJS editor with Style Manager, Layer Manager
- Tailwind v4 in-browser compilation via plugin
- Class autocomplete (type class names, get suggestions)
- Inline text editing (double-click)
- Source annotation bridge (DOM → JSX source file mapping)
- Server-side edit application (changes → source files)
- Undo/redo (GrapeJS built-in)

## What's NOT in Scope

- Block Manager / drag-drop new components (Phase 2 — requires component registry)
- Responsive breakpoint editing (Phase 2 — GrapeJS Devices module)
- Component props editing via Trait Manager (Phase 2)
- Multi-page editing (Phase 2 — GrapeJS Pages module)
- Custom GrapeJS theme/skin to match VibeStack UI (Phase 2)
- Forking GrapeJS into a VibeStack-branded editor (Phase 3)

## Verification

1. `bunx tsc --noEmit` — client builds clean
2. `bunx tsc --noEmit -p tsconfig.server.json` — server builds clean
3. `bun run test` — all tests pass including new design-save tests
4. Manual test flow:
   - Generate app → Preview tab shows live app
   - Switch to Design tab → GrapeJS canvas shows same layout
   - Click element → Style Manager shows properties
   - Change color → Tailwind class updates live in canvas
   - Type in class autocomplete → see Tailwind suggestions
   - Double-click text → edit inline
   - Save → switch to Preview → see changes reflected via HMR

## Implementation Order

| Step | Files | Est. Lines | Dependency |
|------|-------|------------|------------|
| 1. Types | `src/lib/types.ts` | ~20 | None |
| 2. Platform deps | `package.json` | ~3 | None |
| 3. DOM capture | `vibestack-overlay.js` | ~40 | None |
| 4. Server endpoint | `server/routes/projects.ts` | ~100 | Types |
| 5. Diff engine | `src/lib/design-diff.ts` | ~120 | Types |
| 6. GrapeJS wrapper | `src/components/visual-editor.tsx` | ~200 | Platform deps |
| 7. Builder integration | `src/components/builder-preview.tsx` | ~80 | All above |
| 8. Tests | `tests/design-save.test.ts` | ~200 | Server endpoint + diff |

Steps 3-5 (overlay + server + diff) and 6 (GrapeJS wrapper) can be developed in parallel.
