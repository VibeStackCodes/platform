# LLM-Driven Page Composition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the gpt-5-nano page composer with gpt-5.2, remove all fallback paths, and add closed-vocabulary visual specs (`SectionVisualSpec`) that renderers consume for backgrounds, spacing, card styles, and grid columns.

**Architecture:** The LLM composer returns a `PageCompositionPlanV2` containing `RouteSpec[]` with `SectionVisualSpec[]`. Each visual spec has enum-constrained fields (background, spacing, cardVariant, gridColumns, imageAspect) that map to exact Tailwind classes via resolver functions in `primitives.ts`. The page assembler maps visual spec fields into `SectionContext.config`, and each renderer reads them.

**Tech Stack:** TypeScript, Zod v4, Mastra Agent, Vitest, tw-animate-css, shadcn/ui

**Design doc:** `docs/plans/2026-02-21-llm-driven-composition-design.md`

---

### Task 1: Add V2 Schemas to `schemas.ts`

**Files:**
- Modify: `server/lib/agents/schemas.ts`
- Test: `tests/composition-v2-schemas.test.ts`

**Step 1: Write the failing test**

Create `tests/composition-v2-schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  SectionVisualSpecSchema,
  RouteSpecSchema,
  PageCompositionPlanV2Schema,
} from '@server/lib/agents/schemas'

describe('SectionVisualSpecSchema', () => {
  it('accepts valid spec with all fields', () => {
    const result = SectionVisualSpecSchema.safeParse({
      sectionId: 'hero-fullbleed',
      background: 'dark-overlay',
      spacing: 'generous',
      text: { headline: 'Welcome', subtext: 'Hello world' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown sectionId', () => {
    const result = SectionVisualSpecSchema.safeParse({
      sectionId: 'hero-nonexistent',
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown background value', () => {
    const result = SectionVisualSpecSchema.safeParse({
      sectionId: 'hero-fullbleed',
      background: 'rainbow',
    })
    expect(result.success).toBe(false)
  })

  it('applies defaults for background and spacing', () => {
    const result = SectionVisualSpecSchema.parse({ sectionId: 'grid-cards-3col', entityBinding: 'recipes' })
    expect(result.background).toBe('default')
    expect(result.spacing).toBe('normal')
    expect(result.showBadges).toBe(true)
    expect(result.showMetadata).toBe(true)
  })

  it('enforces text max lengths', () => {
    const result = SectionVisualSpecSchema.safeParse({
      sectionId: 'cta-newsletter',
      text: { headline: 'x'.repeat(81) },
    })
    expect(result.success).toBe(false)
  })

  it('accepts all 50 section IDs', () => {
    const ids = [
      'hero-fullbleed', 'hero-split', 'hero-centered', 'hero-video', 'hero-gradient', 'hero-editorial',
      'nav-topbar', 'nav-sidebar', 'nav-editorial', 'nav-mega',
      'grid-masonry', 'grid-bento', 'grid-magazine', 'grid-cards-3col',
      'grid-horizontal', 'grid-table', 'grid-image-overlay', 'grid-list-editorial',
      'detail-hero-overlay', 'detail-split-sidebar', 'detail-article', 'detail-data-dense', 'detail-gallery',
      'content-featured', 'content-testimonials-carousel', 'content-testimonials-wall',
      'content-stats', 'content-timeline', 'content-faq', 'content-features', 'content-team',
      'cta-newsletter', 'cta-newsletter-split', 'cta-pricing', 'cta-download', 'cta-contact',
      'footer-dark-photo', 'footer-minimal', 'footer-multi-column', 'footer-centered',
      'util-category-scroll', 'util-breadcrumb', 'util-search-header',
      'util-filter-tabs', 'util-empty-state', 'util-pagination',
      'domain-menu-archive', 'domain-menu-category', 'domain-reservation-form', 'domain-services-list',
    ]
    for (const id of ids) {
      expect(SectionVisualSpecSchema.safeParse({ sectionId: id }).success).toBe(true)
    }
  })
})

describe('PageCompositionPlanV2Schema', () => {
  it('accepts valid plan with globalNav and globalFooter', () => {
    const result = PageCompositionPlanV2Schema.safeParse({
      globalNav: 'nav-editorial',
      globalFooter: 'footer-multi-column',
      routes: [
        {
          path: '/',
          sections: [
            { sectionId: 'hero-fullbleed', background: 'dark-overlay', spacing: 'generous' },
            { sectionId: 'content-featured', entityBinding: 'recipes', background: 'default' },
            { sectionId: 'cta-newsletter', background: 'muted' },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects plan with no routes', () => {
    const result = PageCompositionPlanV2Schema.safeParse({ routes: [] })
    expect(result.success).toBe(false)
  })

  it('rejects route with no sections', () => {
    const result = PageCompositionPlanV2Schema.safeParse({
      routes: [{ path: '/', sections: [] }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects route with >10 sections', () => {
    const sections = Array.from({ length: 11 }, () => ({ sectionId: 'content-stats' }))
    const result = PageCompositionPlanV2Schema.safeParse({
      routes: [{ path: '/', sections }],
    })
    expect(result.success).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test tests/composition-v2-schemas.test.ts
```

Expected: FAIL — `SectionVisualSpecSchema` does not exist yet.

**Step 3: Write the schemas**

In `server/lib/agents/schemas.ts`, **keep** the existing `SectionSlotSchema` and `PageCompositionPlanSchema` (they're still referenced by old code during migration). Add the new V2 schemas below them:

```typescript
// ---------------------------------------------------------------------------
// Section Composition V2 — LLM-driven visual specs (closed vocabulary)
// ---------------------------------------------------------------------------

/** All 50 section renderer IDs from SECTION_IDS in types.ts */
const SectionIdEnum = z.enum([
  'hero-fullbleed', 'hero-split', 'hero-centered', 'hero-video', 'hero-gradient', 'hero-editorial',
  'nav-topbar', 'nav-sidebar', 'nav-editorial', 'nav-mega',
  'grid-masonry', 'grid-bento', 'grid-magazine', 'grid-cards-3col',
  'grid-horizontal', 'grid-table', 'grid-image-overlay', 'grid-list-editorial',
  'detail-hero-overlay', 'detail-split-sidebar', 'detail-article', 'detail-data-dense', 'detail-gallery',
  'content-featured', 'content-testimonials-carousel', 'content-testimonials-wall',
  'content-stats', 'content-timeline', 'content-faq', 'content-features', 'content-team',
  'cta-newsletter', 'cta-newsletter-split', 'cta-pricing', 'cta-download', 'cta-contact',
  'footer-dark-photo', 'footer-minimal', 'footer-multi-column', 'footer-centered',
  'util-category-scroll', 'util-breadcrumb', 'util-search-header',
  'util-filter-tabs', 'util-empty-state', 'util-pagination',
  'domain-menu-archive', 'domain-menu-category', 'domain-reservation-form', 'domain-services-list',
]).describe('Exact section renderer ID from our 50-section catalog.')

const SectionBgEnum = z.enum([
  'default',        // bg-background
  'muted',          // bg-muted/30
  'muted-strong',   // bg-muted/50
  'accent',         // bg-primary/10
  'dark',           // bg-foreground text-background
  'dark-overlay',   // image + bg-black/70 overlay
  'gradient-down',  // bg-gradient-to-b from-background to-muted/30
  'gradient-up',    // bg-gradient-to-t from-muted/30 to-background
]).describe(
  'Section background style. "default"=base bg, "muted"=subtle grey, '
  + '"dark"=inverted, "dark-overlay"=image+scrim, "gradient-*"=directional.'
)

const SpacingEnum = z.enum([
  'compact',   // py-8 md:py-12
  'normal',    // py-12 md:py-16
  'generous',  // py-16 md:py-24 lg:py-32
]).describe('Vertical padding. "compact" for data-dense, "generous" for heroes/CTAs.')

const CardVariantEnum = z.enum([
  'elevated',      // shadow-lg hover:shadow-xl rounded-xl
  'flat',          // border border-border rounded-lg
  'glass',         // bg-card/70 backdrop-blur-md border-border/50
  'image-overlay', // image fills card, text on gradient
]).describe('Card visual style. Only for grid/detail/content sections with cards.')

const GridColumnsEnum = z.enum(['2', '3', '4'])
  .describe('Desktop grid columns (lg breakpoint). Always 1 mobile, 2 tablet.')

const ImageAspectEnum = z.enum(['video', 'square', '4/3', '3/2', '21/9'])
  .describe('Image aspect ratio. video=16:9, square=1:1, 21/9=cinematic.')

const TextConfigSchema = z.object({
  headline: z.string().max(80).optional()
    .describe('Section headline. Max 80 chars.'),
  subtext: z.string().max(200).optional()
    .describe('Supporting paragraph. Max 200 chars.'),
  buttonLabel: z.string().max(30).optional()
    .describe('CTA button text. Max 30 chars.'),
  emptyStateMessage: z.string().max(100).optional()
    .describe('Message when list is empty. Max 100 chars.'),
}).describe('Copywriting overrides — the only free-form text fields.')

export const SectionVisualSpecSchema = z.object({
  sectionId: SectionIdEnum,
  entityBinding: z.string().optional()
    .describe('Entity table name (e.g. "recipes"). REQUIRED for grid/detail/content-featured/utility.'),
  background: SectionBgEnum.default('default'),
  spacing: SpacingEnum.default('normal'),
  cardVariant: CardVariantEnum.optional()
    .describe('Card style. Only for sections that render cards.'),
  gridColumns: GridColumnsEnum.optional()
    .describe('Desktop grid columns. Only for grid sections.'),
  imageAspect: ImageAspectEnum.optional()
    .describe('Image aspect ratio. Only for image-bearing sections.'),
  showBadges: z.boolean().default(true)
    .describe('Show category/tag badges on cards.'),
  showMetadata: z.boolean().default(true)
    .describe('Show metadata line (date, time, etc.) on cards.'),
  text: TextConfigSchema.optional()
    .describe('Copywriting overrides.'),
  limit: z.number().int().min(1).max(24).optional()
    .describe('Max items in grid/list. 3-12 typical.'),
})

export const RouteSpecSchema = z.object({
  path: z.string().min(1)
    .describe('Route path. Examples: "/", "/recipes/", "/recipes/$slug"'),
  sections: z.array(SectionVisualSpecSchema).min(1).max(10)
    .describe('Ordered sections. First=top, last=bottom.'),
})

export const PageCompositionPlanV2Schema = z.object({
  routes: z.array(RouteSpecSchema).min(1)
    .describe('All app routes. Must include "/" homepage.'),
  globalNav: SectionIdEnum.optional()
    .describe('Nav section auto-prepended to every route (nav-topbar, nav-sidebar, nav-editorial, nav-mega).'),
  globalFooter: SectionIdEnum.optional()
    .describe('Footer section auto-appended to every route.'),
})
```

Also add re-exports of the enum schemas for testing and external use:

```typescript
export { SectionIdEnum, SectionBgEnum, SpacingEnum, CardVariantEnum, GridColumnsEnum, ImageAspectEnum }
```

**Step 4: Run test to verify it passes**

```bash
bun run test tests/composition-v2-schemas.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/lib/agents/schemas.ts tests/composition-v2-schemas.test.ts
git commit -m "feat: add V2 page composition schemas with closed-vocabulary enums"
```

---

### Task 2: Add Config Resolver Helpers to `primitives.ts`

**Files:**
- Modify: `server/lib/sections/primitives.ts`
- Test: `tests/config-resolvers.test.ts`

**Step 1: Write the failing test**

Create `tests/config-resolvers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  resolveBg,
  resolveSpacing,
  resolveCardVariant,
  resolveGridCols,
  resolveImageAspect,
} from '@server/lib/sections/primitives'

describe('resolveBg', () => {
  it('returns bg-background for default', () => {
    expect(resolveBg({ background: 'default' })).toBe('bg-background')
  })
  it('returns bg-muted/30 for muted', () => {
    expect(resolveBg({ background: 'muted' })).toBe('bg-muted/30')
  })
  it('returns bg-foreground text-background for dark', () => {
    expect(resolveBg({ background: 'dark' })).toBe('bg-foreground text-background')
  })
  it('returns bg-background when config is empty', () => {
    expect(resolveBg({})).toBe('bg-background')
  })
  it('maps all 8 values', () => {
    expect(resolveBg({ background: 'muted-strong' })).toBe('bg-muted/50')
    expect(resolveBg({ background: 'accent' })).toBe('bg-primary/10')
    expect(resolveBg({ background: 'dark-overlay' })).toBe('relative')
    expect(resolveBg({ background: 'gradient-down' })).toBe('bg-gradient-to-b from-background to-muted/30')
    expect(resolveBg({ background: 'gradient-up' })).toBe('bg-gradient-to-t from-muted/30 to-background')
  })
})

describe('resolveSpacing', () => {
  it('returns py-8 md:py-12 for compact', () => {
    expect(resolveSpacing({ spacing: 'compact' })).toBe('py-8 md:py-12')
  })
  it('returns py-12 md:py-16 for normal', () => {
    expect(resolveSpacing({ spacing: 'normal' })).toBe('py-12 md:py-16')
  })
  it('returns generous padding', () => {
    expect(resolveSpacing({ spacing: 'generous' })).toBe('py-16 md:py-24 lg:py-32')
  })
  it('defaults to normal', () => {
    expect(resolveSpacing({})).toBe('py-12 md:py-16')
  })
})

describe('resolveCardVariant', () => {
  it('returns elevated classes', () => {
    expect(resolveCardVariant({ cardVariant: 'elevated' })).toContain('shadow-lg')
  })
  it('returns flat classes', () => {
    expect(resolveCardVariant({ cardVariant: 'flat' })).toContain('border-border')
  })
  it('returns glass classes', () => {
    expect(resolveCardVariant({ cardVariant: 'glass' })).toContain('backdrop-blur')
  })
  it('returns empty for image-overlay (handled by renderer)', () => {
    expect(resolveCardVariant({ cardVariant: 'image-overlay' })).toBe('overflow-hidden')
  })
  it('returns elevated by default', () => {
    expect(resolveCardVariant({})).toContain('shadow-lg')
  })
})

describe('resolveGridCols', () => {
  it('returns lg:grid-cols-3 by default', () => {
    expect(resolveGridCols({})).toBe('grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')
  })
  it('maps 2/3/4', () => {
    expect(resolveGridCols({ gridColumns: '2' })).toBe('grid-cols-1 sm:grid-cols-2 lg:grid-cols-2')
    expect(resolveGridCols({ gridColumns: '4' })).toBe('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')
  })
})

describe('resolveImageAspect', () => {
  it('returns aspect-video for video', () => {
    expect(resolveImageAspect({ imageAspect: 'video' })).toBe('aspect-video')
  })
  it('returns aspect-[4/3] for 4/3', () => {
    expect(resolveImageAspect({ imageAspect: '4/3' })).toBe('aspect-[4/3]')
  })
  it('defaults to aspect-[4/3]', () => {
    expect(resolveImageAspect({})).toBe('aspect-[4/3]')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test tests/config-resolvers.test.ts
```

Expected: FAIL — functions don't exist yet.

**Step 3: Add resolver functions to `server/lib/sections/primitives.ts`**

Append to the bottom of the file:

```typescript
// ===========================================================================
// Config → Tailwind class resolvers (V2 visual specs)
// ===========================================================================

const BG_MAP: Record<string, string> = {
  'default': 'bg-background',
  'muted': 'bg-muted/30',
  'muted-strong': 'bg-muted/50',
  'accent': 'bg-primary/10',
  'dark': 'bg-foreground text-background',
  'dark-overlay': 'relative',  // renderer adds image + overlay
  'gradient-down': 'bg-gradient-to-b from-background to-muted/30',
  'gradient-up': 'bg-gradient-to-t from-muted/30 to-background',
}

/** Resolve background enum to Tailwind classes. */
export function resolveBg(config: Record<string, unknown>): string {
  return BG_MAP[(config.background as string) ?? 'default'] ?? 'bg-background'
}

const SPACING_MAP: Record<string, string> = {
  'compact': 'py-8 md:py-12',
  'normal': 'py-12 md:py-16',
  'generous': 'py-16 md:py-24 lg:py-32',
}

/** Resolve spacing enum to Tailwind vertical padding. */
export function resolveSpacing(config: Record<string, unknown>): string {
  return SPACING_MAP[(config.spacing as string) ?? 'normal'] ?? 'py-12 md:py-16'
}

const CARD_VARIANT_MAP: Record<string, string> = {
  'elevated': 'shadow-lg hover:shadow-xl rounded-xl transition-shadow duration-300',
  'flat': 'border border-border rounded-lg',
  'glass': 'bg-card/70 backdrop-blur-md border border-border/50 rounded-xl',
  'image-overlay': 'overflow-hidden',
}

/** Resolve cardVariant enum to Tailwind card classes. */
export function resolveCardVariant(config: Record<string, unknown>): string {
  return CARD_VARIANT_MAP[(config.cardVariant as string) ?? 'elevated'] ?? CARD_VARIANT_MAP.elevated
}

/** Resolve gridColumns enum to responsive Tailwind grid classes. */
export function resolveGridCols(config: Record<string, unknown>): string {
  const cols = (config.gridColumns as string) ?? '3'
  return `grid-cols-1 sm:grid-cols-2 lg:grid-cols-${cols}`
}

const ASPECT_MAP: Record<string, string> = {
  'video': 'aspect-video',
  'square': 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '21/9': 'aspect-[21/9]',
}

/** Resolve imageAspect enum to Tailwind aspect class. */
export function resolveImageAspect(config: Record<string, unknown>): string {
  return ASPECT_MAP[(config.imageAspect as string) ?? '4/3'] ?? 'aspect-[4/3]'
}
```

**Step 4: Run test to verify it passes**

```bash
bun run test tests/config-resolvers.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/lib/sections/primitives.ts tests/config-resolvers.test.ts
git commit -m "feat: add config-to-Tailwind resolver helpers for V2 visual specs"
```

---

### Task 3: Update Types to V2

**Files:**
- Modify: `server/lib/sections/types.ts`

**Step 1: Add V2 type aliases**

Keep existing `SectionSlot`, `PageCompositionPlan` for backward compatibility during migration. Add V2 types that reference the Zod schemas:

At the bottom of `server/lib/sections/types.ts`, add:

```typescript
// ---------------------------------------------------------------------------
// V2 composition plan types (inferred from Zod schemas in agents/schemas.ts)
// ---------------------------------------------------------------------------

import type { z } from 'zod'
import type {
  SectionVisualSpecSchema,
  RouteSpecSchema,
  PageCompositionPlanV2Schema,
} from '../agents/schemas'

export type SectionVisualSpec = z.infer<typeof SectionVisualSpecSchema>
export type RouteSpec = z.infer<typeof RouteSpecSchema>
export type PageCompositionPlanV2 = z.infer<typeof PageCompositionPlanV2Schema>
```

**Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add server/lib/sections/types.ts
git commit -m "feat: add V2 composition plan type aliases"
```

---

### Task 4: Upgrade Model in `provider.ts`

**Files:**
- Modify: `server/lib/agents/provider.ts`

**Step 1: Change the composer model**

In `server/lib/agents/provider.ts`, change line 140:

```typescript
// Before:
  composer: 'gpt-5-nano',

// After:
  composer: 'gpt-5.2',
```

**Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add server/lib/agents/provider.ts
git commit -m "feat: upgrade composer model from gpt-5-nano to gpt-5.2"
```

---

### Task 5: Rewrite `page-composer.ts` — V2 Schema, No Fallbacks, Rich Prompt

**Files:**
- Modify: `server/lib/page-composer.ts`
- Test: `tests/page-composer-v2.test.ts`

**Step 1: Write the failing test**

Create `tests/page-composer-v2.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateCompositionPlanV2 } from '@server/lib/page-composer'
import type { EntityMeta } from '@server/lib/sections/types'
import type { PageCompositionPlanV2 } from '@server/lib/sections/types'

const testEntities: EntityMeta[] = [
  {
    tableName: 'recipes',
    pluralKebab: 'recipes',
    singularTitle: 'Recipe',
    pluralTitle: 'Recipes',
    displayColumn: 'title',
    imageColumn: 'image_url',
    metadataColumns: ['category', 'prep_time'],
    isPrivate: false,
  },
]

describe('validateCompositionPlanV2', () => {
  it('accepts valid plan', () => {
    const plan: PageCompositionPlanV2 = {
      globalNav: 'nav-editorial',
      globalFooter: 'footer-multi-column',
      routes: [
        {
          path: '/',
          sections: [
            { sectionId: 'hero-fullbleed', background: 'dark-overlay', spacing: 'generous' },
            { sectionId: 'content-featured', entityBinding: 'recipes', background: 'default', spacing: 'normal' },
          ],
        },
        {
          path: '/recipes/',
          sections: [
            { sectionId: 'grid-magazine', entityBinding: 'recipes', background: 'default', spacing: 'normal' },
          ],
        },
        {
          path: '/recipes/$slug',
          sections: [
            { sectionId: 'detail-article', entityBinding: 'recipes', background: 'default', spacing: 'normal' },
          ],
        },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects plan missing homepage', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/recipes/', sections: [{ sectionId: 'grid-cards-3col', entityBinding: 'recipes', background: 'default', spacing: 'normal' }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('homepage'))).toBe(true)
  })

  it('rejects section with missing entityBinding when required', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'grid-masonry', background: 'default', spacing: 'normal' }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('entityBinding'))).toBe(true)
  })

  it('rejects duplicate hero on same page (via globalNav counted)', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [
          { sectionId: 'hero-fullbleed', background: 'default', spacing: 'normal' },
          { sectionId: 'hero-split', background: 'default', spacing: 'normal' },
        ] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('hero'))).toBe(true)
  })

  it('rejects unknown entityBinding', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'grid-cards-3col', entityBinding: 'nonexistent', background: 'default', spacing: 'normal' }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('nonexistent'))).toBe(true)
  })

  it('rejects list page without grid section', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'hero-fullbleed', background: 'default', spacing: 'normal' }] },
        { path: '/recipes/', sections: [{ sectionId: 'content-stats', background: 'default', spacing: 'normal' }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('grid'))).toBe(true)
  })

  it('rejects detail page without detail section', () => {
    const plan: PageCompositionPlanV2 = {
      routes: [
        { path: '/', sections: [{ sectionId: 'hero-fullbleed', background: 'default', spacing: 'normal' }] },
        { path: '/recipes/$slug', sections: [{ sectionId: 'content-stats', background: 'default', spacing: 'normal' }] },
      ],
    }
    const result = validateCompositionPlanV2(plan, testEntities)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('detail'))).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test tests/page-composer-v2.test.ts
```

Expected: FAIL — `validateCompositionPlanV2` doesn't exist.

**Step 3: Rewrite `server/lib/page-composer.ts`**

Replace the entire file with:

1. Import `PageCompositionPlanV2Schema` instead of `PageCompositionPlanSchema`
2. Import V2 types from `sections/types`
3. Upgrade agent instructions to the rich prompt with visual rhythm, domain-language routes, section catalog
4. New `composeSectionsV2()` function — no try/catch fallback. Uses `.parse()` (throws on invalid). Validation errors throw.
5. New `validateCompositionPlanV2()` function — validates V2 plan structure (routes array, not pages record)
6. New `buildComposerPromptV2()` — includes: section catalog, visual spec field documentation with enum values, app description, entities, theme style, explicit instructions for visual rhythm and domain-language routes
7. **Remove** `fallbackCompositionPlan()` export and `canapeCompositionPlan()` entirely
8. **Keep** old `validateCompositionPlan()` temporarily (tests reference it) but mark it `@deprecated`

Key changes in the prompt:
- Document every visual spec field and its allowed values
- Instruct LLM to create visual rhythm (alternate backgrounds: default → muted → default → accent)
- Instruct LLM to use domain-language routes ("/journal/" not "/posts/")
- Instruct LLM to vary sections per app type (recipe blog → editorial hero + magazine grid vs SaaS → gradient hero + table grid)
- Include the full section catalog (from `buildComposerCatalogPrompt()`)

The agent temperature stays at 0.3 — structured output with enums doesn't need randomness.

**Step 4: Run test to verify it passes**

```bash
bun run test tests/page-composer-v2.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/lib/page-composer.ts tests/page-composer-v2.test.ts
git commit -m "feat: rewrite page composer with V2 schema, gpt-5.2, no fallbacks"
```

---

### Task 6: Update Page Assembler to Accept V2 Plan

**Files:**
- Modify: `server/lib/page-assembler.ts`
- Test: existing tests in `tests/a11y-assembled-pages.test.ts` should still pass

**Step 1: Update `assemblePages` signature**

The assembler currently takes `PageCompositionPlan` (V1: `{ pages: Record<string, SectionSlot[]> }`).

Add a new function `assemblePagesV2` that:
1. Takes `PageCompositionPlanV2` (`{ routes: RouteSpec[], globalNav?, globalFooter? }`)
2. For each route, prepends `globalNav` and appends `globalFooter` to the sections list
3. Maps each `SectionVisualSpec` into `SectionContext.config` by spreading visual fields:
   ```typescript
   config: {
     background: spec.background,
     spacing: spec.spacing,
     cardVariant: spec.cardVariant,
     gridColumns: spec.gridColumns,
     imageAspect: spec.imageAspect,
     showBadges: spec.showBadges,
     showMetadata: spec.showMetadata,
     limit: spec.limit,
     ...(spec.text ?? {}),
   }
   ```
4. Calls the same `buildSectionContext()` / `buildRouteFile()` internally

Keep `assemblePages` (V1) for backward compatibility until the engine is updated.

**Step 2: Run existing tests**

```bash
bun run test tests/a11y-assembled-pages.test.ts
```

Expected: Existing tests still PASS (we added, didn't break).

**Step 3: Commit**

```bash
git add server/lib/page-assembler.ts
git commit -m "feat: add assemblePagesV2 for V2 composition plans"
```

---

### Task 7: Wire V2 Into `themed-code-engine.ts`

**Files:**
- Modify: `server/lib/themed-code-engine.ts`

**Step 1: Update the engine**

In `generateThemedApp()` (line ~998-1002), change:

```typescript
// Before:
import { fallbackCompositionPlan } from './page-composer'
import { assemblePages } from './page-assembler'
// ...
const plan = fallbackCompositionPlan(entities, tokens)
const composedFiles = assemblePages(plan, entities, tokens, appName)

// After:
import { composeSectionsV2 } from './page-composer'
import { assemblePagesV2 } from './page-assembler'
// ...
const plan = await composeSectionsV2(entities, tokens, appDescription)
const composedFiles = assemblePagesV2(plan, entities, tokens, appName)
```

This means `generateThemedApp` must become `async` (it currently isn't — check the signature).

Look at the current signature: `export function generateThemedApp(...)`. It needs to become `export async function generateThemedApp(...)` since `composeSectionsV2` is async (LLM call).

Also need to add `appDescription: string` parameter (currently the function only takes `contract`, `tokens`, `appName`). The `appDescription` is available from `AnalystOutput.appDescription` — trace the call site to ensure it's passed through.

**Trace the call chain:**
- `themed-code-engine.ts:generateThemedApp(contract, tokens, appName)` — add `appDescription` param
- Callers: search for `generateThemedApp(` to find all call sites and update them

**Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Fix any type errors from the async change and new parameter.

**Step 3: Run full test suite**

```bash
bun run test
```

Expected: All existing tests pass. Some may need updates for the async change.

**Step 4: Commit**

```bash
git add server/lib/themed-code-engine.ts
git commit -m "feat: wire V2 composer into themed-code-engine (async + appDescription)"
```

---

### Task 8: Update Renderers to Read Visual Config

**Files:**
- Modify: `server/lib/sections/heroes.ts`
- Modify: `server/lib/sections/grids.ts`
- Modify: `server/lib/sections/content.ts`
- Modify: `server/lib/sections/ctas.ts`
- Modify: `server/lib/sections/footers.ts`
- Modify: `server/lib/sections/utility.ts`
- Modify: `server/lib/sections/details.ts`
- Modify: `server/lib/sections/navigation.ts`
- Modify: `server/lib/sections/domain-restaurant.ts`

**Step 1: Import resolvers in each renderer file**

At the top of each file, add:

```typescript
import { resolveBg, resolveSpacing, resolveCardVariant, resolveGridCols, resolveImageAspect } from './primitives'
```

**Step 2: Replace hardcoded background/spacing classes**

For each renderer, find the `<section className="..."` line and replace hardcoded values:

```typescript
// Before (example from grids.ts):
const jsx = `<section className="py-12 px-4 md:px-8 bg-background" ...>

// After:
const bg = resolveBg(ctx.config)
const spacing = resolveSpacing(ctx.config)
const jsx = `<section className="${spacing} px-4 md:px-8 ${bg}" ...>
```

Do this systematically for all 50 renderers across 9 files:
- `heroes.ts` (6 renderers): Replace `min-h-screen` padding with `resolveSpacing`, add `resolveBg`
- `grids.ts` (8 renderers): Replace `py-12 bg-background` with resolvers, add `resolveGridCols`, `resolveCardVariant`, `resolveImageAspect`
- `content.ts` (8 renderers): Replace `py-16 px-4` / `py-12 px-4 bg-muted/50` with resolvers
- `ctas.ts` (5 renderers): Replace `bg-muted/30` / padding with resolvers
- `footers.ts` (4 renderers): Replace `bg-background` with `resolveBg`
- `utility.ts` (6 renderers): Replace `bg-background border-b` with resolvers
- `details.ts` (5 renderers): Replace padding with `resolveSpacing`
- `navigation.ts` (4 renderers): Nav sections keep their own bg logic (scroll-aware)
- `domain-restaurant.ts` (4 renderers): Replace with resolvers

**Important:** Heroes should default spacing to `generous` if not set. Footers should keep their own bg logic for `footer-dark-photo`.

**Step 3: Run a11y tests to verify no regressions**

```bash
bun run test tests/a11y-section-renderers.test.ts
```

Expected: All PASS.

**Step 4: Run full type check and lint**

```bash
bunx tsc --noEmit && bun run lint
```

Expected: Clean.

**Step 5: Commit**

```bash
git add server/lib/sections/
git commit -m "feat: renderers read background/spacing/card/grid config from V2 visual specs"
```

---

### Task 9: Update Existing Tests

**Files:**
- Modify: `tests/themed-dry-run.test.ts`
- Modify: `tests/a11y-assembled-pages.test.ts`

**Step 1: Update themed-dry-run.test.ts**

The test calls `generateThemedApp(contract, tokens, appName)`. Update to:
1. Make test async
2. Pass `appDescription` parameter
3. Await the now-async function call

Since this test runs `generateThemedApp` which now calls the real LLM, we need to either:
- Mock the composer call, OR
- Extract the composition into a separate step the test can control

**Recommended**: Mock `composeSectionsV2` in the test to return a fixed plan. This keeps the test fast and deterministic:

```typescript
vi.mock('@server/lib/page-composer', () => ({
  composeSectionsV2: vi.fn().mockResolvedValue({
    globalNav: 'nav-topbar',
    globalFooter: 'footer-minimal',
    routes: [
      { path: '/', sections: [{ sectionId: 'hero-fullbleed', background: 'default', spacing: 'generous' }] },
      // ... entity routes per test scenario
    ],
  }),
}))
```

**Step 2: Update a11y-assembled-pages.test.ts**

Similar — mock the composer or use the V2 assembler directly with test plans.

**Step 3: Run all tests**

```bash
bun run test
```

Expected: All PASS.

**Step 4: Commit**

```bash
git add tests/themed-dry-run.test.ts tests/a11y-assembled-pages.test.ts
git commit -m "test: update existing tests for V2 async composer"
```

---

### Task 10: Remove V1 Dead Code

**Files:**
- Modify: `server/lib/page-composer.ts` — delete `fallbackCompositionPlan`, `canapeCompositionPlan`, old `composeSections`, old `validateCompositionPlan`
- Modify: `server/lib/agents/schemas.ts` — delete `SectionSlotSchema`, `PageCompositionPlanSchema`
- Modify: `server/lib/sections/types.ts` — delete `SectionSlot`, `PageCompositionPlan` interfaces
- Modify: `server/lib/page-assembler.ts` — delete old `assemblePages`, rename `assemblePagesV2` → `assemblePages`
- Modify: `server/lib/themed-code-engine.ts` — update import names

**Step 1: Delete dead code**

Remove all V1 functions and types listed above.

**Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Fix any remaining references to deleted functions/types.

**Step 3: Run full test suite**

```bash
bun run test
```

Expected: All PASS.

**Step 4: Run lint**

```bash
bun run lint
```

Expected: 0 errors.

**Step 5: Commit**

```bash
git add server/lib/page-composer.ts server/lib/agents/schemas.ts server/lib/sections/types.ts server/lib/page-assembler.ts server/lib/themed-code-engine.ts
git commit -m "chore: remove V1 composition dead code (fallbacks, SectionSlot, old schemas)"
```

---

### Task 11: Final Verification

**Step 1: Full type check + lint + test**

```bash
bunx tsc --noEmit && bun run lint && bun run test
```

Expected: Clean on all three.

**Step 2: Run local E2E test**

If `scripts/local-e2e-renderer-test.ts` exists, run it to verify generated apps still compile:

```bash
bun scripts/local-e2e-renderer-test.ts
```

Note: This will now make a real LLM call for composition. Verify the composed plan looks reasonable in the console output.

**Step 3: Commit any final fixes**

```bash
git add -A && git commit -m "chore: final V2 composition verification"
```

---

## Dependency Graph

```
Task 1 (schemas) ──────┐
Task 2 (primitives) ───┤
Task 3 (types) ────────┼── all independent, can run in parallel
Task 4 (provider) ─────┘
                       │
                       ▼
Task 5 (page-composer) ── depends on 1, 3
                       │
                       ▼
Task 6 (page-assembler) ── depends on 3
                       │
                       ▼
Task 7 (themed-engine) ── depends on 5, 6
                       │
                       ▼
Task 8 (renderers) ── depends on 2
                       │
                       ▼
Task 9 (test updates) ── depends on 7
                       │
                       ▼
Task 10 (dead code) ── depends on 9
                       │
                       ▼
Task 11 (verification) ── depends on all
```

**Parallel wave 1:** Tasks 1, 2, 3, 4 (all independent)
**Parallel wave 2:** Tasks 5, 6, 8 (depend on wave 1)
**Sequential:** Tasks 7 → 9 → 10 → 11
