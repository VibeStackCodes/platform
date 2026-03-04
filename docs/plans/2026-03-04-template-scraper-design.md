# Template Scraper Design

## Goal

Scrape top 3 templates from each category on WordPress.org and Wix.com, convert them to React + Vite + Tailwind apps, and output to local folders.

## Architecture

**Claude Code skill** orchestrates the full pipeline. A **Playwright helper script** handles JS-rendered sites (Wix). Claude (this session, via Claude Max OAuth) does the HTML→React conversion directly — no external API keys needed.

### Components

```
scripts/
  scrape-template.ts        # Playwright helper: renders JS pages, extracts HTML+CSS+JS

.claude/skills/
  scrape-templates/          # Claude Code skill for the pipeline
    SKILL.md

output/templates/            # Local output (gitignored)
  wordpress/
    <category>/
      <slug>/                # Full React+Vite+Tailwind app
        src/
        index.html
        package.json
        tokens.json          # Extracted DesignAgentTokens
  wix/
    <category>/
      <slug>/
```

## Pipeline

### Step 1: Discover Templates

**WordPress** — REST API (no browser):
```
GET https://api.wordpress.org/themes/info/1.2/
  ?action=query_themes
  &request[tag]=<category>
  &request[per_page]=3
  &request[fields][description]=1
  &request[fields][screenshot_url]=1
  &request[fields][preview_url]=1
  &request[fields][tags]=1
```

Subject categories: `blog`, `e-commerce`, `education`, `entertainment`, `food-and-drink`, `holiday`, `news`, `photography`, `portfolio`

Returns: name, slug, preview_url, screenshot_url, description, tags

**Wix** — Playwright script:
```bash
bun scripts/scrape-template.ts discover-wix
```
- Navigates to `https://www.wix.com/website/templates`
- Extracts category nav links
- For each category: navigate, grab first 3 template cards (name + demo URL)
- Outputs JSON to stdout

### Step 2: Capture Template Content

For each template demo URL:
```bash
bun scripts/scrape-template.ts capture <url>
```

Playwright:
1. Visits the demo/preview URL
2. Waits for network idle (full render)
3. Extracts rendered HTML via `page.content()`
4. Extracts all `<style>` blocks and linked stylesheets
5. Extracts inline `<script>` content (for interactive behavior)
6. Captures all page URLs if multi-page (by scanning nav links)
7. For each page: captures HTML+CSS
8. Outputs JSON: `{ title, url, pages: [{ url, html, css, js }] }`

### Step 3: Convert to React+Tailwind

Claude (this session) receives the captured HTML+CSS+JS and converts it:

**Conversion rules:**
- React 19 functional components with TypeScript
- Tailwind v4 utility classes (no custom CSS files)
- shadcn/ui components where appropriate (Button, Card, Input, Dialog, etc.)
- All colors extracted and converted to oklch format
- Multi-page: react-router-dom v7 with separate page components
- Images → placeholder `<div>` elements with appropriate aspect ratios and bg colors
- Google Fonts via `<link>` in index.html
- Structure matches our scaffold: `src/pages/`, `src/components/`, `src/App.tsx`

**Output per template:**
- Full file tree written to `output/templates/<source>/<category>/<slug>/`
- `tokens.json` with extracted `DesignAgentTokens` (oklch colors, fonts, style)
- `metadata.json` with name, description, source, original URL, category

### Step 4: Verify Build

For each converted template:
```bash
cd output/templates/<source>/<category>/<slug>
bun install
bun run build
```

If build fails, Claude attempts to fix errors (max 3 retries).

## Playwright Script API

`scripts/scrape-template.ts` — TypeScript, runs with Bun + Playwright.

### Commands

```bash
# Discover Wix categories and top templates
bun scripts/scrape-template.ts discover-wix
# → stdout: { categories: [{ name, url, templates: [{ name, demoUrl }] }] }

# Capture a single template's rendered content
bun scripts/scrape-template.ts capture <url> [--multi-page]
# → stdout: { title, url, pages: [{ url, html, css, js }] }
```

### Dependencies
- `playwright` (browser automation)
- Chromium browser (installed via `bunx playwright install chromium`)

## Design Tokens Extraction

During conversion, Claude extracts design tokens from the HTML/CSS:

```json
{
  "colors": {
    "primary": "oklch(0.55 0.15 250)",
    "secondary": "oklch(0.65 0.10 280)",
    "accent": "oklch(0.70 0.20 160)",
    "background": "oklch(0.99 0 0)",
    "foreground": "oklch(0.15 0 0)",
    "muted": "oklch(0.95 0.01 250)",
    "card": "oklch(0.98 0 0)",
    "destructive": "oklch(0.55 0.20 25)"
  },
  "fonts": {
    "display": "Inter",
    "body": "Inter",
    "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
  },
  "style": {
    "borderRadius": "0.5rem",
    "cardStyle": "flat",
    "navStyle": "fixed-top",
    "heroLayout": "centered",
    "spacing": "comfortable",
    "motion": "subtle",
    "imagery": "illustrations",
    "sections": [
      { "id": "navbar", "label": "Navigation Bar" },
      { "id": "hero", "label": "Hero Section" }
    ],
    "contentWidth": "standard"
  }
}
```

## Output Structure

```
output/templates/
  wordpress/
    blog/
      flavor-developer/
        src/
          App.tsx
          main.tsx
          pages/
            HomePage.tsx
          components/
            Header.tsx
            Footer.tsx
        index.html
        package.json
        tailwind.config.ts
        tokens.json
        metadata.json
    e-commerce/
      flavor-flavor/
        ...
  wix/
    restaurant/
      japanese-restaurant/
        ...
```

## Skill Invocation

```bash
# Scrape all categories from both sources
/scrape-templates

# Scrape only WordPress
/scrape-templates wordpress

# Scrape only Wix
/scrape-templates wix

# Convert a single URL
/scrape-templates https://wp-themes.com/flavor-developer/
```

## Constraints

- No ANTHROPIC_API_KEY — uses Claude Max OAuth token (this Claude Code session)
- No push to remote repos — output is local only
- Templates are gitignored (`output/templates/` in .gitignore)
- Playwright Chromium must be installed (`bunx playwright install chromium`)

## Success Criteria

- Top 3 templates scraped from each category on WordPress and Wix
- Each converted to a buildable React + Vite + Tailwind app
- Design tokens extracted in oklch format
- `bun run build` passes for each converted app
