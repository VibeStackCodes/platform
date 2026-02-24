# Design: Bespoke LLM Code Generation (Lovable-style)

## Problem

Every generated app looks the same because:
1. `app-blueprint.ts` hardcodes route structure from `SchemaContract` (always: index, about, contact, entity list/detail per table)
2. Section composition engine (50 JSX string renderers) produces identical visual DNA — same Card/Button/Badge, same spacing, same hover effects
3. `SchemaContract` → SQL → seed → pages pipeline assumes database-backed CRUD apps, but generated apps are static (no Supabase client, no React Query)
4. Simple prompts like "build a to-do app" get elaborate multi-page SPAs with heroes, CTAs, testimonials

Lovable generates a to-do app as: 1 page, 1 component, 1 hook, ~225 lines of bespoke code. We generate: 6 pages, 50 section renderers, 1500+ lines of boilerplate.

## Solution

Delete the section composition engine and contract-to-* pipeline. Let the LLM write complete `.tsx` route files directly — bespoke per prompt, like Lovable.

**Key discovery**: `page-generator.ts` already does this correctly. It uses `generateText()` with a closed vocabulary, anti-patterns, and interactivity rules. The problem is everything wrapping it — `app-blueprint.ts` overrides the Creative Director's sitemap with hardcoded contract-derived routes.

## Architecture: Before vs After

### Before (Current)
```
Analyst → PRD + SchemaContract
  ↓
Creative Director → CreativeSpec + DesignSystem
  ↓
app-blueprint.ts → hardcoded routeTree from SchemaContract
  ├── contract-to-sql.ts → SQL migrations (unused by static apps)
  ├── contract-to-seed.ts → seed SQL (unused by static apps)
  ├── contract-to-pages.ts → page stubs from DB tables
  ├── themed-code-engine.ts → composeSectionsV2() → 50 renderers → JSX strings
  │   ├── page-composer.ts → LLM picks sections
  │   └── page-assembler.ts → assembles route files
  └── deterministic-assembly.ts → main.tsx, vite.config, etc.
  ↓
Upload to sandbox → validate → repair → deploy
```

### After (New)
```
Analyst → PRD (NO SchemaContract)
  ↓
Creative Director → CreativeSpec + DesignSystem
  ↓
page-generator.ts → LLM writes complete .tsx per sitemap entry (already exists!)
  ↓
deterministic-assembly.ts → routeTree from CreativeSpec.sitemap, main.tsx, index.css, vite.config
  ↓
Upload to sandbox → validate → repair → deploy
```

## What Gets Deleted

| File | Lines | Reason |
|------|-------|--------|
| `server/lib/schema-contract.ts` | ~400 | No database schema for static apps |
| `server/lib/contract-to-sql.ts` | ~200 | No SQL migrations |
| `server/lib/contract-to-sql-functions.ts` | ~100 | No SQL functions |
| `server/lib/contract-to-seed.ts` | ~260 | No seed data |
| `server/lib/contract-to-pages.ts` | ~74 | Pages from CreativeSpec, not schema |
| `server/lib/page-composer.ts` | ~300 | Section composition eliminated |
| `server/lib/page-assembler.ts` | ~200 | Section assembly eliminated |
| `server/lib/sections/` (14 files) | ~3000 | 50 renderers eliminated |
| `server/lib/agents/feature-schema.ts` | ~600 | Column classifier for section renderers |
| `server/lib/theme-schemas/` | ~400 | Theme-specific schemas (Canape etc.) |
| `server/lib/theme-routes/` | ~1200 | Theme-specific route generators |
| **Total** | **~6700** | |

## What Gets Modified

### 1. `server/lib/agents/orchestrator.ts`

**`runAnalysis()`** — Remove `SchemaContract` from output. Analyst produces PRD only (app name, description, requirements). No database schema needed.

**`runCodeGeneration()`** — Currently calls `buildBlueprintFromTokens()` which goes through `app-blueprint.ts`. Change to:
1. Call `generatePages()` directly with CreativeSpec
2. Call `assembleApp()` for infrastructure files (routeTree, main.tsx, index.css)
3. Merge and upload to sandbox

### 2. `server/lib/app-blueprint.ts`

**Delete**: `generateRouteTree()` that derives from SchemaContract (hardcoded about/contact/entity routes).
**Delete**: All `SchemaContract` imports and usage.
**Delete**: `generateMainTSX()` that includes `QueryClientProvider` and `@tanstack/react-query`.

**Keep**: `loadUIKit()`, `generateIndexHTML()`, `generateDotEnv()`, `generateRootRoute()`.

**Add**: New `generateRouteTree()` that derives from `CreativeSpec.sitemap` — the Creative Director decides routes, not the schema.

**Add**: New `generateMainTSX()` without React Query (static apps don't fetch data).

### 3. `server/lib/deterministic-assembly.ts`

**Modify**: Route tree generation driven by `CreativeSpec.sitemap` instead of `SchemaContract.tables`.

**Modify**: Remove Supabase client generation (`src/lib/supabase.ts`) — static apps don't use it.

**Modify**: `main.tsx` template — remove `QueryClientProvider`, just Router + CSS.

### 4. `server/lib/agents/machine.ts`

**Modify**: Remove `SchemaContract` from `MachineContext`. Add `creativeSpec` if not already there.

**Modify**: Remove `architecting` state if it only existed for blueprint building. The flow becomes: `preparing` → `designing` (Creative Director) → `codeGeneration` (LLM pages + deterministic infra) → `validating` → `deploying`.

### 5. `server/lib/agents/schemas.ts`

**Delete**: `SchemaContractSchema`, `SectionVisualSpecSchema`, `PageCompositionPlanV2Schema`, `SectionIdEnum`.

**Keep**: `AnalystOutputSchema` (modify to drop contract), `CreativeSpecSchema`, `DesignSystemSchema`.

### 6. `server/lib/page-generator.ts`

**Keep as-is** — this file is already correct. It generates complete `.tsx` route files from CreativeSpec using `generateText()` with closed vocabulary.

**One tweak**: The system prompt says "Do NOT generate navigation or footer — these are in __root.tsx". Verify that `deterministic-assembly.ts` generates a `__root.tsx` with the Creative Director's nav/footer design.

### 7. `server/lib/themed-code-engine.ts`

**Modify**: Remove `generateThemedApp()` (calls section composition). Keep `themeCss()` and `buildThemePalette()` — still needed for `index.css` generation.

### 8. `server/lib/agents/validation.ts`

**Keep** — TypeScript, lint, and build checks work regardless of how code was generated. May need to loosen manifest checks since file paths are now LLM-decided (via CreativeSpec sitemap) rather than contract-derived.

### 9. `server/lib/agents/repair.ts`

**Keep** — Repair agent reads validation errors and fixes files via sandbox tools. Works the same regardless of generation method.

## What Gets Kept (Unchanged)

| File | Reason |
|------|--------|
| `server/lib/creative-director.ts` | Design authority — produces CreativeSpec + DesignSystem |
| `server/lib/page-generator.ts` | Already generates bespoke LLM code correctly |
| `server/lib/agents/repair.ts` | Error fixing still needed |
| `server/lib/agents/validation.ts` | Build validation still needed |
| `server/lib/agents/tools.ts` | Sandbox operations still needed |
| `server/lib/agents/provider.ts` | Model routing still needed |
| `server/lib/sandbox.ts` | Sandbox lifecycle |
| `server/lib/github.ts` | GitHub repo creation |
| `server/lib/supabase-mgmt.ts` | Supabase project provisioning (for deploy) |
| `server/routes/agent.ts` | SSE pipeline endpoint |
| `server/lib/unsplash.ts` | Hero image fetching |
| `server/lib/design-knowledge.ts` | Design rules injected into page-gen prompt |
| `snapshot/` | Sandbox Docker image (pre-cached deps) |
| `snapshot/ui-kit/` | shadcn/ui components available to LLM |

## New `main.tsx` Template (No React Query)

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree, scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
```

## New `__root.tsx` with Creative Director's Nav/Footer

The Creative Director already outputs `nav` and `footer` specs. `deterministic-assembly.ts` generates `__root.tsx` with the CD's design:

```tsx
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { /* icons */ } from 'lucide-react'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <>
      {/* Nav generated from CreativeSpec.nav */}
      <nav>...</nav>
      <main><Outlet /></main>
      {/* Footer generated from CreativeSpec.footer */}
      <footer>...</footer>
    </>
  )
}
```

**Decision**: Nav/footer should also be LLM-generated (bespoke). Add a `__root.tsx` entry to the page-generator pipeline alongside the sitemap pages.

## New Route Tree Generation

Currently: hardcoded from SchemaContract tables (always about, contact, entity list/detail).

New: derived from CreativeSpec.sitemap entries.

```typescript
function generateRouteTree(sitemap: CreativeSpec['sitemap']): string {
  const imports = sitemap.map(page => {
    const importName = page.componentName + 'Import'
    return `import { Route as ${importName} } from './routes/${page.fileName.replace('.tsx', '')}'`
  })

  const updates = sitemap.map(page => {
    const importName = page.componentName + 'Import'
    const routeName = page.componentName + 'Route'
    return `const ${routeName} = ${importName}.update({ path: '${page.route}', getParentRoute: () => rootRoute } as any)`
  })

  // ... standard TanStack Router tree assembly
}
```

## Snapshot Changes

### Remove from `package-base.json`
- `@tanstack/react-query` — static apps don't fetch data
- `@supabase/supabase-js` — static apps don't use Supabase client

### Keep in `package-base.json`
- `react`, `react-dom` (React 19)
- `@tanstack/react-router` (file-based routing)
- `tailwindcss`, `tw-animate-css` (styling)
- `lucide-react` (icons)
- All `@radix-ui/*` (shadcn/ui primitives)
- `vite` (build tool)

### Rebuild snapshot after changes
The Daytona snapshot must be rebuilt with updated `package-base.json` to remove unused deps and reduce image size.

## Pipeline Timing Impact

| Stage | Before | After | Change |
|-------|--------|-------|--------|
| Analysis | ~5s (LLM) | ~5s (LLM) | No change |
| Design (Creative Director) | ~8s (LLM) | ~8s (LLM) | No change |
| Blueprint/Architecture | ~3s (deterministic) | 0s (deleted) | -3s |
| Page Composition | ~5s (LLM) | 0s (deleted) | -5s |
| Page Generation | ~15s (LLM, parallel) | ~15s (LLM, parallel) | No change |
| Assembly | ~2s (deterministic) | ~1s (deterministic) | -1s |
| Upload | ~5s | ~3s (fewer files) | -2s |
| Validation | ~10s | ~10s | No change |
| Repair | 0-30s | 0-30s | No change |
| Deploy | ~20s | ~20s | No change |
| **Total** | **~75-100s** | **~62-92s** | **~11s faster** |

## Risk Mitigation

### Risk: LLM generates broken code more often
**Mitigation**: Already have validation gate (tsc, lint, build) + repair agent (2 retries). v0's research shows 78% raw success rate for Claude, rising to 94% with post-processing. Our validation+repair loop is equivalent.

### Risk: LLM generates imports not in closed vocabulary
**Mitigation**: `page-generator.ts` already has extensive CLOSED VOCABULARY and FORBIDDEN sections. Post-generation, we can add a deterministic import validator (like v0's "LLM Suspense") that strips unauthorized imports before upload.

### Risk: Route tree doesn't match generated files
**Mitigation**: Both route tree and page files are derived from the same `CreativeSpec.sitemap`. Single source of truth.

### Risk: Losing SchemaContract breaks edit-machine
**Mitigation**: Edit machine currently uses SchemaContract for context. Modify to use CreativeSpec instead, or keep SchemaContract as optional metadata only for the edit path.

## Implementation Order

1. **Modify `deterministic-assembly.ts`** — generate routeTree from CreativeSpec.sitemap (not SchemaContract)
2. **Modify `orchestrator.ts`** — wire `runCodeGeneration()` to call `generatePages()` + `assembleApp()` directly
3. **Modify `app-blueprint.ts`** — remove SchemaContract dependency, generate main.tsx without React Query
4. **Modify `machine.ts`** — simplify states, remove SchemaContract from context
5. **Delete** contract-to-*, page-composer, page-assembler, sections/, feature-schema, theme-schemas, theme-routes
6. **Update snapshot** — remove @tanstack/react-query, @supabase/supabase-js from package-base.json
7. **Add deterministic post-processing** — import validator, icon name checker (v0-style)
8. **Test** — generate 5 diverse apps, verify visual variety and build success

## Verification Plan

Generate these 5 apps and compare:
1. "Build a to-do app" → expect: 1 page, localStorage, clean minimal UI
2. "Restaurant website" → expect: 4-6 pages, menu/reservations/about, warm palette
3. "Portfolio for a photographer" → expect: 2-3 pages, image-heavy, gallery layout
4. "SaaS landing page for a project management tool" → expect: 1-2 pages, pricing, features, CTA
5. "Recipe collection app" → expect: 2-3 pages, search/filter, card grid, detail view

Each should look visually distinct with app-appropriate structure.
