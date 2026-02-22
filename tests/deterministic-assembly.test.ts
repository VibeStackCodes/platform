import { describe, it, expect } from 'vitest'
import { assembleApp } from '@server/lib/deterministic-assembly'
import type { GeneratedPage, AssemblyInput } from '@server/lib/deterministic-assembly'
import type { CreativeSpec } from '@server/lib/agents/schemas'
import type { ThemeTokens } from '@server/lib/themed-code-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTokens(): ThemeTokens {
  return {
    name: '',
    fonts: {
      display: 'Playfair Display',
      body: 'Source Sans 3',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+3&display=swap',
    },
    colors: {
      background: '#faf7f2',
      foreground: '#1a1a1a',
      primary: '#7c2d12',
      primaryForeground: '#ffffff',
      accent: '#d97706',
      muted: '#f3ede5',
      secondary: '#e8dfd4',
      border: '#e5ddd0',
    },
    style: {
      borderRadius: '0.75rem',
      cardStyle: 'elevated',
      navStyle: 'top-bar',
      heroLayout: 'split',
      spacing: 'normal',
      motion: 'subtle',
      imagery: 'photography-heavy',
    },
    authPosture: 'public',
    heroImages: [],
    heroQuery: '',
    textSlots: {
      heroHeadline: '',
      heroSubheadline: '',
      ctaButton: '',
      footerTagline: '',
    },
  }
}

function makeSpec(overrides: Partial<CreativeSpec> = {}): CreativeSpec {
  return {
    sitemap: [
      {
        route: '/',
        fileName: 'routes/index.tsx',
        componentName: 'Homepage',
        purpose: 'Landing page.',
        brief: {
          sections: ['Hero section', 'Features section'],
          copyDirection: 'Warm and inviting',
          keyInteractions: 'CTA button click',
          lucideIcons: ['ArrowRight'],
          shadcnComponents: ['Button'],
        },
      },
    ],
    nav: {
      style: 'sticky-blur',
      logo: 'TestApp',
      links: [
        { label: 'Home', href: '/' },
        { label: 'About', href: '/about' },
      ],
      mobileStyle: 'sheet',
    },
    footer: {
      style: 'minimal',
      showNewsletter: false,
      socialLinks: ['github', 'twitter'],
      copyright: '© 2026 TestApp. All rights reserved.',
      columns: [],
    },
    ...overrides,
  }
}

function makePages(count = 1): GeneratedPage[] {
  const pages: GeneratedPage[] = []
  for (let i = 0; i < count; i++) {
    const name = i === 0 ? 'Homepage' : `Page${i}`
    const route = i === 0 ? '/' : `/page${i}`
    pages.push({
      fileName: i === 0 ? 'routes/index.tsx' : `routes/page${i}/index.tsx`,
      componentName: name,
      content: `// ${name} component\nexport default function ${name}() { return <div>${name}</div> }`,
      route,
    })
  }
  return pages
}

function makeInput(specOverrides: Partial<CreativeSpec> = {}, pages?: GeneratedPage[]): AssemblyInput {
  return {
    spec: makeSpec(specOverrides),
    generatedPages: pages ?? makePages(),
    appName: 'TestApp',
    tokens: makeTokens(),
  }
}

// ---------------------------------------------------------------------------
// Basic assembly — expected files are produced
// ---------------------------------------------------------------------------

describe('assembleApp — basic assembly', () => {
  it('produces all expected files', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).toContain('vite.config.ts')
    expect(paths).toContain('src/index.css')
    expect(paths).toContain('src/main.tsx')
    expect(paths).toContain('src/routeTree.gen.ts')
    expect(paths).toContain('src/routes/__root.tsx')
    expect(paths).toContain('src/routes/index.tsx')
  })

  it('returns a non-empty array with required shape', () => {
    const files = assembleApp(makeInput())
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(typeof file.path).toBe('string')
      expect(typeof file.content).toBe('string')
      expect(typeof file.layer).toBe('number')
      expect(typeof file.isLLMSlot).toBe('boolean')
      expect(file.path.length).toBeGreaterThan(0)
    }
  })

  it('never includes supabase client or login page', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).not.toContain('src/lib/supabase.ts')
    expect(paths).not.toContain('src/routes/auth/login.tsx')
  })
})

// ---------------------------------------------------------------------------
// CSS generation — palette from ThemeTokens
// ---------------------------------------------------------------------------

describe('assembleApp — index.css from ThemeTokens', () => {
  it('contains palette colors from tokens', () => {
    const tokens = makeTokens()
    const files = assembleApp(makeInput())
    const css = files.find((f) => f.path === 'src/index.css')!
    expect(css.content).toContain(tokens.colors.background)
    expect(css.content).toContain(tokens.colors.foreground)
    expect(css.content).toContain(tokens.colors.primary)
    expect(css.content).toContain(tokens.colors.accent)
    expect(css.content).toContain(tokens.colors.border)
  })

  it('contains border-radius from tokens.style', () => {
    const files = assembleApp(makeInput())
    const css = files.find((f) => f.path === 'src/index.css')!
    expect(css.content).toContain('0.75rem')
  })

  it('contains display font name from tokens.fonts', () => {
    const files = assembleApp(makeInput())
    const css = files.find((f) => f.path === 'src/index.css')!
    expect(css.content).toContain('Playfair Display')
  })

  it('contains Google Fonts @import', () => {
    const files = assembleApp(makeInput())
    const css = files.find((f) => f.path === 'src/index.css')!
    expect(css.content).toContain('@import url(')
    expect(css.content).toContain('fonts.googleapis.com')
  })
})

// ---------------------------------------------------------------------------
// main.tsx — always static (no QueryClient)
// ---------------------------------------------------------------------------

describe('assembleApp — main.tsx is always static', () => {
  it('does not contain QueryClient or QueryClientProvider', () => {
    const files = assembleApp(makeInput())
    const main = files.find((f) => f.path === 'src/main.tsx')!
    expect(main.content).not.toContain('QueryClient')
    expect(main.content).not.toContain('QueryClientProvider')
  })

  it('contains RouterProvider', () => {
    const files = assembleApp(makeInput())
    const main = files.find((f) => f.path === 'src/main.tsx')!
    expect(main.content).toContain('RouterProvider')
  })
})

// ---------------------------------------------------------------------------
// Route tree — imports all sitemap pages
// ---------------------------------------------------------------------------

describe('assembleApp — routeTree.gen.ts', () => {
  it('imports the index route', () => {
    const files = assembleApp(makeInput())
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')!
    expect(routeTree.content).toContain('IndexImport')
    expect(routeTree.content).toContain('IndexRoute')
  })

  it('imports all pages from a multi-page sitemap', () => {
    const spec = makeSpec({
      sitemap: [
        {
          route: '/',
          fileName: 'routes/index.tsx',
          componentName: 'Homepage',
          purpose: 'Landing page',
          brief: { sections: [], copyDirection: '', keyInteractions: '', lucideIcons: [], shadcnComponents: [] },
        },
        {
          route: '/about',
          fileName: 'routes/about/index.tsx',
          componentName: 'AboutPage',
          purpose: 'About page',
          brief: { sections: [], copyDirection: '', keyInteractions: '', lucideIcons: [], shadcnComponents: [] },
        },
      ],
    })

    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp', tokens: makeTokens() })
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')!
    expect(routeTree.content).toContain('IndexImport')
    expect(routeTree.content).toContain('AboutIndexImport')
    expect(routeTree.content).toContain('./routes/index')
    expect(routeTree.content).toContain('./routes/about/index')
  })

  it('handles $param route paths', () => {
    const spec = makeSpec({
      sitemap: [
        {
          route: '/recipes/$id',
          fileName: 'routes/recipes/$id.tsx',
          componentName: 'RecipeDetailPage',
          purpose: 'Recipe detail',
          brief: { sections: [], copyDirection: '', keyInteractions: '', lucideIcons: [], shadcnComponents: [] },
        },
      ],
    })

    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp', tokens: makeTokens() })
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')!
    expect(routeTree.content).toContain('./routes/recipes/$id')
    expect(routeTree.content).toContain('RecipesIdImport')
  })

  it('contains root route import and routeTree export', () => {
    const files = assembleApp(makeInput())
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')!
    expect(routeTree.content).toContain('./routes/__root')
    expect(routeTree.content).toContain('export const routeTree')
  })

  it('never includes auth login import', () => {
    const files = assembleApp(makeInput())
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')!
    expect(routeTree.content).not.toContain('./routes/auth/login')
  })
})

// ---------------------------------------------------------------------------
// Root layout — nav + footer
// ---------------------------------------------------------------------------

describe('assembleApp — __root.tsx', () => {
  it('contains nav links and logo', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')!
    expect(root.content).toContain('Home')
    expect(root.content).toContain('About')
    expect(root.content).toContain('TestApp')
    expect(root.content).toContain('function Navigation')
  })

  it('contains footer copyright', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')!
    expect(root.content).toContain('© 2026 TestApp. All rights reserved.')
    expect(root.content).toContain('function Footer')
  })
})

// ---------------------------------------------------------------------------
// Layer ordering
// ---------------------------------------------------------------------------

describe('assembleApp — layer ordering', () => {
  it('vite.config.ts is layer 0, pages are layer 3', () => {
    const files = assembleApp(makeInput())
    const viteFile = files.find((f) => f.path === 'vite.config.ts')!
    const pageFile = files.find((f) => f.isLLMSlot)!
    expect(viteFile.layer).toBe(0)
    expect(pageFile.layer).toBe(3)
    expect(viteFile.layer).toBeLessThan(pageFile.layer)
  })

  it('all files have a numeric layer property', () => {
    const files = assembleApp(makeInput())
    for (const file of files) {
      expect(typeof file.layer).toBe('number')
    }
  })
})

// ---------------------------------------------------------------------------
// isLLMSlot flag
// ---------------------------------------------------------------------------

describe('assembleApp — isLLMSlot flag', () => {
  it('generated page files have isLLMSlot=true', () => {
    const pages = makePages(2)
    const files = assembleApp({ spec: makeSpec(), generatedPages: pages, appName: 'TestApp', tokens: makeTokens() })
    for (const page of pages) {
      const file = files.find((f) => f.path === `src/${page.fileName}`)
      expect(file).toBeDefined()
      expect(file!.isLLMSlot).toBe(true)
    }
  })

  it('infrastructure files have isLLMSlot=false', () => {
    const files = assembleApp(makeInput())
    for (const path of ['vite.config.ts', 'src/index.css', 'src/main.tsx', 'src/routes/__root.tsx']) {
      const file = files.find((f) => f.path === path)!
      expect(file.isLLMSlot).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// vite.config.ts content
// ---------------------------------------------------------------------------

describe('assembleApp — vite.config.ts', () => {
  it('contains required plugins and EXDEV fix', () => {
    const files = assembleApp(makeInput())
    const vite = files.find((f) => f.path === 'vite.config.ts')!
    expect(vite.content).toContain('@tailwindcss/vite')
    expect(vite.content).toContain('@vitejs/plugin-react')
    expect(vite.content).toContain('defineConfig')
    expect(vite.content).toContain('/tmp/.vite')
  })
})

// ---------------------------------------------------------------------------
// Multiple generated pages
// ---------------------------------------------------------------------------

describe('assembleApp — multiple generated pages', () => {
  it('all generated pages appear in the file list', () => {
    const pages = makePages(3)
    const files = assembleApp({ spec: makeSpec(), generatedPages: pages, appName: 'TestApp', tokens: makeTokens() })
    const paths = files.map((f) => f.path)
    for (const page of pages) {
      expect(paths).toContain(`src/${page.fileName}`)
    }
  })

  it('generated page content is preserved exactly', () => {
    const pages = makePages(1)
    const files = assembleApp({ spec: makeSpec(), generatedPages: pages, appName: 'TestApp', tokens: makeTokens() })
    const file = files.find((f) => f.path === 'src/routes/index.tsx')!
    expect(file.content).toBe(pages[0]!.content)
  })
})
