/**
 * Utility Section Renderers (6)
 *
 * Each renderer is a pure function (SectionContext) => SectionOutput producing
 * a self-contained JSX fragment string. These utility sections augment entity
 * grid/detail pages with filtering, pagination, search, and navigation aids.
 *
 * Visual taxonomy:
 *   utilCategoryScroll — horizontal scrolling Badge chip filter row (shadcn Badge)
 *   utilBreadcrumb     — aria breadcrumb trail with Lucide ChevronRight + Home
 *   utilSearchHeader   — page heading + shadcn Input with Search/X Lucide icons
 *   utilFilterTabs     — shadcn Tabs (TabsList + TabsTrigger)
 *   utilEmptyState     — centered empty state with Lucide Inbox icon + shadcn Button CTA
 *   utilPagination     — shadcn Button prev/next + page number pagination
 */

import type { SectionRenderer, SectionOutput, SectionContext } from './types'
import { resolveBg, resolveSpacing } from './primitives'

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

/** tw-animate-css transition class when motion is enabled */
function entranceClass(ctx: SectionContext): string {
  return ctx.tokens.style.motion !== 'none' ? 'transition-all duration-200 ease-out' : ''
}

// ---------------------------------------------------------------------------
// 1. utilCategoryScroll — horizontal scrolling Badge chip filter row
// ---------------------------------------------------------------------------

export const utilCategoryScroll: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const bg = resolveBg(ctx.config)
  const categoryColumn =
    (ctx.config.categoryColumn as string | undefined) ??
    ctx.metadataColumns?.[0] ??
    'category'
  const motion = entranceClass(ctx)

  // The chip list is data-driven at runtime — we render the query + map here
  return {
    jsx: `
      <div className="${bg} border-b border-border" role="region" aria-label="Filter by category">
        <div className="container mx-auto px-4">
          <div
            className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-none"
            role="list"
            aria-label="Category filters"
          >
            {/* All chip */}
            <Badge
              variant={activeCategory === null ? 'default' : 'outline'}
              onClick={() => setActiveCategory(null)}
              className={\`flex-shrink-0 cursor-pointer ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none\`}
              role="listitem"
              aria-pressed={activeCategory === null}
            >
              All
            </Badge>

            {/* Dynamic category chips from data */}
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={activeCategory === cat ? 'default' : 'outline'}
                onClick={() => setActiveCategory(cat)}
                className={\`flex-shrink-0 cursor-pointer ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none\`}
                role="listitem"
                aria-pressed={activeCategory === cat}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      </div>`,
    imports: [
      "import { useState, useMemo } from 'react'",
      "import { Badge } from '@/components/ui/badge'",
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
// 2. utilBreadcrumb — accessible breadcrumb trail with Lucide icons
// ---------------------------------------------------------------------------

export const utilBreadcrumb: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const bg = resolveBg(ctx.config)
  const pluralTitle = ctx.entityName ? toTitle(ctx.entityName) : 'Items'
  const entitySlug = ctx.entitySlug ?? '#'
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <nav
        aria-label="Breadcrumb"
        className="${bg} border-b border-border"
      >
        <div className="container mx-auto px-4 py-2">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground list-none m-0 p-0 flex-wrap">
            <li>
              <Link
                to="/"
                className="inline-flex items-center gap-1 hover:text-foreground ${motion} focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
              >
                <Home className="size-4" aria-hidden="true" />
                <span className="sr-only">Home</span>
              </Link>
            </li>
            <li aria-hidden="true" className="select-none opacity-40">
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </li>
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
                <li aria-hidden="true" className="select-none opacity-40">
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </li>
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
    imports: [
      "import { Link } from '@tanstack/react-router'",
      "import { ChevronRight, Home } from 'lucide-react'",
    ],
    hooks: [
      // Breadcrumb current is derived from item display column or URL param
      `const breadcrumbCurrent = (${ctx.dataVar ?? 'item'} as Record<string, unknown> | undefined)?.[${ctx.displayColumn ? `'${ctx.displayColumn}'` : "'name'"}] as string | undefined`,
    ],
  }
}

// ---------------------------------------------------------------------------
// 3. utilSearchHeader — page heading + shadcn Input with Lucide Search/X
// ---------------------------------------------------------------------------

export const utilSearchHeader: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const bg = resolveBg(ctx.config)
  const pluralTitle = ctx.entityName ? toTitle(ctx.entityName) : 'Items'
  const motion = entranceClass(ctx)
  const searchId = `search-${ctx.tableName ?? 'items'}`

  return {
    jsx: `
      <div className="${bg} border-b border-border" role="search">
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
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                id="${searchId}"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ${pluralTitle.toLowerCase()}..."
                className={\`pl-9 \${search ? 'pr-9' : 'pr-3'} ${motion}\`}
                autoComplete="off"
                spellCheck={false}
              />
              {search && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearch('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>`,
    imports: [
      "import { useState } from 'react'",
      "import { Input } from '@/components/ui/input'",
      "import { Button } from '@/components/ui/button'",
      "import { Search, X } from 'lucide-react'",
    ],
    hooks: ['const [search, setSearch] = useState(\'\')'],
  }
}

// ---------------------------------------------------------------------------
// 4. utilFilterTabs — shadcn Tabs (TabsList + TabsTrigger)
// ---------------------------------------------------------------------------

export const utilFilterTabs: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const bg = resolveBg(ctx.config)
  const configFilters = ctx.config.filters as string[] | undefined

  // Static tab list: use config.filters if provided, else derive sensible defaults
  const tabs = configFilters ?? ['All', 'Recent', 'Popular']

  const tabTriggers = tabs
    .map(
      (tab) =>
        `            <TabsTrigger value="${tab}" onClick={() => setActiveTab('${tab}')}>
              ${tab}
            </TabsTrigger>`,
    )
    .join('\n')

  return {
    jsx: `
      <div
        className="${bg} border-b border-border overflow-x-auto scrollbar-none"
        role="region"
        aria-label="${ctx.entityName ? toTitle(ctx.entityName) : 'Content'} filters"
      >
        <div className="container mx-auto px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="h-auto rounded-none bg-transparent border-b-0 p-0 gap-1">
${tabTriggers}
            </TabsList>
          </Tabs>
        </div>
      </div>`,
    imports: [
      "import { useState } from 'react'",
      "import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'",
    ],
    hooks: [`const [activeTab, setActiveTab] = useState('${tabs[0] ?? 'All'}')`],
  }
}

// ---------------------------------------------------------------------------
// 5. utilEmptyState — centered empty-state with Lucide Inbox + shadcn Button
// ---------------------------------------------------------------------------

export const utilEmptyState: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const bg = resolveBg(ctx.config)
  const spacing = resolveSpacing(ctx.config)
  const message = ctx.tokens.textSlots.empty_state
  const singularTitle = ctx.entityName ? roughSingular(ctx.entityName) : 'item'
  const entitySlug = ctx.entitySlug ?? '#'
  const motion = entranceClass(ctx)

  // Show CTA only when there is a known entity binding
  const hasCta = Boolean(ctx.entitySlug)

  const imports: string[] = [
    hasCta ? "import { Inbox, Plus } from 'lucide-react'" : "import { Inbox } from 'lucide-react'",
    "import { Button } from '@/components/ui/button'",
  ]

  if (hasCta) {
    imports.push("import { Link } from '@tanstack/react-router'")
  }

  return {
    jsx: `
      <section
        className="${bg} flex flex-col items-center justify-center text-center ${spacing} px-4"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        {/* Inbox icon from Lucide */}
        <div
          className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6 ${motion}"
          aria-hidden="true"
        >
          <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
        </div>

        {/* Message */}
        <p className="text-base text-muted-foreground max-w-sm leading-relaxed mb-6">
          ${message}
        </p>

        {/* Optional CTA */}
        ${hasCta
          ? `<Button asChild className="${motion}">
          <Link to="/${entitySlug}/new">
            <Plus className="size-4 mr-2" aria-hidden="true" />
            Create your first ${singularTitle}
          </Link>
        </Button>`
          : ''}
      </section>`,
    imports,
  }
}

// ---------------------------------------------------------------------------
// 6. utilPagination — shadcn Button prev/next + page number pagination
// ---------------------------------------------------------------------------

export const utilPagination: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const totalPages = (ctx.config.totalPages as number | undefined) ?? 5
  const motion = entranceClass(ctx)

  return {
    jsx: `
      <nav
        className="flex items-center justify-center gap-1 py-6 px-4"
        aria-label="Pagination"
      >
        {/* Previous */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className={\`${motion}\`}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>

        {/* Numbered pages */}
        {Array.from({ length: ${totalPages} }, (_, i) => i + 1).map((n) => (
          <Button
            key={n}
            type="button"
            variant={page === n ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setPage(n)}
            className={\`${motion}\`}
            aria-current={page === n ? 'page' : undefined}
            aria-label={\`Page \${n}\`}
          >
            {n}
          </Button>
        ))}

        {/* Next */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setPage((p) => Math.min(${totalPages}, p + 1))}
          disabled={page === ${totalPages}}
          className={\`${motion}\`}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </nav>`,
    imports: [
      "import { useState } from 'react'",
      "import { Button } from '@/components/ui/button'",
      "import { ChevronLeft, ChevronRight } from 'lucide-react'",
    ],
    hooks: ['const [page, setPage] = useState(1)'],
  }
}
