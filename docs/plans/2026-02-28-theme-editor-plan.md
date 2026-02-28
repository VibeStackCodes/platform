# Theme Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete 44 unused components, then build a tweakcn-style `/theme-editor` route with live color pickers, typography controls, radius slider, and curated component preview.

**Architecture:** Two-panel layout at `/theme-editor`. Left: Zustand-persisted controls (color pickers, font selectors, radius slider, presets). Right: 6 curated composition sections using existing USED components with inline CSS variable overrides via `buildStyles()`. Export copies CSS/JSON to clipboard.

**Tech Stack:** React 19, Zustand (persist), native `<input type="color">`, existing shadcn/ui + AI element components, Tailwind v4 CSS variables.

**Design doc:** `docs/plans/2026-02-28-theme-editor-design.md`

---

### Task 1: Delete unused UI components (5 files + 5 stories)

**Files:**
- Delete: `src/components/ui/carousel.tsx`
- Delete: `src/components/ui/carousel.stories.tsx`
- Delete: `src/components/ui/form.tsx`
- Delete: `src/components/ui/form.stories.tsx`
- Delete: `src/components/ui/hover-card.tsx`
- Delete: `src/components/ui/hover-card.stories.tsx`
- Delete: `src/components/ui/switch.tsx`
- Delete: `src/components/ui/switch.stories.tsx`
- Delete: `src/components/ui/table.tsx`
- Delete: `src/components/ui/table.stories.tsx`

**Step 1: Verify no app-code imports**

Run each of these commands. Every command should print **0 matches** (only `.stories.tsx` and `.test.tsx` files reference them):

```bash
grep -rn "from.*['\"]@/components/ui/carousel['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v ".stories." | grep -v ".test."
grep -rn "from.*['\"]@/components/ui/form['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v ".stories." | grep -v ".test."
grep -rn "from.*['\"]@/components/ui/hover-card['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v ".stories." | grep -v ".test."
grep -rn "from.*['\"]@/components/ui/switch['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v ".stories." | grep -v ".test."
grep -rn "from.*['\"]@/components/ui/table['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v ".stories." | grep -v ".test."
```

If any command returns results, DO NOT delete that component. Skip it.

**Step 2: Delete the files**

```bash
rm src/components/ui/carousel.tsx src/components/ui/carousel.stories.tsx
rm src/components/ui/form.tsx src/components/ui/form.stories.tsx
rm src/components/ui/hover-card.tsx src/components/ui/hover-card.stories.tsx
rm src/components/ui/switch.tsx src/components/ui/switch.stories.tsx
rm src/components/ui/table.tsx src/components/ui/table.stories.tsx
```

**Step 3: Verify build passes**

```bash
bunx tsc --noEmit
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete 5 unused UI components (carousel, form, hover-card, switch, table)"
```

---

### Task 2: Delete unused AI element components (39 files + ~38 stories)

**Files:**
- Delete: All files listed in `docs/plans/2026-02-28-theme-editor-design.md` Phase 1 "AI elements to delete" section
- Directory: `src/components/ai-elements/`

The 39 files to delete (all in `src/components/ai-elements/`):

```
agent.tsx artifact.tsx attachments.tsx audio-player.tsx canvas.tsx
chain-of-thought.tsx checkpoint.tsx code-block.tsx commit.tsx
confirmation.tsx connection.tsx context.tsx controls.tsx edge.tsx
environment-variables.tsx file-assembly-card.tsx image.tsx
inline-citation.tsx jsx-preview.tsx mic-selector.tsx node.tsx
open-in-chat.tsx panel.tsx persona.tsx plan.tsx property-panel.tsx
queue.tsx reasoning.tsx sandbox.tsx schema-display.tsx shimmer.tsx
snippet.tsx sources.tsx speech-input.tsx suggestion.tsx task.tsx
terminal.tsx tool.tsx toolbar.tsx transcription.tsx voice-selector.tsx
web-preview.tsx
```

**Step 1: Verify no app-code imports for each file**

Before deleting, confirm none of these files are imported by non-story/non-test files. Run:

```bash
# Quick check: for each file, grep for its import (excluding stories/tests)
for f in agent artifact attachments audio-player canvas chain-of-thought checkpoint code-block commit confirmation connection context controls edge environment-variables file-assembly-card image inline-citation jsx-preview mic-selector node open-in-chat panel persona plan property-panel queue reasoning sandbox schema-display shimmer snippet sources speech-input suggestion task terminal tool toolbar transcription voice-selector web-preview; do
  matches=$(grep -rn "from.*['\"]@/components/ai-elements/${f}['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v ".stories." | grep -v ".test." | wc -l)
  if [ "$matches" -gt 0 ]; then
    echo "WARNING: $f has $matches app-code imports — DO NOT DELETE"
    grep -rn "from.*['\"]@/components/ai-elements/${f}['\"]" src/ --include="*.tsx" --include="*.ts" | grep -v ".stories." | grep -v ".test."
  fi
done
```

If any file has imports, skip it. Some known internal references (`code-block` imported by `agent`, `tool` imports types from `right-panel`) — these are circular among unused files and safe to delete together.

**Step 2: Delete the component files**

```bash
cd src/components/ai-elements
rm agent.tsx artifact.tsx attachments.tsx audio-player.tsx canvas.tsx \
   chain-of-thought.tsx checkpoint.tsx code-block.tsx commit.tsx \
   confirmation.tsx connection.tsx context.tsx controls.tsx edge.tsx \
   environment-variables.tsx file-assembly-card.tsx image.tsx \
   inline-citation.tsx jsx-preview.tsx mic-selector.tsx node.tsx \
   open-in-chat.tsx panel.tsx persona.tsx plan.tsx property-panel.tsx \
   queue.tsx reasoning.tsx sandbox.tsx schema-display.tsx shimmer.tsx \
   snippet.tsx sources.tsx speech-input.tsx suggestion.tsx task.tsx \
   terminal.tsx tool.tsx toolbar.tsx transcription.tsx voice-selector.tsx \
   web-preview.tsx
cd ../../..
```

**Step 3: Delete corresponding story files**

```bash
cd src/components/ai-elements
rm -f agent.stories.tsx artifact.stories.tsx attachments.stories.tsx \
   audio-player.stories.tsx canvas.stories.tsx chain-of-thought.stories.tsx \
   checkpoint.stories.tsx code-block.stories.tsx commit.stories.tsx \
   confirmation.stories.tsx connection.stories.tsx context.stories.tsx \
   controls.stories.tsx edge.stories.tsx environment-variables.stories.tsx \
   file-assembly-card.stories.tsx image.stories.tsx inline-citation.stories.tsx \
   jsx-preview.stories.tsx mic-selector.stories.tsx node.stories.tsx \
   open-in-chat.stories.tsx panel.stories.tsx persona.stories.tsx \
   plan.stories.tsx property-panel.stories.tsx queue.stories.tsx \
   reasoning.stories.tsx sandbox.stories.tsx schema-display.stories.tsx \
   shimmer.stories.tsx snippet.stories.tsx sources.stories.tsx \
   speech-input.stories.tsx suggestion.stories.tsx terminal.stories.tsx \
   tool.stories.tsx toolbar.stories.tsx transcription.stories.tsx \
   voice-selector.stories.tsx web-preview.stories.tsx
cd ../../..
```

**Step 4: Also delete storybook-decorators if it exists**

```bash
rm -f src/components/storybook-decorators.tsx
```

**Step 5: Verify build passes**

```bash
bunx tsc --noEmit
```

If there are import errors, some deleted component was still referenced. Fix each error by removing the broken import from the importing file.

**Step 6: Run tests**

```bash
bun run test --run
```

Expected: all remaining tests pass. Some test files may import deleted components — if so, delete those test files too.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: delete 39 unused AI element components and stories"
```

---

### Task 3: Install zustand and create theme store

**Files:**
- Modify: `package.json` (add zustand)
- Create: `src/components/theme-editor/theme-store.ts`

**Step 1: Install zustand**

```bash
bun add zustand
```

**Step 2: Create `src/components/theme-editor/theme-store.ts`**

This is the single source of truth for the theme editor. It holds colors for light + dark mode, radius, fonts, undo/redo, and preset loading. The `buildStyles()` function is adapted from `.storybook/themes.ts` and generates both raw CSS vars (`--primary`) and Tailwind-mapped vars (`--color-primary`).

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ───────────────────────────────────────────────────────────

export type ThemeColorKey =
  | 'background' | 'foreground'
  | 'primary' | 'primary-foreground'
  | 'secondary' | 'secondary-foreground'
  | 'muted' | 'muted-foreground'
  | 'accent' | 'accent-foreground'
  | 'card' | 'card-foreground'
  | 'popover' | 'popover-foreground'
  | 'destructive'
  | 'border' | 'input' | 'ring'
  | 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5'
  | 'sidebar' | 'sidebar-foreground'
  | 'sidebar-primary' | 'sidebar-primary-foreground'
  | 'sidebar-accent' | 'sidebar-accent-foreground'
  | 'sidebar-border' | 'sidebar-ring'

export type ThemeColors = Record<ThemeColorKey, string>

export interface ThemeState {
  light: ThemeColors
  dark: ThemeColors
  radius: string
  fontSans: string
  fontDisplay: string
  fontMono: string
}

// ── All CSS variable names that Tailwind maps to --color-* ──────────

const MAPPED_VARS: ThemeColorKey[] = [
  'background', 'foreground', 'card', 'card-foreground',
  'popover', 'popover-foreground', 'primary', 'primary-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
]

// ── buildStyles: same pattern as .storybook/themes.ts ───────────────

export function buildStyles(colors: ThemeColors, radius: string, fonts: { sans: string; display: string; mono: string }): React.CSSProperties {
  const styles: Record<string, string> = {}

  for (const [key, value] of Object.entries(colors)) {
    styles[`--${key}`] = value
    if (MAPPED_VARS.includes(key as ThemeColorKey)) {
      styles[`--color-${key}`] = value
    }
  }

  styles['--radius'] = radius
  styles['--radius-sm'] = `calc(${radius} - 4px)`
  styles['--radius-md'] = `calc(${radius} - 2px)`
  styles['--radius-lg'] = radius
  styles['--radius-xl'] = `calc(${radius} + 4px)`
  styles['--radius-2xl'] = `calc(${radius} + 8px)`

  styles['--font-sans'] = fonts.sans
  styles['--font-display'] = fonts.display
  styles['--font-mono'] = fonts.mono

  return styles as React.CSSProperties
}

// ── Preset palettes ─────────────────────────────────────────────────

const TERRACOTTA_LIGHT: ThemeColors = {
  background: '#faf9f5', foreground: '#141413',
  card: '#f5f3ed', 'card-foreground': '#141413',
  popover: '#ffffff', 'popover-foreground': '#141413',
  primary: '#ba5a38', 'primary-foreground': '#ffffff',
  secondary: '#f0ede6', 'secondary-foreground': '#141413',
  muted: '#f0ede6', 'muted-foreground': '#6b6960',
  accent: '#f0ede6', 'accent-foreground': '#141413',
  destructive: '#dc2626',
  border: '#e8e6dc', input: '#ffffff', ring: '#ba5a38',
  'chart-1': '#ba5a38', 'chart-2': '#6a9bcc', 'chart-3': '#788c5d',
  'chart-4': '#8b5cf6', 'chart-5': '#6366f1',
  sidebar: '#f0ede6', 'sidebar-foreground': '#141413',
  'sidebar-primary': '#ba5a38', 'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#e8e6dc', 'sidebar-accent-foreground': '#141413',
  'sidebar-border': '#e8e6dc', 'sidebar-ring': '#ba5a38',
}

const TERRACOTTA_DARK: ThemeColors = {
  background: '#1C1B1A', foreground: '#E8E6DC',
  card: '#232220', 'card-foreground': '#E8E6DC',
  popover: '#232220', 'popover-foreground': '#E8E6DC',
  primary: '#ba5a38', 'primary-foreground': '#ffffff',
  secondary: '#2A2926', 'secondary-foreground': '#E8E6DC',
  muted: '#2A2926', 'muted-foreground': '#8A8780',
  accent: '#2A2926', 'accent-foreground': '#E8E6DC',
  destructive: '#ef4444',
  border: '#333230', input: '#2A2926', ring: '#ba5a38',
  'chart-1': '#ba5a38', 'chart-2': '#6a9bcc', 'chart-3': '#788c5d',
  'chart-4': '#a78bfa', 'chart-5': '#818cf8',
  sidebar: '#1C1B1A', 'sidebar-foreground': '#E8E6DC',
  'sidebar-primary': '#ba5a38', 'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#2A2926', 'sidebar-accent-foreground': '#E8E6DC',
  'sidebar-border': '#333230', 'sidebar-ring': '#ba5a38',
}

// Import from .storybook/themes.ts palettes — duplicated here to keep theme-editor self-contained
const OCEAN_LIGHT: ThemeColors = {
  background: '#f5f8fa', foreground: '#0f1419',
  card: '#edf2f7', 'card-foreground': '#0f1419',
  popover: '#ffffff', 'popover-foreground': '#0f1419',
  primary: '#1d6fa5', 'primary-foreground': '#ffffff',
  secondary: '#e2e8f0', 'secondary-foreground': '#0f1419',
  muted: '#e2e8f0', 'muted-foreground': '#64748b',
  accent: '#e2e8f0', 'accent-foreground': '#0f1419',
  destructive: '#dc2626',
  border: '#cbd5e1', input: '#ffffff', ring: '#1d6fa5',
  'chart-1': '#1d6fa5', 'chart-2': '#ba5a38', 'chart-3': '#059669',
  'chart-4': '#8b5cf6', 'chart-5': '#6366f1',
  sidebar: '#e2e8f0', 'sidebar-foreground': '#0f1419',
  'sidebar-primary': '#1d6fa5', 'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#cbd5e1', 'sidebar-accent-foreground': '#0f1419',
  'sidebar-border': '#cbd5e1', 'sidebar-ring': '#1d6fa5',
}

const OCEAN_DARK: ThemeColors = {
  background: '#0f1419', foreground: '#e2e8f0',
  card: '#1a2332', 'card-foreground': '#e2e8f0',
  popover: '#1a2332', 'popover-foreground': '#e2e8f0',
  primary: '#4da3d4', 'primary-foreground': '#ffffff',
  secondary: '#1e293b', 'secondary-foreground': '#e2e8f0',
  muted: '#1e293b', 'muted-foreground': '#94a3b8',
  accent: '#1e293b', 'accent-foreground': '#e2e8f0',
  destructive: '#ef4444',
  border: '#334155', input: '#1e293b', ring: '#4da3d4',
  'chart-1': '#4da3d4', 'chart-2': '#ba5a38', 'chart-3': '#34d399',
  'chart-4': '#a78bfa', 'chart-5': '#818cf8',
  sidebar: '#0f1419', 'sidebar-foreground': '#e2e8f0',
  'sidebar-primary': '#4da3d4', 'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#1e293b', 'sidebar-accent-foreground': '#e2e8f0',
  'sidebar-border': '#334155', 'sidebar-ring': '#4da3d4',
}

const FOREST_LIGHT: ThemeColors = {
  background: '#f5f9f5', foreground: '#1a1f1a',
  card: '#ecf4ec', 'card-foreground': '#1a1f1a',
  popover: '#ffffff', 'popover-foreground': '#1a1f1a',
  primary: '#2d7a3a', 'primary-foreground': '#ffffff',
  secondary: '#e2ede2', 'secondary-foreground': '#1a1f1a',
  muted: '#e2ede2', 'muted-foreground': '#5c6b5c',
  accent: '#e2ede2', 'accent-foreground': '#1a1f1a',
  destructive: '#dc2626',
  border: '#c8d8c8', input: '#ffffff', ring: '#2d7a3a',
  'chart-1': '#2d7a3a', 'chart-2': '#6a9bcc', 'chart-3': '#d97757',
  'chart-4': '#8b5cf6', 'chart-5': '#6366f1',
  sidebar: '#e2ede2', 'sidebar-foreground': '#1a1f1a',
  'sidebar-primary': '#2d7a3a', 'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#c8d8c8', 'sidebar-accent-foreground': '#1a1f1a',
  'sidebar-border': '#c8d8c8', 'sidebar-ring': '#2d7a3a',
}

const FOREST_DARK: ThemeColors = {
  background: '#141a14', foreground: '#d4e4d4',
  card: '#1c261c', 'card-foreground': '#d4e4d4',
  popover: '#1c261c', 'popover-foreground': '#d4e4d4',
  primary: '#4ade80', 'primary-foreground': '#0a1f12',
  secondary: '#243024', 'secondary-foreground': '#d4e4d4',
  muted: '#243024', 'muted-foreground': '#7a937a',
  accent: '#243024', 'accent-foreground': '#d4e4d4',
  destructive: '#ef4444',
  border: '#2d3d2d', input: '#243024', ring: '#4ade80',
  'chart-1': '#4ade80', 'chart-2': '#6a9bcc', 'chart-3': '#d97757',
  'chart-4': '#a78bfa', 'chart-5': '#818cf8',
  sidebar: '#141a14', 'sidebar-foreground': '#d4e4d4',
  'sidebar-primary': '#4ade80', 'sidebar-primary-foreground': '#0a1f12',
  'sidebar-accent': '#243024', 'sidebar-accent-foreground': '#d4e4d4',
  'sidebar-border': '#2d3d2d', 'sidebar-ring': '#4ade80',
}

const AMETHYST_LIGHT: ThemeColors = {
  background: '#f8f5ff', foreground: '#1a1625',
  card: '#f0eaff', 'card-foreground': '#1a1625',
  popover: '#ffffff', 'popover-foreground': '#1a1625',
  primary: '#7c3aed', 'primary-foreground': '#ffffff',
  secondary: '#e8e0f5', 'secondary-foreground': '#1a1625',
  muted: '#e8e0f5', 'muted-foreground': '#6b6080',
  accent: '#e8e0f5', 'accent-foreground': '#1a1625',
  destructive: '#dc2626',
  border: '#d4c8e8', input: '#ffffff', ring: '#7c3aed',
  'chart-1': '#7c3aed', 'chart-2': '#ec4899', 'chart-3': '#059669',
  'chart-4': '#f59e0b', 'chart-5': '#6366f1',
  sidebar: '#e8e0f5', 'sidebar-foreground': '#1a1625',
  'sidebar-primary': '#7c3aed', 'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#d4c8e8', 'sidebar-accent-foreground': '#1a1625',
  'sidebar-border': '#d4c8e8', 'sidebar-ring': '#7c3aed',
}

const AMETHYST_DARK: ThemeColors = {
  background: '#1a1625', foreground: '#e8e0f5',
  card: '#221d30', 'card-foreground': '#e8e0f5',
  popover: '#221d30', 'popover-foreground': '#e8e0f5',
  primary: '#a78bfa', 'primary-foreground': '#ffffff',
  secondary: '#2d2640', 'secondary-foreground': '#e8e0f5',
  muted: '#2d2640', 'muted-foreground': '#8b80a0',
  accent: '#2d2640', 'accent-foreground': '#e8e0f5',
  destructive: '#ef4444',
  border: '#3d3555', input: '#2d2640', ring: '#a78bfa',
  'chart-1': '#a78bfa', 'chart-2': '#f472b6', 'chart-3': '#34d399',
  'chart-4': '#fbbf24', 'chart-5': '#818cf8',
  sidebar: '#1a1625', 'sidebar-foreground': '#e8e0f5',
  'sidebar-primary': '#a78bfa', 'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#2d2640', 'sidebar-accent-foreground': '#e8e0f5',
  'sidebar-border': '#3d3555', 'sidebar-ring': '#a78bfa',
}

export const PRESETS: Record<string, ThemeState> = {
  terracotta: {
    light: TERRACOTTA_LIGHT, dark: TERRACOTTA_DARK,
    radius: '0.625rem',
    fontSans: '"DM Sans", -apple-system, system-ui, sans-serif',
    fontDisplay: '"DM Serif Display", Georgia, serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
  },
  ocean: {
    light: OCEAN_LIGHT, dark: OCEAN_DARK,
    radius: '0.5rem',
    fontSans: '"DM Sans", -apple-system, system-ui, sans-serif',
    fontDisplay: '"DM Serif Display", Georgia, serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
  },
  forest: {
    light: FOREST_LIGHT, dark: FOREST_DARK,
    radius: '0.75rem',
    fontSans: '"DM Sans", -apple-system, system-ui, sans-serif',
    fontDisplay: '"DM Serif Display", Georgia, serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
  },
  amethyst: {
    light: AMETHYST_LIGHT, dark: AMETHYST_DARK,
    radius: '0.375rem',
    fontSans: '"DM Sans", -apple-system, system-ui, sans-serif',
    fontDisplay: '"DM Serif Display", Georgia, serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
  },
}

// ── CSS Export ───────────────────────────────────────────────────────

export function generateCSS(theme: ThemeState): string {
  const lines = [':root {']
  lines.push(`  --radius: ${theme.radius};`)
  for (const [key, value] of Object.entries(theme.light)) {
    lines.push(`  --${key}: ${value};`)
  }
  lines.push('}')
  lines.push('')
  lines.push('.dark {')
  for (const [key, value] of Object.entries(theme.dark)) {
    lines.push(`  --${key}: ${value};`)
  }
  lines.push('}')
  return lines.join('\n')
}

export function generateJSON(theme: ThemeState): string {
  return JSON.stringify({ light: theme.light, dark: theme.dark, radius: theme.radius }, null, 2)
}

// ── Zustand store ───────────────────────────────────────────────────

const THROTTLE_MS = 500
const MAX_HISTORY = 30

interface EditorStore {
  theme: ThemeState
  isDark: boolean
  preset: string
  history: ThemeState[]
  future: ThemeState[]
  setColor: (key: ThemeColorKey, value: string) => void
  setRadius: (value: string) => void
  setFont: (key: 'fontSans' | 'fontDisplay' | 'fontMono', value: string) => void
  toggleDark: () => void
  loadPreset: (name: string) => void
  undo: () => void
  redo: () => void
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => {
      let lastPushTime = 0

      function pushHistory(current: ThemeState) {
        const now = Date.now()
        set((s) => {
          // Throttle: if within 500ms, replace last history entry
          if (now - lastPushTime < THROTTLE_MS && s.history.length > 0) {
            return { history: s.history, future: [] }
          }
          lastPushTime = now
          const history = [...s.history, current].slice(-MAX_HISTORY)
          return { history, future: [] }
        })
      }

      return {
        theme: PRESETS.terracotta,
        isDark: false,
        preset: 'terracotta',
        history: [],
        future: [],

        setColor: (key, value) => {
          const { theme, isDark } = get()
          pushHistory(theme)
          const mode = isDark ? 'dark' : 'light'
          set({
            theme: { ...theme, [mode]: { ...theme[mode], [key]: value } },
            preset: 'custom',
          })
        },

        setRadius: (value) => {
          const { theme } = get()
          pushHistory(theme)
          set({ theme: { ...theme, radius: value }, preset: 'custom' })
        },

        setFont: (key, value) => {
          const { theme } = get()
          pushHistory(theme)
          set({ theme: { ...theme, [key]: value }, preset: 'custom' })
        },

        toggleDark: () => set((s) => ({ isDark: !s.isDark })),

        loadPreset: (name) => {
          const p = PRESETS[name]
          if (!p) return
          const { theme } = get()
          pushHistory(theme)
          set({ theme: p, preset: name })
        },

        undo: () => {
          const { history, theme } = get()
          if (history.length === 0) return
          const prev = history[history.length - 1]
          set({
            theme: prev,
            history: history.slice(0, -1),
            future: [theme, ...get().future],
            preset: 'custom',
          })
        },

        redo: () => {
          const { future, theme } = get()
          if (future.length === 0) return
          const next = future[0]
          set({
            theme: next,
            future: future.slice(1),
            history: [...get().history, theme],
            preset: 'custom',
          })
        },
      }
    },
    { name: 'theme-editor' }
  )
)
```

**Step 3: Verify build passes**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add package.json bun.lockb src/components/theme-editor/theme-store.ts
git commit -m "feat: add zustand theme editor store with presets and undo/redo"
```

---

### Task 4: Create color picker and slider primitives

**Files:**
- Create: `src/components/theme-editor/color-picker.tsx`
- Create: `src/components/theme-editor/slider-input.tsx`

**Step 1: Create `src/components/theme-editor/color-picker.tsx`**

This uses the tweakcn pattern: native `<input type="color">` with an opacity-0 overlay (triggers the OS color picker when clicked), plus an uncontrolled text input for hex editing (avoids re-renders on every keystroke).

```typescript
import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function ColorPicker({ label, value, onChange, className }: ColorPickerProps) {
  const textRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Sync text input when value changes externally
  useEffect(() => {
    if (textRef.current && textRef.current !== document.activeElement) {
      textRef.current.value = value
    }
  }, [value])

  const debouncedChange = useCallback(
    (v: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onChange(v), 150)
    },
    [onChange]
  )

  const handleColorInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (textRef.current) textRef.current.value = v
      debouncedChange(v)
    },
    [debouncedChange]
  )

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        debouncedChange(v)
      }
    },
    [debouncedChange]
  )

  const handleTextBlur = useCallback(() => {
    // Reset to current value if invalid
    if (textRef.current) textRef.current.value = value
  }, [value])

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <span className="text-sm text-muted-foreground truncate">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="relative h-6 w-6 shrink-0">
          <div
            className="absolute inset-0 rounded border border-border"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={value}
            onChange={handleColorInput}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <input
          ref={textRef}
          type="text"
          defaultValue={value}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          className="h-6 w-20 rounded border border-border bg-background px-1.5 text-xs font-mono"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
```

**Step 2: Create `src/components/theme-editor/slider-input.tsx`**

Dual-control: a range slider + a text input, both synced. For the radius control.

```typescript
import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface SliderInputProps {
  label: string
  value: string       // e.g. "0.625rem"
  onChange: (value: string) => void
  min: number          // in rem
  max: number          // in rem
  step: number         // in rem
  unit?: string        // default "rem"
  className?: string
}

export function SliderInput({
  label, value, onChange, min, max, step, unit = 'rem', className,
}: SliderInputProps) {
  const numValue = Number.parseFloat(value) || 0
  const textRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (textRef.current && textRef.current !== document.activeElement) {
      textRef.current.value = numValue.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
    }
  }, [numValue])

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value)
      onChange(`${v}${unit}`)
    },
    [onChange, unit]
  )

  const handleText = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number.parseFloat(e.target.value)
      if (!Number.isNaN(v) && v >= min && v <= max) {
        onChange(`${v}${unit}`)
      }
    },
    [onChange, min, max, unit]
  )

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <input
            ref={textRef}
            type="text"
            defaultValue={numValue}
            onChange={handleText}
            className="h-6 w-14 rounded border border-border bg-background px-1.5 text-xs font-mono text-right"
            spellCheck={false}
          />
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={handleSlider}
        className="w-full accent-primary"
      />
    </div>
  )
}
```

**Step 3: Verify build passes**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/theme-editor/color-picker.tsx src/components/theme-editor/slider-input.tsx
git commit -m "feat: add color picker and slider input primitives for theme editor"
```

---

### Task 5: Create controls panel

**Files:**
- Create: `src/components/theme-editor/controls-panel.tsx`

**Step 1: Create `src/components/theme-editor/controls-panel.tsx`**

This is the left sidebar. It uses our `Accordion` component to group color pickers into collapsible sections, plus a preset selector, dark/light toggle, radius slider, and font selectors. Undo/redo buttons at the top.

```typescript
import { Moon, Redo2, Sun, Undo2 } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ColorPicker } from './color-picker'
import { SliderInput } from './slider-input'
import { type ThemeColorKey, useEditorStore } from './theme-store'

const COLOR_SECTIONS: { title: string; keys: { key: ThemeColorKey; label: string }[] }[] = [
  {
    title: 'Base',
    keys: [
      { key: 'background', label: 'Background' },
      { key: 'foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Primary',
    keys: [
      { key: 'primary', label: 'Primary' },
      { key: 'primary-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Secondary',
    keys: [
      { key: 'secondary', label: 'Secondary' },
      { key: 'secondary-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Muted',
    keys: [
      { key: 'muted', label: 'Muted' },
      { key: 'muted-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Accent',
    keys: [
      { key: 'accent', label: 'Accent' },
      { key: 'accent-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Card',
    keys: [
      { key: 'card', label: 'Card' },
      { key: 'card-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Popover',
    keys: [
      { key: 'popover', label: 'Popover' },
      { key: 'popover-foreground', label: 'Foreground' },
    ],
  },
  {
    title: 'Destructive',
    keys: [{ key: 'destructive', label: 'Destructive' }],
  },
  {
    title: 'Border / Input / Ring',
    keys: [
      { key: 'border', label: 'Border' },
      { key: 'input', label: 'Input' },
      { key: 'ring', label: 'Ring' },
    ],
  },
  {
    title: 'Charts',
    keys: [
      { key: 'chart-1', label: 'Chart 1' },
      { key: 'chart-2', label: 'Chart 2' },
      { key: 'chart-3', label: 'Chart 3' },
      { key: 'chart-4', label: 'Chart 4' },
      { key: 'chart-5', label: 'Chart 5' },
    ],
  },
  {
    title: 'Sidebar',
    keys: [
      { key: 'sidebar', label: 'Sidebar' },
      { key: 'sidebar-foreground', label: 'Foreground' },
      { key: 'sidebar-primary', label: 'Primary' },
      { key: 'sidebar-primary-foreground', label: 'Primary FG' },
      { key: 'sidebar-accent', label: 'Accent' },
      { key: 'sidebar-accent-foreground', label: 'Accent FG' },
      { key: 'sidebar-border', label: 'Border' },
      { key: 'sidebar-ring', label: 'Ring' },
    ],
  },
]

const SYSTEM_FONTS = [
  { value: '"DM Sans", -apple-system, system-ui, sans-serif', label: 'DM Sans' },
  { value: '-apple-system, system-ui, sans-serif', label: 'System Sans' },
  { value: '"Inter", -apple-system, system-ui, sans-serif', label: 'Inter' },
  { value: '"Geist", -apple-system, system-ui, sans-serif', label: 'Geist' },
]

const DISPLAY_FONTS = [
  { value: '"DM Serif Display", Georgia, serif', label: 'DM Serif Display' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Playfair Display", Georgia, serif', label: 'Playfair Display' },
]

const MONO_FONTS = [
  { value: '"JetBrains Mono", ui-monospace, monospace', label: 'JetBrains Mono' },
  { value: 'ui-monospace, monospace', label: 'System Mono' },
  { value: '"Fira Code", ui-monospace, monospace', label: 'Fira Code' },
]

export function ControlsPanel() {
  const {
    theme, isDark, preset,
    setColor, setRadius, setFont,
    toggleDark, loadPreset,
    undo, redo, history, future,
  } = useEditorStore()

  const currentColors = isDark ? theme.dark : theme.light

  return (
    <div className="flex h-full w-80 flex-col border-r border-border bg-background overflow-y-auto">
      {/* Header: preset + dark/light + undo/redo */}
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Select value={preset} onValueChange={loadPreset}>
            <SelectTrigger className="flex-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="terracotta">Terracotta</SelectItem>
              <SelectItem value="ocean">Ocean</SelectItem>
              <SelectItem value="forest">Forest</SelectItem>
              <SelectItem value="amethyst">Amethyst</SelectItem>
              {preset === 'custom' && <SelectItem value="custom">Custom</SelectItem>}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleDark}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            disabled={history.length === 0}
            onClick={undo}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            disabled={future.length === 0}
            onClick={redo}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Color sections */}
      <Accordion type="multiple" defaultValue={['Base', 'Primary', 'Secondary']} className="px-4">
        {COLOR_SECTIONS.map((section) => (
          <AccordionItem key={section.title} value={section.title}>
            <AccordionTrigger className="text-sm py-2">{section.title}</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2 pb-2">
                {section.keys.map(({ key, label }) => (
                  <ColorPicker
                    key={key}
                    label={label}
                    value={currentColors[key]}
                    onChange={(v) => setColor(key, v)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}

        {/* Typography */}
        <AccordionItem value="typography">
          <AccordionTrigger className="text-sm py-2">Typography</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3 pb-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Sans</label>
                <Select value={theme.fontSans} onValueChange={(v) => setFont('fontSans', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SYSTEM_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Display</label>
                <Select value={theme.fontDisplay} onValueChange={(v) => setFont('fontDisplay', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISPLAY_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mono</label>
                <Select value={theme.fontMono} onValueChange={(v) => setFont('fontMono', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONO_FONTS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Radius */}
        <AccordionItem value="radius">
          <AccordionTrigger className="text-sm py-2">Radius</AccordionTrigger>
          <AccordionContent>
            <SliderInput
              label="Border Radius"
              value={theme.radius}
              onChange={setRadius}
              min={0}
              max={1.5}
              step={0.125}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
```

**Step 2: Verify build passes**

```bash
bunx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/theme-editor/controls-panel.tsx
git commit -m "feat: add theme editor controls panel with color pickers, fonts, radius"
```

---

### Task 6: Create preview compositions (6 sections)

**Files:**
- Create: `src/components/theme-editor/compositions/dashboard-cards.tsx`
- Create: `src/components/theme-editor/compositions/conversation-thread.tsx`
- Create: `src/components/theme-editor/compositions/builder-input.tsx`
- Create: `src/components/theme-editor/compositions/code-files.tsx`
- Create: `src/components/theme-editor/compositions/ui-primitives.tsx`
- Create: `src/components/theme-editor/compositions/data-display.tsx`

Each composition renders real components with hardcoded mock data. The components themselves use Tailwind classes (`bg-card`, `text-primary`, etc.) which automatically respond to CSS variable overrides from the parent container.

**Step 1: Create all 6 composition files**

**`dashboard-cards.tsx`** — Cards with Badge, Progress, Avatar, Skeleton to show surface colors:

```typescript
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardCards() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Revenue</CardDescription>
          <CardTitle className="text-2xl">$45,231.89</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary">+20.1% from last month</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Active Users</CardDescription>
          <CardTitle className="text-2xl">2,350</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={72} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Team Members</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex -space-x-2">
            {['JD', 'AK', 'RS', 'ML'].map((initials) => (
              <Avatar key={initials} className="h-8 w-8 border-2 border-background">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Loading State</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    </div>
  )
}
```

**`conversation-thread.tsx`** — Uses ActionCard and ThinkingCard with mock data:

```typescript
import { ActionCard } from '@/components/ai-elements/action-card'
import { ThinkingCard } from '@/components/ai-elements/thinking-card'

export function ConversationThread() {
  const now = Date.now()

  return (
    <div className="flex flex-col gap-3">
      {/* User message */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm">
          Build me a dashboard with user analytics
        </div>
      </div>

      {/* Thinking */}
      <ThinkingCard startedAt={now - 3000} status="complete" durationMs={2800}>
        <p className="text-sm text-muted-foreground">
          Planning the dashboard layout with charts, user stats, and activity feed...
        </p>
      </ThinkingCard>

      {/* Action card */}
      <ActionCard.Root status="complete">
        <ActionCard.Header>
          <ActionCard.Icon icon="code" />
          <ActionCard.Title>Creating Dashboard Components</ActionCard.Title>
          <ActionCard.Duration ms={1450} />
        </ActionCard.Header>
        <ActionCard.Content>
          <ActionCard.Tabs defaultValue="files">
            <ActionCard.TabList>
              <ActionCard.Tab value="files">Files</ActionCard.Tab>
              <ActionCard.Tab value="output">Output</ActionCard.Tab>
            </ActionCard.TabList>
            <ActionCard.TabPanel value="files">
              <div className="space-y-1 text-sm text-muted-foreground p-2">
                <div>src/components/Dashboard.tsx</div>
                <div>src/components/UserStats.tsx</div>
                <div>src/components/ActivityFeed.tsx</div>
              </div>
            </ActionCard.TabPanel>
          </ActionCard.Tabs>
        </ActionCard.Content>
      </ActionCard.Root>

      {/* Assistant response */}
      <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2 text-sm">
        I've created the dashboard with three components. The layout uses a responsive grid with user statistics at the top and an activity feed below.
      </div>
    </div>
  )
}
```

**Important note for implementer:** The `ActionCard` API above is illustrative. Check the actual exported API from `src/components/ai-elements/action-card.tsx` — it uses a Context-based compound component pattern. Read the file and use the actual exports. If the compound API doesn't support this usage pattern, simplify to just render a styled card with mock text instead.

**`builder-input.tsx`** — PromptInput and ClarificationQuestions:

```typescript
import { ClarificationQuestions } from '@/components/clarification-questions'
import type { ClarificationQuestion } from '@/lib/types'

const MOCK_QUESTIONS: ClarificationQuestion[] = [
  {
    question: 'What authentication method do you prefer?',
    selectionMode: 'single',
    options: [
      { label: 'Email/Password', description: 'Traditional email-based auth' },
      { label: 'OAuth (Google)', description: 'Sign in with Google' },
      { label: 'Magic Link', description: 'Passwordless email links' },
    ],
  },
]

export function BuilderInput() {
  return (
    <div className="flex flex-col gap-4">
      {/* Simple prompt input mockup (avoid PromptInput — it has complex context deps) */}
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            Describe what you want to build...
          </div>
          <div className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground font-medium">
            Send
          </div>
        </div>
      </div>

      <ClarificationQuestions
        questions={MOCK_QUESTIONS}
        onSubmit={() => {}}
        disabled={false}
      />
    </div>
  )
}
```

**`code-files.tsx`** — DiffViewer and FileTree:

```typescript
import { DiffViewer } from '@/components/ai-elements/diff-viewer'
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree'

export function CodeFiles() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
          File Changes
        </div>
        <DiffViewer
          oldContent={`import { useState } from 'react'\n\nexport function App() {\n  return <div>Hello</div>\n}`}
          newContent={`import { useState } from 'react'\nimport { Button } from './ui/button'\n\nexport function App() {\n  const [count, setCount] = useState(0)\n  return (\n    <div>\n      <h1>Counter: {count}</h1>\n      <Button onClick={() => setCount(c => c + 1)}>Increment</Button>\n    </div>\n  )\n}`}
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
          Project Files
        </div>
        <FileTree>
          <FileTreeFolder name="src" defaultOpen>
            <FileTreeFolder name="components" defaultOpen>
              <FileTreeFile name="App.tsx" />
              <FileTreeFile name="Button.tsx" />
              <FileTreeFile name="Dashboard.tsx" />
            </FileTreeFolder>
            <FileTreeFile name="main.tsx" />
            <FileTreeFile name="index.css" />
          </FileTreeFolder>
          <FileTreeFile name="package.json" />
        </FileTree>
      </div>
    </div>
  )
}
```

**Important note for implementer:** Check the actual FileTree API in `src/components/ai-elements/file-tree.tsx`. It may use a data-prop pattern (passing a file tree object) rather than compound components. Read the file and use its actual API. If it requires complex context setup, simplify to a basic tree-like display with styled divs.

**`ui-primitives.tsx`** — Buttons, inputs, badges, tabs, selects, etc.:

```typescript
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function UIPrimitives() {
  return (
    <div className="space-y-6">
      {/* Buttons */}
      <div>
        <h3 className="text-sm font-medium mb-3">Buttons</h3>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
      </div>

      <Separator />

      {/* Badges */}
      <div>
        <h3 className="text-sm font-medium mb-3">Badges</h3>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </div>

      <Separator />

      {/* Form Controls */}
      <div>
        <h3 className="text-sm font-medium mb-3">Form Controls</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input placeholder="user@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Framework</Label>
            <Select defaultValue="react">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="react">React</SelectItem>
                <SelectItem value="vue">Vue</SelectItem>
                <SelectItem value="svelte">Svelte</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Checkboxes & Radios */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Checkboxes</h3>
          <div className="flex items-center gap-2">
            <Checkbox id="terms" defaultChecked />
            <Label htmlFor="terms">Accept terms</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="newsletter" />
            <Label htmlFor="newsletter">Subscribe</Label>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Radio Group</h3>
          <RadioGroup defaultValue="comfortable">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="comfortable" id="comfortable" />
              <Label htmlFor="comfortable">Comfortable</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="compact" id="compact" />
              <Label htmlFor="compact">Compact</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <div>
        <h3 className="text-sm font-medium mb-3">Tabs</h3>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-sm text-muted-foreground p-4">
            Overview content goes here.
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

**`data-display.tsx`** — TestResults, PageProgressCard, ArchitectureCard, OperationSummaryCard:

```typescript
import { TestResults } from '@/components/ai-elements/test-results'
import { PageProgressCard } from '@/components/ai-elements/page-progress-card'

export function DataDisplay() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <PageProgressCard
        title="Building Dashboard"
        currentStep={3}
        totalSteps={5}
        steps={[
          { label: 'Setup project', status: 'complete' },
          { label: 'Create components', status: 'complete' },
          { label: 'Add styling', status: 'active' },
          { label: 'Wire data', status: 'pending' },
          { label: 'Deploy', status: 'pending' },
        ]}
      />

      <TestResults
        results={{
          total: 12,
          passed: 10,
          failed: 1,
          skipped: 1,
          duration: 2340,
          suites: [
            {
              name: 'Dashboard.test.tsx',
              tests: [
                { name: 'renders header', status: 'passed', duration: 45 },
                { name: 'shows user stats', status: 'passed', duration: 120 },
                { name: 'handles empty state', status: 'failed', duration: 89, error: 'Expected element to be visible' },
              ],
            },
          ],
        }}
      />
    </div>
  )
}
```

**Important note for implementer:** The props for `PageProgressCard` and `TestResults` above are illustrative. Read the actual component files at `src/components/ai-elements/page-progress-card.tsx` and `src/components/ai-elements/test-results.tsx` to get the correct prop interfaces. Adapt the mock data to match the real types.

**Step 2: Verify build passes**

```bash
bunx tsc --noEmit
```

Fix any import errors by checking the actual component APIs and adjusting.

**Step 3: Commit**

```bash
git add src/components/theme-editor/compositions/
git commit -m "feat: add 6 preview composition sections for theme editor"
```

---

### Task 7: Create preview panel and export dialog

**Files:**
- Create: `src/components/theme-editor/preview-panel.tsx`
- Create: `src/components/theme-editor/export-dialog.tsx`

**Step 1: Create `src/components/theme-editor/preview-panel.tsx`**

This is the right side. It wraps all 6 compositions in a scrollable container with the theme's CSS variables applied via inline styles.

```typescript
import { buildStyles, useEditorStore } from './theme-store'
import { DashboardCards } from './compositions/dashboard-cards'
import { ConversationThread } from './compositions/conversation-thread'
import { BuilderInput } from './compositions/builder-input'
import { CodeFiles } from './compositions/code-files'
import { UIPrimitives } from './compositions/ui-primitives'
import { DataDisplay } from './compositions/data-display'

export function PreviewPanel() {
  const { theme, isDark } = useEditorStore()

  const colors = isDark ? theme.dark : theme.light
  const styles = buildStyles(colors, theme.radius, {
    sans: theme.fontSans,
    display: theme.fontDisplay,
    mono: theme.fontMono,
  })

  return (
    <div
      className="flex-1 overflow-y-auto bg-background text-foreground"
      style={styles}
    >
      <div className="mx-auto max-w-4xl space-y-8 p-6">
        <section>
          <h2 className="text-lg font-semibold mb-4">Dashboard Cards</h2>
          <DashboardCards />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Conversation</h2>
          <ConversationThread />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Builder Input</h2>
          <BuilderInput />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Code & Files</h2>
          <CodeFiles />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">UI Primitives</h2>
          <UIPrimitives />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Data Display</h2>
          <DataDisplay />
        </section>
      </div>
    </div>
  )
}
```

**Step 2: Create `src/components/theme-editor/export-dialog.tsx`**

```typescript
import { useCallback, useState } from 'react'
import { Check, Clipboard, Code, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { generateCSS, generateJSON, useEditorStore } from './theme-store'

export function ExportDialog() {
  const { theme } = useEditorStore()
  const [copied, setCopied] = useState<string | null>(null)

  const css = generateCSS(theme)
  const json = generateJSON(theme)

  const handleCopy = useCallback(
    async (text: string, type: string) => {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    },
    []
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Code className="h-4 w-4 mr-1.5" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Export Theme</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="css">
          <TabsList>
            <TabsTrigger value="css">CSS</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="css" className="relative">
            <Button
              variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7"
              onClick={() => handleCopy(css, 'css')}
            >
              {copied === 'css' ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            </Button>
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-auto max-h-[50vh]">
              {css}
            </pre>
          </TabsContent>
          <TabsContent value="json" className="relative">
            <Button
              variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7"
              onClick={() => handleCopy(json, 'json')}
            >
              {copied === 'json' ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            </Button>
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-auto max-h-[50vh]">
              {json}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 3: Verify build passes**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/theme-editor/preview-panel.tsx src/components/theme-editor/export-dialog.tsx
git commit -m "feat: add preview panel and export dialog for theme editor"
```

---

### Task 8: Create main ThemeEditor layout and route

**Files:**
- Create: `src/components/theme-editor/index.tsx`
- Create: `src/routes/_authenticated/theme-editor.tsx`

**Step 1: Create `src/components/theme-editor/index.tsx`**

```typescript
import { ControlsPanel } from './controls-panel'
import { ExportDialog } from './export-dialog'
import { PreviewPanel } from './preview-panel'

export function ThemeEditor() {
  return (
    <div className="flex h-[calc(100vh-2rem)] overflow-hidden">
      <ControlsPanel />
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h1 className="text-lg font-semibold">Theme Editor</h1>
          <ExportDialog />
        </div>
        <PreviewPanel />
      </div>
    </div>
  )
}
```

**Step 2: Create `src/routes/_authenticated/theme-editor.tsx`**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { ThemeEditor } from '@/components/theme-editor'

export const Route = createFileRoute('/_authenticated/theme-editor')({
  component: ThemeEditor,
})
```

**Step 3: Run TanStack Router code generation**

TanStack Router auto-generates the route tree. Run the dev server briefly or build to trigger it:

```bash
bunx tsc --noEmit
```

If it complains about missing route tree entries, run:

```bash
bun run build
```

The TanStackRouterVite plugin will regenerate `src/routeTree.gen.ts`.

**Step 4: Verify dev server works**

```bash
# In a separate terminal:
bun run dev
# Navigate to http://localhost:5173/theme-editor
# Should see the two-panel layout with controls on left, preview on right
```

**Step 5: Commit**

```bash
git add src/components/theme-editor/index.tsx src/routes/_authenticated/theme-editor.tsx src/routeTree.gen.ts
git commit -m "feat: add /theme-editor route with main layout"
```

---

### Task 9: Fix composition API mismatches

After Task 8, some compositions may not compile because the mock data doesn't match the actual component APIs. This task is for fixing those.

**Step 1: Run the build**

```bash
bunx tsc --noEmit
```

**Step 2: For each error, read the actual component file**

For example, if `ActionCard` doesn't export `ActionCard.Root`, read `src/components/ai-elements/action-card.tsx` and use whatever API it actually exports.

If `FileTree` expects a `data` prop instead of compound components, read `src/components/ai-elements/file-tree.tsx` and pass the correct data structure.

If `PageProgressCard` or `TestResults` have different prop shapes, read the files and fix the mock data.

**Step 3: Simplify compositions that can't be easily mocked**

If a component requires complex context providers (React Flow, etc.) or hooks that are hard to mock outside the app, replace it with a styled div placeholder that shows the same color tokens:

```typescript
// Instead of <SomeComplexComponent />, use:
<div className="rounded-lg border border-border bg-card p-4">
  <div className="text-sm font-medium text-card-foreground">Component Name</div>
  <div className="text-xs text-muted-foreground mt-1">Preview placeholder</div>
</div>
```

**Step 4: Verify clean build**

```bash
bunx tsc --noEmit
```

**Step 5: Verify tests pass**

```bash
bun run test --run
```

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: resolve composition API mismatches in theme editor"
```

---

### Task 10: Verify end-to-end and lint

**Step 1: Run full verification suite**

```bash
bunx tsc --noEmit
bun run lint
bun run test --run
```

**Step 2: Fix any lint errors**

OxLint may flag unused imports, missing types, etc. Fix all errors.

**Step 3: Verify dev server and navigate to /theme-editor**

```bash
bun run dev
# Open http://localhost:5173/theme-editor (after logging in)
```

Verify:
- [ ] Left panel shows preset selector, dark/light toggle, undo/redo buttons
- [ ] Color picker sections are collapsible accordion
- [ ] Clicking a color swatch opens the native color picker
- [ ] Hex input accepts valid hex values
- [ ] Changing a color immediately updates the preview panel
- [ ] Toggling dark mode updates the preview
- [ ] Loading a preset updates all colors
- [ ] Export dialog shows CSS and JSON with copy buttons
- [ ] Radius slider changes border radius across all components
- [ ] Font selector changes fonts in the preview
- [ ] Undo/redo works for color changes

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: lint fixes and verification for theme editor"
```
