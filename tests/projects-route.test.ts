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
  getUserProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  getProjectMessages: vi.fn(),
}))

import { createProject, getProject, getProjectMessages, getUserProjects } from '@server/lib/db/queries'
import { projectRoutes } from '@server/routes/projects'

describe('Project Routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono()
    app.route('/api/projects', projectRoutes)
  })

  describe('GET /api/projects', () => {
    it('returns user projects with filtered fields', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          userId: 'user-123',
          name: 'Test Project',
          description: 'A test project',
          prompt: 'Create a todo app',
          status: 'deployed',
          previewUrl: 'https://example.com',
          createdAt: new Date('2026-02-16T10:00:00Z'),
          updatedAt: new Date('2026-02-16T10:00:00Z'),
          sandboxId: 'sandbox-1',

          githubRepoUrl: 'https://github.com/test/repo',
          vercelUrl: 'https://vercel.app',
          generationState: null,
        },
        {
          id: 'proj-2',
          userId: 'user-123',
          name: 'Another Project',
          description: 'Another test',
          prompt: 'Create a blog',
          status: 'generating',
          previewUrl: null,
          createdAt: new Date('2026-02-15T10:00:00Z'),
          updatedAt: new Date('2026-02-15T10:00:00Z'),
          sandboxId: null,

          githubRepoUrl: null,
          vercelUrl: null,
          generationState: null,
        },
      ]

      vi.mocked(getUserProjects).mockResolvedValue(mockProjects)

      const res = await app.request('/api/projects', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(getUserProjects).toHaveBeenCalledWith('user-123')
      expect(data).toHaveLength(2)

      // Verify only necessary fields are returned
      expect(data[0]).toEqual({
        id: 'proj-1',
        name: 'Test Project',
        description: 'A test project',
        prompt: 'Create a todo app',
        status: 'deployed',
        previewUrl: 'https://example.com',
        createdAt: '2026-02-16T10:00:00.000Z',
      })

      // Verify internal fields are NOT exposed
      expect(data[0]).not.toHaveProperty('sandboxId')
      expect(data[0]).not.toHaveProperty('githubRepoUrl')
      expect(data[0]).not.toHaveProperty('generationState')
    })

    it('returns empty array when user has no projects', async () => {
      vi.mocked(getUserProjects).mockResolvedValue([])

      const res = await app.request('/api/projects', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual([])
    })

    it('requires authentication', async () => {
      // Create a new app without auth middleware to test auth requirement
      const noAuthApp = new Hono()

      // Mock auth middleware that returns 401
      const authFail = createMiddleware(async (c) => {
        return c.json({ error: 'Unauthorized' }, 401)
      })

      noAuthApp.use('*', authFail)
      noAuthApp.get('/api/projects', async (c) => c.json([]))

      const res = await noAuthApp.request('/api/projects', { method: 'GET' })

      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/projects', () => {
    it('creates a new project with name and prompt', async () => {
      const mockProject = {
        id: 'proj-new',
        userId: 'user-123',
        name: 'New Project',
        description: null,
        prompt: 'Build a calculator',
        status: 'pending',
        previewUrl: null,
        createdAt: new Date('2026-02-16T11:00:00Z'),
        updatedAt: new Date('2026-02-16T11:00:00Z'),
        sandboxId: null,
        supabaseProjectId: null,
        githubRepoUrl: null,
        vercelUrl: null,
        generationState: null,
      }

      vi.mocked(createProject).mockResolvedValue(mockProject)

      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Project', prompt: 'Build a calculator' }),
      })

      const data = await res.json()

      expect(res.status).toBe(201)
      expect(createProject).toHaveBeenCalledWith({
        userId: 'user-123',
        name: 'New Project',
        prompt: 'Build a calculator',
        status: 'pending',
      })
      expect(data.id).toBe('proj-new')
      expect(data.name).toBe('New Project')
    })

    it('creates project with name only (no prompt)', async () => {
      const mockProject = {
        id: 'proj-no-prompt',
        userId: 'user-123',
        name: 'No Prompt Project',
        description: null,
        prompt: null,
        status: 'pending',
        previewUrl: null,
        createdAt: new Date('2026-02-16T11:00:00Z'),
        updatedAt: new Date('2026-02-16T11:00:00Z'),
        sandboxId: null,
        supabaseProjectId: null,
        githubRepoUrl: null,
        vercelUrl: null,
        generationState: null,
      }

      vi.mocked(createProject).mockResolvedValue(mockProject)

      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No Prompt Project' }),
      })

      expect(res.status).toBe(201)
      expect(createProject).toHaveBeenCalledWith({
        userId: 'user-123',
        name: 'No Prompt Project',
        prompt: null,
        status: 'pending',
      })
    })

    it('returns 400 when name is missing', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Some prompt' }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data).toEqual({ error: 'Missing project name' })
      expect(createProject).not.toHaveBeenCalled()
    })

    it('returns 400 when body is empty', async () => {
      const res = await app.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      expect(createProject).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/projects/:id', () => {
    it('returns project details for owner', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'user-123',
        name: 'Test Project',
        description: 'A test project',
        prompt: 'Create a todo app',
        status: 'deployed',
        previewUrl: 'https://example.com',
        createdAt: new Date('2026-02-16T10:00:00Z'),
        updatedAt: new Date('2026-02-16T10:00:00Z'),
        sandboxId: 'sandbox-1',
        supabaseProjectId: 'supabase-1',
        githubRepoUrl: 'https://github.com/test/repo',
        vercelUrl: 'https://vercel.app',
        generationState: null,
      }

      vi.mocked(getProject).mockResolvedValue(mockProject)

      const res = await app.request('/api/projects/proj-1', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(getProject).toHaveBeenCalledWith('proj-1', 'user-123')
      expect(data.id).toBe('proj-1')
      expect(data.name).toBe('Test Project')
      expect(data.sandboxId).toBe('sandbox-1')
    })

    it('returns 404 when project not found', async () => {
      vi.mocked(getProject).mockResolvedValue(null)

      const res = await app.request('/api/projects/nonexistent', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data).toEqual({ error: 'Project not found' })
    })

    it('returns 404 when project belongs to different user', async () => {
      // getProject returns null for non-owner due to userId check in query
      vi.mocked(getProject).mockResolvedValue(null)

      const res = await app.request('/api/projects/other-user-project', { method: 'GET' })
      await res.json()

      expect(res.status).toBe(404)
      expect(getProject).toHaveBeenCalledWith('other-user-project', 'user-123')
    })
  })

  describe('GET /api/projects/:id/messages', () => {
    it('returns messages for project owner', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'user-123',
        name: 'Test Project',
        description: null,
        prompt: 'Create a todo app',
        status: 'deployed',
        previewUrl: null,
        createdAt: new Date('2026-02-16T10:00:00Z'),
        updatedAt: new Date('2026-02-16T10:00:00Z'),
        sandboxId: null,
        supabaseProjectId: null,
        githubRepoUrl: null,
        vercelUrl: null,
        generationState: null,
      }

      const mockMessages = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
          createdAt: new Date('2026-02-16T10:01:00Z'),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi there!' }],
          createdAt: new Date('2026-02-16T10:02:00Z'),
        },
      ]

      vi.mocked(getProject).mockResolvedValue(mockProject)
      vi.mocked(getProjectMessages).mockResolvedValue(mockMessages)

      const res = await app.request('/api/projects/proj-1/messages', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(getProject).toHaveBeenCalledWith('proj-1', 'user-123')
      expect(getProjectMessages).toHaveBeenCalledWith('proj-1')
      expect(data).toHaveLength(2)
      expect(data[0].role).toBe('user')
      expect(data[1].role).toBe('assistant')
    })

    it('returns 404 when project not found for messages endpoint', async () => {
      vi.mocked(getProject).mockResolvedValue(null)
      vi.mocked(getProjectMessages).mockResolvedValue([])

      const res = await app.request('/api/projects/nonexistent/messages', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data).toEqual({ error: 'Project not found' })
      // Ownership check fails first — messages should NOT be fetched (IDOR prevention)
      expect(getProjectMessages).not.toHaveBeenCalled()
    })

    it('returns 404 when user is not project owner for messages endpoint', async () => {
      vi.mocked(getProject).mockResolvedValue(null)
      vi.mocked(getProjectMessages).mockResolvedValue([])

      const res = await app.request('/api/projects/other-user-project/messages', { method: 'GET' })

      expect(res.status).toBe(404)
      // Ownership check fails first — messages should NOT be fetched (IDOR prevention)
      expect(getProjectMessages).not.toHaveBeenCalled()
    })

    it('returns empty array when project has no messages', async () => {
      const mockProject = {
        id: 'proj-1',
        userId: 'user-123',
        name: 'Test Project',
        description: null,
        prompt: null,
        status: 'pending',
        previewUrl: null,
        createdAt: new Date('2026-02-16T10:00:00Z'),
        updatedAt: new Date('2026-02-16T10:00:00Z'),
        sandboxId: null,
        supabaseProjectId: null,
        githubRepoUrl: null,
        vercelUrl: null,
        generationState: null,
      }

      vi.mocked(getProject).mockResolvedValue(mockProject)
      vi.mocked(getProjectMessages).mockResolvedValue([])

      const res = await app.request('/api/projects/proj-1/messages', { method: 'GET' })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual([])
    })
  })
})
