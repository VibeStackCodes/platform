# Creative Director Simplification Design

**Date**: 2026-02-22
**Status**: Approved

## Problem

1. **Duplicated design**: Creative Director re-specifies colors, fonts, cardStyle, motion, borderRadius, and imagery that the Design Agent already decided. Costs ~2K output tokens repeating the same values.
2. **Dead code**: `contract` input is always empty tables, `archetype` always resolves to "static", `auth` is always public/false, `heroQuery` is empty string (broken Unsplash).
3. **Same look and feel**: `design-knowledge.ts` hardcodes domain-specific palettes and font pairings, overriding the Design Agent's creative choices.
4. **SaaS sprawl**: Creative Director generates 5-8 page SaaS apps (list/detail/new/edit/auth routes) for prompts like "build a to-do app" that should produce a simple functional React app.
5. **Static-only pages**: Page generator forces ALL content to be static hardcoded JSX, preventing functional React apps (to-do lists, calculators, etc.).

## Solution

### 1. Creative Director Input: Stripped to Essentials

**Before**: `{ userPrompt, appName, appDescription, contract: SchemaContract, tokens: ThemeTokens }`
**After**: `{ appName: string, prd: string }`

The PRD from the analyst contains everything the Creative Director needs to plan information architecture.

### 2. Creative Director Output: Simplified CreativeSpec

**Removed fields**:
- `archetype` (static/content/crud) — dead code, always static
- `visualDna` (typography, palette, motion, moodBoard, etc.) — Design Agent handles all visual identity
- `auth` (required, routes, login) — always public, dead code

**Kept fields**:
- `sitemap` — capped at 3 pages max. Per-page entries lose `dataRequirements` and `entities` (no DB).
- `nav` — style, logo, links, CTA, mobileStyle
- `footer` — style, columns, socialLinks, copyright

### 3. Architecture: Single-Stage Structured Output

Replace two-stage (reasoning + formatting = 2 LLM calls) with single-stage structured output (1 LLM call). The output is small enough now (sitemap + nav + footer) that a single call with `structuredOutput: { schema }` suffices.

### 4. System Prompt: Information Architecture Only

Remove `design-knowledge.ts` reference from Creative Director entirely. No font pairings, no color theory, no domain palettes. Focus solely on:
- What pages to build (1-3)
- What content goes on each page (brief: sections, copyDirection, keyInteractions)
- What components/icons to use (per-page brief)
- Nav and footer structure

Key instruction: "Build exactly what the user asked for. A to-do app is a functional React app on one page. A restaurant website is a multi-page landing site."

### 5. Page Generator: Allow Interactive Apps

Update the page generator system prompt to distinguish between:
- **Static content pages** (landing pages, about pages): Hardcode content in JSX
- **Interactive app pages** (to-do, calculator, form builder): Use useState/useEffect for client-side interactivity

The per-page brief's `keyInteractions` field already describes the primary user action. Use this to guide the LLM:
- If keyInteractions mentions "browse", "scroll", "read" → static content
- If keyInteractions mentions "create", "edit", "manage", "interact" → React state allowed

### 6. Downstream Changes

| Consumer | Change |
|----------|--------|
| `page-generator.ts` | Takes `tokens: ThemeTokens` for cardStyle/motion. Removes `imagePool`. Softens "ALL static" rule. |
| `deterministic-assembly.ts` | Takes `tokens: ThemeTokens` for palette/fonts/borderRadius. Hardcodes static archetype. Removes auth/Supabase. |
| `orchestrator.ts` | `runArchitect()` takes `{ appName, prd }`. Removes Unsplash. Adds `tokens` to page-gen/assembly. |
| `machine.ts` | Updated actor inputs/outputs. Removes imagePool from context. |
| `schemas.ts` | Simplified CreativeSpecSchema. Sitemap capped at 3. |

### Files Modified

| File | Changes |
|------|---------|
| `server/lib/creative-director.ts` | Rewrite: single-stage, simplified input/output, new system prompt |
| `server/lib/agents/schemas.ts` | Remove `archetype`, `visualDna`, `auth` from CreativeSpecSchema. Cap sitemap at 3. Remove `dataRequirements`/`entities` from sitemap entries. |
| `server/lib/agents/orchestrator.ts` | Simplify `runArchitect()`, add tokens to `runPageGeneration()`/`runAssembly()` |
| `server/lib/agents/machine.ts` | Update actor inputs/outputs, remove imagePool from context |
| `server/lib/page-generator.ts` | Take tokens, remove imagePool, soften static rule |
| `server/lib/deterministic-assembly.ts` | Take tokens, hardcode static, remove auth/Supabase branches |
| `server/routes/agent.ts` | Update SSE event mapping if architect output shape changed |
| Tests | Update creative-director, page-generator, deterministic-assembly tests |

### What This Fixes

1. **Same look and feel** → Design Agent's creative output is no longer overridden by hardcoded palettes
2. **SaaS sprawl** → 3-page cap + "build what was asked for" prompt
3. **Duplicate tokens** → No more re-specifying colors/fonts
4. **Static-only** → Functional React apps (to-do, calculator) now possible
5. **Wasted tokens** → Single-stage, smaller input/output
