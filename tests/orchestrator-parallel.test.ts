import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  runProvisioning,
  runCodeGeneration,
  buildFeatureAnalysisPrompt,
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

// Mock agent registry
vi.mock('@server/lib/agents/registry', () => ({
  frontendAgent: {
    generate: vi.fn(),
  },
  backendAgent: {
    generate: vi.fn(),
  },
}))

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

// Mock feature schema
vi.mock('@server/lib/agents/feature-schema', () => ({
  PageConfigSchema: {
    safeParse: vi.fn(),
  },
  CustomProcedureSchema: {
    safeParse: vi.fn(),
  },
  derivePageFeatureSpec: vi.fn((config: any) => ({
    entityName: config.entityName,
    listPage: { columns: [], searchFields: [], sortDefault: 'id', sortDirection: 'desc', emptyStateMessage: '', createFormFields: [], filters: [] },
    detailPage: { headerField: 'id', sections: [], editFormFields: [] },
  })),
  validatePageConfig: vi.fn(),
  validateFeatureSpec: vi.fn(),
}))

// Mock assembler
vi.mock('@server/lib/agents/assembler', () => ({
  assembleListPage: vi.fn((spec) => `// List page for ${spec.entityName}`),
  assembleDetailPage: vi.fn((spec) => `// Detail page for ${spec.entityName}`),
  assembleProcedures: vi.fn((content, _spec) => content),
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

  it('processes multiple entities in parallel with constrained decoding', async () => {
    const { frontendAgent, backendAgent } = await import('@server/lib/agents/registry')
    const { PageConfigSchema, CustomProcedureSchema, validatePageConfig } = await import(
      '@server/lib/agents/feature-schema'
    )

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
      fileTree: [],
      dependencies: {},
      devDependencies: {},
      envVars: [],
    }

    const mockConfig = {
      entityName: 'task',
      listColumns: ['title'],
      headerField: 'title',
      enumFields: [],
      detailSections: [{ title: 'Details', fields: ['title'] }],

    }

    // Agents return simplified PageConfig via constrained decoding
    vi.mocked(frontendAgent.generate).mockResolvedValue({
      object: mockConfig,
      totalUsage: { totalTokens: 100 },
    } as any)

    vi.mocked(backendAgent.generate).mockResolvedValue({
      object: { procedures: [] },
      totalUsage: { totalTokens: 50 },
    } as any)

    vi.mocked(PageConfigSchema.safeParse).mockReturnValue({
      success: true,
      data: mockConfig,
    } as any)

    vi.mocked(CustomProcedureSchema.safeParse).mockReturnValue({
      success: true,
      data: { procedures: [] },
    } as any)

    vi.mocked(validatePageConfig).mockReturnValue({
      valid: true,
      errors: [],
    } as any)

    const result = await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    })

    // Both agents called once per entity with structuredOutput
    expect(frontendAgent.generate).toHaveBeenCalledTimes(2)
    expect(backendAgent.generate).toHaveBeenCalledTimes(2)

    // Verify structuredOutput was passed with PageConfigSchema
    expect(frontendAgent.generate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ structuredOutput: expect.any(Object) }),
    )

    // Should return assembled files for both entities
    expect(result.assembledFiles.length).toBeGreaterThanOrEqual(4) // 2 pages per entity

    // Token count should include agent usage
    expect(result.tokensUsed).toBeGreaterThan(0)
  })

  it('handles partial failures gracefully', async () => {
    const { frontendAgent, backendAgent } = await import('@server/lib/agents/registry')
    const { PageConfigSchema, CustomProcedureSchema, validatePageConfig } = await import(
      '@server/lib/agents/feature-schema'
    )

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
      fileTree: [],
      dependencies: {},
      devDependencies: {},
      envVars: [],
    }

    const mockConfig = {
      entityName: 'user',
      listColumns: ['name'],
      headerField: 'name',
      enumFields: [],
      detailSections: [{ title: 'Details', fields: ['name'] }],

    }

    // First entity's config fails, second succeeds
    vi.mocked(frontendAgent.generate)
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce({
        object: mockConfig,
        totalUsage: { totalTokens: 100 },
      } as any)

    vi.mocked(backendAgent.generate).mockResolvedValue({
      object: { procedures: [] },
      totalUsage: { totalTokens: 50 },
    } as any)

    vi.mocked(PageConfigSchema.safeParse).mockReturnValue({
      success: true,
      data: mockConfig,
    } as any)

    vi.mocked(CustomProcedureSchema.safeParse).mockReturnValue({
      success: true,
      data: { procedures: [] },
    } as any)

    vi.mocked(validatePageConfig).mockReturnValue({
      valid: true,
      errors: [],
    } as any)

    const result = await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    })

    // Should have skipped one entity
    expect(result.skippedEntities).toContain('task')

    // Should have assembled files for the successful entity
    expect(result.assembledFiles.length).toBeGreaterThanOrEqual(2) // 2 pages for 'user'
  })

  it('skips system tables starting with underscore', async () => {
    const { frontendAgent, backendAgent } = await import('@server/lib/agents/registry')
    const { PageConfigSchema, CustomProcedureSchema, validatePageConfig } = await import(
      '@server/lib/agents/feature-schema'
    )

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
      fileTree: [],
      dependencies: {},
      devDependencies: {},
      envVars: [],
    }

    const mockConfig = {
      entityName: 'task',
      listColumns: ['id'],
      headerField: 'id',
      enumFields: [],
      detailSections: [{ title: 'Details', fields: ['id'] }],

    }

    // Agents return simplified PageConfig via constrained decoding
    vi.mocked(frontendAgent.generate).mockResolvedValue({
      object: mockConfig,
      totalUsage: { totalTokens: 100 },
    } as any)

    vi.mocked(backendAgent.generate).mockResolvedValue({
      object: { procedures: [] },
      totalUsage: { totalTokens: 50 },
    } as any)

    vi.mocked(PageConfigSchema.safeParse).mockReturnValue({
      success: true,
      data: mockConfig,
    } as any)

    vi.mocked(CustomProcedureSchema.safeParse).mockReturnValue({
      success: true,
      data: { procedures: [] },
    } as any)

    vi.mocked(validatePageConfig).mockReturnValue({
      valid: true,
      errors: [],
    } as any)

    await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
      supabaseProjectId: 'sbp-123',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    })

    // Should only process 'task', not '_migrations'
    expect(frontendAgent.generate).toHaveBeenCalledTimes(1)
  })
})

describe('buildFeatureAnalysisPrompt', () => {
  it('includes sandbox context when provided', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    }

    const sandboxContext = {
      packageJson: '{"dependencies": {"react": "^19.0.0"}}',
      tsConfig: '{"compilerOptions": {"strict": true}}',
      componentList: ['Button', 'Card', 'Input'],
    }

    const prompt = buildFeatureAnalysisPrompt(contract.tables[0], contract, sandboxContext)

    // Should include all context sections
    expect(prompt).toContain('Pre-loaded Context')
    expect(prompt).toContain('Available Dependencies')
    expect(prompt).toContain('react')
    expect(prompt).toContain('TypeScript Config')
    expect(prompt).toContain('strict')
    expect(prompt).toContain('Available UI Components')
    expect(prompt).toContain('Button, Card, Input')
  })

  it('works without sandbox context (backward compatible)', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
        },
      ],
    }

    const prompt = buildFeatureAnalysisPrompt(contract.tables[0], contract)

    // Should NOT include context sections
    expect(prompt).not.toContain('Pre-loaded Context')
    expect(prompt).not.toContain('Available Dependencies')

    // Should still include table info
    expect(prompt).toContain('task')
    expect(prompt).toContain('title')
  })

  it('handles missing context fields gracefully', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }

    const partialContext = {
      componentList: ['Button'],
      // packageJson and tsConfig omitted
    }

    const prompt = buildFeatureAnalysisPrompt(contract.tables[0], contract, partialContext)

    expect(prompt).toContain('Pre-loaded Context')
    expect(prompt).toContain('Not available') // fallback for missing fields
    expect(prompt).toContain('Button') // componentList is present
  })
})
