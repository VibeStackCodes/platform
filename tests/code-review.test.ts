import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runDeterministicChecks,
  runCodeReview,
  type CodeReviewResult,
  type DeterministicIssue,
} from '@server/lib/agents/code-review'
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
    fileTree: files.map((f, idx) => ({
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
export const Route = createFileRoute('/_authenticated/tasks')({ component: Tasks })

function Tasks() {
  const { data } = trpc.tasks.list.useQuery()
  return <div>{data?.map(t => t.title)}</div>
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
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = trpc.tasks.list.useQuery()
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => t.title)}</div>
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
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = trpc.tasks.list.useQuery()
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => t.title)}</div>
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
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = trpc.tasks.list.useQuery()
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => t.title)}</div>
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
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = trpc.tasks.list.useQuery()
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => t.title)}</div>
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
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  errorComponent: ErrorBoundary,
})

function Tasks() {
  const { data, isLoading } = trpc.tasks.list.useQuery()
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => t.title)}</div>
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

    const blueprint = createMockBlueprint([
      {
        path: 'src/routes/_authenticated/tasks.tsx',
        content: `
export const Route = createFileRoute('/_authenticated/tasks')({
  component: Tasks,
  // Missing errorComponent
})

function Tasks() {
  const { data, isLoading } = trpc.tasks.list.useQuery()
  if (isLoading) return <div>Loading...</div>
  return <div>{data?.map(t => t.title)}</div>
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
})
