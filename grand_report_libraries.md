# Library Replacement Opportunities Report

**Audited**: All source files in `/app`, `/lib`, `/components`
**Date**: 2026-02-13

---

## Summary

| Priority | Count | Estimated Total Effort |
|----------|-------|----------------------|
| High     | 4     | ~3-5 days            |
| Medium   | 5     | ~2-4 days            |
| Low      | 4     | ~1-2 days            |

---

## HIGH PRIORITY

### 1. Custom Retry with Exponential Backoff → `p-retry` or built-in SDK retry

**File**: `lib/retry.ts` (lines 1-122)
**What it does**: Custom retry logic with exponential backoff, jitter, Retry-After header parsing, and retryable error detection for OpenAI/HTTP errors.
**Recommended replacement**: [`p-retry`](https://github.com/sindresorhus/p-retry) (1.2M weekly downloads) or leverage OpenAI SDK's built-in retry (`maxRetries` option on client constructor).
**Effort**: Low (~2 hours)
**Benefits**:
- OpenAI SDK already has built-in retry with backoff (`new OpenAI({ maxRetries: 3 })`), making most of this file redundant
- `p-retry` handles edge cases (abort signals, custom retry logic) better than hand-rolled code
- Eliminates 122 lines of custom code

### 2. Custom Pluralization → `pluralize`

**Files**: `lib/entity-extractor.ts:39-43`, `lib/feature-classifier.ts:62-66`, `lib/template-registry.ts:19-23`
**What it does**: Naive pluralization (3 rules: ends in 's' → 'es', consonant+'y' → 'ies', else 's'). **Duplicated in 3 files** (Handlebars helper + 2 standalone functions).
**Recommended replacement**: [`pluralize`](https://github.com/blakeembrey/pluralize) (3M weekly downloads)
**Effort**: Low (~1 hour)
**Benefits**:
- Current code fails on: "child" → "childs" (should be "children"), "person" → "persons" (should be "people"), "status" → "statuses" (gets "statuses" — only by luck), "box" → "boxs" (should be "boxes")
- Eliminates code duplication across 3 files
- 440+ pluralization rules vs. 3 naive rules

### 3. Custom Hex-to-HSL Color Conversion → `colord` or `color`

**File**: `lib/template-registry.ts:83-108`
**What it does**: Hand-rolled hex-to-HSL conversion with regex parsing and manual RGB→HSL math.
**Recommended replacement**: [`colord`](https://github.com/omgovich/colord) (2.5M weekly downloads, 1.7KB gzipped) or [`color`](https://github.com/Qix-/color)
**Effort**: Low (~30 minutes)
**Benefits**:
- Current code only handles 6-digit hex; fails on 3-digit hex (`#fff`), rgba, named colors, etc.
- `colord` is tree-shakeable and tiny (1.7KB)
- Handles all color formats and conversions

### 4. Custom Markdown Fence Stripping → Centralized Utility or `strip-markdown-fences`

**Files**: `lib/generator.ts:419-433`, `lib/batch-generator.ts:177-179`, `lib/verifier.ts:540-543,559-561`, `lib/requirement-check.ts:108-111`, `lib/planner.ts:219-223`
**What it does**: Strips markdown code fences (` ```typescript ... ``` `) from LLM output. **Duplicated 6+ times** across the codebase with slight variations.
**Recommended replacement**: Extract to a single shared utility in `lib/utils.ts`, or use a tiny helper. This is more of a DRY concern than a library replacement.
**Effort**: Low (~1 hour)
**Benefits**:
- Eliminates 6 duplicate implementations
- Consistent behavior across all code paths
- Some implementations miss edge cases others handle (e.g., language tags)

---

## MEDIUM PRIORITY

### 5. Custom SSE Streaming → `eventsource-parser` or AI SDK's built-in streaming

**File**: `app/api/projects/generate/route.ts:59-207`
**What it does**: Manual SSE construction with `new ReadableStream`, `TextEncoder`, and `data: ${JSON.stringify(event)}\n\n` formatting.
**Recommended replacement**: Already using AI SDK for chat — could use [`ai` SDK's `createDataStream`](https://sdk.vercel.ai) or [`eventsource-parser`](https://github.com/rexxars/eventsource-parser) for consistent SSE handling.
**Effort**: Medium (~4 hours)
**Benefits**:
- Consistent SSE format across routes
- Built-in error handling and backpressure
- Less boilerplate for new streaming endpoints

### 6. Custom Vercel Deployment Client → `@vercel/client` or `vercel` SDK

**File**: `app/api/projects/deploy/route.ts:160-378`
**What it does**: ~220 lines of raw `fetch()` calls to Vercel REST API (v13/deployments, v10/projects, domain assignment, polling).
**Recommended replacement**: [`@vercel/client`](https://www.npmjs.com/package/@vercel/client) — official Vercel deployment SDK.
**Effort**: Medium (~4-6 hours)
**Benefits**:
- Typed API responses
- Built-in deployment polling
- Handles edge cases (rate limiting, retries)
- Reduces 220 lines to ~30 lines

### 7. Custom Supabase Management API Client → `supabase-management-js`

**File**: `lib/supabase-mgmt.ts` (lines 1-371)
**What it does**: ~370 lines wrapping `fetch()` calls to `api.supabase.com/v1` for project creation, deletion, API key retrieval, SQL migration execution, and schema setup.
**Recommended replacement**: [`supabase-management-js`](https://github.com/supabase-community/supabase-management-js) (community SDK for Supabase Management API)
**Effort**: Medium (~6-8 hours)
**Benefits**:
- Typed responses for all management endpoints
- Built-in error handling
- Maintained by Supabase community
- Polling logic for project readiness already built-in

### 8. Custom Password Generation → `nanoid` (already installed) or `crypto.randomBytes`

**File**: `lib/supabase-mgmt.ts:122-128`
**What it does**: Generates random 24-char passwords using `Math.random()` character selection.
**Recommended replacement**: `nanoid` (already in `package.json`) or Node.js built-in `crypto.randomBytes()`
**Effort**: Low (~15 minutes)
**Benefits**:
- `Math.random()` is not cryptographically secure — passwords should use `crypto.getRandomValues()`
- `nanoid` is already a dependency and provides cryptographically secure random strings
- **Security improvement**: current implementation uses insecure PRNG for database passwords

### 9. Custom Build Error Parser → Structured approach or AST-based parser

**File**: `lib/verifier.ts:155-217`
**What it does**: 60+ lines of regex patterns to parse Turbopack, TypeScript, and module errors from build output.
**Recommended replacement**: Consider using TypeScript Compiler API (`typescript` package, already a dev dependency) for TS errors, or a structured error format from the build tool itself.
**Effort**: Medium (~4 hours)
**Benefits**:
- Current regex approach is fragile and misses edge cases
- TypeScript API provides structured diagnostics
- Could configure build tool to output JSON errors directly

---

## LOW PRIORITY

### 10. Direct Anthropic SDK Usage in Edit Route → AI SDK (already used elsewhere)

**File**: `app/api/projects/edit/route.ts:107-109, 131-140, 234-267`
**What it does**: Uses `@anthropic-ai/sdk` directly (`new Anthropic()`, `anthropic.messages.create()`) while the rest of the codebase uses Vercel AI SDK (`generateText`, `streamText`) with the `resolveModel()` abstraction.
**Recommended replacement**: Use `generateText()` from the `ai` package with `resolveModel()` — consistent with `lib/verifier.ts`, `lib/planner.ts`, `lib/requirement-check.ts`.
**Effort**: Low (~2 hours)
**Benefits**:
- Consistent API across the codebase — single model resolution layer
- Enables model switching (e.g., OpenAI ↔ Anthropic) via `resolveModel()`
- Removes direct `@anthropic-ai/sdk` dependency from API routes
- The edit route is the ONLY place that bypasses the AI SDK abstraction

### 11. Custom Case Conversion Handlebars Helpers → `change-case`

**File**: `lib/template-registry.ts:10-17`
**What it does**: Hand-rolled `pascalCase` and `camelCase` Handlebars helpers using regex.
**Recommended replacement**: [`change-case`](https://github.com/blakeembrey/change-case) (8M weekly downloads)
**Effort**: Low (~30 minutes)
**Benefits**:
- Current regex `(^|[-_ ])(\w)` misses edge cases (numbers, consecutive separators, Unicode)
- `change-case` handles all casing conventions (pascal, camel, snake, kebab, etc.)
- Could be useful elsewhere in the codebase

### 12. Custom Slug Generation → `slugify`

**File**: `lib/slug.ts` (lines 1-11)
**What it does**: Simple slug builder: lowercase, replace non-alphanumeric with hyphens, trim leading/trailing hyphens, append short project ID.
**Recommended replacement**: [`slugify`](https://github.com/simov/slugify) (4M weekly downloads) — handles Unicode, diacritics, custom replacements.
**Effort**: Low (~30 minutes)
**Benefits**:
- Current code fails on Unicode characters (e.g., "café" → "caf-" instead of "cafe")
- `slugify` handles transliteration, custom replacements, and edge cases
- Minimal — the current code is only 11 lines, so this is low priority

### 13. Custom JSONL Eval Logger → `pino` or `winston` with JSONL transport

**File**: `lib/eval-logger.ts` (lines 1-255)
**What it does**: ~255 lines of custom JSONL logging to `.eval-logs/` directory with structured eval entries, file rotation by date.
**Recommended replacement**: [`pino`](https://github.com/pinojs/pino) with `pino-roll` for file rotation, or [`winston`](https://github.com/winstonjs/winston) with file transport.
**Effort**: Medium (~3 hours)
**Benefits**:
- Built-in log rotation, compression, and configurable transports
- Async writing (current sync `appendFileSync` blocks the event loop)
- Standard logging levels and formatting
- Could send to external services (Datadog, Sentry) with transport plugins

---

## NOT RECOMMENDED FOR REPLACEMENT

These custom implementations are appropriate and shouldn't be replaced:

| File | Why Keep |
|------|----------|
| `lib/generator.ts` | Core business logic — orchestrates LLM file generation with project-specific streaming |
| `lib/planner.ts` | Core business logic — domain-specific plan generation and validation |
| `lib/injector.ts` | Domain-specific prompt building with skill injection |
| `lib/template-registry.ts` (template execution) | Domain-specific Handlebars template orchestration |
| `lib/sandbox.ts` | Thin wrapper over Daytona SDK — appropriate abstraction |
| `lib/github.ts` | Thin wrapper over Octokit — appropriate abstraction |
| `lib/chat-tools.ts` | AI SDK tool definitions — framework-specific |
| `lib/system-prompt.ts` | Domain-specific prompts |
| `lib/schemas.ts` | Zod schemas — already using the right library |
| `lib/models.ts` | Model resolution — appropriate abstraction |
| `components/ui/*` | shadcn/ui components — already using the right approach |
| `lib/supabase-browser.ts` | Standard Supabase SSR pattern |
| `lib/supabase-server.ts` | Standard Supabase SSR pattern |
| Stripe integration | Already using `stripe` SDK correctly |
| Auth flow | Already using Supabase Auth correctly |

---

## Dependency Health Summary

| Current Dependency | Status | Notes |
|---|---|---|
| `ai` (Vercel AI SDK) | Good | Actively maintained, appropriate for chat/streaming |
| `@supabase/ssr` | Good | Official Supabase Next.js integration |
| `stripe` | Good | Official Stripe SDK |
| `zod` | Good | Used for schema validation throughout |
| `handlebars` | Good | Template engine for code generation |
| `octokit` | Good | Official GitHub SDK |
| `@daytonaio/sdk` | Good | Official Daytona sandbox SDK |
| `openai` | Good | Official OpenAI SDK |
| `@anthropic-ai/sdk` | Partially redundant | Used only in edit route; AI SDK covers this via `@ai-sdk/anthropic` |

---

## Action Items (Prioritized)

1. **Fix security issue**: Replace `Math.random()` password generation with `crypto.randomBytes()` (Finding #8) — immediate
2. **Deduplicate**: Extract markdown fence stripping to single utility (Finding #4) — quick win
3. **Deduplicate**: Extract `pluralizeTable` to single shared utility, or use `pluralize` library (Finding #2) — quick win
4. **Simplify**: Use OpenAI SDK built-in retry instead of custom `lib/retry.ts` (Finding #1) — medium effort
5. **Consistency**: Migrate edit route from direct Anthropic SDK to AI SDK (Finding #10) — medium effort
6. **Replace**: Use `@vercel/client` for deployment logic (Finding #6) — reduces maintenance burden
7. **Replace**: Use `colord` for color conversions (Finding #3) — tiny library, better correctness
8. **Consider**: Use `supabase-management-js` for management API calls (Finding #7) — reduces 370 lines
