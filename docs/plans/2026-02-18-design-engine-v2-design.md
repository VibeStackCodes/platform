# Design Engine v2 — Design Document

**Date:** 2026-02-18
**Status:** Approved

---

## Problem

All 10 generated apps share the same layout regardless of domain:
- Sticky glass navigation bar
- Page-per-entity (list + detail)
- Data table with create/edit/delete buttons

A recipe app looks identical to a finance tracker. A travel blog looks like a CRM. The apps are **functionally correct but visually interchangeable** — they don't "turn heads."

---

## Goal

Generate apps where the layout, visual language, and interaction patterns match the domain. A recipe app should feel like a recipe app. A travel blog should feel like a magazine. A finance tracker should feel like a dashboard.

---

## Approach: Skills + DesignSpec

**Key insight from WordPress:** Pages are stacks of composable sections (blocks/patterns). Each section is independently swappable. The LLM selects and configures from a curated menu — it does not invent layout.

**Key insight from competitors:** A "Design Guide JSON" tells the generator which archetype to use, which palette, which fonts, which images. Deterministic derivation, no LLM call.

**Our approach:**
1. Derive a `DesignSpec` deterministically from `SchemaContract` (no LLM, no extra cost)
2. Fetch Unsplash hero images for visual richness (API call, deterministic)
3. `frontendAgent` (LLM) receives DesignSpec + candidate skills → outputs `PageSpec` JSON
4. `assembler` renders skill templates from `PageSpec` (deterministic)

---

## Pipeline Change

```
Before:
  analyst(LLM) → SchemaContract → blueprint → ... → frontendAgent(LLM) → pages

After:
  analyst(LLM) → SchemaContract
                     ↓
              deriveDesignSpec() [deterministic]
              fetchHeroImages()  [Unsplash API]
                     ↓
                  DesignSpec
                     ↓
              skillCandidates()  [deterministic rules]
                     ↓
              frontendAgent(LLM) → PageSpec JSON [structured output]
                     ↓
              assembler [deterministic] → rich pages
```

Only 1 LLM call (analyst) + 1 structured-output LLM call (frontendAgent). All other phases deterministic.

---

## DesignSpec Type

```typescript
interface DesignSpec {
  layoutArchetype: LayoutArchetype
  colorMode: 'dark' | 'light'
  palette: ColorPalette        // 12 curated options
  fontPair: FontPair           // 7 curated pairs
  motionIntensity: 'none' | 'subtle' | 'expressive'
  heroImages: HeroImage[]      // from Unsplash
  entityLayouts: Record<string, EntityLayout>  // entity → preferred skills
  navigationStyle: NavStyle
}

type LayoutArchetype =
  | 'editorial'    // magazines, blogs, articles
  | 'storefront'   // recipes, menus, products, catalogs
  | 'dashboard'    // finance, analytics, CRM
  | 'kanban'       // projects, tasks, pipelines
  | 'schedule'     // appointments, bookings, events
  | 'portfolio'    // photography, design work, galleries
  | 'directory'    // people, places, listings
```

### Entity → Archetype Rules (deterministic keyword matching)

| Keywords in entity name | Archetype |
|------------------------|-----------|
| recipe, dish, menu, food, ingredient | `storefront` |
| watch, book, product, catalog, item | `storefront` |
| article, post, blog, author, destination, travel | `editorial` |
| transaction, budget, expense, income, account | `dashboard` |
| project, task, deliverable, deal, lead, contact | `kanban` |
| appointment, booking, slot, event, session | `schedule` |
| photo, gallery, portfolio, artwork | `portfolio` |
| person, place, listing, directory | `directory` |

### Curated Color Palettes (12)

| Name | Background | Foreground | Accent |
|------|-----------|-----------|--------|
| `slate-professional` | `#0f172a` | `#f1f5f9` | `#3b82f6` |
| `emerald-fresh` | `#022c22` | `#f0fdf4` | `#10b981` |
| `amber-warm` | `#1c0a00` | `#fffbeb` | `#f59e0b` |
| `rose-editorial` | `#fff1f2` | `#0f172a` | `#f43f5e` |
| `violet-creative` | `#0f0a1e` | `#f5f3ff` | `#8b5cf6` |
| `zinc-minimal` | `#18181b` | `#fafafa` | `#71717a` |
| `cream-elegant` | `#faf8f5` | `#1c1917` | `#d97706` |
| `navy-luxury` | `#0a0e1a` | `#e2e8f0` | `#c0a060` |
| `forest-organic` | `#0a1a0a` | `#f0fdf4` | `#4ade80` |
| `crimson-bold` | `#1a0505` | `#fff7f7` | `#dc2626` |
| `sky-open` | `#f0f9ff` | `#0c4a6e` | `#0284c7` |
| `sand-earthy` | `#fefce8` | `#1c1401` | `#ca8a04` |

### Archetype → Palette defaults

- `editorial` → `rose-editorial` or `cream-elegant`
- `storefront` → `amber-warm` or `cream-elegant`
- `dashboard` → `slate-professional` or `navy-luxury`
- `kanban` → `zinc-minimal` or `violet-creative`
- `schedule` → `sky-open` or `emerald-fresh`
- `portfolio` → `zinc-minimal` or `navy-luxury`
- `directory` → `slate-professional` or `sky-open`

### Font Pairs (7)

| Name | Display | Body |
|------|---------|------|
| `editorial-serif` | Playfair Display | Source Serif 4 |
| `modern-sans` | Inter Display | Inter |
| `brutalist-mono` | Space Mono | IBM Plex Mono |
| `luxury-serif` | Cormorant Garamond | Lato |
| `magazine-contrast` | Bebas Neue | Libre Baskerville |
| `geometric-clean` | DM Sans | DM Sans |
| `expressive-display` | Syne | DM Mono |

---

## Tailwind v4 Theming

`designSpecToCSS()` generates an `@theme inline` block injected into `index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Serif+4:wght@300;400;600&display=swap');

:root {
  --font-display: 'Playfair Display', serif;
  --font-body: 'Source Serif 4', serif;
}

@theme inline {
  --color-bg: #fff1f2;
  --color-fg: #0f172a;
  --color-accent: #f43f5e;
  --color-muted: #9f1239;
  --color-surface: #ffe4e6;
  --color-border: #fecdd3;
  --font-family-display: var(--font-display);
  --font-family-body: var(--font-body);
}
```

All skill templates use `bg-bg`, `text-fg`, `text-accent`, `bg-surface` etc. — visual theme swaps with zero code changes.

---

## Skills Library (20+ skills)

Skills are typed JSX template string functions. They accept `SkillProps` and return complete section code.

### Category: Navigation (3 skills)

| Skill | When | Description |
|-------|------|-------------|
| `StickyGlassNav` | default | Frosted glass sticky header (current) |
| `EditorialNav` | editorial | Large logo + horizontal links, no glass |
| `SidebarNav` | dashboard/kanban | Fixed sidebar with icons + labels |

### Category: Hero (5 skills)

| Skill | Archetypes | Description |
|-------|-----------|-------------|
| `FullscreenHero` | storefront, portfolio | Full-bleed Unsplash image, overlay text |
| `MagazineHeader` | editorial | Left-aligned bold headline, byline, image grid |
| `DashboardHeader` | dashboard | KPI summary bar, greeting, action buttons |
| `StorefrontHero` | storefront | Centered product-style title + search |
| `KanbanHeader` | kanban | Board title + column count + add button |

### Category: List (8 skills)

| Skill | Archetypes | Description |
|-------|-----------|-------------|
| `CardGrid` | storefront, portfolio | Masonry/grid of image cards |
| `MagazineGrid` | editorial | Featured article + secondary grid |
| `TransactionFeed` | dashboard | Chronological feed with amounts/badges |
| `KanbanBoard` | kanban | Draggable column swimlanes |
| `ScheduleCalendar` | schedule | Week/month calendar grid |
| `MenuGrid` | storefront (food) | Two-column menu with prices |
| `AuthorProfiles` | editorial, directory | Avatar + name + bio cards |
| `DataTable` | fallback | Standard sortable table (fallback only) |

### Category: Detail (5 skills)

| Skill | Description |
|-------|-------------|
| `ProductDetail` | Large hero image + specs + CTA |
| `ArticleReader` | Full-width reading experience |
| `ProfileCard` | Avatar + info + stats sidebar |
| `AppointmentCard` | Date/time + status + actions |
| `FormSheet` | Generic form with field sections |

### Category: Dashboard (4 skills)

| Skill | Description |
|-------|-------------|
| `KPIBar` | Row of metric cards (sum, avg, count) |
| `SpendingChart` | Recharts bar/line for numeric cols |
| `ActivityTimeline` | Scrollable activity feed |
| `QuickStats` | Compact stat grid above list |

---

## PageSpec Type

`frontendAgent` outputs structured `PageSpec` JSON (one per entity):

```typescript
interface PageSpec {
  entity: string
  listPage: {
    skill: SkillVariant
    title: string
    subtitle?: string
    filters: FilterSpec[]
    groupByField?: string
    imageField?: string
    cardFields: string[]        // which entity fields to show on card
    badgeField?: string         // colored badge (status, category)
    emptyState: { message: string; cta: string }
  }
  detailPage: {
    skill: SkillVariant
    heroField?: string          // image/title for hero
    sections: Array<{
      heading: string
      fields: string[]
    }>
  }
  dashboardWidgets?: DashboardWidget[]  // optional KPI/chart widgets
}
```

### frontendAgent prompt change

Before: "Generate React component code for [entity] CRUD pages"
After: "Select skills and configure PageSpec for [entity] from these candidates: [skillCandidates]"

The LLM no longer writes layout code — it configures a menu. The assembler renders from the spec.

---

## New Files

| File | Purpose |
|------|---------|
| `server/lib/design-spec.ts` | `DesignSpec` type, `deriveDesignSpec()`, `designSpecToCSS()` |
| `server/lib/unsplash.ts` | `fetchHeroImages(query, count)` using Unsplash API |
| `server/lib/skill-classifier.ts` | Entity name → skill candidates (deterministic rules) |
| `server/lib/skills/index.ts` | SkillProps type, skill registry, render dispatcher |
| `server/lib/skills/nav.ts` | StickyGlassNav, EditorialNav, SidebarNav |
| `server/lib/skills/hero.ts` | FullscreenHero, MagazineHeader, DashboardHeader, StorefrontHero, KanbanHeader |
| `server/lib/skills/list.ts` | CardGrid, MagazineGrid, TransactionFeed, KanbanBoard, ScheduleCalendar, MenuGrid, AuthorProfiles, DataTable |
| `server/lib/skills/detail.ts` | ProductDetail, ArticleReader, ProfileCard, AppointmentCard, FormSheet |
| `server/lib/skills/dashboard.ts` | KPIBar, SpendingChart, ActivityTimeline, QuickStats |

## Modified Files

| File | Change |
|------|--------|
| `server/lib/agents/orchestrator.ts` | Add `deriveDesignSpec()` + `fetchHeroImages()` after blueprint, pass DesignSpec to frontendAgent |
| `server/lib/agents/registry.ts` | Update frontendAgent instructions: select skills → PageSpec JSON |
| `server/lib/agents/feature-schema.ts` | Add `PageSpecSchema` Zod schema for structured output |
| `server/lib/agents/assembler.ts` | Render from `PageSpec` using skill templates instead of generating layout code |
| `server/lib/app-blueprint.ts` | Add `src/lib/design-tokens.css` to file tree (generated by `designSpecToCSS()`) |
| `snapshot/package-base.json` | Add `recharts` for chart skill |

## Environment Variable Added

| Variable | Purpose |
|----------|---------|
| `UNSPLASH_ACCESS_KEY` | Unsplash API key for hero images |

---

## Fallback Strategy

- If `UNSPLASH_ACCESS_KEY` unset: skip hero images, use gradient backgrounds
- If entity name matches no archetype rules: use `DataTable` for list, `FormSheet` for detail
- If PageSpec validation fails: fall back to current assembled output

---

## Success Criteria

1. Recipe app uses `CardGrid` or `MenuGrid` with food images — not a data table
2. Finance tracker uses `TransactionFeed` + `KPIBar` — not a data table
3. Travel blog uses `MagazineGrid` with hero images — not a data table
4. Color/font theme matches archetype (editorial serif ≠ dashboard mono)
5. `tsc --noEmit` passes
6. All existing tests pass
7. New unit tests cover: `deriveDesignSpec()`, `designSpecToCSS()`, `skillCandidates()`
