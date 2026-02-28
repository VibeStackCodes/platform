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
