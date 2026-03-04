# Design Agent — Design Document (v2)

**Date:** 2026-03-04
**Status:** In Review
**Branch:** `feature/parity`

## Overview

Add a Design Agent step to the generation workflow between plan approval and build. The Design Agent operates in **two modes**:

1. **Template mode**: User picks a pre-built app from a gallery (inspired by WordPress/Wix templates). The sandbox clones the template subdirectory on top of the base scaffold. The orchestrator then customizes the existing code.
2. **Custom mode**: AI generates design tokens from scratch via web search. The orchestrator builds from the base scaffold.

## What Is a Template?

A template is a **complete pre-built app** — not metadata, not tokens, not a theme. It's a fully working React app built on top of `vibestack-template`, with real pages, components, routes, styles, and content. Ready to `bun run dev`.

Templates live in a single repo:
```
VibeStackCodes/template/
  saas-minimal/          ← complete working SaaS app
  saas-bold/
  portfolio-creative/
  ecommerce-modern/
  blog-editorial/
  dashboard-analytics/
  landing-startup/
  ... (~12 total)
```

Each subdirectory is a full app extending the base scaffold. Template designs are scraped/inspired from WordPress.com and Wix.com top templates.

## Workflow

```
analyst → approvePlan → design → approveDesign → build
```

### New Steps

**`designStep`** (id: `design`)
- Creates designer agent (web search + structured output, no memory, maxSteps: 3)
- Searches for design trends relevant to the app category
- Generates `DesignAgentTokens` (colors in oklch, fonts, style, page sections)
- Matches against template presets to recommend top 3
- Suspends with `{ tokens, recommendedTemplates }`

**`approveDesignStep`** (id: `approve-design`)
- User can: select a template, approve AI-generated tokens, or request changes
- Resume with `{ approved, selectedTemplateId?, customTokens? }`
- On approve → continue to build step with template ID + tokens
- On reject → bail (user provides feedback, starts fresh workflow)

## Data Model

### DesignAgentTokens

```ts
interface DesignAgentTokens {
  colors: {
    primary: string      // oklch
    secondary: string
    accent: string
    background: string
    foreground: string
    muted: string
    card: string
    destructive: string
  }
  fonts: {
    display: string
    body: string
    googleFontsUrl: string
  }
  style: {
    borderRadius: string
    cardStyle: string
    navStyle: string
    heroLayout: string
    spacing: string
    motion: string
    imagery: string
    sections: PageSection[]
    contentWidth: 'narrow' | 'standard' | 'wide'
  }
}
```

### TemplatePreset

```ts
interface TemplatePreset {
  id: string                // e.g., 'saas-minimal'
  name: string              // e.g., 'Minimal SaaS'
  category: 'saas' | 'portfolio' | 'ecommerce' | 'blog' | 'dashboard' | 'landing'
  description: string
  screenshotUrl: string     // CDN from Supabase Storage
  repoPath: string          // e.g., 'saas-minimal' (subdirectory in VibeStackCodes/template)
  tokens: DesignAgentTokens // Design tokens this template uses
}
```

### SSE Events

```ts
interface DesignReadyEvent {
  type: 'design_ready'
  tokens: DesignAgentTokens
  recommendedTemplates: TemplatePreset[]
}

interface DesignSuspendedEvent {
  type: 'design_suspended'
  runId: string
  tokens: DesignAgentTokens
  recommendedTemplates: TemplatePreset[]
}

interface DesignApprovedEvent {
  type: 'design_approved'
  tokens: DesignAgentTokens
  selectedTemplateId?: string
}
```

## Sandbox Initialization

**Current**: `createSandbox` tool creates a sandbox from `DAYTONA_SNAPSHOT_ID` (pre-built from `vibestack-template`).

**With templates**: Same base snapshot. When a template is selected:
1. Sandbox is created from the same base snapshot
2. Before orchestrator runs, clone the template subdirectory on top:
   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/VibeStackCodes/template.git /tmp/template
   cd /tmp/template && git sparse-checkout set <template-id>
   cp -r /tmp/template/<template-id>/* /workspace/
   bun install  # in case template added deps
   ```
3. Orchestrator then edits the existing template code (not starting from scratch)

**Without template (custom mode)**: No change — sandbox uses base scaffold, orchestrator generates everything.

This is handled in the `buildStep` execute function, before calling `agent.stream()`.

## UI

### Template Gallery

WordPress/Wix-style template cards with:
- CDN-hosted screenshot images (real screenshots of each pre-built app)
- Template name + category badge
- Click to select → tokens update to match template's design system
- Selected state with visual indicator
- "Start from scratch" option (custom mode — no template)

### Design Tokens Display

`ThemeTokensCard` component shows:
- Color palette (oklch swatches)
- Font preview
- Style attributes as chips
- Updates live when user selects different templates

### Layout in Chat

1. ChainOfThought (design agent web search + trend analysis)
2. ThemeTokensCard (generated/selected tokens)
3. Template gallery (3 recommended + "Start from scratch")
4. HitlActions (Approve / Request Changes)

## Build Integration

### Template mode
- `buildStep` receives `selectedTemplateId`
- Before orchestrator runs: clone template subdirectory into sandbox
- Orchestrator prompt includes: "This app was started from the [template name] template. Customize it based on the user's plan. The app already has [sections]. Modify content, add features, and apply the approved design tokens."
- Orchestrator edits existing code → faster, higher quality output

### Custom mode
- No template clone — base scaffold only
- Orchestrator prompt includes design tokens as structured context
- Orchestrator generates all pages/components from scratch

### Token injection (both modes)
Design tokens serialized into orchestrator system prompt:
```
## Design System
Colors (oklch): primary: oklch(0.7 0.15 250), ...
Fonts: Display: "Inter", Body: "Inter"
Style: border-radius: 0.5rem, nav: fixed-top, hero: centered
Page Sections: navbar, hero, features, pricing, testimonials, faq, footer
```

## Template Creation Strategy

Templates are inspired by real WordPress.com and Wix.com designs:
1. Scrape top templates from WordPress.com/themes and Wix.com/website/templates
2. Identify top 2-3 from each category (SaaS, portfolio, e-commerce, blog, dashboard, landing)
3. Build each as a complete React app on `vibestack-template` base
4. Push to `VibeStackCodes/template/<template-id>/`
5. Screenshot each for the gallery preview

## Key Decisions

1. **Templates are pre-built apps** — not metadata, not tokens, not abstract presets. Each is a complete working React app in `VibeStackCodes/template/`.
2. **Same base snapshot** — templates clone on top of the existing Daytona snapshot. No per-template snapshots needed.
3. **Dual mode** — user can pick a template OR generate custom tokens from scratch. Design Agent handles both.
4. **Template designs scraped from WordPress/Wix** — inspired by real, proven designs, not invented.
5. **oklch everywhere** — all colors use oklch color space.
6. **Orchestrator edits, not generates** — with templates, the orchestrator customizes existing code rather than generating from scratch. This is faster and produces better results.
