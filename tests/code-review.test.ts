import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDeterministicChecks, runCodeReview } from '@server/lib/agents/code-review'
import type { AppBlueprint } from '@server/lib/app-blueprint'
import type { SchemaContract } from '@server/lib/schema-contract'

// ============================================================================
// Mock Mastra Agent
// ============================================================================

const mockGenerate = vi.fn().mockResolvedValue({
  object: { issues: [], summary: 'All good' },
  totalUsage: { totalTokens: 500 },
})

vi.mock('@mastra/core/agent', () => {
  return {
    Agent: class MockAgent {
      generate = mockGenerate
    },
  }
})

vi.mock('@server/lib/agents/provider', () => ({
  createHeliconeProvider: vi.fn(() => vi.fn(() => 'mock-model')),
  createAgentModelResolver: vi.fn(() => () => 'mock-model'),
  PIPELINE_MODELS: {
    orchestrator: 'gpt-5.2',
    codegen: 'gpt-5.2-codex',
    review: 'gpt-5.1',
    repair: 'gpt-5-mini',
    edit: 'gpt-5-mini',
    format: 'gpt-5-nano',
  },
}))

// ============================================================================
// Test Data Builders
// ============================================================================

function createMockBlueprint(files: Array<{ path: string; content: string }>): AppBlueprint {
  return {
    meta: {
      appName: 'Test App',
      appDescription: 'Test description',
      designPreferences: { style: 'modern', primaryColor: '#3b82f6', fontFamily: 'Inter' },
    },
    features: { auth: false, entities: ['tasks'] },
    contract: {
      tables: [
        {
          name: 'tasks',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    },
    fileTree: files.map((f) => ({
      path: f.path,
      content: f.content,
      layer: 4,
      isLLMSlot: true,
    })),
  }
}

function createMockContract(): SchemaContract {
  return {
    tables: [
      {
        name: 'tasks',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'title', type: 'text' },
          { name: 'description', type: 'text', nullable: true },
          { name: 'completed', type: 'boolean', default: 'false' },
        ],
      },
      {
        name: 'projects',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'text' },
        ],
      },
    ],
  }
}

// ============================================================================
// Deterministic Checks Tests
// ============================================================================

describe('runDeterministicChecks', () => {
  it('detects missing route export', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { createFileRoute } from '@tanstack/react-router'

function TasksPage() {
  return <div>Tasks</div>
}
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())

    // Should find: missing route export, missing error boundary, missing loading state (no useQuery in this case)
    const routeExportIssue = issues.find(i => i.type === 'missing_route_export')
    expect(routeExportIssue).toBeDefined()
    expect(routeExportIssue?.severity).toBe('critical')
    expect(routeExportIssue?.file).toBe('src/routes/_authenticated/tasks.tsx')
    expect(routeExportIssue?.message).toContain('export const Route')
  })

  it('detects hardcoded Stripe secret', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({ component: Tasks })

const stripeKey = "sk_live_12345678901234567890123456789012"

function Tasks() {
  return <div>Tasks</div>
}
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())

    expect(issues.length).toBeGreaterThanOrEqual(1)
    const secretIssue = issues.find(i => i.type === 'hardcoded_secret')
    expect(secretIssue).toBeDefined()
    expect(secretIssue?.severity).toBe('critical')
    expect(secretIssue?.message).toContain('hardcoded secret')
  })

  it('detects hardcoded Supabase key', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({ component: Tasks })

const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ"

function Tasks() {
  return <div>Tasks</div>
}
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())

    const secretIssue = issues.find(i => i.type === 'hardcoded_secret')
    expect(secretIssue).toBeDefined()
    expect(secretIssue?.severity).toBe('critical')
  })

  it('detects missing loading state', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({ component: Tasks, errorComponent: ErrorBoundary })

function Tasks() {
  const { data } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}

function ErrorBoundary({ error }: { error: Error }) {
  return <div>{error.message}</div>
}
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())

    const loadingIssue = issues.find(i => i.type === 'missing_loading_state')
    expect(loadingIssue).toBeDefined()
    expect(loadingIssue?.severity).toBe('warning')
    expect(loadingIssue?.message).toContain('useQuery')
  })

  it('detects missing error boundary', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({ component: Tasks })

function Tasks() {
  return <div>Tasks</div>
}
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())

    const errorBoundaryIssue = issues.find(i => i.type === 'missing_error_boundary')
    expect(errorBoundaryIssue).toBeDefined()
    expect(errorBoundaryIssue?.severity).toBe('warning')
    expect(errorBoundaryIssue?.message).toContain('error boundary')
  })

  it('detects contract mismatch (missing entity page)', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({ component: Tasks })

function Tasks() {
  return <div>Tasks</div>
}
`,
      },
    ])

    const contract: SchemaContract = {
      tables: [
        {
          name: 'tasks',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
        {
          name: 'projects',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }

    const issues = runDeterministicChecks(blueprint, contract)

    const contractIssue = issues.find(
      i => i.type === 'contract_mismatch' && i.message.includes('projects')
    )
    expect(contractIssue).toBeDefined()
    expect(contractIssue?.severity).toBe('warning')
  })

  it('returns empty array for clean code', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}

function ErrorBoundary({ error }: { error: Error }) {
  return <div>Error: {error.message}</div>
}
`,
      },
    ])

    const contract: SchemaContract = {
      tables: [
        {
          name: 'tasks',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }

    const issues = runDeterministicChecks(blueprint, contract)

    expect(issues).toHaveLength(0)
  })

  it('skips junction tables (starting with _)', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: '_task_tags',
          columns: [
            { name: 'task_id', type: 'uuid', references: { table: 'tasks', column: 'id' } },
            { name: 'tag_id', type: 'uuid', references: { table: 'tags', column: 'id' } },
          ],
        },
      ],
    }

    const blueprint = createMockBlueprint([])

    const issues = runDeterministicChecks(blueprint, contract)

    // Should not report missing page for junction table
    const contractIssue = issues.find(i => i.type === 'contract_mismatch')
    expect(contractIssue).toBeUndefined()
  })

  // ============================================================================
  // Check 6: stale_trpc_import
  // ============================================================================

  it('detects stale tRPC @trpc/ package import', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { createTRPCReact } from '@trpc/react-query'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() { return <div>Tasks</div> }
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'stale_trpc_import')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('critical')
    expect(issue?.message).toContain('tRPC')
  })

  it('detects stale tRPC lib/trpc import', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { trpc } from '@/lib/trpc'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() { return <div>Tasks</div> }
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'stale_trpc_import')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('critical')
  })

  it('detects stale tRPC hook usage pattern', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data } = trpc.task.list.useQuery()
  return <div>{data}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'stale_trpc_import')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('critical')
  })

  it('does not flag route files without any tRPC patterns', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'stale_trpc_import')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 7: missing_supabase_import
  // ============================================================================

  it('detects missing supabase import when supabase.from() is used', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  return <div>{data}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_supabase_import')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('@/lib/supabase')
  })

  it('does not flag missing_supabase_import when import is present', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_supabase_import')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 8: missing_query_key
  // ============================================================================

  it('detects missing queryKey in useQuery call', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_query_key')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('queryKey')
  })

  it('does not flag missing_query_key when queryKey is present', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_query_key')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 9: missing_mutation_invalidation
  // ============================================================================

  it('detects missing invalidateQueries in useMutation', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const mutation = useMutation({
    mutationFn: (title: string) => supabase.from('tasks').insert({ title }),
  })
  return <button onClick={() => mutation.mutate('New Task')}>Add</button>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_mutation_invalidation')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('cache management')
  })

  it('does not flag mutation with invalidateQueries', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (title: string) => supabase.from('tasks').insert({ title }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }) },
  })
  return <button onClick={() => mutation.mutate('New Task')}>Add</button>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_mutation_invalidation')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 10: missing_single_modifier
  // ============================================================================

  it('detects missing .single() on detail page with .eq(\'id\', ...)', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.$id.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks/$id')({
  component: TaskDetail,
  errorComponent: ErrorBoundary,
})

function TaskDetail() {
  const { id } = Route.useParams()
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => supabase.from('tasks').select('*').eq('id', id),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.title}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_single_modifier')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('.single()')
  })

  it('does not flag detail page that has .single()', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.$id.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks/$id')({
  component: TaskDetail,
  errorComponent: ErrorBoundary,
})

function TaskDetail() {
  const { id } = Route.useParams()
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => supabase.from('tasks').select('*').eq('id', id).single(),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.title}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_single_modifier')
    expect(issue).toBeUndefined()
  })

  it('does not flag list pages for missing .single()', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*').eq('id', 'some-id'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_single_modifier')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 11: unused_import
  // ============================================================================

  it('detects unused named import', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'unused_import' && i.message.includes('useMutation'))
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
  })

  it('does not flag imports that are actually used', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'unused_import')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 12: missing_form_validation
  // ============================================================================

  it('detects missing form validation', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (title: string) => supabase.from('tasks').insert({ title }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }) },
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      mutation.mutate('New Task')
    }}>
      <input name="title" />
      <button type="submit">Add</button>
    </form>
  )
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_form_validation')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('validation')
  })

  it('does not flag forms that have .trim() validation', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (title: string) => supabase.from('tasks').insert({ title }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }) },
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const title = (e.target as HTMLFormElement).title.value.trim()
      if (!title) return
      mutation.mutate(title)
    }}>
      <input name="title" />
      <button type="submit">Add</button>
    </form>
  )
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_form_validation')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 13: console_log_statement
  // ============================================================================

  it('detects console.log in tsx files', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const result = await supabase.from('tasks').select('*')
      console.log('fetched tasks', result)
      return result
    },
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'console_log_statement')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('console.log')
  })

  it('does not flag files without console.log', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'console_log_statement')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 14: hardcoded_localhost
  // ============================================================================

  it('detects hardcoded localhost URL', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

const API_URL = 'http://localhost:3001/api'

function Tasks() { return <div>Tasks</div> }
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'hardcoded_localhost')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('localhost')
  })

  it('detects hardcoded loopback IP address', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

const API_URL = 'http://127.0.0.1:3001/api'

function Tasks() { return <div>Tasks</div> }
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'hardcoded_localhost')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
  })

  it('does not flag non-loopback IP addresses', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

const API_URL = 'http://192.168.1.100:3001/api'

function Tasks() { return <div>Tasks</div> }
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'hardcoded_localhost')
    expect(issue).toBeUndefined()
  })

  it('does not flag files without hardcoded localhost or IPs', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

const API_URL = import.meta.env.VITE_API_URL

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'hardcoded_localhost')
    expect(issue).toBeUndefined()
  })

  // ============================================================================
  // Check 15: missing_key_prop
  // ============================================================================

  it('detects missing key prop in .map() JSX', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_key_prop')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('key=')
  })

  it('does not flag .map() with key prop present', () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
function ErrorBoundary({ error }: { error: Error }) { return <div>{error.message}</div> }
`,
      },
    ])

    const issues = runDeterministicChecks(blueprint, createMockContract())
    const issue = issues.find(i => i.type === 'missing_key_prop')
    expect(issue).toBeUndefined()
  })
})

// ============================================================================
// Full Code Review Tests
// ============================================================================

describe('runCodeReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockResolvedValue({
      object: { issues: [], summary: 'All good' },
      totalUsage: { totalTokens: 500 },
    })
  })

  it('skips LLM when critical deterministic issues found', async () => {
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
// Missing export const Route
function Tasks() {
  return <div>Tasks</div>
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    expect(result.passed).toBe(false)
    expect(result.deterministicIssues.length).toBeGreaterThan(0)
    const hasCritical = result.deterministicIssues.some(i => i.severity === 'critical')
    expect(hasCritical).toBe(true)
    expect(result.llmIssues).toHaveLength(0)
    expect(result.tokensUsed).toBe(0)
  })

  it('calls LLM when no critical deterministic issues', async () => {
    mockGenerate.mockResolvedValue({
      object: { issues: [], summary: 'All good' },
      totalUsage: { totalTokens: 500 },
    })

    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}

function ErrorBoundary({ error }: { error: Error }) {
  return <div>Error: {error.message}</div>
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    expect(mockGenerate).toHaveBeenCalled()
    expect(result.tokensUsed).toBe(500)
  })

  it('returns passed=true when no critical issues', async () => {
    mockGenerate.mockResolvedValue({
      object: {
        issues: [
          {
            severity: 'info',
            category: 'ux',
            file: 'src/routes/_authenticated/tasks.tsx',
            description: 'Consider adding success toast',
            suggestion: 'Add toast notification after save',
          },
        ],
        summary: 'Minor UX improvements suggested',
      },
      totalUsage: { totalTokens: 500 },
    })

    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}

function ErrorBoundary({ error }: { error: Error }) {
  return <div>Error: {error.message}</div>
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    expect(result.passed).toBe(true)
    expect(result.llmIssues).toHaveLength(1)
    expect(result.llmIssues[0].severity).toBe('info')
  })

  it('returns passed=false when LLM finds critical issues', async () => {
    mockGenerate.mockResolvedValue({
      object: {
        issues: [
          {
            severity: 'critical',
            category: 'security',
            file: 'src/routes/_authenticated/tasks.tsx',
            description: 'Missing auth check allows unauthorized access',
            suggestion: 'Add auth verification in beforeLoad',
          },
        ],
        summary: 'Security issue found',
      },
      totalUsage: { totalTokens: 600 },
    })

    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}

function ErrorBoundary({ error }: { error: Error }) {
  return <div>Error: {error.message}</div>
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    expect(result.passed).toBe(false)
    expect(result.llmIssues).toHaveLength(1)
    expect(result.llmIssues[0].severity).toBe('critical')
    expect(result.tokensUsed).toBe(600)
  })

  it('handles LLM parse failure gracefully', async () => {
    mockGenerate.mockResolvedValue({
      object: { invalid: 'response' }, // Missing required fields
      totalUsage: { totalTokens: 400 },
    })

    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}

function ErrorBoundary({ error }: { error: Error }) {
  return <div>Error: {error.message}</div>
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    // Should handle parse failure gracefully
    expect(result.llmIssues).toHaveLength(0)
    expect(result.tokensUsed).toBe(400)
    expect(result.passed).toBe(true) // No critical issues if parse fails
  })

  it('combines deterministic warnings with LLM review', async () => {
    mockGenerate.mockResolvedValue({
      object: {
        issues: [
          {
            severity: 'warning',
            category: 'accessibility',
            file: 'src/routes/_authenticated/tasks.tsx',
            description: 'Form inputs missing labels',
            suggestion: 'Add aria-label or <label> elements',
          },
        ],
        summary: 'Accessibility improvements needed',
      },
      totalUsage: { totalTokens: 550 },
    })

    // This blueprint has exactly 1 warning (missing error boundary) — under the 3-warning
    // threshold, so LLM review should still run.
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  // Missing errorComponent
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    expect(result.passed).toBe(true) // No critical issues
    expect(result.deterministicIssues.length).toBeGreaterThan(0)
    expect(result.llmIssues).toHaveLength(1)
    expect(result.tokensUsed).toBe(550)
  })

  // ============================================================================
  // Gate change: skip LLM when more than 3 warning-level issues
  // ============================================================================

  it('skips LLM when more than 3 warning-level deterministic issues found', async () => {
    // This blueprint triggers multiple warnings:
    // - missing_error_boundary (no errorComponent)
    // - missing_supabase_import (uses supabase.from but no import)
    // - missing_mutation_invalidation (useMutation without invalidateQueries)
    // - console_log_statement (console.log present)
    // That is 4 warnings — over the 3-warning threshold.
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery, useMutation } from '@tanstack/react-query'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  // no errorComponent
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const result = await supabase.from('tasks').select('*')
      console.log('result', result)
      return result
    },
  })
  const mutation = useMutation({
    mutationFn: (title: string) => supabase.from('tasks').insert({ title }),
  })
  if (isLoading) return <div>Loading...</div>
  return (
    <div>
      {data?.map(t => <div key={t.id}>{t.title}</div>)}
      <button onClick={() => mutation.mutate('New')}>Add</button>
    </div>
  )
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    // LLM should be skipped — more than 3 warnings
    expect(mockGenerate).not.toHaveBeenCalled()
    expect(result.llmIssues).toHaveLength(0)
    expect(result.tokensUsed).toBe(0)
    // passed=true because no critical issues
    expect(result.passed).toBe(true)
    // But there are deterministic warnings
    const warnings = result.deterministicIssues.filter(i => i.severity === 'warning')
    expect(warnings.length).toBeGreaterThan(3)
  })

  it('calls LLM when exactly 3 or fewer warning-level issues found', async () => {
    mockGenerate.mockResolvedValue({
      object: { issues: [], summary: 'All good' },
      totalUsage: { totalTokens: 500 },
    })

    // This blueprint has exactly 1 warning (missing_error_boundary), no criticals
    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  // missing errorComponent — 1 warning
})

function Tasks() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => supabase.from('tasks').select('*'),
  })
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => <div key={t.id}>{t.title}</div>)}</div>
}
`,
      },
    ])

    const result = await runCodeReview({
      blueprint,
      contract: createMockContract(),
      sandboxId: 'sandbox-123',
    })

    // LLM should run (only 1 warning, under threshold)
    expect(mockGenerate).toHaveBeenCalled()
    expect(result.tokensUsed).toBe(500)
  })
})
