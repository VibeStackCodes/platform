---
name: tailwind-v4
description: Tailwind CSS v4 patterns with CSS-first configuration and modern features
version: 1.0.0
tags:
  - tailwind
  - css
  - styling
  - design
---

# Tailwind CSS v4

Instructions for using Tailwind CSS v4 in generated Vite + React 19 apps. Tailwind v4 uses CSS-first configuration, NOT JavaScript config files.

## Configuration

**CRITICAL**: Tailwind v4 uses CSS for configuration, NOT `tailwind.config.ts` or `tailwind.config.js`. All configuration is in CSS files.

### CSS Entry Point

```css
/* src/index.css */
@import "tailwindcss";

/* Custom theme variables */
@theme {
  --color-primary: #3b82f6;
  --color-secondary: #8b5cf6;
  --color-accent: #10b981;
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;
  --color-ring: #3b82f6;

  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;

  --font-sans: ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;
}

/* Dark mode theme */
@variant dark {
  @theme {
    --color-background: #0f172a;
    --color-foreground: #f1f5f9;
    --color-muted: #1e293b;
    --color-muted-foreground: #94a3b8;
    --color-border: #334155;
    --color-input: #334155;
  }
}

/* Custom utilities */
@layer utilities {
  .text-balance {
    text-wrap: balance;
  }

  .bg-grid {
    background-image:
      linear-gradient(to right, theme(colors.border) 1px, transparent 1px),
      linear-gradient(to bottom, theme(colors.border) 1px, transparent 1px);
    background-size: 4rem 4rem;
  }
}

/* Custom components */
@layer components {
  .btn {
    @apply px-4 py-2 rounded-md font-medium transition-colors;
    @apply bg-primary text-white hover:bg-primary/90;
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring;
  }

  .card {
    @apply rounded-lg border border-border bg-background p-6 shadow-sm;
  }
}
```

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```

## Theme Variables

### Colors

```css
@theme {
  /* Brand colors */
  --color-primary: #3b82f6;
  --color-secondary: #8b5cf6;
  --color-accent: #10b981;
  --color-destructive: #ef4444;

  /* Surface colors */
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-card: #ffffff;
  --color-card-foreground: #0f172a;
  --color-popover: #ffffff;
  --color-popover-foreground: #0f172a;

  /* Muted/subtle colors */
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;

  /* Interactive elements */
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;
  --color-ring: #3b82f6;
}

/* Usage in components */
<div className="bg-primary text-white">
  <h1 className="text-foreground">Title</h1>
  <p className="text-muted-foreground">Subtitle</p>
</div>
```

### Spacing & Sizing

```css
@theme {
  --spacing-0: 0;
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-4: 1rem;
  --spacing-8: 2rem;
  --spacing-16: 4rem;

  --size-xs: 20rem;
  --size-sm: 24rem;
  --size-md: 28rem;
  --size-lg: 32rem;
  --size-xl: 36rem;
}
```

### Border Radius

```css
@theme {
  --radius-sm: 0.25rem;
  --radius: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
  --radius-full: 9999px;
}

/* Usage */
<div className="rounded-lg">Large radius</div>
<div className="rounded-full">Full radius (circle/pill)</div>
```

### Typography

```css
@theme {
  --font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;
  --font-size-4xl: 2.25rem;

  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
}
```

## Dark Mode

Use the `@variant dark` directive for dark mode styles:

```css
/* Define dark mode colors */
@variant dark {
  @theme {
    --color-background: #0f172a;
    --color-foreground: #f1f5f9;
    --color-card: #1e293b;
    --color-card-foreground: #f1f5f9;
    --color-muted: #1e293b;
    --color-muted-foreground: #94a3b8;
    --color-border: #334155;
    --color-input: #334155;
    --color-primary: #60a5fa;
  }
}
```

Enable dark mode via class on `<html>`:

```typescript
// src/components/theme-provider.tsx
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

Manual dark mode classes:

```tsx
<div className="bg-white dark:bg-slate-900">
  <h1 className="text-slate-900 dark:text-slate-100">Title</h1>
</div>
```

## Utility Patterns

### Layout

```tsx
/* Flexbox */
<div className="flex items-center justify-between gap-4">
  <div>Left</div>
  <div>Right</div>
</div>

<div className="flex flex-col gap-2">
  <div>Top</div>
  <div>Bottom</div>
</div>

/* Grid */
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>

/* Container */
<div className="container mx-auto px-4 max-w-7xl">
  {/* Content */}
</div>

/* Center */
<div className="flex items-center justify-center min-h-screen">
  <div>Centered content</div>
</div>
```

### Spacing

```tsx
/* Padding */
<div className="p-4">All sides</div>
<div className="px-4 py-2">Horizontal & vertical</div>
<div className="pt-8 pb-4">Top & bottom</div>

/* Margin */
<div className="m-4">All sides</div>
<div className="mx-auto">Horizontal center</div>
<div className="mt-8 mb-4">Top & bottom</div>

/* Gap (for flex/grid) */
<div className="flex gap-4">Gap between items</div>
<div className="grid grid-cols-3 gap-x-4 gap-y-8">Custom gaps</div>

/* Space between (legacy, prefer gap) */
<div className="flex space-x-4">Horizontal spacing</div>
<div className="flex flex-col space-y-2">Vertical spacing</div>
```

### Typography

```tsx
/* Font size */
<h1 className="text-4xl font-bold">Large heading</h1>
<h2 className="text-2xl font-semibold">Medium heading</h2>
<p className="text-base">Body text</p>
<small className="text-sm text-muted-foreground">Small text</small>

/* Font weight */
<p className="font-light">Light</p>
<p className="font-normal">Normal</p>
<p className="font-medium">Medium</p>
<p className="font-semibold">Semibold</p>
<p className="font-bold">Bold</p>

/* Text alignment */
<p className="text-left">Left aligned</p>
<p className="text-center">Center aligned</p>
<p className="text-right">Right aligned</p>

/* Line height */
<p className="leading-tight">Tight line height</p>
<p className="leading-normal">Normal line height</p>
<p className="leading-relaxed">Relaxed line height</p>

/* Text decoration */
<p className="underline">Underlined</p>
<p className="line-through">Strikethrough</p>
<a className="hover:underline">Hover underline</a>

/* Text overflow */
<p className="truncate">Long text that gets cut off...</p>
<p className="line-clamp-3">Text clamped to 3 lines...</p>
```

### Colors

```tsx
/* Text colors */
<p className="text-primary">Primary text</p>
<p className="text-secondary">Secondary text</p>
<p className="text-muted-foreground">Muted text</p>
<p className="text-destructive">Error text</p>

/* Background colors */
<div className="bg-primary text-white">Primary background</div>
<div className="bg-secondary">Secondary background</div>
<div className="bg-muted">Muted background</div>

/* Border colors */
<div className="border border-border">Default border</div>
<div className="border border-primary">Primary border</div>

/* Opacity */
<div className="bg-primary/50">50% opacity</div>
<div className="bg-primary/20">20% opacity</div>
```

### Borders & Shadows

```tsx
/* Borders */
<div className="border">All sides</div>
<div className="border-t border-b">Top and bottom</div>
<div className="border-2">Thicker border</div>
<div className="rounded-lg border">Rounded with border</div>

/* Border radius */
<div className="rounded">Small radius</div>
<div className="rounded-md">Medium radius</div>
<div className="rounded-lg">Large radius</div>
<div className="rounded-full">Full radius (circle/pill)</div>

/* Shadows */
<div className="shadow-sm">Small shadow</div>
<div className="shadow">Default shadow</div>
<div className="shadow-md">Medium shadow</div>
<div className="shadow-lg">Large shadow</div>
<div className="shadow-xl">Extra large shadow</div>
```

### Interactive States

```tsx
/* Hover */
<button className="bg-primary hover:bg-primary/90">Hover effect</button>
<a className="text-primary hover:underline">Hover underline</a>

/* Focus */
<input className="border focus:ring-2 focus:ring-ring focus:border-transparent" />
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
  Focus ring
</button>

/* Active */
<button className="bg-primary active:bg-primary/80">Active state</button>

/* Disabled */
<button className="disabled:opacity-50 disabled:cursor-not-allowed" disabled>
  Disabled button
</button>

/* Group hover */
<div className="group">
  <img className="group-hover:scale-105 transition-transform" />
  <p className="group-hover:text-primary">Hover the parent</p>
</div>
```

### Responsive Design

```tsx
/* Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px) */

<div className="text-base md:text-lg lg:text-xl">
  Responsive text size
</div>

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  Responsive grid
</div>

<div className="hidden md:block">
  Hidden on mobile, visible on tablet+
</div>

<div className="block md:hidden">
  Visible on mobile only
</div>

<div className="px-4 md:px-8 lg:px-16">
  Responsive padding
</div>
```

### Transitions & Animations

```tsx
/* Transitions */
<button className="transition-colors hover:bg-primary">
  Color transition
</button>

<div className="transition-all duration-300 ease-in-out hover:scale-105">
  Multiple properties
</div>

<button className="transform transition-transform hover:scale-110">
  Scale on hover
</button>

/* Animation */
<div className="animate-spin">Spinning</div>
<div className="animate-pulse">Pulsing</div>
<div className="animate-bounce">Bouncing</div>
```

## Custom Utilities

Define custom utilities in the `@layer utilities` directive:

```css
@layer utilities {
  .text-balance {
    text-wrap: balance;
  }

  .bg-grid {
    background-image:
      linear-gradient(to right, theme(colors.border) 1px, transparent 1px),
      linear-gradient(to bottom, theme(colors.border) 1px, transparent 1px);
    background-size: 4rem 4rem;
  }

  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
}
```

Usage:

```tsx
<p className="text-balance">Balanced text wrapping</p>
<div className="bg-grid">Grid background</div>
<div className="scrollbar-hide">Hidden scrollbar</div>
```

## Custom Components

Define reusable component classes in `@layer components`:

```css
@layer components {
  .btn {
    @apply px-4 py-2 rounded-md font-medium transition-colors;
    @apply bg-primary text-white hover:bg-primary/90;
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring;
  }

  .btn-secondary {
    @apply bg-secondary hover:bg-secondary/90;
  }

  .card {
    @apply rounded-lg border border-border bg-card text-card-foreground shadow-sm;
  }

  .input {
    @apply flex h-10 w-full rounded-md border border-input bg-background px-3 py-2;
    @apply text-sm ring-offset-background;
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring;
    @apply disabled:cursor-not-allowed disabled:opacity-50;
  }
}
```

Usage:

```tsx
<button className="btn">Primary button</button>
<button className="btn btn-secondary">Secondary button</button>
<div className="card">Card content</div>
<input className="input" />
```

## Common Patterns

### Card Component

```tsx
<div className="rounded-lg border border-border bg-card p-6 shadow-sm">
  <h3 className="text-lg font-semibold mb-2">Card Title</h3>
  <p className="text-sm text-muted-foreground mb-4">Card description</p>
  <button className="btn">Action</button>
</div>
```

### Form Input

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium" htmlFor="email">
    Email
  </label>
  <input
    id="email"
    type="email"
    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    placeholder="you@example.com"
  />
</div>
```

### Hero Section

```tsx
<section className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted px-4">
  <h1 className="text-4xl md:text-6xl font-bold text-center mb-4">
    Welcome to Our App
  </h1>
  <p className="text-lg md:text-xl text-muted-foreground text-center max-w-2xl mb-8">
    Build amazing things with our platform
  </p>
  <button className="btn btn-lg">Get Started</button>
</section>
```

## Common Pitfalls

1. **No `tailwind.config.ts`**: Tailwind v4 uses CSS-first config. All configuration is in your CSS file via `@theme`.

2. **Import order**: Always import Tailwind first in your CSS: `@import "tailwindcss";` before any custom styles.

3. **Theme variables**: Access theme variables via `theme()` function in CSS, not as CSS variables in HTML.

4. **Dark mode setup**: Add `class` strategy to your HTML element (`<html class="dark">`), not media queries.

5. **Layer order**: Use `@layer` directives in correct order: base, components, utilities.

6. **Custom colors**: Define colors in `@theme` as `--color-name`, reference as `bg-name` in HTML.

7. **Responsive prefixes**: Apply from smallest to largest (mobile-first): `text-base md:text-lg lg:text-xl`.

8. **Focus states**: Use `focus-visible:` instead of `focus:` for better accessibility (keyboard-only focus).

9. **Opacity modifiers**: Use `/` notation: `bg-primary/50`, not separate opacity utilities.

10. **CSS file location**: Import your CSS file in `main.tsx`, not in HTML. Vite handles CSS bundling.
