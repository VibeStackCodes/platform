import { formatCss, oklch as toOklch, parse as parseColor } from 'culori'
import type { DesignSystem, TextSlots } from './design-system'
import { DEFAULT_TEXT_SLOTS } from './design-system'

// Re-export from single source of truth
export type {
  DesignSystem,
  TextSlots,
  AestheticDirection,
  LayoutStrategy,
  PageImageManifest,
  ImageEntry,
} from './design-system'
export { DEFAULT_TEXT_SLOTS, DesignSystemSchema } from './design-system'

function colorToOklch(color: string, fallback: string): string {
  const parsed = toOklch(parseColor(color) ?? parseColor(fallback)!)
  if (!parsed) return fallback
  return formatCss(parsed)
}

function buildThemePalette(tokens: DesignSystem) {
  const primary = toOklch(parseColor(tokens.colors.primary) ?? parseColor('#2b6cb0')!)!
  const accent = toOklch(parseColor(tokens.colors.accent) ?? parseColor('#f59e0b')!)!
  const background = toOklch(parseColor(tokens.colors.background) ?? parseColor('#ffffff')!)!

  // Hardening: Ensure foreground colors on light background have enough contrast
  // Targets ~0.40 lightness for dark colors on light backgrounds (WCAG 2.1 AA)
  const ensureAccessible = (color: { l: number; c: number; h?: number }) => {
    if (background.l > 0.5 && color.l > 0.45) {
      return formatCss({ mode: 'oklch', l: 0.40, c: color.c, h: color.h })
    }
    return formatCss({ mode: 'oklch', ...color })
  }

  const safePrimary = ensureAccessible(primary)
  const safeAccent = ensureAccessible(accent)

  const primaryRing = formatCss({ mode: 'oklch', l: primary.l, c: Math.min(primary.c * 0.7, 0.2), h: primary.h })
  const secondaryFg = colorToOklch(tokens.colors.foreground, '#111111')
  const accentFg = colorToOklch(tokens.colors.foreground, '#111111')
  // Darken muted foreground for better legibility (WCAG AA: min 0.35, cap at 0.40 for sufficient contrast)
  const mutedFg = formatCss({ mode: 'oklch', l: Math.min(Math.max(background.l - 0.55, 0.35), 0.40), c: 0.01, h: background.h ?? 0 })

  return {
    background: colorToOklch(tokens.colors.background, '#ffffff'),
    foreground: colorToOklch(tokens.colors.foreground, '#111111'),
    card: colorToOklch(tokens.colors.background, '#ffffff'),
    cardForeground: colorToOklch(tokens.colors.foreground, '#111111'),
    popover: colorToOklch(tokens.colors.background, '#ffffff'),
    popoverForeground: colorToOklch(tokens.colors.foreground, '#111111'),
    primary: safePrimary,
    primaryForeground: colorToOklch(tokens.colors.primaryForeground, '#ffffff'),
    secondary: colorToOklch(tokens.colors.secondary, '#e5e7eb'),
    secondaryForeground: secondaryFg,
    muted: colorToOklch(tokens.colors.muted, '#f3f4f6'),
    mutedForeground: mutedFg,
    accent: safeAccent,
    accentForeground: accentFg,
    border: colorToOklch(tokens.colors.border, '#d1d5db'),
    input: colorToOklch(tokens.colors.border, '#d1d5db'),
    ring: primaryRing,
    darkBackground: formatCss({ mode: 'oklch', l: Math.max(background.l - 0.9, 0.08), c: Math.min(background.c + 0.01, 0.04), h: background.h ?? 0 }),
    darkForeground: 'oklch(0.96 0 0)',
    darkCard: formatCss({ mode: 'oklch', l: Math.max(background.l - 0.82, 0.12), c: Math.min(background.c + 0.01, 0.05), h: background.h ?? 0 }),
    darkPrimary: formatCss({ mode: 'oklch', l: Math.min(primary.l + 0.1, 0.8), c: Math.min(primary.c, 0.25), h: primary.h }),
    darkBorder: formatCss({ mode: 'oklch', l: 0.24, c: 0.02, h: background.h ?? 0 }),
    darkMuted: formatCss({ mode: 'oklch', l: 0.18, c: 0.02, h: background.h ?? 0 }),
    darkMutedForeground: 'oklch(0.62 0.01 250)',
  }
}

export function themeCss(tokens: DesignSystem): string {
  const pal = buildThemePalette(tokens)

  return `@import url('${tokens.fonts.googleFontsUrl}');

@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: ${pal.background};
  --color-foreground: ${pal.foreground};
  --color-card: ${pal.card};
  --color-card-foreground: ${pal.cardForeground};
  --color-popover: ${pal.popover};
  --color-popover-foreground: ${pal.popoverForeground};
  --color-primary: ${pal.primary};
  --color-primary-foreground: ${pal.primaryForeground};
  --color-secondary: ${pal.secondary};
  --color-secondary-foreground: ${pal.secondaryForeground};
  --color-muted: ${pal.muted};
  --color-muted-foreground: ${pal.mutedForeground};
  --color-accent: ${pal.accent};
  --color-accent-foreground: ${pal.accentForeground};
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-destructive-foreground: oklch(0.985 0 0);
  --color-border: ${pal.border};
  --color-input: ${pal.input};
  --color-ring: ${pal.ring};
  --radius: ${tokens.style.borderRadius};
  --font-display: '${tokens.fonts.display}', serif;
  --font-body: '${tokens.fonts.body}', sans-serif;
  --font-sans: var(--font-body);
}

.dark {
  --color-background: ${pal.darkBackground};
  --color-foreground: ${pal.darkForeground};
  --color-card: ${pal.darkCard};
  --color-card-foreground: ${pal.darkForeground};
  --color-popover: ${pal.darkCard};
  --color-popover-foreground: ${pal.darkForeground};
  --color-primary: ${pal.darkPrimary};
  --color-primary-foreground: oklch(0.10 0 0);
  --color-secondary: ${pal.darkMuted};
  --color-secondary-foreground: ${pal.darkForeground};
  --color-muted: ${pal.darkMuted};
  --color-muted-foreground: ${pal.darkMutedForeground};
  --color-accent: ${pal.darkMuted};
  --color-accent-foreground: ${pal.darkForeground};
  --color-border: ${pal.darkBorder};
  --color-input: ${pal.darkBorder};
  --color-ring: ${pal.ring};
}

* { @apply border-border; }

body {
  @apply bg-background text-foreground antialiased;
  font-family: var(--font-body);
}

h1,h2,h3,h4,h5,h6 {
  font-family: var(--font-display);
}
`
}
