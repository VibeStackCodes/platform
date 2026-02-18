// server/lib/skills/detail.ts
//
// Detail skill assembler — Design Engine v2.
// Each function returns a complete React component as a TypeScript string.

import { snakeToPascal, snakeToCamel, snakeToKebab, snakeToTitle, pluralize, singularize } from '../naming-utils'
import type { SkillProps } from './index'
import type { ColumnDef } from '../schema-contract'

/**
 * Given a list of columns, returns FK columns with explicit `references` to non-auth tables.
 * Only uses explicit references (not implicit _id naming) to avoid building Supabase joins
 * for columns that lack actual DB-level FK constraints.
 */
function detectFKColumnsForDetail(
  columns: ColumnDef[],
  _allTableNames: Set<string>,
): Array<{ field: string; alias: string; refTable: string }> {
  return columns
    .filter((c) => !c.primaryKey)
    .flatMap((c) => {
      // Only explicit FK references (skip auth.users — no join needed)
      if (c.references && c.references.table !== 'auth.users' && c.name.endsWith('_id')) {
        return [{ field: c.name, alias: c.name.replace(/_id$/, ''), refTable: c.references.table }]
      }
      return []
    })
}

/** Build Supabase select string that embeds FK display names */
function buildFKSelectStr(fkCols: Array<{ field: string; alias: string; refTable: string }>): string {
  if (fkCols.length === 0) return '*'
  const joins = fkCols.map((fk) => `${fk.alias}:${fk.refTable}!${fk.field}(id, name, title)`).join(', ')
  return `*, ${joins}`
}

// ============================================================================
// Shared helpers
// ============================================================================

/** Build edit field JSX for any inputType */
function buildEditFieldJSX(
  editFormFields: Array<{ field: string; label: string; inputType: string; refTable?: string }>,
  indent: string,
): string {
  return editFormFields
    .map((f) => {
      if (f.refTable) {
        const queryVar = `${snakeToCamel(f.refTable)}EditData`
        return `${indent}<div><label className="text-sm font-medium">${f.label}</label><select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(editForm.${f.field} ?? '')} onChange={e => setEditForm(p => ({ ...p, ${f.field}: e.target.value }))}><option value="">Select ${snakeToTitle(singularize(f.refTable))}...</option>{(${queryVar}?.data ?? []).map((row: Record<string, unknown>) => (<option key={String(row.id)} value={String(row.id)}>{String(row.name ?? row.title ?? row.id)}</option>))}</select></div>`
      }
      if (f.inputType === 'textarea') {
        return `${indent}<div><label className="text-sm font-medium">${f.label}</label><Textarea value={String(editForm.${f.field} ?? '')} onChange={e => setEditForm(p => ({ ...p, ${f.field}: e.target.value }))} /></div>`
      }
      if (f.inputType === 'select') {
        return `${indent}<div><label className="text-sm font-medium">${f.label}</label><Input value={String(editForm.${f.field} ?? '')} onChange={e => setEditForm(p => ({ ...p, ${f.field}: e.target.value }))} /></div>`
      }
      return `${indent}<div><label className="text-sm font-medium">${f.label}</label><Input type="${f.inputType}" value={String(editForm.${f.field} ?? '')} onChange={e => setEditForm(p => ({ ...p, ${f.field}: e.target.value }))} /></div>`
    })
    .join('\n')
}

/** Build useQuery hooks for FK reference tables in edit forms */
function buildEditFKQueryHooks(
  editFormFields: Array<{ field: string; refTable?: string }>,
): string {
  const fkFields = editFormFields.filter(f => f.refTable)
  const uniqueTables = [...new Set(fkFields.map(f => f.refTable!))]
  return uniqueTables.map(table => {
    const queryVar = `${snakeToCamel(table)}EditData`
    return `  const ${queryVar} = useQuery({
    queryKey: ['${table}', 'fk-options'],
    queryFn: async () => {
      const { data } = await supabase.from('${table}').select('id, name, title').order('name').limit(200)
      return data ?? []
    },
  })`
  }).join('\n')
}

/** Build detail section cards from spec */
function buildSectionCards(
  sections: Array<{ title: string; fields: Array<{ field: string; label: string; format: string }> }>,
  indent: string,
  fkFields: Set<string> = new Set(),
): string {
  return sections
    .map((section) => {
      const fields = section.fields
        .map((f) => {
          let value: string
          if (fkFields.has(f.field)) {
            // FK field — use embedded join alias (alias = field without _id suffix)
            const alias = f.field.replace(/_id$/, '')
            value = `{String((data.${alias} as Record<string, unknown>)?.name ?? (data.${alias} as Record<string, unknown>)?.title ?? data.${f.field} ?? '\u2014')}`
          } else if (f.format === 'currency') {
            value = `{'$' + Number(data.${f.field} ?? 0).toFixed(2)}`
          } else if (f.format === 'date') {
            value = `{data.${f.field} ? new Date(String(data.${f.field})).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '\u2014'}`
          } else if (f.format === 'boolean') {
            value = `{data.${f.field} ? 'Yes' : 'No'}`
          } else {
            value = `{String(data.${f.field} ?? '\u2014')}`
          }
          return `${indent}    <div>
${indent}      <p className="text-sm text-muted-foreground">${f.label}</p>
${indent}      <p className="font-medium">${value}</p>
${indent}    </div>`
        })
        .join('\n')
      return `${indent}  <div className="space-y-4">
${indent}    <h3 className="font-semibold text-lg border-b pb-2">${section.title}</h3>
${fields}
${indent}  </div>`
    })
    .join('\n')
}

/** Build edit init fields string for useState */
function buildEditInitFields(
  editFormFields: Array<{ field: string; label: string; inputType: string }>,
): string {
  return editFormFields.map((f) => `${f.field}: data.${f.field} ?? ''`).join(', ')
}

// ============================================================================
// 1. assembleProductDetailPage
// ============================================================================

/**
 * ProductDetail — large hero image on top (or gradient if no image field),
 * two-column layout: left=content, right=sidebar metadata. Edit button shows inline form.
 */
export function assembleProductDetailPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const camel = snakeToCamel(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const headerField = spec.detailPage.headerField

  const allColumns = props.contract.tables.find((t) => t.name === entity)?.columns ?? []
  const imageField = allColumns.find(
    (c) => c.name.includes('image') || c.name.includes('photo') || c.name.includes('cover'),
  )?.name
  const priceField = allColumns.find(
    (c) => c.name.includes('price') || c.name.includes('cost'),
  )?.name
  const descField = allColumns.find(
    (c) => c.name === 'description' || c.name === 'details' || c.name === 'notes',
  )?.name

  const allTableNames = new Set(props.contract.tables.map((t) => t.name))
  const fkCols = detectFKColumnsForDetail(allColumns, allTableNames)
  const fkFields = new Set(fkCols.map((fk) => fk.field))
  const selectStr = buildFKSelectStr(fkCols)

  const editFormFields = spec.detailPage.editFormFields
  const needsTextarea = editFormFields.some((f) => f.inputType === 'textarea')
  const needsInput = editFormFields.some((f) =>
    !f.refTable && ['text', 'number', 'email', 'url', 'date', 'select'].includes(f.inputType),
  )

  const editFieldsJSX = buildEditFieldJSX(editFormFields, '              ')
  const editInitFields = buildEditInitFields(editFormFields)
  const editFKHooks = buildEditFKQueryHooks(editFormFields)
  const sectionCards = buildSectionCards(spec.detailPage.sections, '        ', fkFields)

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'`,
    needsInput ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { ArrowLeft, Edit2, X } from 'lucide-react'`,
  ]
    .filter(Boolean)
    .join('\n')

  const imageBlock = imageField
    ? `      {data.${imageField} && (
        <div className="aspect-[16/7] overflow-hidden rounded-xl">
          <img src={String(data.${imageField})} alt={String(data.${headerField} ?? '')} className="w-full h-full object-cover" />
        </div>
      )}`
    : `      <div className="aspect-[16/7] rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        <span className="text-6xl font-bold text-primary/20">{String(data.${headerField} ?? '').charAt(0).toUpperCase()}</span>
      </div>`

  const priceBlock = priceField
    ? `          {data.${priceField} && <p className="text-2xl font-semibold text-primary mt-1">{'$'}{Number(data.${priceField}).toFixed(2)}</p>}`
    : ''

  const descBlock = descField
    ? `      {data.${descField} && <p className="text-muted-foreground leading-relaxed">{String(data.${descField})}</p>}`
    : ''

  return `// Auto-generated by VibeStack Design Engine v2 — ProductDetail skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}/$id')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string | number | boolean>>({})

  const ${camel} = useQuery({
    queryKey: ['${entity}', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('${selectStr}').eq('id', id).single()
      if (error) throw error
      return data as Record<string, unknown>
    },
  })

  const update${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setIsEditing(false) },
  })

${editFKHooks}

  if (${camel}.isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>
  if (${camel}.error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {${camel}.error.message}</p></div>
  if (!${camel}.data) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Not found</p></div>

  const data = ${camel}.data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/${pluralKebab}" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to ${pluralTitle}
        </Link>
      </div>

${imageBlock}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{String(data.${headerField} ?? 'Untitled')}</h1>
${priceBlock}
        </div>
        <Button variant={isEditing ? 'outline' : 'default'} onClick={() => {
          if (!isEditing) setEditForm({ ${editInitFields} })
          setIsEditing(!isEditing)
        }}>
          {isEditing ? <><X className="h-4 w-4 mr-2" />Cancel</> : <><Edit2 className="h-4 w-4 mr-2" />Edit</>}
        </Button>
      </div>

${descBlock}

      {isEditing ? (
        <Card>
          <CardHeader><CardTitle>Edit ${singularTitle}</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); update${pascal}.mutate(editForm) }}>
${editFieldsJSX}
              <div className="flex gap-2">
                <Button type="submit" disabled={update${pascal}.isPending}>
                  {update${pascal}.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
${sectionCards}
        </div>
      )}
    </div>
  )
}
`
}

// ============================================================================
// 2. assembleArticleReaderPage
// ============================================================================

/**
 * ArticleReader — full-width reading experience with typography focus.
 */
export function assembleArticleReaderPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const camel = snakeToCamel(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const headerField = spec.detailPage.headerField

  const allColumns = props.contract.tables.find((t) => t.name === entity)?.columns ?? []
  const bodyField = allColumns.find(
    (c) => c.name === 'body' || c.name === 'content' || c.name === 'text',
  )?.name
  const authorField = allColumns.find(
    (c) => c.name === 'author' || c.name === 'author_name',
  )?.name
  const dateField =
    allColumns.find(
      (c) => c.name.includes('published') || c.name.includes('created'),
    )?.name ?? 'created_at'
  const imageField = allColumns.find(
    (c) =>
      c.name.includes('image') || c.name.includes('cover') || c.name.includes('thumbnail'),
  )?.name

  const allTableNames = new Set(props.contract.tables.map((t) => t.name))
  const fkCols = detectFKColumnsForDetail(allColumns, allTableNames)
  const fkFields = new Set(fkCols.map((fk) => fk.field))
  const selectStr = buildFKSelectStr(fkCols)

  const editFormFields = spec.detailPage.editFormFields
  const needsTextarea = editFormFields.some((f) => f.inputType === 'textarea')

  const editFieldsJSX = buildEditFieldJSX(editFormFields, '              ')
  const editInitFields = buildEditInitFields(editFormFields)
  const editFKHooksArticle = buildEditFKQueryHooks(editFormFields)

  // Build static metadata section from spec (avoid JSON.stringify in generated file)
  const metaFields = spec.detailPage.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.field !== headerField && (!bodyField || f.field !== bodyField))

  const metaFieldsJSX = metaFields
    .map((f) => {
      let valueExpr: string
      if (fkFields.has(f.field)) {
        const alias = f.field.replace(/_id$/, '')
        valueExpr = `{String((data.${alias} as Record<string, unknown>)?.name ?? (data.${alias} as Record<string, unknown>)?.title ?? data.${f.field} ?? '\u2014')}`
      } else {
        valueExpr = `{String(data.${f.field} ?? '\u2014')}`
      }
      return `              <div>
                <p className="text-sm text-muted-foreground">${f.label}</p>
                <p className="font-medium">${valueExpr}</p>
              </div>`
    })
    .join('\n')

  const needsInputArticle = editFormFields.some((f) =>
    !f.refTable && ['text', 'number', 'email', 'url', 'date', 'select'].includes(f.inputType),
  )

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'`,
    needsInputArticle ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { ArrowLeft, Edit2, X } from 'lucide-react'`,
  ]
    .filter(Boolean)
    .join('\n')

  const imageBlock = imageField
    ? `      {data.${imageField} && (
        <div className="aspect-[21/9] overflow-hidden rounded-xl">
          <img src={String(data.${imageField})} alt={String(data.${headerField} ?? '')} className="w-full h-full object-cover" />
        </div>
      )}`
    : ''

  const authorBlock = authorField
    ? `          {data.${authorField} && <span>By {String(data.${authorField})}</span>}
          {data.${authorField} && <span>\u00b7</span>}`
    : ''

  const bodyBlock = bodyField
    ? `          {data.${bodyField} && (
            <div className="prose prose-lg max-w-none">
              <p className="whitespace-pre-wrap leading-relaxed">{String(data.${bodyField})}</p>
            </div>
          )}`
    : ''

  const metaSection =
    metaFieldsJSX.length > 0
      ? `          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
${metaFieldsJSX}
          </div>`
      : ''

  return `// Auto-generated by VibeStack Design Engine v2 — ArticleReader skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}/$id')({
  component: ${pascal}ReaderPage,
})

function ${pascal}ReaderPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string | number | boolean>>({})

  const ${camel} = useQuery({
    queryKey: ['${entity}', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('${selectStr}').eq('id', id).single()
      if (error) throw error
      return data as Record<string, unknown>
    },
  })

  const update${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setIsEditing(false) },
  })

  ${editFKHooksArticle}

  if (${camel}.isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>
  if (${camel}.error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {${camel}.error.message}</p></div>
  if (!${camel}.data) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Not found</p></div>

  const data = ${camel}.data

  return (
    <article className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <Link to="/${pluralKebab}" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to ${pluralTitle}
        </Link>
        <Button variant={isEditing ? 'outline' : 'ghost'} size="sm" onClick={() => {
          if (!isEditing) setEditForm({ ${editInitFields} })
          setIsEditing(!isEditing)
        }}>
          {isEditing ? <><X className="h-4 w-4 mr-1" />Cancel</> : <><Edit2 className="h-4 w-4 mr-1" />Edit</>}
        </Button>
      </div>

${imageBlock}

      <header className="space-y-3">
        <h1 className="text-4xl font-bold leading-tight">{String(data.${headerField} ?? 'Untitled')}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
${authorBlock}
          {data.${dateField} ? new Date(String(data.${dateField})).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
        </div>
      </header>

      {isEditing ? (
        <Card>
          <CardHeader><CardTitle>Edit ${singularTitle}</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); update${pascal}.mutate(editForm) }}>
${editFieldsJSX}
              <div className="flex gap-2">
                <Button type="submit" disabled={update${pascal}.isPending}>{update${pascal}.isPending ? 'Saving...' : 'Save'}</Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
${bodyBlock}
${metaSection}
        </>
      )}
    </article>
  )
}
`
}

// ============================================================================
// 3. assembleProfileCardPage
// ============================================================================

/**
 * ProfileCard — profile/bio page for author/person entities.
 */
export function assembleProfileCardPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const camel = snakeToCamel(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const headerField = spec.detailPage.headerField

  const allColumns = props.contract.tables.find((t) => t.name === entity)?.columns ?? []
  const avatarField = allColumns.find(
    (c) =>
      c.name.includes('avatar') || c.name.includes('photo') || c.name.includes('image'),
  )?.name
  const bioField = allColumns.find(
    (c) => c.name === 'bio' || c.name === 'about' || c.name === 'description',
  )?.name
  const roleField = allColumns.find(
    (c) => c.name === 'role' || c.name === 'title' || c.name === 'position',
  )?.name
  const emailField = allColumns.find((c) => c.name === 'email')?.name
  const websiteField = allColumns.find(
    (c) => c.name.includes('website') || c.name.includes('url'),
  )?.name

  const editFormFields = spec.detailPage.editFormFields
  const needsTextarea = editFormFields.some((f) => f.inputType === 'textarea')
  const needsInputProfile = editFormFields.some((f) =>
    !f.refTable && ['text', 'number', 'email', 'url', 'date', 'select'].includes(f.inputType),
  )

  const editFieldsJSX = buildEditFieldJSX(editFormFields, '              ')
  const editInitFields = buildEditInitFields(editFormFields)
  const editFKHooksProfile = buildEditFKQueryHooks(editFormFields)

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'`,
    needsInputProfile ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { ArrowLeft, Edit2, Mail, Globe } from 'lucide-react'`,
  ]
    .filter(Boolean)
    .join('\n')

  const avatarBlock = avatarField
    ? `          {data.${avatarField} ? (
            <img src={String(data.${avatarField})} alt={String(data.${headerField} ?? '')} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-primary">{String(data.${headerField} ?? '?').charAt(0).toUpperCase()}</span>
          )}`
    : `          <span className="text-3xl font-bold text-primary">{String(data.${headerField} ?? '?').charAt(0).toUpperCase()}</span>`

  const roleBlock = roleField
    ? `          {data.${roleField} && <p className="text-muted-foreground">{String(data.${roleField})}</p>}`
    : ''

  const emailBlock = emailField
    ? `            {data.${emailField} && <a href={\`mailto:\${String(data.${emailField})}\`} className="flex items-center gap-1 text-sm text-primary hover:underline"><Mail className="h-3 w-3" />{String(data.${emailField})}</a>}`
    : ''

  const websiteBlock = websiteField
    ? `            {data.${websiteField} && <a href={String(data.${websiteField})} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline"><Globe className="h-3 w-3" />Website</a>}`
    : ''

  const bioBlock = bioField
    ? `      {data.${bioField} && <p className="text-muted-foreground leading-relaxed">{String(data.${bioField})}</p>}`
    : ''

  return `// Auto-generated by VibeStack Design Engine v2 — ProfileCard skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}/$id')({
  component: ${pascal}ProfilePage,
})

function ${pascal}ProfilePage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string | number | boolean>>({})

  const ${camel} = useQuery({
    queryKey: ['${entity}', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').eq('id', id).single()
      if (error) throw error
      return data as Record<string, unknown>
    },
  })

  const update${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setIsEditing(false) },
  })

  ${editFKHooksProfile}

  if (${camel}.isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>
  if (${camel}.error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {${camel}.error.message}</p></div>
  if (!${camel}.data) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Not found</p></div>

  const data = ${camel}.data

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/${pluralKebab}" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to ${pluralTitle}
      </Link>

      <div className="flex items-start gap-6">
        <div className="h-24 w-24 rounded-full overflow-hidden bg-primary/10 flex-shrink-0 flex items-center justify-center">
${avatarBlock}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{String(data.${headerField} ?? 'Unknown')}</h1>
${roleBlock}
          <div className="flex gap-3 mt-2">
${emailBlock}
${websiteBlock}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          if (!isEditing) setEditForm({ ${editInitFields} })
          setIsEditing(!isEditing)
        }}>
          <Edit2 className="h-4 w-4 mr-1" />{isEditing ? 'Cancel' : 'Edit'}
        </Button>
      </div>

${bioBlock}

      {isEditing && (
        <Card>
          <CardHeader><CardTitle>Edit ${singularTitle}</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); update${pascal}.mutate(editForm) }}>
${editFieldsJSX}
              <div className="flex gap-2">
                <Button type="submit" disabled={update${pascal}.isPending}>{update${pascal}.isPending ? 'Saving...' : 'Save'}</Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
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

// ============================================================================
// 4. assembleAppointmentCardPage
// ============================================================================

/**
 * AppointmentCard — appointment/booking detail with date/time prominence and status badge.
 */
export function assembleAppointmentCardPage(props: SkillProps): string {
  const { entity, spec } = props
  const pascal = snakeToPascal(entity)
  const camel = snakeToCamel(entity)
  const pluralKebab = snakeToKebab(pluralize(entity))
  const singularTitle = snakeToTitle(singularize(entity))
  const pluralTitle = snakeToTitle(pluralize(entity))
  const headerField = spec.detailPage.headerField

  const allColumns = props.contract.tables.find((t) => t.name === entity)?.columns ?? []
  const dateField = allColumns.find(
    (c) =>
      c.name.includes('scheduled') ||
      c.name.includes('appointment') ||
      c.name.includes('date') ||
      c.name.includes('starts'),
  )?.name
  const statusField = allColumns.find((c) => c.name === 'status')?.name
  const notesField = allColumns.find(
    (c) => c.name === 'notes' || c.name === 'description',
  )?.name

  const editFormFields = spec.detailPage.editFormFields
  const needsTextarea = editFormFields.some((f) => f.inputType === 'textarea')
  const needsInputAppt = editFormFields.some((f) =>
    !f.refTable && ['text', 'number', 'email', 'url', 'date', 'select'].includes(f.inputType),
  )

  const editFieldsJSX = buildEditFieldJSX(editFormFields, '              ')
  const editInitFields = buildEditInitFields(editFormFields)
  const editFKHooksAppt = buildEditFKQueryHooks(editFormFields)

  const imports = [
    `import { useState } from 'react'`,
    `import { createFileRoute, Link } from '@tanstack/react-router'`,
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'`,
    `import { supabase } from '@/lib/supabase'`,
    `import { Button } from '@/components/ui/button'`,
    `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'`,
    needsInputAppt ? `import { Input } from '@/components/ui/input'` : null,
    needsTextarea ? `import { Textarea } from '@/components/ui/textarea'` : null,
    `import { ArrowLeft, Calendar, Edit2 } from 'lucide-react'`,
  ]
    .filter(Boolean)
    .join('\n')

  const statusBlock = statusField
    ? `              {data.${statusField} && (
                <span className={\`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-2 \${statusColorMap[String(data.${statusField})] ?? 'bg-gray-100 text-gray-800'}\`}>
                  {String(data.${statusField})}
                </span>
              )}`
    : ''

  const dateBlock = dateField
    ? `          {data.${dateField} && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">{new Date(String(data.${dateField})).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p className="text-sm text-muted-foreground">{new Date(String(data.${dateField})).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          )}`
    : ''

  const notesBlock = notesField
    ? `          {data.${notesField} && <p className="text-muted-foreground">{String(data.${notesField})}</p>}`
    : ''

  const statusColorMapDecl = statusField
    ? `  const statusColorMap: Record<string, string> = {
    'pending': 'bg-yellow-100 text-yellow-800',
    'confirmed': 'bg-blue-100 text-blue-800',
    'completed': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800',
  }`
    : ''

  return `// Auto-generated by VibeStack Design Engine v2 — AppointmentCard skill
${imports}

export const Route = createFileRoute('/_authenticated/${pluralKebab}/$id')({
  component: ${pascal}AppointmentPage,
})

function ${pascal}AppointmentPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string | number | boolean>>({})

  const ${camel} = useQuery({
    queryKey: ['${entity}', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').eq('id', id).single()
      if (error) throw error
      return data as Record<string, unknown>
    },
  })

  const update${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['${entity}'] }); setIsEditing(false) },
  })

  if (${camel}.isPending) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>
  if (${camel}.error) return <div className="flex justify-center py-20"><p className="text-destructive">Error: {${camel}.error.message}</p></div>
  ${editFKHooksAppt}

  if (!${camel}.data) return <div className="flex justify-center py-20"><p className="text-muted-foreground">Not found</p></div>

  const data = ${camel}.data
${statusColorMapDecl}

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/${pluralKebab}" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to ${pluralTitle}
      </Link>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{String(data.${headerField} ?? 'Appointment')}</h1>
${statusBlock}
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              if (!isEditing) setEditForm({ ${editInitFields} })
              setIsEditing(!isEditing)
            }}>
              <Edit2 className="h-4 w-4 mr-1" />{isEditing ? 'Cancel' : 'Edit'}
            </Button>
          </div>

${dateBlock}

${notesBlock}
        </CardContent>
      </Card>

      {isEditing && (
        <Card>
          <CardHeader><CardTitle>Edit ${singularTitle}</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); update${pascal}.mutate(editForm) }}>
${editFieldsJSX}
              <div className="flex gap-2">
                <Button type="submit" disabled={update${pascal}.isPending}>{update${pascal}.isPending ? 'Saving...' : 'Save'}</Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
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
