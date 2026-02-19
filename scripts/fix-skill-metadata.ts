import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type WPTerm = { name?: string; slug?: string }

type WordPressThemeResponse = {
  slug?: string
  name?: string
  description?: string
  demo_uri?: string
  screenshot?: string
  taxonomies?: {
    subjects?: WPTerm[]
    styles?: WPTerm[]
  }
}

type ThemeTokens = {
  fonts: { display: string; displayKind: string; body: string; bodyKind: string; googleFontsUrl: string }
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
    borderRadius: '0' | '0.25rem' | '0.5rem' | '0.75rem' | '9999px'
    cardStyle: 'flat' | 'bordered' | 'elevated' | 'glass'
    navStyle: 'top-bar' | 'sidebar' | 'editorial' | 'minimal' | 'centered'
    heroLayout: 'fullbleed' | 'split' | 'centered' | 'editorial' | 'none'
    spacing: 'compact' | 'normal' | 'airy'
    motion: 'none' | 'subtle' | 'expressive'
    imagery: 'photography-heavy' | 'illustration' | 'minimal' | 'icon-focused'
  }
}

type ThemeJson = Record<string, unknown>

const ROOT = process.cwd()
const CATALOG_DIR = path.join(ROOT, 'server/lib/skills/catalog')
const THEME_DIR_PREFIX = 'theme-'

const PUBLIC_SUBJECTS = new Set([
  'blog',
  'portfolio',
  'magazine',
  'restaurant',
  'photography',
  'art-design',
  'art',
  'design',
])

const HYBRID_SUBJECTS = new Set([
  'business',
  'education',
  'newsletter',
  'store',
  'ecommerce',
  'e-commerce',
  'community',
  'membership',
])

const PRIVATE_HINTS = new Set([
  'dashboard',
  'saas',
  'crm',
  'internal',
  'admin',
  'project-management',
  'task-manager',
])

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        'python3',
        [
          '-c',
          'import sys,urllib.request;u=sys.argv[1];req=urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"});r=urllib.request.urlopen(req,timeout=25);sys.stdout.write(r.read().decode("utf-8"))',
          url,
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      )
      return JSON.parse(stdout) as T
    } catch {
      // retry on transient network errors
    }
  }
  return null
}

async function fetchText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        'python3',
        [
          '-c',
          'import sys,urllib.request;u=sys.argv[1];req=urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"});r=urllib.request.urlopen(req,timeout=25);sys.stdout.write(r.read().decode("utf-8",errors="ignore"))',
          url,
        ],
        { maxBuffer: 64 * 1024 * 1024 },
      )
      return stdout
    } catch {
      // retry on transient network errors
    }
  }
  return null
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function normalizeHex(color: string | undefined): string | null {
  if (!color) return null
  const raw = color.trim()
  const short = raw.match(/^#([0-9a-fA-F]{3})$/)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = raw.match(/^#([0-9a-fA-F]{6})$/)
  if (full) return `#${full[1].toLowerCase()}`
  return null
}

function isSystemFont(font: string): boolean {
  const lower = font.toLowerCase()
  return (
    lower.includes('system-ui') ||
    lower.includes('-apple-system') ||
    lower.includes('blinkmacsystemfont') ||
    lower.includes('segoe ui')
  )
}

function cleanFontFamily(font: string | undefined): string {
  if (!font) return 'Inter'
  const first = font.split(',')[0]?.trim() ?? 'Inter'
  return first.replace(/^['"]+|['"]+$/g, '') || 'Inter'
}

function fontKind(family: string): 'serif' | 'sans-serif' | 'monospace' {
  const lower = family.toLowerCase()
  if (lower.includes('mono') || lower.includes('code')) return 'monospace'
  if (lower.includes('serif') || /garamond|baskerville|merriweather|playfair|lora|times/.test(lower)) return 'serif'
  return 'sans-serif'
}

function fontVarSlug(value: string | undefined): string | null {
  if (!value) return null
  const match = value.match(/--wp--preset--font-family--([a-z0-9-]+)/)
  return match?.[1] ?? null
}

function colorVarSlug(value: string | undefined): string | null {
  if (!value) return null
  const match = value.match(/--wp--preset--color--([a-z0-9-]+)/)
  return match?.[1] ?? null
}

function readObject(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined
  return (obj as Record<string, unknown>)[key]
}

function readString(obj: unknown, key: string): string | undefined {
  const value = readObject(obj, key)
  return typeof value === 'string' ? value : undefined
}

function flattenFontFamilies(themeJson: ThemeJson): Array<{ slug?: string; fontFamily?: string }> {
  const typography = readObject(readObject(themeJson, 'settings'), 'typography')
  const families = readObject(typography, 'fontFamilies')
  if (Array.isArray(families)) return families as Array<{ slug?: string; fontFamily?: string }>
  if (families && typeof families === 'object') {
    const all: Array<{ slug?: string; fontFamily?: string }> = []
    for (const value of Object.values(families as Record<string, unknown>)) {
      if (Array.isArray(value)) all.push(...(value as Array<{ slug?: string; fontFamily?: string }>))
    }
    return all
  }
  return []
}

function flattenPalette(themeJson: ThemeJson): Array<{ slug?: string; name?: string; color?: string }> {
  const color = readObject(readObject(themeJson, 'settings'), 'color')
  const palette = readObject(color, 'palette')
  if (Array.isArray(palette)) return palette as Array<{ slug?: string; name?: string; color?: string }>
  if (palette && typeof palette === 'object') {
    const all: Array<{ slug?: string; name?: string; color?: string }> = []
    for (const value of Object.values(palette as Record<string, unknown>)) {
      if (Array.isArray(value)) all.push(...(value as Array<{ slug?: string; name?: string; color?: string }>))
    }
    return all
  }
  return []
}

const GLOBAL_WP_PALETTE_SLUGS = new Set([
  'black',
  'white',
  'cyan-bluish-gray',
  'pale-pink',
  'vivid-red',
  'luminous-vivid-orange',
  'luminous-vivid-amber',
  'light-green-cyan',
  'vivid-green-cyan',
  'pale-cyan-blue',
  'vivid-cyan-blue',
  'vivid-purple',
])

function isThemeSpecificPaletteSlug(slug: string): boolean {
  if (GLOBAL_WP_PALETTE_SLUGS.has(slug)) return false
  if (slug.startsWith('vivid-') || slug.startsWith('luminous-') || slug.startsWith('pale-')) return false
  return true
}

function computeGoogleFontsUrl(display: string, body: string): string {
  const families = Array.from(new Set([display, body].filter((f) => f && !isSystemFont(f))))
  if (families.length === 0) {
    return 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  }
  const query = families
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@0,400;0,500;0,600;0,700;1,400`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${query}&display=swap`
}

function pickByPreference(
  paletteBySlug: Map<string, string>,
  preferences: string[],
  fallback: string,
): string {
  for (const key of preferences) {
    const match = paletteBySlug.get(key)
    if (match) return match
  }
  return fallback
}

function contrastHex(background: string): string {
  const raw = background.replace('#', '')
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#111111' : '#ffffff'
}

function nearestRadius(rawRadius: string | undefined): '0' | '0.25rem' | '0.5rem' | '0.75rem' | '9999px' {
  if (!rawRadius) return '0.5rem'
  if (rawRadius.includes('9999') || rawRadius.includes('999')) return '9999px'
  if (rawRadius === '0' || rawRadius === '0px' || rawRadius === '0rem') return '0'
  const pxMatch = rawRadius.match(/([0-9.]+)px/)
  if (pxMatch) {
    const px = Number.parseFloat(pxMatch[1])
    if (px <= 2) return '0'
    if (px <= 6) return '0.25rem'
    if (px <= 10) return '0.5rem'
    if (px <= 14) return '0.75rem'
    return '9999px'
  }
  const remMatch = rawRadius.match(/([0-9.]+)rem/)
  if (remMatch) {
    const rem = Number.parseFloat(remMatch[1])
    if (rem <= 0.1) return '0'
    if (rem <= 0.35) return '0.25rem'
    if (rem <= 0.6) return '0.5rem'
    if (rem <= 0.9) return '0.75rem'
    return '9999px'
  }
  return '0.5rem'
}

function taxonomySlugs(terms: WPTerm[] | undefined): string[] {
  if (!terms) return []
  return terms
    .map((term) => term.slug ?? (term.name ? slugify(term.name) : ''))
    .filter(Boolean)
}

function taxonomyNames(terms: WPTerm[] | undefined): string[] {
  if (!terms) return []
  return terms.map((term) => term.name).filter((name): name is string => Boolean(name))
}

function deriveAuthPosture(subjects: string[]): 'public' | 'private' | 'hybrid' {
  if (subjects.some((subject) => PRIVATE_HINTS.has(subject))) return 'private'
  const hasHybrid = subjects.some((subject) => HYBRID_SUBJECTS.has(subject))
  const hasPublic = subjects.some((subject) => PUBLIC_SUBJECTS.has(subject))
  if (hasHybrid) return 'hybrid'
  if (hasPublic) return 'public'
  return 'hybrid'
}

function deriveStyleTokens(subjects: string[], styles: string[]): ThemeTokens['style'] {
  const has = (...values: string[]) => values.some((value) => subjects.includes(value) || styles.includes(value))

  const navStyle: ThemeTokens['style']['navStyle'] = has('magazine', 'editorial', 'blog')
    ? 'editorial'
    : has('business', 'dashboard', 'saas')
      ? 'sidebar'
      : has('minimal', 'clean')
        ? 'minimal'
        : has('portfolio', 'photography', 'art-design', 'art')
          ? 'centered'
          : 'top-bar'

  const heroLayout: ThemeTokens['style']['heroLayout'] = has('magazine', 'editorial')
    ? 'editorial'
    : has('photography', 'portfolio', 'restaurant', 'travel', 'fashion')
      ? 'fullbleed'
      : has('business', 'store', 'ecommerce', 'e-commerce')
        ? 'split'
        : has('minimal', 'clean')
          ? 'centered'
          : 'centered'

  const cardStyle: ThemeTokens['style']['cardStyle'] = has('modern', 'sleek')
    ? 'glass'
    : has('minimal', 'clean')
      ? 'flat'
      : has('editorial', 'magazine', 'business')
        ? 'bordered'
        : 'elevated'

  const spacing: ThemeTokens['style']['spacing'] = has('airy', 'elegant', 'photography', 'portfolio', 'luxury')
    ? 'airy'
    : has('compact', 'newsletter', 'business')
      ? 'compact'
      : 'normal'

  const motion: ThemeTokens['style']['motion'] = has('playful', 'creative', 'fashion', 'music', 'art')
    ? 'expressive'
    : has('minimal', 'clean', 'business')
      ? 'subtle'
      : 'subtle'

  const imagery: ThemeTokens['style']['imagery'] = has('photography', 'restaurant', 'travel', 'fashion')
    ? 'photography-heavy'
    : has('illustration', 'kids', 'comic')
      ? 'illustration'
      : has('business', 'dashboard', 'saas')
        ? 'icon-focused'
        : 'minimal'

  return {
    borderRadius: '0.5rem',
    cardStyle,
    navStyle,
    heroLayout,
    spacing,
    motion,
    imagery,
  }
}

function deriveDescription(themeName: string, subjects: string[], styles: string[], keywords: string[]): string {
  const subjectLine = subjects.length > 0 ? subjects.join(', ') : 'modern digital products'
  const styleLine = styles.length > 0 ? styles.join(', ') : 'clean, contemporary styling'
  const kw = Array.from(new Set(keywords)).slice(0, 12).join(', ')

  return [
    `${themeName} is a ${styleLine.toLowerCase()} visual system shaped for ${subjectLine.toLowerCase()}.`,
    `It leans on expressive typography, focused hierarchy, and a polished tone that helps content feel intentional and premium.`,
    `Best for launching branded experiences where mood, readability, and conversion-ready structure need to work together.`,
    `Use when app mentions: ${kw}`,
  ].join('\n  ')
}

function extractDemoSignals(demoHtml: string | null): string[] {
  if (!demoHtml) return []
  const titleMatch = demoHtml.match(/<title[^>]*>([^<]+)<\/title>/i)
  const ogMatch = demoHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
  const text = `${titleMatch?.[1] ?? ''} ${ogMatch?.[1] ?? ''}`
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase()
  const signals: string[] = []
  const add = (needle: string, label: string) => {
    if (text.includes(needle)) signals.push(label)
  }
  add('restaurant', 'hospitality')
  add('menu', 'food-forward')
  add('portfolio', 'portfolio')
  add('photography', 'photography-led')
  add('shop', 'commerce')
  add('store', 'retail')
  add('editorial', 'editorial')
  add('magazine', 'publishing')
  add('studio', 'creative studio')
  add('agency', 'agency')
  add('minimal', 'minimal')
  add('modern', 'modern')
  add('elegant', 'elegant')
  return Array.from(new Set(signals))
}

function parseExistingColors(markdown: string): Partial<ThemeTokens['colors']> {
  const read = (key: string): string | null => {
    const match = markdown.match(new RegExp(`- \\*\\*${key}\\*\\*:\\s*(#[0-9a-fA-F]{3,6})`, 'i'))
    return normalizeHex(match?.[1])
  }
  const background = read('background')
  const foreground = read('foreground')
  const primary = read('primary')
  const secondary = read('secondary')
  const accent = read('accent')
  const muted = read('muted')
  const border = read('border')
  const primaryForeground = read('primary-foreground')
  return {
    ...(background ? { background } : {}),
    ...(foreground ? { foreground } : {}),
    ...(primary ? { primary } : {}),
    ...(primaryForeground ? { primaryForeground } : {}),
    ...(secondary ? { secondary } : {}),
    ...(accent ? { accent } : {}),
    ...(muted ? { muted } : {}),
    ...(border ? { border } : {}),
  }
}

function fallbackPaletteByDomain(subjects: string[], styles: string[]): ThemeTokens['colors'] {
  const has = (...values: string[]) => values.some((value) => subjects.includes(value) || styles.includes(value))

  if (has('restaurant', 'food', 'cafe', 'menu', 'recipe')) {
    return {
      background: '#fff8f1',
      foreground: '#2b1b12',
      primary: '#9a3412',
      primaryForeground: '#fff8f1',
      secondary: '#f4c98b',
      accent: '#d97706',
      muted: '#fdebd4',
      border: '#edc7a3',
    }
  }

  if (has('portfolio', 'photography', 'art-design', 'art', 'design')) {
    return {
      background: '#fcfbff',
      foreground: '#1f1830',
      primary: '#5b21b6',
      primaryForeground: '#ffffff',
      secondary: '#ddd6fe',
      accent: '#c084fc',
      muted: '#f3f0ff',
      border: '#d9d2f3',
    }
  }

  if (has('store', 'ecommerce', 'e-commerce', 'commerce', 'shop')) {
    return {
      background: '#f8fafc',
      foreground: '#0f172a',
      primary: '#1d4ed8',
      primaryForeground: '#ffffff',
      secondary: '#dbeafe',
      accent: '#0ea5e9',
      muted: '#eff6ff',
      border: '#bfdbfe',
    }
  }

  if (has('blog', 'magazine', 'editorial')) {
    return {
      background: '#fffefc',
      foreground: '#1f1b16',
      primary: '#7c2d12',
      primaryForeground: '#fff7ed',
      secondary: '#f5e6d3',
      accent: '#b45309',
      muted: '#f9efe2',
      border: '#ead9c4',
    }
  }

  if (has('business', 'saas', 'dashboard', 'education', 'newsletter')) {
    return {
      background: '#f8fafc',
      foreground: '#0f172a',
      primary: '#2563eb',
      primaryForeground: '#ffffff',
      secondary: '#dbeafe',
      accent: '#06b6d4',
      muted: '#eff6ff',
      border: '#cbd5e1',
    }
  }

  return {
    background: '#ffffff',
    foreground: '#111111',
    primary: '#2b6cb0',
    primaryForeground: '#ffffff',
    secondary: '#e5e7eb',
    accent: '#f59e0b',
    muted: '#f3f4f6',
    border: '#d1d5db',
  }
}

function preferDomainColor(existing: string | undefined, domainColor: string, genericColor: string): string {
  if (!existing) return domainColor
  if (existing.toLowerCase() === genericColor.toLowerCase()) return domainColor
  return existing
}

function extractThemeTokens(themeJson: ThemeJson | null, existingMarkdown: string, subjects: string[], styles: string[]): ThemeTokens {
  const style = deriveStyleTokens(subjects, styles)

  if (!themeJson) {
    const fallbackColors = parseExistingColors(existingMarkdown)
    const domainPalette = fallbackPaletteByDomain(subjects, styles)
    const display = 'Playfair Display'
    const body = 'Inter'
    return {
      fonts: {
        display,
        displayKind: fontKind(display),
        body,
        bodyKind: fontKind(body),
        googleFontsUrl: computeGoogleFontsUrl(display, body),
      },
      colors: {
        background: preferDomainColor(fallbackColors.background, domainPalette.background, '#ffffff'),
        foreground: preferDomainColor(fallbackColors.foreground, domainPalette.foreground, '#111111'),
        primary: preferDomainColor(fallbackColors.primary, domainPalette.primary, '#2b6cb0'),
        primaryForeground: preferDomainColor(fallbackColors.primaryForeground, domainPalette.primaryForeground, '#ffffff'),
        secondary: preferDomainColor(fallbackColors.secondary, domainPalette.secondary, '#e5e7eb'),
        accent: preferDomainColor(fallbackColors.accent, domainPalette.accent, '#f59e0b'),
        muted: preferDomainColor(fallbackColors.muted, domainPalette.muted, '#f3f4f6'),
        border: preferDomainColor(fallbackColors.border, domainPalette.border, '#d1d5db'),
      },
      style,
    }
  }

  const families = flattenFontFamilies(themeJson)
  const fontBySlug = new Map<string, string>()
  const familyOrder: string[] = []

  for (const family of families) {
    const slug = typeof family.slug === 'string' ? family.slug : ''
    const font = cleanFontFamily(typeof family.fontFamily === 'string' ? family.fontFamily : undefined)
    if (!slug || !font || isSystemFont(font)) continue
    fontBySlug.set(slug, font)
    if (!familyOrder.includes(font)) familyOrder.push(font)
  }

  const stylesNode = readObject(themeJson, 'styles')
  const globalTypography = readObject(stylesNode, 'typography')
  const elementTypography = readObject(readObject(stylesNode, 'elements'), 'heading')
  const headingTypography = readObject(elementTypography, 'typography')

  const bodyVar = fontVarSlug(readString(globalTypography, 'fontFamily'))
  const displayVar = fontVarSlug(readString(headingTypography, 'fontFamily'))

  const body =
    (bodyVar ? fontBySlug.get(bodyVar) : undefined) ??
    familyOrder.find((family) => fontKind(family) === 'sans-serif') ??
    familyOrder[0] ??
    'Inter'

  const display =
    (displayVar ? fontBySlug.get(displayVar) : undefined) ??
    familyOrder.find((family) => fontKind(family) === 'serif') ??
    familyOrder.find((family) => family !== body) ??
    body

  const palette = flattenPalette(themeJson)
  const paletteBySlug = new Map<string, string>()
  const themePaletteBySlug = new Map<string, string>()

  for (const swatch of palette) {
    const key = swatch.slug ?? (swatch.name ? slugify(swatch.name) : undefined)
    const color = normalizeHex(swatch.color)
    if (!key || !color) continue
    paletteBySlug.set(key, color)
    if (isThemeSpecificPaletteSlug(key)) {
      themePaletteBySlug.set(key, color)
    }
  }

  const paletteSource = themePaletteBySlug.size >= 2 ? themePaletteBySlug : paletteBySlug

  const stylesColor = readObject(stylesNode, 'color')
  const buttonColor = readObject(readObject(readObject(stylesNode, 'elements'), 'button'), 'color')

  const backgroundVar = colorVarSlug(readString(stylesColor, 'background'))
  const foregroundVar = colorVarSlug(readString(stylesColor, 'text'))
  const primaryVar = colorVarSlug(readString(buttonColor, 'background'))
  const primaryFgVar = colorVarSlug(readString(buttonColor, 'text'))

  const background =
    normalizeHex(readString(stylesColor, 'background')) ??
    (backgroundVar ? (paletteSource.get(backgroundVar) ?? paletteBySlug.get(backgroundVar)) : undefined) ??
    pickByPreference(paletteSource, ['background', 'base', 'theme-1', 'theme-2', 'light', 'white'], '#ffffff')

  const foreground =
    normalizeHex(readString(stylesColor, 'text')) ??
    (foregroundVar ? (paletteSource.get(foregroundVar) ?? paletteBySlug.get(foregroundVar)) : undefined) ??
    pickByPreference(paletteSource, ['foreground', 'contrast', 'base-contrast', 'text', 'theme-4', 'dark', 'black'], '#111111')

  const primary =
    normalizeHex(readString(buttonColor, 'background')) ??
    (primaryVar ? (paletteSource.get(primaryVar) ?? paletteBySlug.get(primaryVar)) : undefined) ??
    pickByPreference(paletteSource, ['primary', 'theme-1', 'theme-2', 'accent', 'secondary', 'tertiary'], '#2b6cb0')

  const secondary = pickByPreference(
    paletteSource,
    ['secondary', 'theme-3', 'tertiary', 'accent-2', 'contrast-2', 'base-2'],
    '#e5e7eb',
  )

  const accent = pickByPreference(
    paletteSource,
    ['accent', 'highlight', 'theme-4', 'tertiary', 'primary'],
    secondary,
  )

  const muted = pickByPreference(
    paletteSource,
    ['muted', 'subtle', 'neutral', 'theme-5', 'gray', 'light'],
    '#f3f4f6',
  )

  const border = pickByPreference(
    paletteSource,
    ['border', 'contrast', 'base-contrast', 'neutral', 'gray'],
    '#d1d5db',
  )

  const primaryForeground =
    normalizeHex(readString(buttonColor, 'text')) ??
    (primaryFgVar ? (paletteSource.get(primaryFgVar) ?? paletteBySlug.get(primaryFgVar)) : undefined) ??
    contrastHex(primary)

  const radius = nearestRadius(readString(readObject(readObject(readObject(stylesNode, 'elements'), 'button'), 'border'), 'radius'))

  return {
    fonts: {
      display,
      displayKind: fontKind(display),
      body,
      bodyKind: fontKind(body),
      googleFontsUrl: computeGoogleFontsUrl(display, body),
    },
    colors: {
      background,
      foreground,
      primary,
      primaryForeground,
      secondary,
      accent,
      muted,
      border,
    },
    style: {
      ...style,
      borderRadius: radius,
    },
  }
}

function toTitle(input: string): string {
  return input
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function bestForLine(subjectNames: string[], styleNames: string[]): string {
  const base = new Set<string>([
    ...subjectNames,
    ...styleNames,
  ])

  const mappings: Array<[string, string[]]> = [
    ['Business sites', ['Business']],
    ['E-commerce storefronts', ['Store']],
    ['Editorial publications', ['Magazine', 'Blog']],
    ['Portfolio showcases', ['Portfolio', 'Photography']],
    ['Restaurant websites', ['Restaurant']],
    ['Creative studios', ['Art & Design', 'Design']],
    ['Membership hubs', ['Newsletter', 'Community']],
  ]

  for (const [label, needs] of mappings) {
    if (needs.some((value) => base.has(value))) base.add(label)
  }

  if (base.size === 0) {
    base.add('Marketing websites')
    base.add('Product landing pages')
    base.add('Content-rich business apps')
  }

  return Array.from(base).slice(0, 10).join(', ')
}

function extractExistingDescription(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?description:\s*>\n([\s\S]*?)\n(?:[a-z-]+:|\.\.\.|---)/m)
  if (!match) return ''
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .join(' ')
}

function inferSubjectAndStyleFallback(slug: string, markdown: string): { subjectNames: string[]; styleNames: string[] } {
  const lower = `${slug} ${extractExistingDescription(markdown)}`.toLowerCase()
  const contains = (...needles: string[]) => needles.some((needle) => lower.includes(needle))

  const subjectNames: string[] = []
  if (contains('restaurant', 'food', 'cafe', 'menu', 'recipe')) subjectNames.push('Restaurant')
  if (contains('store', 'shop', 'commerce', 'ecommerce', 'product')) subjectNames.push('Store')
  if (contains('portfolio', 'photography', 'gallery', 'artist')) subjectNames.push('Portfolio')
  if (contains('blog', 'magazine', 'editorial', 'news')) subjectNames.push('Blog')
  if (contains('business', 'startup', 'agency', 'consult')) subjectNames.push('Business')
  if (contains('newsletter', 'email')) subjectNames.push('Newsletter')
  if (contains('education', 'course', 'academy')) subjectNames.push('Education')
  if (subjectNames.length === 0) subjectNames.push('Business')

  const styleNames: string[] = []
  if (contains('minimal', 'clean')) styleNames.push('Clean')
  if (contains('modern', 'sleek')) styleNames.push('Modern')
  if (contains('editorial', 'magazine')) styleNames.push('Editorial')
  if (contains('bold', 'art', 'creative')) styleNames.push('Bold')
  if (styleNames.length === 0) styleNames.push('Modern')

  return { subjectNames, styleNames }
}

async function run(): Promise<void> {
  const entries = await fs.readdir(CATALOG_DIR, { withFileTypes: true })
  const themeDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(THEME_DIR_PREFIX))
  const slugs = themeDirs.map((entry) => entry.name.slice(THEME_DIR_PREFIX.length)).sort()

  const githubTree = await fetchJson<{ tree?: Array<{ path?: string }> }>(
    'https://api.github.com/repos/Automattic/themes/git/trees/trunk?recursive=1',
  )

  const availableThemeJsonSlugs = new Set(
    (githubTree?.tree ?? [])
      .map((item) => item.path)
      .filter((pathValue): pathValue is string => Boolean(pathValue?.endsWith('/theme.json')))
      .map((pathValue) => pathValue.replace(/\/theme\.json$/, '')),
  )

  let updated = 0
  let githubBacked = 0
  let fallbackOnly = 0
  let wpBacked = 0

  for (const slug of slugs) {
    const skillPath = path.join(CATALOG_DIR, `${THEME_DIR_PREFIX}${slug}`, 'SKILL.md')
    const existing = await fs.readFile(skillPath, 'utf8')

    const wp = await fetchJson<WordPressThemeResponse>(`https://public-api.wordpress.com/rest/v1.1/themes/${slug}`)
    if (wp) wpBacked += 1

    const themeJson = availableThemeJsonSlugs.has(slug)
      ? await fetchJson<ThemeJson>(`https://raw.githubusercontent.com/Automattic/themes/trunk/${slug}/theme.json`)
      : null

    if (themeJson) githubBacked += 1
    else fallbackOnly += 1

    const fallbackTaxonomy = inferSubjectAndStyleFallback(slug, existing)
    const subjectSlugs = wp ? taxonomySlugs(wp.taxonomies?.subjects) : fallbackTaxonomy.subjectNames.map(slugify)
    const styleSlugs = wp ? taxonomySlugs(wp.taxonomies?.styles) : fallbackTaxonomy.styleNames.map(slugify)
    const subjectNames = wp ? taxonomyNames(wp.taxonomies?.subjects) : fallbackTaxonomy.subjectNames
    const styleNames = wp ? taxonomyNames(wp.taxonomies?.styles) : fallbackTaxonomy.styleNames

    const authPosture = deriveAuthPosture(subjectSlugs)
    const tokens = extractThemeTokens(themeJson, existing, subjectSlugs, styleSlugs)

    const themeName = wp?.name?.trim() || toTitle(slug)
    const demoSignals = extractDemoSignals(await fetchText(wp?.demo_uri ?? ''))
    const keywordPool = [slug, ...subjectSlugs, ...styleSlugs, ...(wp?.description?.toLowerCase().split(/[^a-z0-9]+/g) ?? [])]
      .filter((item) => item && item.length > 2)

    const description = deriveDescription(themeName, subjectNames, [...styleNames, ...demoSignals], keywordPool)

    const markdown = `---
name: theme-${slug}
description: >
  ${description}
auth-posture: ${authPosture}
requires: []
provides: [theme-visual-identity]
env-vars: []
---

## Visual Identity

### Typography
- **display**: ${tokens.fonts.display}, ${tokens.fonts.displayKind}
- **body**: ${tokens.fonts.body}, ${tokens.fonts.bodyKind}
- **google-fonts-url**: ${tokens.fonts.googleFontsUrl}

### Color Palette
- **background**: ${tokens.colors.background}
- **foreground**: ${tokens.colors.foreground}
- **primary**: ${tokens.colors.primary}
- **primary-foreground**: ${tokens.colors.primaryForeground}
- **secondary**: ${tokens.colors.secondary}
- **accent**: ${tokens.colors.accent}
- **muted**: ${tokens.colors.muted}
- **border**: ${tokens.colors.border}

### Style
- **border-radius**: ${tokens.style.borderRadius}
- **card-style**: ${tokens.style.cardStyle}
- **nav-style**: ${tokens.style.navStyle}
- **hero-layout**: ${tokens.style.heroLayout}
- **spacing**: ${tokens.style.spacing}
- **motion**: ${tokens.style.motion}
- **imagery**: ${tokens.style.imagery}

### Best For
${bestForLine(subjectNames, styleNames)}
`

    await fs.writeFile(skillPath, markdown, 'utf8')
    updated += 1

    if (updated % 25 === 0) {
      console.log(`[progress] Updated ${updated}/${slugs.length}`)
    }
  }

  console.log(`\nDone. Updated ${updated} theme skills.`)
  console.log(`- With WordPress API metadata: ${wpBacked}`)
  console.log(`- With GitHub theme.json: ${githubBacked}`)
  console.log(`- Fallback mode (no theme.json): ${fallbackOnly}`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
