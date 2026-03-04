# Template Scraper v2 — Automated Pipeline Design

**Date:** 2026-03-04
**Status:** Approved

## Context

The `/scrape-templates` Claude Code skill converts live website URLs into React+Vite+Tailwind templates. v1 produced minimal standalone apps with placeholder `<div>`s for images and content inline in components. This made templates hard for the orchestrator agent to customize (scattered content across 11+ files) and visually incomplete (no real images).

The Meridian template (converted from the Sankofa WordPress theme) established the target architecture: scaffold-based, centralized `content.ts`, `content-slots.json` manifest, real Unsplash images, oklch color tokens with extended brand palette, and pushed to `VibeStackCodes/vibestack-templates`.

## Design

Update SKILL.md to produce templates matching the Meridian architecture. No new scripts — Claude follows the skill instructions.

### Pipeline Steps

#### Step 1: Capture (unchanged)
Playwright `capture --multi-page` extracts rendered HTML+CSS. Falls back to single-page if output is too large.

#### Step 2: Scaffold (NEW)
Clone `VibeStackCodes/vibestack-template` into a working directory. This provides:
- All 46+ shadcn/ui components
- `vite-plugin-vibestack-editor.ts` + `__vibestack-preload.ts` (visual editor infrastructure)
- Full dependency set (framer-motion, penpal, recharts, etc.)
- Proper `vite.config.ts` with optimizeDeps pre-warming
- Loose TypeScript config (`strict: false`)

#### Step 3: Convert (upgraded)
Claude reads the captured HTML+CSS and writes template-specific files on top of the scaffold:

**Components:** Each visual section becomes a discrete component (`Header.tsx`, `HeroSection.tsx`, etc.). Components import content from `content.ts`, never hardcode text or image URLs.

**Content architecture:**
- `src/lib/content.ts` — single typed export containing ALL replaceable text and images
- `content-slots.json` — manifest describing each content slot for LLM consumers
- Interfaces (`Post`, `Pillar`, `Service`, etc.) exported alongside the content object

**Text replacement:** All original site text replaced with thematic Lorem Ipsum. The brand name becomes a fictional Latin-flavored name. Navigation labels, CTAs, headings, body copy — everything gets placeholder text that matches the structural role.

**Image replacement:** All images replaced with contextually appropriate Unsplash URLs. Use `?w=<width>&h=<height>&fit=crop` parameters for correct aspect ratios. Author photos use `&crop=face`. Hero images, post images, gallery items — each gets a real Unsplash image matching the content theme.

**Color extraction:** Extract ALL colors from the template CSS. Convert to oklch. Map the 8 semantic roles (primary, secondary, accent, background, foreground, muted, card, destructive). Additional brand-specific colors become named tokens registered in both `index.css` `:root` and `@theme inline` for Tailwind utility access.

**Font sourcing:** Identify font families from the scraped CSS. Find matching Google Fonts (or keep original CDN URLs if they're stable). Register in `index.html` and `index.css`.

**Routing:** `react-router-dom` v7 with `BrowserRouter`. Each captured page becomes a route + page component.

**Design tokens:** `tokens.json` with colors (all oklch), fonts, and style metadata. `metadata.json` with name, description, originalUrl, category.

#### Step 4: Verify (unchanged)
`bun install && bun run build` — retry up to 3 times on failure.

#### Step 5: Publish (NEW)
Clone `VibeStackCodes/vibestack-templates`, copy the template into `<slug>/`, commit, push. Report the result with file count and repo URL.

### Key Design Decisions

1. **No new scripts** — the skill is Claude's instructions. Claude is the converter. Adding scripts would create maintenance burden for marginal automation gains.
2. **Scaffold-first** — cloning `vibestack-template` ensures every template has the visual editor infrastructure, shadcn/ui components, and correct dependency set without Claude having to generate boilerplate.
3. **Content consolidation is mandatory** — every template MUST have `content.ts` + `content-slots.json`. This is the contract the orchestrator depends on.
4. **Real Unsplash images** — per user preference, templates must look "filled in" with thematically appropriate imagery, not empty placeholders.
5. **Direct-to-repo publish** — no local staging. The skill pushes directly to `vibestack-templates`. The `output/` directory remains gitignored as a scratch space for intermediate artifacts.

### Reference Implementation

The Meridian template in `VibeStackCodes/vibestack-templates/meridian/` is the canonical reference. All future templates should match its architecture:
- `src/lib/content.ts` structure (typed content object + interfaces + helper functions)
- `content-slots.json` format (contentFile, description, slots array with path/type/description)
- `tokens.json` format (colors in oklch, fonts with Google Fonts URL, style metadata)
- Component structure (discrete section components importing from `content.ts`)
