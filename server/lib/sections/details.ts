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
 */

import type { SectionContext, SectionOutput, SectionRenderer } from './types'

// ---------------------------------------------------------------------------
// Shared imports for detail pages (useQuery + supabase + Link + Route)
// ---------------------------------------------------------------------------

const DETAIL_IMPORTS = [
  "import { useQuery } from '@tanstack/react-query'",
  "import { supabase } from '@/lib/supabase'",
  "import { Link } from '@tanstack/react-router'",
]

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

/** Inline loading spinner JSX. */
function loadingSpinner(): string {
  return `{isLoading && (
        <div className="flex justify-center py-20" role="status">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          <span className="sr-only">Loading</span>
        </div>
      )}`
}

/** Not-found fallback JSX with back link. */
function notFoundState(itemVar: string, entitySlug: string, pluralTitle: string): string {
  return `{!isLoading && !${itemVar} && (
        <div className="text-center py-20" role="alert">
          <p className="text-muted-foreground">Item not found</p>
          <Link to="/${entitySlug}/" className="text-primary underline mt-4 inline-block">
            Back to ${pluralTitle}
          </Link>
        </div>
      )}`
}

/** Back link JSX. */
function backLink(entitySlug: string, pluralTitle: string, className: string): string {
  return `<Link to="/${entitySlug}/" className="${className}">
          ← Back to ${pluralTitle}
        </Link>`
}

/** Render metadata key-value pairs as <dl> rows. */
function metadataRows(cols: string[], itemVar: string): string {
  if (cols.length === 0) return ''
  const rows = cols
    .map(
      (col) =>
        `<div className="flex gap-2 flex-wrap">` +
        `<dt className="font-medium text-muted-foreground">${columnLabel(col)}:</dt>` +
        `<dd>{String(${itemVar}.${col} ?? '—')}</dd>` +
        `</div>`,
    )
    .join('\n              ')
  return `<dl className="space-y-2 text-sm">
              ${rows}
            </dl>`
}

/** Image block: renders the image column or a picsum fallback. */
function imageBlock(
  itemVar: string,
  imageColumn: string | null | undefined,
  tableName: string,
  className: string,
): string {
  if (!imageColumn) {
    return `<img
                src={\`https://picsum.photos/seed/${tableName}-\${String(${itemVar}.id)}/1200/800\`}
                alt=""
                className="${className}"
              />`
  }
  return `{${itemVar}.${imageColumn}
                ? <img src={String(${itemVar}.${imageColumn})} alt={String(${itemVar}.${imageColumn} ?? '')} className="${className}" />
                : <img src={\`https://picsum.photos/seed/${tableName}-\${String(${itemVar}.id)}/1200/800\`} alt="" className="${className}" />
              }`
}

// ---------------------------------------------------------------------------
// 1. detailHeroOverlay
// ---------------------------------------------------------------------------

/**
 * Full-width hero image (max-h-[50vh]) with title overlay via gradient at
 * the bottom. Below: centred narrow content (max-w-3xl) with metadata and
 * description. Back link at top.
 */
export const detailHeroOverlay: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []

  const imgBlock = imageBlock(
    itemVar,
    ctx.imageColumn,
    tableName,
    'w-full h-full object-cover',
  )

  const metaDl = metadataRows(metaCols, itemVar)

  const jsx = `<section aria-label="${pluralTitle} detail" className="min-h-screen bg-background text-foreground">
      ${backLink(entitySlug, pluralTitle, 'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors px-6 lg:px-8 pt-6 max-w-7xl mx-auto block')}

      ${loadingSpinner()}
      ${notFoundState(itemVar, entitySlug, pluralTitle)}

      {${itemVar} && (
        <>
          {/* Hero image with gradient overlay */}
          <div className="relative w-full max-h-[50vh] overflow-hidden">
            <div className="aspect-[16/7] w-full">
              ${imgBlock}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-10 max-w-7xl mx-auto">
              <h1 className="text-3xl md:text-5xl font-bold font-[family-name:var(--font-display)] text-white leading-tight">
                {String(${itemVar}.${displayCol} ?? 'Untitled')}
              </h1>
            </div>
          </div>

          {/* Below-hero content */}
          <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
            ${metaDl ? `${metaDl}` : ''}
            {!!(${itemVar} as Record<string, unknown>).description && (
              <p className="mt-8 text-lg leading-relaxed text-foreground/80">
                {String((${itemVar} as Record<string, unknown>).description)}
              </p>
            )}
            {!!(${itemVar} as Record<string, unknown>).content && (
              <div className="mt-8 prose prose-neutral dark:prose-invert max-w-none">
                <p className="leading-relaxed">{String((${itemVar} as Record<string, unknown>).content)}</p>
              </div>
            )}
          </div>
        </>
      )}
    </section>`

  return {
    jsx,
    imports: DETAIL_IMPORTS,
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 2. detailSplitSidebar
// ---------------------------------------------------------------------------

/**
 * Two-column layout. Left (2/3): large image + title + long description.
 * Right (1/3): metadata sidebar card with key-value pairs and back link.
 * Corporate / structured feel.
 */
export const detailSplitSidebar: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []

  const hasImage = Boolean(ctx.imageColumn)

  const imgSection = hasImage
    ? `<div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              ${imageBlock(itemVar, ctx.imageColumn, tableName, 'w-full h-full object-cover')}
            </div>`
    : ''

  const metaDl = metadataRows(metaCols, itemVar)

  const jsx = `<section aria-label="${pluralTitle} detail" className="min-h-screen bg-background text-foreground py-12">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        ${loadingSpinner()}
        ${notFoundState(itemVar, entitySlug, pluralTitle)}

        {${itemVar} && (
          <div className="lg:grid lg:grid-cols-3 lg:gap-12">
            {/* Main content — left 2/3 */}
            <div className="lg:col-span-2 space-y-8">
              ${imgSection}
              <div>
                <h1 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] leading-tight">
                  {String(${itemVar}.${displayCol} ?? 'Untitled')}
                </h1>
              </div>
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
            <aside className="mt-10 lg:mt-0">
              <div className="sticky top-24 rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
                ${backLink(entitySlug, pluralTitle, 'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors')}
                ${metaDl
                  ? `<div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Details</h2>
                  ${metaDl}
                </div>`
                  : ''}
              </div>
            </aside>
          </div>
        )}
      </div>
    </section>`

  return {
    jsx,
    imports: DETAIL_IMPORTS,
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 3. detailArticle
// ---------------------------------------------------------------------------

/**
 * Article / longform style. Full-width image at top → centred narrow content
 * (max-w-3xl). Large serif title, date below, then body text. Blog feel.
 * Back link at top.
 */
export const detailArticle: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []

  // Pick a date-like column for article byline, fallback to first meta col
  const dateCol = metaCols.find((c) => /date|published|created/.test(c))
  const otherMeta = metaCols.filter((c) => c !== dateCol).slice(0, 2)

  const imgSection = `<div className="w-full aspect-[21/9] overflow-hidden bg-muted">
          ${imageBlock(itemVar, ctx.imageColumn, tableName, 'w-full h-full object-cover')}
        </div>`

  const bylineDate = dateCol
    ? `<time className="text-sm text-muted-foreground" dateTime={String(${itemVar}.${dateCol} ?? '')}>
            {${itemVar}.${dateCol} ? new Date(String(${itemVar}.${dateCol})).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
          </time>`
    : ''

  const bylineMeta = otherMeta
    .map(
      (col) =>
        `<span className="text-sm text-muted-foreground">{String(${itemVar}.${col} ?? '')}</span>`,
    )
    .join('\n          ')

  const jsx = `<section aria-label="${pluralTitle} article" className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 lg:px-8 pt-8">
        ${backLink(entitySlug, pluralTitle, 'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors')}
      </div>

      ${loadingSpinner()}
      ${notFoundState(itemVar, entitySlug, pluralTitle)}

      {${itemVar} && (
        <>
          ${imgSection}

          <article className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
            <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-display)] leading-tight mb-4">
              {String(${itemVar}.${displayCol} ?? 'Untitled')}
            </h1>

            {/* Byline */}
            <div className="flex flex-wrap items-center gap-4 pb-8 border-b border-border mb-8">
              ${bylineDate}
              ${bylineMeta}
            </div>

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
        </>
      )}
    </section>`

  return {
    jsx,
    imports: DETAIL_IMPORTS,
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 4. detailDataDense
// ---------------------------------------------------------------------------

/**
 * Compact data card layout. No hero image. Title at top, then a grid of
 * key-value mini cards (grid-cols-2 md:grid-cols-3). Dashboard / admin feel.
 */
export const detailDataDense: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []

  // Expand to include all entity columns we know about for data-dense view
  const allCols = metaCols.length > 0 ? metaCols : []

  const kvCards = allCols
    .map(
      (col) =>
        `<div className="rounded-lg border border-border bg-card p-4 shadow-sm">` +
        `<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">${columnLabel(col)}</p>` +
        `<p className="text-sm font-medium break-words">{String(${itemVar}.${col} ?? '—')}</p>` +
        `</div>`,
    )
    .join('\n              ')

  const idCard = `<div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">ID</p>
              <p className="text-sm font-mono break-all">{String(${itemVar}.id)}</p>
            </div>`

  const createdCard = `<div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Created</p>
              <p className="text-sm">{(${itemVar} as Record<string, unknown>).created_at ? new Date(String((${itemVar} as Record<string, unknown>).created_at)).toLocaleString() : '—'}</p>
            </div>`

  const jsx = `<section aria-label="${pluralTitle} detail" className="min-h-screen bg-background text-foreground py-10">
      <div className="max-w-5xl mx-auto px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          ${backLink(entitySlug, pluralTitle, 'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors')}
        </div>

        ${loadingSpinner()}
        ${notFoundState(itemVar, entitySlug, pluralTitle)}

        {${itemVar} && (
          <>
            <div className="mb-8 pb-6 border-b border-border">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">${tableName.replace(/_/g, ' ').toUpperCase()}</p>
              <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-display)] leading-tight">
                {String(${itemVar}.${displayCol} ?? 'Untitled')}
              </h1>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              ${idCard}
              ${kvCards}
              ${createdCard}
            </div>

            {!!(${itemVar} as Record<string, unknown>).description && (
              <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Description</p>
                <p className="text-sm leading-relaxed">{String((${itemVar} as Record<string, unknown>).description)}</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>`

  return {
    jsx,
    imports: DETAIL_IMPORTS,
    hooks: [buildDetailHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 5. detailGallery
// ---------------------------------------------------------------------------

/**
 * Gallery-focused layout. Shows the primary image large with subtle navigation
 * hints. Below: title + metadata in a clean two-column layout. If image column
 * is absent, falls back to a text-only centred layout. Minimal chrome.
 */
export const detailGallery: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const itemVar = ctx.itemVar ?? 'item'
  const tableName = ctx.tableName ?? 'items'
  const entitySlug = resolveSlug(ctx)
  const pluralTitle = resolvePluralTitle(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const metaCols = ctx.metadataColumns ?? []
  const hasImage = Boolean(ctx.imageColumn)

  const metaDl = metadataRows(metaCols, itemVar)

  const galleryImageSection = hasImage
    ? `<figure className="relative w-full bg-muted overflow-hidden group" aria-label="Primary image">
            <div className="aspect-[3/2] md:aspect-[16/9] w-full">
              ${imageBlock(itemVar, ctx.imageColumn, tableName, 'w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]')}
            </div>
            {/* Navigation hint overlay */}
            <div className="absolute inset-y-0 left-0 flex items-center px-4 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
              <span className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center text-lg">‹</span>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
              <span className="w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center text-lg">›</span>
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
                <p className="text-base leading-relaxed text-foreground/80">
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

  const jsx = `<section aria-label="${pluralTitle} gallery detail" className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-6">
        ${backLink(entitySlug, pluralTitle, 'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors')}
      </div>

      ${loadingSpinner()}
      ${notFoundState(itemVar, entitySlug, pluralTitle)}

      {${itemVar} && (
        <>
          ${galleryImageSection}
          ${contentLayout}
        </>
      )}
    </section>`

  return {
    jsx,
    imports: DETAIL_IMPORTS,
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
