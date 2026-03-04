---
name: scrape-templates
description: "Convert a template URL to a scaffold-based React+Vite+Tailwind template. Usage: /scrape-templates <url>"
---

# Template Scraper

Convert a live website URL into a production-ready VibeStack template with centralized content, real images, and oklch design tokens.

## Usage

```
/scrape-templates <url>
```

Example:
```
/scrape-templates https://developer-developer.developer.blog/developer/developer/developer/developer
```

## Reference Implementation

The **Meridian** template in `VibeStackCodes/vibestack-templates/meridian/` is the canonical reference. Study its structure before converting a new template. Key files to examine:

- `src/lib/content.ts` — centralized content object with typed interfaces
- `content-slots.json` — slot manifest for LLM consumers
- `tokens.json` — oklch color tokens + font config + style metadata
- `src/index.css` — Tailwind v4 theme with `@theme inline` and CSS custom properties
- `src/App.tsx` — routing setup with `BrowserRouter`
- `src/pages/Index.tsx` — page composing discrete section components
- `src/components/*.tsx` — section components importing from `content.ts`

---

## Pipeline

### Step 1: Capture the template

Run the Playwright scraper to extract rendered HTML+CSS:

```bash
bun scripts/scrape-template.ts capture "<url>" --multi-page
```

Returns JSON: `{ title, url, pages: [{ url, html, css }] }`

If output is too large, retry without `--multi-page` (home page only).

**Alternative for blocked sites:** If Playwright is blocked (Cloudflare, heavy JS), ask the user to save a Safari `.webarchive` file and use:

```bash
bun scripts/extract-webarchive.ts <path-to-webarchive>
```

### Step 2: Set up the scaffold

1. **Determine the slug** — derive from the template name: lowercase, spaces to hyphens, strip special chars. Choose a short, memorable name (like "meridian", "aurora", "ember").

2. **Clone the scaffold** into a working directory:

```bash
cd /tmp
git clone https://github.com/VibeStackCodes/vibestack-template.git <slug>
cd <slug>
rm -rf .git
```

This gives you the full scaffold: shadcn/ui components, `vite-plugin-vibestack-editor.ts`, `__vibestack-preload.ts`, all dependencies, proper `vite.config.ts`.

3. **Clean scaffold content** — delete the scaffold's default pages and components (but keep `src/components/ui/`, `src/hooks/`, `src/lib/utils.ts`, `src/__vibestack-preload.ts`).

### Step 3: Convert to React+Tailwind

You ARE the converter. Read the captured HTML+CSS and write the template files on top of the scaffold.

#### 3a. Extract Design Tokens

**Colors:**
- Extract ALL colors from the captured CSS (backgrounds, text, borders, accents).
- Convert every color to **oklch** format. No hex, hsl, or rgb anywhere.
- Map the standard 8 semantic roles: `primary`, `secondary`, `accent`, `background`, `foreground`, `muted`, `card`, `destructive` (plus their `-foreground` variants).
- Additional brand-specific colors become **named tokens** (e.g., `merguez`, `coral`, `teal`). Register them in both `index.css` `:root` and `@theme inline` blocks so they work as Tailwind utilities (`bg-coral`, `text-merguez`).

**Fonts:**
- Identify font families from the scraped CSS.
- Find matching **Google Fonts**. Include the `<link>` in `index.html`.
- If the original uses a font available on a stable CDN (e.g., `s0.wp.com`), you may keep that URL.
- Register font families in `index.css` (e.g., `--font-display`, `--font-body`).

**Write `tokens.json`:**

```json
{
  "colors": {
    "primary": "oklch(L C H)",
    "secondary": "oklch(L C H)",
    "accent": "oklch(L C H)",
    "background": "oklch(L C H)",
    "foreground": "oklch(L C H)",
    "muted": "oklch(L C H)",
    "card": "oklch(L C H)",
    "destructive": "oklch(L C H)",
    "brandColorName": "oklch(L C H)"
  },
  "fonts": {
    "display": "Font Name",
    "body": "Font Name",
    "googleFontsUrl": "https://fonts.googleapis.com/css2?family=..."
  },
  "style": {
    "borderRadius": "0.5rem",
    "cardStyle": "flat|elevated|bordered|glass",
    "navStyle": "fixed-top|sidebar|minimal",
    "heroLayout": "centered|split|full-bleed|dashboard",
    "spacing": "compact|comfortable|spacious",
    "motion": "minimal|subtle|expressive|elegant",
    "imagery": "illustrations|photography|gradients|icons|data-viz|code-blocks",
    "sections": ["hero", "features", "testimonials", "pricing", "cta"],
    "contentWidth": "narrow|standard|wide"
  }
}
```

**Write `src/index.css`** with the full Tailwind v4 theme:

```css
@import 'tailwindcss';

@theme inline {
  --color-background: oklch(...);
  --color-foreground: oklch(...);
  /* ... all semantic tokens + brand tokens ... */
  --font-display: 'Font Name', serif;
  --font-body: 'Font Name', sans-serif;
  --radius-sm: ...;
  --radius-md: ...;
  --radius-lg: ...;
}

:root {
  --background: oklch(...);
  --foreground: oklch(...);
  /* ... matching CSS custom properties for shadcn/ui compatibility ... */
}

.dark {
  --background: oklch(...);
  --foreground: oklch(...);
  /* ... dark mode variants ... */
}
```

#### 3b. Write Content Module

**Create `src/lib/content.ts`** — ALL replaceable text and images in a single typed export:

```ts
export interface Post { /* ... */ }
export interface Service { /* ... */ }

export const content = {
  siteName: 'Fictional Brand Name',
  siteTagline: 'Lorem ipsum dolor sit amet...',
  hero: {
    headline: 'Lorem Ipsum Dolor Sit Amet',
    description: 'Lorem ipsum dolor sit amet...',
    image: 'https://images.unsplash.com/photo-...?w=1200&h=800&fit=crop',
  },
  nav: {
    links: [{ label: 'De Nobis', to: '/about' }],
  },
  // ... all other content sections
}

export function getPostBySlug(slug: string): Post | undefined {
  return content.posts.find((p) => p.slug === slug)
}
```

**Rules for content:**

1. **Replace ALL original text with Lorem Ipsum** — headlines, body copy, CTAs, navigation labels, author names, dates. Use thematic Latin-flavored placeholder text that matches the structural role (short for CTAs, long for body paragraphs).
2. **Replace ALL images with Unsplash URLs** — use `https://images.unsplash.com/photo-<id>?w=<width>&h=<height>&fit=crop`. Choose images that are contextually appropriate: landscapes for hero images, portraits with `&crop=face` for author photos, relevant objects for feature cards.
3. **Give the template a fictional brand name** — short, memorable, Latin-flavored (like "Meridian", "Aurora", "Castellum"). Use this name in `siteName`, header wordmark, footer, hero, metadata.
4. **Keep design tokens in the data** — `bgColor`, `textColor`, clip paths, and visual config stay alongside content in `content.ts`. They're part of the data structure the LLM can modify.
5. **Export typed interfaces** — `Post`, `Pillar`, `Service`, `Testimonial`, etc. Use `satisfies Type[]` on arrays for type safety with literal inference.

**Create `content-slots.json`** — manifest for LLM consumers:

```json
{
  "contentFile": "src/lib/content.ts",
  "description": "All replaceable content is in content.ts. Rewrite this single file to customize the template.",
  "slots": [
    { "path": "siteName", "type": "string", "description": "Brand name shown in header, footer, and hero" },
    { "path": "hero.headline", "type": "string", "description": "Main hero H1" },
    { "path": "hero.image", "type": "url", "description": "Hero background image" },
    ...
  ]
}
```

Every slot must have `path`, `type`, and a `description` explaining where it appears and its semantic role.

#### 3c. Write Components

Each visual section of the page becomes a discrete component in `src/components/`:

- **Import content from `content.ts`** — NEVER hardcode text or image URLs in components.
- **UI chrome stays in components** — button labels like "Read more", toggle icons (+/−), structural separators. These are patterns, not user content.
- **Use shadcn/ui components** when the template has matching patterns: `Accordion`, `Button`, `Sheet`, `Card`, `Tabs`, etc.
- **Use Tailwind utilities** — no inline styles unless absolutely necessary (clip-paths, aspect ratios).
- **Preserve the exact visual design** — match font sizes, spacing, colors, layout patterns 1:1 with the original. The converted template should be visually indistinguishable from the original (except with different text and images).

#### 3d. Write Pages and Routing

- Each captured page becomes a component in `src/pages/` that composes section components.
- `src/App.tsx` uses `BrowserRouter` + `Routes` from `react-router-dom` v7.
- Include a `ScrollToTop` component, `QueryClientProvider`, `TooltipProvider`, `Toaster` (scaffold patterns).
- Add a `NotFound.tsx` catch-all route.

#### 3e. Write Metadata

**`metadata.json`:**

```json
{
  "name": "Template Display Name",
  "description": "One-line description of the template's visual style and purpose.",
  "originalUrl": "https://original-site-url.com",
  "vibestackCategory": "saas|portfolio|ecommerce|blog|dashboard|landing"
}
```

### Step 4: Verify Build

```bash
bun install
bun run build
```

If build fails, read errors and fix. Retry up to 3 times. Common issues:
- Missing imports (check all components import from `content.ts` not deleted files)
- TypeScript errors (template uses `strict: false` — most type issues are import errors)
- Tailwind class conflicts (check `@theme inline` has all custom color tokens)

### Step 5: Publish to Repository

1. Clone the templates repo:

```bash
cd /tmp
git clone https://github.com/VibeStackCodes/vibestack-templates.git
cd vibestack-templates
```

2. Copy the template (exclude `node_modules`, `dist`, `.vite`, `bun.lock`):

```bash
cp -R /tmp/<slug>/ ./<slug>/
rm -rf ./<slug>/node_modules ./<slug>/dist ./<slug>/.vite ./<slug>/bun.lock ./<slug>/.git
```

3. Commit and push:

```bash
git add <slug>/
git commit -m "feat: add <slug> template — <one-line description>"
git push origin main
```

4. Report result:

```
Template: <name>
Repo:     VibeStackCodes/vibestack-templates/<slug>/
Build:    PASS
Files:    <count>
Slots:    <content slot count>
Colors:   <token count> (oklch)
Pages:    <page count>
```

---

## Content vs. Chrome Decision Guide

When deciding whether text belongs in `content.ts` or stays in the component:

**Put in `content.ts`** (replaceable content):
- Brand name, tagline, site description
- Hero headlines, descriptions, images
- Navigation link labels and paths
- Blog post/article titles, excerpts, body text, images
- Feature/service titles and descriptions
- Author names, bios, photos
- CTA headlines, descriptions, button labels
- Footer taglines, about-page copy
- Testimonial quotes, names, titles

**Keep in components** (UI chrome):
- "Read more", "Learn more" — generic CTA patterns
- Toggle icons (+, −, ×, ☰)
- "By", "To read", "min read" — structural metadata labels
- Aria labels for accessibility
- 404 "Page not found" generic messages
- Loading states, error states

**Heuristic:** "Would an LLM changing the site's topic (magazine → bakery) need to change this?" If yes → `content.ts`. If no → component.

---

## Quality Checklist

Before publishing, verify:

- [ ] `bun run build` passes with zero errors
- [ ] `content.ts` exists with ALL replaceable content (no hardcoded text in components)
- [ ] `content-slots.json` exists with descriptions for every slot
- [ ] `tokens.json` exists with all colors in oklch format
- [ ] `metadata.json` exists with name, description, originalUrl, category
- [ ] ALL images are real Unsplash URLs (no placeholder divs, no broken URLs)
- [ ] ALL text is Lorem Ipsum / fictional (no original site text remaining)
- [ ] Brand name is fictional (not the original site's name)
- [ ] Dark mode CSS variables are defined in `.dark` class
- [ ] `vite-plugin-vibestack-editor.ts` and `__vibestack-preload.ts` are present (from scaffold)
- [ ] No stale imports to deleted files (grep for old module paths)
