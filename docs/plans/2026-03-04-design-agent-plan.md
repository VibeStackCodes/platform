# Design Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a Design Agent step to the generation workflow that generates design tokens, recommends pre-built templates from `VibeStackCodes/template/`, and supports dual-mode (template selection vs custom from-scratch) with HITL suspend/resume for user approval before building.

**Architecture:** Two new workflow steps (`designStep`, `approveDesignStep`) inserted between `approvePlanStep` and `buildStep`. A new `designer.ts` agent (web search + structured output, no memory) generates tokens and matches against static `TemplatePreset` metadata. Templates themselves are complete pre-built apps in `VibeStackCodes/template/<id>/` — not metadata. When a template is selected, `buildStep` clones the template subdirectory on top of the base sandbox snapshot before the orchestrator runs.

**Tech Stack:** Mastra workflows (createStep, suspend/resume), Zod schemas, React, Tailwind CSS v4, oklch colors, existing ChainOfThought + AgentHeader + HitlActions components.

---

## Context for All Tasks

**Current workflow chain** (`server/lib/agents/workflow.ts`):
```
analystStep → approvePlanStep → buildStep
```
After this plan:
```
analystStep → approvePlanStep → designStep → approveDesignStep → buildStep
```

**What is a template?** A complete pre-built app in `VibeStackCodes/template/<template-id>/` — a fully working React app built on `vibestack-template`. NOT metadata, NOT tokens. `TemplatePreset` is only the metadata/tokens that describe each template for the gallery UI and matching algorithm.

**Key files:**
- `server/lib/agents/workflow.ts` — 3-step workflow → becomes 5-step
- `server/lib/agents/analyst.ts` — Pattern to follow for designer agent
- `server/routes/agent.ts` — Route handler with resume logic (currently single-suspend at `approve-plan`)
- `src/hooks/use-agent-stream.ts` — Client hook with plan approval flow
- `src/components/chat-column.tsx` — Chat UI with analyst section
- `server/lib/types.ts` + `src/lib/types.ts` — SSE event types

**Route handler resume complexity:** Currently the route resumes at `approve-plan` step only. With two suspend points (`approve-plan` and `approve-design`), the resume path needs a `step` field to know which step to resume. The workflow handles this — when `approve-plan` resumes with `approved: true`, it flows into `designStep` → suspends again at `approve-design` → route emits `design_suspended` → client resumes again with `approve-design`.

---

## Task 1: Add design types to server

**Files:** Modify `server/lib/types.ts`

Add after the existing `DesignTokens` interface (line ~37):

```ts
// ============================================================================
// Design Agent Types
// ============================================================================

export interface PageSection {
  id: string
  label: string
}

export interface DesignAgentTokens {
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

export type TemplateCategory = 'saas' | 'portfolio' | 'ecommerce' | 'blog' | 'dashboard' | 'landing'

export interface TemplatePreset {
  id: string
  name: string
  category: TemplateCategory
  description: string
  screenshotUrl: string
  repoPath: string      // subdirectory in VibeStackCodes/template
  tokens: DesignAgentTokens
}
```

Add SSE event types after `WorkflowSuspendedEvent`:

```ts
export interface DesignReadyEvent {
  type: 'design_ready'
  tokens: DesignAgentTokens
  recommendedTemplates: TemplatePreset[]
}

export interface DesignSuspendedEvent {
  type: 'design_suspended'
  runId: string
  tokens: DesignAgentTokens
  recommendedTemplates: TemplatePreset[]
}

export interface DesignApprovedEvent {
  type: 'design_approved'
  tokens: DesignAgentTokens
  selectedTemplateId?: string
}
```

Add `DesignReadyEvent | DesignSuspendedEvent | DesignApprovedEvent` to the `AgentStreamEvent` union.

**Verify:** `bunx tsc --noEmit`

---

## Task 2: Mirror design types in client

**Files:** Modify `src/lib/types.ts`

Add the same `PageSection`, `DesignAgentTokens`, `TemplateCategory`, `TemplatePreset`, `DesignReadyEvent`, `DesignSuspendedEvent`, `DesignApprovedEvent` interfaces.

Add `DesignReadyEvent | DesignSuspendedEvent | DesignApprovedEvent` to the client's `AgentStreamEvent` union.

**Verify:** `bunx tsc --noEmit`

---

## Task 3: Create template presets data

**Files:** Create `server/lib/agents/templates.ts`

This file holds the static `TemplatePreset[]` metadata for ~12 templates. Each entry describes a pre-built app that lives in `VibeStackCodes/template/<repoPath>/`. The presets are used for:
1. Design agent matching (compare generated tokens against preset tokens)
2. Gallery UI rendering (name, description, screenshot, category)

```ts
import type { TemplatePreset } from '../types'

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'saas-minimal',
    name: 'Minimal SaaS',
    category: 'saas',
    description: 'Clean, minimal SaaS landing page with pricing and feature sections',
    screenshotUrl: '/templates/saas-minimal.png',  // placeholder — CDN later
    repoPath: 'saas-minimal',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.15 250)',
        secondary: 'oklch(0.65 0.10 280)',
        accent: 'oklch(0.70 0.20 160)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.95 0.01 250)',
        card: 'oklch(0.98 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Inter',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'flat',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'illustrations',
        sections: [
          { id: 'navbar', label: 'Navigation Bar' },
          { id: 'hero', label: 'Hero Section' },
          { id: 'features', label: 'Features Grid' },
          { id: 'pricing', label: 'Pricing Cards' },
          { id: 'testimonials', label: 'Testimonials' },
          { id: 'faq', label: 'FAQ' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'saas-bold',
    name: 'Bold SaaS',
    category: 'saas',
    description: 'Bold, high-contrast SaaS app with gradient accents and large typography',
    screenshotUrl: '/templates/saas-bold.png',
    repoPath: 'saas-bold',
    tokens: {
      colors: {
        primary: 'oklch(0.65 0.25 270)',
        secondary: 'oklch(0.50 0.20 300)',
        accent: 'oklch(0.75 0.20 150)',
        background: 'oklch(0.13 0.02 270)',
        foreground: 'oklch(0.95 0 0)',
        muted: 'oklch(0.20 0.02 270)',
        card: 'oklch(0.18 0.03 270)',
        destructive: 'oklch(0.60 0.25 25)',
      },
      fonts: {
        display: 'Space Grotesk',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'glass',
        navStyle: 'fixed-top',
        heroLayout: 'split',
        spacing: 'spacious',
        motion: 'expressive',
        imagery: 'gradients',
        sections: [
          { id: 'navbar', label: 'Navigation Bar' },
          { id: 'hero', label: 'Hero Section' },
          { id: 'features', label: 'Features Showcase' },
          { id: 'how-it-works', label: 'How It Works' },
          { id: 'pricing', label: 'Pricing' },
          { id: 'cta', label: 'Call to Action' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'portfolio-creative',
    name: 'Creative Portfolio',
    category: 'portfolio',
    description: 'Artist/designer portfolio with masonry grid and project showcases',
    screenshotUrl: '/templates/portfolio-creative.png',
    repoPath: 'portfolio-creative',
    tokens: {
      colors: {
        primary: 'oklch(0.70 0.15 50)',
        secondary: 'oklch(0.60 0.12 30)',
        accent: 'oklch(0.80 0.18 80)',
        background: 'oklch(0.98 0.01 80)',
        foreground: 'oklch(0.20 0.02 50)',
        muted: 'oklch(0.93 0.02 80)',
        card: 'oklch(0.97 0.01 80)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Playfair Display',
        body: 'Source Sans 3',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Source+Sans+3:wght@400;600&display=swap',
      },
      style: {
        borderRadius: '0.25rem',
        cardStyle: 'elevated',
        navStyle: 'minimal',
        heroLayout: 'full-bleed',
        spacing: 'spacious',
        motion: 'expressive',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero' },
          { id: 'portfolio', label: 'Project Grid' },
          { id: 'about', label: 'About Me' },
          { id: 'contact', label: 'Contact' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'portfolio-developer',
    name: 'Developer Portfolio',
    category: 'portfolio',
    description: 'Developer portfolio with terminal aesthetics and project cards',
    screenshotUrl: '/templates/portfolio-developer.png',
    repoPath: 'portfolio-developer',
    tokens: {
      colors: {
        primary: 'oklch(0.70 0.20 160)',
        secondary: 'oklch(0.60 0.15 200)',
        accent: 'oklch(0.75 0.15 60)',
        background: 'oklch(0.15 0.02 250)',
        foreground: 'oklch(0.90 0.02 160)',
        muted: 'oklch(0.22 0.02 250)',
        card: 'oklch(0.19 0.02 250)',
        destructive: 'oklch(0.60 0.22 25)',
      },
      fonts: {
        display: 'JetBrains Mono',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'bordered',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'code-blocks',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero' },
          { id: 'projects', label: 'Projects' },
          { id: 'skills', label: 'Skills' },
          { id: 'experience', label: 'Experience' },
          { id: 'contact', label: 'Contact' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'ecommerce-modern',
    name: 'Modern Shop',
    category: 'ecommerce',
    description: 'E-commerce storefront with product grid, cart, and checkout flow',
    screenshotUrl: '/templates/ecommerce-modern.png',
    repoPath: 'ecommerce-modern',
    tokens: {
      colors: {
        primary: 'oklch(0.45 0.10 250)',
        secondary: 'oklch(0.55 0.08 280)',
        accent: 'oklch(0.70 0.18 80)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.96 0.01 250)',
        card: 'oklch(0.99 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'DM Sans',
        body: 'DM Sans',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'elevated',
        navStyle: 'fixed-top',
        heroLayout: 'split',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation + Cart' },
          { id: 'hero', label: 'Hero Banner' },
          { id: 'featured', label: 'Featured Products' },
          { id: 'categories', label: 'Categories' },
          { id: 'deals', label: 'Deals Section' },
          { id: 'newsletter', label: 'Newsletter' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'ecommerce-boutique',
    name: 'Boutique Store',
    category: 'ecommerce',
    description: 'Luxury boutique with editorial layouts and refined typography',
    screenshotUrl: '/templates/ecommerce-boutique.png',
    repoPath: 'ecommerce-boutique',
    tokens: {
      colors: {
        primary: 'oklch(0.35 0.05 50)',
        secondary: 'oklch(0.55 0.08 40)',
        accent: 'oklch(0.65 0.12 50)',
        background: 'oklch(0.97 0.01 80)',
        foreground: 'oklch(0.20 0.02 50)',
        muted: 'oklch(0.93 0.02 80)',
        card: 'oklch(0.98 0.01 80)',
        destructive: 'oklch(0.55 0.18 25)',
      },
      fonts: {
        display: 'Cormorant Garamond',
        body: 'Lato',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Lato:wght@400;700&display=swap',
      },
      style: {
        borderRadius: '0rem',
        cardStyle: 'flat',
        navStyle: 'minimal',
        heroLayout: 'full-bleed',
        spacing: 'spacious',
        motion: 'elegant',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero' },
          { id: 'collection', label: 'Collections' },
          { id: 'featured', label: 'Featured Products' },
          { id: 'story', label: 'Brand Story' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'blog-editorial',
    name: 'Editorial Blog',
    category: 'blog',
    description: 'Clean editorial blog with magazine-style layouts and reading focus',
    screenshotUrl: '/templates/blog-editorial.png',
    repoPath: 'blog-editorial',
    tokens: {
      colors: {
        primary: 'oklch(0.45 0.12 250)',
        secondary: 'oklch(0.55 0.10 280)',
        accent: 'oklch(0.65 0.15 30)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.20 0 0)',
        muted: 'oklch(0.96 0.01 250)',
        card: 'oklch(0.99 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Merriweather',
        body: 'Source Sans 3',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Source+Sans+3:wght@400;600&display=swap',
      },
      style: {
        borderRadius: '0.25rem',
        cardStyle: 'flat',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'spacious',
        motion: 'minimal',
        imagery: 'photography',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Featured Article' },
          { id: 'latest', label: 'Latest Posts' },
          { id: 'categories', label: 'Categories' },
          { id: 'newsletter', label: 'Newsletter Signup' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'narrow',
      },
    },
  },
  {
    id: 'blog-personal',
    name: 'Personal Blog',
    category: 'blog',
    description: 'Warm personal blog with sidebar and social links',
    screenshotUrl: '/templates/blog-personal.png',
    repoPath: 'blog-personal',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.15 150)',
        secondary: 'oklch(0.65 0.12 180)',
        accent: 'oklch(0.70 0.18 60)',
        background: 'oklch(0.98 0.01 100)',
        foreground: 'oklch(0.20 0.02 100)',
        muted: 'oklch(0.94 0.02 100)',
        card: 'oklch(0.97 0.01 100)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Nunito',
        body: 'Nunito',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
      },
      style: {
        borderRadius: '1rem',
        cardStyle: 'elevated',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'illustrations',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Welcome' },
          { id: 'posts', label: 'Recent Posts' },
          { id: 'about', label: 'About Me' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'narrow',
      },
    },
  },
  {
    id: 'dashboard-analytics',
    name: 'Analytics Dashboard',
    category: 'dashboard',
    description: 'Data-rich analytics dashboard with charts, tables, and KPI cards',
    screenshotUrl: '/templates/dashboard-analytics.png',
    repoPath: 'dashboard-analytics',
    tokens: {
      colors: {
        primary: 'oklch(0.60 0.18 250)',
        secondary: 'oklch(0.50 0.12 280)',
        accent: 'oklch(0.70 0.20 160)',
        background: 'oklch(0.16 0.02 250)',
        foreground: 'oklch(0.92 0 0)',
        muted: 'oklch(0.22 0.02 250)',
        card: 'oklch(0.20 0.02 250)',
        destructive: 'oklch(0.60 0.22 25)',
      },
      fonts: {
        display: 'Inter',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'bordered',
        navStyle: 'sidebar',
        heroLayout: 'dashboard',
        spacing: 'compact',
        motion: 'subtle',
        imagery: 'data-viz',
        sections: [
          { id: 'sidebar', label: 'Sidebar Navigation' },
          { id: 'topbar', label: 'Top Bar' },
          { id: 'kpi', label: 'KPI Cards' },
          { id: 'charts', label: 'Charts Grid' },
          { id: 'table', label: 'Data Table' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'dashboard-admin',
    name: 'Admin Panel',
    category: 'dashboard',
    description: 'Full admin panel with sidebar nav, user management, and settings',
    screenshotUrl: '/templates/dashboard-admin.png',
    repoPath: 'dashboard-admin',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.15 250)',
        secondary: 'oklch(0.65 0.10 280)',
        accent: 'oklch(0.70 0.15 160)',
        background: 'oklch(0.98 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.95 0.01 250)',
        card: 'oklch(0.99 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Inter',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'bordered',
        navStyle: 'sidebar',
        heroLayout: 'dashboard',
        spacing: 'compact',
        motion: 'minimal',
        imagery: 'icons',
        sections: [
          { id: 'sidebar', label: 'Sidebar' },
          { id: 'topbar', label: 'Top Bar' },
          { id: 'stats', label: 'Stats Cards' },
          { id: 'content', label: 'Content Area' },
        ],
        contentWidth: 'wide',
      },
    },
  },
  {
    id: 'landing-startup',
    name: 'Startup Landing',
    category: 'landing',
    description: 'High-converting startup landing page with social proof and CTA focus',
    screenshotUrl: '/templates/landing-startup.png',
    repoPath: 'landing-startup',
    tokens: {
      colors: {
        primary: 'oklch(0.60 0.22 270)',
        secondary: 'oklch(0.50 0.18 300)',
        accent: 'oklch(0.75 0.18 160)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.96 0.01 270)',
        card: 'oklch(0.98 0 0)',
        destructive: 'oklch(0.55 0.22 25)',
      },
      fonts: {
        display: 'Plus Jakarta Sans',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.75rem',
        cardStyle: 'elevated',
        navStyle: 'fixed-top',
        heroLayout: 'centered',
        spacing: 'spacious',
        motion: 'expressive',
        imagery: 'mixed',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero + CTA' },
          { id: 'logos', label: 'Logo Cloud' },
          { id: 'features', label: 'Features' },
          { id: 'how-it-works', label: 'How It Works' },
          { id: 'testimonials', label: 'Testimonials' },
          { id: 'pricing', label: 'Pricing' },
          { id: 'cta', label: 'Final CTA' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
  {
    id: 'landing-product',
    name: 'Product Launch',
    category: 'landing',
    description: 'Product launch page with feature tours and comparison tables',
    screenshotUrl: '/templates/landing-product.png',
    repoPath: 'landing-product',
    tokens: {
      colors: {
        primary: 'oklch(0.55 0.18 220)',
        secondary: 'oklch(0.65 0.14 200)',
        accent: 'oklch(0.70 0.20 50)',
        background: 'oklch(0.99 0 0)',
        foreground: 'oklch(0.15 0 0)',
        muted: 'oklch(0.96 0.01 220)',
        card: 'oklch(0.98 0 0)',
        destructive: 'oklch(0.55 0.20 25)',
      },
      fonts: {
        display: 'Outfit',
        body: 'Inter',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500&display=swap',
      },
      style: {
        borderRadius: '0.5rem',
        cardStyle: 'flat',
        navStyle: 'fixed-top',
        heroLayout: 'split',
        spacing: 'comfortable',
        motion: 'subtle',
        imagery: 'screenshots',
        sections: [
          { id: 'navbar', label: 'Navigation' },
          { id: 'hero', label: 'Hero + Product Shot' },
          { id: 'features', label: 'Feature Tour' },
          { id: 'comparison', label: 'Comparison' },
          { id: 'testimonials', label: 'Testimonials' },
          { id: 'cta', label: 'CTA' },
          { id: 'footer', label: 'Footer' },
        ],
        contentWidth: 'standard',
      },
    },
  },
]
```

Also add a helper function for matching:

```ts
/**
 * Rank templates by similarity to generated tokens.
 * Simple heuristic: category match > style matches.
 */
export function rankTemplates(
  tokens: DesignAgentTokens,
  category?: TemplateCategory,
): TemplatePreset[] {
  return [...TEMPLATE_PRESETS]
    .sort((a, b) => {
      let scoreA = 0
      let scoreB = 0
      if (category && a.category === category) scoreA += 10
      if (category && b.category === category) scoreB += 10
      if (a.tokens.style.navStyle === tokens.style.navStyle) scoreA += 2
      if (b.tokens.style.navStyle === tokens.style.navStyle) scoreB += 2
      if (a.tokens.style.heroLayout === tokens.style.heroLayout) scoreA += 2
      if (b.tokens.style.heroLayout === tokens.style.heroLayout) scoreB += 2
      if (a.tokens.style.cardStyle === tokens.style.cardStyle) scoreA += 1
      if (b.tokens.style.cardStyle === tokens.style.cardStyle) scoreB += 1
      if (a.tokens.style.contentWidth === tokens.style.contentWidth) scoreA += 1
      if (b.tokens.style.contentWidth === tokens.style.contentWidth) scoreB += 1
      return scoreB - scoreA
    })
    .slice(0, 3)
}
```

**Verify:** `bunx tsc --noEmit`

---

## Task 4: Create designer agent

**Files:** Create `server/lib/agents/designer.ts`

Follow the `analyst.ts` pattern — web search + structured output, no memory, maxSteps: 3.

```ts
import { openai } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { createAgentModelResolver } from './provider'

const designerModel = createAgentModelResolver('designer')

const PageSectionSchema = z.object({
  id: z.string().describe('Section identifier (e.g. "hero", "features", "pricing")'),
  label: z.string().describe('Human-readable section name (e.g. "Hero Section")'),
})

export const DesignTokensSchema = z.object({
  colors: z.object({
    primary: z.string().describe('oklch primary color'),
    secondary: z.string().describe('oklch secondary color'),
    accent: z.string().describe('oklch accent color'),
    background: z.string().describe('oklch background color'),
    foreground: z.string().describe('oklch foreground color'),
    muted: z.string().describe('oklch muted/subtle background'),
    card: z.string().describe('oklch card background'),
    destructive: z.string().describe('oklch destructive/error color'),
  }),
  fonts: z.object({
    display: z.string().describe('Google Font for headings'),
    body: z.string().describe('Google Font for body text'),
    googleFontsUrl: z.string().url().describe('Google Fonts CSS import URL'),
  }),
  style: z.object({
    borderRadius: z.string().describe('CSS border-radius value (e.g. "0.5rem")'),
    cardStyle: z.string().describe('Card style: flat | elevated | bordered | glass'),
    navStyle: z.string().describe('Navigation style: fixed-top | sidebar | minimal'),
    heroLayout: z.string().describe('Hero layout: centered | split | full-bleed | dashboard'),
    spacing: z.string().describe('Spacing density: compact | comfortable | spacious'),
    motion: z.string().describe('Animation level: minimal | subtle | expressive | elegant'),
    imagery: z.string().describe('Visual style: illustrations | photography | gradients | icons | data-viz | code-blocks'),
    sections: z.array(PageSectionSchema).min(3).max(10).describe('Page sections in order'),
    contentWidth: z.enum(['narrow', 'standard', 'wide']).describe('Maximum content width'),
  }),
  category: z.enum(['saas', 'portfolio', 'ecommerce', 'blog', 'dashboard', 'landing'])
    .optional()
    .describe('Best-fitting template category for this app'),
})

export type DesignTokensOutput = z.infer<typeof DesignTokensSchema>

export const DESIGNER_PROMPT = `You are a senior UI/UX designer at a world-class design studio.

Given a project plan (app name + feature list), research current design trends and produce a comprehensive design system.

## Your Job

1. **Research first** — use \`webSearch\` to find 2-3 visually excellent apps in this space. Study their color palettes, typography, layout patterns, and what makes their UI feel polished. Example queries: "best SaaS dashboard design 2026", "modern e-commerce UI trends".
2. Analyze the project's features to determine the best app category (saas, portfolio, ecommerce, blog, dashboard, landing).
3. Generate a complete design token set with:
   - **Colors**: 8 semantic oklch colors that form a cohesive palette. Use oklch format: "oklch(L C H)" where L=lightness (0-1), C=chroma (0-0.4), H=hue (0-360).
   - **Fonts**: A display + body font pairing from Google Fonts. Include the full CSS import URL.
   - **Style**: Layout decisions informed by your research — card style, nav pattern, hero layout, spacing, motion level, imagery approach, page sections, content width.
4. Determine the best page sections for this app type (navbar, hero, features, etc.) — ordered as they should appear on the page.

## Rules

- ALL colors MUST be in oklch format. Never use hex, rgb, or hsl.
- Choose fonts that are available on Google Fonts.
- Be opinionated — make design decisions, don't punt.
- Ground your choices in real design trends from your research.
- The design system should feel cohesive — colors, fonts, and style should work together.
- For dark-theme apps (dashboards, developer tools): background lightness < 0.2, foreground lightness > 0.85.
- For light-theme apps (SaaS, blogs, landing pages): background lightness > 0.95, foreground lightness < 0.25.`

export function createDesigner(): Agent {
  return new Agent({
    id: 'designer',
    name: 'Design Agent',
    model: designerModel,
    description: 'Researches design trends and generates a design token system',
    instructions: DESIGNER_PROMPT,
    tools: {
      webSearch: openai.tools.webSearch(),
    },
    defaultOptions: {
      maxSteps: 3,
      modelSettings: { temperature: 0.5 },
    },
  })
}
```

**Verify:** `bunx tsc --noEmit`

---

## Task 5: Add designer role to provider routing

**Files:** Modify `server/lib/agents/provider.ts`

Add `'designer'` to the `Role` type (or wherever roles are defined). The designer should use the same model resolution as `analyst` — `createAgentModelResolver('designer')` will work if `designer` is added to the roles. If no role override is set, it falls back to the user-selected model.

Look at how `analyst` role is set up in `MODEL_CONFIGS` and mirror it for `designer`.

**Verify:** `bunx tsc --noEmit`

---

## Task 6: Add design workflow steps

**Files:** Modify `server/lib/agents/workflow.ts`

Add two new steps between `approvePlanStep` and `buildStep`:

### `designStep` (id: `'design'`)

```ts
import { createDesigner, DesignTokensSchema } from './designer'
import { rankTemplates, TEMPLATE_PRESETS } from './templates'
import type { DesignAgentTokens, TemplatePreset } from '../types'

export const designStep = createStep({
  id: 'design',
  inputSchema: z.object({
    approved: z.boolean(),
    plan: AnalystPlanSchema,
  }),
  outputSchema: z.object({
    tokens: DesignTokensSchema,
    recommendedTemplates: z.array(z.any()),  // TemplatePreset[]
    totalTokens: z.number(),
  }),
  execute: async ({ inputData, requestContext, abortSignal, outputWriter }) => {
    const agent = createDesigner()
    agent.__registerMastra(await getMastra())

    const planSummary = `App: ${inputData.plan.projectName}\nFeatures:\n${inputData.plan.features.map(f => `- ${f.name}: ${f.description}`).join('\n')}`

    const streamOutput: any = await agent.stream(
      `Generate a design system for this app:\n\n${planSummary}`,
      {
        requestContext,
        maxSteps: 3,
        abortSignal,
        structuredOutput: { schema: DesignTokensSchema },
      },
    )

    // Pipe fullStream chunks through outputWriter (same pattern as analystStep)
    const reader = streamOutput.fullStream.getReader()
    try {
      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        if (abortSignal.aborted) break
        if (chunk && outputWriter) {
          await outputWriter(chunk)
        }
      }
    } finally {
      reader.releaseLock()
    }

    const obj = await streamOutput.object
    const tokens = DesignTokensSchema.parse(obj)

    let totalTokens = 0
    try {
      const usage = await streamOutput.usage
      if (usage?.totalTokens) totalTokens = usage.totalTokens
    } catch {}

    const recommended = rankTemplates(tokens as DesignAgentTokens, tokens.category)

    return { tokens, recommendedTemplates: recommended, totalTokens }
  },
})
```

### `approveDesignStep` (id: `'approve-design'`)

```ts
export const approveDesignStep = createStep({
  id: 'approve-design',
  inputSchema: z.object({
    tokens: DesignTokensSchema,
    recommendedTemplates: z.array(z.any()),
    totalTokens: z.number(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    tokens: DesignTokensSchema,
    selectedTemplateId: z.string().optional(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    selectedTemplateId: z.string().optional(),
    customTokens: DesignTokensSchema.optional(),
  }),
  suspendSchema: z.object({
    tokens: DesignTokensSchema,
    recommendedTemplates: z.array(z.any()),
  }),
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    if (resumeData?.approved === false) {
      return bail({ approved: false, tokens: inputData.tokens })
    }

    if (resumeData?.approved === true) {
      const finalTokens = resumeData.customTokens ?? inputData.tokens
      return {
        approved: true,
        tokens: finalTokens,
        selectedTemplateId: resumeData.selectedTemplateId,
      }
    }

    return await suspend({
      tokens: inputData.tokens,
      recommendedTemplates: inputData.recommendedTemplates,
    })
  },
})
```

### Update workflow chain

Change from 3-step to 5-step:
```ts
export const generationWorkflow = createWorkflow({
  id: 'generation',
  inputSchema: z.object({ ... }),  // unchanged
  outputSchema: z.object({ ... }), // unchanged
})
  .then(analystStep)
  .then(approvePlanStep)
  .then(designStep)        // NEW
  .then(approveDesignStep)  // NEW
  .then(buildStep)

generationWorkflow.commit()
```

### Update `buildStep` input schema

`buildStep.inputSchema` must now accept `tokens` and `selectedTemplateId` from `approveDesignStep`:

```ts
inputSchema: z.object({
  approved: z.boolean(),
  tokens: DesignTokensSchema,
  selectedTemplateId: z.string().optional(),
}),
```

Update `buildStep.execute` to:
1. Accept `selectedTemplateId` and `tokens` from inputData
2. Adjust the `planPrompt` to include design tokens and template clone instructions

For **template mode** (selectedTemplateId is set), prepend to planPrompt:
```
IMPORTANT: Before building anything, run this command to overlay the template:
git clone --depth 1 --filter=blob:none --sparse https://github.com/VibeStackCodes/template.git /tmp/template && cd /tmp/template && git sparse-checkout set <template-id> && cp -r /tmp/template/<template-id>/* /workspace/ && cd /workspace && bun install

The app already has these sections from the "<template-name>" template: [list from template preset].
Customize the existing code based on the plan below. Modify content, add features, and apply the design tokens.
```

For **custom mode** (no selectedTemplateId):
```
Build the app according to this plan:
[features]

Apply this design system:
## Design System
Colors (oklch): primary: oklch(0.7 0.15 250), ...
Fonts: Display: "Inter", Body: "Inter"
Style: border-radius: 0.5rem, nav: fixed-top, hero: centered
Page Sections: navbar, hero, features, pricing, testimonials, faq, footer
```

Both modes include design tokens in the prompt. The `plan` is no longer in `inputData` — it needs to come from requestContext or be threaded through the workflow. Since `approveDesignStep` doesn't pass plan through, we need to add `plan` to the design step's output and thread it through. Update both `designStep.outputSchema` and `approveDesignStep` to pass `plan` through.

**Verify:** `bunx tsc --noEmit`

---

## Task 7: Register designer in Mastra

**Files:** Modify `server/lib/agents/mastra.ts`

Add designer agent to the Mastra registry:

```ts
import { createDesigner } from './designer'

export const mastra = new Mastra({
  agents: {
    orchestrator: createOrchestrator(),
    analyst: createAnalyst(),
    designer: createDesigner(),  // NEW
  },
  // ... rest unchanged
})
```

**Verify:** `bunx tsc --noEmit`, `bun run dev` — check no startup errors

---

## Task 8: Update route handler for multi-step suspend/resume

**Files:** Modify `server/routes/agent.ts`

The route handler currently has:
- **New generation**: streams analyst → suspends at `approve-plan` → emits `workflow_suspended`
- **Resume with runId**: resumes `approve-plan` → streams build → emits `done`

With two suspend points, the flow becomes:
- **New generation**: streams analyst → suspends at `approve-plan` → emits `workflow_suspended`
- **Resume approve-plan (approved=true)**: resumes `approve-plan` → workflow flows into design step → streams design agent → suspends at `approve-design` → emits `design_suspended`
- **Resume approve-design (approved=true)**: resumes `approve-design` → workflow flows into build step → streams build → emits `done`

### Schema changes

Add to `AgentRequest`:
```ts
step: z.enum(['approve-plan', 'approve-design']).optional()
  .describe('Which workflow step to resume (only with runId)'),
selectedTemplateId: z.string().optional()
  .describe('Selected template ID (only with approve-design resume)'),
```

### Resume path changes

The `if (runId)` branch splits into three cases:

**Case 1: Resume approve-plan (approved=true)**
- `resumeStream({ step: 'approve-plan', resumeData: { approved: true }, closeOnSuspend: true })`
- Bridge design step events (tool calls from designer agent web search)
- On `workflow-step-result` for design step: emit `design_ready`
- After stream closes (suspended at approve-design): emit `design_suspended`
- Settle design agent credits, persist design state

**Case 2: Resume approve-design (approved=true)**
- `resumeStream({ step: 'approve-design', resumeData: { approved: true, selectedTemplateId } })`
- Bridge build step events via `bridgeWorkflowStreamToSSE` (same as current build resume)
- Settle build credits, update project status

**Case 3: Rejection (approved=false)**
- `run.resume({ step: stepToResume, resumeData: { approved: false, feedback } })`
- Clear workflow state, settle credits to 0

### Import design types

Add `DesignReadyEvent`, `DesignSuspendedEvent` to the import from `../lib/types`.

**Verify:** `bunx tsc --noEmit`

---

## Task 9: Update client hook for design phase

**Files:** Modify `src/hooks/use-agent-stream.ts`

### Add state

```ts
const [pendingDesign, setPendingDesign] = useState<{
  tokens: DesignAgentTokens
  recommendedTemplates: TemplatePreset[]
} | null>(initialGenerationState?.pendingDesign ?? null)
```

### Add event handlers in `handleGenerationEvent`

```ts
case 'design_ready':
  // Design tokens generated — store for display
  break

case 'design_suspended':
  setPendingDesign({
    tokens: event.tokens,
    recommendedTemplates: event.recommendedTemplates,
  })
  setWorkflowRunId(event.runId)
  break

case 'design_approved':
  setPendingDesign(null)
  break
```

### Add `handleDesignApprove`

Similar to `handlePlanApprove` but sends `step: 'approve-design'` and `selectedTemplateId`:

```ts
const handleDesignApprove = useCallback(async (selectedTemplateId?: string) => {
  if (!workflowRunId) return

  // Add optimistic user message...

  const response = await apiFetch('/api/agent', {
    method: 'POST',
    body: JSON.stringify({
      runId: workflowRunId,
      approved: true,
      step: 'approve-design',
      selectedTemplateId,
      message: 'Design approved',
      projectId,
      model,
    }),
  })

  // Stream SSE events (same pattern as handlePlanApprove)...

  setPendingDesign(null)
  setWorkflowRunId(null)
}, [workflowRunId, projectId, model, ...])
```

### Add `handleDesignReject`

```ts
const handleDesignReject = useCallback(() => {
  if (workflowRunId) {
    apiFetch('/api/agent', {
      method: 'POST',
      body: JSON.stringify({
        runId: workflowRunId,
        approved: false,
        step: 'approve-design',
        projectId,
        model,
        message: '',
      }),
    }).catch(() => {})
  }
  setPendingDesign(null)
  setWorkflowRunId(null)
}, [workflowRunId, projectId, model])
```

### Modify `handlePlanApprove`

When plan is approved, the workflow resumes and runs the design step, then suspends again at `approve-design`. The existing `handlePlanApprove` already streams SSE and calls `handleGenerationEvent` per event — so the new `design_suspended` case handler will be triggered automatically. Key change: add `step: 'approve-plan'` to the request body. Don't clear `workflowRunId` after plan approve (it's needed for design approve).

### Export new values

Add to the return object: `pendingDesign`, `handleDesignApprove`, `handleDesignReject`

**Verify:** `bunx tsc --noEmit`

---

## Task 10: Create TemplateGallery component

**Files:** Create `src/components/ai-elements/template-gallery.tsx`

WordPress/Wix-style template card grid with:
- Template cards showing screenshot (placeholder), name, category badge, description, color swatches
- Selected state with ring highlight
- "Start from scratch" option (dashed border, custom mode)
- `onSelect(templateId | null)` callback

Uses `cn()` from `@/lib/utils`, Tailwind classes matching existing component style.

**Verify:** `bunx tsc --noEmit`

---

## Task 11: Add design section to chat column

**Files:** Modify `src/components/chat-column.tsx`

Add a design agent section after the plan approval section. Renders when `pendingDesign` is set:

1. `AgentHeader` for the design agent
2. Design agent tool activity (web search events) — needs `designToolSteps` tracking
3. `ThemeTokensCard` displaying `pendingDesign.tokens`
4. `TemplateGallery` with `pendingDesign.recommendedTemplates`
5. `HitlActions` with "Build with this design" / "Start over" buttons

Local state: `selectedTemplateId` for template selection within the gallery.

The hook needs to expose tracking for design agent tool events — add an `isDesignPhase` flag or `designToolSteps` array similar to `analystToolSteps`. The design phase starts when `handlePlanApprove` fires and ends when `design_suspended` is received.

**Verify:** `bunx tsc --noEmit`

---

## Task 12: Cleanup and verify

**Files:** All modified files

1. `bun run lint` — fix any unused imports/variables
2. `bunx tsc --noEmit` — zero errors
3. `bun run test` — all existing tests pass
4. Manual E2E test:
   - Start dev server: `bun run dev`
   - Create new project, send a prompt
   - Verify: analyst thinking → `plan_ready` + `workflow_suspended` → plan UI renders
   - Click Approve Plan → design agent thinking → `design_ready` + `design_suspended` → design UI renders (tokens + gallery)
   - Select a template (or "Start from scratch")
   - Click "Build with this design" → build SSE stream with tool events → `done` event
   - Click "Start over" → bail fires → type new prompt → fresh workflow starts

---

## Key Design Decisions

1. **Two suspend points**: `approve-plan` and `approve-design`. Each creates a separate SSE stream. Three HTTP connections total for a full generation (analyst → design → build).
2. **Template presets are metadata only**: `TemplatePreset` describes templates for the gallery UI and matching. The actual templates are complete pre-built apps in `VibeStackCodes/template/` — cloned into the sandbox at build time.
3. **Template clone via orchestrator prompt**: Instead of direct Daytona SDK calls in `buildStep`, the template clone commands are injected into the orchestrator prompt. The orchestrator runs them as its first action via `runCommand`.
4. **Design tokens injected into orchestrator prompt**: Both template and custom mode inject the approved design tokens into the orchestrator's system/user prompt so it applies them consistently.
5. **`step` field on resume request**: Distinguishes which suspend point to resume. The workflow itself handles step routing, but the route handler needs to know which step to bridge events from.
6. **Credit reservation per SSE stream**: Three reservations total (analyst, design, build) — each stream settles its own credits.
7. **Plan threaded through design steps**: The approved plan is passed from `approvePlanStep` → `designStep` → `approveDesignStep` → `buildStep` so the build step has both the plan and design tokens.

## Critical Files
- `server/lib/agents/designer.ts` — NEW: designer agent (web search + structured output)
- `server/lib/agents/templates.ts` — NEW: 12 template presets with oklch tokens + ranking
- `server/lib/agents/workflow.ts` — Modified: 3-step → 5-step workflow
- `server/routes/agent.ts` — Modified: multi-step resume (approve-plan + approve-design)
- `src/hooks/use-agent-stream.ts` — Modified: design state + approve/reject handlers
- `src/components/ai-elements/template-gallery.tsx` — NEW: template gallery component
- `src/components/chat-column.tsx` — Modified: design section with tokens + gallery + HITL
- `server/lib/types.ts` + `src/lib/types.ts` — Modified: design agent types + SSE events
- `server/lib/agents/provider.ts` — Modified: add designer role
- `server/lib/agents/mastra.ts` — Modified: register designer agent
