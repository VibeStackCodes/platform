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
 */
import type { SectionRenderer, SectionOutput, SectionContext } from './types'

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

function cardBorderClass(ctx: SectionContext): string {
  const base = cardRadius(ctx)
  switch (ctx.tokens.style.cardStyle) {
    case 'flat':
      return base
    case 'bordered':
      return `${base} border border-border`
    case 'glass':
      return `${base} border border-border/70 bg-card/70 backdrop-blur-md`
    default:
      return `${base} border border-border shadow-sm`
  }
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
  return `{String(${item}.${col} ?? '')}`
}

/** Shared import lines every grid needs */
const BASE_IMPORTS = [
  "import { useQuery } from '@tanstack/react-query'",
  "import { supabase } from '../lib/supabase'",
  "import { Link } from '@tanstack/react-router'",
]

/** Build the standard useQuery hook declaration string */
function buildHook(ctx: SectionContext): string {
  const dataVar = ctx.dataVar ?? 'items'
  const table = ctx.tableName ?? 'items'
  const limit = queryLimit(ctx)
  return `const { data: ${dataVar} = [] } = useQuery({
    queryKey: ['${table}'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('*').order('created_at', { ascending: false }).limit(${limit})
      return data ?? []
    },
  })`
}

/** Render up to 3 metadata columns as small spans for a card */
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
  const meta = metaSpans(ctx)

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} gallery">
  <div className="columns-2 md:columns-3 gap-4 space-y-4">
    {${dataVar}.map((${item}: Record<string, unknown>) => (
      <Link
        key={String(${item}.id)}
        to={\`${link}\`}
        aria-label={${label}}
        className="group block break-inside-avoid mb-4"
      >
        <div className="${radius} overflow-hidden bg-card relative ${motion}">
          <img
            src={\`${src}\`}
            alt={${label}}
            className="w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-4">
            <div className="translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
              <p className="text-primary-foreground font-semibold text-sm leading-tight">${display}</p>
              ${meta ? `<div className="flex flex-wrap gap-1 mt-1">${meta}</div>` : ''}
            </div>
          </div>
        </div>
      </Link>
    ))}
  </div>
</section>`

  return {
    jsx,
    imports: BASE_IMPORTS,
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 2. gridBento — asymmetric bento layout, first item spans 2×2
// ---------------------------------------------------------------------------

export const gridBento: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const card = cardBorderClass(ctx)
  const motion = motionClass(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaSpans(ctx)
  const hasImage = !!ctx.imageColumn

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} collection">
  <div className="grid grid-cols-2 md:grid-cols-3 auto-rows-[200px] gap-4">
    {${dataVar}.map((${item}: Record<string, unknown>, _idx: number) => {
      const isFeatured = _idx === 0
      return (
        <Link
          key={String(${item}.id)}
          to={\`${link}\`}
          aria-label={${label}}
          className={\`group \${isFeatured ? 'col-span-2 row-span-2 md:col-span-2 md:row-span-2' : 'col-span-1 row-span-1'}\`}
        >
          <div className={\`${card} ${motion} h-full overflow-hidden relative flex flex-col justify-end\`}>
            ${hasImage ? `<img
              src={\`${src}\`}
              alt={${label}}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />` : '<div className="absolute inset-0 bg-muted" />'}
            <div className="relative z-10 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4">
              <p className={\`font-semibold text-white leading-snug \${isFeatured ? 'text-2xl md:text-3xl' : 'text-sm'}\`}>${display}</p>
              ${meta ? `{isFeatured && (
                <div className="flex flex-wrap gap-2 mt-2">${meta}</div>
              )}` : ''}
            </div>
          </div>
        </Link>
      )
    })}
  </div>
</section>`

  return {
    jsx,
    imports: BASE_IMPORTS,
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 3. gridMagazine — large first item full-width, remaining in 2-col grid
// ---------------------------------------------------------------------------

export const gridMagazine: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const card = cardBorderClass(ctx)
  const motion = motionClass(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const cols = (ctx.metadataColumns ?? []).slice(0, 2)
  const metaCols = cols
    .map(
      (col) =>
        `<span className="text-sm text-muted-foreground">{String(${item}.${col} ?? '')}</span>`,
    )
    .join('\n              ')
  const hasImage = !!ctx.imageColumn

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} magazine">
  {${dataVar}.length > 0 && (() => {
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
          <div className="${card} ${motion} overflow-hidden">
            ${hasImage ? `<div className="aspect-[21/9] overflow-hidden">
              <img
                src={\`${src}\`}
                alt={${label}}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="eager"
              />
            </div>` : '<div className="aspect-[21/9] bg-muted" />'}
            <div className="p-6 md:p-10">
              <h2 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] mb-3 leading-tight group-hover:text-primary transition-colors">${display}</h2>
              <div className="flex flex-wrap gap-4">
                ${metaCols}
              </div>
            </div>
          </div>
        </Link>

        {/* Remaining items in 2-col grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rest.map((${item}: Record<string, unknown>) => (
            <Link
              key={String(${item}.id)}
              to={\`${link}\`}
              aria-label={${label}}
              className="group block"
            >
              <div className="${card} ${motion} overflow-hidden">
                ${hasImage ? `<div className="aspect-video overflow-hidden">
                  <img
                    src={\`${src}\`}
                    alt={${label}}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>` : '<div className="aspect-video bg-muted" />'}
                <div className="p-5">
                  <h3 className="text-lg font-semibold font-[family-name:var(--font-display)] mb-2 group-hover:text-primary transition-colors">${display}</h3>
                  <div className="flex flex-wrap gap-3">
                    ${metaCols}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  })()}
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
      "import { useState } from 'react'",
    ],
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 4. gridCards3col — standard 3-column card grid with search input
// ---------------------------------------------------------------------------

export const gridCards3col: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const card = cardBorderClass(ctx)
  const motion = motionClass(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaSpans(ctx)
  const hasImage = !!ctx.imageColumn
  const displayCol = ctx.displayColumn ?? 'id'

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} list">
  {/* Search */}
  <div className="mb-8 max-w-md">
    <input
      type="search"
      placeholder="Search ${ctx.entitySlug ?? 'items'}…"
      value={_search3col}
      onChange={(e) => _setSearch3col(e.target.value)}
      className="w-full rounded-[${ctx.tokens.style.borderRadius}] border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Search"
    />
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {${dataVar}
      .filter((${item}: Record<string, unknown>) =>
        !_search3col || String(${item}.${displayCol} ?? '').toLowerCase().includes(_search3col.toLowerCase())
      )
      .map((${item}: Record<string, unknown>) => (
        <Link
          key={String(${item}.id)}
          to={\`${link}\`}
          aria-label={${label}}
          className="group block"
        >
          <article className="${card} ${motion} overflow-hidden h-full flex flex-col bg-card">
            ${hasImage ? `<div className="aspect-video overflow-hidden">
              <img
                src={\`${src}\`}
                alt={${label}}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </div>` : ''}
            <div className="p-5 flex flex-col flex-1 gap-2">
              <h3 className="font-semibold font-[family-name:var(--font-display)] text-foreground group-hover:text-primary transition-colors leading-snug">${display}</h3>
              <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-border/50">
                ${meta}
              </div>
            </div>
          </article>
        </Link>
      ))}
  </div>
</section>`

  return {
    jsx,
    imports: [
      ...BASE_IMPORTS,
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
  const card = cardBorderClass(ctx)
  const motion = motionClass(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const meta = metaSpans(ctx)
  const hasImage = !!ctx.imageColumn

  const jsx = `<section className="py-12 bg-background" aria-label="${ctx.entitySlug ?? 'items'} browse">
  <div
    className="flex overflow-x-auto gap-4 snap-x snap-mandatory px-4 md:px-8 pb-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
    role="list"
  >
    {${dataVar}.map((${item}: Record<string, unknown>) => (
      <Link
        key={String(${item}.id)}
        to={\`${link}\`}
        aria-label={${label}}
        className="group snap-start flex-shrink-0 min-w-[280px] max-w-[320px]"
        role="listitem"
      >
        <article className="${card} ${motion} overflow-hidden h-full flex flex-col bg-card">
          ${hasImage ? `<div className="aspect-[4/3] overflow-hidden">
            <img
              src={\`${src}\`}
              alt={${label}}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          </div>` : '<div className="aspect-[4/3] bg-muted" />'}
          <div className="p-4 flex flex-col gap-2 flex-1">
            <h3 className="font-semibold font-[family-name:var(--font-display)] text-foreground group-hover:text-primary transition-colors leading-snug text-sm">${display}</h3>
            <div className="flex flex-wrap gap-1 mt-auto">
              ${meta}
            </div>
          </div>
        </article>
      </Link>
    ))}
  </div>
</section>`

  return {
    jsx,
    imports: BASE_IMPORTS,
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 6. gridTable — compact table with thead, hover rows, action links
// ---------------------------------------------------------------------------

export const gridTable: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const motion = motionClass(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const display = displayValue(ctx)
  const displayCol = ctx.displayColumn ?? 'id'
  const cols = (ctx.metadataColumns ?? []).slice(0, 3)
  const radius = cardRadius(ctx)

  const thCells = [`<th scope="col" className="py-3 pr-6 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">${displayCol.replace(/_/g, ' ')}</th>`]
  cols.forEach((col) => {
    thCells.push(
      `<th scope="col" className="py-3 pr-6 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">${col.replace(/_/g, ' ')}</th>`,
    )
  })
  thCells.push(`<th scope="col" className="py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="sr-only">Actions</span></th>`)

  const tdCells = [`<td className="py-3 pr-6 font-medium text-foreground text-sm">${display}</td>`]
  cols.forEach((col) => {
    tdCells.push(
      `<td className="py-3 pr-6 text-muted-foreground text-sm">{String(${item}.${col} ?? '—')}</td>`,
    )
  })
  tdCells.push(
    `<td className="py-3 text-right">
                  <Link
                    to={\`${link}\`}
                    aria-label={${label}}
                    className="${motion} text-primary text-sm font-medium hover:underline"
                  >
                    View
                  </Link>
                </td>`,
  )

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} table">
  <div className="${radius} border border-border overflow-hidden">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted/50">
          <tr>
            ${thCells.join('\n            ')}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {${dataVar}.map((${item}: Record<string, unknown>) => (
            <tr
              key={String(${item}.id)}
              className="hover:bg-muted/50 transition-colors duration-150"
            >
              ${tdCells.join('\n              ')}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {${dataVar}.length === 0 && (
      <div className="py-16 text-center text-muted-foreground text-sm">No records found.</div>
    )}
  </div>
</section>`

  return {
    jsx,
    imports: BASE_IMPORTS,
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 7. gridImageOverlay — edge-to-edge images, title on hover gradient
// ---------------------------------------------------------------------------

export const gridImageOverlay: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const motion = motionClass(ctx)
  const radius = cardRadius(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} gallery">
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
    {${dataVar}.map((${item}: Record<string, unknown>) => (
      <Link
        key={String(${item}.id)}
        to={\`${link}\`}
        aria-label={${label}}
        className="group relative block overflow-hidden ${radius} ${motion}"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
          <div className="p-3 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <p className="text-white font-semibold text-sm leading-tight line-clamp-2">${display}</p>
          </div>
        </div>
      </Link>
    ))}
  </div>
</section>`

  return {
    jsx,
    imports: BASE_IMPORTS,
    hooks: [buildHook(ctx)],
  }
}

// ---------------------------------------------------------------------------
// 8. gridListEditorial — vertical list, wide image left, content right
// ---------------------------------------------------------------------------

export const gridListEditorial: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const dataVar = ctx.dataVar ?? 'items'
  const item = ctx.itemVar ?? 'item'
  const motion = motionClass(ctx)
  const radius = cardRadius(ctx)
  const link = itemLink(ctx)
  const label = ariaLabel(ctx)
  const src = imageSrc(ctx)
  const display = displayValue(ctx)
  const cols = (ctx.metadataColumns ?? []).slice(0, 3)
  const hasImage = !!ctx.imageColumn

  const metaItems = cols
    .map(
      (col) =>
        `<span className="text-sm text-muted-foreground">{String(${item}.${col} ?? '')}</span>`,
    )
    .join('\n              ')

  // Pick up an excerpt column if available (description, excerpt, bio, summary, content)
  const excerptCol = (ctx.metadataColumns ?? []).find((c) =>
    /description|excerpt|bio|summary|content|body/.test(c),
  )

  const jsx = `<section className="py-12 px-4 md:px-8 bg-background" aria-label="${ctx.entitySlug ?? 'items'} editorial list">
  <ol className="space-y-0 divide-y divide-border">
    {${dataVar}.map((${item}: Record<string, unknown>) => (
      <li key={String(${item}.id)} className="group">
        <Link
          to={\`${link}\`}
          aria-label={${label}}
          className="flex gap-6 py-8 ${motion}"
        >
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
            <div className="flex flex-wrap items-center gap-3">
              ${metaItems}
            </div>
            ${excerptCol ? `<p className="text-muted-foreground text-sm leading-relaxed line-clamp-3 mt-1">{String(${item}.${excerptCol} ?? '')}</p>` : ''}
            <span className="text-primary text-sm font-medium mt-1 group-hover:underline">Read more →</span>
          </div>
        </Link>
      </li>
    ))}
  </ol>
</section>`

  return {
    jsx,
    imports: BASE_IMPORTS,
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
