// server/routes/projects.ts
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
projectRoutes.get('/', async (c) => {
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
})

/**
 * POST /api/projects
 *
 * Creates a new project for the authenticated user.
 */
projectRoutes.post('/', async (c) => {
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
})

/**
 * GET /api/projects/:id
 *
 * Returns project details for the authenticated user.
 */
projectRoutes.get('/:id', async (c) => {
  const user = c.var.user
  const id = c.req.param('id')

  const project = await getProject(id, user.id)
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json(project)
})

/**
 * GET /api/projects/:id/messages
 *
 * Returns chat messages for a project.
 * Reads from Mastra memory (thread = projectId, resource = userId).
 * Falls back to chatMessages table for legacy data.
 */
projectRoutes.get('/:id/messages', async (c) => {
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
        // Parse content — Mastra stores format 2 JSON or plain text
        let textContent = ''
        try {
          const parsed = JSON.parse(String(msg.content))
          if (parsed?.parts) {
            textContent = parsed.parts
              .filter((p: { type: string }) => p.type === 'text')
              .map((p: { text: string }) => p.text)
              .join('')
          } else {
            textContent = String(msg.content)
          }
        } catch {
          textContent = String(msg.content ?? '')
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
})
