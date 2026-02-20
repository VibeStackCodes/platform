# Section Composition Engine — Design Document

**Date**: 2026-02-19
**Status**: Approved
**Prototype**: `/tmp/recipepress-demo/` (local Vite app demonstrating section composition output)

## Problem

Every generated app looks identical: nav bar, card grid, card grid, card grid. Whether a user asks for a recipe blog, photography portfolio, or fitness tracker, the public pages use the same `buildPublicEntityListRoute()` producing 3-column cards. The only visual difference between themes is CSS variables (fonts, colors, border-radius).

**Root causes** (from creative rigidity audit):
1. Single `homepageRoute()` for all 12 themes — always hero + card grid
2. `buildPublicEntityListRoute()` always produces `grid-cols-3` with `<Card>`
3. `buildPublicEntityDetailRoute()` always produces title + metadata + back link
4. Templates are data-blind — they don't consider entity semantics (recipes vs photos vs events)
5. `imagery` token from Design Agent is never consumed in layout decisions
6. File tree is closed — no way to add custom section components

## Solution: Section Composition

Replace rigid page generators with a **section library + LLM composer** architecture.

### Architecture

```
User prompt → Analyst → SchemaContract + PRD
                                ↓
                     Design Agent (theme + tokens)
                                ↓
                     Page Composer (1 cheap LLM call)
                     Input: entity shapes + section catalog + theme
                     Output: PageCompositionPlan (JSON)
                                ↓
                     Section Renderers (deterministic)
                     Each section: (SectionContext) → JSX string
                                ↓
                     Assembled route files
```

### Section Library (~40-60 sections)

Organized by function. Each section is a pure function `(SectionContext) → string` producing self-contained JSX with Tailwind classes.

| Category | Sections | Count |
|----------|---------|-------|
| **Heroes** | fullbleed-image, split-text-image, centered-minimal, video-bg, animated-gradient, editorial-overlay | ~6 |
| **Navigation** | top-bar, sidebar, editorial-minimal, mega-menu | ~4 |
| **Entity Grids** | masonry, bento-asymmetric, magazine-2col, card-grid-3col, horizontal-scroll, table-compact, image-overlay-grid, list-editorial | ~8 |
| **Entity Detail** | hero-overlay, split-sidebar, article-longform, data-dense-card, gallery-slideshow | ~5 |
| **Content Blocks** | editorial-featured, testimonials-carousel, testimonials-quote-wall, stats-bar, timeline, FAQ-accordion, feature-icons, team-grid | ~8 |
| **CTAs** | newsletter-centered, newsletter-split, pricing-cards, download-banner, contact-form | ~5 |
| **Footers** | dark-photo, minimal-border, multi-column, centered-simple | ~4 |
| **Utility** | category-scroll, breadcrumb-bar, search-header, filter-tabs, empty-state, pagination | ~6 |

### SectionContext (shared interface)

```ts
interface SectionContext {
  entityName?: string           // e.g. "recipes"
  columns?: ColumnClassification[] // from column-classifier
  displayColumn?: string        // best label column
  imageColumn?: string          // best image column
  tokens: ThemeTokens           // fonts, colors, spacing, etc.
  appName: string
  config?: Record<string, unknown> // per-section overrides from composer
  allEntities: EntityMeta[]     // for cross-entity references (e.g. homepage featuring multiple entities)
}
```

### Page Composer

Single cheap LLM call (gpt-5-nano or equivalent). Receives:
- Entity names + column shapes (from SchemaContract)
- Section catalog (IDs + 1-line descriptions + compatibility tags)
- Theme tokens (archetype, style preferences, imagery hints)
- App description from analyst PRD

Outputs `PageCompositionPlan`:

```ts
interface PageCompositionPlan {
  pages: Record<string, SectionSlot[]>
}

interface SectionSlot {
  sectionId: string              // e.g. "hero-fullbleed"
  entityBinding?: string         // which entity this section displays
  config?: Record<string, unknown> // overrides
}
```

Example for a recipe blog:
```json
{
  "pages": {
    "/": [
      { "sectionId": "hero-fullbleed", "config": { "headline": "Cook with intention." } },
      { "sectionId": "bento-asymmetric", "entityBinding": "recipes", "config": { "limit": 3 } },
      { "sectionId": "category-scroll", "entityBinding": "recipes" },
      { "sectionId": "editorial-featured", "entityBinding": "blog_posts" },
      { "sectionId": "testimonials-carousel" },
      { "sectionId": "newsletter-centered" },
      { "sectionId": "footer-dark-photo" }
    ],
    "/recipes": [
      { "sectionId": "search-header" },
      { "sectionId": "filter-tabs", "entityBinding": "recipes" },
      { "sectionId": "masonry-grid", "entityBinding": "recipes" }
    ],
    "/recipes/$slug": [
      { "sectionId": "hero-overlay", "entityBinding": "recipes" },
      { "sectionId": "stats-bar", "entityBinding": "recipes" },
      { "sectionId": "split-sidebar", "entityBinding": "recipes" },
      { "sectionId": "card-grid-3col", "entityBinding": "recipes", "config": { "title": "More to Try", "limit": 3 } }
    ]
  }
}
```

### Validation Layer

Before rendering, validate the composition plan:
- Every `sectionId` exists in the section registry
- `entityBinding` references a real entity from SchemaContract
- Required sections present (every page needs nav + at least 1 content section)
- No incompatible section combinations (e.g. two heroes on one page)
- Fallback: if validation fails, use current archetype-based generation (feature flag)

### Cost & Speed Impact

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| LLM calls | 1 (analyst) | 2 (analyst + composer) | +1 nano call |
| Cost per app | ~$0.02 | ~$0.023 | +$0.003 |
| Generation time | ~92s | ~94s | +~2s |
| Visual variety | 5 archetypes (identical within archetype) | ~40-60 sections composed uniquely per app | Orders of magnitude more |

## What Changes

### New Files

1. **`server/lib/section-renderers.ts`** (~1500 lines) — All section renderer functions, organized by category. Each is a pure function producing JSX string.
2. **`server/lib/section-registry.ts`** (~200 lines) — Section metadata catalog (ID, description, compatibility tags, required entity columns). Used by Page Composer prompt and validator.
3. **`server/lib/page-composer.ts`** (~200 lines) — LLM call producing PageCompositionPlan + validation.
4. **`server/lib/page-assembler.ts`** (~150 lines) — Takes validated plan + section renderers → assembled route file strings.

### Modified Files

5. **`server/lib/themed-code-engine.ts`** — Replace `homepageRoute()`, `buildPublicEntityListRoute()`, `buildPublicEntityDetailRoute()` calls with page-assembler dispatch. Keep private CRUD pages unchanged.
6. **`server/lib/agents/schemas.ts`** — Add `PageCompositionPlanSchema`, `SectionSlotSchema` (Zod).
7. **`server/lib/agents/provider.ts`** — Add `composer` role to `PIPELINE_MODELS` (maps to nano model).

### Deleted

8. **`server/lib/theme-layouts.ts`** — Archetype generators replaced by section renderers (keep as fallback behind feature flag initially).

### Unchanged

- Private/admin CRUD pages
- SchemaContract, SQL/types/hooks/routes generation
- Theme tokens, design agent, analyst agent
- Auth pages (login/signup)
- Provisioning + deployment pipeline
- Canape theme-specific routes (these are already section-composed by nature)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM picks incompatible sections | Broken layout | Validator rejects invalid plans; fallback to archetype |
| Section count bloat | Maintenance burden | Start with ~30 high-impact sections; expand based on usage |
| Sections don't compose visually | Ugly output | Each section is self-contained with proper spacing; no cross-section CSS deps |
| Regression on working apps | Broken deployments | Feature flag; archetype fallback; E2E test coverage |
| Nano model produces invalid JSON | Pipeline failure | Two-stage structured output (existing pattern); Zod parse with fallback |

## Success Criteria

1. RecipePress-equivalent quality from pipeline (section-composed homepage, masonry recipes, editorial journal)
2. Two different prompts produce visually distinct layouts (not just different data in same grid)
3. Cost stays under $0.05/app
4. Generation time stays under 120s
5. All existing E2E test prompts (1-11) continue to pass
