# VibeStack System Prompt Integration Design

> **Date**: 2026-02-23
> **Goal**: Decompose the VibeStack universal system prompt into pipeline-stage-specific prompts, replacing weak existing prompts with battle-tested design/image/quality guidance.
> **Source**: `/Users/ammishra/Downloads/vibestack-system-prompt.md`

---

## Overview

The system prompt contains 5 extractable subsystems:

| Prompt Section | Pipeline Stage | File(s) |
|---|---|---|
| `<role>` + `<design_system>` | Creative Director | `creative-director.ts` |
| `<page_type_patterns>` | Creative Director | `creative-director.ts` |
| `<image_system>` (query rules) | Creative Director + Section Renderers | `creative-director.ts`, `sections/primitives.ts` |
| `<image_system>` (resolver) | New edge function | `img.vibestack.codes` (separate Vercel project) |
| `<implementation_rules>` | Section Renderers | `sections/*.ts` |
| `<anti_patterns>` + `<quality_checklist>` | Page Validator | `page-validator.ts` |
| `<output_format>` (IMAGES data layer) | Page Assembler | `page-assembler.ts` |

---

## 1. Image Resolver — Separate Vercel Edge Function

### Architecture

```
Browser → GET img.vibestack.codes/s/{query}/{w}/{h}
  → Vercel Edge Function
    → Unsplash API: /search/photos?query={query}&per_page=3&orientation={auto}
    → Pick best aspect-ratio match
    → 302 redirect → https://images.unsplash.com/photo-{id}?w={w}&h={h}&fit=crop&auto=format&q=80
  → CDN caches redirect 24h (stale-while-revalidate: 7d)
  → SVG gradient fallback on error/no results
```

### Implementation

- **Repo**: New Vercel project (`img-vibestack-app`) or monorepo path
- **Route**: `app/api/s/[...params]/route.ts` (Next.js edge function) or Hono on Vercel
- **Cache**: In-memory Map initially, Upstash Redis for production
- **Rate limiting**: Unsplash free = 50 req/hr. With CDN + cache, most requests never hit API after first resolution
- **Compliance**: Trigger `download_location` endpoint per Unsplash API guidelines
- **Fallback**: SVG with gradient + query text label

### URL Pattern

```
https://img.vibestack.codes/s/{query}/{width}/{height}
```

- `{query}`: URL-encoded 4-10 word photo researcher query
- `{width}`: Pixel width (100-2400)
- `{height}`: Pixel height (100-2400)
- Optional `?crop=faces` for avatars/headshots

---

## 2. DesignSystem Type — Replaces ThemeTokens

### New Type

```typescript
interface DesignSystem {
  // Identity
  name: string

  // Colors (5 core + surfaces)
  colors: {
    primary: string      // hex
    secondary: string    // hex
    accent: string       // hex
    background: string   // hex
    text: string         // hex
    surface?: string
    muted?: string
    border?: string
  }

  // Typography
  fonts: {
    display: string   // Google Fonts name (NEVER Inter/Roboto/Arial/system-ui)
    body: string      // Google Fonts name
    mono?: string
  }

  // Spacing & Shape
  spacing: { section: string; card: string; element: string }
  borderRadius: string

  // Motion
  motion: { duration: string; easing: string }

  // NEW — Design Decisions from System Prompt
  aestheticDirection: AestheticDirection
  layoutStrategy: LayoutStrategy
  signatureDetail: string  // ONE memorable micro-interaction/visual detail

  // Image manifest — per-page image specifications
  imageManifest: Record<string, PageImageManifest>

  // Hero images (pre-fetched Unsplash URLs, backward compat)
  heroImages?: Array<{ url: string; alt: string; photographer?: string }>
}

type AestheticDirection =
  | 'editorial' | 'brutalist' | 'soft-organic' | 'luxury'
  | 'retro-futuristic' | 'playful-bold' | 'minimal-swiss'
  | 'dark-cinematic' | 'glassmorphic' | 'neo-corporate'
  | 'hand-drawn' | 'art-deco' | 'cyberpunk' | 'warm-neutral'
  | 'dashboard-dense'

type LayoutStrategy =
  | 'asymmetric-grid' | 'full-bleed' | 'card-based' | 'sidebar-main'
  | 'bento-grid' | 'single-column-editorial' | 'split-screen'
  | 'overlapping-layers' | 'scroll-driven'

interface PageImageManifest {
  [semanticKey: string]: {
    query: string         // 4-10 word photo researcher query
    width: number         // Pixel width matched to layout slot
    height: number        // Pixel height matched to layout slot
    alt: string           // Describes what viewer sees, NOT the query
    role: 'hero' | 'feature' | 'testimonial' | 'background' | 'product' | 'about' | 'card'
    loading: 'eager' | 'lazy'
    crop?: 'faces'        // For avatars/headshots
  }
}
```

### Migration

All references to `ThemeTokens` in the codebase become `DesignSystem`. Key files:
- `server/lib/agents/schemas.ts` (Zod schema definition)
- `server/lib/creative-director.ts` (output type)
- `server/lib/themed-code-engine.ts` (consumer)
- `server/lib/page-assembler.ts` (consumer)
- `server/lib/sections/*.ts` (all renderers via SectionContext)
- `server/lib/agents/orchestrator.ts` (passes tokens through pipeline)
- `server/lib/agents/machine.ts` (MachineContext type)
- Tests referencing ThemeTokens

---

## 3. Creative Director — Upgraded System Prompt

### Prompt Structure

The Creative Director's system prompt absorbs:

**`<role>`**: "You are three people in one: world-class UI/UX designer (15yr Pentagram/IDEO), senior React engineer (Vercel/Stripe/Linear), brand strategist."

**`<design_system>`**: BEFORE writing any IA, make 5 design decisions:
1. Aesthetic direction (pick from enum, never "clean and modern")
2. Color palette (exactly 5 hex codes: primary, secondary, accent, background, text)
3. Typography (display + body fonts, NEVER Inter/Roboto/Arial)
4. Layout strategy (from enum)
5. Signature detail (ONE memorable micro-interaction)

**`<page_type_patterns>`**: Adapt IA based on app type:
- Landing page → hero + social proof + features + pricing + FAQ + CTA + footer
- Dashboard → sidebar nav + data tables + charts + search/filter + modals
- E-commerce → product grid + detail modal + cart + filtering
- Portfolio → project showcase + about + contact
- Simple app → focused interface + input→output flow

**`<image_system>` query rules**: Generate image manifests following:
- Rule 1: Be specific and scenic, not abstract
- Rule 2: Include atmosphere and lighting
- Rule 3: Specify composition and framing
- Rule 4: Avoid generic stock queries
- Rule 5: Match aesthetic direction
- Rule 6: Size to container (hero=1600x900, feature=800x600, avatar=200x200, etc.)
- Rule 7: Queries must be 4-10 words

### Output Schema

```typescript
const CreativeSpecSchema = z.object({
  designSystem: DesignSystemSchema,   // includes all 5 decisions + image manifest
  sitemap: z.array(PageSpecSchema),
  navigation: NavigationSpecSchema,
  footer: FooterSpecSchema,
})
```

---

## 4. Section Renderers — Image + Implementation Rules

### imageSrc() Helper (rewritten)

```typescript
// server/lib/sections/primitives.ts
function imageSrc(query: string, w: number, h: number, crop?: string): string {
  const encoded = encodeURIComponent(query)
  const base = `https://img.vibestack.codes/s/${encoded}/${w}/${h}`
  return crop ? `${base}?crop=${crop}` : base
}
```

### Per-Category Image Guidance

| Category | Dimensions | Guidance |
|---|---|---|
| Heroes | 1600x900 | Cinematic, high-impact, gradient overlay for text readability |
| Features | 800x600 | Illustrate BENEFIT not feature. Natural light preferred. |
| Testimonials | 200x200 | `crop=faces`. Varied queries. Never reuse same query. |
| Backgrounds | 1920x1080 | Low contrast, always darkened with rgba(0,0,0,0.7-0.85) overlay |
| Cards | 600x400 | 3:2 ratio, `object-fit: cover` |
| Products | 600x600 | Clean, well-lit, white or dark background |
| About/Team | 800x600 | Candid > posed. Varied settings. |

### <img> Tag Requirements (all renderers)

```tsx
<img
  src={IMAGES.hero.src}
  alt={IMAGES.hero.alt}
  loading="eager"  // or "lazy" below fold
  width={1600}
  height={900}
  style={{ objectFit: 'cover', width: '100%', height: '100%' }}
  onError={(e) => {
    e.target.style.display = 'none'
    e.target.parentElement.style.background = 'linear-gradient(135deg, #1a1a2e, #16213e)'
  }}
/>
```

### Implementation Rules Absorbed

- Semantic HTML: `<header>`, `<main>`, `<section>`, `<footer>`, `<nav>`, `<article>`
- Every `<section>` gets an `id` for anchor linking
- Responsive: mobile-first, 320px → 1920px
- Animation: CSS transitions + `@keyframes`, transform/opacity only, 200-600ms ease-out
- Stagger entrance via `animation-delay`
- Scroll-triggered via IntersectionObserver
- Touch targets: minimum 44x44px on mobile
- Fluid typography: `clamp(1rem, 2.5vw, 1.5rem)`

---

## 5. Page Assembler — IMAGES Data Layer

Generated route files get a centralized IMAGES object:

```tsx
// Generated at top of route file
const IMAGES = {
  hero: {
    src: "https://img.vibestack.codes/s/aerial-cityscape-night-lights-futuristic/1600/900",
    alt: "City skyline at night with dramatic lighting",
  },
  featureWorkflow: {
    src: "https://img.vibestack.codes/s/person-using-laptop-minimal-desk-focused-work/800/600",
    alt: "Person working at a minimal desk setup",
  },
  testimonial1: {
    src: "https://img.vibestack.codes/s/professional-headshot-woman-natural-light-confident/200/200",
    alt: "Sarah, a satisfied customer",
  },
}
```

Populated from `DesignSystem.imageManifest[routePath]`. Section renderers reference `IMAGES.{key}` instead of inline URLs.

---

## 6. Page Validator — Anti-Patterns + Quality Checklist

### Anti-Pattern Detection (new rules)

**Visual anti-patterns** (regex on generated JSX):
- Purple/blue gradient hero with centered white text
- Grid of 3 identical cards with icon+title+description
- Generic blob/wave SVG decorations
- Uniform `rounded-2xl` on everything
- `#f5f5f5` background with white cards
- Same border-radius/padding/shadow everywhere

**Content anti-patterns**:
- "Lorem ipsum" or `[Your text here]` or `[placeholder]`
- Headlines: "Welcome to", "Why Choose Us", "Get Started Today"
- CTAs all saying "Get Started" or "Learn More"
- "seamless", "cutting-edge", "revolutionary", "leverage", "synergy"
- Testimonials from "John D., CEO" with no company

**Code anti-patterns**:
- Mixed inline styles + Tailwind on same element
- `onClick={() => {}}` (empty handlers)
- Unused imports or state variables
- Console.log statements

### Quality Checklist (validation pass)

- [ ] Every `<img>` has `alt`, `loading`, `onError`
- [ ] No duplicate image queries on same page
- [ ] At least ONE scroll-triggered or hover animation
- [ ] Responsive breakpoints present (mobile + tablet + desktop)
- [ ] No placeholder text detected
- [ ] Text contrast ≥ 4.5:1 (approximate from palette hex values)

---

## Implementation Order

1. **DesignSystem type + Zod schema** — Define the new type, no consumers yet
2. **Image resolver edge function** — Separate Vercel project, deploy independently
3. **Creative Director prompt rewrite** — New system prompt + output schema producing DesignSystem
4. **ThemeTokens → DesignSystem migration** — Update all consumers (themed-code-engine, orchestrator, machine context, assembler, renderers)
5. **Section renderer updates** — New imageSrc(), IMAGES data layer, implementation rules
6. **Page assembler updates** — IMAGES const generation, img tag attributes
7. **Page validator updates** — Anti-pattern + quality checklist rules
8. **E2E test** — Generate an app and verify image resolver, design quality, no anti-patterns

---

## Risks

- **Breaking change scope**: `ThemeTokens` → `DesignSystem` touches ~15-20 files + tests
- **Image resolver latency**: First request per query hits Unsplash API (~200-500ms). CDN caches subsequent requests.
- **Unsplash rate limits**: Free tier = 50 req/hr. Need production access for scale.
- **LLM compliance**: Creative Director must actually follow the 5-decision framework — may need structured output enforcement (Zod schema with strict enum fields)
- **Font loading**: Google Fonts in generated apps need `@import` in CSS — already supported by current theme CSS generation
