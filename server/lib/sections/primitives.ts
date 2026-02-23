/**
 * Section Composition Engine — JSX Primitive Helpers
 *
 * Centralises all JSX string-generation helpers for the section composition
 * engine. Each helper returns a { jsx, import } pair (PrimitiveResult) whose
 * strings are interpolated into generated .tsx route files — these are NOT
 * real React components.
 *
 * The generated apps use:
 *   - Vite SPA + React 19
 *   - shadcn/ui  →  @/components/ui/<name>
 *   - Lucide React icons  →  lucide-react
 *   - tw-animate-css (Tailwind v4 animation utilities)
 *   - TanStack Router + Supabase
 */

import type { SectionContext } from './types'
import { imageTag } from './image-helpers'

// ---------------------------------------------------------------------------
// Core return type
// ---------------------------------------------------------------------------

/** Every shadcn/Lucide builder returns this pair. */
export interface PrimitiveResult {
  /** JSX fragment string for direct interpolation into generated .tsx files. */
  jsx: string
  /** Complete import statement string (e.g. `"import { Button } from '@/components/ui/button'"`) */
  import: string
}

// ===========================================================================
// 1. shadcn component builders
// ===========================================================================

/**
 * Wraps children in a shadcn `<Button>` with optional variant, size, asChild,
 * and className. Produces a complete JSX element string.
 */
export function shadcnButton(opts: {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'link' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  asChild?: boolean
  className?: string
  children: string
  ariaLabel?: string
}): PrimitiveResult {
  const variant = opts.variant ?? 'default'
  const parts: string[] = [`variant="${variant}"`]

  if (opts.size && opts.size !== 'default') parts.push(`size="${opts.size}"`)
  if (opts.asChild) parts.push('asChild')
  if (opts.className) parts.push(`className="${opts.className}"`)
  if (opts.ariaLabel) parts.push(`aria-label="${opts.ariaLabel}"`)

  const props = parts.join(' ')

  return {
    jsx: `<Button ${props}>${opts.children}</Button>`,
    import: "import { Button } from '@/components/ui/button'",
  }
}

/**
 * Renders a shadcn Card with optional CardHeader, CardContent, and CardFooter.
 * Always includes CardContent. Header and footer are rendered only when provided.
 */
export function shadcnCard(opts: {
  className?: string
  header?: string
  content: string
  footer?: string
}): PrimitiveResult {
  const classAttr = opts.className ? ` className="${opts.className}"` : ''
  const headerJsx = opts.header
    ? `
        <CardHeader>${opts.header}</CardHeader>`
    : ''
  const footerJsx = opts.footer
    ? `
        <CardFooter>${opts.footer}</CardFooter>`
    : ''

  const namedParts = ['Card', 'CardContent']
  if (opts.header) namedParts.push('CardHeader')
  if (opts.footer) namedParts.push('CardFooter')
  const named = namedParts.sort().join(', ')

  return {
    jsx: `<Card${classAttr}>${headerJsx}
        <CardContent>${opts.content}</CardContent>${footerJsx}
      </Card>`,
    import: `import { ${named} } from '@/components/ui/card'`,
  }
}

/**
 * Renders a shadcn `<Badge>` with variant and optional className.
 */
export function shadcnBadge(opts: {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive'
  className?: string
  children: string
}): PrimitiveResult {
  const variant = opts.variant ?? 'default'
  const classAttr = opts.className ? ` className="${opts.className}"` : ''

  return {
    jsx: `<Badge variant="${variant}"${classAttr}>${opts.children}</Badge>`,
    import: "import { Badge } from '@/components/ui/badge'",
  }
}

/**
 * Renders a shadcn `<Skeleton>` loading placeholder with the given className.
 */
export function shadcnSkeleton(opts: { className: string }): PrimitiveResult {
  return {
    jsx: `<Skeleton className="${opts.className}" />`,
    import: "import { Skeleton } from '@/components/ui/skeleton'",
  }
}

/**
 * Renders a shadcn `<Avatar>` with an `<AvatarImage>` and `<AvatarFallback>`.
 * src is optional — when absent the fallback initials are always visible.
 */
export function shadcnAvatar(opts: {
  src?: string
  fallback: string
  className?: string
}): PrimitiveResult {
  const classAttr = opts.className ? ` className="${opts.className}"` : ''
  const imgJsx = opts.src ? `\n          <AvatarImage src="${opts.src}" alt="${opts.fallback}" />` : ''

  return {
    jsx: `<Avatar${classAttr}>${imgJsx}
          <AvatarFallback>${opts.fallback}</AvatarFallback>
        </Avatar>`,
    import: "import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'",
  }
}

/**
 * Renders a shadcn `<Accordion>` (type="single", collapsible) from an array
 * of { trigger, content, value } items.
 */
export function shadcnAccordion(opts: {
  items: Array<{ trigger: string; content: string; value: string }>
}): PrimitiveResult {
  const itemsJsx = opts.items
    .map(
      (item) =>
        `        <AccordionItem value="${item.value}">
          <AccordionTrigger>${item.trigger}</AccordionTrigger>
          <AccordionContent>${item.content}</AccordionContent>
        </AccordionItem>`,
    )
    .join('\n')

  return {
    jsx: `<Accordion type="single" collapsible className="w-full">
${itemsJsx}
      </Accordion>`,
    import:
      "import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'",
  }
}

/**
 * Renders a shadcn `<Separator>` with optional orientation and className.
 * Defaults to horizontal orientation.
 */
export function shadcnSeparator(opts?: {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}): PrimitiveResult {
  const orientation = opts?.orientation ?? 'horizontal'
  const classAttr = opts?.className ? ` className="${opts.className}"` : ''
  const orientAttr = orientation !== 'horizontal' ? ` orientation="${orientation}"` : ''

  return {
    jsx: `<Separator${orientAttr}${classAttr} />`,
    import: "import { Separator } from '@/components/ui/separator'",
  }
}

/**
 * Renders a shadcn `<Input>` form control with id, type, placeholder, and
 * optional aria-label.
 */
export function shadcnInput(opts: {
  id: string
  type?: string
  placeholder?: string
  className?: string
  ariaLabel?: string
}): PrimitiveResult {
  const type = opts.type ?? 'text'
  const parts: string[] = [`id="${opts.id}"`, `type="${type}"`]

  if (opts.placeholder) parts.push(`placeholder="${opts.placeholder}"`)
  if (opts.className) parts.push(`className="${opts.className}"`)
  if (opts.ariaLabel) parts.push(`aria-label="${opts.ariaLabel}"`)

  return {
    jsx: `<Input ${parts.join(' ')} />`,
    import: "import { Input } from '@/components/ui/input'",
  }
}

/**
 * Renders a shadcn `<Label>` with htmlFor binding and optional className.
 */
export function shadcnLabel(opts: {
  htmlFor: string
  children: string
  className?: string
}): PrimitiveResult {
  const classAttr = opts.className ? ` className="${opts.className}"` : ''

  return {
    jsx: `<Label htmlFor="${opts.htmlFor}"${classAttr}>${opts.children}</Label>`,
    import: "import { Label } from '@/components/ui/label'",
  }
}

/**
 * Renders a shadcn `<Sheet>` (mobile drawer) with a trigger element and
 * content. Requires a title for accessibility (SheetHeader > SheetTitle).
 */
export function shadcnSheet(opts: {
  triggerJsx: string
  contentJsx: string
  side?: 'left' | 'right' | 'top' | 'bottom'
  title: string
}): PrimitiveResult {
  const side = opts.side ?? 'right'

  return {
    jsx: `<Sheet>
        <SheetTrigger asChild>${opts.triggerJsx}</SheetTrigger>
        <SheetContent side="${side}">
          <SheetHeader>
            <SheetTitle>${opts.title}</SheetTitle>
          </SheetHeader>
          ${opts.contentJsx}
        </SheetContent>
      </Sheet>`,
    import:
      "import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'",
  }
}

/**
 * Renders a shadcn `<Table>` with a header row from the provided string array
 * and a body section that accepts pre-built JSX rows via `bodyJsx`.
 */
export function shadcnTable(opts: {
  headers: string[]
  bodyJsx: string
  className?: string
}): PrimitiveResult {
  const classAttr = opts.className ? ` className="${opts.className}"` : ''
  const headerCells = opts.headers
    .map((h) => `            <TableHead>${h}</TableHead>`)
    .join('\n')

  return {
    jsx: `<Table${classAttr}>
        <TableHeader>
          <TableRow>
${headerCells}
          </TableRow>
        </TableHeader>
        <TableBody>
          ${opts.bodyJsx}
        </TableBody>
      </Table>`,
    import:
      "import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'",
  }
}

/**
 * Renders shadcn `<Tabs>` with a `<TabsList>` of triggers and a `<TabsContent>`
 * panel for each tab. Defaults to the first tab's value.
 */
export function shadcnTabs(opts: {
  tabs: Array<{ value: string; label: string; content: string }>
  defaultValue?: string
}): PrimitiveResult {
  const defaultValue = opts.defaultValue ?? opts.tabs[0]?.value ?? 'tab-0'

  const triggers = opts.tabs
    .map((t) => `          <TabsTrigger value="${t.value}">${t.label}</TabsTrigger>`)
    .join('\n')

  const panels = opts.tabs
    .map(
      (t) =>
        `        <TabsContent value="${t.value}">
          ${t.content}
        </TabsContent>`,
    )
    .join('\n')

  return {
    jsx: `<Tabs defaultValue="${defaultValue}" className="w-full">
        <TabsList>
${triggers}
        </TabsList>
${panels}
      </Tabs>`,
    import: "import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'",
  }
}

// ===========================================================================
// 2. Lucide icon helper
// ===========================================================================

/**
 * Returns a self-closing `<IconName />` JSX element string and the matching
 * named import from `lucide-react`.
 *
 * @param name - PascalCase Lucide icon name (e.g. 'ArrowRight', 'Menu', 'Star')
 * @param opts.size - Tailwind size class applied to className (default: 'size-4')
 * @param opts.className - Additional Tailwind classes
 * @param opts.ariaHidden - Whether to add aria-hidden="true" (default: true)
 *
 * @example
 * lucideIcon('ArrowRight')
 * // => { jsx: '<ArrowRight className="size-4" aria-hidden="true" />', import: "import { ArrowRight } from 'lucide-react'" }
 */
export function lucideIcon(
  name: string,
  opts?: { size?: string; className?: string; ariaHidden?: boolean },
): PrimitiveResult {
  const size = opts?.size ?? 'size-4'
  const ariaHidden = opts?.ariaHidden ?? true

  const classes = opts?.className ? `${size} ${opts.className}` : size
  const ariaAttr = ariaHidden ? ' aria-hidden="true"' : ''

  return {
    jsx: `<${name} className="${classes}"${ariaAttr} />`,
    import: `import { ${name} } from 'lucide-react'`,
  }
}

// ===========================================================================
// 3. Tailwind animation helpers (tw-animate-css)
// ===========================================================================

/**
 * Returns a tw-animate-css entrance class string such as:
 *   `'animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100'`
 *
 * Returns an empty string when `ctx.tokens.style.motion === 'none'` so
 * renderers can safely interpolate the result into any className without guards.
 *
 * @param ctx - Section context (motion checked from tokens)
 * @param opts.direction - Slide direction (default: 'bottom')
 * @param opts.distance - Slide distance in Tailwind units (default: 4)
 * @param opts.durationMs - Animation duration rounded to nearest 100ms (default: 500)
 * @param opts.delayMs - Animation delay rounded to nearest 100ms (default: 0)
 */
export function animateEntrance(
  ctx: SectionContext,
  opts?: {
    direction?: 'bottom' | 'left' | 'right' | 'top'
    distance?: number
    durationMs?: number
    delayMs?: number
  },
): string {
  if (ctx.tokens.style.motion === 'none') return ''

  const direction = opts?.direction ?? 'bottom'
  const distance = opts?.distance ?? 4
  const durationMs = opts?.durationMs ?? 500
  const delayMs = opts?.delayMs ?? 0

  // tw-animate-css uses integer duration/delay class suffixes
  const durationClass = `duration-${durationMs}`
  const delayClass = delayMs > 0 ? ` delay-${delayMs}` : ''
  const slideClass = `slide-in-from-${direction}-${distance}`

  return `animate-in fade-in ${slideClass} ${durationClass}${delayClass}`.trim()
}

/**
 * Returns an array of Tailwind delay class strings for use in stagger
 * animations — one entry per child. The array is suitable for use inside
 * a `.map()` callback where the index selects the delay.
 *
 * @example
 * staggerChildren(3, 0, 100)
 * // => ['delay-0', 'delay-100', 'delay-200']
 *
 * @param count - Number of children to stagger
 * @param baseDelayMs - Starting delay in ms (default: 0)
 * @param incrementMs - Increment per step in ms (default: 100)
 */
export function staggerChildren(
  count: number,
  baseDelayMs = 0,
  incrementMs = 100,
): string[] {
  return Array.from({ length: count }, (_, i) => `delay-${baseDelayMs + i * incrementMs}`)
}

/**
 * Returns a Tailwind class string for card hover animations based on the
 * theme's motion setting:
 *   - 'none'        → ''
 *   - 'subtle'      → 'hover:shadow-md transition-shadow duration-200'
 *   - 'expressive'  → 'hover:shadow-lg hover:-translate-y-1 transition-all duration-300'
 */
export function cardHoverClass(ctx: SectionContext): string {
  if (ctx.tokens.style.motion === 'none') return ''
  if (ctx.tokens.style.motion === 'subtle') return 'hover:shadow-md transition-shadow duration-200'
  return 'hover:shadow-lg hover:-translate-y-1 transition-all duration-300'
}

// ===========================================================================
// 4. Loading state builders
// ===========================================================================

/**
 * Returns a responsive grid of Skeleton cards for loading states.
 * The grid column count drives the responsive Tailwind grid class.
 *
 * @param cols - Number of columns (1–4 supported)
 * @param opts.rows - Number of skeleton rows to render (default: 1)
 * @param opts.hasImage - Whether to include a tall image skeleton at the top of each card (default: false)
 */
export function cardSkeletonGrid(
  cols: number,
  opts?: { rows?: number; hasImage?: boolean },
): PrimitiveResult {
  const rows = opts?.rows ?? 1
  const hasImage = opts?.hasImage ?? false

  const colClass =
    cols === 1
      ? 'grid-cols-1'
      : cols === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : cols === 4
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  const imageSkeletonJsx = hasImage ? '\n          <Skeleton className="h-48 w-full rounded-md mb-4" />' : ''

  // Build one skeleton card template — repeated `rows` times
  const cardTemplate = `        <div className="flex flex-col gap-3 p-4 border border-border rounded-lg">${imageSkeletonJsx}
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>`

  const cards = Array.from({ length: cols * rows }, () => cardTemplate).join('\n')

  return {
    jsx: `<div className="grid ${colClass} gap-6" role="status" aria-busy="true" aria-label="Loading content">
${cards}
      </div>`,
    import: "import { Skeleton } from '@/components/ui/skeleton'",
  }
}

/**
 * Returns a detail-page skeleton: a full-width hero image placeholder,
 * a title line, and three body text lines — suitable for article/detail routes.
 */
export function detailSkeleton(): PrimitiveResult {
  return {
    jsx: `<div className="max-w-3xl mx-auto px-4 py-12" role="status" aria-busy="true" aria-label="Loading content">
        <Skeleton className="h-72 w-full rounded-xl mb-8" />
        <Skeleton className="h-8 w-2/3 mb-4" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>`,
    import: "import { Skeleton } from '@/components/ui/skeleton'",
  }
}

// ===========================================================================
// 5. Hook string builders
// ===========================================================================

/**
 * Returns a `useState` + `useEffect` hook string that tracks scroll position
 * for navbar background changes, plus the matching React import.
 *
 * The generated hook exposes `isScrolled: boolean` which becomes `true` once
 * the user scrolls past 10px.
 *
 * @example
 * const { hook, import: hookImport } = scrollAwareHook()
 * // hook    → "const [isScrolled, setIsScrolled] = useState(false)\n  useEffect(...)"
 * // import  → "import { useState, useEffect } from 'react'"
 */
export function scrollAwareHook(): { hook: string; import: string } {
  return {
    hook: [
      'const [isScrolled, setIsScrolled] = useState(false)',
      "useEffect(() => {",
      "  const handler = () => setIsScrolled(window.scrollY > 10)",
      "  window.addEventListener('scroll', handler, { passive: true })",
      "  return () => window.removeEventListener('scroll', handler)",
      "}, [])",
    ].join('\n  '),
    import: "import { useState, useEffect } from 'react'",
  }
}

/**
 * Returns a `useRef` + `useEffect` IntersectionObserver hook string for
 * scroll-triggered reveal animations, plus the matching React import.
 *
 * The generated hook exposes `<refName>Ref` (the element ref) and
 * `<refName>Visible` (boolean that flips true on entry).
 *
 * @param refName - Base name used to derive `<refName>Ref` and `<refName>Visible`
 *
 * @example
 * intersectionObserverHook('section')
 * // Exposes sectionRef + sectionVisible
 */
export function intersectionObserverHook(refName: string): { hook: string; import: string } {
  const refVar = `${refName}Ref`
  const visibleVar = `${refName}Visible`

  const hook = [
    `const ${refVar} = useRef<HTMLDivElement>(null)`,
    `const [${visibleVar}, set${capitalize(visibleVar)}] = useState(false)`,
    `useEffect(() => {`,
    `  const el = ${refVar}.current`,
    `  if (!el) return`,
    `  const observer = new IntersectionObserver(`,
    `    ([entry]) => { if (entry.isIntersecting) set${capitalize(visibleVar)}(true) },`,
    `    { threshold: 0.15 }`,
    `  )`,
    `  observer.observe(el)`,
    `  return () => observer.disconnect()`,
    `}, [])`,
  ].join('\n  ')

  return {
    hook,
    import: "import { useRef, useState, useEffect } from 'react'",
  }
}

// ===========================================================================
// 6. Enhanced existing helpers
// ===========================================================================

/**
 * Returns Tailwind class string for a card's visual style based on the theme's
 * `cardStyle` token: flat / bordered / glass / elevated.
 *
 * @example
 * cardClasses(ctx)
 * // 'rounded-[8px] border border-border shadow-sm'  (elevated)
 */
export function cardClasses(ctx: SectionContext): string {
  const radius = ctx.tokens.style.borderRadius
  const base = `rounded-[${radius}]`
  if (ctx.tokens.style.cardStyle === 'flat') return base
  if (ctx.tokens.style.cardStyle === 'bordered') return `${base} border border-border`
  if (ctx.tokens.style.cardStyle === 'glass')
    return `${base} border border-border/70 bg-card/70 backdrop-blur-md`
  // elevated (default)
  return `${base} border border-border shadow-sm`
}

// Re-export from image-helpers (new image system)
export { imageSrc, imageTag } from './image-helpers'

/**
 * Returns an empty-state PrimitiveResult: centred icon, heading, description,
 * and an optional CTA link. The icon name is a Lucide PascalCase name;
 * defaults to 'InboxIcon' when omitted.
 *
 * @param opts.icon - Lucide icon name (PascalCase, default: 'Inbox')
 * @param opts.title - Primary heading text
 * @param opts.description - Optional secondary description text
 * @param opts.ctaText - Optional CTA button label
 * @param opts.ctaHref - Optional CTA href/path (used in a plain anchor to avoid router dep)
 */
export function emptyState(opts: {
  icon?: string
  title: string
  description?: string
  ctaText?: string
  ctaHref?: string
}): PrimitiveResult {
  const icon = opts.icon ?? 'Inbox'
  const descJsx = opts.description
    ? `\n          <p className="text-sm text-muted-foreground mt-2 max-w-xs text-center">${opts.description}</p>`
    : ''
  const ctaJsx =
    opts.ctaText && opts.ctaHref
      ? `\n          <a
            href="${opts.ctaHref}"
            className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            ${opts.ctaText}
          </a>`
      : ''

  return {
    jsx: `<div className="flex flex-col items-center justify-center py-16 px-4" role="status" aria-label="${opts.title}">
          <${icon} className="size-12 text-muted-foreground/40 mb-4" aria-hidden="true" />
          <h3 className="text-base font-semibold text-foreground">${opts.title}</h3>${descJsx}${ctaJsx}
        </div>`,
    import: `import { ${icon} } from 'lucide-react'`,
  }
}

// ===========================================================================
// Internal utilities
// ===========================================================================

/** Capitalises the first letter of a string. */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// ===========================================================================
// 7. V2 visual config resolvers (SectionVisualSpec → Tailwind classes)
// ===========================================================================

/** Background enum → Tailwind class(es) */
export function resolveBg(config: Record<string, unknown>): string {
  const bg = (config.background as string) ?? 'default'
  switch (bg) {
    case 'muted': return 'bg-muted/30'
    case 'muted-strong': return 'bg-muted/50'
    case 'accent': return 'bg-primary/10'
    case 'dark': return 'bg-foreground text-background'
    case 'dark-overlay': return 'relative bg-black/70'
    case 'gradient-down': return 'bg-gradient-to-b from-background to-muted/30'
    case 'gradient-up': return 'bg-gradient-to-t from-muted/30 to-background'
    default: return 'bg-background'
  }
}

/** Spacing enum → Tailwind padding classes */
export function resolveSpacing(config: Record<string, unknown>): string {
  const spacing = (config.spacing as string) ?? 'normal'
  switch (spacing) {
    case 'compact': return 'py-8 md:py-12'
    case 'generous': return 'py-16 md:py-24 lg:py-32'
    default: return 'py-12 md:py-16'
  }
}

/** Card variant enum → Tailwind card classes */
export function resolveCardVariant(config: Record<string, unknown>): string {
  const variant = (config.cardVariant as string) ?? 'elevated'
  switch (variant) {
    case 'flat': return 'border border-border rounded-lg'
    case 'glass': return 'bg-card/70 backdrop-blur-md border border-border/50 rounded-lg'
    case 'image-overlay': return 'relative overflow-hidden rounded-xl'
    default: return 'shadow-lg hover:shadow-xl rounded-xl'
  }
}

/** Grid columns enum → Tailwind grid-cols class */
export function resolveGridCols(config: Record<string, unknown>): string {
  const cols = (config.gridColumns as string) ?? '3'
  switch (cols) {
    case '2': return 'grid-cols-1 sm:grid-cols-2'
    case '4': return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
    default: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  }
}

/** Image aspect enum → Tailwind aspect class */
export function resolveImageAspect(config: Record<string, unknown>): string {
  const aspect = (config.imageAspect as string) ?? 'video'
  switch (aspect) {
    case 'square': return 'aspect-square'
    case '4/3': return 'aspect-[4/3]'
    case '3/2': return 'aspect-[3/2]'
    case '21/9': return 'aspect-[21/9]'
    default: return 'aspect-video'
  }
}
