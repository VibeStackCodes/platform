/**
 * Grid Section Renderers — 8 entity grid layouts
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput that
 * produces self-contained JSX fragments assembled into route files by the
 * page composer.
 *
 * All grids share a common data-fetching pattern: they return a `hooks`
 * array containing a useQuery declaration and an `imports` array with the
 * required import lines. The JSX fragment references the query result
 * variables supplied via SectionContext.
 *
 * v2 — upgraded to shadcn Card/Badge/Skeleton/Table, Lucide icons,
 * tw-animate-css stagger animations, skeleton loading states, and empty states.
 */
import type { SectionRenderer, SectionOutput, SectionContext } from './types'
import {
  cardSkeletonGrid,
  emptyState,
  cardHoverClass,
  cardClasses,
} from './primitives'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function queryLimit(ctx: SectionContext): number {
  const raw = ctx.config.limit
  return typeof raw === 'number' && raw > 0 ? raw : 12
}

function cardRadius(ctx: SectionContext): string {
  return `rounded-[${ctx.tokens.style.borderRadius}]`
}

function motionClass(ctx: SectionContext): string {
  if (ctx.tokens.style.motion === 'none') return ''
  if (ctx.tokens.style.motion === 'subtle') return 'transition-all duration-200 hover:scale-[1.02]'
  return 'transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-lg'
}

function displayValue(ctx: SectionContext): string {
  const col = ctx.displayColumn ?? 'id'
  return `{String(${ctx.itemVar ?? 'item'}.${col} ?? '')}`
}

function imageSrc(ctx: SectionContext): string {
  const item = ctx.itemVar ?? 'item'
  if (!ctx.imageColumn) return `https://picsum.photos/seed/\${${item}.id}/600/400`
  return `\${${item}.${ctx.imageColumn} || \`https://picsum.photos/seed/\${${item}.id}/600/400\`}`
}

function itemLink(ctx: SectionContext): string {
  const slug = ctx.entitySlug ?? ''
  const item = ctx.itemVar ?? 'item'
  return `/${slug}/\${${item}.id}`
}

function ariaLabel(ctx: SectionContext): string {
  const col = ctx.displayColumn ?? 'id'
  const item = ctx.itemVar ?? 'item'
  return `String(${item}.${col} ?? '')`
}

/** Shared import lines every grid needs */
const BASE_IMPORTS = [
  "import { useQuery } from '@tanstack/react-query'",
  "import { supabase } from '@/lib/supabase'",
  "import { Link } from '@tanstack/react-router'",
]

/** shadcn component import lines */
const CARD_IMPORT = "import { Card, CardContent, CardFooter } from '@/components/ui/card'"
const BADGE_IMPORT = "import { Badge } from '@/components/ui/badge'"
const SKELETON_IMPORT = "import { Skeleton } from '@/components/ui/skeleton'"
const TABLE_IMPORT =
  "import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'"
const INPUT_IMPORT = "import { Input } from '@/components/ui/input'"

/** Lucide icon import — grouped to avoid duplicate import lines */
function lucideImport(...icons: string[]): string {
  return `import { ${icons.join(', ')} } from 'lucide-react'`
}

/** Build the standard useQuery hook declaration string (now with isLoading) */
function buildHook(ctx: SectionContext): string {
  const dataVar = ctx.dataVar ?? 'items'
  const table = ctx.tableName ?? 'items'
  const limit = queryLimit(ctx)
  return `const { data: ${dataVar} = [], isLoading } = useQuery({
    queryKey: ['${table}'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('*').order('created_at', { ascending: false }).limit(${limit})
      return data ?? []
    },
  })`
}

/** Render up to 3 metadata columns as shadcn Badge elements */
function metaBadges(ctx: SectionContext): string {
  const cols = (ctx.metadataColumns ?? []).slice(0, 3)
  const item = ctx.itemVar ?? 'item'
  if (cols.length === 0) return ''
  return cols
    .map(
      (col) =>
        `<Badge variant="secondary" className="text-xs">{String(${item}.${col} ?? '')}</Badge>`,
    )
    .join('\n              ')
}

/** Render up to 3 metadata columns as small muted spans (for layouts that don't suit badges) */
function metaSpans(ctx: SectionContext): string {
  const cols = (ctx.metadataColumns ?? []).slice(0, 3)
  const item = ctx.itemVar ?? 'item'
  if (cols.length === 0) return ''
  return cols
    .map(
      (col) =>
        `<span className="text-xs text-muted-foreground">{String(${item}.${col} ?? '')}</span>`,
    )
    .join('\n              ')
}

// ---------------------------------------------------------------------------
// 1. gridMasonry — CSS columns, variable-height cards, gallery feel
// ---------------------------------------------------------------------------

export const gridMasonry: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const motion = motionClass(ctx)
  const radius = cardRadius(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaBadges(ctx)

  // Skeleton: 3-col masonry approximated as a 3-col grid of image cards
  const skeleton = cardSkeletonGrid(3, { rows: 2, hasImage: true })
  const empty = emptyState({
    icon: 'Images',
    title: `No ${ctx.entitySlug ?? 'items'} yet`,
    description: 'Check back soon for new additions.',
  })

  const hasMotion = ctx.tokens.style.motion !== 'none'

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} gallery">
  {isLoading ? (
    ${skeleton.jsx}
  ) : ${dataVar}.length === 0 ? (
    ${empty.jsx}
  ) : (
    <div className="columns-2 md:columns-3 gap-4 space-y-4" role="list">
      {${dataVar}.map((${item}: Record<string, unknown>, _idx: number) => (
        <Link
          key={String(${item}.id)}
          to={\`${link}\`}
          aria-label={${label}}
          className="${hasMotion ? 'group block break-inside-avoid mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500' : 'group block break-inside-avoid mb-4'}"
          style={${hasMotion} ? { animationDelay: \`\${Math.min(_idx, 5) * 100}ms\` } : undefined}
          role="listitem"
        >
          <Card className="${radius} overflow-hidden p-0 hover:shadow-xl transition-shadow duration-300 ${motion}">
            <div className="overflow-hidden">
              <img
                src={\`${src}\`}
                alt={${label}}
                className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </div>
            <div className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-4 rounded-[inherit]">
              <div className="translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
                <p className="text-primary-foreground font-semibold text-sm leading-tight">${display}</p>
                ${meta ? `<div className="flex flex-wrap gap-1 mt-2">${meta}</div>` : ''}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      CARD_IMPORT,
      BADGE_IMPORT,
      SKELETON_IMPORT,
      skeleton.import,
      empty.import,
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 2. gridBento — asymmetric bento layout, first item spans 2×2
// ---------------------------------------------------------------------------

export const gridBento: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const hover = cardHoverClass(ctx)
  const radius = cardRadius(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaBadges(ctx)
  const hasImage = !!ctx.imageColumn

  // Bento skeleton: 2 tall + 4 small approximated as 3-col with 2 rows
  const skeleton = cardSkeletonGrid(3, { rows: 2, hasImage: true })
  const empty = emptyState({
    icon: 'LayoutGrid',
    title: `No ${ctx.entitySlug ?? 'items'} yet`,
    description: 'Items will appear here once added.',
  })

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} collection">
  {isLoading ? (
    ${skeleton.jsx}
  ) : ${dataVar}.length === 0 ? (
    ${empty.jsx}
  ) : (
    <div className="grid grid-cols-2 md:grid-cols-3 auto-rows-[200px] gap-4" role="list">
      {${dataVar}.map((${item}: Record<string, unknown>, _idx: number) => {
        const isFeatured = _idx === 0
        return (
          <Link
            key={String(${item}.id)}
            to={\`${link}\`}
            aria-label={${label}}
            className={\`group \${isFeatured ? 'col-span-2 row-span-2 md:col-span-2 md:row-span-2' : 'col-span-1 row-span-1'}\`}
            role="listitem"
          >
            <Card className={\`${radius} p-0 overflow-hidden h-full relative ${hover} shadow-lg hover:shadow-xl\`}>
              ${hasImage ? `<img
                src={\`${src}\`}
                alt={${label}}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />` : '<div className="absolute inset-0 bg-muted" />'}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="relative z-10 h-full flex flex-col justify-end p-4">
                <p className={\`font-semibold text-white leading-snug \${isFeatured ? 'text-2xl md:text-3xl' : 'text-sm'}\`}>${display}</p>
                ${meta ? `{isFeatured && (
                  <div className="flex flex-wrap gap-2 mt-2">${meta}</div>
                )}` : ''}
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      CARD_IMPORT,
      BADGE_IMPORT,
      SKELETON_IMPORT,
      skeleton.import,
      empty.import,
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 3. gridMagazine — large first item full-width, remaining in 2-col grid
// ---------------------------------------------------------------------------

export const gridMagazine: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const hover = cardHoverClass(ctx)
  const cardCls = cardClasses(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const cols = (ctx.metadataColumns ?? []).slice(0, 2)
  const hasImage = !!ctx.imageColumn

  const metaBadgeCols = cols
    .map(
      (col) =>
        `<Badge variant="secondary" className="text-xs">{String(${item}.${col} ?? '')}</Badge>`,
    )
    .join('\n                ')

  // Skeleton: 1 wide + 2-col grid
  const featuredSkeleton = cardSkeletonGrid(1, { rows: 1, hasImage: true })
  const gridSkeleton = cardSkeletonGrid(2, { rows: 2, hasImage: true })
  const empty = emptyState({
    icon: 'Newspaper',
    title: `No ${ctx.entitySlug ?? 'items'} yet`,
    description: 'Stories will appear here once published.',
  })

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} magazine">
  {isLoading ? (
    <div className="space-y-8">
      ${featuredSkeleton.jsx}
      ${gridSkeleton.jsx}
    </div>
  ) : ${dataVar}.length === 0 ? (
    ${empty.jsx}
  ) : (
    (() => {
      const [featured, ...rest] = ${dataVar} as Record<string, unknown>[]
      const ${item} = featured
      return (
        <div className="space-y-10">
          {/* Featured item */}
          <Link
            to={\`${link}\`}
            aria-label={${label}}
            className="group block"
          >
            <Card className="${cardCls} ${hover} overflow-hidden p-0 shadow-lg hover:shadow-xl">
              ${hasImage ? `<div className="aspect-[21/9] overflow-hidden">
                <img
                  src={\`${src}\`}
                  alt={${label}}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="eager"
                />
              </div>` : '<div className="aspect-[21/9] bg-muted" />'}
              <CardContent className="p-6 md:p-10">
                <h2 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] mb-3 leading-tight group-hover:text-primary transition-colors">${display}</h2>
                <div className="flex flex-wrap gap-2">
                  ${metaBadgeCols}
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Remaining items in 2-col grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" role="list">
            {rest.map((${item}: Record<string, unknown>, _idx: number) => (
              <Link
                key={String(${item}.id)}
                to={\`${link}\`}
                aria-label={${label}}
                className="group block animate-in fade-in slide-in-from-bottom-4 duration-500"
                style={{ animationDelay: \`\${_idx * 100}ms\` }}
                role="listitem"
              >
                <Card className="${cardCls} ${hover} overflow-hidden p-0 h-full shadow-md hover:shadow-lg">
                  ${hasImage ? `<div className="aspect-video overflow-hidden">
                    <img
                      src={\`${src}\`}
                      alt={${label}}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>` : '<div className="aspect-video bg-muted" />'}
                  <CardContent className="p-5">
                    <h3 className="text-lg font-semibold font-[family-name:var(--font-display)] mb-2 group-hover:text-primary transition-colors">${display}</h3>
                    <div className="flex flex-wrap gap-2">
                      ${metaBadgeCols}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )
    })()
  )}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      CARD_IMPORT,
      BADGE_IMPORT,
      SKELETON_IMPORT,
      featuredSkeleton.import,
      empty.import,
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 4. gridCards3col — standard 3-column card grid with search input + Search icon
// ---------------------------------------------------------------------------

export const gridCards3col: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const cardCls = cardClasses(ctx)
  const hover = cardHoverClass(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaBadges(ctx)
  const hasImage = !!ctx.imageColumn
  const displayCol = ctx.displayColumn ?? 'id'

  const skeleton = cardSkeletonGrid(3, { rows: 2, hasImage: !!ctx.imageColumn })
  const empty = emptyState({
    icon: 'SearchX',
    title: `No ${ctx.entitySlug ?? 'items'} found`,
    description: 'Try a different search term.',
  })

  const jsx = `<section className="py-12 px-6 bg-background" aria-label="${ctx.entitySlug ?? 'items'} list">
  {/* Search bar */}
  <div className="mb-8 max-w-md relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
    <Input
      type="search"
      placeholder="Search ${ctx.entitySlug ?? 'items'}…"
      value={_search3col}
      onChange={(e) => _setSearch3col(e.target.value)}
      className="pl-9"
      aria-label="Search ${ctx.entitySlug ?? 'items'}"
    />
  </div>

  {isLoading ? (
    ${skeleton.jsx}
  ) : (
    (() => {
      const _filtered = ${dataVar}.filter((${item}: Record<string, unknown>) =>
        !_search3col || String(${item}.${displayCol} ?? '').toLowerCase().includes(_search3col.toLowerCase())
      )
      return _filtered.length === 0 ? (
        ${empty.jsx}
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" role="list">
          {_filtered.map((${item}: Record<string, unknown>, _idx: number) => (
            <Link
              key={String(${item}.id)}
              to={\`${link}\`}
              aria-label={${label}}
              className="group block animate-in fade-in slide-in-from-bottom-4 duration-500"
              style={{ animationDelay: \`\${Math.min(_idx, 5) * 100}ms\` }}
              role="listitem"
            >
              <Card className="${cardCls} ${hover} overflow-hidden p-0 h-full flex flex-col shadow-md hover:shadow-lg">
                ${hasImage ? `<div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={\`${src}\`}
                    alt={${label}}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>` : ''}
                <CardContent className="p-5 flex flex-col flex-1 gap-2">
                  <h3 className="font-semibold font-[family-name:var(--font-display)] text-foreground group-hover:text-primary transition-colors leading-snug">${display}</h3>
                  ${meta ? `<div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-border/50">
                    ${meta}
                  </div>` : ''}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )
    })()
  )}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      CARD_IMPORT,
      BADGE_IMPORT,
      SKELETON_IMPORT,
      INPUT_IMPORT,
      lucideImport('Search', 'SearchX'),
      skeleton.import,
      "import { useState } from 'react'",
    ],
    hooks: [
      buildHook(ctx),
      `const [_search3col, _setSearch3col] = useState('')`,
    ],
  }
}

// ---------------------------------------------------------------------------
// 5. gridHorizontal — horizontal scroll row, snap-x
// ---------------------------------------------------------------------------

export const gridHorizontal: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const cardCls = cardClasses(ctx)
  const hover = cardHoverClass(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaBadges(ctx)
  const hasImage = !!ctx.imageColumn

  // Horizontal skeleton: a single row of 4 fixed-width skeleton cards
  const skeletonCards = Array.from(
    { length: 4 },
    () => `<div className="flex-shrink-0 w-[280px] flex flex-col gap-3 p-4 border border-border rounded-xl">
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>`,
  ).join('\n        ')

  const empty = emptyState({
    icon: 'GalleryHorizontal',
    title: `No ${ctx.entitySlug ?? 'items'} yet`,
    description: 'Items will appear here once added.',
  })

  const jsx = `<section className="py-12 bg-background" aria-label="${ctx.entitySlug ?? 'items'} browse">
  {isLoading ? (
    <div
      className="flex overflow-x-auto gap-4 px-6 pb-4"
      role="status"
      aria-busy="true"
      aria-label="Loading content"
    >
      ${skeletonCards}
    </div>
  ) : ${dataVar}.length === 0 ? (
    <div className="px-6">
      ${empty.jsx}
    </div>
  ) : (
    <div
      className="flex overflow-x-auto gap-4 snap-x snap-mandatory px-6 pb-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
      role="list"
    >
      {${dataVar}.map((${item}: Record<string, unknown>, _idx: number) => (
        <Link
          key={String(${item}.id)}
          to={\`${link}\`}
          aria-label={${label}}
          className="group snap-start flex-shrink-0 min-w-[280px] max-w-[320px] animate-in fade-in slide-in-from-right-4 duration-500"
          style={{ animationDelay: \`\${Math.min(_idx, 5) * 80}ms\` }}
          role="listitem"
        >
          <Card className="${cardCls} ${hover} overflow-hidden p-0 h-full flex flex-col shadow-md hover:shadow-lg">
            ${hasImage ? `<div className="aspect-[4/3] overflow-hidden">
              <img
                src={\`${src}\`}
                alt={${label}}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </div>` : '<div className="aspect-[4/3] bg-muted" />'}
            <CardContent className="p-4 flex flex-col gap-2 flex-1">
              <h3 className="font-semibold font-[family-name:var(--font-display)] text-foreground group-hover:text-primary transition-colors leading-snug text-sm">${display}</h3>
              ${meta ? `<div className="flex flex-wrap gap-1 mt-auto">
                ${meta}
              </div>` : ''}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      CARD_IMPORT,
      BADGE_IMPORT,
      SKELETON_IMPORT,
      lucideImport('GalleryHorizontal'),
      empty.import,
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 6. gridTable — shadcn Table with thead, hover rows, ArrowRight action links
// ---------------------------------------------------------------------------

export const gridTable: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const display = displayValue(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const cols = (ctx.metadataColumns ?? []).slice(0, 3)
  const radius = cardRadius(ctx)

  // Build TableHead cells
  const thCells = [
    `<TableHead className="text-xs font-semibold uppercase tracking-wide">${displayCol.replace(/_/g, ' ')}</TableHead>`,
  ]
  cols.forEach((col) => {
    thCells.push(
      `<TableHead className="text-xs font-semibold uppercase tracking-wide">${col.replace(/_/g, ' ')}</TableHead>`,
    )
  })
  thCells.push(
    `<TableHead className="text-right text-xs font-semibold uppercase tracking-wide"><span className="sr-only">Actions</span></TableHead>`,
  )

  // Build TableCell cells for each data row
  const tdCells = [`<TableCell className="font-medium text-foreground text-sm">${display}</TableCell>`]
  cols.forEach((col) => {
    tdCells.push(
      `<TableCell className="text-muted-foreground text-sm">{String(${item}.${col} ?? '—')}</TableCell>`,
    )
  })
  tdCells.push(
    `<TableCell className="text-right">
                  <Link
                    to={\`${link}\`}
                    aria-label={${label}}
                    className="inline-flex items-center gap-1 text-primary text-sm font-medium hover:underline transition-colors"
                  >
                    View <ArrowRight className="size-3" aria-hidden="true" />
                  </Link>
                </TableCell>`,
  )

  // Skeleton rows
  const skeletonCols = 1 + cols.length + 1
  const skeletonRow = `<tr className="border-b border-border">
              ${Array.from({ length: skeletonCols }, () => '<td className="py-3 pr-6"><Skeleton className="h-4 w-24" /></td>').join('\n              ')}
            </tr>`
  const skeletonRows = Array.from({ length: 5 }, () => skeletonRow).join('\n            ')

  const empty = emptyState({
    icon: 'Table2',
    title: `No ${ctx.entitySlug ?? 'items'} found`,
    description: 'Records will appear here once added.',
  })

  const jsx = `<section className="py-12 px-6 bg-background" aria-label="${ctx.entitySlug ?? 'items'} table">
  <div className="${radius} border border-border overflow-hidden shadow-sm">
    <div className="overflow-x-auto">
      {isLoading ? (
        <table className="min-w-full" aria-busy="true" aria-label="Loading content">
          <thead className="bg-muted/50">
            <tr>
              ${thCells.join('\n              ')}
            </tr>
          </thead>
          <tbody>
            ${skeletonRows}
          </tbody>
        </table>
      ) : ${dataVar}.length === 0 ? (
        ${empty.jsx}
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              ${thCells.join('\n              ')}
            </TableRow>
          </TableHeader>
          <TableBody>
            {${dataVar}.map((${item}: Record<string, unknown>) => (
              <TableRow
                key={String(${item}.id)}
                className="hover:bg-muted/40 transition-colors duration-150"
              >
                ${tdCells.join('\n                ')}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  </div>
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      TABLE_IMPORT,
      SKELETON_IMPORT,
      lucideImport('ArrowRight', 'Table2'),
      empty.import,
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 7. gridImageOverlay — edge-to-edge images, title on hover gradient
// ---------------------------------------------------------------------------

export const gridImageOverlay: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const radius = cardRadius(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaSpans(ctx)

  const skeleton = cardSkeletonGrid(4, { rows: 2, hasImage: true })
  const empty = emptyState({
    icon: 'Images',
    title: `No ${ctx.entitySlug ?? 'items'} yet`,
    description: 'Gallery items will appear here once added.',
  })

  const jsx = `<section className="py-12 px-6 bg-background" aria-label="${ctx.entitySlug ?? 'items'} gallery">
  {isLoading ? (
    ${skeleton.jsx}
  ) : ${dataVar}.length === 0 ? (
    ${empty.jsx}
  ) : (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2" role="list">
      {${dataVar}.map((${item}: Record<string, unknown>, _idx: number) => (
        <Link
          key={String(${item}.id)}
          to={\`${link}\`}
          aria-label={${label}}
          className={\`group relative block overflow-hidden ${radius} shadow-md hover:shadow-xl transition-shadow duration-300 animate-in fade-in duration-500\`}
          style={{ animationDelay: \`\${Math.min(_idx, 7) * 60}ms\` }}
          role="listitem"
        >
          <div className="aspect-[4/3] overflow-hidden">
            <img
              src={\`${src}\`}
              alt={${label}}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
          </div>
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
            <div className="p-3 translate-y-2 group-hover:translate-y-0 transition-transform duration-300 w-full">
              <p className="text-white font-semibold text-sm leading-tight line-clamp-2">${display}</p>
              ${meta ? `<div className="flex flex-wrap gap-1 mt-1">${meta}</div>` : ''}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      SKELETON_IMPORT,
      lucideImport('Images'),
      skeleton.import,
      empty.import,
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 8. gridListEditorial — vertical list, wide image left, content right
// ---------------------------------------------------------------------------

export const gridListEditorial: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const cardCls = cardClasses(ctx)
  const hover = cardHoverClass(ctx)
  const radius = cardRadius(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const cols = (ctx.metadataColumns ?? []).slice(0, 3)
  const hasImage = !!ctx.imageColumn

  const metaBadgeCols = cols
    .map(
      (col) =>
        `<Badge variant="secondary" className="text-xs">{String(${item}.${col} ?? '')}</Badge>`,
    )
    .join('\n              ')

  // Pick up an excerpt column if available
  const excerptCol = (ctx.metadataColumns ?? []).find((c) =>
    /description|excerpt|bio|summary|content|body/.test(c),
  )

  // Skeleton: vertical list of 4 rows with image + lines
  const skeletonRows = Array.from(
    { length: 4 },
    () => `<div className="flex gap-6 py-8 border-b border-border">
          ${hasImage ? '<Skeleton className="flex-shrink-0 w-1/3 max-w-[240px] h-40 rounded-xl" />' : ''}
          <div className="flex flex-col gap-3 flex-1 justify-center">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>`,
  ).join('\n        ')

  const empty = emptyState({
    icon: 'BookOpen',
    title: `No ${ctx.entitySlug ?? 'items'} yet`,
    description: 'Posts will appear here once published.',
  })

  const jsx = `<section className="py-12 px-6 bg-background" aria-label="${ctx.entitySlug ?? 'items'} editorial list">
  {isLoading ? (
    <div role="status" aria-busy="true" aria-label="Loading content">
      ${skeletonRows}
    </div>
  ) : ${dataVar}.length === 0 ? (
    ${empty.jsx}
  ) : (
    <ol className="space-y-0 divide-y divide-border">
      {${dataVar}.map((${item}: Record<string, unknown>, _idx: number) => (
        <li
          key={String(${item}.id)}
          className="group animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: \`\${Math.min(_idx, 5) * 100}ms\` }}
        >
          <Link
            to={\`${link}\`}
            aria-label={${label}}
            className="block"
          >
            <Card className="${cardCls} ${hover} border-0 shadow-none rounded-none py-8 hover:bg-muted/30 transition-colors duration-200">
              <CardContent className="p-0 flex gap-6">
                ${hasImage ? `{/* Image */}
                <div className="flex-shrink-0 w-1/3 max-w-[240px]">
                  <div className="aspect-[4/3] overflow-hidden ${radius}">
                    <img
                      src={\`${src}\`}
                      alt={${label}}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                </div>` : ''}

                {/* Content */}
                <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
                  <h3 className="text-xl font-bold font-[family-name:var(--font-display)] text-foreground group-hover:text-primary transition-colors leading-snug">${display}</h3>
                  ${cols.length > 0 ? `<div className="flex flex-wrap items-center gap-2">
                    ${metaBadgeCols}
                  </div>` : ''}
                  ${excerptCol ? `<p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mt-1">{String(${item}.${excerptCol} ?? '')}</p>` : ''}
                  <CardFooter className="p-0 mt-1">
                    <span className="inline-flex items-center gap-1 text-primary text-sm font-medium group-hover:underline">
                      Read more <ArrowRight className="size-3" aria-hidden="true" />
                    </span>
                  </CardFooter>
                </div>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ol>
  )}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      CARD_IMPORT,
      BADGE_IMPORT,
      SKELETON_IMPORT,
      lucideImport('ArrowRight', 'BookOpen'),
      empty.import,
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// Named export map — matches SECTION_IDS grid constants
// ---------------------------------------------------------------------------

export const GRID_RENDERERS: Record<string, SectionRenderer> = {
  'grid-masonry': gridMasonry,
  'grid-bento': gridBento,
  'grid-magazine': gridMagazine,
  'grid-cards-3col': gridCards3col,
  'grid-horizontal': gridHorizontal,
  'grid-table': gridTable,
  'grid-image-overlay': gridImageOverlay,
  'grid-list-editorial': gridListEditorial,
}
