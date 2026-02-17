// server/lib/agents/assembler.ts
//
// Deterministic React component assembly from PageFeatureSpec.
// Every output is a complete, valid React component string — no SLOT markers.

import type { PageFeatureSpec } from './feature-schema'
import type { SchemaContract } from '../schema-contract'
import { snakeToPascal, snakeToCamel, snakeToKebab, pluralize } from '../naming-utils'

// ============================================================================
// Foreign key detection (E7)
// ============================================================================

interface ForeignKeyInfo {
  column: string
  refTable: string
  refColumn: string
}

function detectForeignKeys(entityName: string, contract: SchemaContract): ForeignKeyInfo[] {
  const table = contract.tables.find((t) => t.name === entityName)
  if (!table) return []
  return table.columns
    .filter((c) => c.references?.table && c.references?.column && c.references.table !== 'auth.users')
    .map((c) => ({
      column: c.name,
      refTable: c.references!.table,
      refColumn: c.references!.column,
    }))
}

// ============================================================================
// Cell renderers — deterministic JSX for each column format
// ============================================================================

function cellRenderer(field: string, format: string, itemVar: string): string {
  const accessor = `${itemVar}.${snakeToCamel(field)}`
  switch (format) {
    case 'date':
      return `{${accessor} ? new Date(${accessor}).toLocaleDateString() : '—'}`
    case 'badge':
      return `<Badge variant="secondary">{${accessor}}</Badge>`
    case 'currency':
      return `{'$' + Number(${accessor}).toFixed(2)}`
    case 'link':
      return `<a href={${accessor}} target="_blank" rel="noopener noreferrer" className="text-primary underline">{${accessor}}</a>`
    case 'boolean':
      return `<Badge variant={${accessor} ? 'default' : 'outline'}>{${accessor} ? 'Yes' : 'No'}</Badge>`
    case 'json':
      return `<pre className="text-xs">{JSON.stringify(${accessor}, null, 2)}</pre>`
    default: // text
      return `{${accessor}}`
  }
}

// ============================================================================
// Form field renderers — deterministic JSX for each input type (E7 FK-aware)
// ============================================================================

function formFieldRenderer(
  field: { field: string; label: string; inputType: string; placeholder?: string; options?: string[] },
  formVar: string,
  setFormVar: string,
  foreignKeys: ForeignKeyInfo[],
): string {
  const camelField = snakeToCamel(field.field)
  const valueExpr = `${formVar}.${camelField}`
  const changeExpr = `${setFormVar}(prev => ({ ...prev, ${camelField}: e.target.value }))`
  const placeholder = field.placeholder ? ` placeholder="${field.placeholder}"` : ''

  // Check if this field is a FK (E7)
  const fk = foreignKeys.find((f) => f.column === field.field)
  if (fk) {
    const refTableCamel = snakeToCamel(fk.refTable)
    const refTablePascal = snakeToPascal(fk.refTable)
    return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              {(() => {
                const { data: ${refTableCamel}Options } = useQuery({
                  queryKey: ['${fk.refTable}', 'dropdown'],
                  queryFn: async () => {
                    const { data } = await supabase.from('${fk.refTable}').select('id, name, title').limit(100)
                    return data ?? []
                  },
                })
                return (
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}}>
                    <option value="">Select ${refTablePascal}...</option>
                    {${refTableCamel}Options?.map((opt: any) => (
                      <option key={opt.id} value={opt.id}>{opt.name ?? opt.title ?? opt.id}</option>
                    ))}
                  </select>
                )
              })()}
            </div>`
  }

  switch (field.inputType) {
    case 'textarea':
      return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              <Textarea value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'number':
      return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              <Input type="number" value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'select':
      const options = (field.options ?? [])
        .map((opt) => `                  <option value="${opt}">${snakeToPascal(opt)}</option>`)
        .join('\n')
      return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}}>
                <option value="">Select...</option>
${options}
              </select>
            </div>`
    case 'date':
      return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              <Input type="date" value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}} />
            </div>`
    case 'email':
      return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              <Input type="email" value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'url':
      return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              <Input type="url" value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'checkbox':
      return `            <div className="flex items-center gap-2">
              <input type="checkbox" checked={!!${valueExpr}} onChange={(e) => ${setFormVar}(prev => ({ ...prev, ${camelField}: e.target.checked }))} />
              <label className="text-sm font-medium">${field.label}</label>
            </div>`
    default: // text
      return `            <div>
              <label className="text-sm font-medium">${field.label}</label>
              <Input type="text" value={${valueExpr} ?? ''} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
  }
}

// ============================================================================
// List Page Assembly (E3, E4, E5, E7)
// ============================================================================

export function assembleListPage(spec: PageFeatureSpec, contract: SchemaContract): string {
  const entity = spec.entityName
  const pascal = snakeToPascal(entity)
  const camel = snakeToCamel(entity)
  const plural = pluralize(entity)
  const pluralCamel = snakeToCamel(plural)
  const pluralKebab = snakeToKebab(plural)

  const needsBadge = spec.listPage.columns.some((c) => c.format === 'badge' || c.format === 'boolean')
  const needsTextarea = spec.listPage.createFormFields.some((f) => f.inputType === 'textarea')
  const foreignKeys = detectForeignKeys(entity, contract)

  // Build imports
  const imports = [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { useState } from 'react'",
    "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'",
    "import { supabase } from '@/lib/supabase'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'",
    "import { Input } from '@/components/ui/input'",
  ]
  if (needsBadge) imports.push("import { Badge } from '@/components/ui/badge'")
  if (needsTextarea) imports.push("import { Textarea } from '@/components/ui/textarea'")

  // Build table headers (E5: sortable)
  const headers = spec.listPage.columns
    .map(
      (c) =>
        `              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                  onClick={() => {
                    if (sortBy === '${c.field}') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                    else { setSortBy('${c.field}'); setSortOrder('asc') }
                  }}>
                ${c.label} {sortBy === '${c.field}' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>`,
    )
    .join('\n')

  // Build table cells
  const cells = spec.listPage.columns
    .map((c) => `              <td className="px-4 py-3 text-sm">${cellRenderer(c.field, c.format, 'item')}</td>`)
    .join('\n')

  // Build create form fields (E7: FK-aware)
  const formFields = spec.listPage.createFormFields
    .map((f) => formFieldRenderer(f, 'createForm', 'setCreateForm', foreignKeys))
    .join('\n')

  // Build initial form state
  const formInitFields = spec.listPage.createFormFields
    .map((f) => `${snakeToCamel(f.field)}: ''`)
    .join(', ')
  const formInitial = `{ ${formInitFields} }`

  // Build mutation payload
  const mutationPayload = spec.listPage.createFormFields.map((f) => snakeToCamel(f.field)).join(', ')

  // Build filter bar (E4)
  let filterBar = ''
  if (spec.listPage.filters && spec.listPage.filters.length > 0) {
    const filterFields = spec.listPage.filters
      .map((filter) => {
        const camelField = snakeToCamel(filter.field)
        switch (filter.type) {
          case 'search':
            return `          <div>
            <label className="text-sm font-medium">${filter.label}</label>
            <Input placeholder="Search..." value={filters.${camelField} ?? ''} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}: e.target.value }))} />
          </div>`
          case 'select':
            const opts = (filter.options ?? [])
              .map((opt) => `              <option value="${opt}">${snakeToPascal(opt)}</option>`)
              .join('\n')
            return `          <div>
            <label className="text-sm font-medium">${filter.label}</label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={filters.${camelField} ?? ''} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}: e.target.value }))}>
              <option value="">All</option>
${opts}
            </select>
          </div>`
          case 'boolean':
            return `          <div className="flex items-center gap-2">
            <input type="checkbox" checked={!!filters.${camelField}} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}: e.target.checked }))} />
            <label className="text-sm font-medium">${filter.label}</label>
          </div>`
          case 'dateRange':
            return `          <div>
            <label className="text-sm font-medium">${filter.label} From</label>
            <Input type="date" value={filters.${camelField}From ?? ''} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}From: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium">${filter.label} To</label>
            <Input type="date" value={filters.${camelField}To ?? ''} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}To: e.target.value }))} />
          </div>`
          default:
            return ''
        }
      })
      .join('\n')

    filterBar = `
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
${filterFields}
          </div>
        </CardContent>
      </Card>
`
  }

  return `// Auto-generated by VibeStack — deterministic assembly from PageFeatureSpec
${imports.join('\n')}

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}ListPage,
})

function ${pascal}ListPage() {
  const [sortBy, setSortBy] = useState('${spec.listPage.sortDefault}')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('${spec.listPage.sortDirection}')
  const [filters, setFilters] = useState<Record<string, string | boolean>>({})
  const [page, setPage] = useState(0)
  const pageSize = 20
  const queryClient = useQueryClient()

  const ${pluralCamel} = useQuery({
    queryKey: ['${entity}', 'list', page, sortBy, sortOrder],
    queryFn: async () => {
      const from = page * pageSize
      const to = from + pageSize - 1
      const { data, error, count } = await supabase
        .from('${entity}')
        .select('*', { count: 'exact' })
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(from, to)
      if (error) throw error
      return { items: data ?? [], totalCount: count ?? 0 }
    },
  })

  const create${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').insert(values)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${entity}'] }),
  })

  const delete${pascal} = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('${entity}').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${entity}'] }),
  })

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<Record<string, string | boolean>>(${formInitial})

  if (${pluralCamel}.isPending) {
    return <div className="flex justify-center py-12"><p className="text-muted-foreground">Loading...</p></div>
  }

  if (${pluralCamel}.error) {
    return <div className="flex justify-center py-12"><p className="text-destructive">Error: {${pluralCamel}.error.message}</p></div>
  }

  const data = ${pluralCamel}.data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">${snakeToPascal(plural)}</h1>
        <Button onClick={() => setIsCreateOpen(true)}>Create ${pascal}</Button>
      </div>
${filterBar}
      {isCreateOpen && (
        <Card>
          <CardHeader>
            <CardTitle>Create ${pascal}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                create${pascal}.mutate({ ${mutationPayload} } as any)
                setCreateForm(${formInitial})
                setIsCreateOpen(false)
              }}
            >
${formFields}
              <div className="flex gap-2">
                <Button type="submit" disabled={create${pascal}.isPending}>
                  {create${pascal}.isPending ? 'Creating...' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {deleteTargetId && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p>Are you sure you want to delete this ${entity}?</p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  delete${pascal}.mutate(deleteTargetId)
                  setDeleteTargetId(null)
                }}
              >
                Delete
              </Button>
              <Button variant="outline" onClick={() => setDeleteTargetId(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">${spec.listPage.emptyStateMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
${headers}
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((item: any) => (
                <tr key={item.id} className="hover:bg-muted/50">
${cells}
                  <td className="px-4 py-3 text-right text-sm">
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTargetId(item.id)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {${pluralCamel}.data && ${pluralCamel}.data.totalCount > pageSize && (
        <div className="flex justify-center gap-2 py-4">
          <Button variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            Page {page + 1} of {Math.ceil(${pluralCamel}.data.totalCount / pageSize)}
          </span>
          <Button variant="outline" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= ${pluralCamel}.data.totalCount}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
`
}

// ============================================================================
// Detail Page Assembly (E7: FK-aware)
// ============================================================================

export function assembleDetailPage(spec: PageFeatureSpec, contract: SchemaContract): string {
  const entity = spec.entityName
  const pascal = snakeToPascal(entity)
  const camel = snakeToCamel(entity)
  const plural = pluralize(entity)
  const pluralKebab = snakeToKebab(plural)

  const needsBadge =
    spec.detailPage.sections.some((s) => s.fields.some((f) => f.format === 'badge' || f.format === 'boolean')) ||
    spec.detailPage.sections.some((s) => s.fields.some((f) => f.format === 'json'))
  const needsTextarea = spec.detailPage.editFormFields.some((f) => f.inputType === 'textarea')
  const foreignKeys = detectForeignKeys(entity, contract)

  // Build imports
  const imports = [
    "import { createFileRoute, Link } from '@tanstack/react-router'",
    "import { useState } from 'react'",
    "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'",
    "import { supabase } from '@/lib/supabase'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'",
    "import { Input } from '@/components/ui/input'",
  ]
  if (needsBadge) imports.push("import { Badge } from '@/components/ui/badge'")
  if (needsTextarea) imports.push("import { Textarea } from '@/components/ui/textarea'")

  // Build detail sections
  const sectionCards = spec.detailPage.sections
    .map((section) => {
      const fields = section.fields
        .map(
          (f) =>
            `            <div>
              <p className="text-sm text-muted-foreground">${f.label}</p>
              <p className="font-medium">${cellRenderer(f.field, f.format, 'data')}</p>
            </div>`,
        )
        .join('\n')
      return `        <Card>
          <CardHeader>
            <CardTitle>${section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
${fields}
          </CardContent>
        </Card>`
    })
    .join('\n')

  // Build edit form fields (E7: FK-aware)
  const editFormFields = spec.detailPage.editFormFields
    .map((f) => formFieldRenderer(f, 'editForm', 'setEditForm', foreignKeys))
    .join('\n')

  // Build initial edit form state
  const editFormInitFields = spec.detailPage.editFormFields
    .map((f) => `${snakeToCamel(f.field)}: data.${snakeToCamel(f.field)} ?? ''`)
    .join(', ')

  // Build mutation payload
  const mutationPayload = spec.detailPage.editFormFields.map((f) => snakeToCamel(f.field)).join(', ')

  return `// Auto-generated by VibeStack — deterministic assembly from PageFeatureSpec
${imports.join('\n')}

export const Route = createFileRoute('/_authenticated/${pluralKebab}/$id')({
  component: ${pascal}DetailPage,
})

function ${pascal}DetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const ${camel} = useQuery({
    queryKey: ['${entity}', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('${entity}').select('*').eq('id', id).single()
      if (error) throw error
      return data
    },
  })
  const update${pascal} = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from('${entity}').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['${entity}'] }),
  })
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, string | boolean>>({})

  if (${camel}.isPending) {
    return <div className="flex justify-center py-12"><p className="text-muted-foreground">Loading...</p></div>
  }

  if (${camel}.error) {
    return <div className="flex justify-center py-12"><p className="text-destructive">Error: {${camel}.error.message}</p></div>
  }

  const data = ${camel}.data
  if (!data) {
    return <div className="flex justify-center py-12"><p className="text-muted-foreground">Not found</p></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/${pluralKebab}" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to ${snakeToPascal(plural)}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{data.${snakeToCamel(spec.detailPage.headerField)}}</h1>
        <Button onClick={() => {
          if (!isEditing) {
            setEditForm({ ${editFormInitFields} })
          }
          setIsEditing(!isEditing)
        }}>
          {isEditing ? 'Cancel' : 'Edit'}
        </Button>
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit ${pascal}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                update${pascal}.mutate({ ${mutationPayload} } as any)
                setIsEditing(false)
              }}
            >
${editFormFields}
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
        <>
${sectionCards}
        </>
      )}
    </div>
  )
}
`
}
