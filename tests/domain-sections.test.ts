/**
 * Domain-Restaurant Section Renderer Tests
 *
 * Covers the 4 domain-specific section renderers in
 * server/lib/sections/domain-restaurant.ts:
 *
 *   - domainMenuArchive   (id: domain-menu-archive)
 *   - domainMenuCategory  (id: domain-menu-category)
 *   - domainReservationForm (id: domain-reservation-form)
 *   - domainServicesList  (id: domain-services-list)
 *
 * Each renderer produces a SectionOutput { jsx, imports, hooks } that the
 * page assembler embeds into TanStack Router route files for the Canape theme.
 * Tests verify behaviour (data references, a11y, URL params) — NOT internals.
 */

import { describe, it, expect } from 'vitest'
import type { SectionContext } from '@server/lib/sections/types'
import type { ThemeTokens } from '@server/lib/themed-code-engine'
import {
  domainMenuArchive,
  domainMenuCategory,
  domainReservationForm,
  domainServicesList,
} from '@server/lib/sections/domain-restaurant'

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const canapeTokens: ThemeTokens = {
  name: 'canape',
  fonts: {
    display: 'Playfair Display',
    body: 'Source Sans Pro',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap',
  },
  colors: {
    background: '#ffffff',
    foreground: '#1a1a1a',
    text: '#1a1a1a',
    primary: '#2563eb',
    primaryForeground: '#ffffff',
    secondary: '#f3f4f6',
    accent: '#dc2626',
    muted: '#f3f4f6',
    border: '#e5e7eb',
  },
  style: {
    borderRadius: '0.375rem',
    cardStyle: 'elevated',
    navStyle: 'editorial',
    heroLayout: 'editorial',
    spacing: 'normal',
    motion: 'subtle',
    imagery: 'photography-heavy',
  },
  aestheticDirection: 'warm-neutral' as const,
  layoutStrategy: 'full-bleed' as const,
  signatureDetail: 'Subtle scroll-triggered reveal animations on content sections',
  imageManifest: {},
  authPosture: 'public',
  heroImages: [{ url: 'https://picsum.photos/1200/800', alt: 'Hero', photographer: 'Test' }],
  heroQuery: 'fine dining restaurant',
  textSlots: {
    hero_headline: 'A Taste of Excellence',
    hero_subtext: 'Seasonal menus, artisan techniques, warm hospitality.',
    about_paragraph: 'We source the finest local ingredients.',
    cta_label: 'Make a reservation',
    empty_state: 'Menu coming soon.',
    footer_tagline: 'Crafted with passion.',
  },
}

/**
 * Build a SectionContext matching the domain-restaurant sections' expectations.
 * Mirrors how buildSectionContext() in page-assembler.ts populates the context.
 */
function makeCtx(overrides: Partial<SectionContext> = {}): SectionContext {
  return {
    tokens: canapeTokens,
    appName: 'TestRestaurant',
    heroImages: canapeTokens.heroImages,
    hasAuth: false,
    entityName: 'menu_items',
    entitySlug: 'menu-items',
    tableName: 'menu_items',
    displayColumn: 'name',
    imageColumn: undefined,
    metadataColumns: ['category', 'price'],
    dataVar: 'menuItems',
    itemVar: 'menuItem',
    config: {},
    allEntities: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// domainMenuArchive
// ---------------------------------------------------------------------------

describe('domainMenuArchive', () => {
  it('returns a SectionOutput with jsx, imports, and hooks', () => {
    const result = domainMenuArchive(makeCtx())
    expect(result).toBeDefined()
    expect(typeof result.jsx).toBe('string')
    expect(result.jsx.length).toBeGreaterThan(0)
    expect(Array.isArray(result.imports)).toBe(true)
    expect(Array.isArray(result.hooks)).toBe(true)
  })

  it('jsx queries the menu_items table', () => {
    const result = domainMenuArchive(makeCtx())
    // The section must reference menu_items (via hooks or jsx)
    const allOutput = result.jsx + (result.hooks ?? []).join('\n')
    expect(allOutput).toContain('menu_items')
  })

  it('groups items by category via hooks', () => {
    const result = domainMenuArchive(makeCtx())
    // Client-side grouping happens in hooks — reduce by item.category
    const hooksStr = (result.hooks ?? []).join('\n')
    expect(hooksStr).toContain('category')
    // JSX iterates over the grouped array
    expect(result.jsx).toContain('_menuCategories')
  })

  it('hooks include a useQuery call for menu_items', () => {
    const result = domainMenuArchive(makeCtx())
    const hooksStr = (result.hooks ?? []).join('\n')
    expect(hooksStr).toContain('useQuery')
    expect(hooksStr).toContain('menu_items')
  })

  it('imports include useQuery and supabase', () => {
    const result = domainMenuArchive(makeCtx())
    const importStr = (result.imports ?? []).join('\n')
    expect(importStr).toContain('useQuery')
    expect(importStr).toContain('supabase')
  })

  it('jsx includes an empty-state fallback when no categories exist', () => {
    const result = domainMenuArchive(makeCtx())
    // Empty state is rendered when categories array is empty
    expect(result.jsx).toMatch(/length === 0|coming soon/i)
  })

  it('jsx uses semantic section element with aria-label', () => {
    const result = domainMenuArchive(makeCtx())
    expect(result.jsx).toContain('<section')
    expect(result.jsx).toContain('aria-label')
  })

  it('jsx includes role="list" and role="listitem" for accessibility', () => {
    const result = domainMenuArchive(makeCtx())
    expect(result.jsx).toContain('role="list"')
    expect(result.jsx).toContain('role="listitem"')
  })

  it('does not throw with missing optional fields in context', () => {
    // Domain sections must not require optional entity fields to avoid crashes
    const minCtx = makeCtx({ entityName: undefined, tableName: undefined, dataVar: undefined })
    expect(() => domainMenuArchive(minCtx)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// domainMenuCategory
// ---------------------------------------------------------------------------

describe('domainMenuCategory', () => {
  it('returns a SectionOutput with jsx, imports, and hooks', () => {
    const result = domainMenuCategory(makeCtx({ config: { paramName: 'category' } }))
    expect(result).toBeDefined()
    expect(typeof result.jsx).toBe('string')
    expect(Array.isArray(result.imports)).toBe(true)
    expect(Array.isArray(result.hooks)).toBe(true)
  })

  it('jsx queries menu_items filtered by category URL param', () => {
    const result = domainMenuCategory(makeCtx({ config: { paramName: 'category' } }))
    const allOutput = result.jsx + (result.hooks ?? []).join('\n')
    expect(allOutput).toContain('menu_items')
    // Must read URL param and use it to filter
    expect(allOutput).toContain('category')
  })

  it('hooks use useParams to read the URL parameter', () => {
    const result = domainMenuCategory(makeCtx({ config: { paramName: 'category' } }))
    const hooksStr = (result.hooks ?? []).join('\n')
    // The hook must call useParams (TanStack Router)
    expect(hooksStr).toMatch(/useParams/)
  })

  it('imports include useParams from @tanstack/react-router', () => {
    const result = domainMenuCategory(makeCtx({ config: { paramName: 'category' } }))
    const importStr = (result.imports ?? []).join('\n')
    expect(importStr).toContain('useParams')
    expect(importStr).toContain('@tanstack/react-router')
  })

  it('uses custom paramName from config when provided', () => {
    const result = domainMenuCategory(makeCtx({ config: { paramName: 'slug' } }))
    const hooksStr = (result.hooks ?? []).join('\n')
    // The destructured param should use the custom name
    expect(hooksStr).toContain('slug')
  })

  it('defaults to "category" paramName when config is empty', () => {
    const result = domainMenuCategory(makeCtx({ config: {} }))
    const hooksStr = (result.hooks ?? []).join('\n')
    expect(hooksStr).toContain('category')
  })

  it('jsx includes a category navigation bar for browsing other categories', () => {
    const result = domainMenuCategory(makeCtx({ config: { paramName: 'category' } }))
    // Should contain links to common category paths
    expect(result.jsx).toContain('/menu/')
  })

  it('jsx includes an empty-state message when no items found', () => {
    const result = domainMenuCategory(makeCtx({ config: { paramName: 'category' } }))
    expect(result.jsx).toMatch(/No items found|length === 0/i)
  })
})

// ---------------------------------------------------------------------------
// domainReservationForm
// ---------------------------------------------------------------------------

describe('domainReservationForm', () => {
  const resCtx = makeCtx({
    entityName: 'reservations',
    entitySlug: 'reservations',
    tableName: 'reservations',
    displayColumn: 'name',
    metadataColumns: ['email', 'date'],
    dataVar: 'reservations',
    itemVar: 'reservation',
  })

  it('returns a SectionOutput with jsx, imports, and hooks', () => {
    const result = domainReservationForm(resCtx)
    expect(result).toBeDefined()
    expect(typeof result.jsx).toBe('string')
    expect(Array.isArray(result.imports)).toBe(true)
    expect(Array.isArray(result.hooks)).toBe(true)
  })

  it('jsx contains an HTML form element', () => {
    const result = domainReservationForm(resCtx)
    expect(result.jsx).toContain('<form')
    expect(result.jsx).toContain('</form>')
  })

  it('jsx references the reservations table for insert', () => {
    const result = domainReservationForm(resCtx)
    const allOutput = result.jsx + (result.hooks ?? []).join('\n')
    expect(allOutput).toContain('reservations')
  })

  it('jsx has fields for date, time, and party size', () => {
    const result = domainReservationForm(resCtx)
    // Required reservation-specific fields
    expect(result.jsx).toMatch(/date/i)
    expect(result.jsx).toMatch(/time/i)
    expect(result.jsx).toMatch(/party/i)
  })

  it('all input fields have associated labels via htmlFor/id pairs', () => {
    const result = domainReservationForm(resCtx)
    expect(result.jsx).toContain('htmlFor')
    // Each htmlFor should have a matching id
    const htmlForMatches = result.jsx.match(/htmlFor="([^"]+)"/g) ?? []
    expect(htmlForMatches.length).toBeGreaterThan(0)
    for (const match of htmlForMatches) {
      const id = match.replace(/htmlFor="([^"]+)"/, '$1')
      expect(result.jsx).toContain(`id="${id}"`)
    }
  })

  it('jsx includes aria-required on mandatory fields', () => {
    const result = domainReservationForm(resCtx)
    expect(result.jsx).toContain('aria-required')
  })

  it('jsx includes a success message state for post-submit feedback', () => {
    const result = domainReservationForm(resCtx)
    // Success state renders a confirmation message
    expect(result.jsx).toMatch(/submitted|received|reservation/i)
    // Role="status" or aria-live for accessibility
    expect(result.jsx).toMatch(/role="status"|aria-live/)
  })

  it('hooks include useState for form state management', () => {
    const result = domainReservationForm(resCtx)
    const hooksStr = (result.hooks ?? []).join('\n')
    expect(hooksStr).toContain('useState')
  })

  it('hooks include a submit handler that calls supabase.from(reservations).insert', () => {
    const result = domainReservationForm(resCtx)
    const hooksStr = (result.hooks ?? []).join('\n')
    expect(hooksStr).toContain('reservations')
    expect(hooksStr).toContain('insert')
  })

  it('imports include useState from react', () => {
    const result = domainReservationForm(resCtx)
    const importStr = (result.imports ?? []).join('\n')
    expect(importStr).toContain('useState')
    expect(importStr).toContain('react')
  })

  it('imports include supabase client', () => {
    const result = domainReservationForm(resCtx)
    const importStr = (result.imports ?? []).join('\n')
    expect(importStr).toContain('supabase')
  })

  it('does not throw when called with minimal context', () => {
    expect(() => domainReservationForm(makeCtx())).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// domainServicesList
// ---------------------------------------------------------------------------

describe('domainServicesList', () => {
  const svcCtx = makeCtx({
    entityName: 'services_page',
    entitySlug: 'services-page',
    tableName: 'services_page',
    displayColumn: 'name',
    metadataColumns: ['url', 'order_index'],
    dataVar: 'servicesPage',
    itemVar: 'service',
  })

  it('returns a SectionOutput with jsx, imports, and hooks', () => {
    const result = domainServicesList(svcCtx)
    expect(result).toBeDefined()
    expect(typeof result.jsx).toBe('string')
    expect(Array.isArray(result.imports)).toBe(true)
    expect(Array.isArray(result.hooks)).toBe(true)
  })

  it('jsx queries the services_page table', () => {
    const result = domainServicesList(svcCtx)
    const allOutput = result.jsx + (result.hooks ?? []).join('\n')
    expect(allOutput).toContain('services_page')
  })

  it('hooks order rows by order_index ascending', () => {
    const result = domainServicesList(svcCtx)
    const hooksStr = (result.hooks ?? []).join('\n')
    expect(hooksStr).toContain('order_index')
    // Ascending order is explicit
    expect(hooksStr).toMatch(/ascending.*true|order_index.*asc/i)
  })

  it('jsx renders service links (anchor tags)', () => {
    const result = domainServicesList(svcCtx)
    expect(result.jsx).toContain('<a')
    expect(result.jsx).toContain('href')
  })

  it('jsx includes an empty-state message when no services exist', () => {
    const result = domainServicesList(svcCtx)
    expect(result.jsx).toMatch(/No services|length === 0/i)
  })

  it('jsx uses a semantic section element with aria-label', () => {
    const result = domainServicesList(svcCtx)
    expect(result.jsx).toContain('<section')
    expect(result.jsx).toContain('aria-label')
  })

  it('jsx uses role="list" and role="listitem" for accessibility', () => {
    const result = domainServicesList(svcCtx)
    expect(result.jsx).toContain('role="list"')
    expect(result.jsx).toContain('role="listitem"')
  })

  it('hooks include a useQuery call', () => {
    const result = domainServicesList(svcCtx)
    const hooksStr = (result.hooks ?? []).join('\n')
    expect(hooksStr).toContain('useQuery')
  })

  it('imports include useQuery and supabase', () => {
    const result = domainServicesList(svcCtx)
    const importStr = (result.imports ?? []).join('\n')
    expect(importStr).toContain('useQuery')
    expect(importStr).toContain('supabase')
  })

  it('uses custom headline from config when provided', () => {
    const result = domainServicesList(makeCtx({ config: { headline: 'What We Offer' } }))
    expect(result.jsx).toContain('What We Offer')
  })

  it('defaults to "Our Services" headline when config.headline is absent', () => {
    const result = domainServicesList(svcCtx)
    expect(result.jsx).toContain('Our Services')
  })

  it('does not throw when called with minimal context', () => {
    expect(() => domainServicesList(makeCtx())).not.toThrow()
  })
})
