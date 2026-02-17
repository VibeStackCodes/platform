# LLM Cost Optimization: Deterministic Maximalist Design

**Date:** 2026-02-17
**Status:** Draft
**Goal:** Eliminate mechanical LLM calls via expanded deterministic generation. For remaining business logic, use rule intermediate representations (JSON Logic, SQL Functions) instead of raw TypeScript — making LLM output trivially validatable. Reduce cost per generation by ~70%.

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

## Change 2: Split LLM Call #3 (Backend Procedures) — Rule Engine Approach

### Critical Constraint: No Developer in the Loop

VibeStack is a no-code AI app builder. There is no developer to fill SLOT markers or write custom procedures. The pipeline must produce a working app end-to-end. This means:
- Standard CRUD patterns → **deterministic** (6 patterns, zero tokens)
- Domain-specific business logic → **LLM generates structured rules** (not TypeScript)

### Why Business Logic Cannot Be Deterministic

Consider a user who says "Build me a store with shipping cost calculation based on weight and delivery zone." The SchemaContract produces tables `orders`, `order_items`, `products`, `shipping_zones` with columns like `weight`, `base_rate`, `per_kg_rate`.

The schema tells us these tables/columns **exist**, but not HOW they relate computationally. The formula `base_rate + total_weight * per_kg_rate` comes from understanding the user's natural language intent. No regex or heuristic can derive this — it requires language comprehension.

### Key Design Insight: Change What the LLM Generates

Instead of asking the LLM to generate TypeScript function bodies (high entropy, hard to validate), ask it to generate **structured business rule metadata** — then generate the TypeScript deterministically from that metadata.

**Before (high entropy, hard to validate):**
```
LLM → 15 lines of Drizzle ORM TypeScript → needs AST walking, tsc, PGlite, contract compliance...
```

**After (low entropy, trivially validatable):**
```
LLM → JSON Logic expression → json-logic-js parses it ✓, variables match schema ✓ → deterministic tRPC wrapper
```

This eliminates the need for complex validation machinery (XState state machines, 4-layer validation, model escalation). Structured data validates by parsing and evaluating — a single function call.

### New Flow (Two Tiers)

```
Tier 1 (deterministic):
  inferStandardProcedures(table, contract, classifiedColumns) → StandardProcedureSpec[]  (zero tokens)

Tier 2 (LLM generates rules, not code):
  generateBusinessRule(hint, schema) → BusinessRule  (gpt-5.2-codex, ~50-200 tokens)
  validateRule(rule) → boolean  (parse + evaluate with seed data)
  ruleToTrpcProcedure(rule, tables) → string  (deterministic code gen)
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

### Tier 2: Business Logic via Rule Intermediate Representation

The analyst agent (Call #1) already parses the user's description into a SchemaContract. We extend it to also extract **business logic hints** — short descriptions of domain-specific computations:

```typescript
interface AnalystOutput {
  contract: SchemaContract
  businessLogicHints: BusinessLogicHint[]
}

interface BusinessLogicHint {
  name: string                    // e.g., "calculateShippingCost"
  description: string             // e.g., "Calculate shipping based on total order weight and zone rates"
  involvedTables: string[]        // e.g., ["orders", "order_items", "products", "shipping_zones"]
  triggerContext: 'mutation' | 'query'
}
```

#### Rigid Structural Contract (Zod Schema)

The LLM's output is forced into this shape via Mastra's `structuredOutput` — the same two-stage pattern we already use (Stage 1: free-form reasoning by `gpt-5.2-codex`, Stage 2: `gpt-5-nano` formats to JSON Schema):

```typescript
const BusinessRuleSchema = z.discriminatedUnion('strategy', [
  z.object({
    strategy: z.literal('jsonLogic'),
    rule: z.record(z.unknown()),          // the JSON Logic expression
    variables: z.record(z.object({        // maps rule vars → schema columns
      table: z.string(),
      column: z.string(),
      derivation: z.string().optional(),  // e.g., "SUM(products.weight * order_items.quantity)"
    })),
    inputParams: z.array(z.string()),     // tRPC input fields (orderId, zoneId)
    outputField: z.string(),              // return field name (shippingCost)
    outputType: z.enum(['number', 'string', 'boolean']),
  }),
  z.object({
    strategy: z.literal('sqlFunction'),
    functionName: z.string().regex(/^[a-z_][a-z0-9_]*$/),
    sql: z.string(),                      // CREATE FUNCTION ... body
    inputParams: z.array(z.object({
      name: z.string(),
      type: z.enum(['uuid', 'text', 'integer', 'numeric', 'boolean']),
    })),
  }),
])
```

If the LLM produces anything that doesn't fit this schema, the two-stage Stage 2 rejects it. The structural contract is **guaranteed by construction** — identical to how we already enforce `SchemaContract` and `PageConfig`.

#### Two Rule Strategies

| Strategy | When | LLM Generates | Validation | Runtime Dep |
|----------|------|---------------|-----------|-------------|
| **JSON Logic** | Pure computations (formulas, conditionals, scoring, discounts) | JSON Logic expression (~50-100 tokens) | `jsonLogic.apply(rule, testData)` succeeds + all `{"var":"x"}` ⊆ schema columns | `json-logic-js` (MIT, 2KB) |
| **SQL Function** | Data-dependent logic (cross-table JOINs, aggregations, complex lookups) | `CREATE FUNCTION` body (~100-200 tokens) | PGlite executes DDL + test call with seed data | None (PostgreSQL built-in) |

**Strategy classification is deterministic** based on hint keywords:
- Hint mentions "calculate", "compute", "total", "formula", "rate", "discount", "score", "percentage", "tax" → **JSON Logic**
- Hint mentions "report", "aggregate across", "join", "look up from", "search ranked", "cross-table" → **SQL Function**
- Default → **JSON Logic** (simpler, easier for LLMs to generate correctly)

#### JSON Logic Strategy

**What the LLM generates** (~50-100 tokens):
```json
{
  "strategy": "jsonLogic",
  "rule": {"+":[{"var":"base_rate"},{"*":[{"var":"total_weight"},{"var":"per_kg_rate"}]}]},
  "variables": {
    "base_rate": { "table": "shipping_zones", "column": "base_rate" },
    "total_weight": { "derivation": "SUM(products.weight * order_items.quantity)" },
    "per_kg_rate": { "table": "shipping_zones", "column": "per_kg_rate" }
  },
  "inputParams": ["orderId", "zoneId"],
  "outputField": "shippingCost"
}
```

**Validation** (one function call):
1. `jsonLogic.apply(rule, testValues)` — parse check + evaluates without error
2. Every `{"var": "x"}` in the rule has a matching key in `variables`
3. Every table/column in `variables` exists in SchemaContract

If validation fails → retry once with the error message. If still fails → skip (app works for CRUD, missing this procedure).

#### Semantic Validation (Execute Against Seed Data)

Once structurally valid, the rule is validated semantically:

**JSON Logic validation:**
```typescript
function validateJsonLogicRule(rule: JsonLogicBusinessRule, contract: SchemaContract): ValidationResult {
  // 1. Every {"var":"x"} in the expression has a matching variable entry
  const ruleVars = extractJsonLogicVars(rule.rule)
  const missingVars = ruleVars.filter(v => !(v in rule.variables))
  if (missingVars.length > 0) return { valid: false, error: `Unknown variables: ${missingVars}` }

  // 2. Every table.column in variables exists in SchemaContract
  for (const [varName, ref] of Object.entries(rule.variables)) {
    const table = contract.tables.find(t => t.name === ref.table)
    if (!table) return { valid: false, error: `Table "${ref.table}" not in contract` }
    if (ref.column && !table.columns.find(c => c.name === ref.column))
      return { valid: false, error: `Column "${ref.table}.${ref.column}" not in contract` }
  }

  // 3. Build test data from KNOWN seed values (contractToSeedSQL is deterministic)
  //    getSeedValue() reuses the same generateValue() logic from contractToSeedSQL
  const testData: Record<string, number | string> = {}
  for (const [varName, ref] of Object.entries(rule.variables)) {
    testData[varName] = ref.derivation ? 1.0 : getSeedValue(contract, ref.table, ref.column, 0)
  }

  // 4. Evaluate — if it throws or returns NaN/Infinity, the rule is broken
  try {
    const result = jsonLogic.apply(rule.rule, testData)
    if (result === null || result === undefined) return { valid: false, error: 'Rule returned null' }
    if (typeof result === 'number' && (!isFinite(result) || isNaN(result)))
      return { valid: false, error: `Rule returned ${result}` }
    return { valid: true }
  } catch (e) {
    return { valid: false, error: `Evaluation failed: ${e.message}` }
  }
}
```

**SQL Function validation:**
```typescript
async function validateSqlFunction(rule: SqlFunctionRule, pglite: PGlite): Promise<ValidationResult> {
  // 1. Run CREATE FUNCTION — PGlite validates SQL syntax
  try { await pglite.query(rule.sql) }
  catch (e) { return { valid: false, error: `DDL failed: ${e.message}` } }

  // 2. Call the function with test params derived from seed data types
  const testParams = rule.inputParams.map(p =>
    p.type === 'uuid' ? "'00000000-0000-4000-8000-000000000001'" :
    p.type === 'integer' ? '1' : p.type === 'numeric' ? '10.50' : "'test'"
  ).join(', ')

  try {
    await pglite.query(`SELECT * FROM ${rule.functionName}(${testParams})`)
    return { valid: true }
  } catch (e) { return { valid: false, error: `Test call failed: ${e.message}` } }
}
```

**Validation guarantee summary:**

| Layer | Guarantees | Mechanism | Cost |
|-------|-----------|-----------|------|
| Structural (Zod) | LLM output has correct shape | `structuredOutput` two-stage (existing) | $0 (Stage 2 = gpt-5-nano) |
| Schema refs | All table/column refs exist in contract | Loop + Set.has() | $0 |
| Runtime eval | Rule parses, evaluates without error | `jsonLogic.apply()` or PGlite DDL+call | $0 |
| Retry (1 attempt) | Recovery from LLM error | Same call with error appended | ~$0.01 if triggered |

**Deterministic code generation** from validated rule:
```typescript
// Auto-generated from JSON Logic rule — zero LLM tokens
export const calculateShippingCost = protectedProcedure
  .input(z.object({ orderId: z.string().uuid(), zoneId: z.string().uuid() }))
  .output(z.object({ shippingCost: z.number() }))
  .mutation(async ({ input, ctx }) => {
    // Fetch required data (generated from variables map)
    const [zone] = await ctx.db.select().from(shippingZones)
      .where(eq(shippingZones.id, input.zoneId))
    const items = await ctx.db.select({
      weight: products.weight, qty: orderItems.quantity
    }).from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, input.orderId))

    const totalWeight = items.reduce((sum, i) => sum + i.weight * i.qty, 0)

    // Apply business rule (JSON Logic — deterministic evaluation)
    const rule = {"+":[{"var":"base_rate"},{"*":[{"var":"total_weight"},{"var":"per_kg_rate"}]}]}
    const shippingCost = jsonLogic.apply(rule, {
      base_rate: zone.baseRate,
      total_weight: totalWeight,
      per_kg_rate: zone.perKgRate,
    })

    return { shippingCost }
  })
```

#### SQL Function Strategy

**What the LLM generates** (~100-200 tokens):
```json
{
  "strategy": "sqlFunction",
  "functionName": "calculate_monthly_sales_report",
  "sql": "CREATE OR REPLACE FUNCTION calculate_monthly_sales_report(p_month integer, p_year integer) RETURNS TABLE(category text, total_sales numeric, order_count bigint) AS $$ SELECT p.category, SUM(oi.quantity * oi.unit_price), COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE EXTRACT(MONTH FROM o.created_at) = p_month AND EXTRACT(YEAR FROM o.created_at) = p_year GROUP BY p.category ORDER BY total_sales DESC $$ LANGUAGE sql STABLE;",
  "inputParams": [{"name": "month", "type": "integer"}, {"name": "year", "type": "integer"}]
}
```

**Validation**:
1. PGlite executes the `CREATE FUNCTION` DDL — syntax check
2. PGlite calls the function with test params — runtime check against seed data
3. Function returns rows without error

**Deterministic code generation** from validated SQL function:
```typescript
// Auto-generated — calls Supabase RPC (the SQL function)
export const getMonthlySalesReport = protectedProcedure
  .input(z.object({ month: z.number().int(), year: z.number().int() }))
  .query(async ({ input, ctx }) => {
    const { data, error } = await ctx.supabase.rpc('calculate_monthly_sales_report', {
      p_month: input.month, p_year: input.year,
    })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data
  })
```

#### The Complete Business Logic Pipeline

```
For each BusinessLogicHint:
  1. Classify strategy — deterministic keyword match (zero tokens)
  2. LLM generates rule — gpt-5.2-codex, structured output against BusinessRuleSchema (~100 tokens)
  3. Validate:
     - JSON Logic: parse + evaluate + variable check (1 function call)
     - SQL Function: PGlite DDL + test call (2 SQL statements)
  4. If validation fails: retry once with error context (~100 tokens)
  5. If still fails: skip procedure (app works for CRUD, user adds later via edit flow)
  6. Generate tRPC procedure deterministically from validated rule (zero tokens)
```

No XState machine. No 4-layer validation. No model escalation. Just: generate (gpt-5.2-codex) → validate → retry once → done.

#### Why This Is Simpler Than TypeScript Body Generation

| Aspect | TypeScript Bodies (old) | Rule IR (new) |
|--------|----------------------|---------------|
| LLM output | ~200-500 tokens of Drizzle ORM code | ~50-100 tokens of JSON |
| Validation | AST walking, tsc, contract compliance, PGlite, deterministic expectation | Parse + evaluate (one function call) |
| Retry mechanism | XState machine, 6 states, 3 guards, model escalation | Simple try/catch, one retry |
| Code generation | LLM generates code directly (high entropy) | Deterministic from validated rule (zero entropy) |
| New files needed | procedure-scaffolder.ts, procedure-validator.ts, business-logic-machine.ts | rule-generator.ts (single file) |

### Tier 2 Coverage Estimate

Based on analysis of typical apps (task managers, e-commerce, blogs, project tools):
- **Tier 1 (deterministic):** ~80% of procedures — standard CRUD queries
- **Tier 2 (rule-based):** ~20% of procedures — domain-specific business logic
- **Typical app:** 5 entities × 3-5 standard patterns = 15-25 deterministic procedures, 0-3 business logic procedures
- **Simple CRUD apps** (todo, blog, inventory): 0 Tier 2 calls → $0 for Call #3
- **Domain-heavy apps** (e-commerce, booking, billing): 2-3 Tier 2 calls → ~$0.03 for Call #3

### What We CANNOT Guarantee

Semantic correctness — that the LLM correctly interpreted the user's intent. If the user means "shipping cost = flat rate per zone" but the LLM generates a weight-based formula, the JSON Logic parses, evaluates, returns a number — but does the wrong thing. Only the user can verify this by testing their app.

However: this limitation exists in the CURRENT pipeline too (where all procedures are LLM-generated TypeScript with even fewer validations). The rule approach makes it **easier to inspect** — a JSON Logic expression is readable by anyone, vs. 15 lines of Drizzle ORM code.

### Runtime Dependencies in Generated Apps

The generated app's `package.json` gains one dependency:
- `json-logic-js` (MIT, 2KB minified) — only if the app has JSON Logic procedures

SQL Functions require no runtime dependency — they execute in PostgreSQL via `supabase.rpc()`.

### Future: GoRules Decision Tables

For apps with complex multi-condition branching (insurance underwriting, complex pricing matrices), GoRules ZEN Engine (`@gorules/zen-engine`, MIT, Rust+Node native) provides JSON Decision Tables — a more powerful representation than JSON Logic's nested `if` chains. This is deferred until a concrete need arises because:

1. JSON Logic + SQL Functions cover ~95% of typical no-code app business logic
2. GoRules adds a native binary dependency (Rust+Node) to the generated app
3. The `@gorules/jdm-editor` React component (259 stars, MIT) could provide a visual rule editing UI in the builder — but that's a UX feature, not a cost optimization

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
| `server/lib/rule-generator.ts` | **NEW** — BusinessRule schema, strategy classification, JSON Logic/SQL validation, rule-to-tRPC code generation. Single file replacing what would have been 3 files (scaffolder + validator + XState machine). |
| `server/lib/agents/feature-schema.ts` | Remove `deriveColumnFormat`, `deriveInputType`, `deriveFormPlaceholder`, `deriveFilterType`. Add `inferPageConfig()`. Add `inferStandardProcedures()`. Keep `derivePageFeatureSpec()` but internally use classifier. |
| `server/lib/contract-to-seed.ts` | Replace `inferTextValue()` with classifier faker lookup |
| `server/lib/agents/orchestrator.ts` | Replace `frontendAgent.generate()` with `inferPageConfig()`. Split `backendAgent.generate()` into `inferStandardProcedures()` (Tier 1) + `generateBusinessRule()` (Tier 2, gpt-5-mini). |
| `server/lib/agents/code-review.ts` | Expand `runDeterministicChecks()` with 10 new checks. Gate `runLLMReview()` behind deterministic pass. |
| `server/lib/agents/registry.ts` | Remove `frontendAgent`. Keep `backendAgent` but scope to gpt-5.2-codex for rule-only generation (JSON Logic / SQL). |
| `snapshot/package-base.json` | Add `json-logic-js` to generated app dependencies |

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

### After (2-4 LLM calls, depending on app complexity)

| Call | Model | Cost | Notes |
|------|-------|------|-------|
| #1 Analyst (extended) | gpt-5.2 | ~$0.10 | +businessLogicHints extraction |
| #2 Frontend config | — | **$0** | Deterministic via classifier |
| #3a Standard procedures | — | **$0** | Deterministic via 6 patterns |
| #3b Business rules (0-3×) | gpt-5.2-codex | ~$0.01-0.03 | JSON/SQL output, ~100 tokens each |
| #4 Repair ×1 | gpt-5-mini | ~$0.002 | Unchanged (fewer triggers expected) |
| #5 Code review | — | **~$0.02** | Expanded deterministic (15 checks), LLM gated |
| **Total (simple CRUD app)** | | **~$0.12** | 0 business logic calls |
| **Total (domain-heavy app)** | | **~$0.15** | 3 business logic calls |
| **Total (weighted average)** | | **~$0.14** | Assumes 1.5 business logic calls avg |

### Savings: ~67% reduction ($0.42 → $0.14 average)

Breakdown by app type:
- **Simple CRUD** (todo, blog, inventory): $0.42 → $0.12 = **71% savings**
- **Medium complexity** (project mgmt, CMS): $0.42 → $0.14 = **67% savings**
- **Domain-heavy** (e-commerce, booking): $0.42 → $0.15 = **64% savings**

The analyst call now represents ~70-80% of remaining cost. Future optimization: provider arbitrage (cheaper models for analyst) or more structured NL→schema pipeline.

---

## Prior Art

| Tool/Library | Technique | What We Use |
|-------------|-----------|-------------|
| **json-logic-js** (MIT, 2KB) | Portable expression language for formulas + conditionals | **Runtime evaluation** of LLM-generated business rules in generated apps |
| **PostgreSQL Functions** (built-in) | SQL function definitions with PGlite validation | **Data-dependent** business logic executed via `supabase.rpc()` |
| **Metabase `name.clj`** | 50+ regex patterns → semantic column types | Classification rule patterns |
| **DataHub classifier** | Regex + ML for column PII detection | Column-name regex approach |
| **Rails scaffolding** | Schema → CRUD views + forms | Deterministic page generation from schema |
| **FakerJS module taxonomy** | Column name → realistic fake data | fakerMethod mapping in classifier |
| **`zod-auto-form`** | Zod schema → automatic form fields | Type-to-input inference |
| **Django Admin** | Model → admin interface with `list_display` | Column selection heuristics |
| **Wasp** | Declarative DSL → full-stack app | Validates our SchemaContract-as-DSL pattern |
| **react-querybuilder** (MIT, 1.5K stars) | Visual query builder, exports to JSON Logic/SQL/MongoDB | Future: embed in generated apps for user-editable filters/rules |
| **json-rules-engine** (MIT, 3K stars) | Forward-chaining JSON rules with async facts | Alternative to JSON Logic for condition→event patterns |
| **JSONata** (MIT, 2K stars) | Expressive query/transform language with `$sum`, `$count`, `$avg` | Alternative to JSON Logic for complex formulas with aggregation |
| **@rjsf/core** (Apache-2.0, 14K stars) | Runtime form gen from JSON Schema, has `@rjsf/shadcn` theme | Future: eliminate LLM-generated form components entirely |
| **Refine** (MIT, 30K stars) | Headless CRUD framework with `@refinedev/supabase` data provider | Future: replace generated CRUD pages with runtime framework |
| **Kubb** (MIT) | OpenAPI → TanStack Query hooks + Zod + Faker | Future: generate client hooks from OpenAPI spec |
| **Supabase PostgREST** (already in stack) | Auto-generated REST API from schema with filtering/sorting | Future: skip tRPC for CRUD, use supabase-js directly |
| **@gorules/zen-engine** (MIT, Rust+Node) | JSON decision tables | Future: complex multi-condition branching |
| **@gorules/jdm-editor** (MIT, 259 stars) | React visual decision table editor | Future: visual rule editing in builder |
| **Plop.js** (MIT, 9K stars) | Handlebars template code generator | Alternative to string concat in contract-to-*.ts |
| **Pinion** (MIT, FeathersJS) | TypeScript-native code generator with type-safe templates | Alternative: TS template generators with full type checking |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Heuristic picks wrong display columns for unusual schemas | Medium | Low (suboptimal UI, not broken code) | All column references validated by `validatePageConfig()`. Users can adjust via visual edit. |
| LLM generates invalid JSON Logic expression | Low | Low (retry handles it) | JSON Logic is a small, well-defined language. gpt-5.2-codex generates it reliably. One retry with parse error. If still fails, skip procedure. |
| LLM generates invalid SQL function | Medium | Low (PGlite catches it) | PGlite validates DDL + test call. One retry with PGlite error message. SQL is a language LLMs are extremely good at. |
| JSON Logic too limited for complex business rules | Low | Medium (some rules can't be expressed) | JSON Logic handles formulas, conditionals, comparisons — covers ~90% of no-code app business logic. Complex cases fall back to SQL Functions. GoRules deferred as future escape hatch. |
| LLM misinterprets business logic intent (semantic error) | Medium | High (wrong behavior) | Same risk exists in current pipeline. Rule representation makes it **easier to inspect** — JSON expression vs. 15 lines of Drizzle code. Future: show "this rule does X" summary to user. |
| Analyst fails to extract businessLogicHints | Medium | Low (app works for CRUD) | Analyst prompt explicitly asks for business logic. If no hints extracted, all procedures are standard patterns — app works, just missing custom logic. User can add via edit flow. |
| Expanded deterministic checks have false positives | Low | Low (overly strict) | Each check has a severity level. Only `critical` blocks. `warning` is advisory. |
| Unifying classifier breaks existing seed/format behavior | Low | Medium (regression) | Comprehensive test suite for classifier output against known inputs. Validate that existing `inferTextValue()` mappings produce identical faker calls. |

---

## Implementation Order (Single Phase)

1. **`column-classifier.ts`** — new shared module with rules + registry
2. **`inferPageConfig()`** — uses classifier to produce PageConfig deterministically
3. **`inferStandardProcedures()`** — uses classifier to produce the 6 standard patterns
4. **`BusinessLogicHint` extraction** — extend analyst schema + prompt to output hints
5. **`rule-generator.ts`** — strategy classification, BusinessRule Zod schema, JSON Logic validation (via `json-logic-js`), SQL Function validation (via PGlite), rule-to-tRPC code generation
6. **Integrate into `orchestrator.ts`** — replace Call #2 entirely, split Call #3 into Tier 1 + Tier 2 (rule-based)
7. **Expand `runDeterministicChecks()`** — add 10 new checks, gate LLM review
8. **Unify existing functions** — refactor `feature-schema.ts` and `contract-to-seed.ts` to use classifier
9. **Bug fixes** — relations.ts, tRPC ownership, seed enums/booleans, primaryColor
10. **Tests** — classifier unit tests, rule generator tests, integration tests
11. **Add `json-logic-js`** to snapshot/package-base.json

Each step is independently testable and deployable. Steps 1-3 deliver the biggest cost savings (Call #2 eliminated, ~80% of Call #3 eliminated). Steps 4-6 handle business logic with rule engines. Steps 7-11 are integration, polish, and testing.
