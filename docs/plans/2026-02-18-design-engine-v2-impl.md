# Design Engine v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single generic table/card layout with a composable skills system — recipe apps look like recipe apps, dashboards look like dashboards, travel blogs look like magazines.

**Architecture:** Deterministic `DesignSpec` derived from `SchemaContract` → keyword-based `SkillClassifier` picks the right JSX template per entity → `assembler` renders skill templates instead of generic tables. No new LLM calls. Stays at 1 LLM call (analyst only).

**Tech Stack:** TypeScript, Tailwind v4 `@theme inline`, Unsplash API (optional), shadcn/ui, Recharts (for chart skills), Lucide icons.

---

## Context

Current pipeline (important — no frontendAgent LLM):
```
analyst(LLM) → SchemaContract
    → inferPageConfig() [deterministic]
    → assembleListPage() / assembleDetailPage() [deterministic]
    → generic sticky-nav + table layout for every app
```

After v2:
```
analyst(LLM) → SchemaContract + designPreferences
    → deriveDesignSpec() [deterministic: archetype + palette + font pair]
    → fetchHeroImages() [Unsplash API, optional]
    → classifyEntitySkills() [deterministic keyword rules]
    → assembleWithSkill() [renders matching skill template]
    → recipe/magazine/dashboard/kanban layout per entity type
```

Key invariants:
- **0 new LLM calls** — all skill selection is deterministic keyword matching
- **`DesignSpec` flows as a parameter** — `orchestrator.ts` derives it, passes to assembler
- **Fallback always works** — unknown entities get `DataTable` + `FormSheet` (current behavior)
- **Tailwind tokens unchanged** — `app-blueprint.ts` already generates `@theme inline`. We extend it with archetype-specific font/animation tokens.

## Phase 1: Foundation (parallelizable — no dependencies on each other)

---

### Task 1: Create `server/lib/design-spec.ts`

**Files:**
- Create: `server/lib/design-spec.ts`
- Test: `tests/design-spec.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/design-spec.test.ts
import { describe, it, expect } from 'vitest'
import { deriveDesignSpec, designSpecToFontCSS } from '@server/lib/design-spec'
import type { SchemaContract } from '@server/lib/schema-contract'
import type { DesignPreferences } from '@server/lib/schema-contract'

const BASE_PREFS: DesignPreferences = {
  primaryColor: '#f43f5e',
  fontFamily: 'Inter',
}

function makeContract(tableNames: string[]): SchemaContract {
  return {
    appName: 'Test App',
    appDescription: 'Test',
    tables: tableNames.map((name) => ({
      name,
      columns: [
        { name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
      ],
      rls: { enabled: false },
    })),
    auth: false,
  }
}

describe('deriveDesignSpec', () => {
  it('identifies storefront archetype from recipe entity', () => {
    const spec = deriveDesignSpec(makeContract(['recipe', 'ingredient']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('storefront')
  })

  it('identifies editorial archetype from blog entity', () => {
    const spec = deriveDesignSpec(makeContract(['post', 'author']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('editorial')
  })

  it('identifies dashboard archetype from transaction entity', () => {
    const spec = deriveDesignSpec(makeContract(['transaction', 'account']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('dashboard')
  })

  it('identifies kanban archetype from task entity', () => {
    const spec = deriveDesignSpec(makeContract(['project', 'task']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('kanban')
  })

  it('identifies schedule archetype from appointment entity', () => {
    const spec = deriveDesignSpec(makeContract(['appointment', 'doctor']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('schedule')
  })

  it('falls back to directory archetype for unknown entities', () => {
    const spec = deriveDesignSpec(makeContract(['widget', 'gadget']), BASE_PREFS)
    expect(spec.layoutArchetype).toBe('directory')
  })

  it('derives font pair for editorial archetype', () => {
    const spec = deriveDesignSpec(makeContract(['article']), BASE_PREFS)
    expect(spec.fontPair.name).toBe('editorial-serif')
  })

  it('includes entity layouts for each table', () => {
    const spec = deriveDesignSpec(makeContract(['recipe', 'ingredient']), BASE_PREFS)
    expect(spec.entityLayouts).toHaveProperty('recipe')
    expect(spec.entityLayouts).toHaveProperty('ingredient')
  })
})

describe('designSpecToFontCSS', () => {
  it('generates @import + :root CSS for font pair', () => {
    const spec = deriveDesignSpec(makeContract(['article']), BASE_PREFS)
    const css = designSpecToFontCSS(spec)
    expect(css).toContain('@import url(')
    expect(css).toContain('--font-display')
    expect(css).toContain('--font-body')
  })
})
```

**Step 2: Run to verify it fails**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/design-spec.test.ts
```

Expected: FAIL with "Cannot find module '@server/lib/design-spec'"

**Step 3: Implement `server/lib/design-spec.ts`**

```typescript
// server/lib/design-spec.ts
//
// Deterministic DesignSpec derivation from SchemaContract + DesignPreferences.
// No LLM calls — archetype detection is keyword-based pattern matching.

import type { SchemaContract, DesignPreferences } from './schema-contract'

// ============================================================================
// Types
// ============================================================================

export type LayoutArchetype =
  | 'editorial'   // magazines, blogs, articles, travel
  | 'storefront'  // recipes, menus, products, catalogs, watches
  | 'dashboard'   // finance, analytics, CRM, inventory
  | 'kanban'      // projects, tasks, pipelines, deals
  | 'schedule'    // appointments, bookings, events, slots
  | 'portfolio'   // photography, galleries, artwork
  | 'directory'   // default/fallback: people, places, listings

export type NavStyle = 'sticky-glass' | 'editorial' | 'sidebar' | 'minimal'

export interface FontPair {
  name: string
  displayFamily: string   // Google Fonts name for headings
  bodyFamily: string      // Google Fonts name for body text
  googleFontsUrl: string  // @import URL
}

export interface EntityLayout {
  listSkill: string    // e.g., 'CardGrid', 'TransactionFeed', 'DataTable'
  detailSkill: string  // e.g., 'ProductDetail', 'ArticleReader', 'FormSheet'
  heroSkill?: string   // optional hero for list page
  hasDashboard: boolean  // show KPI/chart widgets above list
}

export interface DesignSpec {
  layoutArchetype: LayoutArchetype
  navStyle: NavStyle
  fontPair: FontPair
  motionIntensity: 'none' | 'subtle' | 'expressive'
  entityLayouts: Record<string, EntityLayout>
  heroImageQuery?: string   // Unsplash search query if UNSPLASH_ACCESS_KEY set
  heroImages: HeroImage[]   // populated by fetchHeroImages(), empty if no key
}

export interface HeroImage {
  url: string
  alt: string
  photographer: string
}

// ============================================================================
// Keyword rules — entity name → archetype
// ============================================================================

/** Ordered rules: first match wins. Keywords match against table name. */
const ARCHETYPE_RULES: Array<{ keywords: string[]; archetype: LayoutArchetype }> = [
  {
    keywords: ['recipe', 'dish', 'menu', 'food', 'ingredient', 'meal', 'cuisine', 'watch', 'book', 'product', 'catalog', 'item', 'listing'],
    archetype: 'storefront',
  },
  {
    keywords: ['article', 'post', 'blog', 'author', 'destination', 'travel', 'journal', 'story', 'entry', 'newsletter'],
    archetype: 'editorial',
  },
  {
    keywords: ['transaction', 'budget', 'expense', 'income', 'account', 'invoice', 'payment', 'ledger', 'finance', 'spending'],
    archetype: 'dashboard',
  },
  {
    keywords: ['project', 'task', 'deliverable', 'deal', 'lead', 'ticket', 'issue', 'sprint', 'milestone', 'pipeline', 'stage'],
    archetype: 'kanban',
  },
  {
    keywords: ['appointment', 'booking', 'slot', 'event', 'session', 'reservation', 'schedule', 'meeting', 'class'],
    archetype: 'schedule',
  },
  {
    keywords: ['photo', 'image', 'gallery', 'portfolio', 'artwork', 'illustration', 'design', 'shot'],
    archetype: 'portfolio',
  },
]

function detectArchetype(tableNames: string[]): LayoutArchetype {
  // Score each archetype by keyword hits across all tables
  const scores: Record<LayoutArchetype, number> = {
    storefront: 0, editorial: 0, dashboard: 0, kanban: 0, schedule: 0, portfolio: 0, directory: 0,
  }

  for (const tableName of tableNames) {
    const lower = tableName.toLowerCase()
    for (const rule of ARCHETYPE_RULES) {
      if (rule.keywords.some((kw) => lower.includes(kw))) {
        scores[rule.archetype]++
        break // first rule wins per table
      }
    }
  }

  // Return highest scoring archetype, fall back to 'directory'
  let best: LayoutArchetype = 'directory'
  let bestScore = 0
  for (const [arch, score] of Object.entries(scores) as [LayoutArchetype, number][]) {
    if (score > bestScore) {
      bestScore = score
      best = arch
    }
  }
  return best
}

// ============================================================================
// Font pair catalog
// ============================================================================

const FONT_PAIRS: Record<LayoutArchetype, FontPair> = {
  editorial: {
    name: 'editorial-serif',
    displayFamily: 'Playfair Display',
    bodyFamily: 'Source Serif 4',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Source+Serif+4:wght@300;400;600&display=swap',
  },
  storefront: {
    name: 'luxury-serif',
    displayFamily: 'Cormorant Garamond',
    bodyFamily: 'Lato',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Lato:wght@300;400;700&display=swap',
  },
  dashboard: {
    name: 'geometric-clean',
    displayFamily: 'DM Sans',
    bodyFamily: 'DM Sans',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap',
  },
  kanban: {
    name: 'modern-sans',
    displayFamily: 'Inter',
    bodyFamily: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  },
  schedule: {
    name: 'geometric-clean',
    displayFamily: 'DM Sans',
    bodyFamily: 'DM Sans',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&display=swap',
  },
  portfolio: {
    name: 'expressive-display',
    displayFamily: 'Syne',
    bodyFamily: 'DM Mono',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@300;400&display=swap',
  },
  directory: {
    name: 'modern-sans',
    displayFamily: 'Inter',
    bodyFamily: 'Inter',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  },
}

// ============================================================================
// Entity skill mapping — archetype + entity name → list/detail skills
// ============================================================================

const LIST_SKILLS: Record<LayoutArchetype, string> = {
  editorial: 'MagazineGrid',
  storefront: 'CardGrid',
  dashboard: 'TransactionFeed',
  kanban: 'CardGrid',
  schedule: 'CardGrid',
  portfolio: 'CardGrid',
  directory: 'DataTable',
}

const DETAIL_SKILLS: Record<LayoutArchetype, string> = {
  editorial: 'ArticleReader',
  storefront: 'ProductDetail',
  dashboard: 'FormSheet',
  kanban: 'FormSheet',
  schedule: 'FormSheet',
  portfolio: 'ProductDetail',
  directory: 'FormSheet',
}

/** Tables whose archetype is dashboard-style get KPI widgets above the list */
const DASHBOARD_ARCHETYPES = new Set<LayoutArchetype>(['dashboard'])

function buildEntityLayouts(tableNames: string[], archetype: LayoutArchetype): Record<string, EntityLayout> {
  const layouts: Record<string, EntityLayout> = {}
  for (const name of tableNames) {
    layouts[name] = {
      listSkill: LIST_SKILLS[archetype],
      detailSkill: DETAIL_SKILLS[archetype],
      hasDashboard: DASHBOARD_ARCHETYPES.has(archetype),
    }
  }
  return layouts
}

// ============================================================================
// Nav style
// ============================================================================

const NAV_STYLES: Record<LayoutArchetype, NavStyle> = {
  editorial: 'editorial',
  storefront: 'minimal',
  dashboard: 'sidebar',
  kanban: 'sidebar',
  schedule: 'sticky-glass',
  portfolio: 'minimal',
  directory: 'sticky-glass',
}

const MOTION_INTENSITY: Record<LayoutArchetype, 'none' | 'subtle' | 'expressive'> = {
  editorial: 'expressive',
  storefront: 'subtle',
  dashboard: 'none',
  kanban: 'subtle',
  schedule: 'subtle',
  portfolio: 'expressive',
  directory: 'none',
}

// ============================================================================
// Unsplash query — what to search for hero images
// ============================================================================

const HERO_QUERIES: Record<LayoutArchetype, string> = {
  editorial: 'magazine editorial photography',
  storefront: 'product food photography lifestyle',
  dashboard: 'modern office data analytics',
  kanban: 'team workspace productivity',
  schedule: 'calendar planning schedule',
  portfolio: 'art gallery photography portfolio',
  directory: 'people community directory',
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Deterministically derive a DesignSpec from the contract + design preferences.
 * No LLM calls — archetype detection uses keyword rules.
 */
export function deriveDesignSpec(contract: SchemaContract, _prefs: DesignPreferences): DesignSpec {
  const entityTableNames = contract.tables
    .filter((t) => !t.name.startsWith('_'))
    .map((t) => t.name)

  const archetype = detectArchetype(entityTableNames)
  const fontPair = FONT_PAIRS[archetype]
  const navStyle = NAV_STYLES[archetype]
  const motionIntensity = MOTION_INTENSITY[archetype]
  const entityLayouts = buildEntityLayouts(entityTableNames, archetype)
  const heroImageQuery = HERO_QUERIES[archetype]

  return {
    layoutArchetype: archetype,
    navStyle,
    fontPair,
    motionIntensity,
    entityLayouts,
    heroImageQuery,
    heroImages: [], // populated by fetchHeroImages() in orchestrator if UNSPLASH_ACCESS_KEY set
  }
}

/**
 * Generate CSS @import + :root font custom properties for use in index.css.
 * Inlined by app-blueprint.ts alongside the Tailwind @theme block.
 */
export function designSpecToFontCSS(spec: DesignSpec): string {
  return `@import url('${spec.fontPair.googleFontsUrl}');

:root {
  --font-display: '${spec.fontPair.displayFamily}', serif;
  --font-body: '${spec.fontPair.bodyFamily}', sans-serif;
}`
}
```

**Step 4: Run tests**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/design-spec.test.ts
```

Expected: All PASS

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add server/lib/design-spec.ts tests/design-spec.test.ts
git commit -m "feat: DesignSpec — deterministic archetype detection from contract entity names"
```

---

### Task 2: Create `server/lib/skill-classifier.ts`

**Files:**
- Create: `server/lib/skill-classifier.ts`
- Test: `tests/skill-classifier.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/skill-classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classifyEntitySkill } from '@server/lib/skill-classifier'

describe('classifyEntitySkill', () => {
  it('returns CardGrid for recipe with image column', () => {
    const result = classifyEntitySkill('recipe', ['name', 'image_url', 'price'], 'storefront')
    expect(result.listSkill).toBe('CardGrid')
  })

  it('returns MenuGrid for dish/food with price column', () => {
    const result = classifyEntitySkill('dish', ['name', 'description', 'price'], 'storefront')
    expect(result.listSkill).toBe('MenuGrid')
  })

  it('returns MagazineGrid for article/post', () => {
    const result = classifyEntitySkill('article', ['title', 'body', 'published_at'], 'editorial')
    expect(result.listSkill).toBe('MagazineGrid')
  })

  it('returns TransactionFeed for transaction entity', () => {
    const result = classifyEntitySkill('transaction', ['amount', 'category', 'date'], 'dashboard')
    expect(result.listSkill).toBe('TransactionFeed')
  })

  it('returns DataTable fallback for unknown entity', () => {
    const result = classifyEntitySkill('widget', ['name', 'value'], 'directory')
    expect(result.listSkill).toBe('DataTable')
  })

  it('marks dashboard=true for finance entities', () => {
    const result = classifyEntitySkill('transaction', ['amount', 'category'], 'dashboard')
    expect(result.hasDashboard).toBe(true)
  })
})
```

**Step 2: Run to verify it fails**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/skill-classifier.test.ts
```

**Step 3: Implement**

```typescript
// server/lib/skill-classifier.ts
//
// Fine-grained entity skill selection within an archetype.
// More specific than DesignSpec's coarse archetype mapping —
// checks column names for disambiguation (image cols → CardGrid vs MenuGrid).

import type { LayoutArchetype, EntityLayout } from './design-spec'

/**
 * Refine the list/detail skill selection for a specific entity.
 * Called per-entity after DesignSpec archetype is known.
 *
 * @param entityName - snake_case table name
 * @param columnNames - column names available (used for disambiguation)
 * @param archetype - from DesignSpec
 */
export function classifyEntitySkill(
  entityName: string,
  columnNames: string[],
  archetype: LayoutArchetype,
): EntityLayout {
  const lower = entityName.toLowerCase()
  const hasImage = columnNames.some((c) => c.includes('image') || c.includes('photo') || c.includes('thumbnail') || c.includes('avatar'))
  const hasPrice = columnNames.some((c) => c.includes('price') || c.includes('cost') || c.includes('amount') || c.includes('fee'))
  const hasBody = columnNames.some((c) => c === 'body' || c === 'content' || c === 'description' || c.includes('text'))
  const hasAmount = columnNames.some((c) => c.includes('amount') || c.includes('total') || c.includes('balance'))

  // ── Storefront refinement ─────────────────────────────────────────────────
  if (archetype === 'storefront') {
    // Food/menu items with prices → MenuGrid (two-column menu layout)
    const isFood = ['dish', 'item', 'menu', 'food', 'meal'].some((kw) => lower.includes(kw))
    if (isFood && hasPrice) {
      return { listSkill: 'MenuGrid', detailSkill: 'ProductDetail', hasDashboard: false }
    }
    // Products/watches/books with images → CardGrid (image-first)
    return { listSkill: 'CardGrid', detailSkill: 'ProductDetail', hasDashboard: false }
  }

  // ── Editorial refinement ──────────────────────────────────────────────────
  if (archetype === 'editorial') {
    // Authors/people → AuthorProfiles
    const isPerson = ['author', 'writer', 'person', 'contributor'].some((kw) => lower.includes(kw))
    if (isPerson) {
      return { listSkill: 'AuthorProfiles', detailSkill: 'ProfileCard', hasDashboard: false }
    }
    return { listSkill: 'MagazineGrid', detailSkill: 'ArticleReader', hasDashboard: false }
  }

  // ── Dashboard refinement ──────────────────────────────────────────────────
  if (archetype === 'dashboard') {
    // Finance transactions → TransactionFeed with KPI widgets
    const isTransaction = ['transaction', 'expense', 'payment', 'ledger', 'invoice'].some((kw) => lower.includes(kw))
    if (isTransaction && hasAmount) {
      return { listSkill: 'TransactionFeed', detailSkill: 'FormSheet', hasDashboard: true }
    }
    // Generic dashboard entity (accounts, categories)
    return { listSkill: 'DataTable', detailSkill: 'FormSheet', hasDashboard: false }
  }

  // ── Kanban refinement ─────────────────────────────────────────────────────
  if (archetype === 'kanban') {
    return { listSkill: 'CardGrid', detailSkill: 'FormSheet', hasDashboard: false }
  }

  // ── Schedule refinement ───────────────────────────────────────────────────
  if (archetype === 'schedule') {
    return { listSkill: 'CardGrid', detailSkill: 'AppointmentCard', hasDashboard: false }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return { listSkill: 'DataTable', detailSkill: 'FormSheet', hasDashboard: false }
}
```

**Step 4: Run tests**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/skill-classifier.test.ts
```

Expected: All PASS

**Step 5: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add server/lib/skill-classifier.ts tests/skill-classifier.test.ts
git commit -m "feat: SkillClassifier — entity + column names → list/detail skill selection"
```

---

### Task 3: Create `server/lib/unsplash.ts`

**Files:**
- Create: `server/lib/unsplash.ts`

No tests needed — thin API wrapper, guarded by env check.

**Step 1: Implement**

```typescript
// server/lib/unsplash.ts
//
// Fetch hero images from Unsplash API.
// Gracefully no-ops when UNSPLASH_ACCESS_KEY is unset.

import type { HeroImage } from './design-spec'

interface UnsplashPhoto {
  id: string
  urls: { regular: string; small: string }
  alt_description: string | null
  user: { name: string }
}

interface UnsplashSearchResult {
  results: UnsplashPhoto[]
}

/**
 * Fetch hero images from Unsplash for use in full-bleed hero sections.
 * Returns empty array if UNSPLASH_ACCESS_KEY is not set.
 *
 * @param query - search query (e.g., "food photography recipes")
 * @param count - number of images to fetch (default: 3)
 */
export async function fetchHeroImages(query: string, count: number = 3): Promise<HeroImage[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) {
    console.log('[unsplash] UNSPLASH_ACCESS_KEY not set — skipping hero images')
    return []
  }

  try {
    const url = new URL('https://api.unsplash.com/search/photos')
    url.searchParams.set('query', query)
    url.searchParams.set('per_page', String(count))
    url.searchParams.set('orientation', 'landscape')

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    })

    if (!response.ok) {
      console.warn(`[unsplash] API error ${response.status} — skipping hero images`)
      return []
    }

    const data = (await response.json()) as UnsplashSearchResult

    return data.results.map((photo) => ({
      url: photo.urls.regular,
      alt: photo.alt_description ?? query,
      photographer: photo.user.name,
    }))
  } catch (error) {
    console.warn('[unsplash] Fetch failed — skipping hero images:', error)
    return []
  }
}
```

**Step 2: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add server/lib/unsplash.ts
git commit -m "feat: Unsplash helper — fetch hero images (no-ops when key unset)"
```

---

## Phase 2: Skills Library

> Skills are TypeScript functions that accept `SkillProps` and return complete React component code strings. They **do not render JSX** — they return template strings that become file contents in the generated app.

---

### Task 4: Create `server/lib/skills/index.ts`

**Files:**
- Create: `server/lib/skills/index.ts`

**Step 1: Implement**

```typescript
// server/lib/skills/index.ts
//
// Shared types and dispatcher for all skill templates.
// Each skill is a function: (props: SkillProps) => string (React component code).

import type { SchemaContract } from '../schema-contract'
import type { EntityLayout } from '../design-spec'

export interface SkillProps {
  // Entity identity
  entity: string          // snake_case table name (e.g., 'recipe')
  contract: SchemaContract

  // Page feature spec (from existing inferPageConfig + derivePageFeatureSpec)
  spec: import('../agents/feature-schema').PageFeatureSpec

  // Design context
  layout: EntityLayout
  primaryColor: string    // hex (from designPreferences)
  fontFamily: string      // Google Font name

  // Hero images (empty if Unsplash not configured)
  heroImages: import('../design-spec').HeroImage[]
}

// ── List skill dispatcher ────────────────────────────────────────────────────

export function renderListSkill(skillName: string, props: SkillProps): string {
  switch (skillName) {
    case 'CardGrid': {
      const { assembleCardGridPage } = require('./list')
      return assembleCardGridPage(props)
    }
    case 'MenuGrid': {
      const { assembleMenuGridPage } = require('./list')
      return assembleMenuGridPage(props)
    }
    case 'MagazineGrid': {
      const { assembleMagazineGridPage } = require('./list')
      return assembleMagazineGridPage(props)
    }
    case 'TransactionFeed': {
      const { assembleTransactionFeedPage } = require('./list')
      return assembleTransactionFeedPage(props)
    }
    case 'AuthorProfiles': {
      const { assembleAuthorProfilesPage } = require('./list')
      return assembleAuthorProfilesPage(props)
    }
    case 'DataTable':
    default: {
      // Fall through to existing assembleListPage in assembler.ts
      return '' // empty string signals "use legacy assembler"
    }
  }
}

// ── Detail skill dispatcher ──────────────────────────────────────────────────

export function renderDetailSkill(skillName: string, props: SkillProps): string {
  switch (skillName) {
    case 'ProductDetail': {
      const { assembleProductDetailPage } = require('./detail')
      return assembleProductDetailPage(props)
    }
    case 'ArticleReader': {
      const { assembleArticleReaderPage } = require('./detail')
      return assembleArticleReaderPage(props)
    }
    case 'ProfileCard': {
      const { assembleProfileCardPage } = require('./detail')
      return assembleProfileCardPage(props)
    }
    case 'AppointmentCard': {
      const { assembleAppointmentCardPage } = require('./detail')
      return assembleAppointmentCardPage(props)
    }
    case 'FormSheet':
    default: {
      return '' // use legacy assembleDetailPage
    }
  }
}
```

> **Note:** The `require()` calls here use dynamic requires to avoid circular imports. In the actual TypeScript compilation (server tsconfig uses CommonJS-compatible import style through Bun), this works fine. Alternatively, use dynamic `await import()` pattern.

**Step 2: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add server/lib/skills/index.ts
git commit -m "feat: skills/index — SkillProps type + list/detail skill dispatcher"
```

---

### Task 5: Create `server/lib/skills/list.ts` (CardGrid + MenuGrid + MagazineGrid + TransactionFeed)

**Files:**
- Create: `server/lib/skills/list.ts`
- Test: `tests/skills-list.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/skills-list.test.ts
import { describe, it, expect } from 'vitest'
import { assembleCardGridPage, assembleMenuGridPage, assembleMagazineGridPage, assembleTransactionFeedPage } from '@server/lib/skills/list'
import type { SkillProps } from '@server/lib/skills/index'
import type { SchemaContract } from '@server/lib/schema-contract'
import { inferPageConfig, derivePageFeatureSpec } from '@server/lib/agents/feature-schema'

function makeProps(entityName: string, columnNames: { name: string; type: string }[]): SkillProps {
  const contract: SchemaContract = {
    appName: 'Test',
    appDescription: 'Test',
    tables: [{
      name: entityName,
      columns: [
        { name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()' },
        ...columnNames,
      ],
      rls: { enabled: false },
    }],
    auth: false,
  }
  const pageConfig = inferPageConfig(contract.tables[0], contract)
  const spec = derivePageFeatureSpec(pageConfig, contract)
  return {
    entity: entityName,
    contract,
    spec,
    layout: { listSkill: 'CardGrid', detailSkill: 'FormSheet', hasDashboard: false },
    primaryColor: '#f43f5e',
    fontFamily: 'Inter',
    heroImages: [],
  }
}

describe('assembleCardGridPage', () => {
  it('generates a valid React component string', () => {
    const props = makeProps('recipe', [
      { name: 'name', type: 'text' },
      { name: 'image_url', type: 'text' },
    ])
    const code = assembleCardGridPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/recipes')")
    expect(code).toContain('supabase.from')
    expect(code).toContain('useQuery')
    expect(code).toContain('CardGrid')
  })

  it('includes image field when image column exists', () => {
    const props = makeProps('recipe', [
      { name: 'name', type: 'text' },
      { name: 'image_url', type: 'text' },
    ])
    const code = assembleCardGridPage(props)
    expect(code).toContain('image_url')
  })
})

describe('assembleMenuGridPage', () => {
  it('generates a menu grid with price rendering', () => {
    const props = makeProps('dish', [
      { name: 'name', type: 'text' },
      { name: 'price', type: 'numeric' },
    ])
    const code = assembleMenuGridPage(props)
    expect(code).toContain('price')
    expect(code).toContain('toFixed(2)')
  })
})

describe('assembleMagazineGridPage', () => {
  it('generates editorial layout with featured first item', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'excerpt', type: 'text' },
      { name: 'published_at', type: 'timestamptz' },
    ])
    const code = assembleMagazineGridPage(props)
    expect(code).toContain('featured')
    expect(code).toContain('published_at')
  })
})

describe('assembleTransactionFeedPage', () => {
  it('generates transaction feed with amount formatting', () => {
    const props = makeProps('transaction', [
      { name: 'amount', type: 'numeric' },
      { name: 'category', type: 'text' },
      { name: 'description', type: 'text' },
    ])
    const code = assembleTransactionFeedPage(props)
    expect(code).toContain('amount')
    expect(code).toContain('toFixed(2)')
  })
})
```

**Step 2: Run to verify failing**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/skills-list.test.ts
```

**Step 3: Implement `server/lib/skills/list.ts`**

This file implements 4 rich list page templates. Each returns a complete React component string using `supabase-js` + TanStack Query (same patterns as the existing assembler). Full implementation in the file — see the `★ Template Guide` section below for the shape of each skill.

**CardGrid template shape:**
```tsx
// Grid of image cards with hover effects
// - useQuery to fetch all items
// - 3-column responsive grid
// - Each card: image (if imageField), title, subtitle fields
// - Click → navigate to detail
// - "New [Entity]" button → dialog with create form
// - Empty state: centered icon + message + CTA button
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
// ...shadcn Card, Dialog, Button, Input imports
```

**MenuGrid template shape (for food/dish entities):**
```tsx
// Two-column menu layout (left: name+description, right: price)
// - Section headers from category field (if exists)
// - Price formatted as $X.XX
// - Inline create form (not dialog)
```

**MagazineGrid template shape:**
```tsx
// Featured article (first/latest) large + secondary grid
// - Featured: full-width hero with large title overlay
// - Secondary: 2-col grid, title + date + excerpt
// - "New Article" button in header
```

**TransactionFeed template shape:**
```tsx
// Chronological transaction feed
// - Date-grouped entries
// - Amount with +/- coloring (positive=green, negative=red)
// - Category badge
// - Running total in header if hasDashboard
// - Inline "Add Transaction" form
```

> Create `server/lib/skills/list.ts` now. Use the existing assembler code in `assembler.ts` as a reference for imports, supabase patterns, and TanStack Query patterns. Each function must return a string with a complete, valid React component.

**Step 4: Run tests to verify passing**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/skills-list.test.ts
```

**Step 5: Type check**

```bash
cd /Users/ammishra/VibeStack/platform && bunx tsc --noEmit -p tsconfig.server.json 2>&1 | head -50
```

**Step 6: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add server/lib/skills/list.ts tests/skills-list.test.ts
git commit -m "feat: skills/list — CardGrid, MenuGrid, MagazineGrid, TransactionFeed"
```

---

### Task 6: Create `server/lib/skills/detail.ts` (ProductDetail + ArticleReader + AppointmentCard)

**Files:**
- Create: `server/lib/skills/detail.ts`
- Test: `tests/skills-detail.test.ts`

**Step 1: Write failing tests**

```typescript
// tests/skills-detail.test.ts
import { describe, it, expect } from 'vitest'
import { assembleProductDetailPage, assembleArticleReaderPage, assembleAppointmentCardPage } from '@server/lib/skills/detail'
// ... same makeProps helper as skills-list.test.ts

describe('assembleProductDetailPage', () => {
  it('generates detail page with hero image section', () => {
    const props = makeProps('recipe', [
      { name: 'name', type: 'text' },
      { name: 'image_url', type: 'text' },
      { name: 'description', type: 'text' },
    ])
    const code = assembleProductDetailPage(props)
    expect(code).toContain("createFileRoute('/_authenticated/recipes/$id')")
    expect(code).toContain('image_url')
    expect(code).toContain('useQuery')
  })
})

describe('assembleArticleReaderPage', () => {
  it('generates full-width reading layout', () => {
    const props = makeProps('article', [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'text' },
    ])
    const code = assembleArticleReaderPage(props)
    expect(code).toContain('prose')
    expect(code).toContain('body')
  })
})

describe('assembleAppointmentCardPage', () => {
  it('includes date/time formatting', () => {
    const props = makeProps('appointment', [
      { name: 'title', type: 'text' },
      { name: 'scheduled_at', type: 'timestamptz' },
      { name: 'status', type: 'text' },
    ])
    const code = assembleAppointmentCardPage(props)
    expect(code).toContain('scheduled_at')
    expect(code).toContain('toLocaleDateString')
  })
})
```

**Step 2: Run to verify failing**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/skills-detail.test.ts
```

**Step 3: Implement `server/lib/skills/detail.ts`**

**ProductDetail template shape:**
```tsx
// Large hero image on top (or gradient if no image field)
// Sticky "back" navigation
// Title + metadata row
// Two-column: main content (description, body fields) + sidebar (price, status, metadata)
// Edit button → inline form sheet
```

**ArticleReader template shape:**
```tsx
// Full-width centered reading experience
// Header: title + author + published_at + reading time estimate
// Body: prose-styled content (if 'body'/'content' column exists)
// Footer: Edit button
// max-w-3xl centered, generous line-height
```

**AppointmentCard template shape:**
```tsx
// Card-style detail with prominent date/time display
// Status badge (color-coded)
// Action buttons: Edit, Cancel, Mark Complete
// Info grid: location, notes, duration, attendees
```

**Step 4: Run tests, type check, commit**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test tests/skills-detail.test.ts
bunx tsc --noEmit -p tsconfig.server.json 2>&1 | head -50
git add server/lib/skills/detail.ts tests/skills-detail.test.ts
git commit -m "feat: skills/detail — ProductDetail, ArticleReader, AppointmentCard"
```

---

## Phase 3: Integration

---

### Task 7: Update `server/lib/agents/assembler.ts` — route list/detail assembly through skills

**Files:**
- Modify: `server/lib/agents/assembler.ts`

**What to change:**

The `runCodeGeneration()` function in `orchestrator.ts` calls `assembleListPage(featureSpec, contract)` and `assembleDetailPage(featureSpec, contract)` for each entity. We need to:

1. Accept a `DesignSpec` parameter in the assembler context
2. After generating `featureSpec`, call `classifyEntitySkill()` to get refined layout
3. Call `renderListSkill(layout.listSkill, props)` — if it returns `''` (DataTable/FormSheet), fall back to existing `assembleListPage()`/`assembleDetailPage()`
4. Otherwise use the returned skill code

**Step 1: Add `DesignSpec` parameter to the code gen context**

In `orchestrator.ts`, find the section around line 200 that does per-entity processing:

```typescript
// BEFORE (around orchestrator.ts line 261-278):
const pageConfig = inferPageConfig(table, input.contract)
const featureSpec = derivePageFeatureSpec(pageConfig, input.contract)
const listPageContent = assembleListPage(featureSpec, input.contract)
const detailPageContent = assembleDetailPage(featureSpec, input.contract)
```

Change to:

```typescript
// AFTER:
const pageConfig = inferPageConfig(table, input.contract)
const featureSpec = derivePageFeatureSpec(pageConfig, input.contract)

// Classify entity skills using DesignSpec archetype + column hints
const { classifyEntitySkill } = await import('../skill-classifier')
const columnNames = table.columns.map((c) => c.name)
const entityLayout = classifyEntitySkill(table.name, columnNames, input.designSpec.layoutArchetype)

// Try rich skill template first; fall back to generic assembler if skill returns ''
const { renderListSkill, renderDetailSkill } = await import('../skills/index')
const skillProps = {
  entity: table.name,
  contract: input.contract,
  spec: featureSpec,
  layout: entityLayout,
  primaryColor: input.designPreferences.primaryColor,
  fontFamily: input.designPreferences.fontFamily,
  heroImages: input.designSpec.heroImages,
}

const richListPage = renderListSkill(entityLayout.listSkill, skillProps)
const richDetailPage = renderDetailSkill(entityLayout.detailSkill, skillProps)

const listPageContent = richListPage || assembleListPage(featureSpec, input.contract)
const detailPageContent = richDetailPage || assembleDetailPage(featureSpec, input.contract)
```

**Step 2: Update `runCodeGeneration()` input type**

In `orchestrator.ts`, find the `runCodeGeneration` function signature (around line 140-170). Add `designSpec` and `designPreferences` parameters:

```typescript
export async function runCodeGeneration(input: {
  contract: SchemaContract
  blueprint: AppBlueprint
  sandboxId: string
  supabaseProjectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  designSpec: DesignSpec          // ADD
  designPreferences: DesignPreferences  // ADD
}): Promise<CodeGenResult>
```

**Step 3: Update `orchestrator.ts` call sites**

Find where `runCodeGeneration` is called (in the XState machine invoke handlers or in the workflow). Add `designSpec` and `designPreferences` to the call.

Also add the DesignSpec derivation step (after blueprint, before codegen):

```typescript
// After contractToBlueprint():
const { deriveDesignSpec } = await import('../design-spec')
const { fetchHeroImages } = await import('../unsplash')

const designSpec = deriveDesignSpec(input.contract, input.designPreferences)
designSpec.heroImages = await fetchHeroImages(designSpec.heroImageQuery ?? '', 3)
```

**Step 4: Type check**

```bash
cd /Users/ammishra/VibeStack/platform && bunx tsc --noEmit -p tsconfig.server.json 2>&1 | head -80
```

Fix any type errors (missing imports, wrong parameter shapes). Common issues:
- `DesignSpec` import missing from orchestrator.ts
- `DesignPreferences` already imported from schema-contract — verify

**Step 5: Run all tests**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test
```

**Step 6: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add server/lib/agents/orchestrator.ts server/lib/agents/assembler.ts
git commit -m "feat: integrate DesignSpec + skill dispatch into code generation pipeline"
```

---

### Task 8: Update `server/lib/app-blueprint.ts` — inject font CSS from DesignSpec

**Files:**
- Modify: `server/lib/app-blueprint.ts`

**What to change:**

`generateIndexCSS()` (line 148) currently only generates Tailwind color tokens from `primaryColor`. Enhance it to prepend the Google Fonts `@import` and `:root` font variables from `designSpecToFontCSS()`.

**Step 1: Locate the function**

Read `app-blueprint.ts` lines 148-220. The function ends with a CSS string that starts with `@import "tailwindcss";`.

**Step 2: Modify `generateIndexCSS()` signature and body**

```typescript
// BEFORE:
function generateIndexCSS(prefs: DesignPreferences): string {
  const pal = buildColorPalette(prefs.primaryColor)
  return `@import "tailwindcss";
@import "tw-animate-css";
...`

// AFTER:
import { deriveDesignSpec, designSpecToFontCSS } from './design-spec'

function generateIndexCSS(prefs: DesignPreferences, contract: SchemaContract): string {
  const pal = buildColorPalette(prefs.primaryColor)
  const designSpec = deriveDesignSpec(contract, prefs)
  const fontCSS = designSpecToFontCSS(designSpec)

  return `${fontCSS}

@import "tailwindcss";
@import "tw-animate-css";
...rest of CSS...
  --font-sans: var(--font-body, '${prefs.fontFamily}', ui-sans-serif, system-ui, sans-serif);
  --font-display: var(--font-display, '${prefs.fontFamily}', ui-sans-serif, system-ui, sans-serif);
...`
}
```

**Step 3: Update call site of `generateIndexCSS()`**

Find where `generateIndexCSS(prefs)` is called in `contractToBlueprint()`. Pass `contract` as second argument.

**Step 4: Type check**

```bash
cd /Users/ammishra/VibeStack/platform && bunx tsc --noEmit -p tsconfig.server.json 2>&1 | head -50
```

**Step 5: Run tests**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test
```

**Step 6: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add server/lib/app-blueprint.ts
git commit -m "feat: inject archetype-specific font pair into generated app CSS"
```

---

### Task 9: Add `recharts` to snapshot dependencies

**Files:**
- Modify: `snapshot/package-base.json`

**Step 1: Add recharts**

```json
{
  "dependencies": {
    ...existing deps...,
    "recharts": "^2.15.0"
  }
}
```

> Note: Recharts v2 (not v3) is used — v3 is still in alpha as of early 2026.

**Step 2: Commit**

```bash
cd /Users/ammishra/VibeStack/platform
git add snapshot/package-base.json
git commit -m "chore: add recharts to generated app dependencies (for chart skills)"
```

---

## Phase 4: Verification

---

### Task 10: Full type check, lint, test

**Step 1: Type check both configs**

```bash
cd /Users/ammishra/VibeStack/platform
bunx tsc --noEmit
bunx tsc --noEmit -p tsconfig.server.json
```

Expected: Zero errors. Fix any issues before proceeding.

**Step 2: Run all tests**

```bash
cd /Users/ammishra/VibeStack/platform && bun run test
```

Expected: All tests pass (including existing tests). If new tests are failing, fix the implementations.

**Step 3: Run lint**

```bash
cd /Users/ammishra/VibeStack/platform && bun run lint
```

Expected: Zero lint errors. Fix any `oxlint` issues.

**Step 4: Commit final state**

```bash
cd /Users/ammishra/VibeStack/platform
git add -p  # review and stage any remaining changes
git commit -m "feat: Design Engine v2 — archetype-driven skills library, rich app layouts"
```

---

## Verification Checklist

After completing all tasks, verify:

1. `bunx tsc --noEmit` — zero type errors
2. `bunx tsc --noEmit -p tsconfig.server.json` — zero server type errors
3. `bun run test` — all tests pass
4. `bun run lint` — zero lint errors
5. Manual spot-check: run `deriveDesignSpec()` with a recipe contract → expect `storefront` archetype + `CardGrid` list skill + `ProductDetail` detail skill
6. Manual spot-check: run `deriveDesignSpec()` with a finance contract → expect `dashboard` archetype + `TransactionFeed` + `hasDashboard: true`

---

## ★ Template Guide — What Each Skill Must Include

Every skill template function must return a **complete, compilable React component** string. Use the existing `assembleListPage()` in `assembler.ts` as your reference for:

- Import statements (createFileRoute, useQuery, useMutation, useQueryClient, Link from @tanstack/react-router, supabase from @/lib/supabase, shadcn components)
- TanStack Query patterns (`useQuery({ queryKey, queryFn })`, `useMutation({ mutationFn, onSuccess })`)
- Route registration (`export const Route = createFileRoute(...)`)
- Error/loading states (`if (query.isPending) return <...>`)
- Empty state (always include — apps look broken without it)

**What makes skills different from the generic assembler:**

| Generic Assembler | Skills |
|---|---|
| `<table>` with columns | Image cards, magazine grids, feed items |
| Always same layout | Layout matches domain (food ≠ finance ≠ blog) |
| `<Dialog>` create form | Inline forms, sidebar forms, or floating forms |
| Always `bg-card border rounded-md` | Archetype-appropriate card styles |
| No hero | FullscreenHero, MagazineHeader, etc. |
| `Badge` for status | Color-coded badges matching archetype |

---

## File Creation Summary

```
server/lib/
  design-spec.ts           ← NEW (Task 1)
  unsplash.ts              ← NEW (Task 3)
  skill-classifier.ts      ← NEW (Task 2)
  skills/
    index.ts               ← NEW (Task 4)
    list.ts                ← NEW (Task 5)
    detail.ts              ← NEW (Task 6)

tests/
  design-spec.test.ts      ← NEW (Task 1)
  skill-classifier.test.ts ← NEW (Task 2)
  skills-list.test.ts      ← NEW (Task 5)
  skills-detail.test.ts    ← NEW (Task 6)

server/lib/agents/
  orchestrator.ts          ← MODIFY (Task 7)
  assembler.ts             ← MODIFY (Task 7, minor)

server/lib/
  app-blueprint.ts         ← MODIFY (Task 8)

snapshot/
  package-base.json        ← MODIFY (Task 9)
```
