// server/lib/agents/assembler.ts
//
// Deterministic React component assembly from PageFeatureSpec.
// Every output is a complete, valid React component string — no SLOT markers.

import type { PageFeatureSpec } from './feature-schema'
import type { SchemaContract } from '../schema-contract'
import { snakeToPascal, snakeToCamel, snakeToKebab, snakeToTitle, pluralize, singularize } from '../naming-utils'

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

/**
 * Find the best "display" column for a referenced table.
 * Used to build FK dropdown labels (e.g., show category.name instead of category.id).
 */
function findDisplayColumn(refTable: string, contract: SchemaContract): string {
  const table = contract.tables.find((t) => t.name === refTable)
  if (!table) return 'id'

  // Priority order for human-readable display columns
  const displayCandidates = ['name', 'title', 'label', 'display_name', 'email', 'username']
  for (const candidate of displayCandidates) {
    if (table.columns.some((c) => c.name === candidate && c.type === 'text')) {
      return candidate
    }
  }

  // Fall back to first non-auto-managed text column
  const autoManaged = new Set(['id', 'created_at', 'updated_at', 'user_id'])
  const firstText = table.columns.find((c) => c.type === 'text' && !autoManaged.has(c.name))
  if (firstText) return firstText.name

  return 'id'
}

/**
 * Generate top-level useQuery hook declarations for FK dropdown data.
 * These must be at the component top level (React Rules of Hooks).
 * Deduplicates by refTable (multiple FKs may reference the same table).
 */
function generateFKHooks(foreignKeys: ForeignKeyInfo[], contract: SchemaContract): string {
  if (foreignKeys.length === 0) return ''

  const seen = new Set<string>()
  const hooks: string[] = []

  for (const fk of foreignKeys) {
    if (seen.has(fk.refTable)) continue
    seen.add(fk.refTable)

    const refTableCamel = snakeToCamel(fk.refTable)
    const displayCol = findDisplayColumn(fk.refTable, contract)
    const selectCols = displayCol === 'id' ? 'id' : `id, ${displayCol}`

    hooks.push(`  const ${refTableCamel}Options = useQuery({
    queryKey: ['${fk.refTable}', 'dropdown'],
    queryFn: async () => {
      const { data } = await supabase.from('${fk.refTable}').select('${selectCols}').limit(100)
      return data ?? []
    },
  })`)
  }

  return '\n' + hooks.join('\n\n') + '\n'
}

// ============================================================================
// Cell renderers — deterministic JSX for each column format
// ============================================================================

function cellRenderer(field: string, format: string, itemVar: string): string {
  // Supabase returns raw snake_case column names — never camelCase
  const accessor = `${itemVar}.${field}`
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
  contract: SchemaContract,
): string {
  // Use raw snake_case field names throughout — form state keys match Supabase column names
  const snakeField = field.field
  const fieldId = `field-${snakeField}`
  const valueExpr = `${formVar}.${snakeField}`
  // String() narrows Record<string, string | boolean> to string for value props
  const stringValueExpr = `String(${valueExpr} ?? '')`
  const changeExpr = `${setFormVar}(prev => ({ ...prev, ${snakeField}: e.target.value }))`
  const placeholder = field.placeholder ? ` placeholder="${field.placeholder}"` : ''

  // Check if this field is a FK (E7) — references hoisted useQuery hook (not inline IIFE)
  const fk = foreignKeys.find((f) => f.column === field.field)
  if (fk) {
    const refTableCamel = snakeToCamel(fk.refTable)
    const refTablePascal = snakeToPascal(fk.refTable)
    const displayCol = findDisplayColumn(fk.refTable, contract)
    const displayExpr = displayCol === 'id' ? 'opt.id' : `opt.${displayCol} ?? opt.id`
    return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <select id="${fieldId}" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={${stringValueExpr}} onChange={(e) => ${changeExpr}}>
                <option value="">Select ${refTablePascal}...</option>
                {${refTableCamel}Options.data?.map((opt) => (
                  <option key={opt.id} value={opt.id}>{${displayExpr}}</option>
                ))}
              </select>
            </div>`
  }

  switch (field.inputType) {
    case 'textarea':
      return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <Textarea id="${fieldId}" value={${stringValueExpr}} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'number':
      return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <Input id="${fieldId}" type="number" value={${stringValueExpr}} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'select':
      const options = (field.options ?? [])
        .map((opt) => `                  <option value="${opt}">${snakeToPascal(opt)}</option>`)
        .join('\n')
      return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <select id="${fieldId}" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={${stringValueExpr}} onChange={(e) => ${changeExpr}}>
                <option value="">Select...</option>
${options}
              </select>
            </div>`
    case 'date':
      return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <Input id="${fieldId}" type="date" value={${stringValueExpr}} onChange={(e) => ${changeExpr}} />
            </div>`
    case 'email':
      return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <Input id="${fieldId}" type="email" value={${stringValueExpr}} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'url':
      return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <Input id="${fieldId}" type="url" value={${stringValueExpr}} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
    case 'checkbox':
      return `            <div className="flex items-center gap-2">
              <input id="${fieldId}" type="checkbox" checked={!!${valueExpr}} onChange={(e) => ${setFormVar}(prev => ({ ...prev, ${snakeField}: e.target.checked }))} />
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
            </div>`
    default: // text
      return `            <div>
              <label htmlFor="${fieldId}" className="text-sm font-medium">${field.label}</label>
              <Input id="${fieldId}" type="text" value={${stringValueExpr}} onChange={(e) => ${changeExpr}}${placeholder} />
            </div>`
  }
}

// ============================================================================
// List Page Assembly (E3, E4, E5, E7)
// ============================================================================

export function assembleListPage(spec: PageFeatureSpec, contract: SchemaContract): string {
  const entity = spec.entityName
  const singular = singularize(entity)
  const pascal = snakeToPascal(singular)        // "Patient"        — JS identifier (hook/component names)
  const singularTitle = snakeToTitle(singular)  // "Patient"/"Menu Category" — display labels
  const camel = snakeToCamel(entity)
  const plural = pluralize(entity)
  const pluralCamel = snakeToCamel(plural)
  const pluralKebab = snakeToKebab(plural)

  const needsBadge = spec.listPage.columns.some((c) => c.format === 'badge' || c.format === 'boolean')
  const needsTextarea = spec.listPage.createFormFields.some((f) => f.inputType === 'textarea')
  const allForeignKeys = detectForeignKeys(entity, contract)

  // Only include FK hooks for columns that actually appear in createFormFields
  const createFieldNames = new Set(spec.listPage.createFormFields.map((f) => f.field))
  const foreignKeys = allForeignKeys.filter((fk) => createFieldNames.has(fk.column))

  const hasFilters = (spec.listPage.filters?.length ?? 0) > 0

  // Determine if Input is actually used (filters or non-FK/non-textarea/non-checkbox/non-select form fields)
  const needsInput =
    hasFilters ||
    spec.listPage.createFormFields.some((f) => {
      const isFk = foreignKeys.some((fk) => fk.column === f.field)
      return !isFk && f.inputType !== 'textarea' && f.inputType !== 'checkbox' && f.inputType !== 'select'
    })

  // Build imports
  const imports = [
    "import { createFileRoute, Link } from '@tanstack/react-router'",
    "import { useState } from 'react'",
    "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'",
    "import { supabase } from '@/lib/supabase'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardContent } from '@/components/ui/card'",
    "import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'",
    "import { Skeleton } from '@/components/ui/skeleton'",
  ]
  if (needsInput) imports.push("import { Input } from '@/components/ui/input'")
  if (needsBadge) imports.push("import { Badge } from '@/components/ui/badge'")
  if (needsTextarea) imports.push("import { Textarea } from '@/components/ui/textarea'")

  // Build table headers (E5: sortable, a11y: onKeyDown for keyboard nav)
  const headers = spec.listPage.columns
    .map(
      (c) =>
        `              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  tabIndex={0}
                  onClick={() => {
                    if (sortBy === '${c.field}') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                    else { setSortBy('${c.field}'); setSortOrder('asc') }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (sortBy === '${c.field}') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                      else { setSortBy('${c.field}'); setSortOrder('asc') }
                    }
                  }}>
                ${c.label} {sortBy === '${c.field}' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>`,
    )
    .join('\n')

  // Build table cells
  const cells = spec.listPage.columns
    .map((c) => `              <td className="px-4 py-3 text-sm">${cellRenderer(c.field, c.format, 'item')}</td>`)
    .join('\n')

  // Build create form fields (E7: FK-aware, hooks hoisted to top level)
  const formFields = spec.listPage.createFormFields
    .map((f) => formFieldRenderer(f, 'createForm', 'setCreateForm', foreignKeys, contract))
    .join('\n')

  // Build initial form state — keys use raw snake_case to match Supabase column names
  const formInitFields = spec.listPage.createFormFields
    .map((f) => `${f.field}: ${f.inputType === 'checkbox' ? 'false' : "''"}`)
    .join(', ')
  const formInitial = `{ ${formInitFields} }`

  // FK dropdown hooks — must be at component top level (Rules of Hooks)
  const fkHooks = generateFKHooks(foreignKeys, contract)

  // Build filter bar (E4)
  let filterBar = ''
  if (spec.listPage.filters && spec.listPage.filters.length > 0) {
    const filterFields = spec.listPage.filters
      .map((filter) => {
        const camelField = snakeToCamel(filter.field)
        const filterId = `filter-${filter.field}`
        switch (filter.type) {
          case 'search':
            return `          <div>
            <label htmlFor="${filterId}" className="text-sm font-medium">${filter.label}</label>
            <Input id="${filterId}" placeholder="Search..." value={String(filters.${camelField} ?? '')} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}: e.target.value }))} />
          </div>`
          case 'select':
            const opts = (filter.options ?? [])
              .map((opt) => `              <option value="${opt}">${snakeToPascal(opt)}</option>`)
              .join('\n')
            return `          <div>
            <label htmlFor="${filterId}" className="text-sm font-medium">${filter.label}</label>
            <select id="${filterId}" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(filters.${camelField} ?? '')} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}: e.target.value }))}>
              <option value="">All</option>
${opts}
            </select>
          </div>`
          case 'boolean':
            return `          <div className="flex items-center gap-2">
            <input id="${filterId}" type="checkbox" checked={!!filters.${camelField}} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}: e.target.checked }))} />
            <label htmlFor="${filterId}" className="text-sm font-medium">${filter.label}</label>
          </div>`
          case 'dateRange':
            return `          <div>
            <label htmlFor="${filterId}-from" className="text-sm font-medium">${filter.label} From</label>
            <Input id="${filterId}-from" type="date" value={String(filters.${camelField}From ?? '')} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}From: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="${filterId}-to" className="text-sm font-medium">${filter.label} To</label>
            <Input id="${filterId}-to" type="date" value={String(filters.${camelField}To ?? '')} onChange={(e) => setFilters(prev => ({ ...prev, ${camelField}To: e.target.value }))} />
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
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('${spec.listPage.sortDirection}')${hasFilters ? `\n  const [filters, setFilters] = useState<Record<string, string | boolean>>({})` : ''}
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
${fkHooks}
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<Record<string, string | boolean>>(${formInitial})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">${snakeToTitle(plural)}</h1>
          {!${pluralCamel}.isPending && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {${pluralCamel}.data?.totalCount ?? 0} total
            </p>
          )}
        </div>
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" className="mr-1.5 -ml-0.5">
            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/>
          </svg>
          New ${singularTitle}
        </Button>
      </div>

${filterBar}

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create ${singularTitle}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              create${pascal}.mutate(createForm)
              setCreateForm(${formInitial})
              setIsCreateOpen(false)
            }}
          >
${formFields}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create${pascal}.isPending}>
                {create${pascal}.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete ${singularTitle}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={delete${pascal}.isPending}
              onClick={() => {
                if (deleteTargetId) {
                  delete${pascal}.mutate(deleteTargetId)
                  setDeleteTargetId(null)
                }
              }}
            >
              {delete${pascal}.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Data table */}
      {${pluralCamel}.isPending ? (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0 divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <Skeleton className="h-4 w-[40%]" />
                  <Skeleton className="h-4 w-[25%]" />
                  <Skeleton className="h-4 w-[15%] ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : ${pluralCamel}.error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load data</p>
            <p className="text-xs text-muted-foreground mt-1">{${pluralCamel}.error.message}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => ${pluralCamel}.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (${pluralCamel}.data?.items ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <p className="font-medium text-sm">${spec.listPage.emptyStateMessage}</p>
            <p className="text-xs text-muted-foreground mt-1">Get started by creating your first one.</p>
            <Button size="sm" className="mt-4" onClick={() => setIsCreateOpen(true)}>
              Create ${singularTitle}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
${headers}
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(${pluralCamel}.data?.items ?? []).map((item) => (
                  <tr key={item.id} className="group hover:bg-muted/30 transition-colors">
${cells}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to="/${pluralKebab}/$id" params={{ id: item.id } as any}>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">View</Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTargetId(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {${pluralCamel}.data && ${pluralCamel}.data.totalCount > pageSize && (
        <div className="flex items-center justify-between py-2">
          <p className="text-xs text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, ${pluralCamel}.data.totalCount)} of {${pluralCamel}.data.totalCount}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              ← Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= ${pluralCamel}.data.totalCount}>
              Next →
            </Button>
          </div>
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
  const singular = singularize(entity)
  const pascal = snakeToPascal(singular)        // "Patient"        — JS identifier
  const singularTitle = snakeToTitle(singular)  // "Patient"/"Menu Category" — display labels
  const camel = snakeToCamel(entity)
  const plural = pluralize(entity)
  const pluralKebab = snakeToKebab(plural)

  const needsBadge =
    spec.detailPage.sections.some((s) => s.fields.some((f) => f.format === 'badge' || f.format === 'boolean')) ||
    spec.detailPage.sections.some((s) => s.fields.some((f) => f.format === 'json'))
  const needsTextarea = spec.detailPage.editFormFields.some((f) => f.inputType === 'textarea')
  const allForeignKeys = detectForeignKeys(entity, contract)

  // Only include FK hooks for columns that actually appear in editFormFields
  const editFieldNames = new Set(spec.detailPage.editFormFields.map((f) => f.field))
  const foreignKeys = allForeignKeys.filter((fk) => editFieldNames.has(fk.column))

  // Only import Input if edit form uses text/number/email/url/date inputs (not just FK selects or textareas)
  const needsInput = spec.detailPage.editFormFields.some((f) => {
    const isFk = foreignKeys.some((fk) => fk.column === f.field)
    return !isFk && f.inputType !== 'textarea' && f.inputType !== 'checkbox' && f.inputType !== 'select'
  })

  // Build imports
  const imports = [
    "import { createFileRoute, Link } from '@tanstack/react-router'",
    "import { useState } from 'react'",
    "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'",
    "import { supabase } from '@/lib/supabase'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'",
  ]
  if (needsInput) imports.push("import { Input } from '@/components/ui/input'")
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

  // Build edit form fields (E7: FK-aware, hooks hoisted to top level)
  const editFormFields = spec.detailPage.editFormFields
    .map((f) => formFieldRenderer(f, 'editForm', 'setEditForm', foreignKeys, contract))
    .join('\n')

  // Build initial edit form state — snake_case keys match Supabase data and column names
  const editFormInitFields = spec.detailPage.editFormFields
    .map((f) => `${f.field}: data.${f.field} ?? ''`)
    .join(', ')

  // FK dropdown hooks — must be at component top level (Rules of Hooks)
  const fkHooks = generateFKHooks(foreignKeys, contract)

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
${fkHooks}
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
          ← Back to ${snakeToTitle(plural)}
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{data.${spec.detailPage.headerField}}</h1>
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
            <CardTitle>Edit ${singularTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                update${pascal}.mutate(editForm)
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
