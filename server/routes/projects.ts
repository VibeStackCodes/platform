// server/routes/projects.ts
import { describeRoute } from 'hono-openapi'
import { Hono } from 'hono'
import { createProject, getProject, getProjectMessages, getUserProjects } from '../lib/db/queries'
import { authMiddleware } from '../middleware/auth'

export const projectRoutes = new Hono()

projectRoutes.use('*', authMiddleware)

/**
 * GET /api/projects
 *
 * Lists all projects for the authenticated user.
 */
projectRoutes.get(
  '/',
  describeRoute({
    summary: 'List user projects',
    tags: ['projects'],
    responses: {
      200: { description: 'Array of projects belonging to the authenticated user' },
      401: { description: 'Unauthorized' },
    },
  }),
  async (c) => {
    const user = c.var.user
    const projects = await getUserProjects(user.id)
    // Return only fields needed by dashboard (id, name, description, prompt, status, previewUrl, createdAt)
    return c.json(
      projects.map(({ id, name, description, prompt, status, previewUrl, createdAt, updatedAt }) => ({
        id,
        name,
        description,
        prompt,
        status,
        previewUrl,
        createdAt,
        updatedAt,
      })),
    )
  },
)

/**
 * POST /api/projects
 *
 * Creates a new project for the authenticated user.
 */
projectRoutes.post(
  '/',
  describeRoute({
    summary: 'Create a new project',
    tags: ['projects'],
    responses: {
      201: { description: 'Project created successfully' },
      400: { description: 'Missing project name' },
      401: { description: 'Unauthorized' },
      500: { description: 'Failed to create project' },
    },
  }),
  async (c) => {
    const user = c.var.user
    const body = await c.req.json<{ name: string; prompt?: string }>()

    if (!body.name) {
      return c.json({ error: 'Missing project name' }, 400)
    }

    try {
      const project = await createProject({
        userId: user.id,
        name: body.name,
        prompt: body.prompt ?? null,
        status: 'pending',
      })

      return c.json(project, 201)
    } catch (err) {
      console.error('[projects] POST / failed:', err)
      return c.json({ error: 'Failed to create project' }, 500)
    }
  },
)

/**
 * GET /api/projects/:id
 *
 * Returns project details for the authenticated user.
 */
projectRoutes.get(
  '/:id',
  describeRoute({
    summary: 'Get project by ID',
    tags: ['projects'],
    responses: {
      200: { description: 'Project details' },
      401: { description: 'Unauthorized' },
      404: { description: 'Project not found' },
    },
  }),
  async (c) => {
    const user = c.var.user
    const id = c.req.param('id')

    const project = await getProject(id, user.id)
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    return c.json(project)
  },
)

/**
 * GET /api/projects/:id/messages
 *
 * Returns chat messages for a project.
 * Reads from Mastra memory (thread = projectId, resource = userId).
 * Falls back to chatMessages table for legacy data.
 */
projectRoutes.get(
  '/:id/messages',
  describeRoute({
    summary: 'Get project chat messages',
    tags: ['projects'],
    responses: {
      200: { description: 'Array of chat messages for the project' },
      401: { description: 'Unauthorized' },
      404: { description: 'Project not found' },
    },
  }),
  async (c) => {
    const user = c.var.user
    const id = c.req.param('id')

    // Verify ownership BEFORE fetching messages (prevents IDOR)
    const project = await getProject(id, user.id)
    if (!project) {
      return c.json({ error: 'Project not found' }, 404)
    }

    // Try Mastra memory first (single orchestrator stores messages here)
    try {
      const { memory } = await import('../lib/agents/memory')
      const result = await memory.recall({
        threadId: id,
        resourceId: user.id,
      })
      if (result.messages.length > 0) {
        // Convert Mastra messages to the format the client expects
        const converted = result.messages.map((msg) => {
          // Extract text from Mastra's MastraMessageContentV2
          // Content can be: string, JSON string, or object { format: 2, parts: [...] }
          let textContent = ''
          // biome-ignore lint/suspicious/noExplicitAny: Mastra content type is opaque
          const content = msg.content as any

          if (typeof content === 'string') {
            // Could be plain text or JSON-encoded format 2
            try {
              const parsed = JSON.parse(content)
              if (parsed?.parts && Array.isArray(parsed.parts)) {
                textContent = parsed.parts
                  .filter((p: { type: string }) => p.type === 'text')
                  .map((p: { text: string }) => p.text ?? '')
                  .join('')
              } else {
                textContent = content
              }
            } catch {
              textContent = content
            }
          } else if (content && typeof content === 'object') {
            // Direct object — format 2 with parts array
            if (content.parts && Array.isArray(content.parts)) {
              textContent = content.parts
                .filter((p: { type: string }) => p.type === 'text')
                .map((p: { text: string }) => p.text ?? '')
                .join('')
            } else if (Array.isArray(content)) {
              // Array of content parts (AI SDK CoreMessage format)
              textContent = content
                .filter((p: { type: string }) => p.type === 'text')
                .map((p: { text: string }) => p.text ?? '')
                .join('')
            }
          }

          return {
            id: msg.id,
            role: msg.role,
            type: 'message',
            parts: [{ text: textContent }],
            createdAt: msg.createdAt,
          }
        })
        return c.json(converted)
      }
    } catch {
      // Mastra memory unavailable, fall back to chatMessages
    }

    // Fall back to legacy chatMessages table
    const messages = await getProjectMessages(id)
    return c.json(messages)
  },
)
