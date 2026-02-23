/**
 * Entity Detail Section Renderers (5 layouts)
 *
 * Each renderer returns a SectionOutput with `jsx`, optional `imports`, and
 * `hooks`. The hook block fetches a single item by $id param via TanStack
 * Query, and the JSX handles loading / not-found / content states.
 *
 * Available layouts:
 *   1. detailHeroOverlay    — full-width hero + gradient title overlay
 *   2. detailSplitSidebar   — image+body left, metadata sidebar right
 *   3. detailArticle        — longform article / blog style
 *   4. detailDataDense      — compact key-value card grid (no hero image)
 *   5. detailGallery        — large image focus with clean metadata below
 *
 * UI primitives used:
 *   - shadcn Card / CardHeader / CardContent / CardTitle
 *   - shadcn Badge (variant="outline") for metadata values
 *   - shadcn Separator between byline and body
 *   - shadcn Skeleton for per-layout loading states
 *   - shadcn Button (variant="ghost") with ChevronLeft for back navigation
 *   - Lucide ChevronLeft icon
 *   - tw-animate-css: animate-in fade-in slide-in-from-* classes
 */

import type { SectionContext, SectionOutput, SectionRenderer } from './types'
import { animateEntrance, resolveBg, resolveSpacing } from './primitives'

// ---------------------------------------------------------------------------
// Shared import sets
// ---------------------------------------------------------------------------

const QUERY_IMPORTS = [
  "import { useQuery } from '@tanstack/react-query'",
  "import { supabase } from '@/lib/supabase'",
  "import { Link } from '@tanstack/react-router'",
]

const SHADCN_BADGE_IMPORT = "import { Badge } from '@/components/ui/badge'"
const SHADCN_BUTTON_IMPORT = "import { Button } from '@/components/ui/button'"
const SHADCN_CARD_IMPORT =
  "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'"
const SHADCN_SEPARATOR_IMPORT = "import { Separator } from '@/components/ui/separator'"
const SHADCN_SKELETON_IMPORT = "import { Skeleton } from '@/components/ui/skeleton'"
const LUCIDE_CHEVRON_IMPORT = "import { ChevronLeft } from 'lucide-react'"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Human-readable label from a snake_case column name. */
function columnLabel(col: string): string {
  return col
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Resolve the pluralTitle for the entity this section is bound to. */
function resolvePluralTitle(ctx: SectionContext): string {
  const tableName = ctx.tableName
  if (!tableName) return 'items'
  const found = ctx.allEntities.find((e) => e.tableName === tableName)
  return found?.pluralTitle ?? 'items'
}

/** Resolve the entitySlug safely. */
function resolveSlug(ctx: SectionContext): string {
  return ctx.entitySlug ?? ctx.tableName ?? 'items'
}

/** Build the shared data-fetch hook block. */
function buildDetailHook(ctx: SectionContext): string {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  return [
    `const { ${itemVar}: ${itemVar}Id } = Route.useParams()`,
    `const { data: ${itemVar}, isLoading } = useQuery({`,
    `  queryKey: ['${tableName}', ${itemVar}Id],`,
    `  queryFn: async () => {`,
    `    const { data } = await supabase.from('${tableName}').select('*').eq('id', ${itemVar}Id).single()`,
    `    return data`,
    `  },`,
    `})`,
  ].join('\n  ')
}

/**
 * Ghost back-button JSX using shadcn Button + ChevronLeft icon.
 * Rendered as a Link child via asChild.
 */
function backButton(entitySlug: string, pluralTitle: string): string {
  return `<Button variant="ghost" size="sm" asChild>
          <Link to="/${entitySlug}/">
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back to ${pluralTitle}
          </Link>
        </Button>`
}

/** Not-found fallback JSX with back link and role="alert". */
function notFoundState(itemVar: string, entitySlug: string, pluralTitle: string): string {
  return `{!isLoading && !${itemVar} && (
        <div className="text-center py-20" role="alert">
          <p className="text-muted-foreground mb-4">Item not found</p>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/${entitySlug}/">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Back to ${pluralTitle}
            </Link>
          </Button>
        </div>
      )}`
}

/**
 * Render metadata key-value pairs as Badge rows inside a <dl>.
 * Each value becomes a <Badge variant="outline"> for visual consistency.
 */
function metadataBadgeRows(cols: string[], itemVar: string): string {
  if (cols.length === 0) return ''
  const rows = cols
    .map(
      (col) =>
        `<div className="flex items-center gap-2 flex-wrap">` +
        `<dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">${columnLabel(col)}</dt>` +
        `<dd><Badge variant="outline">{String(${itemVar}.${col} ?? '—')}</Badge></dd>` +
        `</div>`,
    )
    .join('\n              ')
  return `<dl className="space-y-2 text-sm">
              ${rows}
            </dl>`
}

/** Image block: renders the image column or an img.vibestack.codes fallback. */
function imageBlock(
  itemVar: string,
  imageColumn: string | null | undefined,
  tableName: string,
  className: string,
): string {
  if (!imageColumn) {
    return `<img
                src={\`https://img.vibestack.codes/s/${encodeURIComponent(tableName)}%20item%20photo/1200/800\`}
                alt=""
                loading="lazy"
                className="${className}"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />`
  }
  return `{${itemVar}.${imageColumn}
                ? <img src={String(${itemVar}.${imageColumn})} alt={String(${itemVar}.${imageColumn} ?? '')} loading="lazy" className="${className}" />
                : <img src={\`https://img.vibestack.codes/s/${encodeURIComponent(tableName)}%20item%20photo/1200/800\`} alt="" loading="lazy" className="${className}" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              }`
}

// ---------------------------------------------------------------------------
// 1. detailHeroOverlay
// ---------------------------------------------------------------------------

/**
 * Full-width hero image (max-h-[50vh]) with title overlay via gradient at
 * the bottom. Below: centred narrow content (max-w-3xl) with Badge metadata
 * and description. Ghost back button at top-left. Skeleton covers hero image
 * area + title bar + body text lines during load.
 */
export const detailHeroOverlay: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []
  const bg = resolveBg(ctx.config)
  const _spacing = resolveSpacing(ctx.config)

  const imgBlock = imageBlock(
    itemVar,
    ctx.imageColumn,
    tableName,
    'w-full h-full object-cover',
  )

  const metaDl = metadataBadgeRows(metaCols, itemVar)
  const entranceAnim = animateEntrance(ctx, { direction: 'bottom', durationMs: 500 })

  const skeletonJsx = `{isLoading && (
        <div role="status" aria-busy="true" aria-label="Loading content">
          {/* Hero image skeleton */}
          <div className="w-full aspect-[16/7]">
            <Skeleton className="w-full h-full" />
          </div>
          {/* Title bar skeleton */}
          <div className="max-w-3xl mx-auto px-6 lg:px-8 py-10 space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full mt-4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      )}`

  const jsx = `<section aria-label="${pluralTitle} detail" className="min-h-screen ${bg} text-foreground">
      {/* Back navigation */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-6">
        ${backButton(entitySlug, pluralTitle)}
      </div>

      ${skeletonJsx}
      ${notFoundState(itemVar, entitySlug, pluralTitle)}

      {${itemVar} && (
        <div className="${entranceAnim}">
          {/* Hero image with gradient overlay */}
          <div className="relative w-full max-h-[50vh] overflow-hidden mt-4">
            <div className="aspect-[16/7] w-full">
              ${imgBlock}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10 max-w-7xl mx-auto">
              <h1 className="text-3xl md:text-5xl font-bold font-[family-name:var(--font-display)] text-white leading-tight drop-shadow-md">
                {String(${itemVar}.${displayCol} ?? 'Untitled')}
              </h1>
            </div>
          </div>

          {/* Below-hero content */}
          <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12 space-y-8">
            ${
              metaDl
                ? `<div>${metaDl}</div>`
                : ''
            }
            {(!!(${itemVar} as Record<string, unknown>).description || !!(${itemVar} as Record<string, unknown>).content) && (
              <Separator />
            )}
            {!!(${itemVar} as Record<string, unknown>).description && (
              <p className="text-lg leading-relaxed text-foreground/80">
                {String((${itemVar} as Record<string, unknown>).description)}
              </p>
            )}
            {!!(${itemVar} as Record<string, unknown>).content && (
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <p className="leading-relaxed">{String((${itemVar} as Record<string, unknown>).content)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>`

  return {
    jsx,
    imports: [
      ...QUERY_IMPORTS,
      SHADCN_BADGE_IMPORT,
      SHADCN_BUTTON_IMPORT,
      SHADCN_SEPARATOR_IMPORT,
      SHADCN_SKELETON_IMPORT,
      LUCIDE_CHEVRON_IMPORT,
    ],
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 2. detailSplitSidebar
// ---------------------------------------------------------------------------

/**
 * Two-column layout. Left (2/3): large image + title + long description.
 * Right (1/3): shadcn Card sidebar with Badge metadata key-value pairs and
 * ghost back button. Skeleton: left image area + title lines, right card.
 * Corporate / structured feel.
 */
export const detailSplitSidebar: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const hasImage = Boolean(ctx.imageColumn)

  const imgSection = hasImage
    ? `<div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              ${imageBlock(itemVar, ctx.imageColumn, tableName, 'w-full h-full object-cover')}
            </div>`
    : ''

  const metaDl = metadataBadgeRows(metaCols, itemVar)
  const entranceAnim = animateEntrance(ctx, { direction: 'bottom', durationMs: 500 })

  const skeletonJsx = `{isLoading && (
        <div className="lg:grid lg:grid-cols-3 lg:gap-12" role="status" aria-busy="true" aria-label="Loading content">
          {/* Main content skeleton */}
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="w-full aspect-[4/3] rounded-xl" />
            <Skeleton className="h-9 w-3/4" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
          {/* Sidebar skeleton */}
          <div className="mt-10 lg:mt-0">
            <div className="rounded-xl border border-border p-6 space-y-4">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        </div>
      )}`

  const jsx = `<section aria-label="${pluralTitle} detail" className="min-h-screen ${bg} text-foreground ${spacing}">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        ${skeletonJsx}
        ${notFoundState(itemVar, entitySlug, pluralTitle)}

        {${itemVar} && (
          <div className="lg:grid lg:grid-cols-3 lg:gap-12 ${entranceAnim}">
            {/* Main content — left 2/3 */}
            <div className="lg:col-span-2 space-y-8">
              ${imgSection}
              <div>
                <h1 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] leading-tight">
                  {String(${itemVar}.${displayCol} ?? 'Untitled')}
                </h1>
              </div>
              {(!!(${itemVar} as Record<string, unknown>).description || !!(${itemVar} as Record<string, unknown>).content) && (
                <Separator />
              )}
              {!!(${itemVar} as Record<string, unknown>).description && (
                <p className="text-lg leading-relaxed text-foreground/80">
                  {String((${itemVar} as Record<string, unknown>).description)}
                </p>
              )}
              {!!(${itemVar} as Record<string, unknown>).content && (
                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <p className="leading-relaxed">{String((${itemVar} as Record<string, unknown>).content)}</p>
                </div>
              )}
            </div>

            {/* Sidebar — right 1/3 */}
            <aside className="mt-10 lg:mt-0" aria-label="${pluralTitle} metadata">
              <Card className="sticky top-24 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                    Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  ${backButton(entitySlug, pluralTitle)}
                  ${metaDl ? `<Separator />${metaDl}` : ''}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </div>
    </section>`

  return {
    jsx,
    imports: [
      ...QUERY_IMPORTS,
      SHADCN_BADGE_IMPORT,
      SHADCN_BUTTON_IMPORT,
      SHADCN_CARD_IMPORT,
      SHADCN_SEPARATOR_IMPORT,
      SHADCN_SKELETON_IMPORT,
      LUCIDE_CHEVRON_IMPORT,
    ],
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 3. detailArticle
// ---------------------------------------------------------------------------

/**
 * Article / longform style. Full-width image at top → centred narrow content
 * (max-w-3xl). Large serif title, date byline in <time>, then Separator, then
 * body text. Badge metadata in byline. Skeleton: wide image + title + lines.
 */
export const detailArticle: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []
  const bg = resolveBg(ctx.config)
  const _spacing = resolveSpacing(ctx.config)

  // Pick a date-like column for article byline, fallback to first meta col
  const dateCol = metaCols.find((c) => /date|published|created/.test(c))
  const tagCols = metaCols.filter((c) => c !== dateCol).slice(0, 2)

  const imgSection = `<div className="w-full aspect-[21/9] overflow-hidden bg-muted">
          ${imageBlock(itemVar, ctx.imageColumn, tableName, 'w-full h-full object-cover')}
        </div>`

  const bylineDate = dateCol
    ? `<time className="text-sm text-muted-foreground" dateTime={String(${itemVar}.${dateCol} ?? '')}>
              {${itemVar}.${dateCol} ? new Date(String(${itemVar}.${dateCol})).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </time>`
    : ''

  const bylineBadges = tagCols
    .map(
      (col) =>
        `<Badge variant="outline">{String(${itemVar}.${col} ?? '')}</Badge>`,
    )
    .join('\n            ')

  const entranceAnim = animateEntrance(ctx, { direction: 'bottom', durationMs: 600 })

  const skeletonJsx = `{isLoading && (
        <div role="status" aria-busy="true" aria-label="Loading content">
          {/* Hero image skeleton */}
          <Skeleton className="w-full aspect-[21/9]" />
          <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12 space-y-6">
            {/* Title skeleton */}
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
            {/* Byline skeleton */}
            <div className="flex gap-2 pb-6 border-b border-border">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            {/* Body text skeleton */}
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      )}`

  const jsx = `<section aria-label="${pluralTitle} article" className="min-h-screen ${bg} text-foreground">
      <div className="max-w-3xl mx-auto px-6 lg:px-8 pt-8">
        ${backButton(entitySlug, pluralTitle)}
      </div>

      ${skeletonJsx}
      ${notFoundState(itemVar, entitySlug, pluralTitle)}

      {${itemVar} && (
        <div className="${entranceAnim}">
          ${imgSection}

          <article className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
            <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-display)] leading-tight mb-4">
              {String(${itemVar}.${displayCol} ?? 'Untitled')}
            </h1>

            {/* Byline — date + tag badges */}
            <div className="flex flex-wrap items-center gap-3 pb-6">
              ${bylineDate}
              ${bylineBadges}
            </div>

            <Separator className="mb-8" />

            {/* Body */}
            {!!(${itemVar} as Record<string, unknown>).excerpt && (
              <p className="text-xl font-medium text-foreground/70 leading-relaxed mb-8">
                {String((${itemVar} as Record<string, unknown>).excerpt)}
              </p>
            )}
            {!!(${itemVar} as Record<string, unknown>).description && (
              <p className="text-lg leading-relaxed text-foreground/80 mb-6">
                {String((${itemVar} as Record<string, unknown>).description)}
              </p>
            )}
            {!!(${itemVar} as Record<string, unknown>).content && (
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <p className="leading-relaxed">{String((${itemVar} as Record<string, unknown>).content)}</p>
              </div>
            )}
          </article>
        </div>
      )}
    </section>`

  return {
    jsx,
    imports: [
      ...QUERY_IMPORTS,
      SHADCN_BADGE_IMPORT,
      SHADCN_BUTTON_IMPORT,
      SHADCN_SEPARATOR_IMPORT,
      SHADCN_SKELETON_IMPORT,
      LUCIDE_CHEVRON_IMPORT,
    ],
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 4. detailDataDense
// ---------------------------------------------------------------------------

/**
 * Compact data card layout. No hero image. Title at top in a Card header,
 * then a responsive grid of shadcn Card key-value cells (grid-cols-2
 * md:grid-cols-3). Each value is plain text; the label uses uppercase
 * tracking. Dashboard / admin feel. Skeleton: title card + KV card grid.
 */
export const detailDataDense: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)

  const allCols = metaCols.length > 0 ? metaCols : []

  // Each column gets a shadcn Card with a small label + value
  const kvCards = allCols
    .map(
      (col) =>
        `<Card className="shadow-none">
                <CardContent className="pt-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">${columnLabel(col)}</p>
                  <p className="text-sm font-medium break-words">{String(${itemVar}.${col} ?? '—')}</p>
                </CardContent>
              </Card>`,
    )
    .join('\n              ')

  const idCard = `<Card className="shadow-none">
                <CardContent className="pt-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">ID</p>
                  <p className="text-sm font-mono break-all">{String(${itemVar}.id)}</p>
                </CardContent>
              </Card>`

  const createdCard = `<Card className="shadow-none">
                <CardContent className="pt-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Created</p>
                  <p className="text-sm">
                    <time dateTime={String((${itemVar} as Record<string, unknown>).created_at ?? '')}>
                      {(${itemVar} as Record<string, unknown>).created_at
                        ? new Date(String((${itemVar} as Record<string, unknown>).created_at)).toLocaleString()
                        : '—'}
                    </time>
                  </p>
                </CardContent>
              </Card>`

  const skeletonCardCount = Math.max(3, allCols.length + 2)
  const skeletonCards = Array.from(
    { length: skeletonCardCount },
    () =>
      `<div className="rounded-lg border border-border p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-full" />
              </div>`,
  ).join('\n              ')

  const entranceAnim = animateEntrance(ctx, { direction: 'bottom', durationMs: 400 })

  const skeletonJsx = `{isLoading && (
        <div role="status" aria-busy="true" aria-label="Loading content" className="space-y-6">
          {/* Header card skeleton */}
          <div className="rounded-xl border border-border p-6 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-2/3" />
          </div>
          {/* KV grid skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            ${skeletonCards}
          </div>
        </div>
      )}`

  const jsx = `<section aria-label="${pluralTitle} detail" className="min-h-screen ${bg} text-foreground ${spacing}">
      <div className="max-w-5xl mx-auto px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-4">
          ${backButton(entitySlug, pluralTitle)}
        </div>

        ${skeletonJsx}
        ${notFoundState(itemVar, entitySlug, pluralTitle)}

        {${itemVar} && (
          <div className="${entranceAnim} space-y-6">
            {/* Title card */}
            <Card className="shadow-sm">
              <CardHeader>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  ${tableName.replace(/_/g, ' ').toUpperCase()}
                </p>
                <CardTitle className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-display)] leading-tight">
                  {String(${itemVar}.${displayCol} ?? 'Untitled')}
                </CardTitle>
              </CardHeader>
            </Card>

            {/* Data grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              ${idCard}
              ${kvCards}
              ${createdCard}
            </div>

            {!!(${itemVar} as Record<string, unknown>).description && (
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{String((${itemVar} as Record<string, unknown>).description)}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </section>`

  return {
    jsx,
    imports: [
      ...QUERY_IMPORTS,
      SHADCN_BUTTON_IMPORT,
      SHADCN_CARD_IMPORT,
      SHADCN_SKELETON_IMPORT,
      LUCIDE_CHEVRON_IMPORT,
    ],
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 5. detailGallery
// ---------------------------------------------------------------------------

/**
 * Gallery-focused layout. Shows the primary image large with subtle hover
 * scale and navigation hint overlays. Below: title + Badge metadata in a
 * clean two-column layout (or centred when no image). Skeleton: wide image
 * placeholder + content columns. Minimal chrome.
 */
export const detailGallery: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []
  const hasImage = Boolean(ctx.imageColumn)
  const bg = resolveBg(ctx.config)
  const _spacing = resolveSpacing(ctx.config)

  const metaDl = metadataBadgeRows(metaCols, itemVar)
  const entranceAnim = animateEntrance(ctx, { direction: 'bottom', durationMs: 500 })

  const galleryImageSection = hasImage
    ? `<figure className="relative w-full bg-muted overflow-hidden group" aria-label="Primary image">
            <div className="aspect-[3/2] md:aspect-[16/9] w-full">
              ${imageBlock(itemVar, ctx.imageColumn, tableName, 'w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]')}
            </div>
            {/* Navigation hint overlay */}
            <div className="absolute inset-y-0 left-0 flex items-center px-4 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
              <span className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center text-lg select-none">‹</span>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
              <span className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center text-lg select-none">›</span>
            </div>
          </figure>`
    : ''

  const contentLayout = hasImage
    ? `<div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 md:grid md:grid-cols-2 md:gap-12 md:items-start">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] leading-tight mb-4">
                {String(${itemVar}.${displayCol} ?? 'Untitled')}
              </h1>
              {!!(${itemVar} as Record<string, unknown>).description && (
                <p className="text-base leading-relaxed text-foreground/80 mt-2">
                  {String((${itemVar} as Record<string, unknown>).description)}
                </p>
              )}
            </div>
            <div className="mt-8 md:mt-0">
              ${metaDl}
            </div>
          </div>`
    : `<div className="max-w-3xl mx-auto px-6 lg:px-8 py-12 text-center">
            <h1 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] leading-tight mb-4">
              {String(${itemVar}.${displayCol} ?? 'Untitled')}
            </h1>
            {!!(${itemVar} as Record<string, unknown>).description && (
              <p className="mt-4 text-lg leading-relaxed text-foreground/80">
                {String((${itemVar} as Record<string, unknown>).description)}
              </p>
            )}
            <div className="mt-8 text-left inline-block">
              ${metaDl}
            </div>
          </div>`

  const skeletonJsx = hasImage
    ? `{isLoading && (
        <div role="status" aria-busy="true" aria-label="Loading content">
          {/* Gallery image skeleton */}
          <Skeleton className="w-full aspect-[3/2] md:aspect-[16/9]" />
          {/* Two-column content skeleton */}
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 md:grid md:grid-cols-2 md:gap-12">
            <div className="space-y-4">
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="mt-8 md:mt-0 space-y-3">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      )}`
    : `{isLoading && (
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12 space-y-6" role="status" aria-busy="true" aria-label="Loading content">
          <Skeleton className="h-9 w-2/3 mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5 mx-auto" />
          <div className="flex gap-2 justify-center pt-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
      )}`

  const jsx = `<section aria-label="${pluralTitle} gallery detail" className="min-h-screen ${bg} text-foreground">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-6">
        ${backButton(entitySlug, pluralTitle)}
      </div>

      ${skeletonJsx}
      ${notFoundState(itemVar, entitySlug, pluralTitle)}

      {${itemVar} && (
        <div className="${entranceAnim}">
          ${galleryImageSection}
          ${contentLayout}
        </div>
      )}
    </section>`

  return {
    jsx,
    imports: [
      ...QUERY_IMPORTS,
      SHADCN_BADGE_IMPORT,
      SHADCN_BUTTON_IMPORT,
      SHADCN_SKELETON_IMPORT,
      LUCIDE_CHEVRON_IMPORT,
    ],
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// Export map — keyed by SECTION_IDS constants
// ---------------------------------------------------------------------------

export const DETAIL_RENDERERS: Record<string, SectionRenderer> = {
  'detail-hero-overlay': detailHeroOverlay,
  'detail-split-sidebar': detailSplitSidebar,
  'detail-article': detailArticle,
  'detail-data-dense': detailDataDense,
  'detail-gallery': detailGallery,
}
