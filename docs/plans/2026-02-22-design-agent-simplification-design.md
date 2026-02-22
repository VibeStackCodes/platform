# Design Agent Simplification

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Design Agent to a single LLM call that outputs only 3 things: TweakCN color palette, Google Font, and page styles.

**Architecture:** Single structured output call replaces the current 4-step pipeline (theme selector tool + catalog loading + LLM theme selection + SKILL.md parsing). The orchestrator fills in defaults for fields the Design Agent no longer manages (textSlots, heroImages, authPosture).

**Tech Stack:** Mastra Agent, Zod structured output, OKLCH colors (culori), gpt-5.2

---

## Context

The current Design Agent does too much:
1. Runs a deterministic theme selector tool (keyword scoring)
2. Loads a SKILL.md catalog from disk
3. Calls an LLM to pick a theme name + Unsplash query + text slots
4. Reads the selected SKILL.md file and parses markdown bullets into ThemeTokens
5. Fetches Unsplash hero images

The user wants exactly 3 outputs: color palette (TweakCN/shadcn format), Google Font, and 6 page style fields. Nothing else.

## Design

### What the Design Agent Returns

```typescript
interface DesignAgentResult {
  tokens: ThemeTokens  // Full ThemeTokens (backward-compatible)
  tokensUsed: number
}
```

The LLM structured output schema generates only:
- **colors**: 8 OKLCH values (background, foreground, primary, primaryForeground, secondary, accent, muted, border)
- **fonts**: display font, body font, googleFontsUrl
- **style**: borderRadius, cardStyle, navStyle, heroLayout, spacing, motion, imagery

The orchestrator fills remaining ThemeTokens fields with defaults:
- `name: ''`
- `textSlots: DEFAULT_TEXT_SLOTS`
- `heroImages: []`
- `heroQuery: ''`
- `authPosture: 'public'`

### LLM Prompt Strategy

The system prompt instructs the model to act as a visual designer choosing colors, typography, and layout for a web application. It includes:
- TweakCN CSS variable reference (which vars map to which UI elements)
- OKLCH color format guidance with examples
- Google Fonts naming convention
- Allowed values for each style enum field

Temperature: 0.7 (creative — we want diverse designs, not safe defaults)

### Files to Remove

| File | Reason |
|------|--------|
| `server/lib/agents/theme-selector.ts` | Deterministic theme selector — no longer needed |
| `server/lib/agents/theme-metadata.ts` | Theme metadata catalog — no longer needed |
| `server/lib/theme-schemas/canape.ts` | Canape base schema — no longer needed |
| `server/lib/theme-schemas/index.ts` | Theme schema registry — no longer needed |
| `tests/theme-selector.test.ts` | Tests for removed module |
| `tests/theme-metadata.test.ts` | Tests for removed module |

### Files to Modify

| File | Change |
|------|--------|
| `server/lib/agents/design-agent.ts` | Complete rewrite (~60 lines) |
| `server/lib/agents/orchestrator.ts` | Remove `selectedTheme`/`themeReasoning` from `DesignResult` |
| `server/lib/agents/machine.ts` | Update `DesignResult` type |
| `server/lib/agents/schemas.ts` | Remove `ThemeSelectorInputSchema`/`ThemeSelectorOutputSchema` |
| `tests/design-agent.test.ts` | Rewrite for new behavior |
| `scripts/llm-fullpage-experiment.ts` | Remove theme selection logging |
| `server/routes/agent.ts` | Remove `selectedTheme` from SSE event (if emitted) |

### Downstream — No Changes Needed

`ThemeTokens` type stays the same. All consumers (`themed-code-engine.ts`, `creative-director.ts`, `page-assembler.ts`, `page-composer.ts`, section renderers) work unchanged because the orchestrator fills in defaults for removed fields.

`buildThemePalette()` in `themed-code-engine.ts` continues working — it takes hex strings today, converts to OKLCH internally. The new design outputs hex strings too (not raw OKLCH — the LLM generates hex which is more reliable, and `buildThemePalette` already handles the OKLCH conversion).

---

### Task 1: Remove Dead Modules

**Files:**
- Delete: `server/lib/agents/theme-selector.ts`
- Delete: `server/lib/agents/theme-metadata.ts`
- Delete: `server/lib/theme-schemas/canape.ts`
- Delete: `server/lib/theme-schemas/index.ts`
- Delete: `tests/theme-selector.test.ts`
- Delete: `tests/theme-metadata.test.ts`

**Step 1: Delete files**

```bash
rm server/lib/agents/theme-selector.ts
rm server/lib/agents/theme-metadata.ts
rm -rf server/lib/theme-schemas/
rm tests/theme-selector.test.ts
rm tests/theme-metadata.test.ts
```

**Step 2: Remove ThemeSelectorInputSchema/OutputSchema from schemas.ts**

In `server/lib/agents/schemas.ts`, delete the `ThemeSelectorInputSchema` and `ThemeSelectorOutputSchema` exports.

**Step 3: Verify no other imports reference deleted modules**

```bash
grep -r "theme-selector\|theme-metadata\|theme-schemas" server/ tests/ scripts/ --include="*.ts" -l
```

Fix any remaining imports.

**Step 4: Verify compilation**

```bash
bunx tsc --noEmit
```

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: remove theme selector, metadata, and schema modules"
```

---

### Task 2: Rewrite design-agent.ts

**Files:**
- Rewrite: `server/lib/agents/design-agent.ts`

**Step 1: Write the new design agent**

The new agent does a single LLM structured output call. No tools, no catalog, no SKILL.md parsing, no Unsplash fetching.

```typescript
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { type ThemeTokens, DEFAULT_TEXT_SLOTS } from '../themed-code-engine'
import { createAgentModelResolver } from './provider'

const designOutputSchema = z.object({
  colors: z.object({
    background: z.string().describe('Hex color for page background, e.g. #ffffff'),
    foreground: z.string().describe('Hex color for body text, e.g. #111111'),
    primary: z.string().describe('Hex color for primary buttons and links'),
    primaryForeground: z.string().describe('Hex color for text on primary buttons'),
    secondary: z.string().describe('Hex color for secondary/muted surfaces'),
    accent: z.string().describe('Hex color for accent highlights and badges'),
    muted: z.string().describe('Hex color for muted backgrounds like sidebars'),
    border: z.string().describe('Hex color for borders and dividers'),
  }),
  fonts: z.object({
    display: z.string().describe('Google Font name for headings, e.g. "Playfair Display"'),
    body: z.string().describe('Google Font name for body text, e.g. "Source Sans 3"'),
  }),
  style: z.object({
    borderRadius: z.string().describe('CSS border-radius value, e.g. "0.5rem"'),
    cardStyle: z.enum(['flat', 'bordered', 'elevated', 'glass']),
    navStyle: z.enum(['top-bar', 'sidebar', 'editorial', 'minimal', 'centered']),
    heroLayout: z.enum(['fullbleed', 'split', 'centered', 'editorial', 'none']),
    spacing: z.enum(['compact', 'normal', 'airy']),
    motion: z.enum(['none', 'subtle', 'expressive']),
    imagery: z.enum(['photography-heavy', 'illustration', 'minimal', 'icon-focused']),
  }),
})

const designAgent = new Agent({
  id: 'design-agent',
  name: 'Design Agent',
  model: createAgentModelResolver('orchestrator'),
  instructions: `You are a visual designer for web applications. Given an app description, output a cohesive color palette, font pairing, and page style tokens.

COLOR RULES:
- Output hex colors (#rrggbb format).
- background + foreground must have WCAG AA contrast (4.5:1 minimum).
- primary is the brand color — used for buttons, links, active states.
- primaryForeground must contrast against primary (usually white or very dark).
- secondary is a subtle surface color (slightly tinted background).
- accent is a highlight color — badges, notifications, callouts. Can be vibrant.
- muted is a desaturated background for sidebars, table headers, disabled states.
- border is a subtle line color between sections.
- Avoid pure black (#000000) for foreground — use a tinted near-black.
- Avoid pure white (#ffffff) for background when the design calls for warmth — use off-whites.

FONT RULES:
- Pick fonts available on Google Fonts.
- display font: distinctive, characterful — used for h1-h3. Can be serif, sans-serif, or display.
- body font: highly readable — used for paragraphs and UI text. Usually sans-serif.
- Avoid overused defaults: Inter, Roboto, Open Sans, Lato, Montserrat.
- Good pairings contrast: serif display + sans body, geometric display + humanist body.

STYLE RULES:
- cardStyle: "flat" (no shadow/border), "bordered" (subtle border), "elevated" (shadow), "glass" (translucent blur)
- navStyle: "top-bar" (horizontal nav), "sidebar" (vertical), "editorial" (minimal top), "minimal" (just logo + links), "centered" (logo center, links around)
- heroLayout: "fullbleed" (full-width image), "split" (text left, image right), "centered" (centered text over image), "editorial" (text-heavy, minimal image), "none" (no hero)
- spacing: "compact" (dense), "normal" (standard), "airy" (generous whitespace)
- motion: "none" (static), "subtle" (fade-in, hover effects), "expressive" (scroll animations, parallax)
- imagery: "photography-heavy" (full-bleed photos), "illustration" (custom art), "minimal" (sparse images), "icon-focused" (icons over photos)
- borderRadius: use "0" for brutalist, "0.375rem" for standard, "0.75rem" for soft, "1rem" for very rounded

Match the visual tone to the app's domain and audience. A law firm wants "elevated" cards, serif fonts, and muted colors. A kids' app wants rounded corners, playful fonts, and vibrant accents.`,
  defaultOptions: { modelSettings: { temperature: 0.7 } },
})

export async function runDesignAgent(
  userPrompt: string,
  appName?: string,
  appDescription?: string,
): Promise<{
  tokens: ThemeTokens
  tokensUsed: number
}> {
  const prompt = `Design the visual identity for this web application.

App name: ${appName ?? 'My App'}
App description: ${appDescription ?? userPrompt}

User's original request:
${userPrompt}`

  const result = await designAgent.generate(prompt, {
    structuredOutput: { schema: designOutputSchema },
  })

  const output = designOutputSchema.parse(result.object ?? result)

  const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(output.fonts.display).replace(/%20/g, '+')}:wght@400;500;600;700&family=${encodeURIComponent(output.fonts.body).replace(/%20/g, '+')}:wght@300;400;500;600&display=swap`

  const tokens: ThemeTokens = {
    name: '',
    fonts: {
      display: output.fonts.display,
      body: output.fonts.body,
      googleFontsUrl,
    },
    colors: output.colors,
    style: output.style,
    authPosture: 'public',
    heroImages: [],
    heroQuery: '',
    textSlots: { ...DEFAULT_TEXT_SLOTS },
  }

  return {
    tokens,
    tokensUsed: result.totalUsage?.totalTokens ?? 0,
  }
}
```

**Step 2: Verify compilation**

```bash
bunx tsc --noEmit
```

---

### Task 3: Update orchestrator and machine

**Files:**
- Modify: `server/lib/agents/orchestrator.ts`
- Modify: `server/lib/agents/machine.ts`
- Modify: `scripts/llm-fullpage-experiment.ts`

**Step 1: Simplify DesignResult in orchestrator.ts**

Remove `selectedTheme` and `themeReasoning` from `runDesign()` return and `DesignResult` type.

**Step 2: Update machine.ts DesignResult type**

Remove `selectedTheme` and `themeReasoning` from `DesignResult`.

**Step 3: Update experiment script**

Remove theme selection logging lines.

**Step 4: Update agent.ts SSE bridge**

If `selectedTheme` is referenced in SSE events, remove it.

**Step 5: Verify compilation**

```bash
bunx tsc --noEmit
```

**Step 6: Commit**

```bash
git add -A && git commit -m "refactor: simplify Design Agent to colors + fonts + styles only"
```

---

### Task 4: Rewrite tests

**Files:**
- Rewrite: `tests/design-agent.test.ts`

**Step 1: Write new tests**

Test that:
1. `runDesignAgent()` returns `{ tokens, tokensUsed }`
2. `tokens.colors` has all 8 required fields
3. `tokens.fonts` has display, body, googleFontsUrl
4. `tokens.style` has all 6 style fields with valid enum values
5. `tokens.authPosture` is always 'public'
6. `tokens.textSlots` equals DEFAULT_TEXT_SLOTS
7. `tokens.heroImages` is empty array

Mock `@mastra/core/agent` to return a valid designOutputSchema object.

**Step 2: Run tests**

```bash
bun run test -- tests/design-agent.test.ts
```

**Step 3: Full verification**

```bash
bunx tsc --noEmit && bun run lint && bun run test
```

**Step 4: Commit**

```bash
git add -A && git commit -m "test: update design agent tests for simplified output"
```
