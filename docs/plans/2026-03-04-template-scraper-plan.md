# Template Scraper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a Claude Code skill + Playwright helper that scrapes top 3 templates per category from WordPress.org and Wix.com, converts each to a React+Vite+Tailwind app, and writes them to local folders.

**Architecture:** A Playwright TypeScript script handles browser automation (discovering Wix templates, capturing rendered HTML+CSS from any demo URL). A Claude Code skill (SKILL.md) orchestrates the pipeline: discover → capture → convert (using Claude itself) → verify build. WordPress discovery uses its REST API via WebFetch (no browser needed).

**Tech Stack:** Playwright (already installed), TypeScript/Bun, Claude Code skills, WordPress REST API, React 19, Vite, Tailwind v4, react-router-dom v7, shadcn/ui

---

## Task 1: Add `output/` to .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add the gitignore entry**

Add at the end of `.gitignore`:
```
# scraped template output
output/
```

**Step 2: Verify**

Run: `git check-ignore output/templates/test`
Expected: `output/templates/test`

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore output/ directory for template scraper"
```

---

## Task 2: Create the Playwright scraper script — `discover-wix` command

**Files:**
- Create: `scripts/scrape-template.ts`

**Context:** This script is a CLI with multiple subcommands. It uses Playwright (already in `devDependencies`) to automate Chromium. Bun runs it directly (`bun scripts/scrape-template.ts <command>`).

**Step 1: Create the script with `discover-wix` command**

```typescript
#!/usr/bin/env bun
/**
 * Template scraper — Playwright-based browser automation for template discovery and capture.
 *
 * Commands:
 *   discover-wix              — Scrape Wix template gallery categories + top 3 per category
 *   discover-wp               — Fetch WordPress.org REST API for top 3 themes per subject category
 *   capture <url> [--multi-page] — Visit a demo URL, extract rendered HTML+CSS+JS
 */

import { chromium, type Page, type Browser } from 'playwright'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateEntry {
  name: string
  demoUrl: string
  thumbnailUrl?: string
}

interface CategoryResult {
  name: string
  url: string
  templates: TemplateEntry[]
}

interface DiscoverResult {
  source: 'wix' | 'wordpress'
  categories: CategoryResult[]
}

interface CapturedPage {
  url: string
  html: string
  css: string
}

interface CaptureResult {
  title: string
  url: string
  pages: CapturedPage[]
}

// ---------------------------------------------------------------------------
// Discover Wix
// ---------------------------------------------------------------------------

async function discoverWix(): Promise<DiscoverResult> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    await page.goto('https://www.wix.com/website/templates', {
      waitUntil: 'networkidle',
      timeout: 30_000,
    })

    // Wait for template cards to appear
    await page.waitForSelector('[data-hook="template-card"], [class*="TemplateCard"], a[href*="/website/templates/html/"]', {
      timeout: 15_000,
    }).catch(() => {
      // Fallback: page might use different selectors
    })

    // Extract category links from sidebar/navigation
    const categoryLinks = await page.evaluate(() => {
      const links: { name: string; url: string }[] = []
      // Wix uses various navigation patterns — try common selectors
      const anchors = document.querySelectorAll(
        'a[href*="/website/templates/html/"]'
      )
      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href
        const text = (a as HTMLElement).textContent?.trim()
        // Filter to category pages (not individual templates)
        if (text && href && !href.includes('?') && text.length < 40) {
          // Deduplicate
          if (!links.some((l) => l.url === href)) {
            links.push({ name: text, url: href })
          }
        }
      }
      return links
    })

    const categories: CategoryResult[] = []

    for (const cat of categoryLinks.slice(0, 20)) {
      // Cap at 20 categories
      try {
        await page.goto(cat.url, { waitUntil: 'networkidle', timeout: 20_000 })
        await page.waitForTimeout(2000) // Let dynamic content load

        const templates = await page.evaluate(() => {
          const results: TemplateEntry[] = []
          // Try multiple selector patterns Wix might use
          const cards = document.querySelectorAll(
            '[data-hook="template-card"], [class*="template_card"], [class*="TemplateCard"]'
          )
          for (const card of Array.from(cards).slice(0, 3)) {
            const nameEl =
              card.querySelector('[data-hook="template-name"]') ||
              card.querySelector('h3, h4, [class*="title"]')
            const linkEl = card.querySelector('a[href*="view"]') || card.closest('a')
            const imgEl = card.querySelector('img')

            if (nameEl) {
              results.push({
                name: nameEl.textContent?.trim() || 'Untitled',
                demoUrl: (linkEl as HTMLAnchorElement)?.href || '',
                thumbnailUrl: imgEl?.src || undefined,
              })
            }
          }
          return results
        })

        if (templates.length > 0) {
          categories.push({ name: cat.name, url: cat.url, templates })
        }
      } catch {
        // Skip categories that fail to load
        console.error(`Failed to scrape category: ${cat.name}`)
      }
    }

    return { source: 'wix', categories }
  } finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------------------
// Discover WordPress
// ---------------------------------------------------------------------------

const WP_CATEGORIES = [
  'blog',
  'e-commerce',
  'education',
  'entertainment',
  'food-and-drink',
  'holiday',
  'news',
  'photography',
  'portfolio',
]

async function discoverWordpress(): Promise<DiscoverResult> {
  const categories: CategoryResult[] = []

  for (const tag of WP_CATEGORIES) {
    const url = new URL('https://api.wordpress.org/themes/info/1.2/')
    url.searchParams.set('action', 'query_themes')
    url.searchParams.set('request[tag]', tag)
    url.searchParams.set('request[per_page]', '3')
    url.searchParams.set('request[fields][description]', '1')
    url.searchParams.set('request[fields][screenshot_url]', '1')
    url.searchParams.set('request[fields][preview_url]', '1')
    url.searchParams.set('request[fields][tags]', '1')

    const res = await fetch(url.toString())
    if (!res.ok) {
      console.error(`WP API failed for tag "${tag}": ${res.status}`)
      continue
    }

    const data = (await res.json()) as {
      themes: Array<{
        name: string
        slug: string
        preview_url: string
        screenshot_url: string
        description: string
      }>
    }

    const templates: TemplateEntry[] = data.themes.map((t) => ({
      name: t.name,
      demoUrl: t.preview_url,
      thumbnailUrl: t.screenshot_url.startsWith('//')
        ? `https:${t.screenshot_url}`
        : t.screenshot_url,
    }))

    categories.push({
      name: tag,
      url: `https://wordpress.org/themes/tags/${tag}/`,
      templates,
    })
  }

  return { source: 'wordpress', categories }
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

async function captureTemplate(
  targetUrl: string,
  multiPage: boolean
): Promise<CaptureResult> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  })

  try {
    const pages: CapturedPage[] = []

    // Capture main page
    const mainPage = await captureSinglePage(context, targetUrl)
    pages.push(mainPage)

    if (multiPage) {
      // Find internal nav links
      const page = await context.newPage()
      await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30_000 })

      const navLinks = await page.evaluate((baseUrl: string) => {
        const links: string[] = []
        const origin = new URL(baseUrl).origin
        const pathname = new URL(baseUrl).pathname

        document.querySelectorAll('nav a, header a, [role="navigation"] a').forEach((a) => {
          const href = (a as HTMLAnchorElement).href
          if (
            href &&
            href.startsWith(origin) &&
            href !== baseUrl &&
            !href.includes('#') &&
            !links.includes(href)
          ) {
            links.push(href)
          }
        })
        return links.slice(0, 10) // Cap at 10 sub-pages
      }, targetUrl)

      await page.close()

      for (const link of navLinks) {
        try {
          const subPage = await captureSinglePage(context, link)
          pages.push(subPage)
        } catch {
          console.error(`Failed to capture sub-page: ${link}`)
        }
      }
    }

    // Extract title from first page
    const titleMatch = pages[0].html.match(/<title[^>]*>(.*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled'

    return { title, url: targetUrl, pages }
  } finally {
    await browser.close()
  }
}

async function captureSinglePage(
  context: Awaited<ReturnType<typeof chromium.launch>>extends Browser ? never : ReturnType<Browser['newContext']> extends Promise<infer C> ? C : never,
  url: string
): Promise<CapturedPage> {
  const page = await (context as any).newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(2000)

    // Get full rendered HTML
    const html = await page.content()

    // Extract all CSS (inline styles + external stylesheets)
    const css = await page.evaluate(async () => {
      const styles: string[] = []

      // Inline <style> tags
      document.querySelectorAll('style').forEach((s) => {
        if (s.textContent) styles.push(s.textContent)
      })

      // Linked stylesheets — read their content via CSSOM
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(sheet.cssRules || [])
          styles.push(rules.map((r) => r.cssText).join('\n'))
        } catch {
          // Cross-origin sheets can't be read via CSSOM
          if (sheet.href) {
            styles.push(`/* External: ${sheet.href} */`)
          }
        }
      }

      return styles.join('\n\n')
    })

    return { url, html, css }
  } finally {
    await page.close()
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case 'discover-wix': {
      const result = await discoverWix()
      console.log(JSON.stringify(result, null, 2))
      break
    }
    case 'discover-wp': {
      const result = await discoverWordpress()
      console.log(JSON.stringify(result, null, 2))
      break
    }
    case 'capture': {
      const url = args[0]
      if (!url) {
        console.error('Usage: scrape-template.ts capture <url> [--multi-page]')
        process.exit(1)
      }
      const multiPage = args.includes('--multi-page')
      const result = await captureTemplate(url, multiPage)
      console.log(JSON.stringify(result, null, 2))
      break
    }
    default:
      console.error(`Unknown command: ${command}`)
      console.error('Available: discover-wix, discover-wp, capture <url>')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

**Step 2: Verify it runs**

Run: `bun scripts/scrape-template.ts --help 2>&1 || true`
Expected: Shows "Unknown command" message (meaning the script loads)

**Step 3: Install Chromium if needed**

Run: `bunx playwright install chromium`
Expected: Chromium downloads (or "already installed")

**Step 4: Test `discover-wp` command**

Run: `bun scripts/scrape-template.ts discover-wp 2>&1 | head -30`
Expected: JSON output with WordPress categories and theme entries

**Step 5: Commit**

```bash
git add scripts/scrape-template.ts
git commit -m "feat: add Playwright template scraper script with discover + capture commands"
```

---

## Task 3: Fix TypeScript type for `captureSinglePage` context parameter

**Files:**
- Modify: `scripts/scrape-template.ts`

**Context:** The `captureSinglePage` function has a complex inferred type for the `context` parameter that won't compile cleanly. Fix it.

**Step 1: Fix the type**

Replace the `captureSinglePage` function signature:
```typescript
async function captureSinglePage(
  context: any, // Playwright BrowserContext
  url: string
): Promise<CapturedPage> {
```

This is a helper function in a script — `any` is fine here.

**Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: 0 errors (or only pre-existing errors, none from our script)

Note: `scripts/scrape-template.ts` might not be in tsconfig `include`. If tsc doesn't check it, run `bun scripts/scrape-template.ts discover-wp 2>&1 | head -5` to verify it runs.

**Step 3: Commit**

```bash
git add scripts/scrape-template.ts
git commit -m "fix: clean up scraper type annotations"
```

---

## Task 4: Create the Claude Code skill — `scrape-templates`

**Files:**
- Create: `.claude/skills/scrape-templates/SKILL.md`

**Context:** Claude Code skills are markdown files with YAML frontmatter. The skill instructs Claude on how to run the pipeline. Since Claude IS the LLM doing the conversion, the skill just needs to describe the workflow steps and conversion rules.

**Step 1: Create the skill file**

```markdown
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

Where `<slug>` is the template name lowercased with hyphens (e.g., "flavor-developer").

**File structure to create:**

```
output/templates/<source>/<category>/<slug>/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  tsconfig.app.json
  tailwind.config.ts        # Only if needed (Tailwind v4 uses CSS-first config)
  postcss.config.js
  src/
    main.tsx                 # React 19 entry point
    App.tsx                  # Router setup (react-router-dom v7)
    index.css                # Tailwind v4 directives + custom theme
    pages/
      HomePage.tsx           # Main/index page
      [OtherPage].tsx        # One component per captured page
    components/
      Header.tsx             # Shared header/nav
      Footer.tsx             # Shared footer
      [SectionName].tsx      # Reusable section components
  tokens.json                # Extracted DesignAgentTokens
  metadata.json              # { name, description, source, originalUrl, category }
```

**Conversion rules (CRITICAL):**

1. **React 19** — Functional components with TypeScript. Use `React.FC` sparingly, prefer explicit prop types.
2. **Tailwind v4** — Use utility classes directly. All colors in oklch format. No custom CSS files beyond `index.css`.
3. **shadcn/ui** — Use these components when the template has matching UI patterns: Button, Card, Input, Dialog, Badge, Avatar, Sheet, Tabs, Accordion, Separator. Import from relative paths (e.g., `@/components/ui/button`).
4. **Colors** — Extract ALL colors from the template's CSS. Convert hex/rgb/hsl to oklch format. Map to semantic roles: primary, secondary, accent, background, foreground, muted, card, destructive.
5. **Fonts** — Identify the template's font families. Find matching Google Fonts. Include the Google Fonts `<link>` in `index.html`.
6. **Images** — Replace ALL `<img>` tags with placeholder `<div>` elements. Use appropriate aspect ratios and oklch background colors. Add comments like `{/* Placeholder: Hero background image */}`.
7. **Multi-page** — If the template has multiple pages, create a `react-router-dom` v7 setup with `BrowserRouter`, `Routes`, and `Route`. Each page gets its own component in `src/pages/`.
8. **Responsive** — Preserve the template's responsive breakpoints using Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, `xl:`).
9. **Animations** — Convert CSS animations/transitions to Tailwind's built-in animation classes or inline styles. Keep it simple.
10. **No external dependencies** — Beyond React, react-router-dom, and Tailwind. No UI libraries other than shadcn/ui components.

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
    "sections": [
      { "id": "section-id", "label": "Human Label" }
    ],
    "contentWidth": "narrow|standard|wide"
  }
}
```

**metadata.json format:**

```json
{
  "name": "Template Name",
  "description": "One-line description of what this template is for",
  "source": "wordpress|wix",
  "originalUrl": "https://...",
  "category": "the-source-category",
  "vibestackCategory": "saas|portfolio|ecommerce|blog|dashboard|landing"
}
```

### Step 4: Verify Build

After writing all files for a template, verify it builds:

```bash
cd output/templates/<source>/<category>/<slug>
bun install
bun run build
```

If the build fails, read the error output and fix the source files. Retry up to 3 times.

### Step 5: Report

After processing all templates, print a summary table:

```
| Source    | Category    | Template         | Build | Files |
|-----------|-------------|------------------|-------|-------|
| wordpress | blog        | flavor-developer | PASS  | 12    |
| wordpress | blog        | flavor-flavor    | PASS  | 8     |
| ...       | ...         | ...              | ...   | ...   |
```

## Error Handling

- If `discover-wix` fails (Wix blocks automation), skip Wix and log a warning
- If `capture` fails for a specific template, skip it and continue with the next
- If conversion produces a broken build after 3 fix attempts, mark as FAIL and continue
- Always output the summary table at the end, including FAILed templates

## Important Notes

- The captured HTML may be very large (100KB+). Focus on the main content area, not boilerplate.
- WordPress preview URLs use `wp-themes.com` which shows the theme in a frame — you may need to extract the inner frame URL.
- Wix demos may require accepting cookies or dismissing popups — the Playwright script handles this.
- Output is LOCAL ONLY — do not push to any remote repository.
```

**Step 2: Verify the skill is discoverable**

Run: `ls .claude/skills/scrape-templates/SKILL.md`
Expected: File exists

**Step 3: Commit**

```bash
git add .claude/skills/scrape-templates/SKILL.md
git commit -m "feat: add scrape-templates Claude Code skill"
```

---

## Task 5: Test the full pipeline — WordPress `blog` category

**Files:** None (verification only)

**Step 1: Run WordPress discovery**

Run: `bun scripts/scrape-template.ts discover-wp 2>&1 | bun -e "const d=await Bun.stdin.json();console.log(d.categories[0].name, d.categories[0].templates.map(t=>t.name))"`
Expected: Shows `blog` category with 3 theme names

**Step 2: Capture the first template**

Pick the first template's `demoUrl` from the discovery output and run:
```bash
bun scripts/scrape-template.ts capture "<demoUrl>" 2>&1 | head -5
```
Expected: JSON output with `title`, `url`, `pages` array

**Step 3: Verify the capture output is usable**

Check that the HTML contains actual template content (not a WordPress wrapper frame).
If the preview URL loads inside a frame, update the scraper to extract the inner frame URL.

**Step 4: Note any issues for follow-up**

Document what worked and what needs fixing. Do NOT commit — this is a verification step.

---

## Task 6: Handle WordPress preview URL framing

**Files:**
- Modify: `scripts/scrape-template.ts`

**Context:** WordPress preview URLs (`wp-themes.com/<slug>/`) may show the theme inside an iframe wrapper. The capture command needs to detect this and extract the inner frame's content instead.

**Step 1: Update `captureSinglePage` to handle iframes**

Add iframe detection after page load:
```typescript
// After page.goto and waitForTimeout, add:
// Check if content is inside an iframe (wp-themes.com wraps themes)
const iframe = await page.$('iframe#theme-preview, iframe[src*="theme"]')
if (iframe) {
  const frame = await iframe.contentFrame()
  if (frame) {
    const html = await frame.content()
    const css = await frame.evaluate(/* same CSS extraction logic */)
    return { url, html, css }
  }
}
```

**Step 2: Test with a WordPress preview URL**

Run: `bun scripts/scrape-template.ts capture "https://wp-themes.com/flavor-developer/" | head -20`
Expected: HTML from the theme itself (contains `<header>`, `<main>`, etc.), NOT a wrapper page

**Step 3: Commit**

```bash
git add scripts/scrape-template.ts
git commit -m "fix: handle iframe-wrapped WordPress theme previews"
```

---

## Task 7: Handle Wix cookie/popup dismissal

**Files:**
- Modify: `scripts/scrape-template.ts`

**Context:** Wix shows cookie consent banners and other popups that can block template content. The Playwright script needs to dismiss these.

**Step 1: Add popup dismissal to `discoverWix` and `captureTemplate`**

Add a helper function:
```typescript
async function dismissPopups(page: Page): Promise<void> {
  // Wix cookie consent
  const cookieBtn = page.locator('button:has-text("Accept"), button:has-text("Got it"), [data-hook="cookie-banner-cta"]')
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click()
    await page.waitForTimeout(500)
  }

  // Generic close buttons on modals/overlays
  const closeBtn = page.locator('[aria-label="Close"], [class*="close-button"], button:has-text("×")')
  if (await closeBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.first().click()
    await page.waitForTimeout(500)
  }
}
```

Call `dismissPopups(page)` after each `page.goto()` + `waitForTimeout()`.

**Step 2: Test with Wix**

Run: `bun scripts/scrape-template.ts discover-wix 2>&1 | head -20`
Expected: JSON with Wix categories (or graceful error if Wix blocks)

**Step 3: Commit**

```bash
git add scripts/scrape-template.ts
git commit -m "fix: dismiss cookie/popup overlays during scraping"
```

---

## Task 8: End-to-end test — scrape and convert one WordPress template

**Files:** Output only (no source changes)

This is a manual verification task. Use the skill (or follow its steps manually) to:

1. Run `discover-wp` to get blog templates
2. Run `capture` on the first result
3. Read the captured HTML+CSS
4. Convert it to React+Tailwind manually (following the SKILL.md conversion rules)
5. Write the files to `output/templates/wordpress/blog/<slug>/`
6. Run `bun install && bun run build` in that directory
7. Fix any build errors

**Success criteria:** One fully converted template that builds successfully.

**Do NOT commit output/ — it's gitignored.**

---

## Key Design Decisions

1. **Playwright over Puppeteer** — Already in devDependencies for E2E tests. No new deps.
2. **Single script, multiple commands** — `discover-wix`, `discover-wp`, `capture` keep the interface clean.
3. **Skill over Python** — Claude Code is the LLM. The skill just describes how Claude should orchestrate the pipeline. No Pydantic AI needed.
4. **Local output only** — `output/templates/` is gitignored. Push to template repos is a separate manual step.
5. **Multi-page support** — `--multi-page` flag on `capture` follows nav links. Defaults to single page.
6. **oklch color extraction** — Done by Claude during conversion, not by automated tooling. Claude reads the CSS and converts colors.
