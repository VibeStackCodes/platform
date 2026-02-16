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
}))

vi.mock('@server/lib/github', () => ({
  createRepo: vi.fn(),
  buildRepoName: vi.fn((name, id) => `vibestack-${id}`),
}))

vi.mock('@server/lib/supabase-mgmt', () => ({
  createSupabaseProject: vi.fn(),
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

// Mock feature schema
vi.mock('@server/lib/agents/feature-schema', () => ({
  PageFeatureSchema: {
    safeParse: vi.fn(),
  },
  CustomProcedureSchema: {
    safeParse: vi.fn(),
  },
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

    // Should fall back to cold creation
    expect(createSupabaseProject).toHaveBeenCalledWith('test-app')

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

    // Should go directly to cold creation
    expect(createSupabaseProject).toHaveBeenCalledWith('test-app')
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

  it('processes multiple entities in parallel', async () => {
    const { frontendAgent, backendAgent } = await import('@server/lib/agents/registry')
    const { PageFeatureSchema, CustomProcedureSchema, validateFeatureSpec } = await import(
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

    // Mock successful agent responses
    const mockFeatureSpec = {
      entityName: 'task',
      fields: [],
      operations: [],
    }

    vi.mocked(frontendAgent.generate).mockResolvedValue({
      object: mockFeatureSpec,
      totalUsage: { totalTokens: 100 },
    } as any)

    vi.mocked(backendAgent.generate).mockResolvedValue({
      object: { procedures: [] },
      totalUsage: { totalTokens: 50 },
    } as any)

    vi.mocked(PageFeatureSchema.safeParse).mockReturnValue({
      success: true,
      data: mockFeatureSpec,
    } as any)

    vi.mocked(CustomProcedureSchema.safeParse).mockReturnValue({
      success: true,
      data: { procedures: [] },
    } as any)

    vi.mocked(validateFeatureSpec).mockReturnValue({
      valid: true,
      errors: [],
    } as any)

    const result = await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
    })

    // Both entities should be processed
    expect(frontendAgent.generate).toHaveBeenCalledTimes(2)
    expect(backendAgent.generate).toHaveBeenCalledTimes(2)

    // Should return assembled files for both entities
    expect(result.assembledFiles.length).toBeGreaterThanOrEqual(4) // 2 pages per entity

    // Token count should be aggregate
    expect(result.tokensUsed).toBeGreaterThan(0)
  })

  it('handles partial failures gracefully', async () => {
    const { frontendAgent, backendAgent } = await import('@server/lib/agents/registry')
    const { PageFeatureSchema, validateFeatureSpec } = await import(
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

    const mockFeatureSpec = {
      entityName: 'user',
      fields: [],
      operations: [],
    }

    // First entity fails, second succeeds
    vi.mocked(frontendAgent.generate)
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce({
        object: mockFeatureSpec,
        totalUsage: { totalTokens: 100 },
      } as any)

    vi.mocked(backendAgent.generate).mockResolvedValue({
      object: { procedures: [] },
      totalUsage: { totalTokens: 50 },
    } as any)

    vi.mocked(PageFeatureSchema.safeParse).mockReturnValue({
      success: true,
      data: mockFeatureSpec,
    } as any)

    vi.mocked(validateFeatureSpec).mockReturnValue({
      valid: true,
      errors: [],
    } as any)

    const result = await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
    })

    // Should have skipped one entity
    expect(result.skippedEntities).toContain('task')

    // Should have assembled files for the successful entity
    expect(result.assembledFiles.length).toBeGreaterThanOrEqual(2) // 2 pages for 'user'
  })

  it('skips system tables starting with underscore', async () => {
    const { frontendAgent } = await import('@server/lib/agents/registry')

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

    vi.mocked(frontendAgent.generate).mockResolvedValue({
      object: { entityName: 'task', fields: [], operations: [] },
      totalUsage: { totalTokens: 100 },
    } as any)

    await runCodeGeneration({
      blueprint,
      contract,
      sandboxId: 'sandbox-123',
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
