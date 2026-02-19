import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  runProvisioning,
  runCodeGeneration,
} from '@server/lib/agents/orchestrator'
import type { SchemaContract } from '@server/lib/schema-contract'
import type { AppBlueprint } from '@server/lib/app-blueprint'

// Mock all infrastructure modules
vi.mock('@server/lib/supabase-pool', () => ({
  claimWarmProject: vi.fn(),
}))

vi.mock('@server/lib/sandbox', () => ({
  createSandbox: vi.fn(),
  getSandbox: vi.fn().mockResolvedValue({
    process: { executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, result: '' }) },
    fs: { uploadFile: vi.fn().mockResolvedValue(undefined) },
  }),
  uploadFile: vi.fn().mockResolvedValue(undefined),
  uploadFiles: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@server/lib/github', () => ({
  createRepo: vi.fn(),
  buildRepoName: vi.fn((name, id) => `vibestack-${id}`),
}))

vi.mock('@server/lib/supabase-mgmt', () => ({
  createSupabaseProject: vi.fn(),
  runMigration: vi.fn().mockResolvedValue({ success: true, error: null, executedAt: new Date().toISOString() }),
}))

// Mock agent registry (no frontendAgent — code generation is fully deterministic)
vi.mock('@server/lib/agents/registry', () => ({}))

// Mock provider module (for per-agent model resolution)
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

// Mock feature schema (not used by runCodeGeneration after themed migration)
vi.mock('@server/lib/agents/feature-schema', () => ({
  inferPageConfig: vi.fn((table: any) => ({
    entityName: table.name,
    listColumns: table.columns.filter((c: any) => !c.primaryKey).map((c: any) => c.name).slice(0, 4),
    headerField: table.columns.find((c: any) => !c.primaryKey)?.name ?? table.columns[0].name,
    enumFields: [],
    detailSections: [{ title: 'Details', fields: table.columns.filter((c: any) => !c.primaryKey).map((c: any) => c.name) }],
  })),
  derivePageFeatureSpec: vi.fn((config: any) => ({
    entityName: config.entityName,
    listPage: { columns: [], searchFields: [], sortDefault: 'id', sortDirection: 'desc', emptyStateMessage: '', createFormFields: [], filters: [] },
    detailPage: { headerField: 'id', sections: [], editFormFields: [] },
  })),
}))

// Mock assembler
vi.mock('@server/lib/agents/assembler', () => ({
  assembleListPage: vi.fn((spec) => `// List page for ${spec.entityName}`),
  assembleDetailPage: vi.fn((spec) => `// Detail page for ${spec.entityName}`),
}))

describe('runProvisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs all three providers in parallel', async () => {
    const { claimWarmProject } = await import('@server/lib/supabase-pool')
    const { createSandbox } = await import('@server/lib/sandbox')
    const { createRepo } = await import('@server/lib/github')

    // Mock successful responses
    vi.mocked(claimWarmProject).mockResolvedValue({
      id: 'warm-1',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://sbp-123.supabase.co',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-key',
      dbHost: 'db.supabase.co',
      dbPassword: 'password',
      region: 'us-east-1',
      claimedBy: null,
      claimedAt: null,
    })

    vi.mocked(createSandbox).mockResolvedValue({
      id: 'sandbox-123',
    } as any)

    vi.mocked(createRepo).mockResolvedValue({
      cloneUrl: 'https://github.com/org/repo.git',
      htmlUrl: 'https://github.com/org/repo',
      repoName: 'vibestack-proj-123',
    })

    const result = await runProvisioning({
      appName: 'test-app',
      projectId: 'proj-123',
      userId: 'user-123',
    })

    // All three should be called
    expect(claimWarmProject).toHaveBeenCalledWith('user-123')
    expect(createSandbox).toHaveBeenCalledWith({
      language: 'typescript',
      autoStopInterval: 60,
      labels: { project: 'proj-123' },
    })
    expect(createRepo).toHaveBeenCalled()

    // Result should include all infrastructure details
    expect(result).toMatchObject({
      sandboxId: 'sandbox-123',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://sbp-123.supabase.co',
      supabaseAnonKey: 'anon-key',
      githubCloneUrl: 'https://github.com/org/repo.git',
      githubHtmlUrl: 'https://github.com/org/repo',
      repoName: 'vibestack-proj-123',
    })
  })

  it('falls back to cold creation when warm pool returns null', async () => {
    const { claimWarmProject } = await import('@server/lib/supabase-pool')
    const { createSupabaseProject } = await import('@server/lib/supabase-mgmt')
    const { createSandbox } = await import('@server/lib/sandbox')
    const { createRepo } = await import('@server/lib/github')

    // Mock warm pool unavailable
    vi.mocked(claimWarmProject).mockResolvedValue(null)

    // Mock cold creation success
    vi.mocked(createSupabaseProject).mockResolvedValue({
      id: 'sbp-cold-123',
      name: 'test-app',
      orgId: 'org-123',
      region: 'us-east-1',
      dbHost: 'db.supabase.co',
      dbPassword: 'password',
      anonKey: 'anon-key-cold',
      serviceRoleKey: 'service-key-cold',
      url: 'https://sbp-cold-123.supabase.co',
    })

    vi.mocked(createSandbox).mockResolvedValue({ id: 'sandbox-123' } as any)
    vi.mocked(createRepo).mockResolvedValue({
      cloneUrl: 'https://github.com/org/repo.git',
      htmlUrl: 'https://github.com/org/repo',
      repoName: 'vibestack-proj-123',
    })

    const result = await runProvisioning({
      appName: 'test-app',
      projectId: 'proj-123',
      userId: 'user-123',
    })

    // Should try warm pool first
    expect(claimWarmProject).toHaveBeenCalledWith('user-123')

    // Should fall back to cold creation (name has timestamp suffix)
    expect(createSupabaseProject).toHaveBeenCalledWith(expect.stringContaining('test-app'))

    // Result should use cold-created project
    expect(result.supabaseProjectId).toBe('sbp-cold-123')
    expect(result.supabaseAnonKey).toBe('anon-key-cold')
  })

  it('skips warm pool when userId is not provided', async () => {
    const { claimWarmProject } = await import('@server/lib/supabase-pool')
    const { createSupabaseProject } = await import('@server/lib/supabase-mgmt')
    const { createSandbox } = await import('@server/lib/sandbox')
    const { createRepo } = await import('@server/lib/github')

    vi.mocked(createSupabaseProject).mockResolvedValue({
      id: 'sbp-cold-123',
      name: 'test-app',
      orgId: 'org-123',
      region: 'us-east-1',
      dbHost: 'db.supabase.co',
      dbPassword: 'password',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-key',
      url: 'https://sbp-cold-123.supabase.co',
    })

    vi.mocked(createSandbox).mockResolvedValue({ id: 'sandbox-123' } as any)
    vi.mocked(createRepo).mockResolvedValue({
      cloneUrl: 'https://github.com/org/repo.git',
      htmlUrl: 'https://github.com/org/repo',
      repoName: 'vibestack-proj-123',
    })

    await runProvisioning({
      appName: 'test-app',
      projectId: 'proj-123',
      // No userId
    })

    // Should NOT try warm pool
    expect(claimWarmProject).not.toHaveBeenCalled()

    // Should go directly to cold creation (name has timestamp suffix)
    expect(createSupabaseProject).toHaveBeenCalledWith(expect.stringContaining('test-app'))
  })

  it('throws when Supabase provisioning fails', async () => {
    const { claimWarmProject } = await import('@server/lib/supabase-pool')
    const { createSupabaseProject } = await import('@server/lib/supabase-mgmt')
    const { createSandbox } = await import('@server/lib/sandbox')
    const { createRepo } = await import('@server/lib/github')

    // Mock both warm pool AND cold creation failure
    vi.mocked(claimWarmProject).mockRejectedValue(new Error('Warm pool error'))
    vi.mocked(createSupabaseProject).mockRejectedValue(new Error('Supabase API error'))

    vi.mocked(createSandbox).mockResolvedValue({ id: 'sandbox-123' } as any)
    vi.mocked(createRepo).mockResolvedValue({
      cloneUrl: 'https://github.com/org/repo.git',
      htmlUrl: 'https://github.com/org/repo',
      repoName: 'vibestack-proj-123',
    })

    await expect(
      runProvisioning({
        appName: 'test-app',
        projectId: 'proj-123',
        userId: 'user-123',
      }),
    ).rejects.toThrow('Supabase provisioning failed')
  })

  it('throws when sandbox creation fails', async () => {
    const { claimWarmProject } = await import('@server/lib/supabase-pool')
    const { createSandbox } = await import('@server/lib/sandbox')
    const { createRepo } = await import('@server/lib/github')

    vi.mocked(claimWarmProject).mockResolvedValue({
      id: 'warm-1',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://sbp-123.supabase.co',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-key',
      dbHost: 'db.supabase.co',
      dbPassword: 'password',
      region: 'us-east-1',
      claimedBy: null,
      claimedAt: null,
    })

    // Mock sandbox failure
    vi.mocked(createSandbox).mockRejectedValue(new Error('Daytona API error'))

    vi.mocked(createRepo).mockResolvedValue({
      cloneUrl: 'https://github.com/org/repo.git',
      htmlUrl: 'https://github.com/org/repo',
      repoName: 'vibestack-proj-123',
    })

    await expect(
      runProvisioning({
        appName: 'test-app',
        projectId: 'proj-123',
        userId: 'user-123',
      }),
    ).rejects.toThrow('Sandbox creation failed')
  })

  it('throws when GitHub repo creation fails', async () => {
    const { claimWarmProject } = await import('@server/lib/supabase-pool')
    const { createSandbox } = await import('@server/lib/sandbox')
    const { createRepo } = await import('@server/lib/github')

    vi.mocked(claimWarmProject).mockResolvedValue({
      id: 'warm-1',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://sbp-123.supabase.co',
      anonKey: 'anon-key',
      serviceRoleKey: 'service-key',
      dbHost: 'db.supabase.co',
      dbPassword: 'password',
      region: 'us-east-1',
      claimedBy: null,
      claimedAt: null,
    })

    vi.mocked(createSandbox).mockResolvedValue({ id: 'sandbox-123' } as any)

    // Mock GitHub failure
    vi.mocked(createRepo).mockRejectedValue(new Error('GitHub API error'))

    await expect(
      runProvisioning({
        appName: 'test-app',
        projectId: 'proj-123',
        userId: 'user-123',
      }),
    ).rejects.toThrow('GitHub repo creation failed')
  })
})

describe('runCodeGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes pre-generated blueprint files and skips legacy assembly path', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
        {
          name: 'user',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'name', type: 'text' },
          ],
        },
      ],
    }

    const blueprint: AppBlueprint = {
      appName: 'test-app',
      fileTree: [
        { path: 'src/routes/index.tsx', content: 'export default {}', layer: 4, isLLMSlot: true },
        { path: '.env', content: 'VITE_SUPABASE_URL=__PLACEHOLDER__\nVITE_SUPABASE_ANON_KEY=__PLACEHOLDER__\n', layer: 1, isLLMSlot: false },
      ],
      dependencies: {},
      devDependencies: {},
      envVars: [],
    }

    const result = await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    })

    // Themed files are generated in blueprint stage, so no legacy assembled files are emitted here.
    expect(result.assembledFiles).toEqual([])

    // No tokens used — no LLM calls in code generation
    expect(result.tokensUsed).toBe(0)
  })

  it('does not process entities directly in codegen (including system tables)', async () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: '_migrations',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
        {
          name: 'task',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }

    const blueprint: AppBlueprint = {
      appName: 'test-app',
      fileTree: [{ path: 'src/routes/index.tsx', content: 'export default {}', layer: 4, isLLMSlot: true }],
      dependencies: {},
      devDependencies: {},
      envVars: [],
    }

    const result = await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    })

    // Entity processing is handled during blueprint generation, not runCodeGeneration.
    expect(result.assembledFiles).toEqual([])
    expect(result.tokensUsed).toBe(0)
  })
})
