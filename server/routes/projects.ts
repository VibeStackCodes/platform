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
    projects.map(({ id, name, description, prompt, status, previewUrl, createdAt }) => ({
      id,
      name,
      description,
      prompt,
      status,
      previewUrl,
      createdAt,
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

  const project = await createProject({
    userId: user.id,
    name: body.name,
    prompt: body.prompt ?? null,
    status: 'pending',
  })

  return c.json(project, 201)
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

  // Strip sensitive fields before sending to client
  const { supabaseServiceRoleKey: _, ...safeProject } = project
  return c.json(safeProject)
})

/**
 * GET /api/projects/:id/messages
 *
 * Returns chat messages for a project.
 */
projectRoutes.get('/:id/messages', async (c) => {
  const user = c.var.user
  const id = c.req.param('id')

  // Verify ownership BEFORE fetching messages (prevents IDOR)
  const project = await getProject(id, user.id)
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const messages = await getProjectMessages(id)
  return c.json(messages)
})
