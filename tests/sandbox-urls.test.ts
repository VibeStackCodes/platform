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

// Mock sandbox functions
vi.mock('@server/lib/sandbox', () => ({
  findSandboxByProject: vi.fn(),
  waitForDevServer: vi.fn(),
  waitForCodeServer: vi.fn(),
  getPreviewUrl: vi.fn(),
  getCodeServerLink: vi.fn(),
}))

// Mock DB queries for ownership check
vi.mock('@server/lib/db/queries', () => ({
  getProject: vi.fn(),
}))

import {
  findSandboxByProject,
  getCodeServerLink,
  getPreviewUrl,
  waitForCodeServer,
  waitForDevServer,
} from '@server/lib/sandbox'
import { getProject } from '@server/lib/db/queries'
import { sandboxUrlRoutes } from '@server/routes/sandbox-urls'

describe('Sandbox URLs Routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.route('/api/projects', sandboxUrlRoutes)
    // Default: ownership check passes
    vi.mocked(getProject).mockResolvedValue({ id: 'proj-1', userId: 'user-123' } as any)
  })

  describe('GET /api/projects/:id/sandbox-urls', () => {
    it('returns signed preview URL and code server URL for project with sandbox', async () => {
      const mockSandbox = {
        id: 'sandbox-123',
        project: 'proj-1',
        status: 'running',
      }

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(waitForDevServer).mockResolvedValue(undefined)
      vi.mocked(waitForCodeServer).mockResolvedValue(undefined)
      vi.mocked(getPreviewUrl).mockResolvedValue({
        url: 'https://signed-preview.daytona.io/sandbox-123',
        port: 3000,
        expiresAt: new Date('2026-02-16T12:00:00Z'),
      })
      vi.mocked(getCodeServerLink).mockResolvedValue('https://codeserver.daytona.io/sandbox-123')

      const res = await app.request('/api/projects/proj-1/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.sandboxId).toBe('sandbox-123')
      expect(data.previewUrl).toBe('https://signed-preview.daytona.io/sandbox-123')
      expect(data.codeServerUrl).toBe('https://codeserver.daytona.io/sandbox-123')
      expect(data.expiresAt).toBeDefined()

      expect(findSandboxByProject).toHaveBeenCalledWith('proj-1')
      expect(waitForDevServer).toHaveBeenCalledWith(mockSandbox)
      expect(waitForCodeServer).toHaveBeenCalledWith(mockSandbox)
      expect(getPreviewUrl).toHaveBeenCalledWith(mockSandbox, 3000)
      expect(getCodeServerLink).toHaveBeenCalledWith(mockSandbox)
    })

    it('returns null URLs when project has no sandbox', async () => {
      vi.mocked(findSandboxByProject).mockResolvedValue(null)

      const res = await app.request('/api/projects/proj-no-sandbox/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.previewUrl).toBeNull()
      expect(data.codeServerUrl).toBeNull()
      expect(data.expiresAt).toBeNull()

      expect(waitForDevServer).not.toHaveBeenCalled()
      expect(waitForCodeServer).not.toHaveBeenCalled()
    })

    it('returns null URLs when sandbox is not ready (dev server timeout)', async () => {
      const mockSandbox = {
        id: 'sandbox-456',
        project: 'proj-2',
        status: 'starting',
      }

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(waitForDevServer).mockRejectedValue(new Error('Dev server timeout'))

      const res = await app.request('/api/projects/proj-2/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.sandboxId).toBe('sandbox-456')
      expect(data.previewUrl).toBeNull()
      expect(data.codeServerUrl).toBeNull()
      expect(data.expiresAt).toBeNull()
    })

    it('returns null URLs when code server is not ready', async () => {
      const mockSandbox = {
        id: 'sandbox-789',
        project: 'proj-3',
        status: 'running',
      }

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(waitForDevServer).mockResolvedValue(undefined)
      vi.mocked(waitForCodeServer).mockRejectedValue(new Error('Code server timeout'))

      const res = await app.request('/api/projects/proj-3/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.sandboxId).toBe('sandbox-789')
      expect(data.previewUrl).toBeNull()
      expect(data.codeServerUrl).toBeNull()
    })

    it('returns null URLs when getPreviewUrl fails', async () => {
      const mockSandbox = {
        id: 'sandbox-error',
        project: 'proj-4',
        status: 'running',
      }

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(waitForDevServer).mockResolvedValue(undefined)
      vi.mocked(waitForCodeServer).mockResolvedValue(undefined)
      vi.mocked(getPreviewUrl).mockRejectedValue(new Error('Failed to generate signed URL'))

      const res = await app.request('/api/projects/proj-4/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.sandboxId).toBe('sandbox-error')
      expect(data.previewUrl).toBeNull()
      expect(data.codeServerUrl).toBeNull()
    })

    it('waits for both dev server and code server to be ready', async () => {
      const mockSandbox = {
        id: 'sandbox-wait',
        project: 'proj-5',
        status: 'running',
      }

      const waitForDevServerMock = vi.mocked(waitForDevServer).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      const waitForCodeServerMock = vi.mocked(waitForCodeServer).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(getPreviewUrl).mockResolvedValue({
        url: 'https://preview.daytona.io',
        port: 3000,
        expiresAt: new Date(),
      })
      vi.mocked(getCodeServerLink).mockResolvedValue('https://code.daytona.io')

      const res = await app.request('/api/projects/proj-5/sandbox-urls', { method: 'GET' })

      expect(res.status).toBe(200)
      expect(waitForDevServerMock).toHaveBeenCalled()
      expect(waitForCodeServerMock).toHaveBeenCalled()
    })

    it('uses signed URL for preview (iframe compatible)', async () => {
      const mockSandbox = {
        id: 'sandbox-signed',
        project: 'proj-6',
        status: 'running',
      }

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(waitForDevServer).mockResolvedValue(undefined)
      vi.mocked(waitForCodeServer).mockResolvedValue(undefined)
      vi.mocked(getPreviewUrl).mockResolvedValue({
        url: 'https://signed-with-token.daytona.io/sandbox-signed?token=abc123',
        port: 3000,
        expiresAt: new Date('2026-02-16T13:00:00Z'),
      })
      vi.mocked(getCodeServerLink).mockResolvedValue('https://code.daytona.io')

      const res = await app.request('/api/projects/proj-6/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(data.previewUrl).toContain('signed-with-token')
      expect(data.previewUrl).toContain('token=')

      // Verify getPreviewUrl was called with port 3000
      expect(getPreviewUrl).toHaveBeenCalledWith(mockSandbox, 3000)
    })

    it('includes expiresAt timestamp set to 1 hour from now', async () => {
      const mockSandbox = {
        id: 'sandbox-expiry',
        project: 'proj-7',
        status: 'running',
      }

      const now = Date.now()

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(waitForDevServer).mockResolvedValue(undefined)
      vi.mocked(waitForCodeServer).mockResolvedValue(undefined)
      vi.mocked(getPreviewUrl).mockResolvedValue({
        url: 'https://preview.daytona.io',
        port: 3000,
        expiresAt: new Date(now + 3600 * 1000),
      })
      vi.mocked(getCodeServerLink).mockResolvedValue('https://code.daytona.io')

      const res = await app.request('/api/projects/proj-7/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(data.expiresAt).toBeDefined()

      const expiresAt = new Date(data.expiresAt)
      const expectedExpiry = new Date(now + 3600 * 1000)

      // Allow 2 second tolerance for test execution time
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(2000)
    })

    it('returns 404 when user does not own the project', async () => {
      vi.mocked(getProject).mockResolvedValue(null)

      const res = await app.request('/api/projects/proj-not-mine/sandbox-urls', { method: 'GET' })

      expect(res.status).toBe(404)
      const data = await res.json()
      expect(data.error).toBe('Project not found')
      expect(findSandboxByProject).not.toHaveBeenCalled()
    })

    it('requires authentication', async () => {
      // Create app without auth
      const noAuthApp = new Hono()
      const authFail = createMiddleware(async (c) => {
        return c.json({ error: 'Unauthorized' }, 401)
      })
      noAuthApp.use('*', authFail)
      noAuthApp.get('/api/projects/:id/sandbox-urls', async (c) => c.json({}))

      const res = await noAuthApp.request('/api/projects/proj-1/sandbox-urls', { method: 'GET' })

      expect(res.status).toBe(401)
    })

    it('handles Promise.all rejection gracefully', async () => {
      const mockSandbox = {
        id: 'sandbox-parallel-fail',
        project: 'proj-8',
        status: 'running',
      }

      vi.mocked(findSandboxByProject).mockResolvedValue(mockSandbox as any)
      vi.mocked(waitForDevServer).mockResolvedValue(undefined)
      vi.mocked(waitForCodeServer).mockResolvedValue(undefined)
      vi.mocked(getPreviewUrl).mockResolvedValue({
        url: 'https://preview.daytona.io',
        port: 3000,
        expiresAt: new Date(),
      })
      vi.mocked(getCodeServerLink).mockRejectedValue(new Error('Code server failed'))

      const res = await app.request('/api/projects/proj-8/sandbox-urls', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.previewUrl).toBeNull()
      expect(data.codeServerUrl).toBeNull()
    })
  })
})
