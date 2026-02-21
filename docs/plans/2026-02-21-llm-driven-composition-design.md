# LLM-Driven Page Composition

**Date**: 2026-02-21
**Status**: Approved
**Problem**: Generated apps are visually identical — same structure, same backgrounds, same layout — because the page composer uses gpt-5-nano with deterministic fallbacks.
**Solution**: Upgrade composer to gpt-5.2, remove all fallbacks, and replace the slim `SectionSlot` with a rich `SectionVisualSpec` that constrains LLM output to a closed vocabulary of values our renderers support.

## Architecture

### Pipeline (3 LLM calls total)

| Phase | Model | Calls | Output |
|-------|-------|-------|--------|
| Analyst | gpt-5.2 | 1 | SchemaContract + requirements |
| Design | gpt-5.2 | 1 | ThemeTokens (fonts, colors, style) |
| **Composer** | **gpt-5.2** | **1** | **PageCompositionPlanV2 (all routes + all sections + all visual specs)** |
| Code gen | deterministic | 0 | Renderers execute specs |
| Validation | deterministic | 0 | tsc + oxlint |

### No Fallbacks

If the LLM call fails or the output fails validation, the pipeline **throws**. No `fallbackCompositionPlan()`. If it breaks, it's a pipeline bug to fix.

## SectionVisualSpec Schema

Every field except copywriting text is constrained to a closed enum.

### Closed Vocabularies

**SectionIdEnum** (50 values) — exact renderer IDs from `SECTION_IDS` in `types.ts`:
- Heroes (6): `hero-fullbleed`, `hero-split`, `hero-centered`, `hero-video`, `hero-gradient`, `hero-editorial`
- Navigation (4): `nav-topbar`, `nav-sidebar`, `nav-editorial`, `nav-mega`
- Grids (8): `grid-masonry`, `grid-bento`, `grid-magazine`, `grid-cards-3col`, `grid-horizontal`, `grid-table`, `grid-image-overlay`, `grid-list-editorial`
- Detail (5): `detail-hero-overlay`, `detail-split-sidebar`, `detail-article`, `detail-data-dense`, `detail-gallery`
- Content (8): `content-featured`, `content-testimonials-carousel`, `content-testimonials-wall`, `content-stats`, `content-timeline`, `content-faq`, `content-features`, `content-team`
- CTAs (5): `cta-newsletter`, `cta-newsletter-split`, `cta-pricing`, `cta-download`, `cta-contact`
- Footers (4): `footer-dark-photo`, `footer-minimal`, `footer-multi-column`, `footer-centered`
- Utility (6): `util-category-scroll`, `util-breadcrumb`, `util-search-header`, `util-filter-tabs`, `util-empty-state`, `util-pagination`
- Domain (4): `domain-menu-archive`, `domain-menu-category`, `domain-reservation-form`, `domain-services-list`

**SectionBgEnum** (8 values) — maps to exact Tailwind classes:

| Value | Tailwind class |
|-------|---------------|
| `default` | `bg-background` |
| `muted` | `bg-muted/30` |
| `muted-strong` | `bg-muted/50` |
| `accent` | `bg-primary/10` |
| `dark` | `bg-foreground text-background` |
| `dark-overlay` | image + `bg-black/70` overlay |
| `gradient-down` | `bg-gradient-to-b from-background to-muted/30` |
| `gradient-up` | `bg-gradient-to-t from-muted/30 to-background` |

**SpacingEnum** (3 values):

| Value | Tailwind class |
|-------|---------------|
| `compact` | `py-8 md:py-12` |
| `normal` | `py-12 md:py-16` |
| `generous` | `py-16 md:py-24 lg:py-32` |

**CardVariantEnum** (4 values):

| Value | Visual |
|-------|--------|
| `elevated` | `shadow-lg hover:shadow-xl rounded-xl` |
| `flat` | `border border-border rounded-lg` |
| `glass` | `bg-card/70 backdrop-blur-md border border-border/50` |
| `image-overlay` | image fills card, text on gradient overlay |

**GridColumnsEnum**: `2`, `3`, `4` (desktop; always 1 mobile, 2 tablet)

**ImageAspectEnum**: `video` (16:9), `square` (1:1), `4/3`, `3/2`, `21/9` (cinematic)

### Complete Schema

```typescript
SectionVisualSpecSchema = z.object({
  sectionId: SectionIdEnum,
  entityBinding: z.string().optional(),
  background: SectionBgEnum.default('default'),
  spacing: SpacingEnum.default('normal'),
  cardVariant: CardVariantEnum.optional(),
  gridColumns: GridColumnsEnum.optional(),
  imageAspect: ImageAspectEnum.optional(),
  showBadges: z.boolean().default(true),
  showMetadata: z.boolean().default(true),
  text: TextConfigSchema.optional(),  // headline, subtext, buttonLabel, emptyStateMessage
  limit: z.number().int().min(1).max(24).optional(),
})

RouteSpecSchema = z.object({
  path: z.string().min(1),
  sections: z.array(SectionVisualSpecSchema).min(1).max(10),
})

PageCompositionPlanV2Schema = z.object({
  routes: z.array(RouteSpecSchema).min(1),
  globalNav: SectionIdEnum.optional(),
  globalFooter: SectionIdEnum.optional(),
})
```

### Text Config (only free-form fields)

```typescript
TextConfigSchema = z.object({
  headline: z.string().max(80).optional(),
  subtext: z.string().max(200).optional(),
  buttonLabel: z.string().max(30).optional(),
  emptyStateMessage: z.string().max(100).optional(),
})
```

## Renderer Config Consumption

Renderers read visual specs from `ctx.config` via primitive helpers:

```typescript
// primitives.ts adds:
resolveBg(config)      // → Tailwind bg class string
resolveSpacing(config)  // → Tailwind py-* class string
resolveCardVariant(config) // → Tailwind card classes
resolveGridCols(config)    // → Tailwind grid-cols-* class
resolveImageAspect(config) // → Tailwind aspect-* class
```

Page assembler maps `SectionVisualSpec` fields into `SectionContext.config`.

## LLM-Driven Route Architecture

Routes are no longer mechanical `/{entity}/`. The LLM decides:
- Route paths based on domain language (`/journal/` not `/posts/`, `/menu/` not `/menu-items/`)
- Which utility sections go where (search on lists, breadcrumbs on details)
- Homepage content composition (which entities to feature, testimonials vs stats)
- Visual rhythm via alternating backgrounds (`default` → `muted` → `default` → `accent`)

## Files Changed

| File | Change |
|------|--------|
| `server/lib/agents/schemas.ts` | Add V2 schemas |
| `server/lib/agents/provider.ts` | `composer: 'gpt-5.2'` |
| `server/lib/page-composer.ts` | V2 schema, remove fallbacks, enrich prompt |
| `server/lib/sections/primitives.ts` | Add `resolveBg()`, `resolveSpacing()`, etc. |
| `server/lib/sections/*.ts` (9 files) | Renderers read config via primitives |
| `server/lib/page-assembler.ts` | Map `SectionVisualSpec` → `SectionContext.config` |
| `server/lib/sections/types.ts` | Update types to V2 |

## Cost Impact

- Old: gpt-5-nano (~$0.001/app) + deterministic fallback
- New: gpt-5.2 (~$0.02-0.05/app) — every app gets LLM-composed layout
- Total per app: ~$0.04-0.07 (still under $0.10)
