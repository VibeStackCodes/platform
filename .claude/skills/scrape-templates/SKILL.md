---
name: scrape-templates
description: "Convert a template URL to a React+Vite+Tailwind app. Usage: /scrape-templates <url>"
---

# Template Scraper

Convert a live template/website URL into a React + Vite + Tailwind app.

## Usage

```
/scrape-templates <url>
```

Example:
```
/scrape-templates https://wp-themes.com/blanky/
```

## Pipeline

### Step 1: Capture the template

Run the Playwright scraper to extract rendered HTML+CSS:

```bash
bun scripts/scrape-template.ts capture "<url>" --multi-page
```

Returns JSON: `{ title, url, pages: [{ url, html, css }] }`

If output is too large, retry without `--multi-page` (home page only).

### Step 2: Determine the slug

Derive `<slug>` from the template title: lowercase, spaces to hyphens, strip special chars.

### Step 3: Convert to React+Tailwind

You ARE the converter. Read the captured HTML+CSS and convert it into a full React app.

**Output directory:** `output/templates/<slug>/`

**File structure to create:**

```
output/templates/<slug>/
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
7. **Multi-page** — If multiple pages were captured, create `react-router-dom` v7 setup with `BrowserRouter`, `Routes`, `Route`. Each page gets its own component in `src/pages/`.
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

**tokens.json** — Extract design tokens from the template:

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

**metadata.json:**

```json
{
  "name": "Template Name",
  "description": "One-line description",
  "originalUrl": "https://...",
  "vibestackCategory": "saas|portfolio|ecommerce|blog|dashboard|landing"
}
```

### Step 4: Verify Build

```bash
cd output/templates/<slug>
bun install
bun run build
```

If build fails, read errors and fix. Retry up to 3 times.

### Step 5: Report

Print result:
```
Template: <name>
Output:   output/templates/<slug>/
Build:    PASS/FAIL
Files:    <count>
```

## Important Notes

- Captured HTML may be very large (100KB+). Focus on main content, not boilerplate.
- WordPress preview URLs on `wp-themes.com` may show the theme in an iframe — the scraper handles iframe extraction automatically.
- Output is LOCAL ONLY — do not push to any remote repository.
