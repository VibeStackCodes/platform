/**
 * Utility Section Renderers (6)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. These utility sections augment entity
 * grid/detail pages with filtering, pagination, search, and navigation aids.
 *
 * Visual taxonomy:
 *   utilCategoryScroll — horizontal scrolling chip filter row
 *   utilBreadcrumb     — aria breadcrumb trail with separators
 *   utilSearchHeader   — page heading + inline search input
 *   utilFilterTabs     — horizontal tab bar with active underline
 *   utilEmptyState     — centered empty state message and optional CTA
 *   utilPagination     — numbered prev/next pagination
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Title-case a snake_case or kebab-case string */
function toTitle(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Singularize a simple plural by stripping trailing 's' (best-effort for display) */
function roughSingular(str: string): string {
  const title = toTitle(str)
  if (title.endsWith('ies')) return title.slice(0, -3) + 'y'
  if (title.endsWith('s') && !title.endsWith('ss')) return title.slice(0, -1)
  return title
}

/** Entrance animation class when motion is enabled */
function entranceClass(ctx: SectionContext): string {
  return ctx.tokens.style.motion !== 'none' ? 'transition-all duration-200 ease-out' : ''
}

// ---------------------------------------------------------------------------
// 1. utilCategoryScroll — horizontal scrolling chip filter row
// ---------------------------------------------------------------------------

export const utilCategoryScroll: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const categoryColumn =
    (ctx.config.categoryColumn as string | undefined) ??
    ctx.metadataColumns?.[0] ??
    'category'
  const motion = entranceClass(ctx)

  // The chip list is data-driven at runtime — we render the query + map here
  return {
    jsx: `
      <div className="bg-background border-b border-border" role="region" aria-label="Filter by category">
        <div className="container mx-auto px-4">
          <div
            className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-none"
            role="list"
            aria-label="Category filters"
          >
            {/* All chip */}
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={\`flex-shrink-0 px-3 py-1 rounded-full text-sm font-medium ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
                \${activeCategory === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-foreground'
                }\`}
              aria-pressed={activeCategory === null}
              role="listitem"
            >
              All
            </button>

            {/* Dynamic category chips from data */}
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={\`flex-shrink-0 px-3 py-1 rounded-full text-sm font-medium ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
                  \${activeCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-foreground'
                  }\`}
                aria-pressed={activeCategory === cat}
                role="listitem"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>`,
    imports: [
      "import { useState, useMemo } from 'react'",
    ],
    hooks: [
      'const [activeCategory, setActiveCategory] = useState<string | null>(null)',
      `const categories = useMemo(() => {
    if (!${ctx.dataVar ?? 'data'}) return []
    const seen = new Set<string>()
    for (const item of ${ctx.dataVar ?? 'data'}) {
      const val = (item as Record<string, unknown>)['${categoryColumn}']
      if (typeof val === 'string' && val) seen.add(val)
    }
    return Array.from(seen).sort()
  }, [${ctx.dataVar ?? 'data'}])`,
    ],
  }
}

// ---------------------------------------------------------------------------
// 2. utilBreadcrumb — accessible breadcrumb trail
// ---------------------------------------------------------------------------

export const utilBreadcrumb: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const pluralTitle = ctx.entityName ? toTitle(ctx.entityName) : 'Items'
  const entitySlug = ctx.entitySlug ?? '#'
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <nav
        aria-label="Breadcrumb"
        className="bg-background border-b border-border"
      >
        <div className="container mx-auto px-4 py-2">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground list-none m-0 p-0 flex-wrap">
            <li>
              <Link
                to="/"
                className="hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
              >
                Home
              </Link>
            </li>
            <li aria-hidden="true" className="select-none opacity-40">/</li>
            <li>
              <Link
                to="/${entitySlug}"
                className="hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
              >
                ${pluralTitle}
              </Link>
            </li>
            {breadcrumbCurrent && (
              <>
                <li aria-hidden="true" className="select-none opacity-40">/</li>
                <li
                  className="text-foreground font-medium truncate max-w-[200px]"
                  aria-current="page"
                >
                  {breadcrumbCurrent}
                </li>
              </>
            )}
          </ol>
        </div>
      </nav>`,
    imports: ["import { Link } from '@tanstack/react-router'"],
    hooks: [
      // Breadcrumb current is derived from item display column or URL param
      `const breadcrumbCurrent = (${ctx.dataVar ?? 'item'} as Record<string, unknown> | undefined)?.[${ctx.displayColumn ? `'${ctx.displayColumn}'` : "'name'"}] as string | undefined`,
    ],
  }
}

// ---------------------------------------------------------------------------
// 3. utilSearchHeader — page heading + inline search input
// ---------------------------------------------------------------------------

export const utilSearchHeader: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const pluralTitle = ctx.entityName ? toTitle(ctx.entityName) : 'Items'
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)
  const searchId = `search-${ctx.tableName ?? 'items'}`

  return {
    jsx: `
      <div className="bg-background border-b border-border" role="search">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

            {/* Page heading */}
            <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)] leading-tight">
              ${pluralTitle}
            </h1>

            {/* Search field */}
            <div className="relative flex-shrink-0 w-full sm:w-64 md:w-80">
              <label
                htmlFor="${searchId}"
                className="sr-only"
              >
                Search ${pluralTitle}
              </label>
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                id="${searchId}"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ${pluralTitle.toLowerCase()}..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-[${radius}] text-foreground placeholder:text-muted-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus:border-primary"
                autoComplete="off"
                spellCheck={false}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
                  aria-label="Clear search"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>`,
    imports: ["import { useState } from 'react'"],
    hooks: ['const [search, setSearch] = useState(\'\')'],
  }
}

// ---------------------------------------------------------------------------
// 4. utilFilterTabs — horizontal tab bar for filtering/segmenting
// ---------------------------------------------------------------------------

export const utilFilterTabs: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const configFilters = ctx.config.filters as string[] | undefined
  const motion = entranceClass(ctx)

  // Static tab list: use config.filters if provided, else derive sensible defaults
  const tabs = configFilters ?? ['All', 'Recent', 'Popular']

  const tabButtons = tabs
    .map(
      (tab, i) =>
        `            <li role="presentation">
              <button
                type="button"
                onClick={() => setActiveTab('${tab}')}
                className={\`relative px-4 py-3 text-sm font-medium ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-t-sm whitespace-nowrap
                  \${activeTab === '${tab}'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
                  }\`}
                role="tab"
                aria-selected={activeTab === '${tab}'}
                aria-controls="tab-panel-${i}"
                id="tab-${i}"
              >
                ${tab}
              </button>
            </li>`,
    )
    .join('\n')

  return {
    jsx: `
      <div
        className="bg-background border-b border-border overflow-x-auto scrollbar-none"
        role="region"
        aria-label="Filter tabs"
      >
        <div className="container mx-auto px-4">
          <ul
            className="flex items-end gap-1 list-none m-0 p-0 min-w-max"
            role="tablist"
            aria-label="${ctx.entityName ? toTitle(ctx.entityName) : 'Content'} filters"
          >
${tabButtons}
          </ul>
        </div>
      </div>`,
    imports: ["import { useState } from 'react'"],
    hooks: [`const [activeTab, setActiveTab] = useState('${tabs[0] ?? 'All'}')`],
  }
}

// ---------------------------------------------------------------------------
// 5. utilEmptyState — centered empty-state message with optional CTA
// ---------------------------------------------------------------------------

export const utilEmptyState: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const message = ctx.tokens.textSlots.empty_state
  const singularTitle = ctx.entityName ? roughSingular(ctx.entityName) : 'item'
  const entitySlug = ctx.entitySlug ?? '#'
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  // Show CTA only when there is a known entity binding
  const hasCta = Boolean(ctx.entitySlug)

  return {
    jsx: `
      <section
        className="flex flex-col items-center justify-center text-center py-20 px-4"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {/* Inbox / empty icon */}
        <div
          className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6 ${motion}"
          aria-hidden="true"
        >
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4m4 0l2-2m0 0l2-2m-2 2l-2-2m2 2l2-2"
            />
          </svg>
        </div>

        {/* Message */}
        <p className="text-base text-muted-foreground max-w-sm leading-relaxed mb-6">
          ${message}
        </p>

        {/* Optional CTA */}
        ${hasCta
          ? `<Link
          to="/${entitySlug}/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-[${radius}] hover:opacity-90 ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create your first ${singularTitle}
        </Link>`
          : ''}
      </section>`,
    imports: hasCta ? ["import { Link } from '@tanstack/react-router'"] : [],
  }
}

// ---------------------------------------------------------------------------
// 6. utilPagination — numbered prev/next pagination
// ---------------------------------------------------------------------------

export const utilPagination: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const totalPages = (ctx.config.totalPages as number | undefined) ?? 5
  const radius = ctx.tokens.style.borderRadius
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <nav
        className="flex items-center justify-center py-6 px-4"
        aria-label="Pagination"
      >
        <ol className="flex items-center gap-1 list-none m-0 p-0">

          {/* Previous */}
          <li>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center justify-center w-9 h-9 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-[${radius}] disabled:opacity-30 disabled:cursor-not-allowed ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Previous page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </li>

          {/* Numbered pages */}
          {Array.from({ length: ${totalPages} }, (_, i) => i + 1).map((n) => (
            <li key={n}>
              <button
                type="button"
                onClick={() => setPage(n)}
                className={\`inline-flex items-center justify-center w-9 h-9 text-sm font-medium rounded-[${radius}] ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
                  \${page === n
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }\`}
                aria-current={page === n ? 'page' : undefined}
                aria-label={\`Page \${n}\`}
              >
                {n}
              </button>
            </li>
          ))}

          {/* Next */}
          <li>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(${totalPages}, p + 1))}
              disabled={page === ${totalPages}}
              className="inline-flex items-center justify-center w-9 h-9 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-[${radius}] disabled:opacity-30 disabled:cursor-not-allowed ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Next page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </li>

        </ol>
      </nav>`,
    imports: ["import { useState } from 'react'"],
    hooks: ['const [page, setPage] = useState(1)'],
  }
}
