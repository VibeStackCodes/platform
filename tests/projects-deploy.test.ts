import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock auth middleware
vi.mock('@server/middleware/auth', () => ({
  authMiddleware: createMiddleware(async (c, next) => {
    c.set('user', { id: 'user-123', email: 'test@test.com' })
    return next()
  }),
}))

// Mock DB queries
vi.mock('@server/lib/db/queries', () => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
}))

// Mock sandbox
vi.mock('@server/lib/sandbox', () => ({
  getDaytonaClient: vi.fn(),
  downloadDirectory: vi.fn(),
}))

// Mock slug builder
vi.mock('@server/lib/slug', () => ({
  buildAppSlug: vi.fn((name: string, id: string) => `${name.toLowerCase()}-${id.slice(0, 8)}`),
}))

// Mock @vercel/client's checkDeploymentStatus so we don't need a real Vercel API
vi.mock('@vercel/client', () => ({
  checkDeploymentStatus: vi.fn(async function* () {
    yield { type: 'ready', payload: {} }
  }),
}))

// Mock fetch used by fetchWithTimeout (it delegates to global fetch)
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getProject, updateProject } from '@server/lib/db/queries'
import { downloadDirectory, getDaytonaClient } from '@server/lib/sandbox'
import { projectDeployRoutes } from '@server/routes/projects-deploy'

// Helper — build a minimal mock Response
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe('Project Deploy Routes', () => {
  let app: Hono

  const mockSandbox = {
    id: 'sandbox-abc',
    project: 'proj-1',
    status: 'running',
  }

  const mockProject = {
    id: 'proj-1',
    userId: 'user-123',
    name: 'My App',
    sandboxId: 'sandbox-abc',
    githubRepoUrl: null,
    status: 'generating',
    deployUrl: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VERCEL_TOKEN = 'vercel-test-token'
    delete process.env.VERCEL_TEAM_ID
    delete process.env.VERCEL_WILDCARD_DOMAIN
    delete process.env.GITHUB_TOKEN

    const mockDaytonaClient = {
      get: vi.fn().mockResolvedValue(mockSandbox),
    }
    vi.mocked(getDaytonaClient).mockReturnValue(mockDaytonaClient as any)
    vi.mocked(getProject).mockResolvedValue(mockProject as any)
    vi.mocked(updateProject).mockResolvedValue(undefined as any)

    app = new Hono()
    app.route('/api/projects/deploy', projectDeployRoutes)
  })

  describe('POST /api/projects/deploy', () => {
    it('returns 400 when projectId is missing from request body', async () => {
      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('projectId is required')
      expect(getProject).not.toHaveBeenCalled()
    })

    it('returns 404 when project is not found in the database', async () => {
      vi.mocked(getProject).mockResolvedValue(null)

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'nonexistent' }),
      })

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('Project not found')
      expect(getProject).toHaveBeenCalledWith('nonexistent', 'user-123')
    })

    it('returns 400 when project has no sandboxId', async () => {
      vi.mocked(getProject).mockResolvedValue({ ...mockProject, sandboxId: null } as any)

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Project has no sandbox')
    })

    it('returns 404 when sandbox is not found in Daytona', async () => {
      const mockDaytonaClient = { get: vi.fn().mockResolvedValue(null) }
      vi.mocked(getDaytonaClient).mockReturnValue(mockDaytonaClient as any)

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('Sandbox not found')
    })

    it('deploys via GitHub path when project has a githubRepoUrl, calls Vercel API', async () => {
      const projectWithGitHub = {
        ...mockProject,
        githubRepoUrl: 'https://github.com/VibeStackCodes/my-app',
      }
      vi.mocked(getProject).mockResolvedValue(projectWithGitHub as any)

      // Step 1: GitHub repo info
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 12345, default_branch: 'main' }),
      )
      // Step 2: Create Vercel project (201 Created)
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'vp_abc' }, 201))
      // Step 3: Create Vercel deployment
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 'dpl_xyz', url: 'my-app.vercel.app', readyState: 'READY' }),
      )

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.deployUrl).toBe('https://my-app.vercel.app')
      expect(data.projectId).toBe('proj-1')

      // Verify GitHub API was called to fetch repo info
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/VibeStackCodes/my-app',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github+json',
          }),
        }),
      )

      // Verify updateProject was called with the deploy URL
      expect(updateProject).toHaveBeenCalledWith('proj-1', {
        deployUrl: 'https://my-app.vercel.app',
        status: 'deployed',
      })
    })

    it('falls back to file upload path when project has no GitHub repo URL', async () => {
      // Project without GitHub URL — uses file upload path
      vi.mocked(getProject).mockResolvedValue({ ...mockProject, githubRepoUrl: null } as any)
      vi.mocked(downloadDirectory).mockResolvedValue([
        { path: 'index.html', content: Buffer.from('<html></html>') },
      ])

      // Vercel deployments API call
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 'dpl_file', url: 'file-upload.vercel.app', readyState: 'READY' }),
      )

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.deployUrl).toBe('https://file-upload.vercel.app')

      // downloadDirectory must be called with the sandbox + /workspace path
      expect(downloadDirectory).toHaveBeenCalledWith(mockSandbox, '/workspace')

      // Vercel deployment endpoint must have been called with base64-encoded files
      const vercelCall = mockFetch.mock.calls[0]
      expect(vercelCall[0]).toContain('api.vercel.com/v13/deployments')
      const reqBody = JSON.parse(vercelCall[1].body)
      expect(reqBody.files[0].encoding).toBe('base64')

      expect(updateProject).toHaveBeenCalledWith('proj-1', {
        deployUrl: 'https://file-upload.vercel.app',
        status: 'deployed',
      })
    })

    it('returns 500 with error message when Vercel deployment API call fails', async () => {
      const projectWithGitHub = {
        ...mockProject,
        githubRepoUrl: 'https://github.com/VibeStackCodes/my-app',
      }
      vi.mocked(getProject).mockResolvedValue(projectWithGitHub as any)

      // GitHub repo info succeeds
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 12345, default_branch: 'main' }),
      )
      // Vercel project creation fails
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Rate limit exceeded' }, 429))

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Deployment failed')
      expect(data.message).toContain('An error occurred during deployment')
      expect(updateProject).not.toHaveBeenCalled()
    })

    it('returns 500 when file-upload Vercel deployment returns non-ok status', async () => {
      vi.mocked(getProject).mockResolvedValue({ ...mockProject, githubRepoUrl: null } as any)
      vi.mocked(downloadDirectory).mockResolvedValue([
        { path: 'index.html', content: Buffer.from('<html></html>') },
      ])

      // Vercel deployment fails
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Quota exceeded' }, 403))

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Deployment failed')
      expect(updateProject).not.toHaveBeenCalled()
    })

    it('updates project record with deployUrl and deployed status on success', async () => {
      vi.mocked(getProject).mockResolvedValue({ ...mockProject, githubRepoUrl: null } as any)
      vi.mocked(downloadDirectory).mockResolvedValue([
        { path: 'src/main.tsx', content: Buffer.from('export default () => null') },
      ])

      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 'dpl_update', url: 'success-update.vercel.app', readyState: 'READY' }),
      )

      await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(updateProject).toHaveBeenCalledOnce()
      expect(updateProject).toHaveBeenCalledWith('proj-1', {
        deployUrl: 'https://success-update.vercel.app',
        status: 'deployed',
      })
    })

    it('assigns a custom wildcard domain when VERCEL_WILDCARD_DOMAIN is set', async () => {
      process.env.VERCEL_WILDCARD_DOMAIN = 'vibestack.site'
      vi.mocked(getProject).mockResolvedValue({ ...mockProject, githubRepoUrl: null } as any)
      vi.mocked(downloadDirectory).mockResolvedValue([
        { path: 'index.html', content: Buffer.from('<html></html>') },
      ])

      // Vercel deployment
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 'dpl_wildcard', url: 'auto.vercel.app', readyState: 'READY' }),
      )
      // Custom domain assignment
      mockFetch.mockResolvedValueOnce(mockResponse({ name: 'my-app-proj-1abc.vibestack.site' }))

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      // Custom domain URL should be used instead of raw Vercel URL
      expect(data.deployUrl).toContain('vibestack.site')

      // Domain assignment API call must be made
      const domainCall = mockFetch.mock.calls[1]
      expect(domainCall[0]).toContain('api.vercel.com/v10/projects')
      expect(domainCall[0]).toContain('/domains')
    })

    it('forwards optional vercelTeamId as teamId query param to Vercel API', async () => {
      vi.mocked(getProject).mockResolvedValue({ ...mockProject, githubRepoUrl: null } as any)
      vi.mocked(downloadDirectory).mockResolvedValue([
        { path: 'index.html', content: Buffer.from('<html></html>') },
      ])

      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 'dpl_team', url: 'team-deploy.vercel.app', readyState: 'READY' }),
      )

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1', vercelTeamId: 'team_abc123' }),
      })

      expect(res.status).toBe(200)
      const vercelCall = mockFetch.mock.calls[0]
      expect(vercelCall[0]).toContain('teamId=team_abc123')
    })

    it('skips Vercel project creation on 409 conflict and continues deployment', async () => {
      const projectWithGitHub = {
        ...mockProject,
        githubRepoUrl: 'https://github.com/VibeStackCodes/existing-app',
      }
      vi.mocked(getProject).mockResolvedValue(projectWithGitHub as any)

      // GitHub repo info
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 99999, default_branch: 'main' }),
      )
      // Vercel project creation returns 409 (already exists) — must NOT throw
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Project already exists' }, 409))
      // Deployment creation succeeds
      mockFetch.mockResolvedValueOnce(
        mockResponse({ id: 'dpl_existing', url: 'existing.vercel.app', readyState: 'READY' }),
      )

      const res = await app.request('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'proj-1' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.deployUrl).toBe('https://existing.vercel.app')
    })
  })
})
