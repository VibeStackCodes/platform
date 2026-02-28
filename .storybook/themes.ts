/**
 * Full theme palettes for Storybook preview.
 *
 * Each theme defines ALL CSS variables (surfaces + accents + radius) for both
 * light and dark modes. Inline styles on a wrapper <div> override both the raw
 * vars (--primary) AND Tailwind's mapped vars (--color-primary), bypassing the
 * @theme inline var() resolution issue on :root.
 */

type ThemeVars = Record<string, string>

interface ThemePalette {
  light: ThemeVars
  dark: ThemeVars
}

// Helper: given raw vars, generate both raw + Tailwind --color-* mapped vars
function buildStyles(raw: ThemeVars): React.CSSProperties {
  const styles: Record<string, string> = {}

  // Tailwind var name mapping: --primary → --color-primary
  const MAPPED = [
    'background', 'foreground', 'card', 'card-foreground',
    'popover', 'popover-foreground', 'primary', 'primary-foreground',
    'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring',
    'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
    'sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
    'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
  ]

  for (const [key, value] of Object.entries(raw)) {
    // Set the raw var (e.g. --primary)
    styles[`--${key}`] = value

    // If it's a mapped var, also set --color-<name>
    if (MAPPED.includes(key)) {
      styles[`--color-${key}`] = value
    }
  }

  // Derive radius variants if radius is set
  if (raw.radius) {
    const r = raw.radius
    styles['--radius-sm'] = `calc(${r} - 4px)`
    styles['--radius-md'] = `calc(${r} - 2px)`
    styles['--radius-lg'] = r
    styles['--radius-xl'] = `calc(${r} + 4px)`
    styles['--radius-2xl'] = `calc(${r} + 8px)`
  }

  return styles as React.CSSProperties
}

// ─── Terracotta (default — empty, uses :root values) ────────────────────
const terracotta: ThemePalette = {
  light: {},
  dark: {},
}

// ─── Ocean — cool blue-slate surfaces ───────────────────────────────────
const ocean: ThemePalette = {
  light: {
    radius: '0.5rem',
    background: '#f5f8fa',
    foreground: '#0f1419',
    card: '#edf2f7',
    'card-foreground': '#0f1419',
    popover: '#ffffff',
    'popover-foreground': '#0f1419',
    primary: '#1d6fa5',
    'primary-foreground': '#ffffff',
    secondary: '#e2e8f0',
    'secondary-foreground': '#0f1419',
    muted: '#e2e8f0',
    'muted-foreground': '#64748b',
    accent: '#e2e8f0',
    'accent-foreground': '#0f1419',
    destructive: '#dc2626',
    border: '#cbd5e1',
    input: '#ffffff',
    ring: '#1d6fa5',
    'chart-1': '#1d6fa5',
    'chart-2': '#ba5a38',
    'chart-3': '#059669',
    'chart-4': '#8b5cf6',
    'chart-5': '#6366f1',
    sidebar: '#e2e8f0',
    'sidebar-foreground': '#0f1419',
    'sidebar-primary': '#1d6fa5',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#cbd5e1',
    'sidebar-accent-foreground': '#0f1419',
    'sidebar-border': '#cbd5e1',
    'sidebar-ring': '#1d6fa5',
  },
  dark: {
    radius: '0.5rem',
    background: '#0f1419',
    foreground: '#e2e8f0',
    card: '#1a2332',
    'card-foreground': '#e2e8f0',
    popover: '#1a2332',
    'popover-foreground': '#e2e8f0',
    primary: '#4da3d4',
    'primary-foreground': '#ffffff',
    secondary: '#1e293b',
    'secondary-foreground': '#e2e8f0',
    muted: '#1e293b',
    'muted-foreground': '#94a3b8',
    accent: '#1e293b',
    'accent-foreground': '#e2e8f0',
    destructive: '#ef4444',
    border: '#334155',
    input: '#1e293b',
    ring: '#4da3d4',
    'chart-1': '#4da3d4',
    'chart-2': '#ba5a38',
    'chart-3': '#34d399',
    'chart-4': '#a78bfa',
    'chart-5': '#818cf8',
    sidebar: '#0f1419',
    'sidebar-foreground': '#e2e8f0',
    'sidebar-primary': '#4da3d4',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#1e293b',
    'sidebar-accent-foreground': '#e2e8f0',
    'sidebar-border': '#334155',
    'sidebar-ring': '#4da3d4',
  },
}

// ─── Forest — warm green-tinted surfaces ────────────────────────────────
const forest: ThemePalette = {
  light: {
    radius: '0.75rem',
    background: '#f5f9f5',
    foreground: '#1a1f1a',
    card: '#ecf4ec',
    'card-foreground': '#1a1f1a',
    popover: '#ffffff',
    'popover-foreground': '#1a1f1a',
    primary: '#2d7a3a',
    'primary-foreground': '#ffffff',
    secondary: '#e2ede2',
    'secondary-foreground': '#1a1f1a',
    muted: '#e2ede2',
    'muted-foreground': '#5c6b5c',
    accent: '#e2ede2',
    'accent-foreground': '#1a1f1a',
    destructive: '#dc2626',
    border: '#c8d8c8',
    input: '#ffffff',
    ring: '#2d7a3a',
    'chart-1': '#2d7a3a',
    'chart-2': '#6a9bcc',
    'chart-3': '#d97757',
    'chart-4': '#8b5cf6',
    'chart-5': '#6366f1',
    sidebar: '#e2ede2',
    'sidebar-foreground': '#1a1f1a',
    'sidebar-primary': '#2d7a3a',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#c8d8c8',
    'sidebar-accent-foreground': '#1a1f1a',
    'sidebar-border': '#c8d8c8',
    'sidebar-ring': '#2d7a3a',
  },
  dark: {
    radius: '0.75rem',
    background: '#141a14',
    foreground: '#d4e4d4',
    card: '#1c261c',
    'card-foreground': '#d4e4d4',
    popover: '#1c261c',
    'popover-foreground': '#d4e4d4',
    primary: '#4ade80',
    'primary-foreground': '#0a1f12',
    secondary: '#243024',
    'secondary-foreground': '#d4e4d4',
    muted: '#243024',
    'muted-foreground': '#7a937a',
    accent: '#243024',
    'accent-foreground': '#d4e4d4',
    destructive: '#ef4444',
    border: '#2d3d2d',
    input: '#243024',
    ring: '#4ade80',
    'chart-1': '#4ade80',
    'chart-2': '#6a9bcc',
    'chart-3': '#d97757',
    'chart-4': '#a78bfa',
    'chart-5': '#818cf8',
    sidebar: '#141a14',
    'sidebar-foreground': '#d4e4d4',
    'sidebar-primary': '#4ade80',
    'sidebar-primary-foreground': '#0a1f12',
    'sidebar-accent': '#243024',
    'sidebar-accent-foreground': '#d4e4d4',
    'sidebar-border': '#2d3d2d',
    'sidebar-ring': '#4ade80',
  },
}

// ─── Amethyst — cool purple-tinted surfaces ─────────────────────────────
const amethyst: ThemePalette = {
  light: {
    radius: '0.375rem',
    background: '#f8f5ff',
    foreground: '#1a1625',
    card: '#f0eaff',
    'card-foreground': '#1a1625',
    popover: '#ffffff',
    'popover-foreground': '#1a1625',
    primary: '#7c3aed',
    'primary-foreground': '#ffffff',
    secondary: '#e8e0f5',
    'secondary-foreground': '#1a1625',
    muted: '#e8e0f5',
    'muted-foreground': '#6b6080',
    accent: '#e8e0f5',
    'accent-foreground': '#1a1625',
    destructive: '#dc2626',
    border: '#d4c8e8',
    input: '#ffffff',
    ring: '#7c3aed',
    'chart-1': '#7c3aed',
    'chart-2': '#ec4899',
    'chart-3': '#059669',
    'chart-4': '#f59e0b',
    'chart-5': '#6366f1',
    sidebar: '#e8e0f5',
    'sidebar-foreground': '#1a1625',
    'sidebar-primary': '#7c3aed',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#d4c8e8',
    'sidebar-accent-foreground': '#1a1625',
    'sidebar-border': '#d4c8e8',
    'sidebar-ring': '#7c3aed',
  },
  dark: {
    radius: '0.375rem',
    background: '#1a1625',
    foreground: '#e8e0f5',
    card: '#221d30',
    'card-foreground': '#e8e0f5',
    popover: '#221d30',
    'popover-foreground': '#e8e0f5',
    primary: '#a78bfa',
    'primary-foreground': '#ffffff',
    secondary: '#2d2640',
    'secondary-foreground': '#e8e0f5',
    muted: '#2d2640',
    'muted-foreground': '#8b80a0',
    accent: '#2d2640',
    'accent-foreground': '#e8e0f5',
    destructive: '#ef4444',
    border: '#3d3555',
    input: '#2d2640',
    ring: '#a78bfa',
    'chart-1': '#a78bfa',
    'chart-2': '#f472b6',
    'chart-3': '#34d399',
    'chart-4': '#fbbf24',
    'chart-5': '#818cf8',
    sidebar: '#1a1625',
    'sidebar-foreground': '#e8e0f5',
    'sidebar-primary': '#a78bfa',
    'sidebar-primary-foreground': '#ffffff',
    'sidebar-accent': '#2d2640',
    'sidebar-accent-foreground': '#e8e0f5',
    'sidebar-border': '#3d3555',
    'sidebar-ring': '#a78bfa',
  },
}

export const THEMES: Record<string, ThemePalette> = {
  terracotta,
  ocean,
  forest,
  amethyst,
}

export { buildStyles }
