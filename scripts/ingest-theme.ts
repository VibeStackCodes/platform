#!/usr/bin/env bun
/**
 * Theme Ingestion CLI — crawl a website and extract design tokens
 *
 * Usage: bun scripts/ingest-theme.ts --url <URL> [--name <name>] [--screenshots] [--dry-run]
 *
 * Pipeline:
 *   1. Parse CLI args
 *   2. Scrape with Firecrawl (falls back to raw fetch if no API key)
 *   3. Extract CSS tokens (fonts, colors, border-radius, spacing) via regex
 *   4. Analyze with Claude (single structured-output call)
 *   5. Optionally capture screenshots at 1440/768/375px via Playwright
 *   6. Write analysis.json + SKILL.md, print TypeScript snippets
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { parse as culoriParse, formatHex } from 'culori'
import { z } from 'zod'

// ============================================================================
// Types
// ============================================================================

type BorderRadius = '0' | '0.25rem' | '0.5rem' | '0.75rem' | '9999px'
type CardStyle = 'flat' | 'bordered' | 'elevated' | 'glass'
type NavStyle = 'top-bar' | 'sidebar' | 'editorial' | 'minimal' | 'centered'
type HeroLayout = 'fullbleed' | 'split' | 'centered' | 'editorial' | 'none'
type MotionLevel = 'none' | 'subtle' | 'expressive'
type ImageryStyle = 'photography-heavy' | 'illustration' | 'minimal' | 'icon-focused'
type DesignType = 'website' | 'admin' | 'hybrid'
type SpacingLevel = 'compact' | 'normal' | 'airy'

interface ThemeTokens {
  name: string
  fonts: {
    display: string
    displayKind: 'serif' | 'sans-serif' | 'monospace'
    body: string
    bodyKind: 'serif' | 'sans-serif' | 'monospace'
    googleFontsUrl: string
  }
  colors: {
    background: string
    foreground: string
    primary: string
    primaryForeground: string
    secondary: string
    accent: string
    muted: string
    border: string
  }
  style: {
    borderRadius: BorderRadius
    cardStyle: CardStyle
    navStyle: NavStyle
    heroLayout: HeroLayout
    spacing: SpacingLevel
    motion: MotionLevel
    imagery: ImageryStyle
  }
}

interface ExtractedCSS {
  fontFamilies: string[]
  colors: string[]
  borderRadius: string[]
  spacingHint: SpacingLevel
  googleFontsUrls: string[]
}

interface ScrapedPage {
  html: string
  css: string
  title: string
  description: string
  ogData: Record<string, string>
  linkedUrls: string[]
}

interface IngestAnalysis {
  themeName: string
  description: string
  designType: DesignType
  useCases: string[]
  notSuitableFor: string[]
  tokens: ThemeTokens
  sectionPatterns: string[]
  rawCss: ExtractedCSS
  sourceUrl: string
  generatedAt: string
}

// ============================================================================
// Zod schema for LLM structured output
// ============================================================================

const LLMAnalysisSchema = z.object({
  themeName: z.string().describe('Slug-style name, e.g. "canape" or "my-portfolio"'),
  description: z.string().describe('One paragraph describing the design system and best use cases'),
  designType: z.enum(['website', 'admin', 'hybrid']),
  useCases: z.array(z.string()).describe('e.g. ["restaurant-website", "cafe-website"]'),
  notSuitableFor: z.array(z.string()).describe('e.g. ["staff-management", "internal-operations"]'),
  colors: z.object({
    background: z.string().describe('Hex color, e.g. #ffffff'),
    foreground: z.string().describe('Hex color'),
    primary: z.string().describe('Hex color'),
    primaryForeground: z.string().describe('Hex color — text on primary'),
    secondary: z.string().describe('Hex color'),
    accent: z.string().describe('Hex color'),
    muted: z.string().describe('Hex color'),
    border: z.string().describe('Hex color'),
  }),
  fonts: z.object({
    display: z.string().describe('Font family name for headings, e.g. "Playfair Display"'),
    body: z.string().describe('Font family name for body text, e.g. "Inter"'),
  }),
  style: z.object({
    borderRadius: z.enum(['0', '0.25rem', '0.5rem', '0.75rem', '9999px']),
    cardStyle: z.enum(['flat', 'bordered', 'elevated', 'glass']),
    navStyle: z.enum(['top-bar', 'sidebar', 'editorial', 'minimal', 'centered']),
    heroLayout: z.enum(['fullbleed', 'split', 'centered', 'editorial', 'none']),
    spacing: z.enum(['compact', 'normal', 'airy']),
    motion: z.enum(['none', 'subtle', 'expressive']),
    imagery: z.enum(['photography-heavy', 'illustration', 'minimal', 'icon-focused']),
  }),
  sectionPatterns: z.array(z.string()).describe(
    'Section types observed: hero, features, testimonials, pricing, gallery, team, cta, footer, nav, card-grid, blog-list, contact-form, reservation-form, menu-list, stats, timeline'
  ),
})

type LLMAnalysis = z.infer<typeof LLMAnalysisSchema>

// ============================================================================
// CLI arg parsing
// ============================================================================

interface CliArgs {
  url: string
  name: string
  screenshots: boolean
  dryRun: boolean
  help: boolean
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2)

  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    return { url: '', name: '', screenshots: false, dryRun: false, help: true }
  }

  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag)
    return idx !== -1 ? argv[idx + 1] : undefined
  }

  const url = get('--url') ?? ''
  if (!url) {
    console.error('[error] --url is required')
    process.exit(1)
  }

  let hostname = ''
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '').replace(/\.[^.]+$/, '').replace(/\./g, '-')
  } catch {
    console.error('[error] --url is not a valid URL')
    process.exit(1)
  }

  return {
    url,
    name: get('--name') ?? hostname,
    screenshots: argv.includes('--screenshots'),
    dryRun: argv.includes('--dry-run'),
    help: false,
  }
}

function printHelp(): void {
  console.log(`
Theme Ingestion CLI — crawl a website and extract design tokens

Usage:
  bun scripts/ingest-theme.ts --url <URL> [--name <name>] [--screenshots] [--dry-run]

Options:
  --url <URL>     Required. Homepage URL to crawl
  --name <name>   Optional. Theme slug (default: derived from hostname)
  --screenshots   Optional. Capture screenshots at 1440/768/375px widths
  --dry-run       Optional. Print analysis without writing files
  --help          Show this help message

Environment variables:
  FIRECRAWL_API_KEY   Optional. Firecrawl API key for deep crawl (falls back to raw fetch)
  ANTHROPIC_API_KEY   Required. Anthropic API key for design analysis

Examples:
  bun scripts/ingest-theme.ts --url https://canape.example.com --name canape
  bun scripts/ingest-theme.ts --url https://mysite.com --screenshots --dry-run
  `)
}

// ============================================================================
// Stage 1: Scrape
// ============================================================================

async function scrapeWithFirecrawl(url: string): Promise<ScrapedPage> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    throw new Error('No FIRECRAWL_API_KEY')
  }

  const { FirecrawlClient } = await import('@mendable/firecrawl-js')
  const client = new FirecrawlClient({ apiKey })

  console.log('[scrape] Crawling with Firecrawl (up to 10 subpages)...')
  const crawlJob = await client.crawl(url, {
    limit: 10,
    scrapeOptions: {
      formats: ['html', 'rawHtml', 'links'],
      onlyMainContent: false,
    },
  })

  if (!crawlJob.data || crawlJob.data.length === 0) {
    throw new Error('Firecrawl returned no data')
  }

  // Merge all page HTML for richer CSS extraction
  const allHtml = crawlJob.data.map(doc => doc.rawHtml ?? doc.html ?? '').join('\n')
  const firstPage = crawlJob.data[0]

  const linkedUrls: string[] = []
  for (const doc of crawlJob.data) {
    if (doc.links) linkedUrls.push(...doc.links)
  }

  const meta = firstPage.metadata ?? {}

  return {
    html: allHtml,
    css: extractCssFromHtml(allHtml),
    title: meta.title ?? meta.ogTitle ?? '',
    description: meta.description ?? meta.ogDescription ?? '',
    ogData: {
      title: meta.ogTitle ?? '',
      description: meta.ogDescription ?? '',
      siteName: (typeof meta.ogSiteName === 'string' ? meta.ogSiteName : '') ?? '',
    },
    linkedUrls: Array.from(new Set(linkedUrls)).slice(0, 50),
  }
}

async function scrapeWithFetch(url: string): Promise<ScrapedPage> {
  console.log('[scrape] Fetching homepage via raw fetch (no Firecrawl API key)...')

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VibeStack-ThemeIngester/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!resp.ok) {
    throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`)
  }

  const html = await resp.text()
  const css = extractCssFromHtml(html)

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
  const ogSiteMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)

  // Extract all linked stylesheet URLs
  const cssLinkMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)]
  const linkedCssUrls = cssLinkMatches.map(m => m[1]).filter(Boolean)

  // Fetch linked CSS files (up to 3) for richer token extraction
  let externalCss = ''
  for (const cssUrl of linkedCssUrls.slice(0, 3)) {
    try {
      const resolvedUrl = cssUrl.startsWith('http') ? cssUrl : new URL(cssUrl, url).href
      const cssResp = await fetch(resolvedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10_000),
      })
      if (cssResp.ok) {
        externalCss += '\n' + await cssResp.text()
      }
    } catch {
      // Non-fatal: skip unresolvable CSS URLs
    }
  }

  // Extract href links for linked pages
  const hrefMatches = [...html.matchAll(/href=["']([^"'#?]+)["']/gi)]
  const linkedUrls = hrefMatches
    .map(m => {
      try { return new URL(m[1], url).href } catch { return null }
    })
    .filter((u): u is string => u !== null && u.startsWith(new URL(url).origin))

  return {
    html: html + externalCss,
    css: css + externalCss,
    title: titleMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? ogDescMatch?.[1]?.trim() ?? '',
    ogData: {
      title: ogTitleMatch?.[1]?.trim() ?? '',
      description: ogDescMatch?.[1]?.trim() ?? '',
      siteName: ogSiteMatch?.[1]?.trim() ?? '',
    },
    linkedUrls: Array.from(new Set(linkedUrls)).slice(0, 20),
  }
}

function extractCssFromHtml(html: string): string {
  const styleMatches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
  return styleMatches.map(m => m[1]).join('\n')
}

async function scrape(url: string): Promise<ScrapedPage> {
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      return await scrapeWithFirecrawl(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[scrape] Firecrawl failed (${msg}), falling back to raw fetch`)
    }
  } else {
    console.warn('[scrape] FIRECRAWL_API_KEY not set — using raw fetch (single page only)')
  }
  return scrapeWithFetch(url)
}

// ============================================================================
// Stage 2: CSS extraction
// ============================================================================

function normalizeColor(raw: string): string | null {
  const trimmed = raw.trim()
  try {
    // culori can parse hex, rgb(), hsl(), oklch(), etc.
    const parsed = culoriParse(trimmed)
    if (!parsed) return null
    const hex = formatHex(parsed)
    return hex ?? null
  } catch {
    return null
  }
}

function extractFontFamilies(css: string, html: string): string[] {
  const found = new Set<string>()

  // CSS font-family declarations (inline styles and <style> blocks)
  const fontFamilyMatches = [...css.matchAll(/font-family\s*:\s*([^;{}]+)/gi)]
  for (const m of fontFamilyMatches) {
    const families = m[1].split(',').map(f => f.replace(/['"]/g, '').trim())
    for (const family of families) {
      if (family && !isSystemFont(family)) found.add(family)
    }
  }

  // @font-face src
  const fontFaceMatches = [...css.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*["']?([^"';{}]+)["']?/gi)]
  for (const m of fontFaceMatches) {
    const family = m[1].trim()
    if (family && !isSystemFont(family)) found.add(family)
  }

  // Google Fonts <link> tags in HTML
  const gfMatches = [...html.matchAll(/fonts\.googleapis\.com\/css[^"']*family=([^&"']+)/gi)]
  for (const m of gfMatches) {
    const familiesRaw = decodeURIComponent(m[1])
    const families = familiesRaw.split('|').map(f => f.split(':')[0].replace(/\+/g, ' ').trim())
    for (const family of families) {
      if (family && !isSystemFont(family)) found.add(family)
    }
  }

  // CSS custom properties referencing fonts
  const varMatches = [...css.matchAll(/--(?:font|typeface|heading|body)[^:]*:\s*["']?([^"';{}]+)["']?/gi)]
  for (const m of varMatches) {
    const family = m[1].trim().split(',')[0]?.replace(/['"]/g, '').trim()
    if (family && family.length > 1 && !isSystemFont(family)) found.add(family)
  }

  return Array.from(found).slice(0, 10)
}

function isSystemFont(font: string): boolean {
  const lower = font.toLowerCase()
  return (
    lower === 'sans-serif' ||
    lower === 'serif' ||
    lower === 'monospace' ||
    lower === 'inherit' ||
    lower === 'initial' ||
    lower.includes('system-ui') ||
    lower.includes('-apple-system') ||
    lower.includes('blinkmacsystemfont') ||
    lower.includes('segoe ui') ||
    lower.includes('helvetica neue') ||
    lower.includes('arial')
  )
}

function extractColors(css: string): string[] {
  const found = new Set<string>()

  const colorPatterns = [
    // CSS custom properties with color-related names
    /--(?:color|bg|background|foreground|primary|secondary|accent|muted|border|text|link)[^:]*:\s*([^;{}]+)/gi,
    // Direct property assignments
    /(?:background-color|color|border-color|fill|stroke)\s*:\s*([^;{}]+)/gi,
  ]

  for (const pattern of colorPatterns) {
    const matches = [...css.matchAll(pattern)]
    for (const m of matches) {
      const valueRaw = m[1].trim()
      // Match hex, rgb(), hsl(), oklch()
      const colorCandidates = valueRaw.match(
        /#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|oklch\([^)]+\)/g
      )
      if (colorCandidates) {
        for (const candidate of colorCandidates) {
          const hex = normalizeColor(candidate)
          if (hex && !isNeutralOrTransparent(hex)) found.add(hex)
        }
      }
    }
  }

  return Array.from(found).slice(0, 30)
}

function isNeutralOrTransparent(hex: string): boolean {
  // Skip pure black, white, and near-transparent colors
  const lower = hex.toLowerCase()
  if (lower === '#000000' || lower === '#000' || lower === '#ffffff' || lower === '#fff') return true
  // Very light grays (almost white)
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const brightness = (r + g + b) / 3
  return brightness > 245 || brightness < 10
}

function extractBorderRadius(css: string): string[] {
  const found: string[] = []
  const matches = [...css.matchAll(/border-radius\s*:\s*([^;{}]+)/gi)]
  for (const m of matches) {
    const val = m[1].trim().split(/\s+/)[0]
    if (val) found.push(val)
  }
  return Array.from(new Set(found)).slice(0, 10)
}

function inferSpacing(css: string): SpacingLevel {
  // Look for padding/margin declarations and infer density
  const spacingMatches = [...css.matchAll(/(?:padding|margin)\s*:\s*([^;{}]+)/gi)]
  let totalPx = 0
  let count = 0

  for (const m of spacingMatches) {
    const pxMatch = m[1].match(/(\d+)px/)
    if (pxMatch) {
      totalPx += Number.parseInt(pxMatch[1])
      count++
    }
  }

  if (count === 0) return 'normal'
  const avgPx = totalPx / count

  if (avgPx >= 40) return 'airy'
  if (avgPx <= 12) return 'compact'
  return 'normal'
}

function extractGoogleFontsUrls(html: string): string[] {
  const matches = [...html.matchAll(/https?:\/\/fonts\.googleapis\.com\/css[^"'\s]*/gi)]
  return Array.from(new Set(matches.map(m => m[0]))).slice(0, 3)
}

function extractCSSTokens(page: ScrapedPage): ExtractedCSS {
  const combined = page.css + '\n' + page.html
  return {
    fontFamilies: extractFontFamilies(page.css, page.html),
    colors: extractColors(combined),
    borderRadius: extractBorderRadius(page.css),
    spacingHint: inferSpacing(page.css),
    googleFontsUrls: extractGoogleFontsUrls(page.html),
  }
}

// ============================================================================
// Stage 3: LLM analysis (Anthropic)
// ============================================================================

function buildPrompt(url: string, page: ScrapedPage, css: ExtractedCSS): string {
  const colorList = css.colors.length > 0
    ? css.colors.slice(0, 20).join(', ')
    : 'No colors detected from CSS'

  const fontList = css.fontFamilies.length > 0
    ? css.fontFamilies.join(', ')
    : 'No custom fonts detected'

  const radiusList = css.borderRadius.length > 0
    ? css.borderRadius.slice(0, 5).join(', ')
    : 'Not detected'

  // Trim HTML to avoid exceeding token limits — send only <head>, first 3 <section>s, and meta
  const headContent = (page.html.match(/<head[^>]*>([\s\S]{0,3000})<\/head>/i)?.[1] ?? '').slice(0, 2000)
  const sectionMatches = [...page.html.matchAll(/<(?:section|div[^>]*class="[^"]*(?:hero|header|nav|feature|section)[^"]*")[^>]*>([\s\S]{0,800}?)<\/(?:section|div)>/gi)]
  const sectionSnippet = sectionMatches.slice(0, 3).map(m => m[0]).join('\n').slice(0, 2000)

  return `You are a senior design systems engineer. Analyze this website's design and produce structured theme metadata for the VibeStack platform.

## Source URL
${url}

## Page Metadata
- Title: ${page.title || '(not found)'}
- Description: ${page.description || '(not found)'}
- OG Site Name: ${page.ogData.siteName || '(not found)'}

## Extracted CSS Tokens
- Font families found: ${fontList}
- Colors found (hex): ${colorList}
- Border-radius values found: ${radiusList}
- Inferred spacing density: ${css.spacingHint}
- Google Fonts URLs: ${css.googleFontsUrls[0] ?? 'none'}

## HTML Snippet (head + key sections)
\`\`\`html
${headContent}
${sectionSnippet}
\`\`\`

## Instructions

Respond ONLY with a valid JSON object matching this exact structure — no markdown fences, no commentary:

{
  "themeName": "slug-style-name",
  "description": "One paragraph describing the design system and its best use cases (2-4 sentences)",
  "designType": "website" | "admin" | "hybrid",
  "useCases": ["use-case-slug-1", "use-case-slug-2"],
  "notSuitableFor": ["bad-use-case-1"],
  "colors": {
    "background": "#hexval",
    "foreground": "#hexval",
    "primary": "#hexval",
    "primaryForeground": "#hexval — text color on primary background",
    "secondary": "#hexval",
    "accent": "#hexval",
    "muted": "#hexval — subtle surface for cards/chips",
    "border": "#hexval"
  },
  "fonts": {
    "display": "Font Family Name for headings",
    "body": "Font Family Name for body text"
  },
  "style": {
    "borderRadius": "0" | "0.25rem" | "0.5rem" | "0.75rem" | "9999px",
    "cardStyle": "flat" | "bordered" | "elevated" | "glass",
    "navStyle": "top-bar" | "sidebar" | "editorial" | "minimal" | "centered",
    "heroLayout": "fullbleed" | "split" | "centered" | "editorial" | "none",
    "spacing": "compact" | "normal" | "airy",
    "motion": "none" | "subtle" | "expressive",
    "imagery": "photography-heavy" | "illustration" | "minimal" | "icon-focused"
  },
  "sectionPatterns": ["hero", "features", "testimonials"]
}

Rules:
- Use only hex colors (6-digit, lowercase), never rgba or hsl
- If you cannot find fonts, pick sensible defaults (e.g. "Playfair Display" for serif, "Inter" for sans-serif)
- designType: "website" = public-facing; "admin" = staff/internal; "hybrid" = both
- borderRadius: pick the nearest from the fixed set — 0 means sharp corners, 9999px means fully rounded
- sectionPatterns: list only the section types you actually observed on this site
- themeName must be a lowercase slug (letters, numbers, hyphens only)
- Infer all colors from the extracted CSS data above; fall back to what makes design sense for this site's domain`
}

async function analyzeWithLLM(
  url: string,
  page: ScrapedPage,
  css: ExtractedCSS,
  themeName: string,
): Promise<LLMAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for LLM analysis')
  }

  const anthropic = new Anthropic({ apiKey })
  const prompt = buildPrompt(url, page, css)

  console.log('[analyze] Sending to Claude claude-sonnet-4-20250514...')
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')

  // Strip any accidental markdown fences
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (parseErr) {
    throw new Error(`LLM returned non-JSON response. Raw output:\n${rawText.slice(0, 500)}`, { cause: parseErr })
  }

  // Validate with Zod — throws descriptive error on mismatch
  const validated = LLMAnalysisSchema.parse(parsed)

  // Override themeName with CLI-provided slug if it differs
  return { ...validated, themeName }
}

// ============================================================================
// Stage 4: Screenshots (optional)
// ============================================================================

interface ScreenshotResult {
  path: string
  width: number
  height: number
}

async function captureScreenshots(url: string, outputDir: string): Promise<ScreenshotResult[]> {
  const { chromium } = await import('playwright')

  const viewports: Array<{ width: number; height: number; label: string }> = [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 375, height: 812, label: 'mobile' },
  ]

  const results: ScreenshotResult[] = []
  const screenshotDir = join(outputDir, 'screenshots')
  mkdirSync(screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })

  try {
    for (const viewport of viewports) {
      console.log(`[screenshots] Capturing ${viewport.label} (${viewport.width}x${viewport.height})...`)
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } })

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(1000)

        const screenshotPath = join(screenshotDir, `${viewport.label}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: false })

        results.push({ path: screenshotPath, width: viewport.width, height: viewport.height })
        console.log(`[screenshots] Saved: ${screenshotPath}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[screenshots] Failed for ${viewport.label}: ${msg}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  return results
}

// ============================================================================
// Stage 5: Font utilities
// ============================================================================

function fontKind(family: string): 'serif' | 'sans-serif' | 'monospace' {
  const lower = family.toLowerCase()
  if (lower.includes('mono') || lower.includes('code') || lower.includes('courier')) return 'monospace'
  if (
    lower.includes('serif') ||
    /garamond|baskerville|merriweather|playfair|lora|times|georgia|caslon|bodoni|didot/.test(lower)
  )
    return 'serif'
  return 'sans-serif'
}

function buildGoogleFontsUrl(display: string, body: string, existingUrls: string[]): string {
  // Re-use existing Google Fonts URL if it already includes both families
  const existing = existingUrls[0]
  if (existing) {
    const encoded = encodeURIComponent(display).replace(/%20/g, '+')
    if (existing.includes(encoded) || existing.toLowerCase().includes(display.toLowerCase().replace(/ /g, '+'))) {
      return existing
    }
  }

  const families = Array.from(new Set([display, body]))
    .filter(f => !isSystemFont(f))
    .map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,400;0,500;0,600;0,700;1,400`)

  if (families.length === 0) {
    return 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  }

  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
}

// ============================================================================
// Stage 6: Assemble final output
// ============================================================================

function buildIngestAnalysis(
  url: string,
  themeName: string,
  llm: LLMAnalysis,
  rawCss: ExtractedCSS,
): IngestAnalysis {
  const tokens: ThemeTokens = {
    name: themeName,
    fonts: {
      display: llm.fonts.display,
      displayKind: fontKind(llm.fonts.display),
      body: llm.fonts.body,
      bodyKind: fontKind(llm.fonts.body),
      googleFontsUrl: buildGoogleFontsUrl(llm.fonts.display, llm.fonts.body, rawCss.googleFontsUrls),
    },
    colors: {
      background: llm.colors.background,
      foreground: llm.colors.foreground,
      primary: llm.colors.primary,
      primaryForeground: llm.colors.primaryForeground,
      secondary: llm.colors.secondary,
      accent: llm.colors.accent,
      muted: llm.colors.muted,
      border: llm.colors.border,
    },
    style: llm.style,
  }

  return {
    themeName,
    description: llm.description,
    designType: llm.designType,
    useCases: llm.useCases,
    notSuitableFor: llm.notSuitableFor,
    tokens,
    sectionPatterns: llm.sectionPatterns,
    rawCss,
    sourceUrl: url,
    generatedAt: new Date().toISOString(),
  }
}

// ============================================================================
// Stage 7: TypeScript snippet generation
// ============================================================================

function generateThemeTokensSnippet(analysis: IngestAnalysis): string {
  const t = analysis.tokens
  return `// Add to server/lib/agents/themed-code-engine.ts or a theme tokens file

export const ${analysis.themeName.toUpperCase().replace(/-/g, '_')}_TOKENS: ThemeTokens = {
  name: '${t.name}',
  fonts: {
    display: '${t.fonts.display}',
    displayKind: '${t.fonts.displayKind}',
    body: '${t.fonts.body}',
    bodyKind: '${t.fonts.bodyKind}',
    googleFontsUrl: '${t.fonts.googleFontsUrl}',
  },
  colors: {
    background: '${t.colors.background}',
    foreground: '${t.colors.foreground}',
    primary: '${t.colors.primary}',
    primaryForeground: '${t.colors.primaryForeground}',
    secondary: '${t.colors.secondary}',
    accent: '${t.colors.accent}',
    muted: '${t.colors.muted}',
    border: '${t.colors.border}',
  },
  style: {
    borderRadius: '${t.style.borderRadius}',
    cardStyle: '${t.style.cardStyle}',
    navStyle: '${t.style.navStyle}',
    heroLayout: '${t.style.heroLayout}',
    spacing: '${t.style.spacing}',
    motion: '${t.style.motion}',
    imagery: '${t.style.imagery}',
  },
}`
}

function generateThemeMetadataSnippet(analysis: IngestAnalysis): string {
  const useCases = JSON.stringify(analysis.useCases)
  const notSuitableFor = JSON.stringify(analysis.notSuitableFor)
  return `// Add to server/lib/agents/theme-metadata.ts THEME_CATALOG array

  {
    name: '${analysis.themeName}',
    description: '${analysis.description.replace(/'/g, "\\'")}',
    designType: '${analysis.designType}',
    useCases: ${useCases},
    baseTables: [], // TODO: add base table names after defining SchemaContract
    notSuitableFor: ${notSuitableFor},
  },`
}

function generateSkillMd(analysis: IngestAnalysis, url: string): string {
  const t = analysis.tokens
  return `---
name: theme-${analysis.themeName}
description: >
  ${analysis.description}
auth-posture: ${analysis.designType === 'admin' ? 'private' : analysis.designType === 'hybrid' ? 'hybrid' : 'public'}
requires: []
provides: [theme-visual-identity]
env-vars: []
source-url: ${url}
generated-at: ${analysis.generatedAt}
---

## Visual Identity

### Typography
- **display**: ${t.fonts.display}, ${t.fonts.displayKind}
- **body**: ${t.fonts.body}, ${t.fonts.bodyKind}
- **google-fonts-url**: ${t.fonts.googleFontsUrl}

### Color Palette
- **background**: ${t.colors.background}
- **foreground**: ${t.colors.foreground}
- **primary**: ${t.colors.primary}
- **primary-foreground**: ${t.colors.primaryForeground}
- **secondary**: ${t.colors.secondary}
- **accent**: ${t.colors.accent}
- **muted**: ${t.colors.muted}
- **border**: ${t.colors.border}

### Style
- **border-radius**: ${t.style.borderRadius}
- **card-style**: ${t.style.cardStyle}
- **nav-style**: ${t.style.navStyle}
- **hero-layout**: ${t.style.heroLayout}
- **spacing**: ${t.style.spacing}
- **motion**: ${t.style.motion}
- **imagery**: ${t.style.imagery}

### Section Patterns Observed
${analysis.sectionPatterns.map(s => `- ${s}`).join('\n')}

### Best For
${analysis.useCases.join(', ')}

### Not Suitable For
${analysis.notSuitableFor.join(', ')}
`
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs()

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const { url, name: themeName, screenshots, dryRun } = args

  console.log(`[init] Theme ingestion starting`)
  console.log(`[init] URL: ${url}`)
  console.log(`[init] Theme name: ${themeName}`)
  console.log(`[init] Mode: ${dryRun ? 'dry-run (no files written)' : 'write'}`)
  console.log(`[init] Screenshots: ${screenshots ? 'yes' : 'no'}`)
  console.log()

  // Output directory
  const ROOT = process.cwd()
  const outputDir = join(ROOT, '.firecrawl', `${themeName}-research`)

  // ---- Stage 1: Scrape ----
  let page: ScrapedPage
  try {
    page = await scrape(url)
    console.log(`[scrape] Done. HTML size: ${page.html.length} chars, title: "${page.title}"`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[scrape] Fatal: ${msg}`)
    process.exit(1)
  }

  // ---- Stage 2: CSS extraction ----
  let rawCss: ExtractedCSS
  try {
    rawCss = extractCSSTokens(page)
    console.log(`[css] Fonts: ${rawCss.fontFamilies.join(', ') || '(none)'}`)
    console.log(`[css] Colors: ${rawCss.colors.length} values extracted`)
    console.log(`[css] Border-radius values: ${rawCss.borderRadius.join(', ') || '(none)'}`)
    console.log(`[css] Spacing hint: ${rawCss.spacingHint}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[css] Extraction failed: ${msg}`)
    // Provide safe defaults so LLM analysis can still proceed
    rawCss = { fontFamilies: [], colors: [], borderRadius: [], spacingHint: 'normal', googleFontsUrls: [] }
  }

  // ---- Stage 3: LLM analysis ----
  let llmAnalysis: LLMAnalysis
  try {
    llmAnalysis = await analyzeWithLLM(url, page, rawCss, themeName)
    console.log(`[analyze] Theme: ${llmAnalysis.themeName}`)
    console.log(`[analyze] Design type: ${llmAnalysis.designType}`)
    console.log(`[analyze] Use cases: ${llmAnalysis.useCases.join(', ')}`)
    console.log(`[analyze] Section patterns: ${llmAnalysis.sectionPatterns.join(', ')}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[analyze] Fatal: ${msg}`)
    process.exit(1)
  }

  // ---- Assemble ----
  const analysis = buildIngestAnalysis(url, themeName, llmAnalysis, rawCss)

  // ---- Stage 4: Screenshots (optional) ----
  if (screenshots) {
    if (dryRun) {
      console.log('[screenshots] Skipped (dry-run mode)')
    } else {
      mkdirSync(outputDir, { recursive: true })
      try {
        const captured = await captureScreenshots(url, outputDir)
        console.log(`[screenshots] Captured ${captured.length} screenshot(s)`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[screenshots] Failed: ${msg}`)
      }
    }
  }

  // ---- Stage 5: Output ----
  const tokensSnippet = generateThemeTokensSnippet(analysis)
  const metadataSnippet = generateThemeMetadataSnippet(analysis)
  const skillMd = generateSkillMd(analysis, url)

  if (dryRun) {
    console.log('\n' + '='.repeat(80))
    console.log('DRY RUN — analysis.json (not written):')
    console.log('='.repeat(80))
    console.log(JSON.stringify(analysis, null, 2))
    console.log('\n' + '='.repeat(80))
    console.log('ThemeTokens snippet:')
    console.log('='.repeat(80))
    console.log(tokensSnippet)
    console.log('\n' + '='.repeat(80))
    console.log('Theme metadata entry:')
    console.log('='.repeat(80))
    console.log(metadataSnippet)
    console.log('\n' + '='.repeat(80))
    console.log('SKILL.md (not written):')
    console.log('='.repeat(80))
    console.log(skillMd)
    return
  }

  // Write files
  mkdirSync(outputDir, { recursive: true })

  const analysisPath = join(outputDir, 'analysis.json')
  writeFileSync(analysisPath, JSON.stringify(analysis, null, 2), 'utf8')
  console.log(`\n[output] Written: ${analysisPath}`)

  const skillPath = join(outputDir, 'SKILL.md')
  writeFileSync(skillPath, skillMd, 'utf8')
  console.log(`[output] Written: ${skillPath}`)

  // Print TypeScript snippets to stdout
  console.log('\n' + '='.repeat(80))
  console.log('ThemeTokens — paste into themed-code-engine.ts or a tokens file:')
  console.log('='.repeat(80))
  console.log(tokensSnippet)

  console.log('\n' + '='.repeat(80))
  console.log('Theme metadata entry — add to server/lib/agents/theme-metadata.ts THEME_CATALOG:')
  console.log('='.repeat(80))
  console.log(metadataSnippet)

  console.log('\n' + '='.repeat(80))
  console.log('Manual registration steps:')
  console.log('='.repeat(80))
  console.log(`
1. Review ${analysisPath}
2. Add the ThemeTokens snippet to server/lib/agents/themed-code-engine.ts
3. Add the metadata entry to server/lib/agents/theme-metadata.ts THEME_CATALOG
4. Create a base SchemaContract in server/lib/theme-schemas/${themeName}.ts
5. Register it in server/lib/theme-schemas/index.ts THEME_BASE_SCHEMAS
6. Add route generators in server/lib/theme-routes/${themeName}.ts
7. Move SKILL.md to server/lib/skills/catalog/<domain>/theme-${themeName}/SKILL.md
8. Run: bunx tsc --noEmit && bun run lint
  `)
}

main().catch(err => {
  console.error('[fatal]', err instanceof Error ? err.message : err)
  process.exit(1)
})
