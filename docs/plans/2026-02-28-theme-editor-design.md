# Theme Editor Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a tweakcn-style theme editor at `/theme-editor` with live color pickers, typography controls, radius slider, and curated component preview — plus delete 44 unused components.

**Architecture:** Two-panel layout. Left: Zustand-persisted controls (color pickers, font selectors, radius slider). Right: curated compositions of USED components with inline CSS variable overrides. Presets load from existing themes. Export copies CSS to clipboard.

**Tech Stack:** React 19, Zustand (persist), native `<input type="color">`, existing shadcn/ui + AI element components, Tailwind v4 CSS variables.

---

## Phase 1: Delete Unused Components

Remove 44 components + their stories (39 AI elements + 5 UI primitives).

### UI primitives to delete (5)

| File | Story |
|------|-------|
| `src/components/ui/carousel.tsx` | `carousel.stories.tsx` |
| `src/components/ui/form.tsx` | `form.stories.tsx` |
| `src/components/ui/hover-card.tsx` | `hover-card.stories.tsx` |
| `src/components/ui/switch.tsx` | `switch.stories.tsx` |
| `src/components/ui/table.tsx` | `table.stories.tsx` |

### AI elements to delete (39)

| File | Story |
|------|-------|
| `agent.tsx` | `agent.stories.tsx` |
| `artifact.tsx` | `artifact.stories.tsx` |
| `attachments.tsx` | `attachments.stories.tsx` |
| `audio-player.tsx` | `audio-player.stories.tsx` |
| `canvas.tsx` | `canvas.stories.tsx` |
| `chain-of-thought.tsx` | `chain-of-thought.stories.tsx` |
| `checkpoint.tsx` | `checkpoint.stories.tsx` |
| `code-block.tsx` | `code-block.stories.tsx` |
| `commit.tsx` | `commit.stories.tsx` |
| `confirmation.tsx` | `confirmation.stories.tsx` |
| `connection.tsx` | `connection.stories.tsx` |
| `context.tsx` | `context.stories.tsx` |
| `controls.tsx` | `controls.stories.tsx` |
| `edge.tsx` | `edge.stories.tsx` |
| `environment-variables.tsx` | `environment-variables.stories.tsx` |
| `file-assembly-card.tsx` | `file-assembly-card.stories.tsx` |
| `image.tsx` | `image.stories.tsx` |
| `inline-citation.tsx` | `inline-citation.stories.tsx` |
| `jsx-preview.tsx` | `jsx-preview.stories.tsx` |
| `mic-selector.tsx` | `mic-selector.stories.tsx` |
| `node.tsx` | `node.stories.tsx` |
| `open-in-chat.tsx` | `open-in-chat.stories.tsx` |
| `panel.tsx` | `panel.stories.tsx` |
| `persona.tsx` | `persona.stories.tsx` |
| `plan.tsx` | `plan.stories.tsx` |
| `property-panel.tsx` | `property-panel.stories.tsx` |
| `queue.tsx` | `queue.stories.tsx` |
| `reasoning.tsx` | `reasoning.stories.tsx` |
| `sandbox.tsx` | `sandbox.stories.tsx` |
| `schema-display.tsx` | `schema-display.stories.tsx` |
| `shimmer.tsx` | `shimmer.stories.tsx` |
| `snippet.tsx` | `snippet.stories.tsx` |
| `sources.tsx` | `sources.stories.tsx` |
| `speech-input.tsx` | `speech-input.stories.tsx` |
| `suggestion.tsx` | `suggestion.stories.tsx` |
| `task.tsx` | (no story) |
| `terminal.tsx` | `terminal.stories.tsx` |
| `tool.tsx` | `tool.stories.tsx` |
| `toolbar.tsx` | `toolbar.stories.tsx` |
| `transcription.tsx` | `transcription.stories.tsx` |
| `voice-selector.tsx` | `voice-selector.stories.tsx` |
| `web-preview.tsx` | `web-preview.stories.tsx` |

Also delete `src/components/storybook-decorators.tsx` if it exists (only used by stories).

---

## Phase 2: Theme Editor Route

### State Management

```typescript
// src/components/theme-editor/theme-state.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeColors {
  background: string
  foreground: string
  primary: string
  'primary-foreground': string
  secondary: string
  'secondary-foreground': string
  muted: string
  'muted-foreground': string
  accent: string
  'accent-foreground': string
  card: string
  'card-foreground': string
  popover: string
  'popover-foreground': string
  destructive: string
  border: string
  input: string
  ring: string
  'chart-1': string
  'chart-2': string
  'chart-3': string
  'chart-4': string
  'chart-5': string
  sidebar: string
  'sidebar-foreground': string
  'sidebar-primary': string
  'sidebar-primary-foreground': string
  'sidebar-accent': string
  'sidebar-accent-foreground': string
  'sidebar-border': string
  'sidebar-ring': string
}

interface ThemeState {
  light: ThemeColors
  dark: ThemeColors
  radius: string        // e.g. '0.625rem'
  fontSans: string
  fontDisplay: string
  fontMono: string
}

interface EditorStore {
  theme: ThemeState
  isDark: boolean
  preset: string        // 'terracotta' | 'ocean' | 'forest' | 'amethyst' | 'custom'
  history: ThemeState[]
  future: ThemeState[]
  setColor: (key: keyof ThemeColors, value: string) => void
  setRadius: (value: string) => void
  setFont: (key: 'fontSans' | 'fontDisplay' | 'fontMono', value: string) => void
  toggleDark: () => void
  loadPreset: (name: string) => void
  undo: () => void
  redo: () => void
}
```

Persisted to localStorage under `"theme-editor"`. 500ms throttle on color changes for undo history (tweakcn pattern).

### Controls Panel (left, 320px)

Collapsible accordion sections using our `Accordion` component:

1. **Presets** — Dropdown to load Terracotta/Ocean/Forest/Amethyst
2. **Base** — background + foreground (2 color pickers)
3. **Primary** — primary + primary-foreground
4. **Secondary** — secondary + secondary-foreground
5. **Muted** — muted + muted-foreground
6. **Accent** — accent + accent-foreground
7. **Card** — card + card-foreground
8. **Popover** — popover + popover-foreground
9. **Destructive** — destructive (1 picker)
10. **Border/Input/Ring** — 3 pickers
11. **Charts** — chart-1 through chart-5
12. **Sidebar** — 8 pickers (collapsed by default)
13. **Typography** — 3 font dropdowns (system fonts only, no Google Fonts API)
14. **Radius** — slider (0 to 1.5rem, step 0.125rem)

### Color Picker Component

```
┌──────────────────────────────────┐
│ Primary              ■ #ba5a38  │
│                      [_______]  │
└──────────────────────────────────┘
```

- Colored square: `<input type="color">` with opacity-0 overlay (native picker)
- Hex input: uncontrolled `<input>` with ref (no re-render per keystroke)
- Debounced onChange (150ms) updates Zustand store

### Preview Panel (right, flex-1)

Six composition sections in a scrollable column:

#### 1. Dashboard Cards
- 2x2 grid of `Card` components with `Badge`, `Progress`, `Avatar`, `Skeleton`
- Shows surface colors (card, card-foreground, muted, border)

#### 2. Conversation Thread
- `Message` (user + assistant), `ActionCard`, `ThinkingCard`, `ToolActivity`
- Shows primary, muted, accent colors in context

#### 3. Builder Input
- `PromptInput` + `ModelSelector` + `ClarificationQuestions`
- Shows input, ring, primary-foreground colors

#### 4. Code & Files
- `DiffViewer` (side-by-side) + `FileTree`
- Shows monospace font, muted backgrounds, border colors

#### 5. UI Primitives Grid
- `Button` (default, secondary, destructive, outline, ghost)
- `Input`, `Select`, `Checkbox`, `RadioGroup`, `Tabs`
- `Badge` (default, secondary, destructive, outline)
- `Accordion`, `Dialog` trigger, `DropdownMenu` trigger

#### 6. Data Display
- `TestResults`, `PageProgressCard`, `ArchitectureCard`, `OperationSummaryCard`
- Shows chart colors, progress indicators

### Theme Application

Same `buildStyles()` pattern from `.storybook/themes.ts` — generates both raw CSS variables (`--primary`) and Tailwind-mapped variables (`--color-primary`). Applied as inline styles on the preview container `<div>`.

### Export

"Copy CSS" button generates:
```css
:root {
  --radius: 0.625rem;
  --background: #faf9f5;
  --foreground: #141413;
  /* ... all 31 variables ... */
}

.dark {
  --background: #1C1B1A;
  /* ... all 31 variables ... */
}
```

"Copy JSON" exports `{ light: {...}, dark: {...}, radius: "..." }`.

### File Structure

```
src/routes/_authenticated/theme-editor.tsx
src/components/theme-editor/
  index.tsx                 # Main layout (controls + preview)
  theme-store.ts            # Zustand store + presets + buildStyles
  controls-panel.tsx        # Left sidebar
  preview-panel.tsx         # Right panel with all compositions
  color-picker.tsx          # Color picker primitive
  slider-input.tsx          # Radius slider + text input
  font-selector.tsx         # Font family dropdown
  preset-selector.tsx       # Preset dropdown + dark/light toggle
  export-dialog.tsx         # Copy CSS / Copy JSON dialog
  compositions/
    dashboard-cards.tsx
    conversation-thread.tsx
    builder-input.tsx
    code-files.tsx
    ui-primitives.tsx
    data-display.tsx
```

### Route

```typescript
// src/routes/_authenticated/theme-editor.tsx
import { createFileRoute } from '@tanstack/react-router'
import { ThemeEditor } from '@/components/theme-editor'

export const Route = createFileRoute('/_authenticated/theme-editor')({
  component: ThemeEditor,
})
```

---

## Dependencies

- `zustand` — already used? If not, add it. Lightweight (2KB).
- No other new dependencies.

## Non-Goals

- No Google Fonts API integration (use system fonts only)
- No AI chat for theme generation
- No shadow controls
- No Figma export
- No save-to-database (localStorage only)
- No undo keyboard shortcuts (just buttons)
