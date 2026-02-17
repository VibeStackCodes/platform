// tests/orchestrator-deployment.test.ts
/**
 * Unit tests for deployment orchestrator handler
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sandbox } from '@daytonaio/sdk'

// Mock all external dependencies
vi.mock('../server/lib/sandbox', () => ({
  getSandbox: vi.fn(),
  runCommand: vi.fn(),
  downloadDirectory: vi.fn(),
}))

vi.mock('../server/lib/db/queries', () => ({
  updateProject: vi.fn(),
}))

vi.mock('../server/lib/slug', () => ({
  buildAppSlug: vi.fn(),
}))

vi.mock('../server/lib/db/client', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([mockProject])),
        })),
      })),
    })),
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}))

vi.mock('../server/lib/db/schema', () => ({
  projects: {},
}))

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}))

// Mock fetch globally
global.fetch = vi.fn()

const mockProject = {
  id: 'proj-123',
  name: 'Test App',
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'anon-key-123',
}

const mockSandbox = {
  id: 'sandbox-123',
  fs: {
    uploadFile: vi.fn(),
  },
} as unknown as Sandbox

describe('orchestrator - runDeployment', () => {
  let runDeployment: typeof import('@server/lib/agents/orchestrator').runDeployment
  let getSandbox: ReturnType<typeof vi.fn>
  let runCommand: ReturnType<typeof vi.fn>
  let downloadDirectory: ReturnType<typeof vi.fn>
  let updateProject: ReturnType<typeof vi.fn>
  let buildAppSlug: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Use resetAllMocks to clear mock history AND implementations
    vi.resetAllMocks()

    // Import the function under test
    const module = await import('@server/lib/agents/orchestrator')
    runDeployment = module.runDeployment

    // Get mock references
    const sandbox = await import('@server/lib/sandbox')
    getSandbox = sandbox.getSandbox as ReturnType<typeof vi.fn>
    runCommand = sandbox.runCommand as ReturnType<typeof vi.fn>
    downloadDirectory = sandbox.downloadDirectory as ReturnType<typeof vi.fn>

    const queries = await import('@server/lib/db/queries')
    updateProject = queries.updateProject as ReturnType<typeof vi.fn>

    const slug = await import('@server/lib/slug')
    buildAppSlug = slug.buildAppSlug as ReturnType<typeof vi.fn>

    // Setup default mock implementations
    getSandbox.mockResolvedValue(mockSandbox)
    runCommand.mockResolvedValue({ exitCode: 0, stdout: 'Build successful' })
    downloadDirectory.mockResolvedValue([
      { path: 'index.html', content: Buffer.from('<html></html>') },
      { path: 'assets/main.js', content: Buffer.from('console.log("app")') },
    ])
    updateProject.mockResolvedValue({ ...mockProject, deployUrl: 'https://app.vercel.app' })
    buildAppSlug.mockReturnValue('test-app-abc123def456')

    // Reset global fetch mock
    ;(global.fetch as ReturnType<typeof vi.fn>).mockReset()

    // Setup environment
    process.env.VERCEL_TOKEN = 'vercel-token-123'
    delete process.env.VERCEL_TEAM_ID
    delete process.env.VERCEL_WILDCARD_DOMAIN
  })

  it(
    'should deploy successfully with all steps',
    async () => {
      // Mock Vercel API responses
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          // Create deployment
          ok: true,
          json: async () => ({ id: 'dpl-123', url: 'test-app-xyz.vercel.app' }),
        } as Response)
        .mockResolvedValueOnce({
          // Status check - immediately READY
          ok: true,
          json: async () => ({ readyState: 'READY' }),
        } as Response)

      const result = await runDeployment({
        sandboxId: 'sandbox-123',
        projectId: 'proj-123',
      })

    // Verify sandbox operations
    expect(getSandbox).toHaveBeenCalledWith('sandbox-123')
    expect(mockSandbox.fs.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      '/workspace/.env.production',
    )

    // Verify build
    expect(runCommand).toHaveBeenCalledWith(mockSandbox, 'bun run build', 'deploy-build', {
      cwd: '/workspace',
      timeout: 120,
    })

    // Verify downloads (source files for manifest + dist for Vercel)
    expect(downloadDirectory).toHaveBeenCalledWith(mockSandbox, '/workspace')
    expect(downloadDirectory).toHaveBeenCalledWith(mockSandbox, '/workspace/dist')

    // Verify generation state was persisted
    expect(updateProject).toHaveBeenCalledWith('proj-123', expect.objectContaining({
      generationState: expect.objectContaining({
        sandboxId: 'sandbox-123',
        fileManifest: expect.any(Object),
      }),
    }))

    // Verify Vercel deployment API call
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.vercel.com/v13/deployments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer vercel-token-123',
        }),
        body: expect.stringContaining('"name":"test-app"'),
      }),
    )

    // Verify project update
    expect(updateProject).toHaveBeenCalledWith('proj-123', {
      deployUrl: 'https://test-app-xyz.vercel.app',
      status: 'deployed',
    })

    // Verify result
      expect(result).toEqual({
        deploymentUrl: 'https://test-app-xyz.vercel.app',
        tokensUsed: 0,
      })
    },
    10000,
  )

  it('should fail when build fails with improved error message', async () => {
    runCommand.mockResolvedValueOnce({
      exitCode: 1,
      stdout: 'Build failed: syntax error',
      stderr: 'Error details',
    })

    await expect(
      runDeployment({
        sandboxId: 'sandbox-123',
        projectId: 'proj-123',
      }),
    ).rejects.toThrow('Production build failed (exit code 1)')

    // Should not attempt deployment
    expect(global.fetch).not.toHaveBeenCalled()
    // Generation state IS persisted (before build), but not deployment URL
    expect(updateProject).toHaveBeenCalledTimes(1)
    expect(updateProject).toHaveBeenCalledWith('proj-123', expect.objectContaining({
      generationState: expect.any(Object),
    }))
  })

  it('should fail when VERCEL_TOKEN is missing', async () => {
    delete process.env.VERCEL_TOKEN

    await expect(
      runDeployment({
        sandboxId: 'sandbox-123',
        projectId: 'proj-123',
      }),
    ).rejects.toThrow('VERCEL_TOKEN environment variable is required')

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it(
    'should handle Vercel API errors',
    async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          // First attempt
          ok: false,
          status: 401,
          text: async () => 'Invalid authentication token',
        } as Response)
        .mockResolvedValueOnce({
          // Retry (4xx should not retry, but just in case)
          ok: false,
          status: 401,
          text: async () => 'Invalid authentication token',
        } as Response)

      await expect(
        runDeployment({
          sandboxId: 'sandbox-123',
          projectId: 'proj-123',
        }),
      ).rejects.toThrow('Vercel deployment failed: Invalid authentication token')

      // Generation state IS persisted (before Vercel call), but not deployment URL
      expect(updateProject).toHaveBeenCalledTimes(1)
      expect(updateProject).toHaveBeenCalledWith('proj-123', expect.objectContaining({
        generationState: expect.any(Object),
      }))
    },
    10000,
  )

  it(
    'should poll deployment status until READY',
    async () => {
      // Mock deployment creation
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
        } as Response)
        .mockResolvedValueOnce({
          // First status check: BUILDING
          ok: true,
          json: async () => ({ readyState: 'BUILDING' }),
        } as Response)
        .mockResolvedValueOnce({
          // Second status check: READY
          ok: true,
          json: async () => ({ readyState: 'READY' }),
        } as Response)

      const result = await runDeployment({
        sandboxId: 'sandbox-123',
        projectId: 'proj-123',
      })

      // Should update project with deployment URL
      expect(result.deploymentUrl).toBe('https://test-app.vercel.app')
      expect(updateProject).toHaveBeenCalledWith('proj-123', {
        deployUrl: 'https://test-app.vercel.app',
        status: 'deployed',
      })
    },
    10_000, // Allow time for polling
  )

  it(
    'should handle deployment ERROR state',
    async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ readyState: 'ERROR' }),
        } as Response)

      await expect(
        runDeployment({
          sandboxId: 'sandbox-123',
          projectId: 'proj-123',
        }),
      ).rejects.toThrow('Deployment ERROR')
    },
    10_000,
  )

  it(
    'should handle deployment CANCELED state',
    async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ readyState: 'CANCELED' }),
        } as Response)

      await expect(
        runDeployment({
          sandboxId: 'sandbox-123',
          projectId: 'proj-123',
        }),
      ).rejects.toThrow('Deployment CANCELED')
    },
    10_000,
  )

  it('should assign custom domain when VERCEL_WILDCARD_DOMAIN is set', async () => {
    process.env.VERCEL_WILDCARD_DOMAIN = 'apps.example.com'

    // Mock deployment and status check
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-123', url: 'test-app-xyz.vercel.app' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: 'READY' }),
      } as Response)
      .mockResolvedValueOnce({
        // Domain assignment
        ok: true,
        json: async () => ({ name: 'test-app-abc123def456.apps.example.com' }),
      } as Response)

    const result = await runDeployment({
      sandboxId: 'sandbox-123',
      projectId: 'proj-123',
    })

    // Verify domain assignment API call
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.vercel.com/v10/projects/test-app/domains',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test-app-abc123def456.apps.example.com'),
      }),
    )

    expect(result.deploymentUrl).toBe('https://test-app-abc123def456.apps.example.com')
  })

  it('should not fail if custom domain assignment fails', async () => {
    process.env.VERCEL_WILDCARD_DOMAIN = 'apps.example.com'

    // Mock deployment and status check
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-123', url: 'test-app-xyz.vercel.app' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: 'READY' }),
      } as Response)
      .mockResolvedValueOnce({
        // Domain assignment fails
        ok: false,
        text: async () => 'Domain already exists',
      } as Response)

    const result = await runDeployment({
      sandboxId: 'sandbox-123',
      projectId: 'proj-123',
    })

    // Should fall back to Vercel URL
    expect(result.deploymentUrl).toBe('https://test-app-xyz.vercel.app')
  })

  it('should include teamId in Vercel API calls when set', async () => {
    process.env.VERCEL_TEAM_ID = 'team-456'

    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: 'READY' }),
      } as Response)

    await runDeployment({
      sandboxId: 'sandbox-123',
      projectId: 'proj-123',
    })

    // Verify teamId in query params
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.vercel.com/v13/deployments?teamId=team-456',
      expect.any(Object),
    )
  })

  it('should upload env vars to sandbox before build', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: 'READY' }),
      } as Response)

    await runDeployment({
      sandboxId: 'sandbox-123',
      projectId: 'proj-123',
    })

    // Verify env file content
    expect(mockSandbox.fs.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      '/workspace/.env.production',
    )

    const uploadedBuffer = (mockSandbox.fs.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const content = uploadedBuffer.toString()
    expect(content).toContain('VITE_SUPABASE_URL=https://test.supabase.co')
    expect(content).toContain('VITE_SUPABASE_ANON_KEY=anon-key-123')
  })

  it('should send files as base64 to Vercel', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: 'READY' }),
      } as Response)

    await runDeployment({
      sandboxId: 'sandbox-123',
      projectId: 'proj-123',
    })

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)

    expect(body.files).toEqual([
      {
        file: 'index.html',
        data: Buffer.from('<html></html>').toString('base64'),
      },
      {
        file: 'assets/main.js',
        data: Buffer.from('console.log("app")').toString('base64'),
      },
    ])
  })

  it('should include Supabase env vars in Vercel deployment', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ readyState: 'READY' }),
      } as Response)

    await runDeployment({
      sandboxId: 'sandbox-123',
      projectId: 'proj-123',
    })

    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)

    expect(body.env).toEqual({
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-key-123',
    })
  })

  it('should capture exceptions to Sentry', async () => {
    const mockError = new Error('Sandbox not found')
    getSandbox.mockRejectedValueOnce(mockError)

    const Sentry = await import('@sentry/node')

    await expect(
      runDeployment({
        sandboxId: 'sandbox-123',
        projectId: 'proj-123',
      }),
    ).rejects.toThrow('Sandbox not found')

    expect(Sentry.captureException).toHaveBeenCalledWith(mockError, {
      tags: { operation: 'deployment' },
      extra: { sandboxId: 'sandbox-123', projectId: 'proj-123' },
    })
  })

  it(
    'should timeout fetch requests after configured timeout',
    async () => {
      // Mock a hanging deployment POST that respects abort signal
      let aborted = false
      ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                aborted = true
                const error: any = new Error('The operation was aborted')
                error.name = 'AbortError'
                reject(error)
              })
            }
          }),
      )

      await expect(
        runDeployment({
          sandboxId: 'sandbox-123',
          projectId: 'proj-123',
        }),
      ).rejects.toThrow()

      // Verify the request was aborted
      expect(aborted).toBe(true)

      // Generation state IS persisted (before Vercel call), but not deployment URL
      expect(updateProject).toHaveBeenCalledTimes(1)
      expect(updateProject).toHaveBeenCalledWith('proj-123', expect.objectContaining({
        generationState: expect.any(Object),
      }))
    },
    70_000, // Test timeout > fetch timeout (60s)
  )

  it(
    'should retry Vercel deploy on 5xx errors',
    async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          // First attempt: 500
          ok: false,
          status: 500,
          text: async () => 'Internal server error',
        } as Response)
        .mockResolvedValueOnce({
          // Retry succeeds
          ok: true,
          json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
        } as Response)
        .mockResolvedValueOnce({
          // Status check
          ok: true,
          json: async () => ({ readyState: 'READY' }),
        } as Response)

      const result = await runDeployment({
        sandboxId: 'sandbox-123',
        projectId: 'proj-123',
      })

      // Should have retried and succeeded
      expect(result.deploymentUrl).toBe('https://test-app.vercel.app')

      // Verify deploy POST was called twice (initial + retry)
      // Status checks to /v13/deployments/:id are different URLs
      const deployCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0] === 'https://api.vercel.com/v13/deployments',
      )
      expect(deployCalls).toHaveLength(2)
    },
    10_000,
  )

  it(
    'should not retry Vercel deploy on 4xx errors',
    async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      } as Response)

      await expect(
        runDeployment({
          sandboxId: 'sandbox-123',
          projectId: 'proj-123',
        }),
      ).rejects.toThrow('Vercel deployment failed: Bad request')

      // Should NOT retry on 4xx
      const deployCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
        call[0].includes('/v13/deployments'),
      )
      expect(deployCalls).toHaveLength(1)
    },
    10_000,
  )

  it(
    'should throw timeout error if deployment never reaches READY state',
    async () => {
      // We can't actually wait 5 minutes, so we'll mock Date.now() to speed up time
      const startTime = Date.now()
      let callCount = 0

      // Mock Date.now() to fast-forward time
      const dateSpy = vi.spyOn(global.Date, 'now').mockImplementation(() => {
        // Start time for first call
        // Each subsequent call during polling: advance by 1 minute
        const elapsed = Math.floor(callCount / 2) * 60_000 // Two calls per iteration (while condition + after fetch)
        callCount++
        return startTime + elapsed
      })

      // Mock setTimeout to execute immediately
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn()
        return 0 as any
      })

      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          // Deploy creation
          ok: true,
          json: async () => ({ id: 'dpl-123', url: 'test-app.vercel.app' }),
        } as Response)
        .mockResolvedValue({
          // All status checks return BUILDING forever
          ok: true,
          json: async () => ({ readyState: 'BUILDING' }),
        } as Response)

      await expect(
        runDeployment({
          sandboxId: 'sandbox-123',
          projectId: 'proj-123',
        }),
      ).rejects.toThrow('Deployment timed out after 300s -- last state: BUILDING')

      // Generation state IS persisted (before polling), but not deployment URL
      expect(updateProject).toHaveBeenCalledTimes(1)
      expect(updateProject).toHaveBeenCalledWith('proj-123', expect.objectContaining({
        generationState: expect.any(Object),
      }))

      // Restore mocks
      dateSpy.mockRestore()
      setTimeoutSpy.mockRestore()
    },
    10_000, // Test completes quickly due to mocked time
  )
})
