import { describe, it, expect } from 'vitest'
import { assembleApp } from '@server/lib/deterministic-assembly'
import type { GeneratedPage, AssemblyInput } from '@server/lib/deterministic-assembly'
import type { CreativeSpec } from '@server/lib/agents/schemas'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid CreativeSpec for use in tests.
 * Accepts partial overrides for the parts tests care about.
 */
function makeSpec(overrides: Partial<CreativeSpec> = {}): CreativeSpec {
  const base: CreativeSpec = {
    archetype: 'static',
    visualDna: {
      typography: {
        displayFont: 'Playfair Display',
        bodyFont: 'Source Sans 3',
        googleFontsUrl:
          'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+3&display=swap',
        headlineStyle: 'text-5xl font-bold tracking-tight',
        bodyStyle: 'text-base leading-relaxed',
      },
      palette: {
        background: '#faf7f2',
        foreground: '#1a1a1a',
        primary: '#7c2d12',
        primaryForeground: '#ffffff',
        accent: '#d97706',
        muted: '#f3ede5',
        mutedForeground: '#6b6456',
        border: '#e5ddd0',
        card: '#ffffff',
        destructive: '#dc2626',
      },
      motionPreset: 'subtle',
      borderRadius: '0.75rem',
      cardStyle: 'elevated',
      imagery: 'photography-heavy',
      visualTexture: 'none',
      moodBoard: 'Warm, editorial aesthetic with rich typography.',
    },
    sitemap: [
      {
        route: '/',
        fileName: 'routes/index.tsx',
        componentName: 'Homepage',
        purpose: 'Landing page.',
        dataRequirements: 'none',
        entities: [],
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
    auth: {
      required: false,
      publicRoutes: ['*'],
      privateRoutes: [],
      loginRoute: '/auth/login',
    },
    ...overrides,
  }
  return base
}

/**
 * Build a sample GeneratedPage[] array for use in tests.
 */
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
  }
}

// ---------------------------------------------------------------------------
// Test 1: Basic assembly — expected files are produced
// ---------------------------------------------------------------------------

describe('assembleApp — basic assembly', () => {
  it('produces vite.config.ts', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).toContain('vite.config.ts')
  })

  it('produces src/index.css', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/index.css')
  })

  it('produces src/main.tsx', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/main.tsx')
  })

  it('produces src/routeTree.gen.ts', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/routeTree.gen.ts')
  })

  it('produces src/routes/__root.tsx', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/routes/__root.tsx')
  })

  it('includes generated page file prefixed with src/', () => {
    const files = assembleApp(makeInput())
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/routes/index.tsx')
  })

  it('returns a non-empty array of files', () => {
    const files = assembleApp(makeInput())
    expect(files.length).toBeGreaterThan(0)
  })

  it('all files have required shape: path, content, layer, isLLMSlot', () => {
    const files = assembleApp(makeInput())
    for (const file of files) {
      expect(typeof file.path).toBe('string')
      expect(typeof file.content).toBe('string')
      expect(typeof file.layer).toBe('number')
      expect(typeof file.isLLMSlot).toBe('boolean')
      expect(file.path.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Test 2: Static archetype omits Supabase client
// ---------------------------------------------------------------------------

describe('assembleApp — static archetype omits Supabase', () => {
  it('omits src/lib/supabase.ts when archetype is static', () => {
    const files = assembleApp(makeInput({ archetype: 'static' }))
    const paths = files.map((f) => f.path)
    expect(paths).not.toContain('src/lib/supabase.ts')
  })
})

// ---------------------------------------------------------------------------
// Test 3: Content / CRUD archetypes include Supabase client
// ---------------------------------------------------------------------------

describe('assembleApp — content archetype includes Supabase', () => {
  it('includes src/lib/supabase.ts when archetype is content', () => {
    const files = assembleApp(makeInput({ archetype: 'content' }))
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/lib/supabase.ts')
  })

  it('supabase.ts content creates a client with createClient', () => {
    const files = assembleApp(makeInput({ archetype: 'content' }))
    const supabase = files.find((f) => f.path === 'src/lib/supabase.ts')
    expect(supabase!.content).toContain('createClient')
  })
})

describe('assembleApp — crud archetype includes Supabase', () => {
  it('includes src/lib/supabase.ts when archetype is crud', () => {
    const files = assembleApp(makeInput({ archetype: 'crud' }))
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/lib/supabase.ts')
  })
})

// ---------------------------------------------------------------------------
// Test 4: Auth login page generated when auth.required=true
// ---------------------------------------------------------------------------

describe('assembleApp — auth.required=true generates login page', () => {
  const authSpec: Partial<CreativeSpec> = {
    auth: {
      required: true,
      publicRoutes: ['/auth/login'],
      privateRoutes: ['*'],
      loginRoute: '/auth/login',
    },
  }

  it('produces src/routes/auth/login.tsx', () => {
    const files = assembleApp(makeInput(authSpec))
    const paths = files.map((f) => f.path)
    expect(paths).toContain('src/routes/auth/login.tsx')
  })

  it('login.tsx references the loginRoute path', () => {
    const files = assembleApp(makeInput(authSpec))
    const login = files.find((f) => f.path === 'src/routes/auth/login.tsx')
    expect(login!.content).toContain('/auth/login')
  })

  it('login.tsx contains the app name', () => {
    const files = assembleApp(makeInput(authSpec))
    const login = files.find((f) => f.path === 'src/routes/auth/login.tsx')
    expect(login!.content).toContain('TestApp')
  })
})

// ---------------------------------------------------------------------------
// Test 5: No auth login page when auth.required=false
// ---------------------------------------------------------------------------

describe('assembleApp — auth.required=false omits login page', () => {
  it('omits src/routes/auth/login.tsx', () => {
    const files = assembleApp(makeInput({ auth: { required: false, publicRoutes: ['*'], privateRoutes: [], loginRoute: '/auth/login' } }))
    const paths = files.map((f) => f.path)
    expect(paths).not.toContain('src/routes/auth/login.tsx')
  })
})

// ---------------------------------------------------------------------------
// Test 6: CSS generation — palette colors present in index.css
// ---------------------------------------------------------------------------

describe('assembleApp — index.css contains palette colors', () => {
  it('background color appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.palette.background)
  })

  it('foreground color appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.palette.foreground)
  })

  it('primary color appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.palette.primary)
  })

  it('accent color appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.palette.accent)
  })

  it('border color appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.palette.border)
  })

  it('destructive color appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.palette.destructive)
  })

  it('border-radius appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.borderRadius)
  })

  it('display font name appears in CSS', () => {
    const spec = makeSpec()
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(spec.visualDna.typography.displayFont)
  })
})

// ---------------------------------------------------------------------------
// Test 7: Route tree correctness — imports all sitemap pages
// ---------------------------------------------------------------------------

describe('assembleApp — routeTree.gen.ts imports sitemap pages', () => {
  it('imports the Homepage component', () => {
    const files = assembleApp(makeInput())
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(routeTree!.content).toContain('Homepage')
  })

  it('imports all pages from a multi-page sitemap', () => {
    const spec = makeSpec({
      sitemap: [
        {
          route: '/',
          fileName: 'routes/index.tsx',
          componentName: 'Homepage',
          purpose: 'Landing page',
          dataRequirements: 'none',
          entities: [],
          brief: { sections: [], copyDirection: '', keyInteractions: '', lucideIcons: [], shadcnComponents: [] },
        },
        {
          route: '/about',
          fileName: 'routes/about/index.tsx',
          componentName: 'AboutPage',
          purpose: 'About page',
          dataRequirements: 'none',
          entities: [],
          brief: { sections: [], copyDirection: '', keyInteractions: '', lucideIcons: [], shadcnComponents: [] },
        },
      ],
    })

    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(routeTree!.content).toContain('Homepage')
    expect(routeTree!.content).toContain('AboutPage')
    expect(routeTree!.content).toContain('./routes/index')
    expect(routeTree!.content).toContain('./routes/about/index')
  })

  it('handles $param route paths correctly', () => {
    const spec = makeSpec({
      sitemap: [
        {
          route: '/recipes/$id',
          fileName: 'routes/recipes/$id.tsx',
          componentName: 'RecipeDetailPage',
          purpose: 'Recipe detail',
          dataRequirements: 'read-only',
          entities: ['recipes'],
          brief: { sections: [], copyDirection: '', keyInteractions: '', lucideIcons: [], shadcnComponents: [] },
        },
      ],
    })

    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(routeTree!.content).toContain('./routes/recipes/$id')
    expect(routeTree!.content).toContain('RecipeDetailPage')
  })

  it('includes auth login import when auth.required=true', () => {
    const spec = makeSpec({
      auth: { required: true, publicRoutes: ['/auth/login'], privateRoutes: ['*'], loginRoute: '/auth/login' },
    })
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(routeTree!.content).toContain('./routes/auth/login')
  })

  it('omits auth login import when auth.required=false', () => {
    const files = assembleApp(makeInput())
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(routeTree!.content).not.toContain('./routes/auth/login')
  })

  it('contains the root route import', () => {
    const files = assembleApp(makeInput())
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(routeTree!.content).toContain('./routes/__root')
  })

  it('contains routeTree export', () => {
    const files = assembleApp(makeInput())
    const routeTree = files.find((f) => f.path === 'src/routeTree.gen.ts')
    expect(routeTree!.content).toContain('export const routeTree')
  })
})

// ---------------------------------------------------------------------------
// Test 8: Nav links in root layout
// ---------------------------------------------------------------------------

describe('assembleApp — __root.tsx nav links', () => {
  it('contains the Home nav link label', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')
    expect(root!.content).toContain('Home')
  })

  it('contains the About nav link label', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')
    expect(root!.content).toContain('About')
  })

  it('contains nav link href values', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')
    // TanStack Router uses `to` prop on Link, not `href`
    const hasLinkRef = root!.content.includes('to="/"') || root!.content.includes('href="/"')
    expect(hasLinkRef).toBe(true)
  })

  it('includes the logo text from spec.nav.logo', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')
    expect(root!.content).toContain('TestApp')
  })

  it('includes a Navigation component definition', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')
    expect(root!.content).toContain('function Navigation')
  })
})

// ---------------------------------------------------------------------------
// Test 9: Footer copyright in root layout
// ---------------------------------------------------------------------------

describe('assembleApp — __root.tsx footer copyright', () => {
  it('contains the copyright text from spec.footer.copyright', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')
    expect(root!.content).toContain('© 2026 TestApp. All rights reserved.')
  })

  it('includes a Footer component definition', () => {
    const files = assembleApp(makeInput())
    const root = files.find((f) => f.path === 'src/routes/__root.tsx')
    expect(root!.content).toContain('function Footer')
  })
})

// ---------------------------------------------------------------------------
// Test 10: Layer ordering — infrastructure layers < page layers
// ---------------------------------------------------------------------------

describe('assembleApp — layer ordering', () => {
  it('vite.config.ts layer is lower than generated page layer', () => {
    const files = assembleApp(makeInput())
    const viteFile = files.find((f) => f.path === 'vite.config.ts')
    const pageFile = files.find((f) => f.isLLMSlot)
    expect(viteFile!.layer).toBeLessThan(pageFile!.layer)
  })

  it('src/lib/supabase.ts layer is lower than page layer for content archetype', () => {
    const files = assembleApp(makeInput({ archetype: 'content' }))
    const supabase = files.find((f) => f.path === 'src/lib/supabase.ts')
    const pageFile = files.find((f) => f.isLLMSlot)
    expect(supabase!.layer).toBeLessThan(pageFile!.layer)
  })

  it('src/routes/auth/login.tsx layer is higher than src/index.css layer', () => {
    const spec = makeSpec({
      auth: { required: true, publicRoutes: ['/auth/login'], privateRoutes: ['*'], loginRoute: '/auth/login' },
    })
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const loginFile = files.find((f) => f.path === 'src/routes/auth/login.tsx')
    const cssFile = files.find((f) => f.path === 'src/index.css')
    expect(loginFile!.layer).toBeGreaterThan(cssFile!.layer)
  })

  it('vite.config.ts has layer 0 (earliest layer)', () => {
    const files = assembleApp(makeInput())
    const viteFile = files.find((f) => f.path === 'vite.config.ts')
    expect(viteFile!.layer).toBe(0)
  })

  it('all files have a numeric layer property', () => {
    const files = assembleApp(makeInput())
    for (const file of files) {
      expect(typeof file.layer).toBe('number')
    }
  })
})

// ---------------------------------------------------------------------------
// Test 11: Google Fonts URL in index.css
// ---------------------------------------------------------------------------

describe('assembleApp — Google Fonts URL in index.css', () => {
  it('contains the googleFontsUrl from spec.visualDna.typography', () => {
    const googleFontsUrl =
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond&family=Libre+Baskerville&display=swap'
    const files = assembleApp(
      makeInput({
        visualDna: {
          typography: {
            displayFont: 'Cormorant Garamond',
            bodyFont: 'Libre Baskerville',
            googleFontsUrl,
            headlineStyle: 'text-4xl font-bold',
            bodyStyle: 'text-base leading-relaxed',
          },
          palette: {
            background: '#faf7f2',
            foreground: '#1a1a1a',
            primary: '#7c2d12',
            primaryForeground: '#ffffff',
            accent: '#d97706',
            muted: '#f3ede5',
            mutedForeground: '#6b6456',
            border: '#e5ddd0',
            card: '#ffffff',
            destructive: '#dc2626',
          },
          motionPreset: 'subtle',
          borderRadius: '0.75rem',
          cardStyle: 'elevated',
          imagery: 'photography-heavy',
          visualTexture: 'none',
          moodBoard: 'Warm aesthetic.',
        },
      }),
    )
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain(googleFontsUrl)
  })

  it('contains @import url() syntax for the font', () => {
    const files = assembleApp(makeInput())
    const css = files.find((f) => f.path === 'src/index.css')
    expect(css!.content).toContain('@import url(')
  })
})

// ---------------------------------------------------------------------------
// Test 12: Static main.tsx omits QueryClient
// ---------------------------------------------------------------------------

describe('assembleApp — main.tsx providers by archetype', () => {
  it('static archetype main.tsx does not contain QueryClient', () => {
    const files = assembleApp(makeInput({ archetype: 'static' }))
    const main = files.find((f) => f.path === 'src/main.tsx')
    expect(main!.content).not.toContain('QueryClient')
    expect(main!.content).not.toContain('QueryClientProvider')
  })

  it('static archetype main.tsx still contains RouterProvider', () => {
    const files = assembleApp(makeInput({ archetype: 'static' }))
    const main = files.find((f) => f.path === 'src/main.tsx')
    expect(main!.content).toContain('RouterProvider')
  })

  it('content archetype main.tsx includes QueryClient and QueryClientProvider', () => {
    const files = assembleApp(makeInput({ archetype: 'content' }))
    const main = files.find((f) => f.path === 'src/main.tsx')
    expect(main!.content).toContain('QueryClient')
    expect(main!.content).toContain('QueryClientProvider')
  })

  it('crud archetype main.tsx includes QueryClient and QueryClientProvider', () => {
    const files = assembleApp(makeInput({ archetype: 'crud' }))
    const main = files.find((f) => f.path === 'src/main.tsx')
    expect(main!.content).toContain('QueryClient')
    expect(main!.content).toContain('QueryClientProvider')
  })
})

// ---------------------------------------------------------------------------
// Additional: isLLMSlot flag correctness
// ---------------------------------------------------------------------------

describe('assembleApp — isLLMSlot flag', () => {
  it('generated page files have isLLMSlot=true', () => {
    const pages = makePages(2)
    const files = assembleApp({ spec: makeSpec(), generatedPages: pages, appName: 'TestApp' })
    for (const page of pages) {
      const file = files.find((f) => f.path === `src/${page.fileName}`)
      expect(file).toBeDefined()
      expect(file!.isLLMSlot).toBe(true)
    }
  })

  it('vite.config.ts has isLLMSlot=false', () => {
    const files = assembleApp(makeInput())
    const file = files.find((f) => f.path === 'vite.config.ts')
    expect(file!.isLLMSlot).toBe(false)
  })

  it('src/index.css has isLLMSlot=false', () => {
    const files = assembleApp(makeInput())
    const file = files.find((f) => f.path === 'src/index.css')
    expect(file!.isLLMSlot).toBe(false)
  })

  it('src/main.tsx has isLLMSlot=false', () => {
    const files = assembleApp(makeInput())
    const file = files.find((f) => f.path === 'src/main.tsx')
    expect(file!.isLLMSlot).toBe(false)
  })

  it('src/routes/__root.tsx has isLLMSlot=false', () => {
    const files = assembleApp(makeInput())
    const file = files.find((f) => f.path === 'src/routes/__root.tsx')
    expect(file!.isLLMSlot).toBe(false)
  })

  it('src/routes/auth/login.tsx has isLLMSlot=false', () => {
    const spec = makeSpec({
      auth: { required: true, publicRoutes: ['/auth/login'], privateRoutes: ['*'], loginRoute: '/auth/login' },
    })
    const files = assembleApp({ spec, generatedPages: makePages(), appName: 'TestApp' })
    const file = files.find((f) => f.path === 'src/routes/auth/login.tsx')
    expect(file!.isLLMSlot).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Additional: vite.config.ts content correctness
// ---------------------------------------------------------------------------

describe('assembleApp — vite.config.ts content', () => {
  it('contains tailwindcss plugin import', () => {
    const files = assembleApp(makeInput())
    const vite = files.find((f) => f.path === 'vite.config.ts')
    expect(vite!.content).toContain('@tailwindcss/vite')
  })

  it('contains react plugin import', () => {
    const files = assembleApp(makeInput())
    const vite = files.find((f) => f.path === 'vite.config.ts')
    expect(vite!.content).toContain('@vitejs/plugin-react')
  })

  it('contains defineConfig', () => {
    const files = assembleApp(makeInput())
    const vite = files.find((f) => f.path === 'vite.config.ts')
    expect(vite!.content).toContain('defineConfig')
  })

  it('sets cacheDir to /tmp/.vite to avoid EXDEV errors', () => {
    const files = assembleApp(makeInput())
    const vite = files.find((f) => f.path === 'vite.config.ts')
    expect(vite!.content).toContain('/tmp/.vite')
  })
})

// ---------------------------------------------------------------------------
// Additional: multiple generated pages all appear in output
// ---------------------------------------------------------------------------

describe('assembleApp — multiple generated pages', () => {
  it('all generated pages appear in the file list', () => {
    const pages = makePages(3)
    const files = assembleApp({ spec: makeSpec(), generatedPages: pages, appName: 'TestApp' })
    const paths = files.map((f) => f.path)
    for (const page of pages) {
      expect(paths).toContain(`src/${page.fileName}`)
    }
  })

  it('generated page content is preserved exactly', () => {
    const pages = makePages(1)
    const files = assembleApp({ spec: makeSpec(), generatedPages: pages, appName: 'TestApp' })
    const file = files.find((f) => f.path === 'src/routes/index.tsx')
    expect(file!.content).toBe(pages[0]!.content)
  })
})
