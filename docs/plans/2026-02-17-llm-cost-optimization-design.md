# LLM Cost Optimization: Deterministic Maximalist Design

**Date:** 2026-02-17
**Status:** Draft
**Goal:** Eliminate mechanical LLM calls via expanded deterministic generation. Keep LLM only for domain-specific business logic that cannot be derived from schema structure. Reduce cost per generation by ~48%.

---

## Problem Statement

The VibeStack pipeline makes 6 LLM calls per generation at an estimated $0.42 per run. Several of these calls perform tasks that are mechanical — column selection for UI display, standard CRUD procedure generation, and structural code review — yet use frontier models (GPT-5.2, GPT-5.2-codex, GPT-5.1) at premium pricing.

## Current LLM Call Inventory

| # | Purpose | Model | Tokens | Cost | Creative? |
|---|---------|-------|--------|------|-----------|
| 1 | Requirements analysis (NL → SchemaContract) | gpt-5.2 | 1K-6K | ~$0.09 | Very creative |
| 2 | Frontend config (PageConfig per entity, ×N) | gpt-5.2-codex | 600-1.1K | ~$0.07 | Semi-mechanical |
| 3 | Backend procedures (custom tRPC per entity, ×N) | gpt-5.2-codex | 800-2K | ~$0.10 | Partially creative |
| 4 | Code repair (fix build errors, 0-2 rounds) | gpt-5-mini | 500-4K | ~$0.002 | Mechanical |
| 5 | Code review (quality gate) | gpt-5.1 | 5K-22K | ~$0.16 | Mixed |
| 6 | Visual edit (Tier 2 fallback) | gpt-5-mini | 2K-12K | Variable | Creative |
| | | | **Total** | **~$0.42** | |

## Existing Deterministic Infrastructure

The pipeline already has extensive deterministic generation:

- `contractToSQL()` — SchemaContract → PostgreSQL DDL
- `contractToDrizzle()` — SchemaContract → Drizzle ORM schema
- `contractToTrpc()` — SchemaContract → tRPC CRUD routers (with SLOT markers)
- `contractToPages()` — SchemaContract → route skeleton files
- `contractToSeedSQL()` — SchemaContract → deterministic seed INSERT SQL
- `contractToBlueprint()` — Full file manifest assembly (layers 0-5)
- `derivePageFeatureSpec()` — PageConfig (10 fields) → PageFeatureSpec (~40 fields)
- `assembleListPage()` / `assembleDetailPage()` — PageFeatureSpec → React components
- `runDeterministicChecks()` — 5 regex/structural code review checks
- `tryTailwindEdit()` — 25 Tailwind class patterns for visual edit Tier 1

**Key pattern:** The two-stage approach — LLM decides 5-10 fields, deterministic functions derive 40+ fields — is the architectural foundation we extend.

---

## Design: ColumnSemanticClassifier

### Core Concept

A shared module that classifies database columns into semantic types using three signals:
1. **Column name** (regex patterns — inspired by Metabase's `name.clj` classifier)
2. **SQL type** (type constraints — "lat" only matches if float/numeric)
3. **Contract context** (FK references, enum definitions)

### Semantic Type System

```typescript
type SemanticType =
  // Identity
  | 'primary_key' | 'foreign_key' | 'identifier' | 'slug'
  // Personal
  | 'name' | 'first_name' | 'last_name' | 'full_name'
  | 'email' | 'phone' | 'avatar'
  // Content
  | 'title' | 'description' | 'content' | 'comment' | 'notes'
  // Location
  | 'address' | 'city' | 'state' | 'country' | 'zip_code'
  | 'latitude' | 'longitude'
  // Financial
  | 'currency' | 'price' | 'cost' | 'quantity' | 'score' | 'rating'
  // Categorical
  | 'status' | 'type' | 'category' | 'role' | 'enum'
  // Web
  | 'url' | 'image_url' | 'website'
  // Temporal
  | 'created_at' | 'updated_at' | 'timestamp' | 'date' | 'birthdate'
  // Other
  | 'boolean' | 'json' | 'color' | 'generic_text' | 'generic_number'
```

### SemanticTypeInfo Metadata

Each semantic type carries metadata for all downstream consumers:

```typescript
interface SemanticTypeInfo {
  type: SemanticType

  // UI decisions (replaces LLM Call #2 — PageConfig)
  showInList: boolean         // Show in list table view
  listPriority: number        // 1=always, 5=only if space
  displayFormat: ColumnFormat  // text, date, badge, currency, link, boolean
  inputType: InputType         // text, textarea, number, select, date, email, url, checkbox
  detailSection: 'overview' | 'details' | 'metadata' | 'hidden'

  // Seed generation (replaces inferTextValue in contract-to-seed.ts)
  fakerMethod: string | null   // e.g., 'person.fullName', 'internet.email', null for non-text

  // Procedure generation (replaces LLM Call #3 patterns)
  searchable: boolean          // Include in text search procedure
  filterable: boolean          // Generate filter-by procedure
  aggregatable: boolean        // Include in stats aggregation

  // Filtering UI
  filterType: 'search' | 'select' | 'boolean' | 'dateRange' | 'none'
}
```

### Classification Rules

Inspired by Metabase's `name.clj` (50+ patterns), DataHub's classification rules, and our existing `inferTextValue()`. Rules are ordered by specificity (most specific first):

```typescript
const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Primary key
  { namePattern: /^id$/, sqlTypes: ['uuid', 'integer', 'bigint'], semantic: 'primary_key' },

  // Foreign keys (detected by references, not name)
  // Handled specially: col.references → 'foreign_key'

  // Personal - names
  { namePattern: /^first[_]?name$/, sqlTypes: ['text'], semantic: 'first_name' },
  { namePattern: /^last[_]?name$/, sqlTypes: ['text'], semantic: 'last_name' },
  { namePattern: /^full[_]?name$/, sqlTypes: ['text'], semantic: 'full_name' },
  { namePattern: /^(user[_]?)?name$/, sqlTypes: ['text'], semantic: 'name' },

  // Contact
  { namePattern: /e?mail/, sqlTypes: ['text'], semantic: 'email' },
  { namePattern: /phone|mobile|tel/, sqlTypes: ['text'], semantic: 'phone' },

  // Media
  { namePattern: /avatar|image|photo|picture|thumbnail/, sqlTypes: ['text'], semantic: 'image_url' },
  { namePattern: /_url$|^url$|link|website/, sqlTypes: ['text'], semantic: 'url' },

  // Content
  { namePattern: /^title$/, sqlTypes: ['text'], semantic: 'title' },
  { namePattern: /description|summary|abstract/, sqlTypes: ['text'], semantic: 'description' },
  { namePattern: /content|body|text|html|markdown/, sqlTypes: ['text'], semantic: 'content' },
  { namePattern: /comment|note|feedback|review/, sqlTypes: ['text'], semantic: 'comment' },
  { namePattern: /^slug$|_slug$/, sqlTypes: ['text'], semantic: 'slug' },

  // Location (Metabase patterns)
  { namePattern: /^lat(itude)?$|_lat(itude)?$/, sqlTypes: ['numeric', 'float'], semantic: 'latitude' },
  { namePattern: /^lon(gitude)?$|^lng$|_lon(gitude)?$|_lng$/, sqlTypes: ['numeric', 'float'], semantic: 'longitude' },
  { namePattern: /^city$|_city$/, sqlTypes: ['text'], semantic: 'city' },
  { namePattern: /^country|_country$/, sqlTypes: ['text'], semantic: 'country' },
  { namePattern: /^state$|^province$|_state$|_province$/, sqlTypes: ['text'], semantic: 'state' },
  { namePattern: /address|street/, sqlTypes: ['text'], semantic: 'address' },
  { namePattern: /zip[_]?code$|postal[_]?code$/, sqlTypes: ['text'], semantic: 'zip_code' },

  // Financial (Metabase patterns)
  { namePattern: /price|cost|amount|total|fee/, sqlTypes: ['numeric', 'integer', 'bigint'], semantic: 'currency' },
  { namePattern: /quantity|count$|^num_/, sqlTypes: ['integer', 'bigint'], semantic: 'quantity' },
  { namePattern: /score|rating|stars|rank/, sqlTypes: ['numeric', 'integer'], semantic: 'score' },

  // Categorical
  { namePattern: /status/, sqlTypes: ['text'], semantic: 'status' },
  { namePattern: /_type$|^type$/, sqlTypes: ['text'], semantic: 'type' },
  { namePattern: /categor/, sqlTypes: ['text'], semantic: 'category' },
  { namePattern: /^role$|_role$/, sqlTypes: ['text'], semantic: 'role' },
  { namePattern: /color|colour/, sqlTypes: ['text'], semantic: 'color' },

  // Temporal (Metabase updated/created/joined patterns)
  { namePattern: /^created[_]?at$|^created$|^creation[_]?date$/, sqlTypes: ['timestamptz'], semantic: 'created_at' },
  { namePattern: /^updated[_]?at$|^updated$|^modified[_]?at$/, sqlTypes: ['timestamptz'], semantic: 'updated_at' },
  { namePattern: /^birth(day|date)$/, sqlTypes: ['timestamptz', 'text'], semantic: 'birthdate' },

  // Booleans
  { namePattern: /.*/, sqlTypes: ['boolean'], semantic: 'boolean' },

  // JSON
  { namePattern: /.*/, sqlTypes: ['jsonb'], semantic: 'json' },

  // Generic fallbacks (by type)
  { namePattern: /.*/, sqlTypes: ['text'], semantic: 'generic_text' },
  { namePattern: /.*/, sqlTypes: ['integer', 'bigint', 'numeric'], semantic: 'generic_number' },
  { namePattern: /.*/, sqlTypes: ['timestamptz'], semantic: 'timestamp' },
]
```

### SemanticTypeInfo Registry

Each semantic type maps to display/form/seed metadata:

```
primary_key   → showInList:false,  priority:99, format:text,     section:hidden
foreign_key   → showInList:false,  priority:99, format:text,     section:hidden
identifier    → showInList:true,   priority:1,  format:text,     section:overview,  searchable:true
name          → showInList:true,   priority:1,  format:text,     section:overview,  searchable:true,   faker:'person.fullName'
email         → showInList:true,   priority:2,  format:link,     section:overview,  searchable:true,   faker:'internet.email'
phone         → showInList:false,  priority:4,  format:text,     section:details,   faker:'phone.number'
title         → showInList:true,   priority:1,  format:text,     section:overview,  searchable:true,   faker:'lorem.words(3)'
description   → showInList:false,  priority:99, format:text,     section:details,   faker:'lorem.paragraph(1)'
content       → showInList:false,  priority:99, format:text,     section:details,   faker:'lorem.paragraphs(2)'
status        → showInList:true,   priority:2,  format:badge,    section:overview,  filterable:true,   faker:'helpers.arrayElement(["active","pending","completed"])'
category      → showInList:true,   priority:3,  format:badge,    section:overview,  filterable:true
currency      → showInList:true,   priority:2,  format:currency, section:details,   aggregatable:true, faker:'finance.amount'
score         → showInList:true,   priority:3,  format:text,     section:details,   aggregatable:true
url           → showInList:false,  priority:5,  format:link,     section:details,   faker:'internet.url'
image_url     → showInList:false,  priority:5,  format:link,     section:details,   faker:'image.avatar'
created_at    → showInList:true,   priority:4,  format:date,     section:metadata
updated_at    → showInList:false,  priority:5,  format:date,     section:metadata
boolean       → showInList:true,   priority:3,  format:boolean,  section:details,   filterable:true
json          → showInList:false,  priority:99, format:text,     section:details
slug          → showInList:false,  priority:5,  format:text,     section:details,   faker:'helpers.slugify(faker.lorem.words(2))'
```

---

## Change 1: Eliminate LLM Call #2 (Frontend Config)

### Current Flow
```
frontendAgent.generate(prompt, { structuredOutput: PageConfigSchema })  →  PageConfig
```

### New Flow
```
inferPageConfig(table, contract)  →  PageConfig   (zero tokens)
```

The `inferPageConfig()` function uses `ColumnSemanticClassifier` to produce the same `PageConfig` shape:

- **headerField:** First column classified as `identifier`, `title`, `name`, or `full_name` (by priority). Fallback: first text column.
- **listColumns:** All columns where `showInList=true`, sorted by `listPriority`, capped at 6.
- **enumFields:** Columns classified as `status`/`category`/`type`/`role`/`enum`. Options sourced from contract `EnumDef[]` if matched, otherwise empty (populated from data).
- **detailSections:** Grouped by `detailSection` metadata: Overview, Details, Metadata. Empty groups omitted.

### Backward Compatibility

- `derivePageFeatureSpec(config, contract)` remains unchanged — it still takes a `PageConfig`.
- `assembleListPage()` / `assembleDetailPage()` remain unchanged.
- Only the SOURCE of `PageConfig` changes (deterministic function instead of LLM).

---

## Change 2: Split LLM Call #3 (Backend Procedures)

### Critical Constraint: No Developer in the Loop

VibeStack is a no-code AI app builder. There is no developer to fill SLOT markers or write custom procedures. The pipeline must produce a working app end-to-end. This means:
- Standard CRUD patterns → **deterministic** (6 patterns, zero tokens)
- Domain-specific business logic → **LLM required** (cannot be derived from schema)

### Why Business Logic Cannot Be Deterministic

Consider a user who says "Build me a store with shipping cost calculation based on weight and delivery zone." The SchemaContract produces tables `orders`, `order_items`, `products`, `shipping_zones` with columns like `weight`, `base_rate`, `per_kg_rate`.

The schema tells us these tables/columns **exist**, but not HOW they relate computationally. The formula `base_rate + total_weight * per_kg_rate` comes from understanding the user's natural language intent. No regex or heuristic can derive this — it requires language comprehension.

Similarly, "apply discount rules" needs to know: percentage vs flat amount? Minimum order? Expiry dates? Stacking rules? Single-use codes? These are business decisions embedded in natural language, not derivable from column types.

### New Flow (Two Tiers)

```
Tier 1 (deterministic):
  inferStandardProcedures(table, contract, classifiedColumns) → StandardProcedureSpec[]  (zero tokens)

Tier 2 (LLM, tight prompt):
  generateBusinessLogic(procedureHint, relevantTables, scaffold) → body string  (~$0.01-0.03)
```

### Tier 1: Standard Procedure Patterns (6 patterns, deterministic)

#### Pattern 1: Text Search
**Trigger:** Entity has columns where `searchable=true`.
```typescript
{
  name: `search${PascalCase(table.name)}`,
  type: 'query', access: 'protected',
  inputFields: [{ name: 'query', type: 'string', optional: false }],
  implementation: `return ctx.db.select().from(${table.name})
    .where(or(${searchableCols.map(c => `ilike(${table.name}.${c}, \`%\${input.query}%\`)`).join(', ')}))
    .orderBy(desc(${table.name}.createdAt)).limit(20);`
}
```

#### Pattern 2: Filter by Enum/Status
**Trigger:** Entity has columns where `filterable=true`.
One procedure per filterable column:
```typescript
{
  name: `filterBy${PascalCase(col.name)}`,
  type: 'query', access: 'protected',
  inputFields: [{ name: 'value', type: 'string', optional: false }],
  implementation: `return ctx.db.select().from(${table.name})
    .where(eq(${table.name}.${col.name}, input.value))
    .orderBy(desc(${table.name}.createdAt));`
}
```

#### Pattern 3: Aggregate Stats
**Trigger:** Entity has columns where `aggregatable=true`.
```typescript
{
  name: `get${PascalCase(table.name)}Stats`,
  type: 'query', access: 'protected',
  inputFields: [],
  implementation: `return ctx.db.select({
    total: count(),
    ${aggCols.map(c => `avg_${c}: avg(${table.name}.${c}), sum_${c}: sum(${table.name}.${c})`).join(',\n    ')}
  }).from(${table.name});`
}
```

#### Pattern 4: Recent Items
**Trigger:** Entity has a `created_at` timestamp.
```typescript
{
  name: `getRecent${PascalCase(pluralize(table.name))}`,
  type: 'query', access: 'protected',
  inputFields: [{ name: 'limit', type: 'number', optional: true }],
  implementation: `return ctx.db.select().from(${table.name})
    .orderBy(desc(${table.name}.createdAt))
    .limit(input.limit ?? 10);`
}
```

#### Pattern 5: By Owner (User-Scoped)
**Trigger:** Entity has a `user_id` FK referencing `auth.users`.
```typescript
{
  name: `getMy${PascalCase(pluralize(table.name))}`,
  type: 'query', access: 'protected',
  inputFields: [],
  implementation: `return ctx.db.select().from(${table.name})
    .where(eq(${table.name}.userId, ctx.userId))
    .orderBy(desc(${table.name}.createdAt));`
}
```

#### Pattern 6: By FK Parent (Relational Lookup)
**Trigger:** Entity has FK columns referencing non-auth tables.
One procedure per FK:
```typescript
{
  name: `get${PascalCase(pluralize(table.name))}By${PascalCase(refTable)}`,
  type: 'query', access: 'protected',
  inputFields: [{ name: `${camelCase(refTable)}Id`, type: 'string', optional: false }],
  implementation: `return ctx.db.select().from(${table.name})
    .where(eq(${table.name}.${fkCol}, input.${camelCase(refTable)}Id))
    .orderBy(desc(${table.name}.createdAt));`
}
```

### Tier 2: Business Logic Procedures (LLM with scaffolding + validation)

The analyst agent (Call #1) already parses the user's description into a SchemaContract. We extend it to also extract **business logic hints** — short descriptions of domain-specific computations:

```typescript
// Extended analyst output
interface AnalystOutput {
  contract: SchemaContract
  businessLogicHints: BusinessLogicHint[]  // NEW
}

interface BusinessLogicHint {
  name: string                    // e.g., "calculateShippingCost"
  description: string             // e.g., "Calculate shipping based on total order weight and zone rates"
  involvedTables: string[]        // e.g., ["orders", "order_items", "products", "shipping_zones"]
  triggerContext: 'mutation' | 'query'  // mutation if it changes data, query if read-only
}
```

For each `BusinessLogicHint`, the pipeline:

**Step 1: Deterministic scaffolding** (zero tokens)
```typescript
// Generated by scaffolder — imports, signature, types, error handling
import { eq, and, gt, sql } from 'drizzle-orm'
import { orders, orderItems, products, shippingZones } from './schema'
import { publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const calculateShippingCost = publicProcedure
  .input(z.object({
    orderId: z.string().uuid(),
    zoneId: z.string().uuid(),
  }))
  .output(z.object({
    shippingCost: z.number(),
  }))
  .mutation(async ({ input, ctx }) => {
    // ── LLM FILLS ONLY THIS BODY (~15 lines) ──
    // Available: orders, orderItems, products, shippingZones
    // Intent: "Calculate shipping based on total order weight and zone rates"
    // Must return: { shippingCost: number }
  })
```

**Step 2: LLM generates ONLY the function body** (gpt-5-mini, ~200-500 tokens)

The prompt is minimal:
- The function scaffold (types, available tables, column definitions)
- The business logic hint (1 sentence)
- Drizzle ORM cheat sheet (5 lines: select, where, join syntax)

This uses `gpt-5-mini` (not `gpt-5.2-codex`) because the constrained context makes the task simple enough for a cheaper model.

**Step 3: 4-layer validation** (see next section)

### 4-Layer Business Logic Validation

#### Layer 1: Type Safety (compile-time, free)

The scaffolding provides typed imports. If the LLM writes `products.nonExistentCol`, tsc catches it. The repair agent (Call #4) fixes it. This is guaranteed by Drizzle's type system.

#### Layer 2: Contract Compliance (static analysis, deterministic)

After LLM fills the body, run AST-level checks:

```
✓ Every db.select()/update()/insert() references tables in SchemaContract
✓ Every column reference (eq(table.col, ...)) exists in the table's ColumnDef
✓ Every JOIN uses a FK relationship defined in the contract
✓ No raw SQL strings (must use Drizzle query builder)
✓ No hardcoded UUIDs or magic numbers
✓ Return value matches the output schema shape
✓ Error paths use TRPCError (not raw throw)
✓ Mutations that modify data are wrapped in transactions (if multi-table)
```

These are regex/AST checks — parse the TypeScript, walk the tree, verify references against SchemaContract. No LLM needed. If any check fails → repair agent.

#### Layer 3: PGlite Smoke Test (runtime, deterministic)

We already have PGlite in the sandbox (for migration validation) and deterministic seed data from `contractToSeedSQL()`. For each business logic procedure, generate a smoke test:

```typescript
// Deterministic — seed data values are known
const smokeTest = {
  // Seed order #1 has items referencing products with known weights
  // Seed shipping_zone #1 has known base_rate and per_kg_rate
  input: {
    orderId: '00000000-0000-4000-8001-000000000001',  // seed order #1
    zoneId: '00000000-0000-4000-8003-000000000001',    // seed zone #1
  },
  assertions: [
    'result !== null',                    // returned something
    'typeof result.shippingCost === "number"',  // correct type
    'result.shippingCost > 0',            // positive
    'result.shippingCost < 100000',       // sane upper bound
  ]
}
```

Run via PGlite + the generated tRPC procedure. This catches:
- Wrong column names → query error
- Missing JOINs → null results
- Wrong Drizzle syntax → runtime error
- Division by zero → NaN/Infinity
- Infinite loops → timeout (5s)

#### Layer 4: Deterministic Expectation (when computable)

For procedures that are pure computations over known seed data, compute the expected answer server-side:

```typescript
// Seed data is deterministic — we can compute expected values
// order #1 items: 2 products, weights from generateValue('integer', row=0,1) = 10, 20
// zone #1 rates: base_rate from generateValue('numeric', row=0) = 10.50
//               per_kg_rate from generateValue('numeric', row=1) = 21.00
// Expected: 10.50 + (10 * qty1 + 20 * qty2) * 21.00

// If we can compute expected value:
assertions.push(`Math.abs(result.shippingCost - ${expectedCost}) < 0.01`)
```

This works for ~60% of business logic (calculations, aggregations, transformations). For procedures with ambiguous semantics or complex side effects, Layer 3 smoke tests are the fallback.

### Validation Guarantee Summary

| Layer | What it catches | Coverage | Cost |
|-------|----------------|----------|------|
| 1. Scaffolding + tsc | Syntax errors, wrong types, bad imports | 100% of compile errors | $0 |
| 2. Contract compliance | Wrong table/column refs, missing FKs, raw SQL | 100% of schema violations | $0 |
| 3. PGlite smoke test | Runtime crashes, null results, NaN, timeouts | ~90% of runtime bugs | $0 |
| 4. Deterministic expectation | Wrong computation results | ~60% of logic bugs | $0 |
| Repair agent (existing) | Fix anything layers 1-3 reject | Safety net | ~$0.01 |

**What we CANNOT guarantee:** semantic correctness — that the LLM correctly interpreted the user's intent. If the user means "shipping cost = flat rate per zone" but the LLM computes "base + weight * rate", the code compiles, runs, returns a number, passes smoke tests — but does the wrong thing. Only the user can verify this by testing their app. However, this limitation exists in the CURRENT pipeline too (where all procedures are LLM-generated with even fewer validations).

### Coverage Estimate

Based on analysis of typical apps (task managers, e-commerce, blogs, project tools):
- **Tier 1 (deterministic):** ~80% of procedures — standard CRUD queries
- **Tier 2 (LLM):** ~20% of procedures — domain-specific business logic
- **Typical app:** 5 entities × 3-5 standard patterns = 15-25 deterministic procedures, 0-3 business logic procedures
- **Simple CRUD apps** (todo, blog, inventory): 0 Tier 2 calls → $0 for Call #3
- **Domain-heavy apps** (e-commerce, booking, billing): 2-3 Tier 2 calls → ~$0.03 for Call #3

---

## Change 3: Expand Deterministic Code Review

### Current `runDeterministicChecks()` (5 checks)

1. Missing Route exports
2. Hardcoded secrets patterns
3. Missing error boundaries
4. Missing loading states
5. Contract compliance (table names match)

### Expanded Checks (target 12-15 checks)

New checks that cover what the LLM review (Call #5) currently catches:

6. **Missing ownership enforcement** — scan tRPC procedures for user-owned tables that lack `eq(table.userId, ctx.userId)` in getById/update/delete
7. **Missing ARIA attributes** — check form elements for labels, buttons for accessible names
8. **Unused imports** — regex for import lines where the imported symbol doesn't appear in the file body
9. **Missing form validation** — check create/update forms for input validation (Zod schema reference)
10. **Missing empty state** — check list pages for conditional rendering when data array is empty
11. **Console.log statements** — flag `console.log` in production code
12. **Hardcoded URLs** — flag `http://localhost` or IP addresses in component code
13. **Missing key props** — flag `.map()` calls without `key=` in JSX return
14. **Inline styles** — flag `style={{` patterns (should use Tailwind)
15. **Missing TypeScript types** — flag `any` type annotations

### Gate Behavior

With 15 deterministic checks, the LLM review (Call #5) becomes redundant for the vast majority of generated code. It can be removed entirely or kept as an opt-in "premium quality" tier.

---

## Change 4: Unify Existing Column Intelligence

### Current State (scattered)

- `inferTextValue()` in `contract-to-seed.ts` — 25+ name→faker mappings
- `deriveColumnFormat()` in `feature-schema.ts` — type+name→display format
- `deriveInputType()` in `feature-schema.ts` — type+name→input type
- `deriveFormPlaceholder()` in `feature-schema.ts` — name→placeholder text
- `deriveFilterType()` in `feature-schema.ts` — type→filter type

### New State (unified)

All five functions replaced by lookups into `ColumnSemanticClassifier`:

```typescript
const semantic = classifyColumn(col, contract)
// Display format: semantic.displayFormat
// Input type: semantic.inputType
// Faker method: semantic.fakerMethod
// Filter type: semantic.filterType
// Placeholder: derived from semantic.type + snakeToLabel(col.name)
```

### File Changes

| File | Change |
|------|--------|
| `server/lib/column-classifier.ts` | **NEW** — ColumnSemanticClassifier, rules, registry |
| `server/lib/procedure-scaffolder.ts` | **NEW** — Deterministic scaffolding for business logic procedures (imports, signature, types). Generates PGlite smoke tests. |
| `server/lib/procedure-validator.ts` | **NEW** — 4-layer validation: contract compliance AST checks, PGlite smoke test runner, deterministic expectation computation. |
| `server/lib/agents/feature-schema.ts` | Remove `deriveColumnFormat`, `deriveInputType`, `deriveFormPlaceholder`, `deriveFilterType`. Add `inferPageConfig()`. Add `inferStandardProcedures()`. Keep `derivePageFeatureSpec()` but internally use classifier. |
| `server/lib/contract-to-seed.ts` | Replace `inferTextValue()` with classifier faker lookup |
| `server/lib/agents/orchestrator.ts` | Replace `frontendAgent.generate()` with `inferPageConfig()`. Split `backendAgent.generate()` into `inferStandardProcedures()` (Tier 1) + `generateBusinessLogicBody()` (Tier 2, gpt-5-mini). Add 4-layer validation after Tier 2. |
| `server/lib/agents/code-review.ts` | Expand `runDeterministicChecks()` with 10 new checks. Gate `runLLMReview()` behind deterministic pass. |
| `server/lib/agents/registry.ts` | Remove `frontendAgent`. Keep `backendAgent` but demote to gpt-5-mini for body-only generation. Remove `backendAgent` tools (no longer needs full context). |

---

## Change 5: Additional Deterministic Generators (Bug Fixes)

From the code analysis, these gaps should be fixed:

1. **Generate `relations.ts`** — new `contractToRelations()` function. FK references → `one()` relations; referenced tables → `many()` relations. Required for `ctx.db.query.*.findFirst()` to work.

2. **Fix tRPC ownership** — `contractToTrpc()` should add `eq(table.user_id, ctx.userId)` to getById, update, delete for user-owned tables.

3. **Fix seed enum handling** — `contractToSeedSQL()` should check if a column matches a contract enum and pick from its values.

4. **Fix seed boolean handling** — boolean columns should be included in seed generation (currently skipped by nullable filter).

5. **Apply `designPreferences.primaryColor`** — `generateIndexCSS()` should convert the hex color to oklch and use it.

---

## Cost Impact

### Before (6 LLM calls)

| Call | Model | Cost |
|------|-------|------|
| #1 Analyst | gpt-5.2 | ~$0.09 |
| #2 Frontend config ×5 | gpt-5.2-codex | ~$0.07 |
| #3 Backend procedures ×5 | gpt-5.2-codex | ~$0.10 |
| #4 Repair ×1 | gpt-5-mini | ~$0.002 |
| #5 Code review | gpt-5.1 | ~$0.16 |
| **Total** | | **~$0.42** |

### After (3-4 LLM calls, depending on app complexity)

| Call | Model | Cost | Notes |
|------|-------|------|-------|
| #1 Analyst (extended) | gpt-5.2 | ~$0.10 | +businessLogicHints extraction |
| #2 Frontend config | — | **$0** | Deterministic via classifier |
| #3a Standard procedures | — | **$0** | Deterministic via 6 patterns |
| #3b Business logic (0-3×) | gpt-5-mini | ~$0.01-0.03 | Scaffolded body-only, tight prompt |
| #4 Repair ×1 | gpt-5-mini | ~$0.002 | Unchanged |
| #5 Code review | — | **~$0.02** | Expanded deterministic (15 checks), LLM gated |
| **Total (simple CRUD app)** | | **~$0.12** | 0 business logic calls |
| **Total (domain-heavy app)** | | **~$0.16** | 3 business logic calls |
| **Total (weighted average)** | | **~$0.14** | Assumes 1.5 business logic calls avg |

### Savings: ~67% reduction ($0.42 → $0.14 average)

Breakdown by app type:
- **Simple CRUD** (todo, blog, inventory): $0.42 → $0.12 = **71% savings**
- **Medium complexity** (project mgmt, CMS): $0.42 → $0.14 = **67% savings**
- **Domain-heavy** (e-commerce, booking): $0.42 → $0.16 = **62% savings**

The analyst call now represents ~65-80% of remaining cost. Future optimization: provider arbitrage (cheaper models for analyst) or more structured NL→schema pipeline.

---

## Change 6: XState Business Logic Machine

### Problem

The business logic LLM call (Tier 2) needs rigid input/output contracts, layered validation, retry with error context, and automatic model escalation. Imperative try/catch code can't guarantee exhaustive error handling.

### Solution

A child XState machine (`businessLogicMachine`) is spawned per business logic procedure. It enforces the 4-layer validation as **state transitions** — impossible to skip a layer.

### State Flow

```
scaffolding → generating → typeChecking → complianceChecking → smokeTesting → done
                  ↑              │               │                  │
                  └──── repairing ←──────────────┴──────────────────┘
                           │
                  (after 2 retries with gpt-5-mini)
                           │
                  escalate → generating (gpt-5.2-codex, 1 retry)
                           │
                  (after 1 retry with gpt-5.2-codex)
                           │
                        failed
```

### Key Properties

- **Typed context**: `BusinessLogicContext` — immutable inputs (hint, contract, scaffold), mutable validation state, retry count, model tier
- **Guards enforce progression**: `canRetry`, `shouldEscalate`, `exhausted` — can't bypass validation layers
- **Error history accumulates**: Each repair attempt carries the full history of previous errors, preventing the LLM from repeating mistakes
- **Model escalation is a state transition**: `gpt-5-mini` (max 2 retries, $0.01) → `gpt-5.2-codex` (max 1 retry, $0.03) → fail
- **Timeouts per state**: 30s for generation, 15s for type check, 10s for smoke test
- **Nests inside parent machine**: The parent `appGenerationMachine.generating` state spawns one `businessLogicMachine` per `BusinessLogicHint`

### Integration with Existing Machine

The parent machine (`server/lib/agents/machine.ts`) already uses `fromPromise` actors with `setup()`. The business logic machine is invoked from within `runCodeGenerationActor`:

```typescript
// During code generation, for each business logic hint:
for (const hint of businessLogicHints) {
  const snapshot = await toPromise(createActor(businessLogicMachine, {
    input: { hint, contract, relevantTables, seedSQL }
  }))
  if (snapshot.status === 'done') {
    procedures.push(snapshot.context.finalProcedure!)
    totalTokens += snapshot.context.tokensUsed
  }
}
```

---

## Change 7: Business Rule Intermediate Representation (Future Phase)

### Key Insight from Research

Instead of asking the LLM to generate TypeScript function bodies (high entropy, hard to validate), ask it to generate **structured business rule metadata** — then generate the TypeScript deterministically from that metadata.

### Three Rule Representations

| Representation | Best For | Runtime Dependency | Example |
|---------------|----------|-------------------|---------|
| **JSON Logic** | Pure computations (formulas, conditionals) | `json-logic-js` (MIT, 2KB) | `{"+":[{"var":"base_rate"},{"*":[{"var":"weight"},{"var":"per_kg_rate"}]}]}` |
| **GoRules JDM** | Decision tables (conditional branches, tiered pricing) | `@gorules/zen-engine` (MIT, Rust+Node) | JSON decision table with input/output rows |
| **SQL Function** | Data-dependent logic (cross-table lookups, aggregations) | None (PostgreSQL built-in) | `CREATE FUNCTION calculate_shipping_cost(...)` |

### How It Changes the LLM Task

**Current (high entropy):**
```
LLM prompt: "Generate a TypeScript function body that calculates shipping cost"
LLM output: 15 lines of Drizzle ORM code (hard to validate)
```

**Future (low entropy):**
```
LLM prompt: "Generate a JSON Logic expression for: shipping cost = base_rate + weight * per_kg_rate"
LLM output: {"+":[{"var":"base_rate"},{"*":[{"var":"weight"},{"var":"per_kg_rate"}]}]}
Validation: json-logic-js parses it ✓, variables match SchemaContract columns ✓
Code gen: Deterministic tRPC procedure wrapping jsonLogic.apply(rule, data)
```

### Deterministic Procedure from JSON Logic

```typescript
// Auto-generated from JSON Logic rule — zero LLM tokens
export const calculateShippingCost = protectedProcedure
  .input(z.object({ orderId: z.string().uuid(), zoneId: z.string().uuid() }))
  .output(z.object({ shippingCost: z.number() }))
  .mutation(async ({ input, ctx }) => {
    // Fetch required data (deterministic from involved tables)
    const [zone] = await ctx.db.select().from(shippingZones)
      .where(eq(shippingZones.id, input.zoneId))
    const items = await ctx.db.select({
      weight: products.weight, qty: orderItems.quantity
    }).from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, input.orderId))

    const totalWeight = items.reduce((sum, i) => sum + i.weight * i.qty, 0)

    // Apply business rule (JSON Logic — deterministic evaluation)
    const rule = {"+":[{"var":"base_rate"},{"*":[{"var":"weight"},{"var":"per_kg_rate"}]}]}
    const shippingCost = jsonLogic.apply(rule, {
      base_rate: zone.baseRate,
      weight: totalWeight,
      per_kg_rate: zone.perKgRate,
    })

    await ctx.db.update(orders)
      .set({ shippingCost })
      .where(eq(orders.id, input.orderId))

    return { shippingCost }
  })
```

### Implementation Phase

This is a **future phase** (after the initial XState + scaffolding approach). The initial implementation uses the XState business logic machine with direct LLM body generation. Once stable, we migrate to the rule intermediate representation to further reduce LLM dependency.

### Tools to Adopt

| Tool | Purpose | License | Size | Phase |
|------|---------|---------|------|-------|
| `json-logic-js` | Formula evaluation | MIT | 2KB | Future |
| `@gorules/zen-engine` | Decision table evaluation | MIT | Native (Rust) | Future |
| PostgreSQL Functions | Data-dependent business logic | Built-in | 0 | Future |
| `ts-morph` | AST-based code generation (replace string concat) | MIT | Medium | Future |

---

## Prior Art

| Tool/Library | Technique | What We Borrow |
|-------------|-----------|----------------|
| **Metabase `name.clj`** | 50+ regex patterns → semantic column types | Classification rule patterns |
| **DataHub classifier** | Regex + ML for column PII detection | Column-name regex approach |
| **Rails scaffolding** | Schema → CRUD views + forms | Deterministic page generation from schema |
| **Blitz.js** | Prisma type → UI component mapping | Type-based component selection |
| **FakerJS module taxonomy** | Column name → realistic fake data | fakerMethod mapping in classifier |
| **`@supabase-community/seed`** | Schema-aware deterministic seeding | Seed generation patterns |
| **`zod-auto-form`** | Zod schema → automatic form fields | Type-to-input inference |
| **Django Admin** | Model → admin interface with `list_display` | Column selection heuristics |
| **GoRules ZEN Engine** | JSON decision tables with Rust+Node runtime | Business rule evaluation for conditional logic |
| **JSON Logic** | Portable, deterministic expression language | Formula evaluation for pure computations |
| **Type-constrained synthesis** | LLM token masking via type system prefix automaton | Constrain code generation search space |
| **PostgreSQL Generated Columns** | Computed columns via SQL expressions | In-schema derived values |
| **HyperFormula** | Headless spreadsheet engine (400+ functions) | Financial/statistical computations |
| **Wasp** | Declarative DSL → full-stack app (validates our approach) | SchemaContract-as-DSL pattern |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Heuristic picks wrong display columns for unusual schemas | Medium | Low (suboptimal UI, not broken code) | All column references validated by `validatePageConfig()`. Users can adjust via visual edit. |
| LLM misinterprets business logic intent | Medium | High (wrong behavior, app looks correct but computes wrong values) | 4-layer validation catches structural issues. Semantic correctness relies on user testing. Future: add "explain what this does" summary shown to user before deploy. |
| gpt-5-mini insufficient for complex business logic | Low | Medium (repair loops, fallback needed) | Start with gpt-5-mini. If repair rate >30%, auto-promote to gpt-5.2-codex for that procedure. Track per-pattern success rates. |
| Analyst fails to extract businessLogicHints | Medium | Low (procedures not generated, but app still works for CRUD) | Analyst prompt explicitly asks for business logic. If no hints extracted, all procedures are standard patterns — app works, just missing custom logic. User can add via edit flow. |
| Expanded deterministic checks have false positives | Low | Low (overly strict, not missed issues) | Each check has a severity level. Only `critical` blocks. `warning` is advisory. |
| Unifying classifier breaks existing seed/format behavior | Low | Medium (regression) | Comprehensive test suite for classifier output against known inputs. Validate that existing `inferTextValue()` mappings produce identical faker calls. |
| PGlite smoke test too slow (adds latency) | Low | Low (pipeline slightly slower) | Smoke tests run in parallel. Budget: 5s timeout per procedure. Typical: <1s per procedure with PGlite in-memory. |

---

## Implementation Order

### Phase 1: Deterministic Expansion (immediate — ~67% cost reduction)

1. **`column-classifier.ts`** — new shared module with rules + registry
2. **`inferPageConfig()`** — uses classifier to produce PageConfig deterministically
3. **`inferStandardProcedures()`** — uses classifier to produce the 6 standard patterns
4. **`BusinessLogicHint` extraction** — extend analyst schema + prompt to output hints
5. **`procedure-scaffolder.ts`** — deterministic scaffold generation (imports, signature, types, Zod schemas)
6. **`business-logic-machine.ts`** — XState child machine with 4-layer validation, retry, model escalation
7. **`procedure-validator.ts`** — contract compliance AST checks, PGlite smoke test runner
8. **Integrate into `orchestrator.ts`** — replace Call #2 entirely, split Call #3 into Tier 1 + Tier 2
9. **Expand `runDeterministicChecks()`** — add 10 new checks, gate LLM review
10. **Unify existing functions** — refactor `feature-schema.ts` and `contract-to-seed.ts` to use classifier
11. **Bug fixes** — relations.ts, tRPC ownership, seed enums/booleans, primaryColor
12. **Tests** — classifier unit tests, scaffolder tests, XState machine tests, smoke test harness

Each step is independently testable and deployable. Steps 1-3 deliver the biggest cost savings (Call #2 eliminated, ~80% of Call #3 eliminated). Steps 4-7 handle business logic with XState orchestration. Steps 8-12 are integration and polish.

### Phase 2: Rule Intermediate Representation (future — further cost reduction)

13. **Add `json-logic-js` + `@gorules/zen-engine`** to snapshot dependencies
14. **Extend SchemaContract** with `businessRules` field (decision tables, formulas, SQL functions)
15. **LLM generates rule metadata** instead of TypeScript bodies — JSON Logic for formulas, GoRules JDM for decision tables, SQL for data-dependent logic
16. **`contract-to-procedures.ts`** — deterministic TypeScript generation from rule metadata
17. **Migrate `ts-morph`** — replace string concatenation in all contract-to-* generators with AST-based code gen
18. **PostgreSQL Generated Columns** — extend SchemaContract `ColumnDef` with optional `computed` field

Phase 2 makes business logic generation nearly 100% deterministic for apps whose logic can be expressed as formulas or decision tables. Complex multi-step workflows still need LLM.
