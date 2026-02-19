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
}

type PublicInput = CommonInput & {
  meta: RouteMetaLite
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
  return publicMetas.map((m) => `<Link to="/${m.pluralKebab}/">${m.pluralTitle}</Link>`).join('')
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
  const entityTitle = featured?.pluralTitle ?? 'Items'
  const cardTitle = featured?.spec.detailPage.headerField ?? 'id'
  const detailPathBase = featured ? `${featured.routePrefix}/${featured.pluralKebab}` : '/'
  const imgField = featured ? imageColumn(featured.table) : null
  const metas = featured ? metadataColumns(featured.table, featured.spec).slice(0, 2) : []
  const metaLines = metas.map((field) => `<p className="text-sm text-muted-foreground">{String(row.${field} ?? '—')}</p>`).join('')
  const hero = tokens.heroImages[0]
  const footerHero = tokens.heroImages[1]
  const links = navLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />`

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-5 text-center">
        <h2 className="text-2xl font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="mt-2 flex justify-center gap-6 text-sm"><Link to="/">Home</Link><Link to="/about">About</Link>${links}</div>
      </header>
      <section className="relative h-[70vh] overflow-hidden">
        <img src="${hero?.url ?? 'https://picsum.photos/seed/editorial-hero/1800/1000'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex items-center justify-center text-center ${spacingClass(tokens.style.spacing)}">
          <div className="max-w-3xl text-primary-foreground">
            <h1 className="text-4xl md:text-6xl font-[family-name:var(--font-display)]">${tokens.textSlots.hero_headline}</h1>
            <p className="mt-4 text-lg text-primary-foreground/90">${tokens.textSlots.hero_subtext}</p>
            <Link to="${ctaPath}"><Button className="mt-8 ${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
          </div>
        </div>
      </section>
      <main className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} py-14">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-[family-name:var(--font-display)]">Featured ${entityTitle}</h2>
          <Button variant="outline" className="${motionButtonClass(tokens)}" onClick={() => ping.mutate()}>Refresh</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="group block">
              <Card className="${cardClass(tokens)} ${motionCardClass(tokens)} overflow-hidden">
                <div className="aspect-[4/3] overflow-hidden">${imageBlock}</div>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-display)]">{String(row.${cardTitle} ?? 'Untitled')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">${metaLines}</CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {rows.length === 0 && <p className="mt-6 text-sm text-muted-foreground">${tokens.textSlots.empty_state}</p>}
      </main>
      <footer className="relative mt-16 border-t">
        <img src="${footerHero?.url ?? 'https://picsum.photos/seed/editorial-footer/1800/600'}" alt="${footerHero?.alt ?? 'Footer'}" className="h-52 w-full object-cover" />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-sm text-white">${tokens.textSlots.footer_tagline}</div>
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
  const hero = tokens.heroImages[0]
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-full w-full object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover" />`

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-4 px-6 flex items-center justify-between">
        <h2 className="font-semibold">${appName}</h2>
        <div className="flex gap-4 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <section className="relative h-screen overflow-hidden">
        <img src="${hero?.url ?? 'https://picsum.photos/seed/gallery-hero/1800/1200'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center ${spacingClass(tokens.style.spacing)}">
          <h1 className="text-5xl md:text-7xl text-white font-[family-name:var(--font-display)]">${tokens.textSlots.hero_headline}</h1>
          <p className="mt-4 text-white/90 max-w-2xl">${tokens.textSlots.hero_subtext}</p>
          <div className="mt-8 flex gap-3">
            <Link to="${ctaPath}"><Button className="${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
            <Button variant="secondary" className="${motionButtonClass(tokens)}" onClick={() => ping.mutate()}>Refresh</Button>
          </div>
        </div>
      </section>
      <main className="mx-auto max-w-7xl ${spacingClass(tokens.style.spacing)} py-14">
        <h2 className="mb-6 text-xl tracking-wide uppercase text-muted-foreground">Gallery</h2>
        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="group relative block overflow-hidden rounded-[var(--radius)] break-inside-avoid">
              ${imageBlock}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                <p className="text-white font-medium">{String(row.${cardTitle} ?? 'Untitled')}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <footer className="py-8 text-center text-sm">${tokens.textSlots.footer_tagline}</footer>
    </div>
  )
}
`
}

function corporateHomepage(input: HomepageInput): string {
  const { tokens, appName, allPublicMeta, featured, ctaPath } = input
  const entity = featured?.table.name ?? 'items'
  const entityTitle = featured?.pluralTitle ?? 'Items'
  const cardTitle = featured?.spec.detailPage.headerField ?? 'id'
  const detailPathBase = featured ? `${featured.routePrefix}/${featured.pluralKebab}` : '/'
  const imgField = featured ? imageColumn(featured.table) : null
  const metas = featured ? metadataColumns(featured.table, featured.spec).slice(0, 2) : []
  const metaLines = metas.map((field) => `<dd className="text-sm text-muted-foreground">{String(row.${field} ?? '—')}</dd>`).join('')
  const hero = tokens.heroImages[0]
  const links = navLinks(allPublicMeta)
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-48 w-full object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />`

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-4 px-6 flex items-center justify-between">
        <h2 className="font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="flex gap-4 text-sm"><Link to="/about">About</Link>${links}</div>
      </header>
      <section className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} py-16 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h1 className="text-4xl md:text-5xl font-[family-name:var(--font-display)]">${tokens.textSlots.hero_headline}</h1>
          <p className="mt-4 text-muted-foreground">${tokens.textSlots.hero_subtext}</p>
          <div className="mt-8 flex gap-3">
            <Link to="${ctaPath}"><Button className="${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
            <Button variant="outline" className="${motionButtonClass(tokens)}" onClick={() => ping.mutate()}>Refresh</Button>
          </div>
        </div>
        <div className="rounded-[var(--radius)] overflow-hidden border border-border">
          <img src="${hero?.url ?? 'https://picsum.photos/seed/corporate-hero/1200/900'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover" />
        </div>
      </section>
      <main className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} py-10">
        <h2 className="mb-6 text-2xl font-semibold">Featured ${entityTitle}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="block">
              <Card className="${cardClass(tokens)} ${motionCardClass(tokens)} shadow-sm hover:shadow-md overflow-hidden">
                ${imageBlock}
                <CardHeader><CardTitle>{String(row.${cardTitle} ?? 'Untitled')}</CardTitle></CardHeader>
                <CardContent><dl className="space-y-1">${metaLines}</dl></CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">${tokens.textSlots.footer_tagline}</footer>
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
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${cardTitle} ?? '')} className="h-36 w-full object-cover rounded-2xl" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />`

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-5 text-center">
        <h2 className="text-2xl font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="mt-2 flex justify-center gap-6 text-sm"><Link to="/about">About</Link>${links}</div>
      </header>
      <section className="mx-auto max-w-5xl ${spacingClass(tokens.style.spacing)} py-24 text-center">
        <h1 className="text-5xl font-[family-name:var(--font-display)]">${tokens.textSlots.hero_headline}</h1>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">${tokens.textSlots.hero_subtext}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="${ctaPath}"><Button className="${motionButtonClass(tokens)}">${tokens.textSlots.cta_label}</Button></Link>
          <Button variant="outline" className="${motionButtonClass(tokens)}" onClick={() => ping.mutate()}>Refresh</Button>
        </div>
        <div className="mt-10 mx-auto max-w-3xl rounded-2xl overflow-hidden border border-border">
          <img src="${hero?.url ?? 'https://picsum.photos/seed/soft-hero/1200/700'}" alt="${hero?.alt ?? 'Hero'}" className="h-full w-full object-cover" />
        </div>
      </section>
      <main className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} pb-16">
        <h2 className="mb-6 text-2xl font-semibold">Featured ${entityTitle}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="block">
              <Card className="rounded-2xl ${motionCardClass(tokens)} bg-accent/10 border border-border shadow-sm">
                <CardContent className="pt-6 space-y-3">
                  ${imageBlock}
                  <h3 className="font-semibold">{String(row.${cardTitle} ?? 'Untitled')}</h3>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      <footer className="bg-accent/5 py-10 text-center text-sm text-muted-foreground">${tokens.textSlots.footer_tagline}</footer>
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

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  ${homeListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="hidden md:flex md:w-64 md:flex-col gap-3 border-r p-6">
        <h2 className="text-xl font-semibold">${appName}</h2>
        <Link to="/">Home</Link>
        <Link to="/_authenticated/dashboard">Dashboard</Link>
        ${links}
      </aside>
      <main className="flex-1 ${spacingClass(tokens.style.spacing)} space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Overview</h1>
          <Button variant="outline" className="${motionButtonClass(tokens)}" onClick={() => ping.mutate()}>Refresh</Button>
        </div>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border border-border/70 bg-card/70 backdrop-blur-md"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Rows</p><p className="text-2xl font-semibold">{rows.length}</p></CardContent></Card>
          <Card className="border border-border/70 bg-card/70 backdrop-blur-md"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Theme</p><p className="text-2xl font-semibold">${tokens.name.replace('theme-', '')}</p></CardContent></Card>
          <Card className="border border-border/70 bg-card/70 backdrop-blur-md"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Entity</p><p className="text-2xl font-semibold">${entityTitle}</p></CardContent></Card>
          <Card className="border border-border/70 bg-card/70 backdrop-blur-md"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Status</p><p className="text-2xl font-semibold">Active</p></CardContent></Card>
        </section>
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"${detailPathBase}/" + String(row.id)} className="block">
              <Card className="border border-border/70 bg-card/70 backdrop-blur-md ${motionCardClass(tokens)}">
                <CardHeader><CardTitle className="text-base">{String(row.${cardTitle} ?? 'Untitled')}</CardTitle></CardHeader>
                <CardContent className="space-y-2">${imageBlock}</CardContent>
              </Card>
            </Link>
          ))}
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
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />`

  return `import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  const [search, setSearch] = useState('')
  ${publicListQuery(entity)}
  const filtered = search ? rows.filter((row: Record<string, unknown>) => String(row.${titleField} ?? '').toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-5 text-center">
        <h2 className="text-2xl font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="mt-2 flex justify-center gap-6 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <main className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-4xl font-[family-name:var(--font-display)]">${meta.pluralTitle}</h1>
          <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ${meta.pluralTitle.toLowerCase()}..." />
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
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-full w-full object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-full w-full object-cover" />`

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  ${publicListQuery(entity)}

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-4 px-6 flex items-center justify-between">
        <h2 className="font-semibold">${appName}</h2>
        <div className="flex gap-4 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <main className="mx-auto max-w-7xl ${spacingClass(tokens.style.spacing)} py-10">
        <h1 className="mb-6 text-xl uppercase tracking-wide text-muted-foreground">${meta.pluralTitle}</h1>
        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
          {rows.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"/${meta.pluralKebab}/" + String(row.id)} className="group relative block overflow-hidden rounded-[var(--radius)] break-inside-avoid">
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
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-48 w-full object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-48 w-full object-cover" />`

  return `import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}Page,
})

function ${pascal}Page() {
  const [search, setSearch] = useState('')
  ${publicListQuery(entity)}
  const filtered = search ? rows.filter((row: Record<string, unknown>) => String(row.${titleField} ?? '').toLowerCase().includes(search.toLowerCase())) : rows

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-4 px-6 flex items-center justify-between">
        <h2 className="font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="flex gap-4 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <main className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} py-12">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-3xl font-semibold">${meta.pluralTitle}</h1>
          <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ${meta.pluralTitle.toLowerCase()}..." />
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
  const imageBlock = imgField
    ? `{row.${imgField} ? <img src={String(row.${imgField})} alt={String(row.${titleField} ?? '')} className="h-36 w-full object-cover rounded-2xl" /> : <img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />}`
    : `<img src={\`https://picsum.photos/seed/${entity}-\${String(row.id)}/900/700\`} alt="" className="h-36 w-full object-cover rounded-2xl" />`

  return `import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-5 text-center">
        <h2 className="text-2xl font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="mt-2 flex justify-center gap-6 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <main className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} py-12">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-3xl font-semibold">${meta.pluralTitle}</h1>
          <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ${meta.pluralTitle.toLowerCase()}..." />
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
      <aside className="hidden md:flex md:w-64 md:flex-col gap-3 border-r p-6">
        <h2 className="text-xl font-semibold">${appName}</h2>
        <Link to="/">Home</Link>
        ${links}
      </aside>
      <main className="flex-1 ${spacingClass(tokens.style.spacing)} space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">${meta.pluralTitle}</h1>
          <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((row: Record<string, unknown>) => (
            <Link key={String(row.id)} to={"/${meta.pluralKebab}/" + String(row.id)} className="block">
              <Card className="border border-border/70 bg-card/70 backdrop-blur-md ${motionCardClass(tokens)}">
                <CardContent className="pt-4">
                  <p className="text-sm font-medium">{String(row.${titleField} ?? 'Untitled')}</p>
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
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<section className="space-y-2"><h2 className="text-xl font-[family-name:var(--font-display)]">${section.title}</h2><dl>${rows}</dl></section>`
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

  if (isPending) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>
  if (!row) return <div className="p-8">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-5 text-center">
        <h2 className="text-2xl font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="mt-2 flex justify-center gap-6 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <article className="mx-auto max-w-3xl ${spacingClass(tokens.style.spacing)} py-12 space-y-8">
        ${imgField ? `{Boolean(row.${imgField}) && <img src={String(row.${imgField})} alt={String(row.${meta.spec.detailPage.headerField} ?? '')} className="w-full max-h-[70vh] object-cover rounded-[var(--radius)]" />}` : ''}
        <h1 className="text-4xl font-[family-name:var(--font-display)]">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
        ${sections}
        <Link to="${listPath}"><Button variant="outline" className="${motionButtonClass(tokens)}">Back to ${meta.pluralTitle}</Button></Link>
      </article>
    </div>
  )
}
`
}

function galleryPublicDetail(input: PublicInput): string {
  const { meta, tokens } = input
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `/${meta.pluralKebab}/$id`
  const listPath = `/${meta.pluralKebab}/`
  const imgField = imageColumn(meta.table)

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>
  if (!row) return <div className="p-8">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      ${imgField ? `{Boolean(row.${imgField}) ? <img src={String(row.${imgField})} alt={String(row.${meta.spec.detailPage.headerField} ?? '')} className="w-full max-h-[70vh] object-cover" /> : <img src={\`https://picsum.photos/seed/${entity}-\${id}/1800/1000\`} alt="" className="w-full max-h-[70vh] object-cover" />}` : `<img src={\`https://picsum.photos/seed/${entity}-\${id}/1800/1000\`} alt="" className="w-full max-h-[70vh] object-cover" />`}
      <div className="mx-auto max-w-4xl ${spacingClass(tokens.style.spacing)} py-8">
        <h1 className="text-3xl font-semibold">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
        <p className="mt-3 text-sm text-muted-foreground">${tokens.textSlots.footer_tagline}</p>
        <Link to="${listPath}" className="mt-6 inline-block underline">Back to ${meta.pluralTitle}</Link>
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
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<div className="${cardClass(tokens)} p-4"><h3 className="font-semibold mb-2">${section.title}</h3><dl>${rows}</dl></div>`
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

  if (isPending) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>
  if (!row) return <div className="p-8">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-4 px-6 flex items-center justify-between">
        <h2 className="font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="flex gap-4 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <main className="mx-auto max-w-6xl ${spacingClass(tokens.style.spacing)} py-12 space-y-6">
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
  const { meta, tokens, appName, allPublicMeta } = input
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `/${meta.pluralKebab}/$id`
  const listPath = `/${meta.pluralKebab}/`
  const imgField = imageColumn(meta.table)
  const links = navLinks(allPublicMeta)
  const sections = meta.spec.detailPage.sections.map((section) => {
    const rows = section.fields.map((field) => `
              <div className="py-2 border-b last:border-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<div className="rounded-2xl border border-border bg-accent/10 p-4"><h3 className="font-semibold mb-2">${section.title}</h3><dl>${rows}</dl></div>`
  }).join('')

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>
  if (!row) return <div className="p-8">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b py-5 text-center">
        <h2 className="text-2xl font-semibold font-[family-name:var(--font-display)]">${appName}</h2>
        <div className="mt-2 flex justify-center gap-6 text-sm"><Link to="/">Home</Link>${links}</div>
      </header>
      <main className="mx-auto max-w-4xl ${spacingClass(tokens.style.spacing)} py-12 space-y-6">
        ${imgField ? `{Boolean(row.${imgField}) && <img src={String(row.${imgField})} alt={String(row.${meta.spec.detailPage.headerField} ?? '')} className="w-full max-h-96 object-cover rounded-2xl" />}` : ''}
        <h1 className="text-3xl font-semibold">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
        <section className="space-y-4">${sections}</section>
        <Link to="${listPath}" className="inline-block underline">Back to ${meta.pluralTitle}</Link>
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
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm mt-1">${displayExpr(field, 'row')}</dd>
              </div>`).join('')
    return `<div className="border border-border/70 bg-card/70 backdrop-blur-md rounded-[var(--radius)] p-4"><h3 className="font-semibold mb-2">${section.title}</h3><dl>${rows}</dl></div>`
  }).join('')

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  ${publicDetailQuery(entity)}

  if (isPending) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>
  if (!row) return <div className="p-8">Not found</div>

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="hidden md:flex md:w-64 md:flex-col gap-3 border-r p-6">
        <h2 className="text-xl font-semibold">${appName}</h2>
        <Link to="/">Home</Link>
        ${links}
      </aside>
      <main className="flex-1 ${spacingClass(tokens.style.spacing)} space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
          <Link to="${listPath}" className="underline">Back</Link>
        </div>
        <section className="grid md:grid-cols-2 gap-4">${sections}</section>
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
