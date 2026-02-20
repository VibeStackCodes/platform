/**
 * Domain-Specific Section Renderers — Restaurant (Canape)
 *
 * These 4 section renderers are domain-specific to the restaurant/Canape theme.
 * They cannot be expressed with the generic section set because they depend on
 * fixed table names (menu_items, reservations, services_page) and restaurant-
 * specific UX patterns (category-grouped menus, reservation forms with party
 * size selectors, filtered menu views by URL param).
 *
 * Each renderer follows the SectionRenderer signature: (ctx: SectionContext) => SectionOutput
 * and produces self-contained JSX fragments that include their own hooks and
 * import declarations. The page assembler deduplicates imports before writing
 * the final route file.
 *
 * Visual style: shadcn Card/Badge/Skeleton/Input/Label/Button primitives,
 * serif fonts via CSS var(--font-display), max-w-4xl containers, py-16 spacing —
 * faithful to the Canape WordPress theme aesthetic but driven by ctx.tokens for
 * theming extensibility.
 *
 * Lucide icons used:
 *   UtensilsCrossed — menu section headers
 *   Calendar        — reservation date field
 *   Clock           — reservation time field
 *   Users           — reservation party-size field
 *   ExternalLink    — outbound service links
 *   ArrowRight      — category navigation shortcuts
 */

import type { SectionContext, SectionOutput, SectionRenderer } from './types'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Resolve the URL parameter name from config, defaulting to 'category' */
function paramName(ctx: SectionContext): string {
  const raw = ctx.config.paramName
  return typeof raw === 'string' && raw.length > 0 ? raw : 'category'
}

// ---------------------------------------------------------------------------
// Section 1: domainMenuArchive — full menu grouped by category
// ---------------------------------------------------------------------------

/**
 * domainMenuArchive (id: domain-menu-archive)
 *
 * Fetches all rows from `menu_items`, groups them client-side by the `category`
 * column, and renders each category inside a shadcn Card with a Badge showing
 * the item count. Each menu item row uses hover:bg-muted/50 transition, a
 * Separator between items, and a secondary Badge for the price. Shows a
 * Skeleton loading state (2 group skeletons × 3 item rows each) while the
 * TanStack Query fetch is in-flight. Matches the Canape /menu/ route style.
 */
export const domainMenuArchive: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const appName = ctx.appName

  const jsx = `<section className="max-w-4xl mx-auto px-8 py-16" aria-label="${appName} full menu">
  {/* Page header */}
  <div className="flex items-center gap-3 mb-4">
    <UtensilsCrossed className="size-8 text-foreground" aria-hidden="true" />
    <h1 className="text-5xl font-[family-name:var(--font-display)] text-foreground">
      Menu
    </h1>
  </div>
  <p className="text-lg text-muted-foreground mb-12">
    Explore our carefully curated selection of fine dishes, featuring seasonal specialties
    and classic favourites.
  </p>

  {/* Skeleton loading state */}
  {_menuItemsLoading && (
    <div className="space-y-10" role="status" aria-busy="true" aria-label="Loading menu">
      {[0, 1].map((skIdx) => (
        <div key={skIdx}>
          <div className="flex items-center gap-4 mb-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Card className="p-6">
            <div className="space-y-0" role="list">
              {[0, 1, 2].map((rowIdx) => (
                <div key={rowIdx}>
                  <div className="py-5">
                    <Skeleton className="h-5 w-1/3 mb-2" />
                    <Skeleton className="h-4 w-2/3 mb-3" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  {rowIdx < 2 && <Separator />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      ))}
    </div>
  )}

  {/* Populated menu grouped by category */}
  {!_menuItemsLoading && _menuCategories.map((cat: { name: string; items: Record<string, unknown>[] }) => (
    <div key={cat.name} className="mb-14">
      {/* Category heading + item count badge */}
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-3xl font-[family-name:var(--font-display)] text-foreground">
          {cat.name}
        </h2>
        <Badge variant="secondary">
          {cat.items.length} {cat.items.length === 1 ? 'item' : 'items'}
        </Badge>
      </div>

      <Card className="p-6">
        <div className="space-y-0" role="list" aria-label={cat.name + ' dishes'}>
          {cat.items.map((item: Record<string, unknown>, idx: number) => (
            <div key={String(item.id)}>
              <div
                className="py-5 hover:bg-muted/50 transition-colors rounded-sm -mx-2 px-2"
                role="listitem"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-[family-name:var(--font-display)] text-foreground">
                      {String(item.name ?? '')}
                    </h3>
                    {!!item.description && (
                      <p className="text-muted-foreground mt-1 leading-relaxed">
                        {String(item.description)}
                      </p>
                    )}
                  </div>
                  {item.price != null && (
                    <Badge variant="secondary" className="shrink-0 text-base font-semibold tabular-nums">
                      \${Number(item.price).toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
              {idx < cat.items.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  ))}

  {/* Empty state — no menu items returned */}
  {!_menuItemsLoading && _menuCategories.length === 0 && (
    <p className="text-muted-foreground py-12 text-center" role="status">
      Menu coming soon.
    </p>
  )}
</section>`

  const hooks = [
    `const { data: _menuItems = [], isLoading: _menuItemsLoading } = useQuery({
    queryKey: ['menu_items', 'all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .order('category')
        .order('name')
      return data ?? []
    },
  })`,
    // Group by category client-side — deterministic, no extra query
    `const _menuCategories: { name: string; items: Record<string, unknown>[] }[] =
    (_menuItems as Record<string, unknown>[]).reduce(
      (acc: { name: string; items: Record<string, unknown>[] }[], item: Record<string, unknown>) => {
        const cat = String(item.category ?? 'Other')
        const existing = acc.find((c) => c.name === cat)
        if (existing) {
          existing.items.push(item)
        } else {
          acc.push({ name: cat, items: [item] })
        }
        return acc
      },
      [],
    )`,
  ]

  return {
    jsx,
    imports: [
      "import { useQuery } from '@tanstack/react-query'",
      "import { supabase } from '@/lib/supabase'",
      "import { Card } from '@/components/ui/card'",
      "import { Badge } from '@/components/ui/badge'",
      "import { Skeleton } from '@/components/ui/skeleton'",
      "import { Separator } from '@/components/ui/separator'",
      "import { UtensilsCrossed } from 'lucide-react'",
    ],
    hooks,
  }
}

// ---------------------------------------------------------------------------
// Section 2: domainMenuCategory — filtered menu items by URL param
// ---------------------------------------------------------------------------

/**
 * domainMenuCategory (id: domain-menu-category)
 *
 * Reads the URL parameter named by `ctx.config.paramName` (default: 'category'),
 * fetches menu_items filtered by that value, and renders the filtered list
 * inside a shadcn Card. The category name is surfaced in a prominent Badge
 * header. Each item shows name, description, and a price Badge. Category
 * navigation shortcuts use `<Button variant="outline">` + ArrowRight icon.
 * Skeleton loading state covers 4 item rows. Matches the Canape /menu/$category/
 * route style.
 */
export const domainMenuCategory: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const param = paramName(ctx)

  const jsx = `<section
  className="max-w-4xl mx-auto px-8 py-16"
  aria-label={decodeURIComponent(_menuCategoryParam) + ' dishes'}
>
  {/* Category heading badge */}
  <div className="mb-8">
    <Badge className="text-sm mb-4">
      <UtensilsCrossed className="size-3.5 mr-1.5" aria-hidden="true" />
      {decodeURIComponent(_menuCategoryParam)}
    </Badge>
    <h1 className="text-4xl font-[family-name:var(--font-display)] text-foreground capitalize">
      {decodeURIComponent(_menuCategoryParam)}
    </h1>
  </div>

  {/* Skeleton loading state */}
  {_menuCategoryLoading && (
    <Card className="p-6" role="status" aria-busy="true" aria-label="Loading menu items">
      <div className="space-y-0" role="list">
        {[0, 1, 2, 3].map((skIdx) => (
          <div key={skIdx}>
            <div className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-2/5" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full shrink-0" />
              </div>
            </div>
            {skIdx < 3 && <Separator />}
          </div>
        ))}
      </div>
    </Card>
  )}

  {/* Populated item list */}
  {!_menuCategoryLoading && _menuCategoryItems.length > 0 && (
    <Card className="p-6">
      <div
        className="space-y-0"
        role="list"
        aria-label={decodeURIComponent(_menuCategoryParam) + ' menu items'}
      >
        {(_menuCategoryItems as Record<string, unknown>[]).map(
          (item: Record<string, unknown>, idx: number) => (
            <div key={String(item.id)}>
              <div
                className="py-5 hover:bg-muted/50 transition-colors rounded-sm -mx-2 px-2"
                role="listitem"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-[family-name:var(--font-display)] text-foreground">
                      {String(item.name ?? '')}
                    </h3>
                    {!!item.description && (
                      <p className="text-muted-foreground mt-1 leading-relaxed">
                        {String(item.description)}
                      </p>
                    )}
                  </div>
                  {item.price != null && (
                    <Badge variant="secondary" className="shrink-0 text-base font-semibold tabular-nums">
                      \${Number(item.price).toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
              {idx < (_menuCategoryItems as Record<string, unknown>[]).length - 1 && <Separator />}
            </div>
          ),
        )}
      </div>
    </Card>
  )}

  {/* Empty state */}
  {!_menuCategoryLoading && _menuCategoryItems.length === 0 && (
    <p className="text-muted-foreground py-12 text-center" role="status">
      No items found in this category.
    </p>
  )}

  {/* Category navigation shortcuts */}
  <nav
    className="flex flex-wrap gap-3 mt-12 pt-6 border-t border-border"
    aria-label="Menu categories"
  >
    {['Appetizers', 'Mains', 'Desserts', 'Beverages'].map((cat) => (
      <a key={cat} href={'/menu/' + cat.toLowerCase() + '/'} className="inline-flex">
        <Button variant="outline" size="sm" className="gap-1.5">
          {cat}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </a>
    ))}
  </nav>
</section>`

  const hooks = [
    `const { ${param}: _menuCategoryParam = '' } = useParams({ strict: false })`,
    `const { data: _menuCategoryItems = [], isLoading: _menuCategoryLoading } = useQuery({
    queryKey: ['menu_items', 'category', _menuCategoryParam],
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category', decodeURIComponent(_menuCategoryParam))
        .order('name')
      return data ?? []
    },
    enabled: !!_menuCategoryParam,
  })`,
  ]

  return {
    jsx,
    imports: [
      "import { useQuery } from '@tanstack/react-query'",
      "import { supabase } from '@/lib/supabase'",
      "import { useParams } from '@tanstack/react-router'",
      "import { Card } from '@/components/ui/card'",
      "import { Badge } from '@/components/ui/badge'",
      "import { Skeleton } from '@/components/ui/skeleton'",
      "import { Separator } from '@/components/ui/separator'",
      "import { Button } from '@/components/ui/button'",
      "import { UtensilsCrossed, ArrowRight } from 'lucide-react'",
    ],
    hooks,
  }
}

// ---------------------------------------------------------------------------
// Section 3: domainReservationForm — full restaurant reservation form
// ---------------------------------------------------------------------------

/**
 * domainReservationForm (id: domain-reservation-form)
 *
 * A complete restaurant reservation form wrapped in a shadcn Card. All text /
 * email / phone inputs use shadcn `<Input>`, all labels use shadcn `<Label>`,
 * the submit button uses shadcn `<Button>`. Lucide Calendar, Clock, and Users
 * icons decorate the date, time, and party-size fields respectively. A
 * Separator divides the contact block from the booking block. On submit it
 * INSERTs a row into the `reservations` table via supabase, shows a success
 * message (bg-emerald-50 / dark compatible), then resets the form after 3 s.
 * All labels are linked to inputs via htmlFor/id for full accessibility.
 */
export const domainReservationForm: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const appName = ctx.appName

  const jsx = `<section className="max-w-2xl mx-auto px-8 py-16" aria-label="Make a reservation at ${appName}">
  <h1 className="text-4xl font-[family-name:var(--font-display)] text-foreground mb-4">
    Reservations
  </h1>
  <p className="text-lg text-muted-foreground mb-10">
    Reserve your table online or call us directly. We look forward to serving you!
  </p>

  {/* Success message */}
  {_resSubmitted && (
    <div
      className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 p-6 rounded-lg mb-8"
      role="status"
      aria-live="polite"
    >
      <p className="text-lg font-semibold">&#10003; Reservation received!</p>
      <p className="mt-1 text-sm">Thank you — we will confirm your booking shortly.</p>
    </div>
  )}

  <Card className="p-8">
    <form
      onSubmit={_resHandleSubmit}
      className="space-y-6"
      aria-label="Reservation form"
      aria-busy={_resSubmitting}
      noValidate
    >
      {/* --- Contact details --- */}
      <div className="space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="res-name">
            Name <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <Input
            id="res-name"
            type="text"
            value={_resFormData.name}
            onChange={(e) => _setResFormData({ ..._resFormData, name: e.target.value })}
            placeholder="Your full name"
            required
            aria-required="true"
            autoComplete="name"
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="res-email">
            Email <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <Input
            id="res-email"
            type="email"
            value={_resFormData.email}
            onChange={(e) => _setResFormData({ ..._resFormData, email: e.target.value })}
            placeholder="you@example.com"
            required
            aria-required="true"
            autoComplete="email"
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="res-phone">Phone</Label>
          <Input
            id="res-phone"
            type="tel"
            value={_resFormData.phone}
            onChange={(e) => _setResFormData({ ..._resFormData, phone: e.target.value })}
            placeholder="+1 555 123 4567"
            autoComplete="tel"
          />
        </div>
      </div>

      <Separator />

      {/* --- Booking details --- */}
      <div className="space-y-5">
        {/* Party size */}
        <div className="space-y-1.5">
          <Label htmlFor="res-party-size" className="flex items-center gap-1.5">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            Party size <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <select
            id="res-party-size"
            value={_resFormData.party_size}
            onChange={(e) => _setResFormData({ ..._resFormData, party_size: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            required
            aria-required="true"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'person' : 'people'}
              </option>
            ))}
          </select>
        </div>

        {/* Date + Time in a 2-col grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="res-date" className="flex items-center gap-1.5">
              <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
              Date <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Input
              id="res-date"
              type="date"
              value={_resFormData.date}
              onChange={(e) => _setResFormData({ ..._resFormData, date: e.target.value })}
              required
              aria-required="true"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="res-time" className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
              Time <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Input
              id="res-time"
              type="time"
              value={_resFormData.time}
              onChange={(e) => _setResFormData({ ..._resFormData, time: e.target.value })}
              required
              aria-required="true"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Special requests */}
      <div className="space-y-1.5">
        <Label htmlFor="res-requests">Special requests</Label>
        <textarea
          id="res-requests"
          value={_resFormData.requests}
          onChange={(e) => _setResFormData({ ..._resFormData, requests: e.target.value })}
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          rows={4}
          placeholder="Dietary requirements, special occasions, accessibility needs\u2026"
          aria-describedby="res-requests-hint"
        />
        <p id="res-requests-hint" className="text-xs text-muted-foreground">
          Optional — let us know about any dietary requirements or special occasions.
        </p>
      </div>

      {/* Inline error */}
      {_resError && (
        <p className="text-sm text-destructive" role="alert">
          {_resError}
        </p>
      )}

      <Button
        type="submit"
        disabled={_resSubmitting}
        className="w-full"
        size="lg"
        aria-busy={_resSubmitting}
      >
        {_resSubmitting ? 'Sending\u2026' : 'Reserve Table'}
      </Button>
    </form>
  </Card>
</section>`

  const hooks = [
    `const [_resFormData, _setResFormData] = useState({
    name: '',
    email: '',
    phone: '',
    party_size: '2',
    date: '',
    time: '',
    requests: '',
  })`,
    `const [_resSubmitted, _setResSubmitted] = useState(false)`,
    `const [_resSubmitting, _setResSubmitting] = useState(false)`,
    `const [_resError, _setResError] = useState<string | null>(null)`,
    `const _resHandleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    _setResSubmitting(true)
    _setResError(null)
    try {
      const { error } = await supabase.from('reservations').insert({
        name: _resFormData.name,
        email: _resFormData.email,
        phone: _resFormData.phone || null,
        party_size: parseInt(_resFormData.party_size, 10),
        date: _resFormData.date,
        time: _resFormData.time,
        requests: _resFormData.requests || null,
      })
      if (error) throw error
      _setResSubmitted(true)
      setTimeout(() => {
        _setResSubmitted(false)
        _setResFormData({ name: '', email: '', phone: '', party_size: '2', date: '', time: '', requests: '' })
      }, 3000)
    } catch (err) {
      _setResError(err instanceof Error ? err.message : 'Failed to submit reservation. Please try again.')
    } finally {
      _setResSubmitting(false)
    }
  }`,
  ]

  return {
    jsx,
    imports: [
      "import { useState } from 'react'",
      "import { supabase } from '@/lib/supabase'",
      "import { Card } from '@/components/ui/card'",
      "import { Input } from '@/components/ui/input'",
      "import { Label } from '@/components/ui/label'",
      "import { Button } from '@/components/ui/button'",
      "import { Separator } from '@/components/ui/separator'",
      "import { Calendar, Clock, Users } from 'lucide-react'",
    ],
    hooks,
  }
}

// ---------------------------------------------------------------------------
// Section 4: domainServicesList — services_page table as a linked card list
// ---------------------------------------------------------------------------

/**
 * domainServicesList (id: domain-services-list)
 *
 * Fetches all rows from `services_page` ordered by `order_index` and renders
 * each service as a shadcn Card containing a `<Button variant="link">` with a
 * Lucide ExternalLink icon. Shows a Skeleton loading state (4 rows) while the
 * query is in-flight. Used in homepage sidebars and dedicated services pages
 * in the Canape theme.
 */
export const domainServicesList: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || 'Our Services'
  const appName = ctx.appName

  const jsx = `<section className="max-w-4xl mx-auto px-8 py-16" aria-label="${appName} services">
  <h2 className="text-3xl font-[family-name:var(--font-display)] text-foreground mb-6">
    ${headline}
  </h2>

  {/* Skeleton loading state */}
  {_servicesLoading && (
    <ul className="space-y-3" role="list" aria-busy="true" aria-label="Loading services">
      {[0, 1, 2, 3].map((skIdx) => (
        <li key={skIdx}>
          <Card className="p-4">
            <Skeleton className="h-5 w-48" />
          </Card>
        </li>
      ))}
    </ul>
  )}

  {/* Populated services list */}
  {!_servicesLoading && _servicesList.length > 0 && (
    <ul className="space-y-3" role="list" aria-label="${headline}">
      {(_servicesList as Record<string, unknown>[]).map((service: Record<string, unknown>) => (
        <li key={String(service.id)} role="listitem">
          <Card className="p-4 hover:bg-muted/50 transition-colors">
            <Button
              variant="link"
              className="p-0 h-auto font-medium text-base justify-start gap-2 w-full"
              asChild
            >
              <a
                href={String(service.url ?? '#')}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={String(service.name ?? '') + ' (opens in new tab)'}
              >
                {String(service.name ?? '')}
                <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              </a>
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  )}

  {/* Empty state */}
  {!_servicesLoading && _servicesList.length === 0 && (
    <p className="text-muted-foreground" role="status">
      No services listed yet.
    </p>
  )}
</section>`

  const hooks = [
    `const { data: _servicesList = [], isLoading: _servicesLoading } = useQuery({
    queryKey: ['services_page'],
    queryFn: async () => {
      const { data } = await supabase
        .from('services_page')
        .select('*')
        .order('order_index', { ascending: true })
      return data ?? []
    },
  })`,
  ]

  return {
    jsx,
    imports: [
      "import { useQuery } from '@tanstack/react-query'",
      "import { supabase } from '@/lib/supabase'",
      "import { Card } from '@/components/ui/card'",
      "import { Button } from '@/components/ui/button'",
      "import { Skeleton } from '@/components/ui/skeleton'",
      "import { ExternalLink } from 'lucide-react'",
    ],
    hooks,
  }
}
