// server/lib/page-validator.ts
//
// Static analysis validator for generated app files.
// Checks imports, links, accessibility, hardcoded colors, and Lucide icon names.
// Pure string/regex analysis — no external dependencies, synchronous.

// ============================================================================
// Public types
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  file: string
  line?: number
  type: 'import-missing' | 'link-broken' | 'component-missing' | 'a11y-critical'
  message: string
}

export interface ValidationWarning {
  file: string
  type: 'a11y-moderate' | 'unused-import' | 'hardcoded-color'
  message: string
}

export interface ValidatorInput {
  /** Map of file path → file content */
  files: Map<string, string>
  /** Valid route paths from the sitemap */
  validRoutes: string[]
  /** Whether the app uses Supabase (archetype !== 'static') */
  hasSupabase: boolean
  /** Called when a check group starts */
  onCheckStart?: (name: string) => void
  /** Called when a check group finishes */
  onCheckComplete?: (name: string, status: 'passed' | 'failed', errors?: ValidationError[]) => void
}

// ============================================================================
// Static constants
// ============================================================================

// npm packages that are always available in the generated sandbox
const VALID_PACKAGES = new Set([
  '@tanstack/react-router',
  '@tanstack/react-query',
  'react',
  'react-dom/client',
  'lucide-react',
  '@supabase/supabase-js',
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
  'radix-ui',
  'sonner',
  'cmdk',
  'react-hook-form',
])

// shadcn/ui component file names (kebab-case keys under @/components/ui/)
// Synced with snapshot/ui-kit/ contents — run `ls snapshot/ui-kit/*.tsx | sed 's/.*\///' | sed 's/\.tsx//'` to verify
const VALID_SHADCN_COMPONENTS = new Set([
  'accordion',
  'alert',
  'avatar',
  'badge',
  'button',
  'button-group',
  'card',
  'carousel',
  'checkbox',
  'collapsible',
  'command',
  'dialog',
  'dropdown-menu',
  'form',
  'hover-card',
  'input',
  'input-group',
  'label',
  'popover',
  'progress',
  'radio-group',
  'scroll-area',
  'select',
  'separator',
  'sheet',
  'skeleton',
  'sonner',
  'spinner',
  'switch',
  'table',
  'tabs',
  'textarea',
  'tooltip',
])

// Common valid Lucide icon names — not exhaustive, but catches obvious typos
const COMMON_LUCIDE_ICONS = new Set([
  'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
  'ChevronDown', 'ChevronLeft', 'ChevronRight', 'ChevronUp',
  'Menu', 'X', 'Search', 'Home', 'ExternalLink', 'Plus', 'Pencil',
  'Trash2', 'Save', 'Download', 'Upload', 'Copy', 'Share2', 'Send',
  'MoreHorizontal', 'Check', 'AlertCircle', 'Info', 'Clock', 'Loader2',
  'Star', 'Heart', 'Bookmark', 'MessageSquare', 'Quote', 'Eye',
  'Mail', 'Phone', 'MapPin', 'Calendar', 'User', 'Users',
  'ShoppingCart', 'CreditCard', 'DollarSign', 'Tag', 'Package',
  'UtensilsCrossed', 'ChefHat', 'Wine', 'Coffee', 'Soup', 'Salad',
  'Image', 'Video', 'Camera', 'Play', 'Github', 'Twitter', 'Linkedin',
  'Instagram', 'Youtube', 'Facebook', 'Globe', 'Leaf', 'Sun', 'Moon',
  'Code', 'Terminal', 'Database', 'Shield', 'Lock', 'Building2', 'Store',
  'Sparkles', 'Flame', 'BookOpen', 'FileText', 'Folder', 'Settings',
  'LogOut', 'LogIn', 'Filter', 'SlidersHorizontal', 'Grid', 'List',
  'LayoutGrid', 'Columns', 'Receipt', 'Pizza', 'Mountain', 'TreePine',
  'Cloud', 'Droplets',
])

// ============================================================================
// Regex patterns
// ============================================================================

// Captures the module specifier from standard import statements.
// Handles: import { A } from '...', import A from '...', import * as A from '...'
const IMPORT_RE = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g

// Named imports from lucide-react: import { A, B, C } from 'lucide-react'
const LUCIDE_IMPORT_RE = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/

// TanStack Router Link to="..." or to={`...`} or to={'...'}
const LINK_TO_RE = /<Link\s+[^>]*to=["'{`]([^"'}`]+)["'}`]/g

// Plain HTML anchor href="..." or href='...'
const HREF_RE = /href=["']([^"']+)['"]/g

// Tailwind arbitrary hex value in a color utility: bg-[#abc], text-[#abc123]
const HEX_IN_CLASS_RE = /(?:bg|text|border|ring|shadow)-\[#[\da-fA-F]{3,8}\]/g

// Hardcoded Tailwind palette color (should use semantic tokens instead)
const DIRECT_COLOR_RE = /(?:bg|text|border)-(?:blue|red|green|yellow|purple|pink|indigo|gray|slate|zinc|neutral|stone)-\d{2,3}/g

// <img> without alt attribute — lenient: requires at least one attribute before >
const IMG_NO_ALT_RE = /<img\b(?![^>]*\balt\b)[^>]*>/g

// onClick handler on non-interactive block/inline elements
const ON_CLICK_DIV_RE = /<(?:div|span)\s+[^>]*onClick/g

// Heading tags h1–h6
const HEADING_RE = /<h([1-6])\b/g

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Return 1-based line number of the first match of `pattern` in `content`.
 * Returns undefined when the pattern is not found.
 */
function lineOf(content: string, pattern: RegExp | string): number | undefined {
  const idx = typeof pattern === 'string'
    ? content.indexOf(pattern)
    : content.search(pattern)
  if (idx === -1) return undefined
  return content.slice(0, idx).split('\n').length
}

/**
 * Determine whether an import path is a known third-party package specifier
 * (i.e. does not start with '.', '/', or '@/' which are local imports).
 */
function isPackageImport(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/')
}

/**
 * Determine whether an internal route string is a parametric TanStack Router
 * route (e.g. /recipes/$id) and whether it matches the given valid routes set
 * after normalising the param segments.
 *
 * Strategy: replace each `$<param>` segment with a literal `$param` token,
 * then look for a route in validRoutes that has the same structure when its
 * own param segments are similarly normalised.
 */
function internalRouteExists(to: string, validRoutes: string[]): boolean {
  if (validRoutes.includes(to)) return true

  // Normalise param segments for comparison
  const normalise = (r: string) =>
    r.replace(/\$[^/]+/g, '$param')

  const normTo = normalise(to)
  if (validRoutes.some((r) => normalise(r) === normTo)) return true

  // Check if the link matches a parametric route pattern.
  // e.g., "/blog/some-slug" should match "/blog/$slug"
  const stripTrailing = (s: string) =>
    s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s
  const toSegs = stripTrailing(to).split('/')
  for (const route of validRoutes) {
    const routeSegs = stripTrailing(route).split('/')
    if (routeSegs.length !== toSegs.length) continue
    const matches = routeSegs.every(
      (seg, i) => seg.startsWith('$') || seg === toSegs[i],
    )
    if (matches) return true
  }
  return false
}

// ============================================================================
// Check: import resolution
// ============================================================================

function checkImports(
  filePath: string,
  content: string,
  input: ValidatorInput,
  errors: ValidationError[],
): void {
  const { files, hasSupabase } = input

  for (const match of content.matchAll(IMPORT_RE)) {
    const specifier = match[1]

    if (isPackageImport(specifier)) {
      // @/... is treated separately below as local alias
      if (specifier.startsWith('@/')) {
        resolveAliasImport(filePath, specifier, content, files, errors)
        continue
      }

      // Supabase / react-query are only valid when the app uses Supabase
      if (!hasSupabase && (
        specifier === '@supabase/supabase-js' ||
        specifier === '@tanstack/react-query'
      )) {
        errors.push({
          file: filePath,
          line: lineOf(content, specifier),
          type: 'import-missing',
          message: `Import of "${specifier}" is not valid for a static app (hasSupabase is false)`,
        })
        continue
      }

      // Check the package is in our allowed set
      if (!VALID_PACKAGES.has(specifier)) {
        errors.push({
          file: filePath,
          line: lineOf(content, specifier),
          type: 'import-missing',
          message: `Unknown package import: "${specifier}" is not in the set of available packages`,
        })
      }
      continue
    }

    // Relative import — the referenced file must exist in the file map
    if (specifier.startsWith('.')) {
      resolveRelativeImport(filePath, specifier, content, files, errors)
    }
  }
}

/**
 * Resolve @/ path alias imports.
 * - @/components/ui/<name>  → validated against VALID_SHADCN_COMPONENTS
 * - @/lib/<anything>        → file must exist in the files map
 * - ./routeTree.gen          → always valid (generated at build time)
 */
function resolveAliasImport(
  filePath: string,
  specifier: string,
  content: string,
  files: Map<string, string>,
  errors: ValidationError[],
): void {
  const withoutAlias = specifier.slice('@/'.length) // e.g. "components/ui/button"

  if (withoutAlias === 'routeTree.gen' || withoutAlias.startsWith('routeTree')) {
    // Route tree is always generated — always valid
    return
  }

  if (withoutAlias.startsWith('components/ui/')) {
    const componentName = withoutAlias.slice('components/ui/'.length)
    if (!VALID_SHADCN_COMPONENTS.has(componentName)) {
      errors.push({
        file: filePath,
        line: lineOf(content, specifier),
        type: 'component-missing',
        message: `Unknown shadcn component: "${componentName}" is not in the shadcn component registry`,
      })
    }
    return
  }

  if (withoutAlias.startsWith('lib/')) {
    // Resolve against generated files: "lib/supabase" → "src/lib/supabase.ts" etc.
    const stem = withoutAlias // e.g. "lib/supabase"
    const candidates = [
      `src/${stem}.ts`,
      `src/${stem}.tsx`,
      `src/${stem}/index.ts`,
      `src/${stem}/index.tsx`,
    ]
    const found = candidates.some((c) => files.has(c))
    if (!found) {
      errors.push({
        file: filePath,
        line: lineOf(content, specifier),
        type: 'import-missing',
        message: `Cannot resolve lib import: "${specifier}" — no matching file found in generated output`,
      })
    }
    return
  }

  // Other @/ paths — validate the file exists in the map (src/<path>.ts(x))
  const candidates = [
    `src/${withoutAlias}.ts`,
    `src/${withoutAlias}.tsx`,
    `src/${withoutAlias}/index.ts`,
    `src/${withoutAlias}/index.tsx`,
  ]
  const found = candidates.some((c) => files.has(c))
  if (!found) {
    errors.push({
      file: filePath,
      line: lineOf(content, specifier),
      type: 'import-missing',
      message: `Cannot resolve alias import: "${specifier}" — no matching file found in generated output`,
    })
  }
}

/**
 * Resolve relative imports by joining the importing file's directory with the
 * specifier and checking that the resulting path exists in the files map.
 */
function resolveRelativeImport(
  filePath: string,
  specifier: string,
  content: string,
  files: Map<string, string>,
  errors: ValidationError[],
): void {
  // Derive the directory of the importing file
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''

  // Resolve the path (naive but sufficient for flat/shallow generated projects)
  const joined = dir ? `${dir}/${specifier}` : specifier

  // Normalise '..' segments (simple one-level resolution)
  const segments = joined.split('/')
  const resolved: string[] = []
  for (const seg of segments) {
    if (seg === '..') {
      resolved.pop()
    } else if (seg !== '.') {
      resolved.push(seg)
    }
  }
  const resolvedPath = resolved.join('/')

  const candidates = [
    resolvedPath,
    `${resolvedPath}.ts`,
    `${resolvedPath}.tsx`,
    `${resolvedPath}/index.ts`,
    `${resolvedPath}/index.tsx`,
  ]

  const found = candidates.some((c) => files.has(c))
  if (!found) {
    errors.push({
      file: filePath,
      line: lineOf(content, specifier),
      type: 'import-missing',
      message: `Cannot resolve relative import: "${specifier}" from "${filePath}"`,
    })
  }
}

// ============================================================================
// Check: link integrity
// ============================================================================

function checkLinks(
  filePath: string,
  content: string,
  validRoutes: string[],
  errors: ValidationError[],
): void {
  const checkTarget = (raw: string) => {
    // Allow non-internal links and hash anchors
    if (
      raw.startsWith('https://') ||
      raw.startsWith('http://') ||
      raw.startsWith('#') ||
      raw.startsWith('mailto:') ||
      raw.startsWith('tel:')
    ) {
      return
    }

    // Allow hash links on internal routes (e.g. "/#neighborhoods")
    if (raw.includes('#')) return

    // Must start with '/' to be treated as an internal route
    if (!raw.startsWith('/')) return

    // Strip trailing slash for comparison (TanStack Router normalises these)
    const normalised = raw.endsWith('/') && raw.length > 1 ? raw.slice(0, -1) : raw

    if (!internalRouteExists(normalised, validRoutes)) {
      errors.push({
        file: filePath,
        line: lineOf(content, raw),
        type: 'link-broken',
        message: `Broken internal link: "${raw}" does not match any valid route`,
      })
    }
  }

  for (const match of content.matchAll(LINK_TO_RE)) {
    checkTarget(match[1])
  }

  for (const match of content.matchAll(HREF_RE)) {
    checkTarget(match[1])
  }
}

// ============================================================================
// Check: hardcoded colors
// ============================================================================

function checkHardcodedColors(
  filePath: string,
  content: string,
  warnings: ValidationWarning[],
): void {
  for (const match of content.matchAll(HEX_IN_CLASS_RE)) {
    warnings.push({
      file: filePath,
      type: 'hardcoded-color',
      message: `Hardcoded hex color class "${match[0]}" — use a semantic token (e.g. bg-primary) instead`,
    })
  }

  for (const match of content.matchAll(DIRECT_COLOR_RE)) {
    warnings.push({
      file: filePath,
      type: 'hardcoded-color',
      message: `Direct Tailwind palette class "${match[0]}" — use a semantic token (e.g. bg-primary, text-foreground) instead`,
    })
  }
}

// ============================================================================
// Check: accessibility
// ============================================================================

function checkAccessibility(
  filePath: string,
  content: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void {
  // a11y-critical: <img> without alt attribute
  for (const match of content.matchAll(IMG_NO_ALT_RE)) {
    errors.push({
      file: filePath,
      line: lineOf(content, match[0]),
      type: 'a11y-critical',
      message: `<img> element is missing the required "alt" attribute`,
    })
  }

  // a11y-moderate: onClick on div / span
  for (const _match of content.matchAll(ON_CLICK_DIV_RE)) {
    warnings.push({
      file: filePath,
      type: 'a11y-moderate',
      message: `onClick handler on a non-interactive element — use a <button> or add role="button" + keyboard handler`,
    })
  }

  // a11y-moderate: heading hierarchy analysis
  checkHeadings(filePath, content, warnings)
}

/**
 * Analyse heading levels in a single file:
 * - Warn if more than one <h1> exists.
 * - Warn when heading levels skip (e.g. h1 → h3 without an h2).
 */
function checkHeadings(
  filePath: string,
  content: string,
  warnings: ValidationWarning[],
): void {
  const levels: number[] = []
  for (const match of content.matchAll(HEADING_RE)) {
    levels.push(parseInt(match[1], 10))
  }

  if (levels.length === 0) return

  const h1Count = levels.filter((l) => l === 1).length
  if (h1Count > 1) {
    warnings.push({
      file: filePath,
      type: 'a11y-moderate',
      message: `Multiple <h1> elements found (${h1Count}) — a page should have exactly one <h1>`,
    })
  }

  // Check for skipped heading levels: e.g. h1 → h3 skips h2
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1]
    const curr = levels[i]
    if (curr > prev + 1) {
      warnings.push({
        file: filePath,
        type: 'a11y-moderate',
        message: `Heading level skipped: <h${prev}> followed by <h${curr}> — missing <h${prev + 1}>`,
      })
    }
  }
}

// ============================================================================
// Check: Lucide icon imports
// ============================================================================

function checkLucideIcons(
  filePath: string,
  content: string,
  warnings: ValidationWarning[],
): void {
  const match = content.match(LUCIDE_IMPORT_RE)
  if (!match) return

  const importedNames = match[1]
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)

  for (const name of importedNames) {
    if (!COMMON_LUCIDE_ICONS.has(name)) {
      warnings.push({
        file: filePath,
        type: 'unused-import',
        message: `Lucide icon "${name}" is not in the known icon set — verify the name is correct`,
      })
    }
  }
}

// ============================================================================
// Anti-pattern detection
// ============================================================================

export interface AntiPatternViolation {
  rule: string
  message: string
  line?: number
}

const BUZZWORDS = [
  'seamless',
  'cutting-edge',
  'revolutionary',
  'leverage',
  'synergy',
  'game-changing',
  'disruptive',
  'next-generation',
]

const GENERIC_CTAS = ['Get Started', 'Learn More', 'Sign Up Now', 'Contact Us']

/**
 * Detect AI-slop anti-patterns in generated JSX/TSX code.
 *
 * Rules checked:
 * - placeholder-text: Lorem ipsum or [Your text here] / [placeholder]
 * - buzzword: AI-favoured marketing buzzwords
 * - generic-cta: 2+ identical generic CTA labels in the same file
 * - empty-handler: onClick={() => {}} with no-op body
 * - img-missing-alt: <img> without alt attribute
 * - img-missing-onerror: <img> without onError fallback
 */
export function detectAntiPatterns(code: string): AntiPatternViolation[] {
  const violations: AntiPatternViolation[] = []

  // Placeholder text
  if (
    /lorem ipsum/i.test(code) ||
    /\[your text here\]/i.test(code) ||
    /\[placeholder\]/i.test(code)
  ) {
    violations.push({
      rule: 'placeholder-text',
      message: 'Contains placeholder text (Lorem ipsum or [Your text here])',
    })
  }

  // Buzzwords — report only the first match to avoid noise
  for (const word of BUZZWORDS) {
    if (code.toLowerCase().includes(word)) {
      violations.push({
        rule: 'buzzword',
        message: `Contains AI-slop buzzword: "${word}"`,
      })
      break
    }
  }

  // Generic CTAs — flag if 2+ identical instances appear
  for (const cta of GENERIC_CTAS) {
    const matches = code.match(new RegExp(`>${cta}<`, 'g'))
    if (matches && matches.length >= 2) {
      violations.push({
        rule: 'generic-cta',
        message: `Multiple identical generic CTAs: "${cta}"`,
      })
      break
    }
  }

  // Empty onClick handlers: onClick={() => {}}
  if (/onClick=\{?\(\)\s*=>\s*\{\s*\}\}?/.test(code)) {
    violations.push({
      rule: 'empty-handler',
      message: 'Empty onClick handler: onClick={() => {}}',
    })
  }

  // <img> attribute checks
  const imgTags = code.match(/<img\b[^>]*\/?>/g) ?? []
  for (const tag of imgTags) {
    if (!/\balt[=\s]/.test(tag)) {
      violations.push({
        rule: 'img-missing-alt',
        message: '<img> without alt attribute',
      })
    }
    if (!/\bonError[=\s]/.test(tag)) {
      violations.push({
        rule: 'img-missing-onerror',
        message: '<img> without onError fallback',
      })
    }
  }

  return violations
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Validate all generated files in the provided file map.
 *
 * Errors are blocking issues (broken imports, broken links, missing alt, etc.).
 * Warnings are quality suggestions (hardcoded colors, a11y hints, icon typos).
 */
export function validateGeneratedApp(input: ValidatorInput): ValidationResult {
  const allErrors: ValidationError[] = []
  const allWarnings: ValidationWarning[] = []

  for (const [filePath, content] of input.files) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) continue
    // Skip build-config files — they use Node/Vite APIs not in the app runtime
    if (filePath === 'vite.config.ts' || filePath === 'tsconfig.json') continue

    // --- imports check ---
    input.onCheckStart?.('imports')
    const importErrors: ValidationError[] = []
    checkImports(filePath, content, input, importErrors)
    allErrors.push(...importErrors)
    input.onCheckComplete?.(
      'imports',
      importErrors.length === 0 ? 'passed' : 'failed',
      importErrors.length > 0 ? importErrors : undefined,
    )

    // --- links check ---
    input.onCheckStart?.('links')
    const linkErrors: ValidationError[] = []
    checkLinks(filePath, content, input.validRoutes, linkErrors)
    allErrors.push(...linkErrors)
    input.onCheckComplete?.(
      'links',
      linkErrors.length === 0 ? 'passed' : 'failed',
      linkErrors.length > 0 ? linkErrors : undefined,
    )

    // --- hardcoded colors check ---
    input.onCheckStart?.('hardcoded_colors')
    const colorWarningsBefore = allWarnings.length
    checkHardcodedColors(filePath, content, allWarnings)
    const newColorWarnings = allWarnings.length - colorWarningsBefore
    input.onCheckComplete?.(
      'hardcoded_colors',
      newColorWarnings === 0 ? 'passed' : 'failed',
    )

    // --- accessibility check ---
    input.onCheckStart?.('accessibility')
    const a11yErrors: ValidationError[] = []
    const a11yWarningsBefore = allWarnings.length
    checkAccessibility(filePath, content, a11yErrors, allWarnings)
    allErrors.push(...a11yErrors)
    const newA11yWarnings = allWarnings.length - a11yWarningsBefore
    input.onCheckComplete?.(
      'accessibility',
      a11yErrors.length === 0 && newA11yWarnings === 0 ? 'passed' : 'failed',
      a11yErrors.length > 0 ? a11yErrors : undefined,
    )

    // --- lucide icons check ---
    input.onCheckStart?.('lucide_icons')
    const lucideWarningsBefore = allWarnings.length
    checkLucideIcons(filePath, content, allWarnings)
    const newLucideWarnings = allWarnings.length - lucideWarningsBefore
    input.onCheckComplete?.(
      'lucide_icons',
      newLucideWarnings === 0 ? 'passed' : 'failed',
    )
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  }
}
