import { formatCss, oklch as toOklch, parse as parseColor } from 'culori'
import type { SchemaContract, TableDef } from './schema-contract'
import { inferPageConfig, derivePageFeatureSpec, type PageFeatureSpec } from './agents/feature-schema'
import { pluralize, singularize, snakeToKebab, snakeToPascal, snakeToTitle } from './naming-utils'
import { deriveArchetype, renderHomepage, renderPublicDetail, renderPublicList } from './theme-layouts'

export interface TextSlots {
  hero_headline: string
  hero_subtext: string
  about_paragraph: string
  cta_label: string
  empty_state: string
  footer_tagline: string
}

export const DEFAULT_TEXT_SLOTS: TextSlots = {
  hero_headline: 'Welcome to your new app',
  hero_subtext: 'A modern web application built for speed and simplicity.',
  about_paragraph: 'This app was built with modern web technologies for a seamless experience. Browse, manage, and explore your data with a clean, purpose-built interface.',
  cta_label: 'Get started',
  empty_state: 'No items yet. Create your first one to get started.',
  footer_tagline: 'Built with care.',
}

export interface ThemeTokens {
  name: string
  fonts: { display: string; body: string; googleFontsUrl: string }
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
    borderRadius: string
    cardStyle: 'flat' | 'bordered' | 'elevated' | 'glass'
    navStyle: 'top-bar' | 'sidebar' | 'editorial' | 'minimal' | 'centered'
    heroLayout: 'fullbleed' | 'split' | 'centered' | 'editorial' | 'none'
    spacing: 'compact' | 'normal' | 'airy'
    motion: 'none' | 'subtle' | 'expressive'
    imagery: 'photography-heavy' | 'illustration' | 'minimal' | 'icon-focused'
  }
  authPosture: 'public' | 'private' | 'hybrid'
  heroImages: Array<{ url: string; alt: string; photographer: string }>
  heroQuery: string
  textSlots: TextSlots
}

export type RouteMeta = {
  table: TableDef
  spec: PageFeatureSpec
  isPrivate: boolean
  routePrefix: string
  folderPrefix: string
  pluralKebab: string
  singularTitle: string
  pluralTitle: string
}

type FormFieldMeta = {
  field: string
  label: string
  inputType: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'email' | 'url' | 'checkbox'
  placeholder?: string
  options: string[]
  refTable?: string
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

function isPrivateByTable(table: TableDef, tokens: ThemeTokens): boolean {
  if (tokens.authPosture === 'private') return true
  if (tokens.authPosture === 'public') return false

  const hasUserColumn = table.columns.some((column) => column.name === 'user_id')
  const hasAuthReference = table.columns.some((column) => column.references?.table === 'auth.users')
  const hasRlsAuthUid = (table.rlsPolicies ?? []).some((policy) => {
    const using = policy.using?.toLowerCase() ?? ''
    const withCheck = policy.withCheck?.toLowerCase() ?? ''
    return using.includes('auth.uid()') || withCheck.includes('auth.uid()')
  })

  return hasUserColumn || hasAuthReference || hasRlsAuthUid
}

function getDisplayExpr(field: { field: string; format: string }, rowVar: string): string {
  if (field.format === 'currency') return `{Number(${rowVar}.${field.field} ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}`
  if (field.format === 'date') return `{${rowVar}.${field.field} ? new Date(String(${rowVar}.${field.field})).toLocaleDateString() : '—'}`
  if (field.format === 'boolean') return `{${rowVar}.${field.field} ? 'Yes' : 'No'}`
  return `{String(${rowVar}.${field.field} ?? '—')}`
}

function deriveFormMeta(spec: PageFeatureSpec): { createFields: FormFieldMeta[]; editFields: FormFieldMeta[]; fkTables: string[] } {
  const createFields: FormFieldMeta[] = spec.listPage.createFormFields.map((field) => ({
    field: field.field,
    label: field.label,
    inputType: field.inputType,
    placeholder: field.placeholder,
    options: field.options,
    refTable: field.refTable,
  }))

  const optionsMap = new Map(createFields.map((field) => [field.field, field.options]))
  const editFields: FormFieldMeta[] = spec.detailPage.editFormFields.map((field) => ({
    field: field.field,
    label: field.label,
    inputType: field.inputType,
    placeholder: `Edit ${field.label.toLowerCase()}`,
    options: optionsMap.get(field.field) ?? [],
    refTable: field.refTable,
  }))

  const fkTables = Array.from(
    new Set(
      [...createFields, ...editFields]
        .map((field) => field.refTable)
        .filter((value): value is string => Boolean(value)),
    ),
  )

  return { createFields, editFields, fkTables }
}

function colorToOklch(color: string, fallback: string): string {
  const parsed = toOklch(parseColor(color) ?? parseColor(fallback)!)
  if (!parsed) return fallback
  return formatCss(parsed)
}

function buildThemePalette(tokens: ThemeTokens) {
  const primary = toOklch(parseColor(tokens.colors.primary) ?? parseColor('#2b6cb0')!)!
  const background = toOklch(parseColor(tokens.colors.background) ?? parseColor('#ffffff')!)!

  const primaryRing = formatCss({ mode: 'oklch', l: primary.l, c: Math.min(primary.c * 0.7, 0.2), h: primary.h })
  const secondaryFg = colorToOklch(tokens.colors.foreground, '#111111')
  const accentFg = colorToOklch(tokens.colors.foreground, '#111111')
  const mutedFg = formatCss({ mode: 'oklch', l: Math.max(background.l - 0.45, 0.35), c: 0.02, h: background.h ?? 0 })

  return {
    background: colorToOklch(tokens.colors.background, '#ffffff'),
    foreground: colorToOklch(tokens.colors.foreground, '#111111'),
    card: colorToOklch(tokens.colors.background, '#ffffff'),
    cardForeground: colorToOklch(tokens.colors.foreground, '#111111'),
    popover: colorToOklch(tokens.colors.background, '#ffffff'),
    popoverForeground: colorToOklch(tokens.colors.foreground, '#111111'),
    primary: colorToOklch(tokens.colors.primary, '#2b6cb0'),
    primaryForeground: colorToOklch(tokens.colors.primaryForeground, '#ffffff'),
    secondary: colorToOklch(tokens.colors.secondary, '#e5e7eb'),
    secondaryForeground: secondaryFg,
    muted: colorToOklch(tokens.colors.muted, '#f3f4f6'),
    mutedForeground: mutedFg,
    accent: colorToOklch(tokens.colors.accent, '#f59e0b'),
    accentForeground: accentFg,
    border: colorToOklch(tokens.colors.border, '#d1d5db'),
    input: colorToOklch(tokens.colors.border, '#d1d5db'),
    ring: primaryRing,
    darkBackground: formatCss({ mode: 'oklch', l: Math.max(background.l - 0.9, 0.08), c: Math.min(background.c + 0.01, 0.04), h: background.h ?? 0 }),
    darkForeground: 'oklch(0.96 0 0)',
    darkCard: formatCss({ mode: 'oklch', l: Math.max(background.l - 0.82, 0.12), c: Math.min(background.c + 0.01, 0.05), h: background.h ?? 0 }),
    darkPrimary: formatCss({ mode: 'oklch', l: Math.min(primary.l + 0.1, 0.8), c: Math.min(primary.c, 0.25), h: primary.h }),
    darkBorder: formatCss({ mode: 'oklch', l: 0.24, c: 0.02, h: background.h ?? 0 }),
    darkMuted: formatCss({ mode: 'oklch', l: 0.18, c: 0.02, h: background.h ?? 0 }),
    darkMutedForeground: 'oklch(0.62 0.01 250)',
  }
}

function themeCss(tokens: ThemeTokens): string {
  const pal = buildThemePalette(tokens)

  return `@import url('${tokens.fonts.googleFontsUrl}');

@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: ${pal.background};
  --color-foreground: ${pal.foreground};
  --color-card: ${pal.card};
  --color-card-foreground: ${pal.cardForeground};
  --color-popover: ${pal.popover};
  --color-popover-foreground: ${pal.popoverForeground};
  --color-primary: ${pal.primary};
  --color-primary-foreground: ${pal.primaryForeground};
  --color-secondary: ${pal.secondary};
  --color-secondary-foreground: ${pal.secondaryForeground};
  --color-muted: ${pal.muted};
  --color-muted-foreground: ${pal.mutedForeground};
  --color-accent: ${pal.accent};
  --color-accent-foreground: ${pal.accentForeground};
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-destructive-foreground: oklch(0.985 0 0);
  --color-border: ${pal.border};
  --color-input: ${pal.input};
  --color-ring: ${pal.ring};
  --radius: ${tokens.style.borderRadius};
  --font-display: '${tokens.fonts.display}', serif;
  --font-body: '${tokens.fonts.body}', sans-serif;
  --font-sans: var(--font-body);
}

.dark {
  --color-background: ${pal.darkBackground};
  --color-foreground: ${pal.darkForeground};
  --color-card: ${pal.darkCard};
  --color-card-foreground: ${pal.darkForeground};
  --color-popover: ${pal.darkCard};
  --color-popover-foreground: ${pal.darkForeground};
  --color-primary: ${pal.darkPrimary};
  --color-primary-foreground: oklch(0.10 0 0);
  --color-secondary: ${pal.darkMuted};
  --color-secondary-foreground: ${pal.darkForeground};
  --color-muted: ${pal.darkMuted};
  --color-muted-foreground: ${pal.darkMutedForeground};
  --color-accent: ${pal.darkMuted};
  --color-accent-foreground: ${pal.darkForeground};
  --color-border: ${pal.darkBorder};
  --color-input: ${pal.darkBorder};
  --color-ring: ${pal.ring};
}

* { @apply border-border; }

body {
  @apply bg-background text-foreground antialiased;
  font-family: var(--font-body);
}

h1,h2,h3,h4,h5,h6 {
  font-family: var(--font-display);
}
`
}

function escapeJsx(text: string): string {
  return text.replace(/[{}<>"'&]/g, (ch) => {
    switch (ch) {
      case '{': return '&#123;'
      case '}': return '&#125;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      case '&': return '&amp;'
      default: return ch
    }
  })
}

function aboutRoute(tokens: ThemeTokens, appName: string): string {
  return `import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  const ping = useMutation({ mutationFn: async () => supabase.auth.getSession() })
  useQuery({ queryKey: ['about', 'warm'], queryFn: async () => ({ ok: true }) })

  return (
    <div className="${spacingClass(tokens.style.spacing)}">
      <Card className="${cardClass(tokens)} ${motionCardClass(tokens)}">
        <CardHeader>
          <CardTitle className="text-3xl font-[family-name:var(--font-display)]">About ${appName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>${escapeJsx(tokens.textSlots.about_paragraph)}</p>
          <button className="underline ${motionButtonClass(tokens)}" onClick={() => ping.mutate()}>Check session</button>
        </CardContent>
      </Card>
    </div>
  )
}
`
}

function contactRoute(tokens: ThemeTokens): string {
  return `import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/contact')({
  component: ContactPage,
})

function ContactPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  useQuery({ queryKey: ['contact', 'warm'], queryFn: async () => ({ ok: true }) })

  const submit = useMutation({
    mutationFn: async () => {
      await supabase.auth.getSession()
      return { ok: true }
    },
  })

  return (
    <div className="${spacingClass(tokens.style.spacing)}">
      <Card className="${cardClass(tokens)} ${motionCardClass(tokens)}">
        <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your project" />
          <Button className="${motionButtonClass(tokens)}" onClick={() => submit.mutate()}>
            {submit.isPending ? 'Sending…' : 'Send message'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
`
}

function buildEntityListRoute(meta: RouteMeta, tokens: ThemeTokens): string {
  const entity = meta.table.name
  const pascalPlural = snakeToPascal(pluralize(entity))
  const routePath = `${meta.routePrefix}/${meta.pluralKebab}/`

  const tableColumns = meta.spec.listPage.columns
    .map((column) => `<th className="text-left text-xs uppercase tracking-wide text-muted-foreground">${column.label}</th>`)
    .join('')

  const tableCells = meta.spec.listPage.columns
    .map((column) => `<td className="py-3 pr-4">${getDisplayExpr(column, 'row')}</td>`)
    .join('')

  const { createFields, editFields, fkTables } = deriveFormMeta(meta.spec)

  return `import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type FieldMeta = {
  field: string
  label: string
  inputType: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'email' | 'url' | 'checkbox'
  placeholder?: string
  options: string[]
  refTable?: string
}

const createFields: FieldMeta[] = ${JSON.stringify(createFields, null, 2)}
const editFields: FieldMeta[] = ${JSON.stringify(editFields, null, 2)}
const fkTables: string[] = ${JSON.stringify(fkTables)}

export const Route = createFileRoute('${routePath}')({
  component: ${pascalPlural}ListPage,
})

function normalizePayload(values: Record<string, unknown>, fields: FieldMeta[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = values[field.field]
    if (raw === undefined || raw === null) continue
    if (field.inputType === 'checkbox') {
      out[field.field] = Boolean(raw)
      continue
    }
    if (field.inputType === 'number') {
      if (raw === '') continue
      const numeric = Number(raw)
      if (!Number.isNaN(numeric)) out[field.field] = numeric
      continue
    }
    const text = String(raw).trim()
    if (text === '') continue
    out[field.field] = text
  }
  return out
}

function ${pascalPlural}ListPage() {
  const queryClient = useQueryClient()
  const [createForm, setCreateForm] = useState<Record<string, unknown>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})

  const { data: rows = [], isPending, error } = useQuery({
    queryKey: ['${entity}', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const fkOptions = useQuery({
    queryKey: ['${entity}', 'fk-options'],
    queryFn: async () => {
      const result: Record<string, Array<Record<string, unknown>>> = {}
      await Promise.all(
        fkTables.map(async (tableName) => {
          const { data } = await supabase.from(tableName).select('*').limit(250)
          result[tableName] = data ?? []
        }),
      )
      return result
    },
    enabled: fkTables.length > 0,
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      setCreateForm({})
      queryClient.invalidateQueries({ queryKey: ['${entity}', 'list'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!editingId) return
      const { error } = await supabase.from('${entity}').update(payload).eq('id', editingId)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingId(null)
      setEditForm({})
      queryClient.invalidateQueries({ queryKey: ['${entity}', 'list'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('${entity}').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${entity}', 'list'] }),
  })

  const renderField = (
    field: FieldMeta,
    form: Record<string, unknown>,
    setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
  ) => {
    if (field.refTable) {
      const options = fkOptions.data?.[field.refTable] ?? []
      return (
        <div key={field.field} className="space-y-1">
          <label className="text-sm font-medium">{field.label}</label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form[field.field] ?? '')} onChange={(e) => setForm(prev => ({ ...prev, [field.field]: e.target.value }))}>
            <option value="">Select {field.label}</option>
            {options.map((row) => {
              const id = String(row.id ?? '')
              const label = String(row.name ?? row.title ?? row.slug ?? id)
              return <option key={id} value={id}>{label}</option>
            })}
          </select>
        </div>
      )
    }

    if (field.inputType === 'textarea') {
      return (
        <div key={field.field} className="space-y-1">
          <label className="text-sm font-medium">{field.label}</label>
          <Textarea value={String(form[field.field] ?? '')} onChange={(e) => setForm(prev => ({ ...prev, [field.field]: e.target.value }))} placeholder={field.placeholder} />
        </div>
      )
    }

    if (field.inputType === 'checkbox') {
      return (
        <div key={field.field} className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(form[field.field])} onChange={(e) => setForm(prev => ({ ...prev, [field.field]: e.target.checked }))} />
          <label className="text-sm font-medium">{field.label}</label>
        </div>
      )
    }

    if (field.inputType === 'select') {
      return (
        <div key={field.field} className="space-y-1">
          <label className="text-sm font-medium">{field.label}</label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form[field.field] ?? '')} onChange={(e) => setForm(prev => ({ ...prev, [field.field]: e.target.value }))}>
            <option value="">Select {field.label}</option>
            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      )
    }

    const inputType = field.inputType === 'number' ? 'number' : field.inputType === 'date' ? 'date' : field.inputType
    return (
      <div key={field.field} className="space-y-1">
        <label className="text-sm font-medium">{field.label}</label>
        <Input type={inputType} value={String(form[field.field] ?? '')} onChange={(e) => setForm(prev => ({ ...prev, [field.field]: e.target.value }))} placeholder={field.placeholder} />
      </div>
    )
  }

  if (isPending) return <div className="p-8">Loading ${meta.pluralTitle.toLowerCase()}...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>

  return (
    <div className="${spacingClass(tokens.style.spacing)} space-y-8">
      <Card className="${cardClass(tokens)} ${motionCardClass(tokens)}">
        <CardHeader>
          <CardTitle className="text-2xl">Create ${meta.singularTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(normalizePayload(createForm, createFields)) }}>
            {createFields.map((field) => renderField(field, createForm, setCreateForm))}
            <div className="md:col-span-2">
              <Button type="submit" className="${motionButtonClass(tokens)}" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create ${meta.singularTitle}'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="${cardClass(tokens)} ${motionCardClass(tokens)}">
        <CardHeader>
          <CardTitle className="text-2xl">${meta.pluralTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr>${tableColumns}<th></th></tr></thead>
              <tbody>
                {rows.map((row: Record<string, unknown>) => (
                  <tr key={String(row.id)} className="border-t">
                    ${tableCells}
                    <td className="py-3 text-right space-x-2">
                      <Link to={"${meta.routePrefix}/${meta.pluralKebab}/" + String(row.id)} className="underline">View</Link>
                      <Button variant="outline" size="sm" className="${motionButtonClass(tokens)}" onClick={() => {
                        setEditingId(String(row.id))
                        const next: Record<string, unknown> = {}
                        for (const field of editFields) next[field.field] = row[field.field]
                        setEditForm(next)
                      }}>Edit</Button>
                      <Button variant="outline" size="sm" className="${motionButtonClass(tokens)}" onClick={() => deleteMutation.mutate(String(row.id))}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editingId && (
        <Card className="${cardClass(tokens)} ${motionCardClass(tokens)}">
          <CardHeader><CardTitle>Edit ${meta.singularTitle}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(normalizePayload(editForm, editFields)) }}>
              {editFields.map((field) => renderField(field, editForm, setEditForm))}
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" className="${motionButtonClass(tokens)}" disabled={updateMutation.isPending}>Save</Button>
                <Button type="button" variant="outline" className="${motionButtonClass(tokens)}" onClick={() => { setEditingId(null); setEditForm({}) }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
`
}

function buildEntityDetailRoute(meta: RouteMeta, tokens: ThemeTokens): string {
  const entity = meta.table.name
  const pascal = snakeToPascal(singularize(entity))
  const routePath = `${meta.routePrefix}/${meta.pluralKebab}/$id`
  const listPath = `${meta.routePrefix}/${meta.pluralKebab}/`

  const sectionCards = meta.spec.detailPage.sections
    .map((section) => {
      const rows = section.fields.map((field) => `
              <div className="py-2 border-b">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">${field.label}</dt>
                <dd className="text-sm">${getDisplayExpr(field, 'row')}</dd>
              </div>`).join('')

      return `<Card className="${cardClass(tokens)} ${motionCardClass(tokens)}"><CardHeader><CardTitle>${section.title}</CardTitle></CardHeader><CardContent><dl>${rows}</dl></CardContent></Card>`
    })
    .join('')

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('${routePath}')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()

  const { data: row, isPending, error } = useQuery({
    queryKey: ['${entity}', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').eq('id', id).single()
      if (error) throw error
      return data as Record<string, unknown>
    },
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('${entity}').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['${entity}', 'list'] })
      window.location.href = '${listPath}'
    },
  })

  if (isPending) return <div className="p-8">Loading...</div>
  if (error) return <div className="p-8 text-destructive">{error.message}</div>
  if (!row) return <div className="p-8">Not found</div>

  return (
    <div className="${spacingClass(tokens.style.spacing)} space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{String(row.${meta.spec.detailPage.headerField} ?? '${meta.singularTitle}')}</h1>
        <div className="flex gap-2">
          <Link to="${listPath}" className="underline text-sm">Back</Link>
          <Button variant="outline" className="${motionButtonClass(tokens)}" onClick={() => remove.mutate()}>Delete</Button>
        </div>
      </div>
      ${sectionCards}
    </div>
  )
}
`
}

function loginRoute(tokens: ThemeTokens): string {
  return `import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/auth/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useQuery({ queryKey: ['auth', 'session'], queryFn: async () => supabase.auth.getSession() })

  const login = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    onSuccess: () => navigate({ to: '/_authenticated/dashboard' }),
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <Card className="w-full max-w-md ${cardClass(tokens)} ${motionCardClass(tokens)}">
        <CardHeader><CardTitle>Sign in</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          <Button className="w-full ${motionButtonClass(tokens)}" onClick={() => login.mutate()}>{login.isPending ? 'Signing in…' : 'Sign in'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
`
}

function authenticatedRoute(_tokens: ThemeTokens): string {
  return `import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/auth/login' })
  },
  component: () => <div className="min-h-screen bg-background text-foreground"><Outlet /></div>,
})
`
}

function dashboardRoute(meta: RouteMeta | null, tokens: ThemeTokens): string {
  const entity = meta?.table.name ?? 'items'
  const listPath = meta ? `${meta.routePrefix}/${meta.pluralKebab}/` : '/'
  const title = meta?.pluralTitle ?? 'Items'

  return `import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: rows = [] } = useQuery({
    queryKey: ['dashboard', '${entity}'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').limit(5)
      if (error) throw error
      return data ?? []
    },
  })

  const signOut = useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut()
    },
    onSuccess: () => {
      window.location.href = '/auth/login'
    },
  })

  return (
    <div className="${spacingClass(tokens.style.spacing)} space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <Button variant="outline" className="${motionButtonClass(tokens)}" onClick={() => signOut.mutate()}>Sign out</Button>
      </div>
      <Card className="${cardClass(tokens)} ${motionCardClass(tokens)}">
        <CardHeader><CardTitle>Recent ${title}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Use this area as your private overview.</p>
          <p className="text-sm">Rows loaded: {rows.length}</p>
          <Link to="${listPath}" className="underline text-sm">Go to list</Link>
        </CardContent>
      </Card>
    </div>
  )
}
`
}

export function generateThemedApp(contract: SchemaContract, tokens: ThemeTokens, appName: string): Record<string, string> {
  const files: Record<string, string> = {}
  const archetype = deriveArchetype(tokens)

  const metas: RouteMeta[] = contract.tables.map((table) => {
    const spec = derivePageFeatureSpec(inferPageConfig(table, contract), contract)
    const isPrivate = isPrivateByTable(table, tokens)
    const pluralKebab = snakeToKebab(pluralize(table.name))

    return {
      table,
      spec,
      isPrivate,
      routePrefix: isPrivate ? '/_authenticated' : '',
      folderPrefix: isPrivate ? `src/routes/_authenticated/${pluralKebab}` : `src/routes/${pluralKebab}`,
      pluralKebab,
      singularTitle: snakeToTitle(singularize(table.name)),
      pluralTitle: snakeToTitle(pluralize(table.name)),
    }
  })

  const allPublicMeta = metas.filter((meta) => !meta.isPrivate)
  const publicMeta = allPublicMeta[0] ?? null
  const ctaPath = publicMeta ? `/${publicMeta.pluralKebab}/` : (tokens.authPosture === 'public' ? '/' : '/auth/login')

  files['src/index.css'] = themeCss(tokens)
  files['src/routes/index.tsx'] = renderHomepage(archetype, {
    tokens,
    appName,
    allPublicMeta,
    featured: publicMeta,
    ctaPath,
  })
  files['src/routes/about.tsx'] = aboutRoute(tokens, appName)
  files['src/routes/contact.tsx'] = contactRoute(tokens)

  if (tokens.authPosture !== 'public') {
    files['src/routes/auth/login.tsx'] = loginRoute(tokens)
    files['src/routes/_authenticated/route.tsx'] = authenticatedRoute(tokens)
    files['src/routes/_authenticated/dashboard.tsx'] = dashboardRoute(metas.find((meta) => meta.isPrivate) ?? metas[0] ?? null, tokens)
  }

  for (const meta of metas) {
    if (meta.isPrivate) {
      // Private pages: CRUD admin table with create/edit/delete
      files[`${meta.folderPrefix}/index.tsx`] = buildEntityListRoute(meta, tokens)
      files[`${meta.folderPrefix}/$id.tsx`] = buildEntityDetailRoute(meta, tokens)
    } else {
      // Public pages: archetype-specific visual clone layouts
      files[`${meta.folderPrefix}/index.tsx`] = renderPublicList(archetype, {
        meta,
        tokens,
        appName,
        allPublicMeta,
      })
      files[`${meta.folderPrefix}/$id.tsx`] = renderPublicDetail(archetype, {
        meta,
        tokens,
        appName,
        allPublicMeta,
      })
    }
  }

  return files
}
