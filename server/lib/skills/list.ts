// server/lib/skills/list.ts
//
// List skill assemblers for Design Engine v2.
// Each function returns a complete React component as a TypeScript string.
// These are code generators — NOT JSX, but strings that will be written to files.

import { snakeToPascal, snakeToCamel, snakeToKebab, snakeToTitle, pluralize, singularize } from '../naming-utils'
import type { SkillProps } from './index'

// ── Card Grid ─────────────────────────────────────────────────────────────────

/**
 * Renders a 3-column responsive card grid.
 * Each card shows an image (if available), title, and up to 3 metadata fields.
 * Includes create dialog, delete button, and click-to-detail navigation.
 */
export function assembleCardGridPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const plural = pluralize(entity)
  const pluralTitle = snakeToTitle(plural)
  const singularTitle = snakeToTitle(singularize(entity))

  // Detect image field
  const allColumns = props.contract.tables.find(t => t.name === entity)?.columns ?? []
  const imageField = allColumns.find(c =>
    c.name.includes('image') || c.name.includes('photo') || c.name.includes('thumbnail') || c.name.includes('avatar')
  )?.name

  const headerFieldRef = spec.detailPage.headerField ?? spec.listPage.columns[0]?.field ?? 'id'

  // Non-auto-managed display fields (excluding id, created_at, updated_at, user_id, imageField, headerFieldRef)
  const autoManaged = new Set(['id', 'created_at', 'updated_at', 'user_id'])
  const cardFields = spec.listPage.columns
    .filter(c => !autoManaged.has(c.field) && c.field !== imageField && c.field !== headerFieldRef)
    .slice(0, 3)

  // Form fields for create dialog
  const formFields = spec.listPage.createFormFields

  // Collect unique FK tables for useQuery hooks
  const fkFields = formFields.filter(f => f.refTable)
  const uniqueFKTables = [...new Set(fkFields.map(f => f.refTable!))]

  // Build the form field JSX strings
  const formFieldsJSX = formFields.map(f => {
    if (f.refTable) {
      const queryVar = `${snakeToCamel(f.refTable)}Data`
      return `          <div>
            <label className="text-sm font-medium">${f.label}</label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))}>
              <option value="">Select ${snakeToTitle(singularize(f.refTable))}...</option>
              {(${queryVar}?.data ?? []).map((row: Record<string, unknown>) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.title ?? row.id)}</option>
              ))}
            </select>
          </div>`
    }
    if (f.inputType === 'textarea') {
      return `          <div>
            <label className="text-sm font-medium">${f.label}</label>
            <Textarea value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} placeholder="${f.placeholder}" />
          </div>`
    }
    if (f.inputType === 'select' && f.options.length > 0) {
      const opts = f.options.map(o => `              <option value="${o}">${o}</option>`).join('\n')
      return `          <div>
            <label className="text-sm font-medium">${f.label}</label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))}>
              <option value="">Select...</option>
${opts}
            </select>
          </div>`
    }
    return `          <div>
            <label className="text-sm font-medium">${f.label}</label>
            <Input type="${f.inputType === 'number' ? 'number' : 'text'}" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} placeholder="${f.placeholder}" />
          </div>`
  }).join('\n')

  // Build useQuery hooks for FK reference tables
  const fkQueryHooks = uniqueFKTables.map(table => {
    const queryVar = `${snakeToCamel(table)}Data`
    return `  const ${queryVar} = useQuery({
    queryKey: ['${table}', 'fk-options'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('id, name, title').order('name').limit(200)
      return data ?? []
    },
  })`
  }).join('\n')

  const cardBodyFields = cardFields.map(col => {
    if (col.format === 'currency') {
      return `              <p className="text-sm text-muted-foreground">${col.label}: {'$' + Number(item.${col.field} ?? 0).toFixed(2)}</p>`
    }
    if (col.format === 'date') {
      return `              <p className="text-sm text-muted-foreground">${col.label}: {item.${col.field} ? new Date(String(item.${col.field})).toLocaleDateString() : '—'}</p>`
    }
    return `              <p className="text-sm text-muted-foreground">{String(item.${col.field} ?? '—')}</p>`
  }).join('\n')

  const needsTextarea = formFields.some(f => f.inputType === 'textarea')
  const needsInput = formFields.some(f => !f.refTable && f.inputType !== 'textarea' && f.inputType !== 'select')

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'`,
    `import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'`,
    needsInput ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { Plus, Trash2 } from 'lucide-react'`,
  ].filter(Boolean).join('\n')

  const imageJSX = imageField
    ? `{item.${imageField} && (
                <div className="aspect-video overflow-hidden">
                  <img src={String(item.${imageField})} alt={String(item.${headerFieldRef} ?? '')} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}`
    : `<div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <span className="text-4xl font-bold text-primary/30">{String(item.${headerFieldRef} ?? '').charAt(0).toUpperCase()}</span>
              </div>`

  return `// Auto-generated by VibeStack Design Engine v2 — CardGrid skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}ListPage,
})

function ${pascal}ListPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: items = [], isPending, error } = useQuery({
    queryKey: ['${entity}'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('${entity}')
        .select('*')
        .order('${spec.listPage.sortDefault}', { ascending: ${spec.listPage.sortDirection === 'asc'} })
      if (error) throw error
      return data ?? []
    },
  })

  const create${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').insert(values)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setOpen(false); setForm({}) },
  })

  const delete${pascal} = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('${entity}').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${entity}'] }),
  })

${fkQueryHooks}

  if (isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading ${pluralTitle.toLowerCase()}...</p></div>
  if (error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {error.message}</p></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">${pluralTitle}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New ${singularTitle}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>New ${singularTitle}</DialogTitle>
              <DialogDescription className="sr-only">Create a new ${singularTitle}</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); create${pascal}.mutate(form) }}>
${formFieldsJSX}
              <Button type="submit" disabled={create${pascal}.isPending} className="w-full">
                {create${pascal}.isPending ? 'Creating...' : 'Create ${singularTitle}'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground mb-4">${spec.listPage.emptyStateMessage}</p>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add your first ${singularTitle.toLowerCase()}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item: Record<string, unknown>) => (
            <Card key={String(item.id)} className="overflow-hidden hover:shadow-lg transition-shadow group">
              ${imageJSX}
              <CardHeader className="pb-2">
                <CardTitle className="text-lg line-clamp-2">
                  <Link to="/${pluralKebab}/$id" params={{ id: String(item.id) }} className="hover:text-primary transition-colors">
                    {String(item.${headerFieldRef} ?? 'Untitled')}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
${cardBodyFields}
                <div className="pt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={e => { e.preventDefault(); delete${pascal}.mutate(String(item.id)) }}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
`
}

// ── Menu Grid ─────────────────────────────────────────────────────────────────

/**
 * Two-column menu layout for food/dish entities.
 * Left: name + description. Right: price.
 */
export function assembleMenuGridPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))

  const allColumns = props.contract.tables.find(t => t.name === entity)?.columns ?? []
  const priceField = allColumns.find(c => c.name.includes('price') || c.name.includes('cost'))?.name
  const descField = allColumns.find(c => c.name === 'description' || c.name === 'notes')?.name
  const headerField = spec.detailPage.headerField
  const formFields = spec.listPage.createFormFields
  const needsTextarea = formFields.some(f => f.inputType === 'textarea')
  const needsInput = formFields.some(f => !f.refTable && f.inputType !== 'textarea' && f.inputType !== 'select')

  const menuFKFields = formFields.filter(f => f.refTable)
  const menuUniqueFKTables = [...new Set(menuFKFields.map(f => f.refTable!))]

  const formFieldsJSX = formFields.map(f => {
    if (f.refTable) {
      const queryVar = `${snakeToCamel(f.refTable)}Data`
      return `          <div><label className="text-sm font-medium">${f.label}</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))}><option value="">Select ${snakeToTitle(singularize(f.refTable))}...</option>{(${queryVar}?.data ?? []).map((row: Record<string, unknown>) => (<option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.title ?? row.id)}</option>))}</select></div>`
    }
    if (f.inputType === 'textarea') {
      return `          <div><label className="text-sm font-medium">${f.label}</label><Textarea value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} placeholder="${f.placeholder}" /></div>`
    }
    return `          <div><label className="text-sm font-medium">${f.label}</label><Input type="${f.inputType === 'number' ? 'number' : 'text'}" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} placeholder="${f.placeholder}" /></div>`
  }).join('\n')

  const menuFKQueryHooks = menuUniqueFKTables.map(table => {
    const queryVar = `${snakeToCamel(table)}Data`
    return `  const ${queryVar} = useQuery({
    queryKey: ['${table}', 'fk-options'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('id, name, title').order('name').limit(200)
      return data ?? []
    },
  })`
  }).join('\n')

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'`,
    needsInput ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { Plus, Trash2 } from 'lucide-react'`,
  ].filter(Boolean).join('\n')

  const descJSX = descField
    ? `{item.${descField} && <p className="text-sm text-muted-foreground mt-1">{String(item.${descField})}</p>}`
    : ''

  const priceJSX = priceField
    ? `<span className="font-semibold text-lg">{'$'}{Number(item.${priceField} ?? 0).toFixed(2)}</span>`
    : ''

  return `// Auto-generated by VibeStack Design Engine v2 — MenuGrid skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}MenuPage,
})

function ${pascal}MenuPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: items = [], isPending, error } = useQuery({
    queryKey: ['${entity}'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const create${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').insert(values)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setOpen(false); setForm({}) },
  })

${menuFKQueryHooks}

  const delete${pascal} = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('${entity}').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${entity}'] }),
  })

  if (isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading menu...</p></div>
  if (error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {error.message}</p></div>

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">${pluralTitle}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New ${singularTitle}</DialogTitle><DialogDescription className="sr-only">Create a new ${singularTitle}</DialogDescription></DialogHeader>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); create${pascal}.mutate(form) }}>
${formFieldsJSX}
              <Button type="submit" disabled={create${pascal}.isPending} className="w-full">
                {create${pascal}.isPending ? 'Adding...' : 'Add Item'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground mb-4">No items yet. Add your first menu item.</p>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Item</Button>
        </div>
      ) : (
        <div className="divide-y">
          {items.map((item: Record<string, unknown>) => (
            <div key={String(item.id)} className="flex items-start justify-between py-4 group">
              <div className="flex-1">
                <Link to="/${pluralKebab}/$id" params={{ id: String(item.id) }} className="font-semibold text-lg hover:text-primary transition-colors">
                  {String(item.${headerField} ?? 'Untitled')}
                </Link>
                ${descJSX}
              </div>
              <div className="flex items-center gap-3 ml-4">
                ${priceJSX}
                <Button variant="ghost" size="sm" onClick={() => delete${pascal}.mutate(String(item.id))} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
`
}

// ── Magazine Grid ─────────────────────────────────────────────────────────────

/**
 * Editorial magazine layout: featured first article + secondary grid.
 * Classic magazine feel with large hero image and smaller article cards.
 */
export function assembleMagazineGridPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))
  const headerField = spec.detailPage.headerField

  const allColumns = props.contract.tables.find(t => t.name === entity)?.columns ?? []
  const imageField = allColumns.find(c => c.name.includes('image') || c.name.includes('cover') || c.name.includes('thumbnail'))?.name
  const excerptField = allColumns.find(c => c.name === 'excerpt' || c.name === 'summary' || c.name === 'description')?.name
  const dateField = allColumns.find(c => c.name.includes('published') || c.name.includes('created'))?.name ?? 'created_at'
  const formFields = spec.listPage.createFormFields
  const needsTextarea = formFields.some(f => f.inputType === 'textarea')
  const needsInput = formFields.some(f => !f.refTable && f.inputType !== 'textarea' && f.inputType !== 'select')

  const magFKFields = formFields.filter(f => f.refTable)
  const magUniqueFKTables = [...new Set(magFKFields.map(f => f.refTable!))]

  const formFieldsJSX = formFields.map(f => {
    if (f.refTable) {
      const queryVar = `${snakeToCamel(f.refTable)}Data`
      return `          <div><label className="text-sm font-medium">${f.label}</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))}><option value="">Select ${snakeToTitle(singularize(f.refTable))}...</option>{(${queryVar}?.data ?? []).map((row: Record<string, unknown>) => (<option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.title ?? row.id)}</option>))}</select></div>`
    }
    if (f.inputType === 'textarea') {
      return `          <div><label className="text-sm font-medium">${f.label}</label><Textarea value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} /></div>`
    }
    return `          <div><label className="text-sm font-medium">${f.label}</label><Input value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} placeholder="${f.placeholder}" /></div>`
  }).join('\n')

  const magFKQueryHooks = magUniqueFKTables.map(table => {
    const queryVar = `${snakeToCamel(table)}Data`
    return `  const ${queryVar} = useQuery({
    queryKey: ['${table}', 'fk-options'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('id, name, title').order('name').limit(200)
      return data ?? []
    },
  })`
  }).join('\n')

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'`,
    needsInput ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { Plus } from 'lucide-react'`,
  ].filter(Boolean).join('\n')

  const featuredImageJSX = imageField
    ? `{featured.${imageField} && <img src={String(featured.${imageField})} alt={String(featured.${headerField} ?? '')} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}`
    : ''

  const restImageJSX = imageField
    ? `{item.${imageField} && <img src={String(item.${imageField})} alt={String(item.${headerField} ?? '')} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}`
    : ''

  const excerptFeaturedJSX = excerptField
    ? `{featured.${excerptField} && <p className="text-white/80 mt-2 line-clamp-2">{String(featured.${excerptField})}</p>}`
    : ''

  const excerptRestJSX = excerptField
    ? `{item.${excerptField} && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{String(item.${excerptField})}</p>}`
    : ''

  const featuredBgClass = imageField ? '' : 'bg-gradient-to-br from-primary/20 to-primary/5'
  const restBgClass = imageField ? '' : 'bg-gradient-to-br from-muted to-muted/50'

  return `// Auto-generated by VibeStack Design Engine v2 — MagazineGrid skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}MagazinePage,
})

function ${pascal}MagazinePage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: items = [], isPending, error } = useQuery({
    queryKey: ['${entity}'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').order('${dateField}', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const create${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').insert(values)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setOpen(false); setForm({}) },
  })

${magFKQueryHooks}

  if (isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>
  if (error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {error.message}</p></div>

  const featured = items[0] as Record<string, unknown> | undefined
  const rest = items.slice(1) as Record<string, unknown>[]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">${pluralTitle}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New ${singularTitle}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>New ${singularTitle}</DialogTitle><DialogDescription className="sr-only">Create a new ${singularTitle}</DialogDescription></DialogHeader>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); create${pascal}.mutate(form) }}>
${formFieldsJSX}
              <Button type="submit" disabled={create${pascal}.isPending} className="w-full">
                {create${pascal}.isPending ? 'Publishing...' : 'Publish'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground mb-4">${spec.listPage.emptyStateMessage}</p>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Write your first ${singularTitle.toLowerCase()}</Button>
        </div>
      ) : (
        <>
          {featured && (
            <Link to="/${pluralKebab}/$id" params={{ id: String(featured.id) }} className="group block">
              <div className="relative overflow-hidden rounded-xl ${featuredBgClass} aspect-[16/7]">
                ${featuredImageJSX}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-8">
                  <p className="text-white/70 text-sm mb-2">{featured.${dateField} ? new Date(String(featured.${dateField})).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</p>
                  <h2 className="text-white text-3xl font-bold leading-tight group-hover:underline">{String(featured.${headerField} ?? 'Untitled')}</h2>
                  ${excerptFeaturedJSX}
                </div>
              </div>
            </Link>
          )}

          {rest.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rest.map((item) => (
                <Link key={String(item.id)} to="/${pluralKebab}/$id" params={{ id: String(item.id) }} className="group block space-y-3">
                  <div className="overflow-hidden rounded-lg aspect-video ${restBgClass}">
                    ${restImageJSX}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{item.${dateField} ? new Date(String(item.${dateField})).toLocaleDateString() : ''}</p>
                    <h3 className="font-semibold line-clamp-2 group-hover:text-primary transition-colors">{String(item.${headerField} ?? 'Untitled')}</h3>
                    ${excerptRestJSX}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
`
}

// ── Transaction Feed ──────────────────────────────────────────────────────────

/**
 * Finance transaction feed with date grouping and amount coloring.
 * Shows running total and color-codes positive/negative amounts.
 */
export function assembleTransactionFeedPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))
  const headerField = spec.detailPage.headerField

  const allColumns = props.contract.tables.find(t => t.name === entity)?.columns ?? []
  const amountField = allColumns.find(c => c.name.includes('amount') || c.name.includes('total') || c.name.includes('balance'))?.name
  const categoryField = allColumns.find(c => c.name === 'category' || c.name === 'type')?.name
  const dateField = allColumns.find(c => c.name.includes('date') || c.name.includes('created'))?.name ?? 'created_at'
  const formFields = spec.listPage.createFormFields

  const txFKFields = formFields.filter(f => f.refTable)
  const txUniqueFKTables = [...new Set(txFKFields.map(f => f.refTable!))]
  const needsInput = formFields.some(f => !f.refTable && f.inputType !== 'textarea' && f.inputType !== 'select')

  const formFieldsJSX = formFields.map(f => {
    if (f.refTable) {
      const queryVar = `${snakeToCamel(f.refTable)}Data`
      return `          <div><label className="text-sm font-medium">${f.label}</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))}><option value="">Select ${snakeToTitle(singularize(f.refTable))}...</option>{(${queryVar}?.data ?? []).map((row: Record<string, unknown>) => (<option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.title ?? row.id)}</option>))}</select></div>`
    }
    if (f.inputType === 'select' && f.options.length > 0) {
      const opts = f.options.map(o => `              <option value="${o}">${o}</option>`).join('\n')
      return `          <div><label className="text-sm font-medium">${f.label}</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))}><option value="">Select...</option>
${opts}
</select></div>`
    }
    return `          <div><label className="text-sm font-medium">${f.label}</label><Input type="${f.inputType === 'number' ? 'number' : 'text'}" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} placeholder="${f.placeholder}" /></div>`
  }).join('\n')

  const txFKQueryHooks = txUniqueFKTables.map(table => {
    const queryVar = `${snakeToCamel(table)}Data`
    return `  const ${queryVar} = useQuery({
    queryKey: ['${table}', 'fk-options'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('id, name, title').order('name').limit(200)
      return data ?? []
    },
  })`
  }).join('\n')

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Badge } from '@/components/ui/badge'`,
    `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'`,
    `import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'`,
    needsInput ? `import { Input } from '@/components/ui/input'` : null,
    `import { Plus, Trash2 } from 'lucide-react'`,
  ].filter(Boolean).join('\n')

  const totalLine = amountField
    ? `const total = items.reduce((sum, item) => sum + Number((item as Record<string, unknown>).${amountField} ?? 0), 0)`
    : `const total = 0`

  const totalCardJSX = amountField
    ? `<Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">${'$'}{total.toFixed(2)}</p>
          <p className="text-sm text-muted-foreground">{items.length} transactions</p>
        </CardContent>
      </Card>`
    : ''

  const amountJSX = amountField
    ? `<span className={\`font-semibold \${Number(item.${amountField} ?? 0) >= 0 ? 'text-green-600' : 'text-destructive'}\`}>
                  {Number(item.${amountField} ?? 0) >= 0 ? '+' : ''}{'$'}{Math.abs(Number(item.${amountField} ?? 0)).toFixed(2)}
                </span>`
    : ''

  const categoryJSX = categoryField
    ? `{item.${categoryField} && <> · <Badge variant="secondary">{String(item.${categoryField})}</Badge></>}`
    : ''

  return `// Auto-generated by VibeStack Design Engine v2 — TransactionFeed skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}FeedPage,
})

function ${pascal}FeedPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: items = [], isPending, error } = useQuery({
    queryKey: ['${entity}'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').order('${dateField}', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const create${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').insert(values)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setOpen(false); setForm({}) },
  })

  const delete${pascal} = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('${entity}').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${entity}'] }),
  })

${txFKQueryHooks}

  ${totalLine}

  if (isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>
  if (error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {error.message}</p></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">${pluralTitle}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New ${singularTitle}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>New ${singularTitle}</DialogTitle><DialogDescription className="sr-only">Create a new ${singularTitle}</DialogDescription></DialogHeader>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); create${pascal}.mutate(form) }}>
${formFieldsJSX}
              <Button type="submit" disabled={create${pascal}.isPending} className="w-full">
                {create${pascal}.isPending ? 'Adding...' : 'Add ${singularTitle}'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      ${totalCardJSX}

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground mb-4">${spec.listPage.emptyStateMessage}</p>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add your first ${singularTitle.toLowerCase()}</Button>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {items.map((item: Record<string, unknown>) => (
            <div key={String(item.id)} className="flex items-center justify-between p-4 hover:bg-muted/50 group">
              <div className="flex items-center gap-3">
                <div>
                  <Link to="/${pluralKebab}/$id" params={{ id: String(item.id) }} className="font-medium hover:text-primary transition-colors">
                    {String(item.${headerField} ?? 'Untitled')}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {item.${dateField} ? new Date(String(item.${dateField})).toLocaleDateString() : ''}
                    ${categoryJSX}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                ${amountJSX}
                <Button variant="ghost" size="sm" onClick={() => delete${pascal}.mutate(String(item.id))} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
`
}

// ── Author Profiles ───────────────────────────────────────────────────────────

/**
 * Profile cards for author/contributor entities.
 * Shows avatar, name, role, and bio in a grid layout.
 */
export function assembleAuthorProfilesPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))
  const headerField = spec.detailPage.headerField

  const allColumns = props.contract.tables.find(t => t.name === entity)?.columns ?? []
  const avatarField = allColumns.find(c => c.name.includes('avatar') || c.name.includes('photo') || c.name.includes('image'))?.name
  const bioField = allColumns.find(c => c.name === 'bio' || c.name === 'description' || c.name === 'about')?.name
  const roleField = allColumns.find(c => c.name === 'role' || c.name === 'title' || c.name === 'position')?.name
  const formFields = spec.listPage.createFormFields
  const needsTextarea = formFields.some(f => f.inputType === 'textarea')
  const needsInput = formFields.some(f => !f.refTable && f.inputType !== 'textarea' && f.inputType !== 'select')

  const apFKFields = formFields.filter(f => f.refTable)
  const apUniqueFKTables = [...new Set(apFKFields.map(f => f.refTable!))]

  const formFieldsJSX = formFields.map(f => {
    if (f.refTable) {
      const queryVar = `${snakeToCamel(f.refTable)}Data`
      return `          <div><label className="text-sm font-medium">${f.label}</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))}><option value="">Select ${snakeToTitle(singularize(f.refTable))}...</option>{(${queryVar}?.data ?? []).map((row: Record<string, unknown>) => (<option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.title ?? row.id)}</option>))}</select></div>`
    }
    if (f.inputType === 'textarea') {
      return `          <div><label className="text-sm font-medium">${f.label}</label><Textarea value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} /></div>`
    }
    return `          <div><label className="text-sm font-medium">${f.label}</label><Input value={String(form.${f.field} ?? '')} onChange={e => setForm(p => ({ ...p, ${f.field}: e.target.value }))} placeholder="${f.placeholder}" /></div>`
  }).join('\n')

  const apFKQueryHooks = apUniqueFKTables.map(table => {
    const queryVar = `${snakeToCamel(table)}Data`
    return `  const ${queryVar} = useQuery({
    queryKey: ['${table}', 'fk-options'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('id, name, title').order('name').limit(200)
      return data ?? []
    },
  })`
  }).join('\n')

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Card, CardContent } from '@/components/ui/card'`,
    `import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'`,
    needsInput ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { Plus } from 'lucide-react'`,
  ].filter(Boolean).join('\n')

  const avatarJSX = avatarField
    ? `{item.${avatarField} ? (
                    <img src={String(item.${avatarField})} alt={String(item.${headerField} ?? '')} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{String(item.${headerField} ?? '?').charAt(0).toUpperCase()}</span>
                  )}`
    : `<span className="text-2xl font-bold text-primary">{String(item.${headerField} ?? '?').charAt(0).toUpperCase()}</span>`

  const roleJSX = roleField
    ? `{item.${roleField} && <p className="text-sm text-muted-foreground">{String(item.${roleField})}</p>}`
    : ''

  const bioJSX = bioField
    ? `{item.${bioField} && <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{String(item.${bioField})}</p>}`
    : ''

  return `// Auto-generated by VibeStack Design Engine v2 — AuthorProfiles skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}ProfilesPage,
})

function ${pascal}ProfilesPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})

  const { data: items = [], isPending, error } = useQuery({
    queryKey: ['${entity}'],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const create${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').insert(values)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setOpen(false); setForm({}) },
  })

${apFKQueryHooks}

  if (isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>
  if (error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {error.message}</p></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">${pluralTitle}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add ${singularTitle}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>New ${singularTitle}</DialogTitle><DialogDescription className="sr-only">Create a new ${singularTitle}</DialogDescription></DialogHeader>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); create${pascal}.mutate(form) }}>
${formFieldsJSX}
              <Button type="submit" disabled={create${pascal}.isPending} className="w-full">
                {create${pascal}.isPending ? 'Adding...' : 'Add ${singularTitle}'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-muted-foreground mb-4">${spec.listPage.emptyStateMessage}</p>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add ${singularTitle.toLowerCase()}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item: Record<string, unknown>) => (
            <Card key={String(item.id)} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 text-center">
                <div className="mx-auto mb-4 h-20 w-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
                  ${avatarJSX}
                </div>
                <Link to="/${pluralKebab}/$id" params={{ id: String(item.id) }} className="font-semibold text-lg hover:text-primary transition-colors block">
                  {String(item.${headerField} ?? 'Unknown')}
                </Link>
                ${roleJSX}
                ${bioJSX}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
`
}
