# LLM Cost Optimization: Deterministic Maximalist Design

**Date:** 2026-02-17
**Status:** Draft
**Goal:** Eliminate mechanical LLM calls via expanded deterministic generation, reducing cost per generation by ~86%.

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

## Change 2: Eliminate LLM Call #3 (Backend Custom Procedures)

### Current Flow
```
backendAgent.generate(prompt, { structuredOutput: CustomProcedureSchema })  →  CustomProcedureSpec
```

### New Flow
```
inferCustomProcedures(table, contract, classifiedColumns)  →  CustomProcedureSpec  (zero tokens)
```

### Procedure Patterns (6 standard patterns)

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

### SLOT Preservation

After the 6 standard patterns, a `// SLOT: custom procedures` comment is preserved in the generated router file. Users can add domain-specific procedures through the visual edit flow.

### Coverage Estimate

Based on analysis of typical CRUD apps (task managers, e-commerce, blogs, project tools):
- Standard patterns cover ~80% of actual queries needed
- Missing: complex multi-table joins, business logic mutations, computed fields
- Mitigation: SLOT markers + visual edit flow for the remaining 20%

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
| `server/lib/agents/feature-schema.ts` | Remove `deriveColumnFormat`, `deriveInputType`, `deriveFormPlaceholder`, `deriveFilterType`. Add `inferPageConfig()`. Keep `derivePageFeatureSpec()` but internally use classifier. |
| `server/lib/contract-to-seed.ts` | Replace `inferTextValue()` with classifier faker lookup |
| `server/lib/agents/orchestrator.ts` | Replace `frontendAgent.generate()` with `inferPageConfig()`. Replace `backendAgent.generate()` with `inferCustomProcedures()`. |
| `server/lib/agents/code-review.ts` | Expand `runDeterministicChecks()` with 10 new checks. Remove or gate `runLLMReview()`. |
| `server/lib/agents/registry.ts` | Remove `frontendAgent` and `backendAgent` definitions (no longer needed). |

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

### After (2 LLM calls)

| Call | Model | Cost |
|------|-------|------|
| #1 Analyst | gpt-5.2 | ~$0.09 |
| #4 Repair ×1 | gpt-5-mini | ~$0.002 |
| **Total** | | **~$0.092** |

### Savings: ~78% reduction ($0.42 → $0.092)

The analyst call now represents 98% of remaining cost. Future optimization would target this call with cheaper frontier models or a more structured NL→schema pipeline.

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

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Heuristic picks wrong display columns for unusual schemas | Medium | Low (suboptimal UI, not broken code) | All column references validated by `validatePageConfig()`. Users can adjust via visual edit. |
| Standard procedures miss domain-specific queries | Medium | Medium (reduced functionality) | SLOT markers preserved. Users add custom procedures via edit flow. Document this as a known limitation. |
| Expanded deterministic checks have false positives | Low | Low (overly strict, not missed issues) | Each check has a severity level. Only `critical` blocks. `warning` is advisory. |
| Unifying classifier breaks existing seed/format behavior | Low | Medium (regression) | Comprehensive test suite for classifier output against known inputs. Validate that existing `inferTextValue()` mappings produce identical faker calls. |

---

## Implementation Order

1. **`column-classifier.ts`** — new shared module with rules + registry
2. **`inferPageConfig()`** — uses classifier to produce PageConfig
3. **`inferCustomProcedures()`** — uses classifier to produce standard procedures
4. **Integrate into `orchestrator.ts`** — replace LLM Calls #2 and #3
5. **Expand `runDeterministicChecks()`** — add 10 new checks, gate LLM review
6. **Unify existing functions** — refactor `feature-schema.ts` and `contract-to-seed.ts` to use classifier
7. **Bug fixes** — relations.ts, tRPC ownership, seed enums/booleans, primaryColor
8. **Tests** — classifier unit tests, integration tests for generated output

Each step is independently testable and deployable.
