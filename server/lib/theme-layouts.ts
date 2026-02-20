import type { TableDef } from './schema-contract'
import type { PageFeatureSpec } from './agents/feature-schema'
import type { ThemeTokens } from './themed-code-engine'
import { pluralize, singularize, snakeToPascal } from './naming-utils'

export type LayoutArchetype = 'editorial' | 'gallery' | 'corporate' | 'soft' | 'dashboard'

export type RouteMetaLite = {
  table: TableDef
  spec: PageFeatureSpec
  isPrivate: boolean
  routePrefix: string
  folderPrefix: string
  pluralKebab: string
  singularTitle: string
  pluralTitle: string
}

type CommonInput = {
  tokens: ThemeTokens
  appName: string
  allPublicMeta: RouteMetaLite[]
}

type HomepageInput = CommonInput & {
  featured: RouteMetaLite | null
  ctaPath: string
  hasAuth: boolean
}

type PublicInput = CommonInput & {
  meta: RouteMetaLite
  hasAuth: boolean
}

function spacingClass(spacing: ThemeTokens['style']['spacing']): string {
  if (spacing === 'compact') return 'p-4 gap-4'
  if (spacing === 'airy') return 'p-8 gap-8'
  return 'p-6 gap-6'
}

function cardClass(tokens: ThemeTokens): string {
  const base = `rounded-[${tokens.style.borderRadius}]`
  if (tokens.style.cardStyle === 'flat') return `${base}`
  if (tokens.style.cardStyle === 'bordered') return `${base} border border-border`
  if (tokens.style.cardStyle === 'glass') return `${base} border border-border/70 bg-card/70 backdrop-blur-md`
  return `${base} border border-border shadow-sm`
}

function motionCardClass(tokens: ThemeTokens): string {
  if (tokens.style.motion === 'none') return ''
  if (tokens.style.motion === 'subtle') return 'transition-all duration-200 hover:scale-[1.02]'
  return 'transition-all duration-300 hover:scale-105 hover:-translate-y-1 hover:shadow-lg'
}

function motionButtonClass(tokens: ThemeTokens): string {
  if (tokens.style.motion === 'none') return ''
  if (tokens.style.motion === 'subtle') return 'transition-all duration-200'
  return 'transition-all duration-300 hover:scale-[1.03]'
}

function imageColumn(table: TableDef): string | null {
  return table.columns.find((column) => /image|photo|avatar|thumbnail|cover/.test(column.name))?.name ?? null
}

function metadataColumns(table: TableDef, spec: PageFeatureSpec): string[] {
  const auto = new Set(['id', 'created_at', 'updated_at', 'user_id'])
  const heading = spec.detailPage.headerField
  return table.columns
    .map((column) => column.name)
    .filter((name) => !auto.has(name) && name !== heading)
    .slice(0, 3)
}

function displayExpr(field: { field: string; format: string }, rowVar: string): string {
  if (field.format === 'currency') return `{Number(${rowVar}.${field.field} ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`
  if (field.format === 'date') return `{${rowVar}.${field.field} ? new Date(String(${rowVar}.${field.field})).toLocaleDateString() : '—'}`
  if (field.format === 'boolean') return `{${rowVar}.${field.field} ? 'Yes' : 'No'}`
  return `{String(${rowVar}.${field.field} ?? '—')}`
}

function navLinks(publicMetas: RouteMetaLite[]): string {
  return publicMetas.map((m) => `<Link to="/${m.pluralKebab}/" className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded">${m.pluralTitle}</Link>`).join('')
}

function mobileNavLinks(publicMetas: RouteMetaLite[]): string {
  return publicMetas
    .map((m) => `<Link to="/${m.pluralKebab}/" onClick={() => setMobileOpen(false)} className="block px-3 py-3 rounded-lg hover:bg-charcoal/5 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">${m.pluralTitle}</Link>`)
    .join('')
}

/**
 * Generates a scroll-aware, mobile-responsive Navbar block.
 * isHome=true means transparent on scroll position < 60vh, solid after.
 * Returns a tuple: [hookCode, jsxCode] where hookCode goes in the component
 * body above the return statement and jsxCode is the <header> element.
 */
function renderNavbar(opts: {
  appName: string
  links: string
  mobileLinks: string
  hasAuth: boolean
  authButtonClass: string
  isHomepage: boolean
  logoClass?: string
  navStyle?: 'editorial' | 'gallery' | 'corporate' | 'soft'
}): { hooks: string; jsx: string } {
  const { appName, links, mobileLinks, hasAuth, authButtonClass, isHomepage, navStyle = 'editorial' } = opts

  const authCta = hasAuth
    ? `<Link to="/auth/login"><Button variant="default" size="sm" className="${authButtonClass}">Sign in</Button></Link>`
    : ''

  const desktopLinkClass =
    navStyle === 'gallery'
      ? 'hover:text-primary transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded'
      : navStyle === 'corporate'
        ? 'hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded'
        : 'hover:text-primary transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded'

  const hooks = isHomepage
    ? `const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const showSolid = scrolled
  const navBg = showSolid ? 'bg-cream/95 backdrop-blur-md border-b border-charcoal/10 shadow-sm' : 'bg-transparent'
  const navText = showSolid ? 'text-charcoal' : 'text-cream'`
    : `const [mobileOpen, setMobileOpen] = useState(false)
  const navBg = 'bg-background/80 backdrop-blur-md border-b border-border/40'
  const navText = 'text-foreground'`

  const jsx = `<header className={\`fixed top-0 left-0 right-0 z-50 transition-all duration-500 \${navBg}\`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded focus:ring-2 focus:ring-ring">Skip to main content</a>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-20">
          <Link to="/" className={\`text-2xl font-bold font-[family-name:var(--font-display)] tracking-tight transition-colors \${navText}\`}>${appName}</Link>
          {/* Desktop nav */}
          <nav aria-label="Main navigation" className={\`hidden lg:flex gap-8 text-sm font-medium items-center \${navText}\`}>
            <Link to="/" className="${desktopLinkClass}">Home</Link>
            ${links}
            ${authCta}
          </nav>
          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(true)} className={\`lg:hidden p-2 \${navText}\`} aria-label="Open menu">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div className="fixed inset-0 bg-black/40 z-40 lg:hidden" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setMobileOpen(false)} />
              <motion.div role="dialog" aria-modal="true" aria-label="Navigation menu" className="fixed top-0 right-0 bottom-0 w-72 bg-cream z-50 lg:hidden shadow-2xl p-6" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'spring',damping:25,stiffness:200}}>
                <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 p-2 text-charcoal" aria-label="Close menu">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <nav aria-label="Mobile navigation" className="mt-12 flex flex-col gap-1">
                  <Link to="/" onClick={() => setMobileOpen(false)} className="block px-3 py-3 rounded-lg hover:bg-charcoal/5 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">Home</Link>
                  ${mobileLinks}
                  ${hasAuth ? '<Link to="/auth/login" onClick={() => setMobileOpen(false)} className="mt-4 block w-full text-center px-4 py-3 bg-primary text-primary-foreground rounded-lg font-bold text-sm">Sign in</Link>' : ''}
                </nav>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>`

  return { hooks, jsx }
}

function homeListQuery(entity: string): string {
  return `const { data: rows = [] } = useQuery({
    queryKey: ['${entity}', 'featured'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').limit(9)
      if (error) throw error
      return data ?? []
    },
  })`
}

function publicListQuery(entity: string): string {
  return `const { data: rows = [], isPending } = useQuery({
    queryKey: ['${entity}', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })`
}

function publicDetailQuery(entity: string): string {
  return `const { data: row, isPending, error } = useQuery({
    queryKey: ['${entity}', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').eq('id', id).single()
      if (error) throw error
      return data as Record<string, unknown>
    },
  })`
}

export function deriveArchetype(tokens: ThemeTokens): LayoutArchetype {
  if (tokens.style.navStyle === 'sidebar') return 'dashboard'
  if (tokens.style.heroLayout === 'fullbleed' && tokens.style.navStyle === 'minimal') return 'gallery'
  if (tokens.style.heroLayout === 'editorial' || tokens.style.navStyle === 'editorial') return 'editorial'
  if (tokens.style.heroLayout === 'centered') return 'soft'
  return 'corporate'
}

function editorialHomepage(input: HomepageInput): string {
  const { tokens, appName, allPublicMeta, featured, ctaPath } = input
  const entity = featured?.table.name ?? 'items'
  const _entityTitle = featured?.pluralTitle ?? 'Items'
  const cardTitle = featured?.spec.detailPage.headerField ?? 'id'
  const detailPathBase = featured ? `${featured.routePrefix}/${featured.pluralKebab}` : '/'
  const imgField = featured ? imageColumn(featured.table) : null
  const metas = featured ? metadataColumns(featured.table, featured.spec).slice(0, 2) : []
  const metaLines = metas.map((field) => `<p className="text-sm text-muted-foreground">{String(row.${field} ?? '—')}</p>`).join('')
  const hero = tokens.heroImages[0]
  const _footerHero = tokens.heroImages[1]
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />`

  const nav = renderNavbar({
    appName,
    links,
    mobileLinks: mLinks,
    hasAuth: input.hasAuth,
    authButtonClass: 'rounded-full px-6 shadow-lg shadow-primary/10',
    isHomepage: true,
    navStyle: 'editorial',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [subscribed, setSubscribed] = useState(false)
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${nav.hooks}
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-[100] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      ${nav.jsx}

      <section className="relative h-[80vh] overflow-hidden">
        <img src="${hero?.url ?? 'https://picsum.photos/seed/editorial-hero/1800/1000'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover transition-transform duration-1000 scale-105" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 w-full text-white">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="max-w-3xl">
              <p className="text-sm font-bold tracking-[0.3em] uppercase mb-4 opacity-90">A Culinary Journal</p>
              <h1 className="text-5xl md:text-8xl font-bold font-[family-name:var(--font-display)] leading-[1]">${tokens.textSlots.hero_headline}</h1>
              <p className="mt-8 text-xl text-white/90 leading-relaxed max-w-xl">${tokens.textSlots.hero_subtext}</p>
              <Link to="${ctaPath}"><Button size="lg" className="mt-10 rounded-full px-10 py-7 text-lg shadow-2xl shadow-black/20 ${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
            </motion.div>
          </div>
        </div>
      </section>

      <div className="h-12 bg-gradient-to-b from-charcoal/5 to-transparent" aria-hidden="true" />

      <main id="main-content" className="mx-auto max-w-7xl px-6 lg:px-8 py-24">
        <div className="mb-12 flex items-end justify-between border-b pb-8">
          <div>
            <p className="text-primary text-sm font-bold tracking-[0.2em] uppercase mb-2">Featured</p>
            <h2 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-display)]">This Week's Picks</h2>
          </div>
          <Button variant="ghost" className="text-muted-foreground hover:text-primary transition-colors" onClick={() => ping.mutate()}>Refresh Feed</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="group block">
              <div className="space-y-6">
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border bg-muted shadow-sm group-hover:shadow-xl transition-all duration-500">
                  ${imageBlock}
                  <span className="absolute top-3 left-3 bg-terracotta text-cream text-xs font-bold px-3 py-1 rounded-full">Featured</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold font-[family-name:var(--font-display)] group-hover:text-primary transition-colors">{String(row.${cardTitle} ?? 'Untitled')}</h3>
                  <div className="flex gap-4 items-center text-sm text-muted-foreground">
                    ${metaLines}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {rows.length === 0 && <p className="mt-12 text-center text-muted-foreground italic">${tokens.textSlots.empty_state}</p>}
      </main>

      {/* hard section edge — no gradient bridge */}

      <section className="bg-charcoal text-cream py-32 border-y">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] mb-4">Stay Inspired</h2>
          <p className="text-lg text-cream/80 mb-10">Join our community of home cooks for weekly recipes and seasonal wisdom.</p>
          {subscribed ? (
            <div className="bg-cream/10 border border-cream/20 rounded-2xl p-10 text-cream animate-in fade-in zoom-in duration-500">
              <p className="text-2xl font-bold font-[family-name:var(--font-display)]">Thank you for subscribing!</p>
              <p className="mt-2 opacity-90">We've sent a welcome guide to your inbox.</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <Input id="newsletter-email" type="email" placeholder="Enter your email" className="h-14 rounded-full px-6 text-lg bg-cream/10 border-cream/20 text-cream placeholder:text-cream/50 focus:ring-2 focus:ring-cream/20" />
              <Button size="lg" className="h-14 rounded-full px-10 font-bold bg-terracotta text-cream hover:bg-terracotta/90 ${motionButtonClass(tokens)}" onClick={() => setSubscribed(true)}>Join Now</Button>
            </div>
          )}
        </div>
      </section>

      <footer className="bg-background py-20 border-t">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-2xl font-bold font-[family-name:var(--font-display)] tracking-tight">${appName}</h2>
          <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">${tokens.textSlots.footer_tagline}</p>
          <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>© 2026 ${appName}. Built with intention.</p>
            <nav aria-label="Footer navigation" className="flex gap-8">
              <Link to="/about" className="hover:text-primary transition-colors">Our Story</Link>
              <Link to="/contact" className="hover:text-primary transition-colors">Get in touch</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}
`
}

function galleryHomepage(input: HomepageInput): string {
  const { tokens, appName, allPublicMeta, featured, ctaPath } = input
  const entity = featured?.table.name ?? 'items'
  const cardTitle = featured?.spec.detailPage.headerField ?? 'id'
  const detailPathBase = featured ? `${featured.routePrefix}/${featured.pluralKebab}` : '/'
  const imgField = featured ? imageColumn(featured.table) : null
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const hero = tokens.heroImages[0]
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />`

  const nav = renderNavbar({
    appName,
    links,
    mobileLinks: mLinks,
    hasAuth: input.hasAuth,
    authButtonClass: 'rounded-none border-2 border-primary hover:bg-primary hover:text-primary-foreground px-6 font-bold uppercase transition-all',
    isHomepage: true,
    navStyle: 'gallery',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [subscribed, setSubscribed] = useState(false)
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${nav.hooks}
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}

      <section className="relative h-screen overflow-hidden">
        <img src="${hero?.url ?? 'https://picsum.photos/seed/gallery-hero/1800/1200'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover scale-105" />
        <div className="absolute inset-0 bg-black/40 backdrop-grayscale-[30%]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
            <h1 className="text-6xl md:text-9xl text-white font-bold font-[family-name:var(--font-display)] leading-[0.9] tracking-tighter italic">${tokens.textSlots.hero_headline}</h1>
            <p className="mt-8 text-white/90 max-w-2xl mx-auto text-xl md:text-2xl font-light">${tokens.textSlots.hero_subtext}</p>
            <div className="mt-12 flex flex-col sm:flex-row justify-center gap-6">
              <Link to="${ctaPath}"><Button size="lg" className="rounded-none px-12 py-8 text-xl font-bold uppercase ${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
              <Button size="lg" variant="secondary" className="rounded-none px-12 py-8 text-xl font-bold uppercase ${motionButtonClass(tokens)} bg-white/10 backdrop-blur-md text-white border-white/20 hover:bg-white/20" onClick={() => ping.mutate()}>Explore</Button>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="h-12 bg-gradient-to-b from-charcoal/5 to-transparent" aria-hidden="true" />

      <main id="main-content" className="mx-auto max-w-7xl px-6 lg:px-8 py-24">
        <div className="mb-16 text-center">
          <h2 className="text-sm tracking-[0.4em] uppercase text-muted-foreground mb-4">The Collection</h2>
          <div className="h-px w-24 bg-primary mx-auto opacity-50" />
        </div>

        <div className="columns-1 md:columns-2 lg:columns-3 gap-10 space-y-10">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} aria-label={\`View \${String(row.${cardTitle} ?? 'Untitled')}\`} className="group relative block overflow-hidden bg-muted transition-all duration-700 break-inside-avoid">
              <span className="sr-only">{String(row.${cardTitle} ?? 'Untitled')}</span>
              <div className="relative aspect-[4/5] overflow-hidden">
                ${imageBlock}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-center p-8 text-center">
                  <span className="bg-terracotta text-cream text-xs font-bold px-3 py-1 rounded-full mb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500">Featured</span>
                  <p className="text-white text-sm tracking-[0.2em] uppercase mb-4 translate-y-4 group-hover:translate-y-0 transition-transform duration-500 opacity-0 group-hover:opacity-100">View Detail</p>
                  <div className="h-px w-12 bg-white/40 mb-4" />
                  <h3 className="text-white text-2xl font-bold font-[family-name:var(--font-display)] italic translate-y-4 group-hover:translate-y-0 transition-transform duration-700 delay-75 opacity-0 group-hover:opacity-100">{String(row.${cardTitle} ?? 'Untitled')}</h3>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* hard section edge — no gradient bridge */}

      <section className="bg-charcoal text-cream py-32 border-y">
        <div className="max-w-4xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl font-bold font-[family-name:var(--font-display)] italic mb-6">Join the Registry</h2>
            <p className="text-lg text-cream/80 leading-relaxed">Receive our seasonal portfolios and exclusive updates on new collections.</p>
          </div>
          {subscribed ? (
            <div className="bg-cream/10 border border-cream/20 text-cream p-10 text-center animate-in slide-in-from-right duration-700">
              <p className="text-2xl font-bold">Successfully Registered</p>
              <p className="mt-2 opacity-80">Welcome to the inner circle.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <Input id="newsletter-email" type="email" placeholder="Email Address" className="h-16 rounded-none border-2 border-cream/20 bg-cream/10 text-cream placeholder:text-cream/50 focus:border-cream text-lg" />
              <Button size="lg" className="w-full h-16 rounded-none font-bold uppercase tracking-widest bg-terracotta text-cream hover:bg-terracotta/90 ${motionButtonClass(tokens)}" onClick={() => setSubscribed(true)}>Subscribe Now</Button>
            </div>
          )}
        </div>
      </section>

      <footer className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tighter mb-10">${appName}</h2>
          <nav aria-label="Footer navigation" className="flex justify-center gap-12 text-sm font-bold uppercase tracking-widest text-muted-foreground mb-12">
            <Link to="/about" className="hover:text-primary transition-colors">Inquiry</Link>
            <Link to="/contact" className="hover:text-primary transition-colors">Studio</Link>
          </nav>
          <p className="text-sm tracking-widest text-muted-foreground/80 uppercase">${tokens.textSlots.footer_tagline} / © 2026</p>
        </div>
      </footer>
    </div>
  )
}
`
}

function corporateHomepage(input: HomepageInput): string {
  const { tokens, appName, allPublicMeta, featured, ctaPath } = input
  const entity = featured?.table.name ?? 'items'
  const _entityTitle = featured?.pluralTitle ?? 'Items'
  const cardTitle = featured?.spec.detailPage.headerField ?? 'id'
  const detailPathBase = featured ? `${featured.routePrefix}/${featured.pluralKebab}` : '/'
  const imgField = featured ? imageColumn(featured.table) : null
  const metas = featured ? metadataColumns(featured.table, featured.spec).slice(0, 2) : []
  const metaLines = metas.map((field) => `<dd className="text-sm text-muted-foreground">{String(row.${field} ?? '—')}</dd>`).join('')
  const hero = tokens.heroImages[0]
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-48 w-full object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />`

  const nav = renderNavbar({
    appName,
    links,
    mobileLinks: mLinks,
    hasAuth: input.hasAuth,
    authButtonClass: 'shadow-lg shadow-primary/20',
    isHomepage: false,
    navStyle: 'corporate',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [subscribed, setSubscribed] = useState(false)
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${nav.hooks}
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground text-[16px]">
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] z-[100] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      ${nav.jsx}

      <div className="pt-20">
        <section className="bg-muted/30 py-32 lg:py-48 border-b">
          <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <h1 className="text-5xl lg:text-7xl font-bold font-[family-name:var(--font-display)] leading-[1.1] tracking-tight text-foreground">${tokens.textSlots.hero_headline}</h1>
              <p className="mt-8 text-xl text-muted-foreground leading-relaxed">${tokens.textSlots.hero_subtext}</p>
              <div className="mt-12 flex items-center gap-4">
                <Link to="${ctaPath}"><Button size="lg" className="h-14 px-8 rounded-xl font-bold shadow-xl shadow-primary/25 ${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
                <Button variant="outline" size="lg" className="h-14 px-8 rounded-xl font-bold" onClick={() => ping.mutate()}>View Demo</Button>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="relative">
              <div className="absolute -inset-4 bg-primary/10 rounded-3xl blur-3xl" />
              <div className="relative rounded-2xl overflow-hidden border border-border shadow-2xl">
                <img src="${hero?.url ?? 'https://picsum.photos/seed/corporate-hero/1200/900'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover" />
              </div>
            </motion.div>
          </div>
        </section>

        <div className="h-12 bg-gradient-to-b from-charcoal/5 to-transparent" aria-hidden="true" />

        <main id="main-content" className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-16">
            <h2 className="text-sm font-bold text-primary tracking-[0.2em] uppercase mb-4">Core Ecosystem</h2>
            <div className="flex items-end justify-between">
              <h3 className="text-4xl font-bold font-[family-name:var(--font-display)]">Featured Solutions</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {rows.map((row: Record<string, unknown>) => (
              <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="block">
                <Card className="rounded-2xl border-border/50 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 overflow-hidden bg-card">
                  <div className="relative">
                    ${imageBlock}
                    <span className="absolute top-3 left-3 bg-terracotta text-cream text-xs font-bold px-3 py-1 rounded-full">Featured</span>
                  </div>
                  <CardHeader className="pt-6">
                    <div className="flex gap-2 mb-2">
                      <div className="h-1 w-8 bg-primary rounded-full" />
                      <div className="h-1 w-2 bg-primary/30 rounded-full" />
                    </div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">{String(row.${cardTitle} ?? 'Untitled')}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-8">
                    <dl className="space-y-1 mt-4 border-t pt-4 text-sm">${metaLines}</dl>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </main>

        {/* hard section edge — no gradient bridge */}

        <section className="bg-charcoal text-white py-32">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl font-bold font-[family-name:var(--font-display)] mb-6 tracking-tight">Scale your impact today.</h2>
            <p className="text-xl text-white/80 mb-12">Connect with our strategic advisors to unlock the full potential of your operations.</p>
            {subscribed ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-10 backdrop-blur-md animate-in zoom-in duration-500">
                <p className="text-2xl font-bold">Request Received</p>
                <p className="mt-2 text-white/80">An advisor will be in touch shortly via your work email.</p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto">
                <label htmlFor="newsletter-email" className="sr-only">Email address</label>
                <Input id="newsletter-email" type="email" placeholder="Work Email" className="h-14 bg-white/5 border-white/10 rounded-xl px-6 text-lg text-white" />
                <Button size="lg" className="h-14 rounded-xl font-bold bg-white text-charcoal hover:bg-white/90 ${motionButtonClass(tokens)}" onClick={() => setSubscribed(true)}>Get Started</Button>
              </div>
            )}
          </div>
        </section>

        <footer className="py-24 border-t bg-muted/10 text-left">
          <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12">
            <div className="col-span-2">
              <h2 className="text-2xl font-bold mb-6 tracking-tighter">${appName}</h2>
              <p className="text-muted-foreground max-w-sm leading-relaxed">${tokens.textSlots.footer_tagline}</p>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-muted-foreground">Company</h4>
              <nav aria-label="Footer navigation" className="flex flex-col gap-4 text-sm text-muted-foreground">
                <Link to="/about" className="hover:text-primary transition-colors">About</Link>
                <Link to="/contact" className="hover:text-primary transition-colors">Contact</Link>
              </nav>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-muted-foreground">Resources</h4>
              <nav aria-label="Resources navigation" className="flex flex-col gap-4 text-sm text-muted-foreground">
                <Link to="/" className="hover:text-primary transition-colors">Support</Link>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
`
}

function softHomepage(input: HomepageInput): string {
  const { tokens, appName, allPublicMeta, featured, ctaPath } = input
  const entity = featured?.table.name ?? 'items'
  const entityTitle = featured?.pluralTitle ?? 'Items'
  const cardTitle = featured?.spec.detailPage.headerField ?? 'id'
  const detailPathBase = featured ? `${featured.routePrefix}/${featured.pluralKebab}` : '/'
  const imgField = featured ? imageColumn(featured.table) : null
  const hero = tokens.heroImages[0]
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-36 w-full object-cover rounded-2xl" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />`

  const nav = renderNavbar({
    appName,
    links,
    mobileLinks: mLinks,
    hasAuth: input.hasAuth,
    authButtonClass: 'rounded-full px-6 shadow-lg shadow-primary/10',
    isHomepage: false,
    navStyle: 'soft',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [subscribed, setSubscribed] = useState(false)
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${nav.hooks}
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground text-[16px]">
      ${nav.jsx}

      <div className="pt-20">
        <section className="mx-auto max-w-5xl ${spacingClass(tokens.style.spacing)} py-24 text-center">
          <h1 className="text-5xl md:text-7xl font-bold font-[family-name:var(--font-display)] leading-tight">${tokens.textSlots.hero_headline}</h1>
          <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">${tokens.textSlots.hero_subtext}</p>
          <div className="mt-10 flex justify-center gap-4">
            <Link to="${ctaPath}"><Button size="lg" className="h-14 px-8 rounded-full font-bold shadow-xl shadow-primary/20 ${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
            <Button variant="outline" size="lg" className="h-14 px-8 rounded-full font-bold" onClick={() => ping.mutate()}>Refresh</Button>
          </div>
          <div className="mt-16 mx-auto max-w-4xl rounded-3xl overflow-hidden border border-border shadow-2xl">
            <img src="${hero?.url ?? 'https://picsum.photos/seed/soft-hero/1200/700'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover" />
          </div>
        </section>

        <div className="h-12 bg-gradient-to-b from-charcoal/5 to-transparent" aria-hidden="true" />

        <main id="main-content" className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} pb-24">
          <div className="mb-12 flex items-center justify-between">
            <h2 className="text-3xl font-bold font-[family-name:var(--font-display)]">Featured ${entityTitle}</h2>
            <Button variant="ghost" className="text-muted-foreground hover:text-primary" onClick={() => ping.mutate()}>Refresh Feed</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {rows.map((row: Record<string, unknown>) => (
              <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="block">
                <Card className="rounded-3xl ${motionCardClass(tokens)} bg-accent/5 border-border/50 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      ${imageBlock}
                      <span className="absolute top-3 left-3 bg-terracotta text-cream text-xs font-bold px-3 py-1 rounded-full">Featured</span>
                    </div>
                    <div className="p-6 space-y-2">
                      <h3 className="text-xl font-bold font-[family-name:var(--font-display)] group-hover:text-primary transition-colors">{String(row.${cardTitle} ?? 'Untitled')}</h3>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </main>

        {/* hard section edge — no gradient bridge */}

        <section className="bg-charcoal text-cream py-32 border-y">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] mb-4">Stay in the Loop</h2>
            <p className="text-lg text-cream/80 mb-10">Subscribe to receive the latest updates and exclusive content.</p>
            {subscribed ? (
              <div className="bg-cream/10 border border-cream/20 rounded-2xl p-10 shadow-sm animate-in fade-in zoom-in duration-500">
                <p className="text-2xl font-bold text-cream">You're on the list!</p>
                <p className="mt-2 text-cream/80">Thank you for joining our community.</p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <label htmlFor="newsletter-email" className="sr-only">Email address</label>
                <Input id="newsletter-email" type="email" placeholder="Email Address" className="h-14 rounded-full px-6 bg-cream/10 border-cream/20 text-cream placeholder:text-cream/50" />
                <Button size="lg" className="h-14 rounded-full px-10 font-bold bg-terracotta text-cream hover:bg-terracotta/90 ${motionButtonClass(tokens)}" onClick={() => setSubscribed(true)}>Join</Button>
              </div>
            )}
          </div>
        </section>

        <footer className="bg-accent/5 py-20 border-t">
          <div className="max-w-7xl mx-auto px-6 text-center space-y-8">
            <h2 className="text-2xl font-bold tracking-tight">${appName}</h2>
            <nav aria-label="Footer navigation" className="flex justify-center gap-10 text-sm font-medium text-muted-foreground uppercase tracking-widest">
              <Link to="/about" className="hover:text-primary transition-colors">Story</Link>
              <Link to="/contact" className="hover:text-primary transition-colors">Contact</Link>
            </nav>
            <p className="text-sm text-muted-foreground opacity-60">${tokens.textSlots.footer_tagline} &mdash; © 2026</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
`
}

function dashboardHomepage(input: HomepageInput): string {
  const { tokens, appName, allPublicMeta, featured } = input
  const entity = featured?.table.name ?? 'items'
  const entityTitle = featured?.pluralTitle ?? 'Items'
  const cardTitle = featured?.spec.detailPage.headerField ?? 'id'
  const detailPathBase = featured ? `${featured.routePrefix}/${featured.pluralKebab}` : '/'
  const imgField = featured ? imageColumn(featured.table) : null
  const links = navLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-24 w-full object-cover rounded-lg" /> : null}`
    : ''

  return `import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [subscribed, setSubscribed] = useState(false)
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <header className="border-b py-4 md:hidden px-6 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <span className="font-bold text-lg">${appName}</span>
        ${input.hasAuth ? '<Link to="/auth/login"><Button variant="outline" size="sm">Sign in</Button></Link>' : ''}
      </header>

      <aside className="hidden md:flex md:w-72 md:flex-col gap-8 border-r p-8 bg-muted/20 sticky top-0 h-screen">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold">V</div>
          <h2 className="text-xl font-bold tracking-tight">${appName}</h2>
        </div>

        <nav className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 px-3">Main Menu</p>
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/5 text-primary font-semibold transition-all">Home</Link>
          <Link to="/_authenticated/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-all">Dashboard</Link>
          ${links}
        </nav>

        <div className="mt-auto pt-8 border-t">
          ${input.hasAuth ? '<Link to="/auth/login"><Button variant="default" size="lg" className="w-full justify-start gap-3 rounded-xl shadow-lg shadow-primary/10">Sign in</Button></Link>' : ''}
        </div>
      </aside>

      <main id="main-content" className="flex-1 ${spacingClass(tokens.style.spacing)} py-12 px-6 lg:px-12 space-y-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-10">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">Console Overview</h1>
            <p className="text-muted-foreground mt-1">Real-time performance and system metrics.</p>
          </div>
          <Button variant="outline" className="rounded-xl h-11 px-6 font-bold" onClick={() => ping.mutate()}>Refresh Telemetry</Button>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow"><CardContent className="pt-6"><p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Active Nodes</p><p className="text-3xl font-bold mt-2 tracking-tighter">{rows.length}</p></CardContent></Card>
          <Card className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow"><CardContent className="pt-6"><p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">System Architecture</p><p className="text-3xl font-bold mt-2 tracking-tighter text-primary">{tokens.name.replace('theme-', '')}</p></CardContent></Card>
          <Card className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow"><CardContent className="pt-6"><p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Current Scope</p><p className="text-3xl font-bold mt-2 tracking-tighter">${entityTitle}</p></CardContent></Card>
          <Card className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow"><CardContent className="pt-6"><p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Network Status</p><div className="flex items-center gap-2 mt-2"><div className="size-3 bg-green-500 rounded-full animate-pulse" /><p className="text-3xl font-bold tracking-tighter">Healthy</p></div></CardContent></Card>
        </section>

        <section className="space-y-6">
          <h3 className="text-xl font-bold text-foreground">Recent Activity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {rows.map((row: Record<string, unknown>) => (
              <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="block">
                <Card className="border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 bg-card/50 backdrop-blur-sm group">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors line-clamp-1">{String(row.${cardTitle} ?? 'Untitled')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div className="rounded-lg overflow-hidden border">
                      ${imageBlock}
                    </div>
                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/40 w-[60%]" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
`
}

function editorialPublicList(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const routePath = `/${meta.pluralKebab}/`
  const pascal = snakeToPascal(pluralize(entity))
  const titleField = meta.spec.detailPage.headerField ?? 'id'
  const imgField = imageColumn(meta.table)
  const metas = metadataColumns(meta.table, meta.spec).slice(0, 2)
  const metaLines = metas.map((field) => `<p className="text-sm text-muted-foreground">{String(row.${field} ?? '—')}</p>`).join('')
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />`

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'rounded-full px-6 shadow-lg shadow-primary/10',
    isHomepage: false, navStyle: 'editorial',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  const [search, setSearch] = useState('')
  ${nav.hooks}
  ${publicListQuery(entity)}
  const filtered = search ? rows.filter((row: Record<string, unknown>) => String(row.${titleField} ?? '').toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <main id="main-content" className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} pt-28 pb-16">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-4xl font-[family-name:var(--font-display)]">${meta.pluralTitle}</h1>
          <Input aria-label="Search" className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ${meta.pluralTitle.toLowerCase()}..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filtered.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"/${meta.pluralKebab}/" + String(row.id)} className="group block">
              <Card className="${cardClass(tokens)} ${motionCardClass(tokens)} overflow-hidden">
                <div className="aspect-[4/3] overflow-hidden">${imageBlock}</div>
                <CardHeader><CardTitle className="font-[family-name:var(--font-display)]">{String(row.${titleField} ?? 'Untitled')}</CardTitle></CardHeader>
                <CardContent className="space-y-1">${metaLines}</CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
`
}

function galleryPublicList(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const routePath = `/${meta.pluralKebab}/`
  const pascal = snakeToPascal(pluralize(entity))
  const titleField = meta.spec.detailPage.headerField ?? 'id'
  const imgField = imageColumn(meta.table)
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-full w-full object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover" />`

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'rounded-none border-2 border-primary hover:bg-primary hover:text-primary-foreground px-6 font-bold uppercase transition-all',
    isHomepage: false, navStyle: 'gallery',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  ${nav.hooks}
  ${publicListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <main id="main-content" className="mx-auto max-w-7xl ${spacingClass(tokens.style.spacing)} pt-28 pb-16">
        <h1 className="mb-6 text-xl uppercase tracking-wide text-muted-foreground">${meta.pluralTitle}</h1>
        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"/${meta.pluralKebab}/" + String(row.id)} aria-label={\`View \${String(row.${titleField} ?? 'Untitled')}\`} className="group relative block overflow-hidden rounded-[var(--radius)] break-inside-avoid">
              <span className="sr-only">{String(row.${titleField} ?? 'Untitled')}</span>
              ${imageBlock}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                <p className="text-white font-medium">{String(row.${titleField} ?? 'Untitled')}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
`
}

function corporatePublicList(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const routePath = `/${meta.pluralKebab}/`
  const pascal = snakeToPascal(pluralize(entity))
  const titleField = meta.spec.detailPage.headerField ?? 'id'
  const imgField = imageColumn(meta.table)
  const metas = metadataColumns(meta.table, meta.spec).slice(0, 2)
  const metaLines = metas.map((field) => `<dd className="text-sm text-muted-foreground">{String(row.${field} ?? '—')}</dd>`).join('')
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-48 w-full object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />`

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'shadow-lg shadow-primary/10',
    isHomepage: false, navStyle: 'corporate',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  const [search, setSearch] = useState('')
  ${nav.hooks}
  ${publicListQuery(entity)}
  const filtered = search ? rows.filter((row: Record<string, unknown>) => String(row.${titleField} ?? '').toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <main id="main-content" className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} pt-28 pb-16">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-3xl font-semibold">${meta.pluralTitle}</h1>
          <Input aria-label="Search" className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ${meta.pluralTitle.toLowerCase()}..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"/${meta.pluralKebab}/" + String(row.id)} className="block">
              <Card className="${cardClass(tokens)} ${motionCardClass(tokens)} shadow-sm hover:shadow-md overflow-hidden">
                ${imageBlock}
                <CardHeader><CardTitle>{String(row.${titleField} ?? 'Untitled')}</CardTitle></CardHeader>
                <CardContent><dl className="space-y-1">${metaLines}</dl></CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
`
}

function softPublicList(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const routePath = `/${meta.pluralKebab}/`
  const pascal = snakeToPascal(pluralize(entity))
  const titleField = meta.spec.detailPage.headerField ?? 'id'
  const imgField = imageColumn(meta.table)
  const metas = metadataColumns(meta.table, meta.spec).slice(0, 2)
  const metaLines = metas.map((field) => `<p className="text-sm text-muted-foreground">{String(row.${field} ?? '—')}</p>`).join('')
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-36 w-full object-cover rounded-2xl" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />`

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'rounded-full px-6 shadow-lg shadow-primary/10',
    isHomepage: false, navStyle: 'soft',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  const [search, setSearch] = useState('')
  ${nav.hooks}
  ${publicListQuery(entity)}
  const filtered = search ? rows.filter((row: Record<string, unknown>) => String(row.${titleField} ?? '').toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <main id="main-content" className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} pt-28 pb-16">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-3xl font-semibold">${meta.pluralTitle}</h1>
          <Input aria-label="Search" className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ${meta.pluralTitle.toLowerCase()}..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filtered.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"/${meta.pluralKebab}/" + String(row.id)} className="block">
                <Card className="rounded-2xl border border-border bg-accent/10 ${motionCardClass(tokens)}">
                  <CardContent className="pt-6 space-y-3">
                    ${imageBlock}
                    <h3 className="font-semibold">{String(row.${titleField} ?? 'Untitled')}</h3>
                    ${metaLines}
                  </CardContent>
                </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
`
}

function dashboardPublicList(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const routePath = `/${meta.pluralKebab}/`
  const pascal = snakeToPascal(pluralize(entity))
  const titleField = meta.spec.detailPage.headerField ?? 'id'
  const links = navLinks(allPublicMeta)

  return `import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  const [search, setSearch] = useState('')
  ${publicListQuery(entity)}
  const filtered = search ? rows.filter((row: Record<string, unknown>) => String(row.${titleField} ?? '').toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <header className="border-b py-4 md:hidden px-6 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <span className="font-bold text-lg">${appName}</span>
        ${input.hasAuth ? '<Link to="/auth/login"><Button variant="outline" size="sm">Sign in</Button></Link>' : ''}
      </header>

      <aside className="hidden md:flex md:w-72 md:flex-col gap-8 border-r p-8 bg-muted/20 sticky top-0 h-screen">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold">V</div>
          <h2 className="text-xl font-bold tracking-tight">${appName}</h2>
        </div>

        <nav className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 px-3">Catalog</p>
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-all">Home</Link>
          <Link to="/_authenticated/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-all">Dashboard</Link>
          ${links}
        </nav>

        <div className="mt-auto pt-8 border-t">
          ${input.hasAuth ? '<Link to="/auth/login"><Button variant="default" size="lg" className="w-full justify-start gap-3 rounded-xl shadow-lg shadow-primary/10">Sign in</Button></Link>' : ''}
        </div>
      </aside>

      <main id="main-content" className="flex-1 ${spacingClass(tokens.style.spacing)} py-12 px-6 lg:px-12 space-y-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-10">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">${meta.pluralTitle}</h1>
            <p className="text-muted-foreground mt-1">Explore and filter through the entire dataset.</p>
          </div>
          <Input aria-label="Search" className="max-w-xs h-11 rounded-xl shadow-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records..." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filtered.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"/${meta.pluralKebab}/" + String(row.id)} className="block">
              <Card className="border-border/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 bg-card group">
                <CardContent className="pt-6 pb-8 text-center">
                  <div className="size-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors text-primary font-bold">
                    {String(row.${titleField} ?? '0').charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-1">{String(row.${titleField} ?? 'Untitled')}</p>
                  <p className="text-sm text-muted-foreground mt-1 uppercase tracking-widest font-semibold">Active Record</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
`
}

function editorialPublicDetail(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `/${meta.pluralKebab}/$id`
  const listPath = `/${meta.pluralKebab}/`
  const imgField = imageColumn(meta.table)
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-sm uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<section className="space-y-2"><h2 className="text-xl font-[family-name:var(--font-display)]">${section.title}</h2><dl>${rows}</dl></section>`
  }).join('')

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'rounded-full px-6 shadow-lg shadow-primary/10',
    isHomepage: false, navStyle: 'editorial',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${nav.hooks}
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8 text-center text-muted-foreground">Loading...</div>
  if (error) return <div className="p-8 text-destructive text-center">{error.message}</div>
  if (!row) return <div className="p-8 text-center">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <main id="main-content" className="mx-auto max-w-3xl ${spacingClass(tokens.style.spacing)} pt-28 pb-16 space-y-12">
        ${imgField ? `{Boolean(row.${imgField}) && <img src={String(row.${imgField})} alt={String(row.${meta.spec.detailPage.headerField} ?? '')} className="w-full max-h-[70vh] object-cover rounded-[var(--radius)] shadow-xl" />}` : ''}
        <div className="space-y-4">
          <Link to="${listPath}" className="text-sm font-bold text-primary hover:underline uppercase tracking-widest">← Back to ${meta.pluralTitle}</Link>
          <h1 className="text-4xl md:text-6xl font-bold font-[family-name:var(--font-display)] tracking-tight">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
        </div>
        <div className="grid gap-12 text-lg leading-relaxed text-muted-foreground">
          ${sections}
        </div>
      </main>
    </div>
  )
}
`
}

function galleryPublicDetail(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `/${meta.pluralKebab}/$id`
  const listPath = `/${meta.pluralKebab}/`
  const imgField = imageColumn(meta.table)
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-sm uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<section className="space-y-2"><h2 className="text-xl font-[family-name:var(--font-display)]">${section.title}</h2><dl>${rows}</dl></section>`
  }).join('')

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'rounded-none border-2 border-primary hover:bg-primary hover:text-primary-foreground px-6 font-bold uppercase transition-all',
    isHomepage: false, navStyle: 'gallery',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${nav.hooks}
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-destructive text-center">{error.message}</div>
  if (!row) return <div className="p-8 text-center">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <div className="pt-20">
        ${imgField ? `{Boolean(row.${imgField}) ? <img src={String(row.${imgField})} alt={String(row.${meta.spec.detailPage.headerField} ?? '')} className="w-full max-h-[70vh] object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${id}/1800/1000\`} alt="" className="w-full max-h-[70vh] object-cover" />}` : `<img src={\`https://picsum.photos/seed/${entity}-\${id}/1800/1000\`} alt="" className="w-full max-h-[70vh] object-cover" />`}
        <main id="main-content" className="mx-auto max-w-4xl ${spacingClass(tokens.style.spacing)} py-16">
          <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-display)] italic tracking-tight">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
          <div className="h-px w-24 bg-primary my-8 opacity-50" />
          <div className="grid gap-12 text-lg text-muted-foreground leading-relaxed">
            ${sections}
          </div>
          <Link to="${listPath}" className="mt-12 inline-block font-bold uppercase tracking-widest hover:text-primary transition-colors underline underline-offset-8">← Back to collection</Link>
        </main>
      </div>
    </div>
  )
}
`
}

function corporatePublicDetail(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `/${meta.pluralKebab}/$id`
  const listPath = `/${meta.pluralKebab}/`
  const imgField = imageColumn(meta.table)
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-sm uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<div className="${cardClass(tokens)} p-4"><h3 className="font-semibold mb-2">${section.title}</h3><dl>${rows}</dl></div>`
  }).join('')

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'shadow-lg shadow-primary/10',
    isHomepage: false, navStyle: 'corporate',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${nav.hooks}
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>
  if (!row) return <div className="p-8">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <main id="main-content" className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} pt-28 pb-12 space-y-6">
        ${imgField ? `{Boolean(row.${imgField}) && <img src={String(row.${imgField})} alt={String(row.${meta.spec.detailPage.headerField} ?? '')} className="w-full max-h-96 object-cover rounded-[var(--radius)]" />}` : ''}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
          <Link to="${listPath}"><Button variant="outline" className="${motionButtonClass(tokens)}">Back</Button></Link>
        </div>
        <section className="grid md:grid-cols-2 gap-4">${sections}</section>
      </main>
    </div>
  )
}
`
}


function softPublicDetail(input: PublicInput): string {
  const { meta, tokens: _tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `/${meta.pluralKebab}/$id`
  const listPath = `/${meta.pluralKebab}/`
  const imgField = imageColumn(meta.table)
  const links = navLinks(allPublicMeta)
  const mLinks = mobileNavLinks(allPublicMeta)
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-sm uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<div className="rounded-2xl border border-border bg-accent/10 p-4"><h3 className="font-semibold mb-2">${section.title}</h3><dl>${rows}</dl></div>`
  }).join('')

  const nav = renderNavbar({
    appName, links, mobileLinks: mLinks, hasAuth: input.hasAuth,
    authButtonClass: 'rounded-full px-6 shadow-lg shadow-primary/10',
    isHomepage: false, navStyle: 'soft',
  })

  return `import { useState, useEffect } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'motion/react'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${nav.hooks}
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8 text-center text-muted-foreground">Loading detail...</div>
  if (error) return <div className="p-8 text-destructive text-center">{error.message}</div>
  if (!row) return <div className="p-8 text-center text-muted-foreground">Detail not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${nav.jsx}
      <main id="main-content" className="mx-auto max-w-4xl px-6 pt-28 pb-16 space-y-12">
        <div className="space-y-4">
          <Link to="${listPath}" className="text-sm font-bold text-primary hover:underline uppercase tracking-widest">← Back to collection</Link>
          <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-display)] tracking-tight">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
        </div>
        ${imgField ? `{Boolean(row.${imgField}) && <div className="rounded-3xl overflow-hidden border bg-muted shadow-2xl transition-all duration-700 hover:scale-[1.01]"><img src={String(row.${imgField})} alt={String(row.${meta.spec.detailPage.headerField} ?? '')} className="w-full max-h-[600px] object-cover" /></div>}` : ''}
        <div className="grid gap-10 leading-relaxed text-muted-foreground">
          ${sections}
        </div>
      </main>
    </div>
  )
}
`
}

function dashboardPublicDetail(input: PublicInput): string {
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `/${meta.pluralKebab}/$id`
  const listPath = `/${meta.pluralKebab}/`
  const links = navLinks(allPublicMeta)
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-sm uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<div className="border border-border/70 bg-card/70 backdrop-blur-md rounded-[var(--radius)] p-4"><h3 className="font-semibold mb-2">${section.title}</h3><dl>${rows}</dl></div>`
  }).join('')

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8 text-center text-muted-foreground">Loading detail...</div>
  if (error) return <div className="p-8 text-destructive text-center">{error.message}</div>
  if (!row) return <div className="p-8 text-center text-muted-foreground">Detail not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <header className="border-b py-4 md:hidden px-6 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <span className="font-bold text-lg">${appName}</span>
        ${input.hasAuth ? '<Link to="/auth/login"><Button variant="outline" size="sm">Sign in</Button></Link>' : ''}
      </header>

      <aside className="hidden md:flex md:w-72 md:flex-col gap-8 border-r p-8 bg-muted/20 sticky top-0 h-screen">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold">V</div>
          <h2 className="text-xl font-bold tracking-tight">${appName}</h2>
        </div>

        <nav className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 px-3">Navigation</p>
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-all">Home</Link>
          <Link to="/_authenticated/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-all">Dashboard</Link>
          ${links}
        </nav>

        <div className="mt-auto pt-8 border-t">
          ${input.hasAuth ? '<Link to="/auth/login"><Button variant="default" size="lg" className="w-full justify-start gap-3 rounded-xl shadow-lg shadow-primary/10">Sign in</Button></Link>' : ''}
        </div>
      </aside>

      <main id="main-content" className="flex-1 ${spacingClass(tokens.style.spacing)} py-12 px-6 lg:px-12 space-y-10">
        <div className="flex items-center justify-between border-b pb-10">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
            <p className="text-muted-foreground mt-1 text-sm uppercase tracking-widest font-semibold">Resource Record</p>
          </div>
          <Link to="${listPath}"><Button variant="outline" className="rounded-xl px-6 font-bold text-sm uppercase tracking-wider">← Back to list</Button></Link>
        </div>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">${sections}</section>
      </main>
    </div>
  )
}
`
}

export function renderHomepage(archetype: LayoutArchetype, input: HomepageInput): string {
  if (archetype === 'editorial') return editorialHomepage(input)
  if (archetype === 'gallery') return galleryHomepage(input)
  if (archetype === 'soft') return softHomepage(input)
  if (archetype === 'dashboard') return dashboardHomepage(input)
  return corporateHomepage(input)
}

export function renderPublicList(archetype: LayoutArchetype, input: PublicInput): string {
  if (archetype === 'editorial') return editorialPublicList(input)
  if (archetype === 'gallery') return galleryPublicList(input)
  if (archetype === 'soft') return softPublicList(input)
  if (archetype === 'dashboard') return dashboardPublicList(input)
  return corporatePublicList(input)
}

export function renderPublicDetail(archetype: LayoutArchetype, input: PublicInput): string {
  if (archetype === 'editorial') return editorialPublicDetail(input)
  if (archetype === 'gallery') return galleryPublicDetail(input)
  if (archetype === 'soft') return softPublicDetail(input)
  if (archetype === 'dashboard') return dashboardPublicDetail(input)
  return corporatePublicDetail(input)
}
