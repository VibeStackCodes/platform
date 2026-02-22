/**
 * design-knowledge.ts
 *
 * Design knowledge for page generators.
 *
 * - getStaticDesignRules(): Condensed rules for static page generation.
 *   Omits Data Loading and Form patterns (no useQuery/TanStack in static prompts).
 */

/**
 * Returns condensed design rules for STATIC page generation.
 *
 * Omits the Data Loading Pattern and Form Pattern sections, which reference
 * useQuery, TanStack Query, and Form components not available in the closed
 * vocabulary static prompt.
 *
 * Use this in buildPageGenSystemPrompt() so the prompt contains zero
 * references to Supabase, useQuery, or @tanstack/react-query.
 */
export function getStaticDesignRules(): string {
  return `### Layout
- Use 12-column grid: max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
- Section padding: py-16 md:py-24 for generous, py-10 md:py-16 for normal, py-6 md:py-10 for compact
- Content width: prose max-w-2xl for text-heavy, max-w-4xl for mixed, full-width for grids
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)

### Typography
- Display text: font-[family-name:var(--font-display)] — ONLY for h1/h2 headings
- Body text: default (no font override needed — body font is set on :root)
- Heading scale: text-4xl md:text-6xl (hero h1), text-3xl md:text-4xl (section h2), text-xl md:text-2xl (card h3)
- Line height: leading-tight for headings, leading-relaxed for body paragraphs
- Letter spacing: tracking-tight for large display text, tracking-normal for body

### Color Usage (semantic classes ONLY)
- Page background: bg-background
- Primary text: text-foreground
- Secondary/muted text: text-muted-foreground
- Primary brand color: bg-primary / text-primary-foreground
- Accent highlights: bg-accent / text-accent-foreground
- Muted sections: bg-muted
- Card backgrounds: bg-card / text-card-foreground
- Borders: border-border
- Destructive actions: bg-destructive / text-destructive-foreground
- NEVER hardcode hex values or use palette-specific Tailwind (bg-blue-500, etc.)

### Cards
- elevated: rounded-[var(--radius)] shadow-md bg-card border-0 hover:shadow-lg transition-shadow
- flat: rounded-[var(--radius)] bg-muted border-0
- glass: rounded-[var(--radius)] bg-card/80 backdrop-blur-sm border border-border/50
- bordered: rounded-[var(--radius)] bg-card border border-border

### Images
- Always include alt text (descriptive, not empty)
- Aspect ratios: aspect-video (16:9), aspect-square, aspect-[4/3], aspect-[3/2]
- Fit: object-cover w-full h-full on all media images
- Lazy load: loading="lazy" on non-hero images

### Interaction & Accessibility
- All interactive elements: min-h-[44px] min-w-[44px] (touch target)
- Focus rings: Tailwind focus-visible:ring-2 focus-visible:ring-primary
- Disabled states: opacity-50 cursor-not-allowed
- Empty states: centered, muted icon + heading + subtext + optional CTA

### Motion (respect motionPreset)
- none: no transition or animation classes
- subtle: transition-colors duration-200, hover:opacity-90, hover:scale-[1.02]
- expressive: tw-animate-css classes — animate-in fade-in slide-in-from-bottom-4 duration-500`
}
