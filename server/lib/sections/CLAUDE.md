# Sections — 50 Deterministic JSX String Renderers

Pure functions that generate JSX **strings** (not React components) for page composition.

## Files
- `types.ts` — `SectionContext`, `SectionOutput`, `SectionRenderer`, `SectionMeta`, `EntityMeta`, `PrimitiveResult`
- `primitives.ts` — 24 exports: shadcn builders (11), Lucide helper, animation helpers (3), loading states (2), hook builders (2), config resolvers (5)
- `registry.ts` — `SECTION_CATALOG` (46 entries with metadata), `getSectionMeta()`, `buildComposerCatalogPrompt()`
- `index.ts` — Barrel: imports all renderers, exports `getSectionRenderer(id)`
- `heroes.ts` (6), `navigation.ts` (4), `grids.ts` (8), `details.ts` (5), `content.ts` (8), `ctas.ts` (5), `footers.ts` (4), `utility.ts` (6), `domain-restaurant.ts` (4)
- `image-helpers.ts` — Image URL builders with fallback to `img.vibestack.codes`

## Key Patterns
- Renderer signature: `(ctx: SectionContext) => SectionOutput` — pure, deterministic, no side effects
- Returns `{ jsx: string, imports?: string[], hooks?: string[] }` — assembled into .tsx route files
- Primitives return `PrimitiveResult = { jsx: string, import: string }` pairs
- Page assembler's `mergeImports()` deduplicates via exact string matching — emit canonical import strings
- `animateEntrance()` returns `''` when `ctx.tokens.style.motion === 'none'` — safe to interpolate unconditionally

## Gotchas
- Import dedup requires **identical** strings — no extra spaces or alternate quoting
- Entity-bound renderers (grids, details) require `ctx.tableName`, `ctx.dataVar`, `ctx.itemVar` from composition
- Domain-restaurant renderers hardcode table names (`menu_items`, `reservations`) — not generic
- All imports must be declared upfront in `imports` array — no conditional/dynamic imports
- Avoid importing renderers into primitives (circular dep) — primitives depends only on types.ts + image-helpers.ts
