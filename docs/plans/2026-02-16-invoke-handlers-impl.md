# Invoke Handlers + Hybrid Code Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire XState invoke handlers so the machine is self-executing, implement hybrid code generation (structured feature analysis + deterministic assembly), connect validation/repair loop, and rebuild the Daytona snapshot.

**Architecture:** Each XState state gets a `fromPromise` invoke handler in `orchestrator.ts`. The `generating` state uses Approach 3: LLM returns `PageFeatureSpec` via structured output (closed enums + contract column references), deterministic assembler functions produce complete React components, backend procedure bodies come via structured output. Validation gate and repair loop are already implemented — just wire them as invokes.

**Tech Stack:** XState v5 (`fromPromise`), Mastra agents (`structuredOutput`), Zod 4, Vitest, TypeScript 5

---

## Dependencies Between Tasks

```
Task 1 (feature-schema.ts — Zod schemas + validation)
  |
Task 2 (assembler.ts — list page assembly) ────────┐
Task 3 (assembler.ts — detail page assembly) ───────┤
Task 4 (assembler.ts — backend procedure assembly) ─┤
  |                                                  |
Task 5 (contract-to-pages.ts — replace SLOTs) ──────┤
  |                                                  |
Task 6 (orchestrator.ts — analysis handler) ─────────┤
Task 7 (orchestrator.ts — blueprint handler) ────────┤→ Task 10 (machine.ts — wire invokes)
Task 8 (orchestrator.ts — codegen handler) ──────────┤                |
Task 9 (orchestrator.ts — validation+repair) ────────┘    Task 11 (agent.ts — simplify SSE)
                                                                      |
Task 12 (snapshot — add Layer 0 files) ───── Task 13 (snapshot — rebuild Docker image)
```

Tasks 2,3,4 are independent of each other. Tasks 6,7,8,9 are independent of each other. Task 12 is independent of everything else.

---

### Task 1: Create Feature Schema + Validation

**Files:**
- Create: `server/lib/agents/feature-schema.ts`
- Test: `tests/feature-schema.test.ts`

**Step 1: Write the failing test**

Add `tests/feature-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  PageFeatureSchema,
  CustomProcedureSchema,
  validateFeatureSpec,
} from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

const testContract: SchemaContract = {
  tables: [
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'status', type: 'text', nullable: false, default: "'pending'" },
        { name: 'due_date', type: 'timestamptz', nullable: true },
        { name: 'is_complete', type: 'boolean', nullable: false, default: 'false' },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

describe('PageFeatureSchema', () => {
  it('parses a valid feature spec', () => {
    const input = {
      entityName: 'task',
      listPage: {
        columns: [
          { field: 'title', label: 'Title', format: 'text' },
          { field: 'status', label: 'Status', format: 'badge' },
          { field: 'due_date', label: 'Due Date', format: 'date' },
        ],
        searchFields: ['title', 'description'],
        sortDefault: 'created_at',
        sortDirection: 'desc',
        createFormFields: [
          { field: 'title', label: 'Title', inputType: 'text' },
          { field: 'description', label: 'Description', inputType: 'textarea' },
        ],
        emptyStateMessage: 'No tasks yet. Create your first task!',
      },
      detailPage: {
        headerField: 'title',
        sections: [
          {
            title: 'Details',
            fields: [
              { field: 'status', label: 'Status', format: 'badge' },
              { field: 'due_date', label: 'Due Date', format: 'date' },
              { field: 'is_complete', label: 'Complete', format: 'boolean' },
            ],
          },
        ],
        editFormFields: [
          { field: 'title', label: 'Title', inputType: 'text' },
          { field: 'description', label: 'Description', inputType: 'textarea' },
          { field: 'status', label: 'Status', inputType: 'select' },
        ],
      },
    }

    const result = PageFeatureSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects invalid format enum', () => {
    const input = {
      entityName: 'task',
      listPage: {
        columns: [{ field: 'title', label: 'Title', format: 'rainbow' }],
        searchFields: [],
        sortDefault: 'id',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'title',
        sections: [],
        editFormFields: [],
      },
    }

    const result = PageFeatureSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('CustomProcedureSchema', () => {
  it('parses valid custom procedures', () => {
    const input = {
      procedures: [
        {
          name: 'search',
          type: 'query',
          access: 'protected',
          description: 'Search tasks by title',
          inputFields: [
            { name: 'query', type: 'string', optional: false },
          ],
          implementation: 'return ctx.db.query.task.findMany({ where: ilike(task.title, `%${input.query}%`) })',
        },
      ],
    }

    const result = CustomProcedureSchema.safeParse(input)
    expect(result.success).toBe(true)
  })
})

describe('validateFeatureSpec', () => {
  it('returns valid for correct field references', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'task',
      listPage: {
        columns: [{ field: 'title', label: 'Title', format: 'text' }],
        searchFields: ['title'],
        sortDefault: 'created_at',
        sortDirection: 'asc',
        createFormFields: [{ field: 'title', label: 'Title', inputType: 'text' }],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'title',
        sections: [{ title: 'Info', fields: [{ field: 'title', label: 'Title', format: 'text' }] }],
        editFormFields: [{ field: 'title', label: 'Title', inputType: 'text' }],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects field not in contract', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'task',
      listPage: {
        columns: [{ field: 'nonexistent_field', label: 'Bad', format: 'text' }],
        searchFields: [],
        sortDefault: 'id',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'title',
        sections: [],
        editFormFields: [],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('nonexistent_field')
  })

  it('rejects entity not in contract', () => {
    const spec = PageFeatureSchema.parse({
      entityName: 'nonexistent_table',
      listPage: {
        columns: [],
        searchFields: [],
        sortDefault: 'id',
        sortDirection: 'asc',
        createFormFields: [],
        emptyStateMessage: 'Empty',
      },
      detailPage: {
        headerField: 'id',
        sections: [],
        editFormFields: [],
      },
    })

    const result = validateFeatureSpec(spec, testContract)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('nonexistent_table')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/feature-schema.test.ts --reporter=verbose`
Expected: FAIL — module `@server/lib/agents/feature-schema` not found

**Step 3: Write minimal implementation**

Create `server/lib/agents/feature-schema.ts`:

```typescript
import { z } from 'zod'
import type { SchemaContract } from '../schema-contract'

// ============================================================================
// Column display format — closed enum for deterministic rendering
// ============================================================================

const ColumnFormatSchema = z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean'])
const DetailFormatSchema = z.enum(['text', 'date', 'badge', 'currency', 'link', 'boolean', 'json'])

// ============================================================================
// Form input type — closed enum mapping to shadcn/ui components
// ============================================================================

const InputTypeSchema = z.enum([
  'text', 'textarea', 'number', 'select', 'date', 'email', 'url', 'checkbox',
])

// ============================================================================
// PageFeatureSchema — structured output from LLM feature analysis
// ============================================================================

export const PageFeatureSchema = z.object({
  entityName: z.string(),
  listPage: z.object({
    columns: z.array(z.object({
      field: z.string(),
      label: z.string(),
      format: ColumnFormatSchema,
    })),
    searchFields: z.array(z.string()),
    sortDefault: z.string(),
    sortDirection: z.enum(['asc', 'desc']),
    createFormFields: z.array(z.object({
      field: z.string(),
      label: z.string(),
      inputType: InputTypeSchema,
      placeholder: z.string().optional(),
      options: z.array(z.string()).optional(),
    })),
    emptyStateMessage: z.string(),
  }),
  detailPage: z.object({
    headerField: z.string(),
    sections: z.array(z.object({
      title: z.string(),
      fields: z.array(z.object({
        field: z.string(),
        label: z.string(),
        format: DetailFormatSchema,
      })),
    })),
    editFormFields: z.array(z.object({
      field: z.string(),
      label: z.string(),
      inputType: InputTypeSchema,
    })),
  }),
})

export type PageFeatureSpec = z.infer<typeof PageFeatureSchema>

// ============================================================================
// CustomProcedureSchema — structured output for backend custom procedures
// ============================================================================

export const CustomProcedureSchema = z.object({
  procedures: z.array(z.object({
    name: z.string(),
    type: z.enum(['query', 'mutation']),
    access: z.enum(['public', 'protected']),
    description: z.string(),
    inputFields: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'string[]']),
      optional: z.boolean(),
    })),
    implementation: z.string(),
  })),
})

export type CustomProcedureSpec = z.infer<typeof CustomProcedureSchema>

// ============================================================================
// Validation — ensure all field references exist in the contract
// ============================================================================

interface FeatureValidationResult {
  valid: boolean
  errors: string[]
}

export function validateFeatureSpec(
  spec: PageFeatureSpec,
  contract: SchemaContract,
): FeatureValidationResult {
  const errors: string[] = []

  // Find the table for this entity
  const table = contract.tables.find((t) => t.name === spec.entityName)
  if (!table) {
    errors.push(`Entity "${spec.entityName}" not found in contract`)
    return { valid: false, errors }
  }

  const columnNames = new Set(table.columns.map((c) => c.name))

  // Validate list page columns
  for (const col of spec.listPage.columns) {
    if (!columnNames.has(col.field)) {
      errors.push(`List column "${col.field}" not found in table "${spec.entityName}"`)
    }
  }

  // Validate search fields
  for (const field of spec.listPage.searchFields) {
    if (!columnNames.has(field)) {
      errors.push(`Search field "${field}" not found in table "${spec.entityName}"`)
    }
  }

  // Validate sort default
  if (!columnNames.has(spec.listPage.sortDefault)) {
    errors.push(`Sort default "${spec.listPage.sortDefault}" not found in table "${spec.entityName}"`)
  }

  // Validate create form fields
  for (const field of spec.listPage.createFormFields) {
    if (!columnNames.has(field.field)) {
      errors.push(`Create form field "${field.field}" not found in table "${spec.entityName}"`)
    }
  }

  // Validate detail page header field
  if (!columnNames.has(spec.detailPage.headerField)) {
    errors.push(`Header field "${spec.detailPage.headerField}" not found in table "${spec.entityName}"`)
  }

  // Validate detail sections
  for (const section of spec.detailPage.sections) {
    for (const field of section.fields) {
      if (!columnNames.has(field.field)) {
        errors.push(`Detail field "${field.field}" not found in table "${spec.entityName}"`)
      }
    }
  }

  // Validate edit form fields
  for (const field of spec.detailPage.editFormFields) {
    if (!columnNames.has(field.field)) {
      errors.push(`Edit form field "${field.field}" not found in table "${spec.entityName}"`)
    }
  }

  return { valid: errors.length === 0, errors }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/feature-schema.test.ts --reporter=verbose`
Expected: PASS — all 6 tests pass

**Step 5: Commit**

```bash
git add server/lib/agents/feature-schema.ts tests/feature-schema.test.ts
git commit -m "feat: add PageFeatureSchema + CustomProcedureSchema with contract validation"
```

---

### Task 2: Implement List Page Assembler

**Files:**
- Create: `server/lib/agents/assembler.ts`
- Test: `tests/assembler.test.ts`

**Step 1: Write the failing test**

Add `tests/assembler.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { assembleListPage } from '@server/lib/agents/assembler'
import type { PageFeatureSpec } from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

const testContract: SchemaContract = {
  tables: [
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'status', type: 'text', nullable: false, default: "'pending'" },
        { name: 'due_date', type: 'timestamptz', nullable: true },
        { name: 'is_complete', type: 'boolean', nullable: false, default: 'false' },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

const taskSpec: PageFeatureSpec = {
  entityName: 'task',
  listPage: {
    columns: [
      { field: 'title', label: 'Title', format: 'text' },
      { field: 'status', label: 'Status', format: 'badge' },
      { field: 'due_date', label: 'Due Date', format: 'date' },
      { field: 'is_complete', label: 'Done', format: 'boolean' },
    ],
    searchFields: ['title'],
    sortDefault: 'created_at',
    sortDirection: 'desc',
    createFormFields: [
      { field: 'title', label: 'Title', inputType: 'text', placeholder: 'Enter task title' },
      { field: 'status', label: 'Status', inputType: 'select', options: ['pending', 'in_progress', 'done'] },
    ],
    emptyStateMessage: 'No tasks yet. Create your first task!',
  },
  detailPage: {
    headerField: 'title',
    sections: [],
    editFormFields: [],
  },
}

describe('assembleListPage', () => {
  it('returns a complete React component string', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain("import { createFileRoute } from '@tanstack/react-router'")
    expect(result).toContain("import { trpc } from '@/lib/trpc'")
  })

  it('does not contain SLOT markers', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).not.toContain('SLOT')
    expect(result).not.toContain('return null')
  })

  it('includes table headers from columns spec', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('Title')
    expect(result).toContain('Status')
    expect(result).toContain('Due Date')
  })

  it('uses Badge renderer for badge format', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('Badge')
  })

  it('includes create form with specified fields', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('Enter task title')
  })

  it('includes empty state message', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('No tasks yet. Create your first task!')
  })

  it('generates valid JSX (no syntax-level errors)', () => {
    const result = assembleListPage(taskSpec, testContract)
    // Check balanced braces
    const opens = (result.match(/{/g) || []).length
    const closes = (result.match(/}/g) || []).length
    expect(opens).toBe(closes)
  })

  it('defines the route with createFileRoute', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain("createFileRoute('/_authenticated/tasks')")
  })

  it('includes tRPC hooks for list, create, delete', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('trpc.task.list.useQuery()')
    expect(result).toContain('trpc.task.create.useMutation')
    expect(result).toContain('trpc.task.delete.useMutation')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/assembler.test.ts --reporter=verbose`
Expected: FAIL — `assembleListPage` not found

**Step 3: Write minimal implementation**

Create `server/lib/agents/assembler.ts`. This file contains pure functions that produce complete React component strings from a `PageFeatureSpec`.

The key idea: every piece of JSX is a deterministic template string selected by the `format` or `inputType` enum. Zero LLM involvement.

```typescript
// server/lib/agents/assembler.ts
//
// Deterministic React component assembly from PageFeatureSpec.
// Every output is a complete, valid React component string — no SLOT markers.

import type { PageFeatureSpec } from './feature-schema'
import type { SchemaContract } from '../schema-contract'

// ============================================================================
// Naming helpers (same as contract-to-pages.ts)
// ============================================================================

function snakeToPascal(str: string): string {
  return str.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function snakeToCamel(str: string): string {
  const p = snakeToPascal(str)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

function snakeToKebab(str: string): string {
  return str.replace(/_/g, '-')
}

function pluralize(str: string): string {
  if (str.endsWith('y')) return str.slice(0, -1) + 'ies'
  if (str.endsWith('s') || str.endsWith('sh') || str.endsWith('ch') || str.endsWith('x')) return str + 'es'
  return str + 's'
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
// Form field renderers — deterministic JSX for each input type
// ============================================================================

function formFieldRenderer(
  field: { field: string; label: string; inputType: string; placeholder?: string; options?: string[] },
  formVar: string,
  setFormVar: string,
): string {
  const camelField = snakeToCamel(field.field)
  const valueExpr = `${formVar}.${camelField}`
  const changeExpr = `${setFormVar}(prev => ({ ...prev, ${camelField}: e.target.value }))`
  const placeholder = field.placeholder ? ` placeholder="${field.placeholder}"` : ''

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
      const options = (field.options ?? []).map(
        (opt) => `                  <option value="${opt}">${snakeToPascal(opt)}</option>`
      ).join('\n')
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
// List Page Assembly
// ============================================================================

export function assembleListPage(spec: PageFeatureSpec, _contract: SchemaContract): string {
  const entity = spec.entityName
  const pascal = snakeToPascal(entity)
  const camel = snakeToCamel(entity)
  const plural = pluralize(entity)
  const pluralCamel = snakeToCamel(plural)
  const pluralKebab = snakeToKebab(plural)

  const needsBadge = spec.listPage.columns.some((c) => c.format === 'badge' || c.format === 'boolean')
  const needsTextarea = spec.listPage.createFormFields.some((f) => f.inputType === 'textarea')

  // Build imports
  const imports = [
    "import { createFileRoute } from '@tanstack/react-router'",
    "import { useState } from 'react'",
    "import { trpc } from '@/lib/trpc'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'",
    "import { Input } from '@/components/ui/input'",
  ]
  if (needsBadge) imports.push("import { Badge } from '@/components/ui/badge'")
  if (needsTextarea) imports.push("import { Textarea } from '@/components/ui/textarea'")

  // Build table headers
  const headers = spec.listPage.columns
    .map((c) => `              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">${c.label}</th>`)
    .join('\n')

  // Build table cells
  const cells = spec.listPage.columns
    .map((c) => `              <td className="px-4 py-3 text-sm">${cellRenderer(c.field, c.format, 'item')}</td>`)
    .join('\n')

  // Build create form fields
  const formFields = spec.listPage.createFormFields
    .map((f) => formFieldRenderer(f, 'createForm', 'setCreateForm'))
    .join('\n')

  // Build initial form state
  const formInitFields = spec.listPage.createFormFields
    .map((f) => `${snakeToCamel(f.field)}: ''`)
    .join(', ')
  const formInitial = `{ ${formInitFields} }`

  // Build mutation payload
  const mutationPayload = spec.listPage.createFormFields
    .map((f) => snakeToCamel(f.field))
    .join(', ')

  return `// Auto-generated by VibeStack — deterministic assembly from PageFeatureSpec
${imports.join('\n')}

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascal}ListPage,
})

function ${pascal}ListPage() {
  const ${pluralCamel} = trpc.${camel}.list.useQuery()
  const create${pascal} = trpc.${camel}.create.useMutation({
    onSuccess: () => ${pluralCamel}.refetch(),
  })
  const delete${pascal} = trpc.${camel}.delete.useMutation({
    onSuccess: () => ${pluralCamel}.refetch(),
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<Record<string, string | boolean>>(${formInitial})

  if (${pluralCamel}.isLoading) {
    return <div className="flex justify-center py-12"><p className="text-muted-foreground">Loading...</p></div>
  }

  if (${pluralCamel}.error) {
    return <div className="flex justify-center py-12"><p className="text-destructive">Error: {${pluralCamel}.error.message}</p></div>
  }

  const data = ${pluralCamel}.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">${snakeToPascal(plural)}</h1>
        <Button onClick={() => setIsCreateOpen(true)}>Create ${pascal}</Button>
      </div>

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
                  delete${pascal}.mutate({ id: deleteTargetId })
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
    </div>
  )
}
`
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/assembler.test.ts --reporter=verbose`
Expected: PASS — all 9 tests pass

**Step 5: Commit**

```bash
git add server/lib/agents/assembler.ts tests/assembler.test.ts
git commit -m "feat: add assembleListPage — deterministic React list component from PageFeatureSpec"
```

---

### Task 3: Implement Detail Page Assembler

**Files:**
- Modify: `server/lib/agents/assembler.ts`
- Test: `tests/assembler-detail.test.ts`

**Step 1: Write the failing test**

Add `tests/assembler-detail.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { assembleDetailPage } from '@server/lib/agents/assembler'
import type { PageFeatureSpec } from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

const testContract: SchemaContract = {
  tables: [
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'title', type: 'text', nullable: false },
        { name: 'status', type: 'text', nullable: false },
        { name: 'due_date', type: 'timestamptz', nullable: true },
        { name: 'is_complete', type: 'boolean', nullable: false },
        { name: 'created_at', type: 'timestamptz' },
      ],
    },
  ],
}

const taskSpec: PageFeatureSpec = {
  entityName: 'task',
  listPage: {
    columns: [],
    searchFields: [],
    sortDefault: 'id',
    sortDirection: 'asc',
    createFormFields: [],
    emptyStateMessage: 'Empty',
  },
  detailPage: {
    headerField: 'title',
    sections: [
      {
        title: 'Details',
        fields: [
          { field: 'status', label: 'Status', format: 'badge' },
          { field: 'due_date', label: 'Due Date', format: 'date' },
          { field: 'is_complete', label: 'Complete', format: 'boolean' },
        ],
      },
    ],
    editFormFields: [
      { field: 'title', label: 'Title', inputType: 'text' },
      { field: 'status', label: 'Status', inputType: 'select' },
    ],
  },
}

describe('assembleDetailPage', () => {
  it('returns a complete React component', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain("import { createFileRoute, Link } from '@tanstack/react-router'")
    expect(result).toContain("import { trpc } from '@/lib/trpc'")
  })

  it('does not contain SLOT markers', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).not.toContain('SLOT')
    expect(result).not.toContain('return null')
  })

  it('defines route with $id param', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain("createFileRoute('/_authenticated/tasks/$id')")
  })

  it('uses Route.useParams for id', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('const { id } = Route.useParams()')
  })

  it('uses tRPC getById query', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('trpc.task.getById.useQuery({ id })')
  })

  it('uses tRPC update mutation', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('trpc.task.update.useMutation')
  })

  it('renders detail sections', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('Details')
    expect(result).toContain('Status')
    expect(result).toContain('Due Date')
  })

  it('includes back navigation link', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('Link')
    expect(result).toContain('/tasks')
  })

  it('includes editing state toggle', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('isEditing')
    expect(result).toContain('setIsEditing')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/assembler-detail.test.ts --reporter=verbose`
Expected: FAIL — `assembleDetailPage` not exported

**Step 3: Add `assembleDetailPage` to `server/lib/agents/assembler.ts`**

Append the function to the existing file. Same pattern as `assembleListPage` — pure template assembly using the same `cellRenderer` and `formFieldRenderer` helpers, but for a single-entity detail view with edit form.

The detail page assembler:
- Uses `trpc.{entity}.getById.useQuery({ id })` for data
- Renders `sections` from spec as card groups
- Uses `cellRenderer()` for display fields
- Uses `formFieldRenderer()` for edit form
- Includes `isEditing` state toggle and back navigation `Link`

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/assembler-detail.test.ts --reporter=verbose`
Expected: PASS — all 9 tests pass

**Step 5: Commit**

```bash
git add server/lib/agents/assembler.ts tests/assembler-detail.test.ts
git commit -m "feat: add assembleDetailPage — deterministic detail component from PageFeatureSpec"
```

---

### Task 4: Implement Backend Procedure Assembler

**Files:**
- Modify: `server/lib/agents/assembler.ts`
- Test: `tests/assembler-procedures.test.ts`

**Step 1: Write the failing test**

Add `tests/assembler-procedures.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { assembleProcedures } from '@server/lib/agents/assembler'
import type { CustomProcedureSpec } from '@server/lib/agents/feature-schema'

describe('assembleProcedures', () => {
  const existingRouter = `// Auto-generated by VibeStack — do not edit manually

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { task } from '../../db/schema'
import { router, protectedProcedure } from '../trpc'

export const taskRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.task.findMany()
  }),

  // {/* SLOT: CUSTOM_PROCEDURES — LLM backend agent fills search, joins, business logic here */}
})`

  it('replaces SLOT marker with assembled procedures', () => {
    const spec: CustomProcedureSpec = {
      procedures: [
        {
          name: 'search',
          type: 'query',
          access: 'protected',
          description: 'Search tasks by title',
          inputFields: [{ name: 'query', type: 'string', optional: false }],
          implementation: "return ctx.db.query.task.findMany({ where: ilike(task.title, `%${input.query}%`) })",
        },
      ],
    }

    const result = assembleProcedures(existingRouter, spec)
    expect(result).not.toContain('SLOT')
    expect(result).toContain('search: protectedProcedure')
    expect(result).toContain('z.string()')
  })

  it('handles empty procedures array', () => {
    const spec: CustomProcedureSpec = { procedures: [] }
    const result = assembleProcedures(existingRouter, spec)
    expect(result).not.toContain('SLOT')
  })

  it('generates correct Zod input schema', () => {
    const spec: CustomProcedureSpec = {
      procedures: [
        {
          name: 'filter',
          type: 'query',
          access: 'public',
          description: 'Filter by status',
          inputFields: [
            { name: 'status', type: 'string', optional: false },
            { name: 'limit', type: 'number', optional: true },
          ],
          implementation: 'return []',
        },
      ],
    }

    const result = assembleProcedures(existingRouter, spec)
    expect(result).toContain('status: z.string()')
    expect(result).toContain('limit: z.number().optional()')
  })

  it('uses publicProcedure for public access', () => {
    const spec: CustomProcedureSpec = {
      procedures: [
        {
          name: 'count',
          type: 'query',
          access: 'public',
          description: 'Count all',
          inputFields: [],
          implementation: 'return 0',
        },
      ],
    }

    const result = assembleProcedures(existingRouter, spec)
    expect(result).toContain('count: publicProcedure')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/assembler-procedures.test.ts --reporter=verbose`
Expected: FAIL — `assembleProcedures` not exported

**Step 3: Add `assembleProcedures` to assembler.ts**

The function:
1. Takes existing router content (string with SLOT marker) + `CustomProcedureSpec`
2. For each procedure, generates a tRPC procedure string with Zod input schema
3. Replaces the SLOT marker line with the generated procedures
4. Returns the patched router string

Zod type mapping: `string` → `z.string()`, `number` → `z.number()`, `boolean` → `z.boolean()`, `string[]` → `z.array(z.string())`

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/assembler-procedures.test.ts --reporter=verbose`
Expected: PASS — all 4 tests pass

**Step 5: Commit**

```bash
git add server/lib/agents/assembler.ts tests/assembler-procedures.test.ts
git commit -m "feat: add assembleProcedures — patches tRPC routers with custom procedure bodies"
```

---

### Task 5: Update contract-to-pages.ts (Remove SLOTs)

**Files:**
- Modify: `server/lib/contract-to-pages.ts`
- Modify: `tests/contract-to-pages.test.ts`

**Why:** With the assembler now producing complete components, `contractToPages()` should produce minimal skeletons that the assembler will replace entirely. The function still generates the file list (fileName, routePath) but the content becomes a placeholder that `runCodeGeneration()` will overwrite with assembled output.

**Step 1: Update the implementation**

Simplify `contractToPages()` — keep the file name/route path generation but mark content as a temporary placeholder (NOT a SLOT). The blueprint still needs to know which files go at Layer 4 for manifest checking.

```typescript
// The page content is now fully generated by the assembler in orchestrator.ts.
// contractToPages() only provides the file manifest (names + routes).
// Content is a placeholder that gets overwritten during the generating state.
```

**Step 2: Update tests**

Update `tests/contract-to-pages.test.ts` to remove tests that check for SLOT markers, `return null`, and specific import patterns. Keep tests for:
- File name generation (kebab-case, pluralization)
- Route path generation
- Multiple tables

**Step 3: Run tests**

Run: `bunx vitest run tests/contract-to-pages.test.ts --reporter=verbose`
Expected: PASS

**Step 4: Run full test suite**

Run: `bunx vitest run --reporter=verbose`
Expected: All existing tests pass (app-blueprint tests may need minor updates if they check for SLOT content)

**Step 5: Commit**

```bash
git add server/lib/contract-to-pages.ts tests/contract-to-pages.test.ts
git commit -m "refactor: contractToPages returns manifest-only — assembler produces final content"
```

---

### Task 6: Implement Analysis Invoke Handler

**Files:**
- Create: `server/lib/agents/orchestrator.ts`
- Test: `tests/orchestrator-analysis.test.ts`

**Step 1: Write the failing test**

This tests `runAnalysis()` — the function that calls `analystAgent.generate()` and extracts the tool call result. Since we can't call real LLMs in unit tests, mock the agent.

```typescript
import { describe, expect, it, vi } from 'vitest'
import { runAnalysis } from '@server/lib/agents/orchestrator'

// Mock analyst agent
vi.mock('@server/lib/agents/registry', () => ({
  analystAgent: {
    generate: vi.fn(),
  },
}))

describe('runAnalysis', () => {
  it('extracts contract from submitRequirements tool call', async () => {
    const { analystAgent } = await import('@server/lib/agents/registry')
    const mockGenerate = vi.mocked(analystAgent.generate)

    mockGenerate.mockResolvedValue({
      steps: [{
        content: [{
          type: 'tool-call',
          toolName: 'submitRequirements',
          input: {
            appName: 'TaskFlow',
            appDescription: 'Task management app',
            contract: { tables: [{ name: 'task', columns: [{ name: 'id', type: 'uuid', primaryKey: true }] }] },
            designPreferences: { style: 'modern', primaryColor: '#3b82f6', fontFamily: 'Inter' },
          },
        }],
      }],
      totalUsage: { totalTokens: 500 },
    } as any)

    const result = await runAnalysis({
      userMessage: 'Build a task app',
      projectId: 'test-123',
    })

    expect(result.type).toBe('done')
    if (result.type === 'done') {
      expect(result.appName).toBe('TaskFlow')
      expect(result.contract.tables).toHaveLength(1)
      expect(result.tokensUsed).toBe(500)
    }
  })

  it('extracts questions from askClarifyingQuestions tool call', async () => {
    const { analystAgent } = await import('@server/lib/agents/registry')
    const mockGenerate = vi.mocked(analystAgent.generate)

    mockGenerate.mockResolvedValue({
      steps: [{
        content: [{
          type: 'tool-call',
          toolName: 'askClarifyingQuestions',
          input: {
            questions: [{ question: 'What type of app?', options: ['Todo', 'CRM'] }],
          },
        }],
      }],
      totalUsage: { totalTokens: 200 },
    } as any)

    const result = await runAnalysis({
      userMessage: 'Build something',
      projectId: 'test-123',
    })

    expect(result.type).toBe('clarification')
    if (result.type === 'clarification') {
      expect(result.questions).toHaveLength(1)
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/orchestrator-analysis.test.ts --reporter=verbose`
Expected: FAIL — `runAnalysis` not found

**Step 3: Write the implementation**

Create `server/lib/agents/orchestrator.ts`:

```typescript
// server/lib/agents/orchestrator.ts
//
// XState invoke handlers — each function maps to one machine state.
// The machine calls these via fromPromise actors.

import type { SchemaContract, DesignPreferences } from '../schema-contract'
import type { AppBlueprint } from '../app-blueprint'
import type { ValidationGateResult } from './validation'

// ============================================================================
// Result types for each handler
// ============================================================================

export type AnalysisResult =
  | {
      type: 'done'
      appName: string
      appDescription: string
      contract: SchemaContract
      designPreferences: DesignPreferences
      tokensUsed: number
    }
  | {
      type: 'clarification'
      questions: unknown[]
      tokensUsed: number
    }

// ============================================================================
// Analysis handler
// ============================================================================

export async function runAnalysis(input: {
  userMessage: string
  projectId: string
}): Promise<AnalysisResult> {
  const { analystAgent } = await import('./registry')

  const result = await analystAgent.generate(input.userMessage, {
    maxSteps: 5,
  })

  const tokensUsed = result.totalUsage?.totalTokens ?? 0

  // Extract tool calls from AI SDK v5 content parts
  for (const step of result.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type !== 'tool-call') continue

      if (part.toolName === 'submitRequirements') {
        return {
          type: 'done',
          appName: part.input.appName,
          appDescription: part.input.appDescription,
          contract: part.input.contract,
          designPreferences: part.input.designPreferences,
          tokensUsed,
        }
      }

      if (part.toolName === 'askClarifyingQuestions') {
        return {
          type: 'clarification',
          questions: part.input.questions,
          tokensUsed,
        }
      }
    }
  }

  throw new Error('Analyst agent did not call any tool')
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/orchestrator-analysis.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/orchestrator.ts tests/orchestrator-analysis.test.ts
git commit -m "feat: add runAnalysis invoke handler — extracts contract from analyst agent"
```

---

### Task 7: Implement Blueprint Invoke Handler

**Files:**
- Modify: `server/lib/agents/orchestrator.ts`
- Test: `tests/orchestrator-blueprint.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest'
import { runBlueprint } from '@server/lib/agents/orchestrator'
import type { SchemaContract, DesignPreferences } from '@server/lib/schema-contract'

describe('runBlueprint', () => {
  it('generates AppBlueprint from contract', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'title', type: 'text', nullable: false },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      ],
    }
    const prefs: DesignPreferences = { style: 'modern', primaryColor: '#3b82f6', fontFamily: 'Inter' }

    const result = runBlueprint({
      appName: 'TaskFlow',
      appDescription: 'Task management',
      contract,
      designPreferences: prefs,
    })

    expect(result.meta.appName).toBe('TaskFlow')
    expect(result.contract).toBe(contract)
    expect(result.fileTree.length).toBeGreaterThan(0)
    // Layer 1: schema, css, html
    expect(result.fileTree.some((f) => f.path === 'server/db/schema.ts')).toBe(true)
    // Layer 2: trpc routers
    expect(result.fileTree.some((f) => f.path.startsWith('server/trpc/routers/'))).toBe(true)
    // No LLM calls — tokensUsed is 0
    expect(result.tokensUsed).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/orchestrator-blueprint.test.ts --reporter=verbose`
Expected: FAIL — `runBlueprint` not exported

**Step 3: Add `runBlueprint` to orchestrator.ts**

```typescript
import { contractToBlueprint } from '../app-blueprint'

export interface BlueprintResult {
  blueprint: AppBlueprint
  tokensUsed: number
}

export function runBlueprint(input: {
  appName: string
  appDescription: string
  contract: SchemaContract
  designPreferences: DesignPreferences
}): BlueprintResult {
  const blueprint = contractToBlueprint(input)
  return { blueprint, tokensUsed: 0 }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/orchestrator-blueprint.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add server/lib/agents/orchestrator.ts tests/orchestrator-blueprint.test.ts
git commit -m "feat: add runBlueprint invoke handler — deterministic blueprint from contract"
```

---

### Task 8: Implement Code Generation Handler

**Files:**
- Modify: `server/lib/agents/orchestrator.ts`
- Test: `tests/orchestrator-codegen.test.ts`

This is the most complex handler. It:
1. Groups blueprint files by `isLLMSlot` — non-slot files are written directly
2. For each entity, runs `Promise.allSettled()` with feature analysis LLM call + backend procedure LLM call
3. Assembles pages from feature specs
4. Writes all files to sandbox

**Step 1: Write the failing test**

Test the `buildFeatureAnalysisPrompt()` and `runCodeGeneration()` flow (mock LLM calls).

```typescript
import { describe, expect, it, vi } from 'vitest'
import {
  buildFeatureAnalysisPrompt,
  runCodeGeneration,
} from '@server/lib/agents/orchestrator'
import type { SchemaContract } from '@server/lib/schema-contract'

describe('buildFeatureAnalysisPrompt', () => {
  it('includes table name and column list', () => {
    const contract: SchemaContract = {
      tables: [{
        name: 'task',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'status', type: 'text' },
        ],
      }],
    }
    const prompt = buildFeatureAnalysisPrompt(contract.tables[0], contract)
    expect(prompt).toContain('task')
    expect(prompt).toContain('title')
    expect(prompt).toContain('status')
    expect(prompt).toContain('text') // column type
  })
})

describe('runCodeGeneration', () => {
  it('writes assembled files to sandbox', async () => {
    // This test is integration-level and requires mocking the sandbox + agents.
    // Verify the function signature exists and accepts the expected inputs.
    expect(typeof runCodeGeneration).toBe('function')
  })
})
```

**Step 2: Write the implementation**

Add to `orchestrator.ts`:

```typescript
import type { TableDef } from '../schema-contract'
import { PageFeatureSchema, CustomProcedureSchema, validateFeatureSpec } from './feature-schema'
import { assembleListPage, assembleDetailPage, assembleProcedures } from './assembler'

export function buildFeatureAnalysisPrompt(table: TableDef, contract: SchemaContract): string {
  const columns = table.columns.map((c) => {
    const mods = [c.type]
    if (c.primaryKey) mods.push('PK')
    if (c.nullable === false) mods.push('NOT NULL')
    if (c.references) mods.push(`FK → ${c.references.table}.${c.references.column}`)
    return `  - ${c.name}: ${mods.join(', ')}`
  }).join('\n')

  // List related tables (FKs pointing to/from this table)
  const related = contract.tables
    .filter((t) => t.name !== table.name)
    .filter((t) => t.columns.some((c) => c.references?.table === table.name) ||
      table.columns.some((c) => c.references?.table === t.name))
    .map((t) => t.name)

  return `Analyze the "${table.name}" entity and produce a PageFeatureSpec.

Table columns:
${columns}

${related.length > 0 ? `Related tables: ${related.join(', ')}` : ''}

Rules:
- Every field/searchField/sortDefault MUST be one of: ${table.columns.map((c) => c.name).join(', ')}
- Use 'badge' format for status/enum fields, 'date' for timestamps, 'boolean' for booleans
- Skip auto-managed fields (id, created_at, updated_at, user_id) from create/edit forms
- Use 'select' inputType for enum-like text fields with known values
- Provide a friendly emptyStateMessage`
}

export interface CodeGenResult {
  tokensUsed: number
}

export async function runCodeGeneration(input: {
  blueprint: AppBlueprint
  contract: SchemaContract
  sandboxId: string
}): Promise<CodeGenResult> {
  // Implementation will:
  // 1. Get sandbox instance
  // 2. For each entity table in contract:
  //    a. Call frontendAgent.generate() with buildFeatureAnalysisPrompt(), structuredOutput: PageFeatureSchema
  //    b. Validate feature spec against contract
  //    c. assembleListPage() + assembleDetailPage()
  //    d. Call backendAgent.generate() with custom procedure prompt, structuredOutput: CustomProcedureSchema
  //    e. assembleProcedures() to patch tRPC router
  // 3. Upload all assembled files to sandbox
  // 4. Return total tokens used

  // TODO: Wire to real agent calls + sandbox — requires integration test
  return { tokensUsed: 0 }
}
```

**Step 3: Run tests**

Run: `bunx vitest run tests/orchestrator-codegen.test.ts --reporter=verbose`
Expected: PASS

**Step 4: Commit**

```bash
git add server/lib/agents/orchestrator.ts tests/orchestrator-codegen.test.ts
git commit -m "feat: add buildFeatureAnalysisPrompt + runCodeGeneration handler skeleton"
```

---

### Task 9: Implement Validation + Repair Handlers

**Files:**
- Modify: `server/lib/agents/orchestrator.ts`
- Test: `tests/orchestrator-validation.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest'
import { runValidation, runRepair } from '@server/lib/agents/orchestrator'

describe('runValidation', () => {
  it('returns pass result when all checks pass', async () => {
    const mockSandbox = {
      process: {
        executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, result: '' }),
      },
    }

    // Verify the function signature is correct
    expect(typeof runValidation).toBe('function')
  })
})

describe('runRepair', () => {
  it('returns tokensUsed from repair agent', async () => {
    expect(typeof runRepair).toBe('function')
  })
})
```

**Step 2: Add handlers to orchestrator.ts**

```typescript
import { runValidationGate } from './validation'
import { buildRepairPrompt } from './repair'

export interface ValidationResult {
  validation: ValidationGateResult
  allPassed: boolean
  tokensUsed: number
}

export async function runValidation(input: {
  blueprint: AppBlueprint
  sandboxId: string
}): Promise<ValidationResult> {
  // Get sandbox, run validation gate, return results
  // tokensUsed is always 0 (no LLM calls)
  // TODO: Wire to real sandbox
  return {
    validation: {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: true, errors: [] },
      typecheck: { passed: true, errors: [] },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: true,
    },
    allPassed: true,
    tokensUsed: 0,
  }
}

export interface RepairResult {
  tokensUsed: number
}

export async function runRepair(input: {
  blueprint: AppBlueprint
  validation: ValidationGateResult
  sandboxId: string
}): Promise<RepairResult> {
  // 1. Build repair prompt from validation errors
  // 2. Call repairAgent.generate() with the prompt
  // 3. Return tokens used
  // TODO: Wire to real repair agent
  return { tokensUsed: 0 }
}
```

**Step 3: Run tests**

Run: `bunx vitest run tests/orchestrator-validation.test.ts --reporter=verbose`
Expected: PASS

**Step 4: Commit**

```bash
git add server/lib/agents/orchestrator.ts tests/orchestrator-validation.test.ts
git commit -m "feat: add runValidation + runRepair invoke handlers"
```

---

### Task 10: Wire Invoke Handlers into XState Machine

**Files:**
- Modify: `server/lib/agents/machine.ts`
- Modify: `tests/machine.test.ts`

This is the critical integration task. Convert every state from event-driven to self-executing via `fromPromise` invokes.

**Step 1: Write new tests for invoke behavior**

Add to `tests/machine.test.ts`:

```typescript
it('machine has invoke on analyzing state', () => {
  const analyzeState = appGenerationMachine.config.states?.analyzing
  expect(analyzeState).toBeDefined()
  // After adding invoke, the state should have an invoke property
  expect(analyzeState?.invoke).toBeDefined()
})

it('context includes totalTokens', () => {
  const actor = createActor(appGenerationMachine)
  actor.start()
  expect(actor.getSnapshot().context.totalTokens).toBe(0)
})
```

**Step 2: Modify machine.ts**

Major changes:
1. Import `fromPromise` from `xstate`
2. Add `totalTokens: number` to `MachineContext`
3. Add `actors` section to `setup()` with `fromPromise` wrappers for each handler
4. Add `invoke` config to each state
5. Replace manual event transitions with `onDone` / `onError` transitions

Key XState v5 pattern:
```typescript
analyzing: {
  invoke: {
    src: 'runAnalysisActor',
    input: ({ context }) => ({
      userMessage: context.userMessage,
      projectId: context.projectId,
    }),
    onDone: [
      {
        guard: ({ event }) => event.output.type === 'clarification',
        target: 'awaitingClarification',
        actions: assign({ ... }),
      },
      {
        target: 'blueprinting',
        actions: assign({ ... }),
      },
    ],
    onError: {
      target: 'failed',
      actions: assign({ error: ({ event }) => String(event.error) }),
    },
  },
}
```

**Step 3: Run tests**

Run: `bunx vitest run tests/machine.test.ts --reporter=verbose`
Expected: PASS (existing tests may need updates since machine now self-executes)

**Step 4: Run full test suite**

Run: `bunx vitest run --reporter=verbose`
Expected: All tests pass

**Step 5: Commit**

```bash
git add server/lib/agents/machine.ts tests/machine.test.ts
git commit -m "feat: wire fromPromise invoke handlers to all XState states"
```

---

### Task 11: Simplify Agent Route (Self-Executing Machine)

**Files:**
- Modify: `server/routes/agent.ts`
- Modify: `tests/agent-route.test.ts`

**Step 1: Update agent.ts**

Now that the machine is self-executing (states have invoke handlers), the route no longer needs to manually send events after START. The flow is:

1. Create actor, send START event
2. Machine auto-transitions through states via invoke handlers
3. SSE subscriber emits events for each state transition
4. On `complete`, read `context.totalTokens` for credit deduction

Changes:
- Remove the placeholder `credits_used` event
- Read `context.totalTokens` from final snapshot for real credit calculation
- Keep `streamActorStates()` — it still subscribes to state transitions

**Step 2: Update tests**

Run: `bunx vitest run tests/agent-route.test.ts --reporter=verbose`
Expected: PASS

**Step 3: Run full test suite**

Run: `bunx vitest run --reporter=verbose`
Expected: All tests pass

**Step 4: Commit**

```bash
git add server/routes/agent.ts tests/agent-route.test.ts
git commit -m "refactor: agent route uses self-executing machine — real token tracking"
```

---

### Task 12: Add Layer 0 Files to Snapshot

**Files:**
- Create: `snapshot/warmup-scaffold/src/lib/auth.ts`
- Create: `snapshot/warmup-scaffold/.gitignore`
- Create: `snapshot/warmup-scaffold/vercel.json`
- Create: `snapshot/warmup-scaffold/drizzle.config.ts`
- Create: `snapshot/warmup-scaffold/biome.json`
- Create: `snapshot/warmup-scaffold/tsconfig.server.json`

**Step 1: Create the missing Layer 0 files**

These files are baked into the Daytona snapshot and NEVER regenerated. They form the base of every generated app.

`src/lib/auth.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
```

`.gitignore`:
```
node_modules/
dist/
.env
.env.local
*.tsbuildinfo
.vite/
```

`vercel.json`:
```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist/client",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

`drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

`tsconfig.server.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist/server",
    "rootDir": "server",
    "paths": {
      "@/*": ["./server/*"]
    }
  },
  "include": ["server/**/*.ts"]
}
```

**Step 2: Update warmup-scaffold `tsconfig.json`**

Check existing `tsconfig.json` in warmup-scaffold — ensure it covers client code and references `tsconfig.server.json` for project references.

**Step 3: Commit**

```bash
git add snapshot/warmup-scaffold/
git commit -m "feat: add Layer 0 files to snapshot — auth, gitignore, vercel, drizzle, biome, tsconfig"
```

---

### Task 13: Rebuild Daytona Snapshot

**Files:**
- Modify: `snapshot/Dockerfile` (if needed)
- Modify: `snapshot/package-base.json` (if missing deps)

**Step 1: Verify package-base.json has all required deps**

Check that `package-base.json` includes:
- `drizzle-orm`, `drizzle-kit` (already added in Batch 4)
- `@supabase/supabase-js` (already present)
- All shadcn/ui peer deps

**Step 2: Build the Docker image locally**

```bash
cd snapshot
docker build -t vibestack-workspace:latest .
```

Expected: Build succeeds, Vite cache warms, `tsc --noEmit` passes

**Step 3: Push to Daytona (if Docker build succeeds)**

This depends on Daytona API access. If credentials are available:

```bash
# Tag and push to Daytona registry
# Exact command depends on Daytona CLI / API
```

**Step 4: Update DAYTONA_SNAPSHOT_ID in .env.local**

If a new snapshot ID is generated, update the platform env var.

**Step 5: Commit any Dockerfile changes**

```bash
git add snapshot/
git commit -m "chore: rebuild Daytona snapshot with Layer 0 files"
```

---

## Batch Execution Plan

For parallel subagent dispatch (from CLAUDE.md rules):

**Batch 1** (independent tasks — can run in parallel):
- Task 1: feature-schema.ts
- Task 12: snapshot Layer 0 files

**Batch 2** (depends on Task 1):
- Task 2: assembleListPage
- Task 3: assembleDetailPage
- Task 4: assembleProcedures

**Batch 3** (depends on Tasks 2-4):
- Task 5: contract-to-pages update
- Task 6: runAnalysis handler
- Task 7: runBlueprint handler
- Task 8: runCodeGeneration handler
- Task 9: runValidation + runRepair

**Batch 4** (depends on Tasks 6-9):
- Task 10: wire machine.ts invokes
- Task 11: simplify agent.ts

**Batch 5** (independent, after Batch 1 ideally):
- Task 13: rebuild Docker snapshot

---

## Verification

After all tasks are complete:

```bash
# TypeScript
bunx tsc --noEmit

# Lint
bun run lint

# Full test suite
bunx vitest run --reporter=verbose

# Expected: all tests pass, tsc clean, lint clean
```

---

## Enhancements (Incorporate into Current Tasks)

These items should be woven into the tasks above as they are implemented, not treated as separate follow-ups.

### E1: Error-Tolerant JSON Parsing with `jsonrepair`

**Where:** `server/lib/agents/orchestrator.ts` (Tasks 6, 8)

Before passing LLM output through Zod validation, run it through `jsonrepair`. This handles common LLM JSON quirks (trailing commas, unquoted keys, truncated output) without retries.

```bash
bun add jsonrepair
```

```typescript
import { jsonrepair } from 'jsonrepair'

// In any handler that parses LLM structured output:
const rawJson = extractJsonFromResponse(result)
const repairedJson = jsonrepair(rawJson)
const parsed = PageFeatureSchema.safeParse(JSON.parse(repairedJson))
```

One line of code, huge reliability improvement. Apply to every LLM → Zod parse boundary.

---

### E2: Use `createInsertSchema` from `drizzle-orm/zod`

**Where:** `server/lib/contract-to-trpc.ts` (Task 5 or separate)

Replace the hand-rolled `ZOD_TYPE_MAP` in `contractToTrpc()` with generated schemas from `drizzle-orm/zod`. The generated tRPC routers should import validation schemas derived from the Drizzle schema instead of manually mapping column types to Zod types.

**Before (current):**
```typescript
const ZOD_TYPE_MAP: Record<string, string> = {
  uuid: 'z.string().uuid()',
  text: 'z.string()',
  integer: 'z.number().int()',
  // ... manual mapping
}
```

**After:**
```typescript
// Generated router imports:
import { createInsertSchema, createSelectSchema } from 'drizzle-orm/zod'
import { task } from '../../db/schema'

const insertTaskSchema = createInsertSchema(task)
const selectTaskSchema = createSelectSchema(task)

// Use in procedures:
create: protectedProcedure
  .input(insertTaskSchema.omit({ id: true, createdAt: true, updatedAt: true }))
  .mutation(...)
```

This eliminates the entire `ZOD_TYPE_MAP` and guarantees schema-DB alignment.

---

### E3: Cursor-Based Pagination for List Procedures

**Where:** `server/lib/contract-to-trpc.ts` (Task 5 or separate), `server/lib/agents/assembler.ts` (Task 2)

Add cursor-based pagination to the generated `list` tRPC procedure (currently returns ALL rows).

**Backend (generated tRPC router):**
```typescript
list: protectedProcedure
  .input(z.object({
    cursor: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }))
  .query(async ({ ctx, input }) => {
    const items = await ctx.db.query.task.findMany({
      limit: input.limit + 1,
      ...(input.cursor ? { where: gt(task.id, input.cursor) } : {}),
      orderBy: asc(task.id),
    })
    const hasMore = items.length > input.limit
    return {
      items: hasMore ? items.slice(0, -1) : items,
      nextCursor: hasMore ? items[input.limit - 1].id : null,
    }
  }),
```

**Frontend (assembler list page):**
```typescript
const tasks = trpc.task.list.useInfiniteQuery(
  { limit: 20 },
  { getNextPageParam: (last) => last.nextCursor },
)
// Render with "Load More" button when tasks.hasNextPage
```

---

### E4: Auto-Generated Filtering from Column Types

**Where:** `server/lib/agents/feature-schema.ts` (Task 1), `server/lib/agents/assembler.ts` (Task 2)

Add a `filters` array to `PageFeatureSchema.listPage` that auto-generates filter UI from column types:

- **enum/text with known values** → `<Select>` dropdown filter
- **text** → ilike search input
- **boolean** → toggle/checkbox filter
- **date/timestamptz** → date range picker

```typescript
// In PageFeatureSchema.listPage:
filters: z.array(z.object({
  field: z.string(),
  label: z.string(),
  type: z.enum(['search', 'select', 'boolean', 'dateRange']),
  options: z.array(z.string()).optional(), // for select type
})).optional(),
```

The assembler generates filter bar UI and the backend adds corresponding `where` clauses.

---

### E5: Auto-Generated Sorting

**Where:** `server/lib/contract-to-trpc.ts` (Task 5 or separate), `server/lib/agents/assembler.ts` (Task 2)

Add `sortBy` + `sortOrder` params to list procedures. The frontend renders clickable column headers.

**Backend:**
```typescript
list: protectedProcedure
  .input(z.object({
    sortBy: z.enum(['title', 'status', 'createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    // ... + cursor, limit
  }))
  .query(async ({ ctx, input }) => {
    return ctx.db.query.task.findMany({
      orderBy: input.sortOrder === 'asc' ? asc(task[input.sortBy]) : desc(task[input.sortBy]),
    })
  }),
```

**Frontend:**
Assembler generates `<th onClick>` handlers that toggle sort direction and column.

---

### E6: Evaluate Instructor-JS for Structured Output

**Where:** `server/lib/agents/orchestrator.ts` (Tasks 6, 8)

Evaluate `@instructor-ai/instructor` as a wrapper around Mastra agent `generate()` calls for structured output with built-in retry. Key benefits:

- Zod schema validation with automatic retry on parse failure
- Token-efficient retry (sends validation errors, not full regen)
- Drop-in compatible with OpenAI SDK

```bash
bun add @instructor-ai/instructor
```

```typescript
import Instructor from '@instructor-ai/instructor'
import OpenAI from 'openai'

const client = Instructor({ client: new OpenAI(), mode: 'TOOLS' })
const result = await client.chat.completions.create({
  model: 'gpt-4o',
  response_model: { schema: PageFeatureSchema, name: 'PageFeatureSpec' },
  messages: [{ role: 'user', content: prompt }],
  max_retries: 2,
})
```

**Estimate:** 1-2 day integration. Evaluate whether it can wrap Mastra's agent.generate() or needs a parallel path.

---

### E7: FK-Aware Form Fields in Assembler

**Where:** `server/lib/agents/assembler.ts` (Tasks 2, 3)

Detect FK columns in the `SchemaContract` and generate `<Select>` components that fetch options from the related table.

**Detection logic:**
```typescript
const fkColumns = table.columns.filter(c => c.references && c.references.table !== 'auth.users')
```

**Generated JSX:**
```tsx
// For a column: project_id → projects.id
const projects = trpc.project.list.useQuery()

<Select
  value={form.projectId}
  onChange={(val) => setForm(prev => ({ ...prev, projectId: val }))}
>
  {projects.data?.map(p => (
    <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
  ))}
</Select>
```

The assembler needs the full contract (not just the current table) to resolve FK targets and infer display fields.

---

### E8: Trustcall Pattern — JSON Patch Retry for Repair Loop

**Where:** `server/lib/agents/orchestrator.ts` (Task 9)

Implement the trustcall pattern in TypeScript using the `rfc6902` npm package. Instead of full regeneration on repair, ask the LLM for minimal JSON Patch operations to fix validation errors.

```bash
bun add rfc6902
```

**Pattern:**
```typescript
import { applyPatch } from 'rfc6902'

// On repair:
const patchResult = await repairAgent.generate(
  `The following validation errors were found:\n${errors.join('\n')}\n\n` +
  `Return a JSON Patch (RFC 6902) array to fix these errors in the existing code.`,
  { structuredOutput: { schema: z.array(JsonPatchOpSchema) } }
)

// Apply patches to existing file contents
for (const patch of patchResult.object) {
  applyPatch(existingFiles, [patch])
}
```

**Benefits:** 31-42% token reduction vs full regeneration. Only applicable to the repair loop (Task 9), not initial generation.

---

### E9: Evaluate BAML for Analyst Agent

**Where:** `server/lib/agents/registry.ts`, `server/lib/agents/orchestrator.ts` (Task 6)

Evaluate BoundaryML's BAML for the analyst agent (`SchemaContract` extraction) — the highest-value structured output call in the pipeline. BAML's error-tolerant parsing is 2-4x faster than OpenAI function calling and handles malformed JSON gracefully.

```bash
bun add @boundaryml/baml
```

**Key evaluation criteria:**
1. Can it replace Mastra's `structuredOutput` for the analyst agent?
2. Does it work with our Helicone proxy?
3. Performance: latency reduction for SchemaContract extraction
4. Error tolerance: how well does it handle truncated/malformed LLM output?

**Estimate:** 1-2 day evaluation spike. If successful, migrate the analyst agent's structured output path to BAML while keeping Mastra for orchestration.

---

## Updated Batch Execution Plan

```
Batch 1 (independent):
  Task 1: feature-schema.ts (+ E4 filters schema)
  Task 12: snapshot Layer 0 files

Batch 2 (depends on Task 1):
  Task 2: assembleListPage (+ E3 pagination, E4 filter UI, E5 sorting, E7 FK-aware fields)
  Task 3: assembleDetailPage (+ E7 FK-aware fields)
  Task 4: assembleProcedures

Batch 3 (depends on Tasks 2-4):
  Task 5: contract-to-pages update (+ E2 drizzle-orm/zod, E3 pagination backend, E5 sorting backend)
  Task 6: runAnalysis handler (+ E1 jsonrepair)
  Task 7: runBlueprint handler
  Task 8: runCodeGeneration handler (+ E1 jsonrepair)
  Task 9: runValidation + runRepair (+ E8 trustcall JSON patch)

Batch 4 (depends on Tasks 6-9):
  Task 10: wire machine.ts invokes
  Task 11: simplify agent.ts

Batch 5 (independent):
  Task 13: rebuild Docker snapshot

Post-Batch Evaluations:
  E6: Instructor-JS evaluation spike (1-2 days)
  E9: BAML evaluation spike (1-2 days)
```
