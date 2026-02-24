/**
 * Deterministic Assembly Module
 *
 * Produces all non-LLM files for a generated app from a CreativeSpec and DesignSystem:
 *   - src/routes/__root.tsx  (root layout: nav + footer)
 *   - src/routeTree.gen.ts   (route tree from sitemap)
 *   - src/index.css          (Tailwind v4 @theme from DesignSystem colors + fonts)
 *   - src/main.tsx           (app entry — static router, no QueryClient)
 *   - vite.config.ts         (Vite + Tailwind + React config)
 *   - src/routes/*.tsx       (generated page files passed in from LLM)
 *
 * Everything here is purely deterministic — zero LLM calls.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BlueprintFile } from './app-blueprint'
import type { CreativeSpec } from './agents/schemas'
import type { DesignSystem } from './themed-code-engine'

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export interface GeneratedPage {
  fileName: string
  componentName: string
  content: string
  route: string
}

export interface AssemblyInput {
  spec: CreativeSpec
  generatedPages: GeneratedPage[]
  appName: string
  tokens: DesignSystem
  /** When true, include the shadcn/ui-kit component files in the assembled output */
  includeUiKit?: boolean
}

// ---------------------------------------------------------------------------
// Social icon mapping — platform name → Lucide icon component name
// ---------------------------------------------------------------------------

const SOCIAL_ICON_MAP: Record<string, string> = {
  github: 'Github',
  twitter: 'Twitter',
  x: 'Twitter',
  linkedin: 'Linkedin',
  instagram: 'Instagram',
  youtube: 'Youtube',
  facebook: 'Facebook',
  tiktok: 'Music2',
  discord: 'MessageCircle',
  twitch: 'Tv',
  mastodon: 'Globe',
  bluesky: 'Globe',
  website: 'Globe',
  globe: 'Globe',
  link: 'Link',
  email: 'Mail',
  mail: 'Mail',
}

function socialPlatformToIcon(platform: string): string {
  const key = platform.toLowerCase().replace(/[^a-z0-9]/g, '')
  return SOCIAL_ICON_MAP[key] ?? 'Globe'
}

// ---------------------------------------------------------------------------
// Route tree helpers
// ---------------------------------------------------------------------------

/**
 * Derive a unique variable name prefix from a fileName for the route tree.
 * Uses fileName (deterministic) instead of componentName (LLM-provided, often empty).
 *
 * "routes/index.tsx"                         → "Index"
 * "routes/recipes/index.tsx"                 → "RecipesIndex"
 * "routes/recipes/$slug.tsx"                 → "RecipesSlug"
 * "routes/_authenticated/route.tsx"          → "AuthenticatedRoute"
 * "routes/_authenticated/kitchen/recipes/new.tsx" → "AuthenticatedKitchenRecipesNew"
 */
function fileNameToRouteVar(fileName: string): string {
  return fileName
    .replace(/^(src\/)?routes\//, '')   // strip routes/ prefix
    .replace(/\.tsx$/, '')              // strip extension
    .split('/')                         // split path segments
    .map((seg) => {
      // $slug → Slug, _authenticated → Authenticated, index → Index
      const clean = seg.replace(/^[$_]/, '')
      // Convert hyphens and other non-alphanumeric chars to camelCase
      // "market-outlook-2026" → "MarketOutlook2026"
      return clean
        .split(/[-_.]+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
    })
    .join('')
}

/**
 * Convert a sitemap entry's fileName to the import path used by the route tree.
 * Uses the fileName from the CreativeSpec directly (which the Creative Director
 * already generates correctly) instead of deriving from the route path.
 *
 * routes/index.tsx              → ./routes/index
 * routes/about.tsx              → ./routes/about
 * routes/recipes/index.tsx      → ./routes/recipes/index
 * routes/recipes/$slug.tsx      → ./routes/recipes/$slug
 */
function fileNameToImportPath(fileName: string): string {
  // Strip the leading "routes/" prefix if present (some LLMs include it, some don't)
  const normalized = fileName.replace(/^(src\/)?/, '')
  // Remove .tsx extension
  return `./${normalized.replace(/\.tsx$/, '')}`
}

/**
 * Derive the TanStack Router route id from a sitemap route path.
 * The id is the path itself.
 */
function routeToId(route: string): string {
  return route
}

// ---------------------------------------------------------------------------
// File generators
// ---------------------------------------------------------------------------

/**
 * Generate src/routeTree.gen.ts from the sitemap.
 */
function generateRouteTree(spec: CreativeSpec): string {
  const { sitemap } = spec

  const importLines: string[] = ['import { Route as rootRoute } from "./routes/__root"']
  const constLines: string[] = []
  const childrenList: string[] = []
  const seenVars = new Set<string>()

  for (const page of sitemap) {
    let varBase = fileNameToRouteVar(page.fileName)
    // Deduplicate: if varBase already seen, append a numeric suffix
    if (seenVars.has(varBase)) {
      let i = 2
      while (seenVars.has(`${varBase}${i}`)) i++
      varBase = `${varBase}${i}`
    }
    seenVars.add(varBase)

    const importVar = `${varBase}Import`
    const routeVar = `${varBase}Route`
    const importPath = fileNameToImportPath(page.fileName)
    const routeId = routeToId(page.route)

    importLines.push(`import { Route as ${importVar} } from '${importPath}'`)

    constLines.push(
      `const ${routeVar} = ${importVar}.update({` +
        ` id: '${routeId}',` +
        ` path: '${page.route}',` +
        ` getParentRoute: () => rootRoute,` +
        ` } as any)`,
    )

    childrenList.push(`  ${routeVar}`)
  }

  return [
    '/* eslint-disable */',
    '// @ts-nocheck',
    '// Auto-generated by VibeStack — do not edit manually',
    '',
    ...importLines,
    '',
    ...constLines,
    '',
    'export const routeTree = rootRoute.addChildren([',
    childrenList.join(',\n'),
    '])',
  ].join('\n')
}

/**
 * Generate src/index.css — Tailwind v4 @theme block with palette from DesignSystem.
 */
/**
 * Compute missing palette values from the ones we have.
 * LLMs often leave primaryForeground, muted, and border empty.
 */
function fillPaletteGaps(palette: Record<string, string>) {
  const bg = palette.background || '#ffffff'
  const fg = palette.foreground || '#111111'
  return {
    background: bg,
    foreground: fg,
    primary: palette.primary || '#2563eb',
    primaryForeground: palette.primaryForeground || '#ffffff',
    accent: palette.accent || palette.primary || '#f59e0b',
    muted: palette.muted || (isLightColor(bg) ? '#f1f5f9' : '#1e293b'),
    mutedForeground: palette.mutedForeground || '#6b7280',
    border: palette.border || (isLightColor(bg) ? '#e2e8f0' : '#334155'),
    card: palette.card || bg,
    destructive: palette.destructive || '#ef4444',
  }
}

/** Quick heuristic: is a hex color "light"? */
function isLightColor(hex: string): boolean {
  const clean = hex.replace('#', '')
  if (clean.length < 6) return true // fallback
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

function generateIndexCSS(tokens: DesignSystem): string {
  const palette = fillPaletteGaps({
    background: tokens.colors.background,
    foreground: tokens.colors.foreground,
    primary: tokens.colors.primary,
    primaryForeground: tokens.colors.primaryForeground,
    accent: tokens.colors.accent,
    muted: tokens.colors.muted,
    mutedForeground: (tokens.colors as Record<string, string>).mutedForeground ?? '#6b7280',
    border: tokens.colors.border,
    card: tokens.colors.background, // card defaults to bg
    destructive: '#ef4444',
  })

  const lines: string[] = []

  if (tokens.fonts.googleFontsUrl?.trim()) {
    lines.push(`@import url('${tokens.fonts.googleFontsUrl}');`)
    lines.push('')
  }

  lines.push(
    '@import "tailwindcss";',
    '@import "tw-animate-css";',
    '',
    '@custom-variant dark (&:is(.dark *));',
    '',
    '@theme inline {',
    `  --color-background: ${palette.background};`,
    `  --color-foreground: ${palette.foreground};`,
    `  --color-primary: ${palette.primary};`,
    `  --color-primary-foreground: ${palette.primaryForeground};`,
    `  --color-accent: ${palette.accent};`,
    `  --color-muted: ${palette.muted};`,
    `  --color-muted-foreground: ${palette.mutedForeground};`,
    `  --color-border: ${palette.border};`,
    `  --color-card: ${palette.card};`,
    `  --color-destructive: ${palette.destructive};`,
    `  --radius: ${tokens.style.borderRadius || '0.75rem'};`,
    `  --font-display: "${tokens.fonts.display}", ui-serif, serif;`,
    `  --font-body: "${tokens.fonts.body}", ui-sans-serif, system-ui, sans-serif;`,
    '}',
    '',
    '@layer base {',
    '  * { @apply border-border; }',
    '  body { @apply bg-background text-foreground; }',
    '}',
  )

  return lines.join('\n')
}

/**
 * Generate src/main.tsx — static router entry, no QueryClient or QueryClientProvider.
 */
function generateMainTSX(): string {
  return [
    "// Auto-generated by VibeStack — do not edit manually",
    "import './index.css'",
    "import { StrictMode } from 'react'",
    "import { createRoot } from 'react-dom/client'",
    "import { RouterProvider, createRouter } from '@tanstack/react-router'",
    "import { routeTree } from './routeTree.gen'",
    '',
    'const router = createRouter({',
    '  routeTree,',
    "  defaultPreload: 'intent',",
    '  scrollRestoration: true,',
    '})',
    '',
    "declare module '@tanstack/react-router' {",
    '  interface Register {',
    '    router: typeof router',
    '  }',
    '}',
    '',
    "createRoot(document.getElementById('root')!).render(",
    '  <StrictMode>',
    '    <RouterProvider router={router} />',
    '  </StrictMode>,',
    ')',
  ].join('\n')
}

/**
 * Generate vite.config.ts.
 */
function generateViteConfig(): string {
  return [
    "// Auto-generated by VibeStack — do not edit manually",
    "import tailwindcss from '@tailwindcss/vite'",
    "import react from '@vitejs/plugin-react'",
    "import { componentTagger } from 'lovable-tagger'",
    "import { resolve } from 'node:path'",
    "import { defineConfig } from 'vite'",
    '',
    'export default defineConfig({',
    '  plugins: [react(), tailwindcss(), componentTagger({ jsxSource: true })],',
    '  resolve: {',
    "    alias: { '@': resolve(__dirname, './src') },",
    '  },',
    "  cacheDir: '/tmp/.vite',",
    '})',
  ].join('\n')
}

/**
 * Build the Navigation component source (inlined in __root.tsx).
 */
/**
 * Filter links to only include those whose href is external, a hash anchor,
 * or matches a known route in the sitemap. Prevents broken internal links.
 */
function filterValidLinks<T extends { href: string }>(links: T[], validRoutes: Set<string>): T[] {
  return links.filter((link) => {
    const h = link.href
    if (h.startsWith('http://') || h.startsWith('https://') || h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:')) return true
    if (h.includes('#')) return true // e.g. "/#features"
    const normalised = h.endsWith('/') && h.length > 1 ? h.slice(0, -1) : h
    return validRoutes.has(normalised)
  })
}

function buildNavigation(spec: CreativeSpec): string {
  const { nav } = spec
  const validRoutes = new Set(spec.sitemap.map(p => p.route))

  // Build nav link JSX lines — filtered to valid routes only
  const navLinks = filterValidLinks(nav.links, validRoutes)
    .map(
      (link) =>
        `        <Link\n          to="${link.href}"\n          aria-current={router.state.location.pathname === '${link.href}' ? 'page' : undefined}\n          className="text-sm font-medium transition-colors hover:text-primary aria-[current=page]:text-primary"\n        >\n          ${link.label}\n        </Link>`,
    )
    .join('\n')

  const mobileLinks = filterValidLinks(nav.links, validRoutes)
    .map(
      (link) =>
        `          <Link\n            to="${link.href}"\n            onClick={() => setMobileOpen(false)}\n            aria-current={router.state.location.pathname === '${link.href}' ? 'page' : undefined}\n            className="block py-2 text-base font-medium transition-colors hover:text-primary aria-[current=page]:text-primary"\n          >\n            ${link.label}\n          </Link>`,
    )
    .join('\n')

  const ctaValid = nav.cta && filterValidLinks([nav.cta], validRoutes).length > 0
  const ctaBlock = ctaValid
    ? `\n        <Button asChild size="sm">\n          <Link to="${nav.cta!.href}">${nav.cta!.label}</Link>\n        </Button>`
    : ''

  const mobileCta = ctaValid
    ? `\n          <Button asChild className="mt-2 w-full">\n            <Link to="${nav.cta!.href}" onClick={() => setMobileOpen(false)}>${nav.cta!.label}</Link>\n          </Button>`
    : ''

  return `function Navigation() {
  const router = useRouter()
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 8)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={\`sticky top-0 z-50 w-full border-b transition-all duration-200 \${
        isScrolled ? 'backdrop-blur-md bg-background/80 border-border/50 shadow-sm' : 'bg-background border-transparent'
      }\`}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-semibold text-lg font-[family-name:var(--font-display)]">
          ${nav.logo}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
${navLinks}
        </nav>

        {/* Desktop CTA */}${ctaBlock}

        {/* Mobile menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open navigation menu">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <div className="flex flex-col gap-1 mt-6">
${mobileLinks}${mobileCta}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}`
}

/**
 * Build the Footer component source (inlined in __root.tsx).
 */
function buildFooter(spec: CreativeSpec): string {
  const { footer } = spec
  const validRoutes = new Set(spec.sitemap.map(p => p.route))

  // Collect unique social icons needed
  const socialIconNames = footer.socialLinks.map(socialPlatformToIcon)
  // We will import these from lucide-react at the top of __root.tsx

  // Build social buttons
  const socialButtons = footer.socialLinks
    .map((platform, i) => {
      const iconName = socialIconNames[i] ?? 'Globe'
      return `          <Button variant="ghost" size="icon" aria-label="${platform}">\n            <${iconName} className="h-4 w-4" />\n          </Button>`
    })
    .join('\n')

  // Build newsletter block
  const newsletterBlock = footer.showNewsletter
    ? `        <form
          className="flex gap-2 mt-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <Input
            type="email"
            placeholder="Enter your email"
            className="max-w-xs"
            aria-label="Newsletter email"
          />
          <Button type="submit" variant="default">Subscribe</Button>
        </form>`
    : ''

  // Build footer columns
  const columnsBlock =
    footer.columns && footer.columns.length > 0
      ? `        <div className="grid grid-cols-2 md:grid-cols-${Math.min(footer.columns.length, 4)} gap-8">
${footer.columns
  .map(
    (col) => `          <div>
            <h3 className="text-sm font-semibold mb-3">${col.heading}</h3>
            <ul className="space-y-2">
${filterValidLinks(col.links, validRoutes)
  .map(
    (link) => `              <li>
                <Link to="${link.href}" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ${link.label}
                </Link>
              </li>`,
  )
  .join('\n')}
            </ul>
          </div>`,
  )
  .join('\n')}
        </div>`
      : ''

  return `function Footer() {
  return (
    <footer className="border-t bg-background">
      <Separator />
      <div className="container mx-auto px-4 md:px-6 py-10">
${columnsBlock}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${footer.columns && footer.columns.length > 0 ? 'mt-8 pt-8 border-t' : ''}">
          <div>
            <p className="text-sm text-muted-foreground">${footer.copyright}</p>
${newsletterBlock}
          </div>
          {/* Social links */}
          <div className="flex items-center gap-1">
${socialButtons}
          </div>
        </div>
      </div>
    </footer>
  )
}`
}

/**
 * Generate src/routes/__root.tsx — root layout with inline Navigation and Footer.
 */
function generateRootLayout(spec: CreativeSpec): string {
  // Collect all unique Lucide icon names for social links
  const socialIcons = [...new Set(spec.footer.socialLinks.map(socialPlatformToIcon))]

  // Base lucide imports for nav
  const navIcons = ['Menu', 'X']
  const allIcons = [...new Set([...navIcons, ...socialIcons])]

  const lucideImport = `import { ${allIcons.join(', ')} } from 'lucide-react'`

  const navSource = buildNavigation(spec)
  const footerSource = buildFooter(spec)

  return [
    "// Auto-generated by VibeStack — do not edit manually",
    `import { Outlet, Link, useRouter, createRootRoute } from '@tanstack/react-router'`,
    `import { useState, useEffect } from 'react'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'`,
    `import { Separator } from '@/components/ui/separator'`,
    `import { Input } from '@/components/ui/input'`,
    `import { TooltipProvider } from '@/components/ui/tooltip'`,
    lucideImport,
    '',
    'export const Route = createRootRoute({',
    '  component: RootLayout,',
    '})',
    '',
    'function RootLayout() {',
    '  return (',
    '    <TooltipProvider>',
    '    <div className="min-h-screen flex flex-col bg-background text-foreground font-[family-name:var(--font-body)]">',
    '      <Navigation />',
    '      <main className="flex-1">',
    '        <Outlet />',
    '      </main>',
    '      <Footer />',
    '    </div>',
    '    </TooltipProvider>',
    '  )',
    '}',
    '',
    navSource,
    '',
    footerSource,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// ui-kit file loader
// ---------------------------------------------------------------------------

/**
 * Read all shadcn/ui component files from snapshot/ui-kit/ and return them
 * as BlueprintFile[] ready to be included in the assembled app output.
 *
 * Routes utils.ts → src/lib/utils.ts; all .tsx files → src/components/ui/{name}.
 */
export function getUiKitFiles(): BlueprintFile[] {
  const uiKitDir = join(import.meta.dirname, '../../snapshot/ui-kit')
  const files: BlueprintFile[] = []

  try {
    const entries = readdirSync(uiKitDir)
    for (const entry of entries) {
      if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue
      const content = readFileSync(join(uiKitDir, entry), 'utf-8')
      const path = entry === 'utils.ts'
        ? 'src/lib/utils.ts'
        : `src/components/ui/${entry}`
      files.push({ path, content, layer: 1, isLLMSlot: false })
    }
  } catch {
    // ui-kit dir not found — return empty (tests may not have snapshot/)
  }

  return files
}

// ---------------------------------------------------------------------------
// Main assembler
// ---------------------------------------------------------------------------

/**
 * Assemble all deterministic files for a generated app.
 *
 * Returns a BlueprintFile[] ordered by layer so callers can sort or prioritise.
 */
export function assembleApp(input: AssemblyInput): BlueprintFile[] {
  const { spec, generatedPages, appName: _appName, tokens } = input
  const files: BlueprintFile[] = []

  // ---- Layer 0: build tooling ----

  files.push({
    path: 'vite.config.ts',
    content: generateViteConfig(),
    layer: 0,
    isLLMSlot: false,
  })

  // ---- Layer 1: lib utilities ----

  // cn() helper — required by all shadcn/ui components
  files.push({
    path: 'src/lib/utils.ts',
    content: `import { type ClassValue, clsx } from 'clsx'\nimport { twMerge } from 'tailwind-merge'\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs))\n}\n`,
    layer: 1,
    isLLMSlot: false,
  })

  // ---- Layer 2: app skeleton ----

  files.push({
    path: 'src/index.css',
    content: generateIndexCSS(tokens),
    layer: 2,
    isLLMSlot: false,
  })

  files.push({
    path: 'src/main.tsx',
    content: generateMainTSX(),
    layer: 2,
    isLLMSlot: false,
  })

  files.push({
    path: 'src/routeTree.gen.ts',
    content: generateRouteTree(spec),
    layer: 2,
    isLLMSlot: false,
  })

  files.push({
    path: 'src/routes/__root.tsx',
    content: generateRootLayout(spec),
    layer: 2,
    isLLMSlot: false,
  })

  // ---- Layer 3: LLM-generated page routes ----

  for (const page of generatedPages) {
    files.push({
      path: `src/${page.fileName}`,
      content: page.content,
      layer: 3,
      isLLMSlot: true,
    })
  }

  // ---- Layer 3.5: ui-kit components (if includeUiKit) ----

  if (input.includeUiKit) {
    files.push(...getUiKitFiles())
  }

  return files
}
