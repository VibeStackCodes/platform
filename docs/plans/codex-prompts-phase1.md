# Phase 1 Codex Prompts — Capability Compositor

Each prompt below is self-contained. Give one to Codex at a time, in order. After each completes, verify with `bunx tsc --noEmit && bun run test` before moving to the next.

---

## Task 1: Capability Contract Types

```
You are working in the VibeStack platform codebase. Create the capability contract type system.

## What to create

### File: `server/lib/capabilities/types.ts`

Define TypeScript interfaces and Zod schemas for a "Capability" — a self-contained feature contract that declares everything needed to add a feature to a generated web app.

The codebase already has `TableDef` and `ColumnDef` types in `server/lib/schema-contract.ts`. Import and reuse those for the schema field.

```typescript
import { z } from 'zod'
import type { TableDef } from '../schema-contract'
```

#### Interfaces to define:

1. **PageDef** — a route the capability creates:
   - `path: string` (e.g., '/recipes', '/recipes/$id')
   - `type: 'public-list' | 'public-detail' | 'crud-list' | 'crud-detail' | 'interactive' | 'static'`
   - `entity?: string` — database table this page operates on
   - `component?: string` — custom component name (for 'interactive' type)
   - `template?: string` — template name (for 'static' type)

2. **ComponentDef** — a shared UI component:
   - `name: string` (PascalCase, e.g., 'ChatWidget')
   - `type: 'floating' | 'embedded' | 'modal' | 'sidebar'`
   - `props?: Record<string, string>`

3. **NavEntry** — navigation item:
   - `label: string`, `path: string`
   - `position: 'main' | 'footer' | 'sidebar' | 'none'`
   - `icon?: string` (Lucide icon name)
   - `order?: number` (sort order, lower = earlier)

4. **DesignHints** — hints for the polish agent:
   - `cardStyle?: 'media-heavy' | 'text-first' | 'compact' | 'glass'`
   - `heroType?: 'featured-item' | 'text-centered' | 'image-split' | 'none'`
   - Plus `[key: string]: string | undefined` for extensibility

5. **RuntimeConfig** — for managed VibeStack Cloud features:
   - `type: 'managed'`
   - `service: 'mastra-agent' | 'rag-pipeline' | 'webhook-relay' | 'analytics-ingest'`
   - `config: Record<string, unknown>`

6. **Capability** — the main contract:
   - `name: string`, `version: number`, `description: string`
   - `schema: TableDef[]` — database tables
   - `pages: PageDef[]` — routes
   - `components: ComponentDef[]` — UI components
   - `dependencies: { npm: Record<string, string>; capabilities: string[] }`
   - `navEntries: NavEntry[]`
   - `designHints: DesignHints`
   - `runtime?: RuntimeConfig`

Also create a **`CapabilitySchema`** Zod object that validates the Capability interface at runtime. For the `schema` field, use `z.array(z.object({ name: z.string(), columns: z.array(z.any()) }).passthrough())` since columns are validated downstream by SchemaContractSchema.

### File: `tests/capability-types.test.ts`

Write tests that:
1. Validate a minimal capability (recipes with 1 table, 2 pages, 1 nav entry)
2. Reject a capability missing required fields (no name)
3. Validate a capability with runtime config (ai-chatbot)
4. Verify PageDef types are all supported

Use vitest. Import from `@server/capabilities/types` (the `@server/` alias maps to `server/`).

## Verification

Run: `bunx vitest run tests/capability-types.test.ts`
All tests should pass.

## Rules
- Do NOT create any other files
- Do NOT modify any existing files
- Use `import type` for type-only imports
- Export all interfaces AND the CapabilitySchema
```

---

## Task 2: Capability Registry

```
You are working in the VibeStack platform codebase. Create a capability registry with topological dependency resolution.

## Context

`server/lib/capabilities/types.ts` already exists with `Capability` and related interfaces. Read it first to understand the types.

## What to create

### File: `server/lib/capabilities/registry.ts`

A `CapabilityRegistry` class that:

1. **`register(cap: Capability): void`** — stores a capability by name
2. **`get(name: string): Capability | undefined`** — retrieves by name
3. **`list(): Capability[]`** — returns all registered capabilities
4. **`resolve(requested: string[]): Capability[]`** — topological sort that:
   - Takes a list of requested capability names
   - Recursively resolves all `dependencies.capabilities`
   - Returns capabilities in dependency order (deps first)
   - Throws `Error` with capability name if a dependency is not registered
   - Throws `Error` with "circular" in message if circular dependency detected
   - Deduplicates (if auth is needed by both blog and recipes, it appears once)

Implementation: Use a depth-first visit pattern with a `visiting` Set for cycle detection and a `resolved` Set for deduplication.

```typescript
import type { Capability } from './types'
```

### File: `tests/capability-registry.test.ts`

Write tests using vitest:

1. Register and retrieve capabilities
2. List all registered capabilities
3. Resolve dependency graph (blog depends on auth → returns [auth, blog])
4. Throw on missing dependency (blog needs auth, auth not registered)
5. Throw on circular dependency (a → b → a)
6. Deduplicate shared dependencies (blog and recipes both need auth, auth appears once)

Create test fixtures: a minimal `auth` capability (no deps) and a `blog` capability (depends on auth).

## Verification

Run: `bunx vitest run tests/capability-registry.test.ts`
All tests should pass.

## Rules
- Do NOT modify any existing files
- Import from `./types` for Capability type
```

---

## Task 3: Capability Assembler

```
You are working in the VibeStack platform codebase. Create a capability assembler that merges multiple resolved capabilities into a single assembly result.

## Context

Read these files first:
- `server/lib/capabilities/types.ts` — Capability, PageDef, NavEntry, etc.
- `server/lib/capabilities/registry.ts` — CapabilityRegistry
- `server/lib/schema-contract.ts` — SchemaContract, TableDef types (first 150 lines)

## What to create

### File: `server/lib/capabilities/assembler.ts`

Export an `assembleCapabilities(capabilities: Capability[]): AssemblyResult` function.

**Input:** Array of capabilities already in dependency order (from `CapabilityRegistry.resolve()`).

**Output: `AssemblyResult` interface:**
```typescript
export interface AssemblyResult {
  contract: SchemaContract         // Merged tables from all capabilities
  pages: PageDef[]                 // All pages from all capabilities
  components: ComponentDef[]       // All components
  navEntries: NavEntry[]           // Sorted by order then alphabetically
  npmDependencies: Record<string, string>  // Merged npm deps
  designHints: DesignHints         // Last-wins merge per key
  capabilityManifest: string[]     // Ordered list of capability names
  hasAuth: boolean                 // True if 'auth' capability is in manifest
}
```

**Logic:**
1. Iterate capabilities in order
2. **Schema merge:** First table definition wins for each table name (deps come first, so dep tables win). Collect into a `Map<string, TableDef>`.
3. **Page collection:** Collect all pages. Detect route conflicts — if two capabilities define the same `path`, throw an Error with "route conflict" and the path.
4. **Nav entries:** Collect all, then sort by `order` (default 50), then alphabetically by label.
5. **NPM deps:** `Object.assign()` merge (later version wins).
6. **Design hints:** `Object.assign()` merge (last-wins per key).
7. **Manifest:** List of capability names in input order.
8. **hasAuth:** `manifest.includes('auth')`

Import `SchemaContract` from `../schema-contract` and `Capability, PageDef, NavEntry, ComponentDef, DesignHints` from `./types`.

### File: `tests/capability-assembler.test.ts`

Write tests using vitest:

1. Merges schemas from multiple capabilities (auth + blog → profiles + posts tables)
2. Deduplicates tables with same name (first wins)
3. Merges nav entries sorted by order (Home order:0, Blog order:2, About order:99)
4. Merges npm dependencies
5. Collects all pages from all capabilities
6. Detects route conflicts (two capabilities define same path → throws)
7. Collects capability manifest in order
8. Infers auth when auth capability present
9. No auth when auth capability absent

Create test fixtures: minimal auth, blog (depends on auth), and public-website capabilities.

## Verification

Run: `bunx vitest run tests/capability-assembler.test.ts`
All tests should pass.

## Rules
- Do NOT modify any existing files
- Import SchemaContract type from `../schema-contract`
```

---

## Task 4: Core Capability Catalog (5 contracts)

```
You are working in the VibeStack platform codebase. Create 5 core capability contracts and a registry loader.

## Context

Read these files first:
- `server/lib/capabilities/types.ts` — Capability interface
- `server/lib/capabilities/registry.ts` — CapabilityRegistry class
- `server/lib/schema-contract.ts` — TableDef, ColumnDef types (first 200 lines for type definitions)

The generated apps use Supabase (PostgreSQL) with `auth.users` for authentication. Column types must be one of: 'uuid', 'text', 'numeric', 'boolean', 'timestamptz', 'jsonb', 'integer', 'bigint'.

## What to create

### File: `server/lib/capabilities/catalog/auth.ts`

Export `const auth: Capability` with:
- **Tables:** `profiles` (id uuid PK references auth.users(id), display_name text nullable, avatar_url text nullable, created_at timestamptz default now())
- **Pages:** none (auth UI is handled by Supabase Auth built-in)
- **Dependencies:** none
- **Nav entries:** none

### File: `server/lib/capabilities/catalog/public-website.ts`

Export `const publicWebsite: Capability` with:
- **Tables:** none
- **Pages:** `{ path: '/', type: 'static', template: 'landing' }`, `{ path: '/about', type: 'static', template: 'about' }`
- **Dependencies:** none
- **Nav entries:** Home (order: 0), About (order: 99)
- **Design hints:** `{ heroType: 'image-split' }`

### File: `server/lib/capabilities/catalog/blog.ts`

Export `const blog: Capability` with:
- **Tables:**
  - `posts` (id uuid PK, title text NOT NULL, slug text NOT NULL, content text nullable, excerpt text nullable, image_url text nullable, author_id uuid NOT NULL references auth.users(id), published_at timestamptz nullable, created_at timestamptz default now())
  - `categories` (id uuid PK, name text NOT NULL, slug text NOT NULL)
  - `post_categories` (id uuid PK, post_id uuid NOT NULL references posts(id), category_id uuid NOT NULL references categories(id))
- **Pages:** `/blog` (public-list, entity: posts), `/blog/$slug` (public-detail, entity: posts)
- **Dependencies:** capabilities: ['auth']
- **Nav entries:** Blog (order: 2)
- **Design hints:** `{ cardStyle: 'text-first' }`

### File: `server/lib/capabilities/catalog/recipes.ts`

Export `const recipes: Capability` with:
- **Tables:**
  - `recipes` (id uuid PK, title text NOT NULL, description text nullable, image_url text nullable, cook_time integer nullable, servings integer nullable, instructions text nullable, created_at timestamptz default now())
  - `ingredients` (id uuid PK, name text NOT NULL)
  - `recipe_ingredients` (id uuid PK, recipe_id uuid NOT NULL references recipes(id), ingredient_id uuid NOT NULL references ingredients(id), quantity text nullable, unit text nullable)
  - `tags` (id uuid PK, name text NOT NULL)
  - `recipe_tags` (id uuid PK, recipe_id uuid NOT NULL references recipes(id), tag_id uuid NOT NULL references tags(id))
- **Pages:** `/recipes` (public-list, entity: recipes), `/recipes/$id` (public-detail, entity: recipes)
- **Dependencies:** capabilities: [] (recipes can work without auth for public browsing)
- **Nav entries:** Recipes (order: 1)
- **Design hints:** `{ cardStyle: 'media-heavy', heroType: 'featured-item' }`

### File: `server/lib/capabilities/catalog/portfolio.ts`

Export `const portfolio: Capability` with:
- **Tables:**
  - `projects` (id uuid PK, title text NOT NULL, description text nullable, image_url text nullable, url text nullable, created_at timestamptz default now())
  - `skills` (id uuid PK, name text NOT NULL, category text nullable)
  - `testimonials` (id uuid PK, author_name text NOT NULL, author_title text nullable, content text NOT NULL, created_at timestamptz default now())
- **Pages:** `/work` (public-list, entity: projects), `/work/$id` (public-detail, entity: projects)
- **Dependencies:** capabilities: ['auth']
- **Nav entries:** Work (order: 1)
- **Design hints:** `{ cardStyle: 'media-heavy', heroType: 'image-split' }`

### File: `server/lib/capabilities/catalog/index.ts`

```typescript
import { CapabilityRegistry } from '../registry'
import { auth } from './auth'
import { publicWebsite } from './public-website'
import { blog } from './blog'
import { recipes } from './recipes'
import { portfolio } from './portfolio'

export function loadCoreRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(auth)
  registry.register(publicWebsite)
  registry.register(blog)
  registry.register(recipes)
  registry.register(portfolio)
  return registry
}
```

### File: `tests/capability-catalog.test.ts`

Write tests:
1. Loads all 5 core capabilities
2. Resolves "recipe website" (public-website + recipes + auth) without error
3. Assembles a blog app — has tables, has auth, has nav entries
4. Assembles a portfolio app — has projects table, has auth
5. Every table has an id column with primaryKey: true
6. No duplicate tables when assembling multiple capabilities sharing auth

Import `loadCoreRegistry` from `@server/capabilities/catalog/index` and `assembleCapabilities` from `@server/capabilities/assembler`.

## Important rules for column definitions

Every column object must include `name` and `type` (from the allowed SQL types above). Additional fields:
- `primaryKey?: true` on id columns
- `default?: string` (e.g., `'gen_random_uuid()'` for uuid PKs, `'now()'` for timestamps)
- `nullable?: boolean` (default false if omitted)
- `references?: { table: string; column: string }` for foreign keys

Every table MUST have an `id uuid` column with `primaryKey: true` and `default: 'gen_random_uuid()'`.

## Verification

Run: `bunx vitest run tests/capability-catalog.test.ts`
All tests should pass.

Run: `bunx tsc --noEmit` — must compile cleanly (check both tsconfig.json and tsconfig.server.json)

## Rules
- Do NOT modify any existing files
- Column types must be one of: 'uuid', 'text', 'numeric', 'boolean', 'timestamptz', 'jsonb', 'integer', 'bigint'
```

---

## Task 5: Wire Assembler into Analyst Pipeline

```
You are working in the VibeStack platform codebase. Wire the capability assembler into the analyst → blueprint pipeline.

## Context

Read these files first:
- `server/lib/capabilities/assembler.ts` — `assembleCapabilities()` and `AssemblyResult`
- `server/lib/capabilities/catalog/index.ts` — `loadCoreRegistry()`
- `server/lib/agents/schemas.ts` — analyst output schema
- `server/lib/agents/orchestrator.ts` — `runAnalysis()` and `runBlueprint()` functions
- `server/lib/agents/machine.ts` — MachineContext and state machine
- `server/lib/app-blueprint.ts` — `contractToBlueprintWithDesignAgent()`

## What to change

### 1. `server/lib/agents/schemas.ts`

Add a `selectedCapabilities` field to the analyst output schema (the Zod schema that the analyst LLM populates via structured output). This should be `z.array(z.string()).describe('Capability names to include: auth, public-website, blog, recipes, portfolio')`.

Also add an `extraTables` field: `z.array(z.any()).optional().describe('Additional tables not covered by any capability')` — for tables the LLM wants that aren't in any capability.

### 2. `server/lib/agents/orchestrator.ts` — `runAnalysis()`

After the analyst returns structured output:
1. Import `loadCoreRegistry` and `assembleCapabilities`
2. Resolve selected capabilities via `registry.resolve(selectedCapabilities)`
3. Call `assembleCapabilities(resolved)` to get `AssemblyResult`
4. If `extraTables` is provided, merge those into `assemblyResult.contract.tables` (avoid duplicates)
5. Return the merged `SchemaContract` as the contract (this keeps backward compatibility — downstream code just sees a SchemaContract)
6. Also return `capabilityManifest: assemblyResult.capabilityManifest`

**Important:** Wrap the capability resolution in a try/catch. If any capability name is not in the registry, fall back to the raw LLM-generated contract (backward compatibility for prompts that don't match any capability).

### 3. `server/lib/agents/machine.ts`

Add to `MachineContext`:
```typescript
capabilityManifest: string[]  // Active capability names
```

Initialize to `[]` in the initial context.

In the `preparing.onDone` transition where analysis results are assigned to context, also assign `capabilityManifest`.

### 4. `tests/orchestrator-analysis.test.ts`

Update existing tests to handle the new `selectedCapabilities` field. Add a test that verifies:
- When analyst selects `['auth', 'public-website', 'recipes']`, the returned contract includes profiles, recipes, ingredients, recipe_ingredients, tags, recipe_tags tables
- capabilityManifest is `['auth', 'public-website', 'recipes']`

## Verification

Run: `bunx tsc --noEmit` — must compile
Run: `bunx vitest run tests/orchestrator-analysis.test.ts` — all pass
Run: `bun run test` — full suite passes

## Rules
- Do NOT break existing tests — the fallback path must keep working
- The analyst LLM prompt needs to be updated to mention available capabilities, but keep the existing schema generation path as fallback
- Use `import type` for type-only imports
```

---

## Task 6: Integrate Assembly into Blueprint Generation

```
You are working in the VibeStack platform codebase. Update blueprint generation to use AssemblyResult when available.

## Context

Read these files first:
- `server/lib/app-blueprint.ts` — `buildBlueprintFromTokens()`, `contractToBlueprintWithDesignAgent()`
- `server/lib/capabilities/assembler.ts` — `AssemblyResult`
- `server/lib/capabilities/types.ts` — `PageDef`, `NavEntry`

## What to change

### 1. `server/lib/app-blueprint.ts`

Add an optional `assembly?: AssemblyResult` parameter to `buildBlueprintFromTokens()`.

When `assembly` is provided:
- Use `assembly.pages` to determine which routes to generate (instead of auto-inferring from schema)
  - `public-list` pages → generate using the archetype public list generator (existing `renderPublicList` from theme-layouts.ts)
  - `public-detail` pages → generate using the archetype public detail generator
  - `crud-list` and `crud-detail` pages → generate using existing `buildEntityListRoute` / `buildEntityDetailRoute`
  - `static` pages → generate from template (landing, about, etc.)
  - `interactive` pages → placeholder component that imports the named component
- Use `assembly.navEntries` for navigation (instead of auto-inferring from entities)
- Merge `assembly.npmDependencies` into the generated package.json

**Important:** When `assembly` is `undefined`, the existing behavior must be 100% unchanged (backward compatibility).

### 2. `server/lib/agents/orchestrator.ts` — `runBlueprint()`

Pass the `AssemblyResult` to `buildBlueprintFromTokens()` when available. The assembly result should be stored in machine context and passed through.

### 3. `tests/app-blueprint.test.ts`

Add tests:
1. When assembly is provided with public-list and public-detail pages, those routes appear in the blueprint
2. When assembly has nav entries, navigation includes those entries
3. When assembly is undefined, behavior is unchanged (existing tests still pass)

## Verification

Run: `bunx tsc --noEmit` — must compile
Run: `bunx vitest run tests/app-blueprint.test.ts` — all pass
Run: `bun run test` — full suite passes

## Rules
- Do NOT break existing tests or existing behavior
- The assembly parameter is optional — all existing code paths must still work
- Do NOT remove any existing functions or exports
```

---

## Task 7: Full Verification

```
You are working in the VibeStack platform codebase. Run the full verification suite to confirm Phase 1 is complete.

## Steps

1. Run TypeScript compilation:
   ```bash
   bunx tsc --noEmit
   ```
   Must have 0 errors.

2. Run linter:
   ```bash
   bun run lint
   ```
   Must have 0 errors.

3. Run full test suite:
   ```bash
   bun run test
   ```
   All tests must pass, including the new capability tests.

4. List all new test files and their test counts:
   ```bash
   bunx vitest run tests/capability-types.test.ts tests/capability-registry.test.ts tests/capability-assembler.test.ts tests/capability-catalog.test.ts --reporter=verbose
   ```

5. Report: list of all new files created, total new test count, any warnings.

## If anything fails

Fix the issue and re-run. Common issues:
- Missing imports → add them
- Type mismatches between Capability.schema and TableDef → ensure column objects match TableDef format
- Test alias `@server/` not resolving → check vitest.config.ts has `resolve.alias` for `@server`

Do NOT skip failing tests or disable them. Fix the root cause.
```
