#!/usr/bin/env bun
/**
 * Playwright-based CLI for scraping web template galleries.
 *
 * Usage:
 *   bun scripts/scrape-template.ts discover-wp
 *   bun scripts/scrape-template.ts discover-wix
 *   bun scripts/scrape-template.ts capture <url> [--multi-page]
 */

import { chromium, type Page } from 'playwright'

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
// Helper: dismiss cookie consent / overlay popups
// ---------------------------------------------------------------------------

async function dismissPopups(page: Page): Promise<void> {
  // Cookie consent buttons
  const cookieBtn = page.locator(
    'button:has-text("Accept"), button:has-text("Got it"), [data-hook="cookie-banner-cta"]',
  )
  if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cookieBtn.click()
    await page.waitForTimeout(500)
  }
  // Generic close/dismiss buttons
  const closeBtn = page.locator(
    '[aria-label="Close"], [class*="close-button"], button:has-text("×")',
  )
  if (await closeBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.first().click({ force: true, timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
}

// ---------------------------------------------------------------------------
// Command: discover-wp
// ---------------------------------------------------------------------------

async function discoverWp(): Promise<void> {
  const categories = [
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

  const result: DiscoverResult = { source: 'wordpress', categories: [] }

  for (const cat of categories) {
    const url =
      `https://api.wordpress.org/themes/info/1.2/?action=query_themes` +
      `&request[tag]=${cat}` +
      `&request[per_page]=3` +
      `&request[fields][description]=1` +
      `&request[fields][screenshot_url]=1` +
      `&request[fields][preview_url]=1` +
      `&request[fields][tags]=1`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.error(`[discover-wp] HTTP ${res.status} for category: ${cat}`)
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      const themes: any[] = data?.themes ?? []

      const templates: TemplateEntry[] = themes.map((t: any) => ({
        name: t.name ?? t.slug ?? 'unknown',
        demoUrl: t.preview_url ?? `https://wordpress.org/themes/${t.slug}/`,
        thumbnailUrl: t.screenshot_url ?? undefined,
      }))

      result.categories.push({
        name: cat,
        url: `https://wordpress.org/themes/tags/${cat}/`,
        templates,
      })
    } catch (err) {
      console.error(`[discover-wp] Failed for category "${cat}":`, err)
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// Command: discover-wix
// ---------------------------------------------------------------------------

async function discoverWix(): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  })

  const result: DiscoverResult = { source: 'wix', categories: [] }

  try {
    const page = await context.newPage()
    await page.goto('https://www.wix.com/website/templates', {
      waitUntil: 'networkidle',
    })
    await dismissPopups(page)

    // Extract category links from navigation
    const categoryLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/website/templates/html/"]'))
      const seen = new Set<string>()
      return anchors
        .map((a) => {
          const href = (a as HTMLAnchorElement).href
          const text = (a as HTMLAnchorElement).textContent?.trim() ?? ''
          return { name: text, url: href }
        })
        .filter(({ url, name }) => {
          if (!name || seen.has(url)) return false
          seen.add(url)
          return true
        })
    })

    const capped = categoryLinks.slice(0, 20)

    for (const cat of capped) {
      try {
        const catPage = await context.newPage()
        await catPage.goto(cat.url, { waitUntil: 'networkidle' })
        await dismissPopups(catPage)

        const templates = await catPage.evaluate(() => {
          // Try multiple selector strategies for template cards
          const selectors = [
            '[data-hook="template-card"]',
            '[class*="TemplateCard"]',
            '[class*="template_card"]',
            '[class*="templateCard"]',
          ]

          let cards: Element[] = []
          for (const sel of selectors) {
            const found = Array.from(document.querySelectorAll(sel))
            if (found.length > 0) {
              cards = found
              break
            }
          }

          return cards.slice(0, 3).map((card) => {
            const anchor = card.querySelector('a') as HTMLAnchorElement | null
            const img = card.querySelector('img') as HTMLImageElement | null
            const nameEl = card.querySelector(
              '[class*="title"], [class*="name"], h3, h4',
            )
            return {
              name: nameEl?.textContent?.trim() ?? anchor?.textContent?.trim() ?? 'Untitled',
              demoUrl: anchor?.href ?? '',
              thumbnailUrl: img?.src ?? img?.dataset['src'] ?? undefined,
            }
          })
        })

        const validTemplates = templates.filter((t) => t.demoUrl)
        result.categories.push({
          name: cat.name,
          url: cat.url,
          templates: validTemplates,
        })

        await catPage.close()
      } catch (err) {
        console.error(`[discover-wix] Failed for category "${cat.name}":`, err)
      }
    }

    await page.close()
  } finally {
    await context.close()
    await browser.close()
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// Helper: extract CSS from a page frame
// ---------------------------------------------------------------------------

async function extractCss(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = []

    // Inline <style> tag contents
    document.querySelectorAll('style').forEach((s) => {
      if (s.textContent) parts.push(s.textContent)
    })

    // CSSOM rules from stylesheets (skip cross-origin)
    Array.from(document.styleSheets).forEach((sheet) => {
      try {
        const rules = Array.from(sheet.cssRules ?? [])
        parts.push(rules.map((r) => r.cssText).join('\n'))
      } catch {
        // Cross-origin sheet — note URL only
        if (sheet.href) parts.push(`/* cross-origin: ${sheet.href} */`)
      }
    })

    return parts.join('\n\n')
  })
}

// ---------------------------------------------------------------------------
// Helper: capture a single URL into a CapturedPage
// ---------------------------------------------------------------------------

async function captureSinglePage(page: Page, targetUrl: string): Promise<CapturedPage> {
  await page.goto(targetUrl, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForTimeout(2000)

  // Wait for Cloudflare challenge to resolve (up to 15s)
  const isCloudflare = await page.evaluate(
    () =>
      document.title.includes('Checking your browser') ||
      !!document.querySelector('#challenge-form, .challenge-running'),
  )
  if (isCloudflare) {
    console.error('[capture] Cloudflare challenge detected, waiting up to 15s...')
    await page
      .waitForFunction(
        () =>
          !document.title.includes('Checking your browser') &&
          !document.querySelector('#challenge-form, .challenge-running'),
        { timeout: 15_000 },
      )
      .catch(() => console.error('[capture] Cloudflare challenge did not resolve'))
    await page.waitForTimeout(2000)
  }

  await dismissPopups(page)

  // WordPress iframe detection
  const wpIframe =
    page.frameLocator('iframe#theme-preview').first() ??
    page.frameLocator('iframe[src*="theme"]').first()

  // Try to find the iframe element so we can switch to it
  const iframeEl = await page
    .$('iframe#theme-preview, iframe[src*="theme"]')
    .catch(() => null)

  if (iframeEl) {
    // Switch to iframe content frame
    const frame = await iframeEl.contentFrame()
    if (frame) {
      const html = await frame.content()
      const css = await frame.evaluate(() => {
        const parts: string[] = []
        document.querySelectorAll('style').forEach((s) => {
          if (s.textContent) parts.push(s.textContent)
        })
        Array.from(document.styleSheets).forEach((sheet) => {
          try {
            const rules = Array.from(sheet.cssRules ?? [])
            parts.push(rules.map((r) => r.cssText).join('\n'))
          } catch {
            if (sheet.href) parts.push(`/* cross-origin: ${sheet.href} */`)
          }
        })
        return parts.join('\n\n')
      })
      return { url: targetUrl, html, css }
    }
  }

  const html = await page.content()
  const css = await extractCss(page)
  return { url: targetUrl, html, css }
}

// ---------------------------------------------------------------------------
// Command: capture
// ---------------------------------------------------------------------------

async function capture(url: string, multiPage: boolean): Promise<void> {
  // Use headed mode to bypass Cloudflare bot detection
  const headless = !args.includes('--headed')
  const browser = await chromium.launch({ headless, args: ['--disable-blink-features=AutomationControlled'] })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  })

  const result: CaptureResult = { title: '', url, pages: [] }

  try {
    const page = await context.newPage()

    // Capture the main page
    const mainCaptured = await captureSinglePage(page, url)
    result.pages.push(mainCaptured)

    // Extract title from the main page
    result.title = await page.title().catch(() => url)

    if (multiPage) {
      // Collect internal links from nav / header
      const origin = new URL(url).origin
      const internalLinks = await page.evaluate((pageOrigin) => {
        const selectors = ['nav a', 'header a', '[role="navigation"] a']
        const seen = new Set<string>()
        const links: string[] = []

        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((a) => {
            const href = (a as HTMLAnchorElement).href
            try {
              const parsed = new URL(href)
              if (
                parsed.origin === pageOrigin &&
                parsed.hash === '' &&
                !seen.has(href)
              ) {
                seen.add(href)
                links.push(href)
              }
            } catch {
              // skip malformed URLs
            }
          })
        }

        return links
      }, origin)

      const subPages = internalLinks.filter((link) => link !== url).slice(0, 10)

      for (const subUrl of subPages) {
        try {
          const subPage = await context.newPage()
          const captured = await captureSinglePage(subPage, subUrl)
          result.pages.push(captured)
          await subPage.close()
        } catch (err) {
          console.error(`[capture] Failed for sub-page "${subUrl}":`, err)
        }
      }
    }

    await page.close()
  } finally {
    await context.close()
    await browser.close()
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'discover-wp':
    await discoverWp()
    break

  case 'discover-wix':
    await discoverWix()
    break

  case 'capture': {
    const captureUrl = args[1]
    if (!captureUrl) {
      console.error('Usage: bun scripts/scrape-template.ts capture <url> [--multi-page]')
      process.exit(1)
    }
    const multiPage = args.includes('--multi-page')
    await capture(captureUrl, multiPage)
    break
  }

  default:
    console.error(
      'Unknown command. Available commands: discover-wp, discover-wix, capture <url> [--multi-page]',
    )
    process.exit(1)
}
