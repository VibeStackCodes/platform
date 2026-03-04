---
name: scrape-templates
description: "Scrape top templates from WordPress.org and Wix.com, convert each to a React+Vite+Tailwind app. Usage: /scrape-templates [wordpress|wix|<url>]"
---

# Template Scraper

Scrape templates from WordPress.org and Wix.com, convert to React+Vite+Tailwind apps.

## Prerequisites

Ensure Chromium is installed for Playwright:
```bash
bunx playwright install chromium
```

## Usage

- `/scrape-templates` — Scrape all categories from both WordPress and Wix
- `/scrape-templates wordpress` — WordPress only
- `/scrape-templates wix` — Wix only
- `/scrape-templates <url>` — Convert a single template demo URL

## Pipeline Steps

### Step 1: Discover Templates

**WordPress** — run:
```bash
bun scripts/scrape-template.ts discover-wp
```
Returns JSON: `{ source: "wordpress", categories: [{ name, url, templates: [{ name, demoUrl }] }] }`

**Wix** — run:
```bash
bun scripts/scrape-template.ts discover-wix
```
Returns JSON: `{ source: "wix", categories: [{ name, url, templates: [{ name, demoUrl }] }] }`

### Step 2: Capture Each Template

For each template's `demoUrl`, run:
```bash
bun scripts/scrape-template.ts capture "<demoUrl>" --multi-page
```
Returns JSON: `{ title, url, pages: [{ url, html, css }] }`

The output may be very large. If it exceeds context limits, capture without `--multi-page` (home page only).

### Step 3: Convert to React+Tailwind

You ARE the converter. For each captured template, convert the HTML+CSS into a full React app.

**Output directory:** `output/templates/<source>/<category>/<slug>/`

Where `<slug>` is the template name lowercased with spaces replaced by hyphens.

**File structure to create:**

```
output/templates/<source>/<category>/<slug>/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  tsconfig.app.json
  postcss.config.js
  src/
    main.tsx
    App.tsx
    index.css
    pages/
      HomePage.tsx
      [OtherPage].tsx
    components/
      Header.tsx
      Footer.tsx
      [SectionName].tsx
  tokens.json
  metadata.json
```

**Conversion rules (CRITICAL):**

1. **React 19** — Functional components with TypeScript.
2. **Tailwind v4** — Use utility classes directly. All colors in oklch format. No custom CSS files beyond `index.css`.
3. **shadcn/ui** — Use these components when the template has matching UI patterns: Button, Card, Input, Dialog, Badge, Avatar, Sheet, Tabs, Accordion, Separator. Import from `@/components/ui/<component>`.
4. **Colors** — Extract ALL colors from the template CSS. Convert hex/rgb/hsl to oklch format. Map to semantic roles: primary, secondary, accent, background, foreground, muted, card, destructive.
5. **Fonts** — Identify font families. Find matching Google Fonts. Include the Google Fonts `<link>` in `index.html`.
6. **Images** — Replace ALL `<img>` tags with placeholder `<div>` elements. Use appropriate aspect ratios and oklch background colors. Add comments like `{/* Placeholder: Hero image */}`.
7. **Multi-page** — If multiple pages, create `react-router-dom` v7 setup with `BrowserRouter`, `Routes`, `Route`. Each page gets its own component in `src/pages/`.
8. **Responsive** — Preserve responsive breakpoints using Tailwind prefixes (`sm:`, `md:`, `lg:`, `xl:`).
9. **No external deps** — Beyond React, react-router-dom, and Tailwind. No UI libraries other than shadcn/ui.

**package.json template:**

```json
{
  "name": "<slug>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

**tokens.json format:**

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
    "destructive": "oklch(L C H)"
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
    "sections": [{ "id": "section-id", "label": "Human Label" }],
    "contentWidth": "narrow|standard|wide"
  }
}
```

**metadata.json format:**

```json
{
  "name": "Template Name",
  "description": "One-line description",
  "source": "wordpress|wix",
  "originalUrl": "https://...",
  "category": "source-category",
  "vibestackCategory": "saas|portfolio|ecommerce|blog|dashboard|landing"
}
```

### Step 4: Verify Build

After writing all files for a template:

```bash
cd output/templates/<source>/<category>/<slug>
bun install
bun run build
```

If build fails, read errors and fix. Retry up to 3 times.

### Step 5: Report

Print a summary table:

```
| Source    | Category    | Template         | Build | Files |
|-----------|-------------|------------------|-------|-------|
| wordpress | blog        | flavor-developer | PASS  | 12    |
```

## Error Handling

- If `discover-wix` fails, skip Wix and log a warning
- If `capture` fails for a template, skip it and continue
- If conversion produces broken build after 3 fix attempts, mark FAIL and continue
- Always output summary table at the end

## Important Notes

- Captured HTML may be very large (100KB+). Focus on main content, not boilerplate.
- WordPress preview URLs use `wp-themes.com` which may show theme in a frame — the scraper handles iframe extraction.
- Output is LOCAL ONLY — do not push to any remote repository.
