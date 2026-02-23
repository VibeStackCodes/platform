import { describe, it, expect } from 'vitest'
import { validateGeneratedApp } from '@server/lib/page-validator'
import type { ValidationResult } from '@server/lib/page-validator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFiles(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries))
}

const DEFAULT_ROUTES = ['/', '/_authenticated/recipes', '/_authenticated/recipes/$id']

// Minimal valid file — no errors expected
const CLEAN_FILE = `
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export const Route = createFileRoute('/_authenticated/recipes')({ component: Page })

function Page() {
  return (
    <div>
      <h1>Recipes</h1>
      <Button>Add recipe</Button>
    </div>
  )
}
`

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — smoke', () => {
  it('returns valid:true with no issues for a clean file', () => {
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/recipes.tsx': CLEAN_FILE }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('ignores non-TS/TSX files', () => {
    const result = validateGeneratedApp({
      files: makeFiles({
        'src/styles/index.css': '.foo { color: red }',
        'public/logo.svg': '<svg/>',
        'vite.config.ts': 'export default {}',
      }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })

    // vite.config.ts has no imports or issues — still valid
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Import resolution — package imports
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — import resolution: packages', () => {
  it('accepts all VALID_PACKAGES imports', () => {
    const content = `
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Home } from 'lucide-react'
`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors).toHaveLength(0)
  })

  it('flags unknown package import as error', () => {
    const content = `import axios from 'axios'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const importErrors = result.errors.filter((e) => e.type === 'import-missing')
    expect(importErrors).toHaveLength(1)
    expect(importErrors[0].message).toContain('axios')
    expect(result.valid).toBe(false)
  })

  it('flags @supabase/supabase-js when hasSupabase is false', () => {
    const content = `import { createClient } from '@supabase/supabase-js'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: false,
    })
    const importErrors = result.errors.filter((e) => e.type === 'import-missing')
    expect(importErrors.length).toBeGreaterThanOrEqual(1)
    expect(importErrors[0].message).toContain('@supabase/supabase-js')
  })

  it('flags @tanstack/react-query when hasSupabase is false', () => {
    const content = `import { useQuery } from '@tanstack/react-query'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: false,
    })
    const importErrors = result.errors.filter((e) => e.type === 'import-missing')
    expect(importErrors.length).toBeGreaterThanOrEqual(1)
    expect(importErrors[0].message).toContain('@tanstack/react-query')
  })

  it('accepts @tanstack/react-query when hasSupabase is true', () => {
    const content = `import { useQuery } from '@tanstack/react-query'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'import-missing')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Import resolution — @/ alias imports
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — import resolution: @/ alias', () => {
  it('accepts valid shadcn component imports', () => {
    const content = `
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader } from '@/components/ui/card'
`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'component-missing')).toHaveLength(0)
  })

  it('flags an unknown shadcn component as component-missing error', () => {
    const content = `import { SuperWidget } from '@/components/ui/super-widget'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const compErrors = result.errors.filter((e) => e.type === 'component-missing')
    expect(compErrors).toHaveLength(1)
    expect(compErrors[0].message).toContain('super-widget')
  })

  it('accepts @/lib/* imports when the lib file exists in the file map', () => {
    const content = `import { supabase } from '@/lib/supabase'\n`
    const result = validateGeneratedApp({
      files: makeFiles({
        'src/routes/index.tsx': content,
        'src/lib/supabase.ts': 'export const supabase = null',
      }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'import-missing')).toHaveLength(0)
  })

  it('flags @/lib/* imports when the lib file is absent', () => {
    const content = `import { config } from '@/lib/config'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'import-missing')).toHaveLength(1)
  })

  it('always accepts routeTree.gen imports', () => {
    const content = `import { routeTree } from '@/routeTree.gen'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/main.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'import-missing')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Import resolution — relative imports
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — import resolution: relative', () => {
  it('accepts relative imports when the target file is in the map', () => {
    const content = `import { helpers } from './helpers'\n`
    const result = validateGeneratedApp({
      files: makeFiles({
        'src/routes/index.tsx': content,
        'src/routes/helpers.ts': 'export const helpers = {}',
      }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'import-missing')).toHaveLength(0)
  })

  it('flags relative imports when the target file is missing', () => {
    const content = `import { missing } from './missing-module'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'import-missing')).toHaveLength(1)
    expect(result.errors[0].message).toContain('missing-module')
  })

  it('resolves ../ relative imports correctly', () => {
    const content = `import { utils } from '../lib/utils'\n`
    const result = validateGeneratedApp({
      files: makeFiles({
        'src/routes/index.tsx': content,
        'src/lib/utils.ts': 'export const utils = {}',
      }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'import-missing')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Link integrity
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — link integrity', () => {
  it('accepts links matching valid routes', () => {
    const content = `
import { Link } from '@tanstack/react-router'
function Nav() {
  return <Link to="/_authenticated/recipes">Recipes</Link>
}
`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'link-broken')).toHaveLength(0)
  })

  it('accepts links to parametric routes', () => {
    const content = `<Link to="/_authenticated/recipes/$id">Detail</Link>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'link-broken')).toHaveLength(0)
  })

  it('flags links to non-existent routes', () => {
    const content = `<Link to="/does-not-exist">Broken</Link>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const linkErrors = result.errors.filter((e) => e.type === 'link-broken')
    expect(linkErrors).toHaveLength(1)
    expect(linkErrors[0].message).toContain('/does-not-exist')
  })

  it('ignores external URLs', () => {
    const content = `<a href="https://example.com">External</a>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'link-broken')).toHaveLength(0)
  })

  it('ignores mailto: links', () => {
    const content = `<a href="mailto:test@example.com">Email</a>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'link-broken')).toHaveLength(0)
  })

  it('ignores hash links', () => {
    const content = `<a href="#section-top">Top</a>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'link-broken')).toHaveLength(0)
  })

  it('ignores tel: links', () => {
    const content = `<a href="tel:+15551234567">Call</a>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'link-broken')).toHaveLength(0)
  })

  it('accepts root route "/"', () => {
    const content = `<Link to="/">Home</Link>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: ['/', '/_authenticated/dashboard'],
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'link-broken')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Hardcoded colors
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — hardcoded colors', () => {
  it('warns on hex arbitrary Tailwind classes', () => {
    const content = `<div className="bg-[#ff0000] text-[#fff]">Styled</div>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const colorWarnings = result.warnings.filter((w) => w.type === 'hardcoded-color')
    expect(colorWarnings.length).toBeGreaterThanOrEqual(2)
  })

  it('warns on direct Tailwind palette classes', () => {
    const content = `<div className="bg-blue-500 text-gray-700 border-red-300">Styled</div>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const colorWarnings = result.warnings.filter((w) => w.type === 'hardcoded-color')
    expect(colorWarnings.length).toBeGreaterThanOrEqual(3)
  })

  it('does not warn on semantic Tailwind tokens', () => {
    const content = `<div className="bg-primary text-foreground border-border">Styled</div>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.warnings.filter((w) => w.type === 'hardcoded-color')).toHaveLength(0)
  })

  it('hardcoded color issues are warnings not errors', () => {
    const content = `<div className="bg-[#abc123]">Styled</div>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    // valid:true because color issues are warnings only
    expect(result.valid).toBe(true)
    expect(result.warnings.filter((w) => w.type === 'hardcoded-color').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Accessibility — img alt
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — a11y: img alt', () => {
  it('flags <img> without alt as a11y-critical error', () => {
    const content = `<img src="/logo.png" />\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const a11yErrors = result.errors.filter((e) => e.type === 'a11y-critical')
    expect(a11yErrors).toHaveLength(1)
    expect(a11yErrors[0].message).toContain('alt')
    expect(result.valid).toBe(false)
  })

  it('accepts <img> with alt attribute', () => {
    const content = `<img src="/logo.png" alt="Company logo" />\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'a11y-critical')).toHaveLength(0)
  })

  it('accepts <img> with empty alt (decorative image)', () => {
    const content = `<img src="/decoration.png" alt="" />\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors.filter((e) => e.type === 'a11y-critical')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Accessibility — onClick on divs/spans
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — a11y: onClick on non-interactive elements', () => {
  it('warns on onClick on <div>', () => {
    const content = `<div onClick={handleClick}>Click me</div>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const a11yWarnings = result.warnings.filter((w) => w.type === 'a11y-moderate')
    expect(a11yWarnings.some((w) => w.message.includes('non-interactive'))).toBe(true)
  })

  it('warns on onClick on <span>', () => {
    const content = `<span onClick={handleClick}>Click me</span>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const a11yWarnings = result.warnings.filter((w) => w.type === 'a11y-moderate')
    expect(a11yWarnings.some((w) => w.message.includes('non-interactive'))).toBe(true)
  })

  it('does not warn on onClick on <button>', () => {
    const content = `<button onClick={handleClick}>Click me</button>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.warnings.filter((w) => w.type === 'a11y-moderate' && w.message.includes('non-interactive'))).toHaveLength(0)
  })

  it('onClick issues are warnings not errors', () => {
    const content = `<div onClick={x}>clickable div</div>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Accessibility — heading hierarchy
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — a11y: heading hierarchy', () => {
  it('warns when multiple <h1> elements exist', () => {
    const content = `
<h1>Title One</h1>
<h1>Title Two</h1>
`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const h1Warnings = result.warnings.filter(
      (w) => w.type === 'a11y-moderate' && w.message.includes('h1'),
    )
    expect(h1Warnings).toHaveLength(1)
    expect(h1Warnings[0].message).toContain('2')
  })

  it('warns when heading level skips (h1 → h3)', () => {
    const content = `
<h1>Title</h1>
<h3>Subsection</h3>
`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const skipWarnings = result.warnings.filter(
      (w) => w.type === 'a11y-moderate' && w.message.includes('skipped'),
    )
    expect(skipWarnings).toHaveLength(1)
    expect(skipWarnings[0].message).toContain('h2')
  })

  it('does not warn for well-ordered headings', () => {
    const content = `
<h1>Title</h1>
<h2>Section</h2>
<h3>Subsection</h3>
<h2>Another Section</h2>
`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.warnings.filter((w) => w.type === 'a11y-moderate')).toHaveLength(0)
  })

  it('heading warnings do not make the result invalid', () => {
    const content = `<h1>A</h1><h1>B</h1>\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Lucide icon validation
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — Lucide icon imports', () => {
  it('accepts known icon names without warnings', () => {
    const content = `import { ArrowRight, Home, Search, Plus } from 'lucide-react'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.warnings.filter((w) => w.message.includes('Lucide icon'))).toHaveLength(0)
  })

  it('warns on renamed icons that have a known replacement', () => {
    const content = `import { Lotus, AlertTriangle } from 'lucide-react'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    const iconWarnings = result.warnings.filter((w) => w.message.includes('Lucide icon'))
    expect(iconWarnings).toHaveLength(2)
    expect(iconWarnings.some((w) => w.message.includes('Lotus'))).toBe(true)
    expect(iconWarnings.some((w) => w.message.includes('AlertTriangle'))).toBe(true)
  })

  it('lucide warnings do not make the result invalid', () => {
    const content = `import { FakePurpleIcon } from 'lucide-react'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.valid).toBe(true)
  })

  it('skips files with no lucide-react import', () => {
    const content = `import { useState } from 'react'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.warnings.filter((w) => w.message.includes('Lucide icon'))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Multi-file validation
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — multi-file', () => {
  it('validates all .tsx files and aggregates results', () => {
    const files = makeFiles({
      'src/routes/index.tsx': `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
function Page() { return <img src="/logo.png" /> }
`,
      'src/routes/about.tsx': `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/about')({ component: AboutPage })
function AboutPage() { return <h1>About</h1> }
`,
    })

    const result = validateGeneratedApp({
      files,
      validRoutes: ['/', '/about'],
      hasSupabase: false,
    })

    // The img without alt is an error
    expect(result.errors.filter((e) => e.type === 'a11y-critical')).toHaveLength(1)
    expect(result.errors[0].file).toBe('src/routes/index.tsx')
    expect(result.valid).toBe(false)
  })

  it('reports errors with the correct file path', () => {
    const result = validateGeneratedApp({
      files: makeFiles({
        'src/routes/foo.tsx': `import axios from 'axios'\n`,
        'src/routes/bar.tsx': `import lodash from 'lodash'\n`,
      }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })

    const fooErrors = result.errors.filter((e) => e.file === 'src/routes/foo.tsx')
    const barErrors = result.errors.filter((e) => e.file === 'src/routes/bar.tsx')
    expect(fooErrors).toHaveLength(1)
    expect(barErrors).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// ValidationResult shape
// ---------------------------------------------------------------------------

describe('validateGeneratedApp — result shape', () => {
  it('valid:true when only warnings exist', () => {
    const content = `<div onClick={x}>test</div>\n`
    const result: ValidationResult = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.errors).toHaveLength(0)
  })

  it('valid:false when at least one error exists', () => {
    const content = `import unknownPkg from 'some-unknown-package'\n`
    const result: ValidationResult = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns empty errors and warnings for an empty file map', () => {
    const result = validateGeneratedApp({
      files: new Map(),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('error objects include file, type, and message fields', () => {
    const content = `import { X } from 'bad-pkg'\n`
    const result = validateGeneratedApp({
      files: makeFiles({ 'src/routes/index.tsx': content }),
      validRoutes: DEFAULT_ROUTES,
      hasSupabase: true,
    })
    expect(result.errors[0]).toMatchObject({
      file: expect.any(String),
      type: expect.stringMatching(/import-missing|link-broken|component-missing|a11y-critical/),
      message: expect.any(String),
    })
  })
})
