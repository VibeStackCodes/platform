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
 * Visual style: serif fonts via CSS var(--font-display), max-w-4xl containers,
 * py-16 spacing — faithful to the Canape WordPress theme aesthetic but driven
 * by ctx.tokens for theming extensibility.
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
 * column, and renders each category as a serif heading followed by an itemised
 * list of name, description, and price. Matches the Canape /menu/ route style.
 */
export const domainMenuArchive: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const appName = ctx.appName

  const jsx = `<section className="max-w-4xl mx-auto px-8 py-16" aria-label="${appName} full menu">
  <h1 className="text-5xl font-[family-name:var(--font-display)] text-foreground mb-4">
    Menu
  </h1>
  <p className="text-lg text-[var(--color-muted-foreground,theme(colors.gray.700))] mb-12">
    Explore our carefully curated selection of fine dishes, featuring seasonal specialties
    and classic favourites.
  </p>

  {_menuCategories.map((cat: { name: string; items: Record<string, unknown>[] }) => (
    <div key={cat.name} className="mb-14">
      <h2 className="text-3xl font-[family-name:var(--font-display)] text-foreground mb-2">
        {cat.name}
      </h2>
      <p className="text-[var(--color-muted-foreground,theme(colors.gray.700))] italic mb-6 text-sm">
        {cat.items.length} {cat.items.length === 1 ? 'item' : 'items'}
      </p>

      <div className="space-y-6" role="list" aria-label={cat.name + ' dishes'}>
        {cat.items.map((item: Record<string, unknown>) => (
          <div key={String(item.id)} className="border-b border-border pb-6 last:border-b-0" role="listitem">
            <h3 className="text-xl font-[family-name:var(--font-display)] text-foreground">
              {String(item.name ?? '')}
            </h3>
            {!!item.description && (
              <p className="text-[var(--color-muted-foreground,theme(colors.gray.700))] mt-1 leading-relaxed">
                {String(item.description)}
              </p>
            )}
            {item.price != null && (
              <p className="text-lg font-bold text-foreground mt-2">
                \${Number(item.price).toFixed(2)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  ))}

  {_menuCategories.length === 0 && (
    <p className="text-[var(--color-muted-foreground,theme(colors.gray.700))] py-12 text-center">
      Menu coming soon.
    </p>
  )}
</section>`

  const hooks = [
    `const { data: _menuItems = [] } = useQuery({
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
 * fetches menu_items filtered by that value, and renders the filtered list with
 * name, description, and price. Matches the Canape /menu/$category/ route style.
 */
export const domainMenuCategory: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const param = paramName(ctx)

  const jsx = `<section className="max-w-4xl mx-auto px-8 py-16" aria-label={decodeURIComponent(_menuCategoryParam) + ' dishes'}>
  <h1 className="text-4xl font-[family-name:var(--font-display)] text-foreground mb-8 capitalize">
    {decodeURIComponent(_menuCategoryParam)}
  </h1>

  {_menuCategoryItems.length === 0 && !_menuCategoryLoading && (
    <p className="text-[var(--color-muted-foreground,theme(colors.gray.700))] py-12 text-center">
      No items found in this category.
    </p>
  )}

  <div className="space-y-6" role="list" aria-label={decodeURIComponent(_menuCategoryParam) + ' menu items'}>
    {(_menuCategoryItems as Record<string, unknown>[]).map((item: Record<string, unknown>) => (
      <div key={String(item.id)} className="border-b border-border pb-6 last:border-b-0" role="listitem">
        <h3 className="text-xl font-[family-name:var(--font-display)] text-foreground">
          {String(item.name ?? '')}
        </h3>
        {!!item.description && (
          <p className="text-[var(--color-muted-foreground,theme(colors.gray.700))] mt-1 leading-relaxed">
            {String(item.description)}
          </p>
        )}
        {item.price != null && (
          <p className="text-lg font-bold text-foreground mt-2">
            \${Number(item.price).toFixed(2)}
          </p>
        )}
      </div>
    ))}
  </div>

  {/* Category navigation shortcuts */}
  <nav className="flex flex-wrap gap-4 text-sm mt-12 pt-6 border-t border-border" aria-label="Menu categories">
    <a href="/menu/appetizers/" className="text-primary hover:underline">Appetizers</a>
    <a href="/menu/mains/" className="text-primary hover:underline">Mains</a>
    <a href="/menu/desserts/" className="text-primary hover:underline">Desserts</a>
    <a href="/menu/beverages/" className="text-primary hover:underline">Beverages</a>
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
 * A complete restaurant reservation form with name, email, phone, party size
 * (1-8 select), date, time, and special requests (textarea). On submit it
 * INSERTs a row into the `reservations` table via supabase, shows a success
 * message, then resets the form after 3 seconds. All labels are linked to
 * inputs via htmlFor/id for full accessibility compliance.
 */
export const domainReservationForm: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const appName = ctx.appName

  const jsx = `<section className="max-w-4xl mx-auto px-8 py-16" aria-label="Make a reservation at ${appName}">
  <h1 className="text-4xl font-[family-name:var(--font-display)] text-foreground mb-4">
    Reservations
  </h1>
  <p className="text-lg text-[var(--color-muted-foreground,theme(colors.gray.700))] mb-10">
    Reserve your table online or call us directly. We look forward to serving you!
  </p>

  {_resSubmitted ? (
    <div
      className="bg-green-50 border border-green-200 text-green-800 p-6 rounded-lg mb-8"
      role="status"
      aria-live="polite"
    >
      <p className="text-lg font-semibold">&#10003; Reservation received!</p>
      <p className="mt-1 text-sm">Thank you — we will confirm your booking shortly.</p>
    </div>
  ) : null}

  <form
    onSubmit={_resHandleSubmit}
    className="space-y-6"
    aria-label="Reservation form"
    noValidate
  >
    {/* Name */}
    <div>
      <label htmlFor="res-name" className="block text-sm font-medium text-foreground mb-1">
        Name <span aria-hidden="true" className="text-red-500">*</span>
      </label>
      <input
        id="res-name"
        type="text"
        value={_resFormData.name}
        onChange={(e) => _setResFormData({ ..._resFormData, name: e.target.value })}
        className="w-full px-4 py-2 border border-border rounded bg-background text-foreground placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Your full name"
        required
        aria-required="true"
        autoComplete="name"
      />
    </div>

    {/* Email */}
    <div>
      <label htmlFor="res-email" className="block text-sm font-medium text-foreground mb-1">
        Email <span aria-hidden="true" className="text-red-500">*</span>
      </label>
      <input
        id="res-email"
        type="email"
        value={_resFormData.email}
        onChange={(e) => _setResFormData({ ..._resFormData, email: e.target.value })}
        className="w-full px-4 py-2 border border-border rounded bg-background text-foreground placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="you@example.com"
        required
        aria-required="true"
        autoComplete="email"
      />
    </div>

    {/* Phone + Party size */}
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <label htmlFor="res-phone" className="block text-sm font-medium text-foreground mb-1">
          Phone
        </label>
        <input
          id="res-phone"
          type="tel"
          value={_resFormData.phone}
          onChange={(e) => _setResFormData({ ..._resFormData, phone: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded bg-background text-foreground placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="+1 555 123 4567"
          autoComplete="tel"
        />
      </div>

      <div>
        <label htmlFor="res-party-size" className="block text-sm font-medium text-foreground mb-1">
          Party size <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <select
          id="res-party-size"
          value={_resFormData.party_size}
          onChange={(e) => _setResFormData({ ..._resFormData, party_size: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
    </div>

    {/* Date + Time */}
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <label htmlFor="res-date" className="block text-sm font-medium text-foreground mb-1">
          Date <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <input
          id="res-date"
          type="date"
          value={_resFormData.date}
          onChange={(e) => _setResFormData({ ..._resFormData, date: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
          aria-required="true"
        />
      </div>

      <div>
        <label htmlFor="res-time" className="block text-sm font-medium text-foreground mb-1">
          Time <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <input
          id="res-time"
          type="time"
          value={_resFormData.time}
          onChange={(e) => _setResFormData({ ..._resFormData, time: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
          aria-required="true"
        />
      </div>
    </div>

    {/* Special requests */}
    <div>
      <label htmlFor="res-requests" className="block text-sm font-medium text-foreground mb-1">
        Special requests
      </label>
      <textarea
        id="res-requests"
        value={_resFormData.requests}
        onChange={(e) => _setResFormData({ ..._resFormData, requests: e.target.value })}
        className="w-full px-4 py-2 border border-border rounded bg-background text-foreground placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-ring"
        rows={4}
        placeholder="Dietary requirements, special occasions, accessibility needs…"
        aria-describedby="res-requests-hint"
      />
      <p id="res-requests-hint" className="mt-1 text-xs text-[var(--color-muted-foreground,theme(colors.gray.500))]">
        Optional — let us know about any dietary requirements or special occasions.
      </p>
    </div>

    {_resError && (
      <p className="text-red-600 text-sm" role="alert">
        {_resError}
      </p>
    )}

    <button
      type="submit"
      disabled={_resSubmitting}
      className="w-full px-6 py-3 bg-foreground text-background rounded font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      aria-busy={_resSubmitting}
    >
      {_resSubmitting ? 'Sending…' : 'Reserve Table'}
    </button>
  </form>
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
    ],
    hooks,
  }
}

// ---------------------------------------------------------------------------
// Section 4: domainServicesList — services_page table as a linked list
// ---------------------------------------------------------------------------

/**
 * domainServicesList (id: domain-services-list)
 *
 * Fetches all rows from `services_page` ordered by `order_index` and renders
 * them as a simple labelled list of anchor links (service.name → service.url).
 * Used in homepage sidebars and dedicated services pages in the Canape theme.
 */
export const domainServicesList: SectionRenderer = (ctx: SectionContext): SectionOutput => {
  const headline = (ctx.config.headline as string) || 'Our Services'
  const appName = ctx.appName

  const jsx = `<section className="max-w-4xl mx-auto px-8 py-16" aria-label="${appName} services">
  <h2 className="text-3xl font-[family-name:var(--font-display)] text-foreground mb-6">
    ${headline}
  </h2>

  {_servicesList.length === 0 ? (
    <p className="text-[var(--color-muted-foreground,theme(colors.gray.700))]">
      No services listed yet.
    </p>
  ) : (
    <ul className="space-y-3" role="list" aria-label="${headline}">
      {(_servicesList as Record<string, unknown>[]).map((service: Record<string, unknown>) => (
        <li key={String(service.id)} role="listitem">
          <a
            href={String(service.url ?? '#')}
            className="text-primary hover:underline font-medium transition-colors"
            rel="noopener noreferrer"
          >
            {String(service.name ?? '')}
          </a>
        </li>
      ))}
    </ul>
  )}
</section>`

  const hooks = [
    `const { data: _servicesList = [] } = useQuery({
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
    ],
    hooks,
  }
}
