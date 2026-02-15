// server/routes/projects.ts
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { getProject } from '../lib/db/queries'

export const projectRoutes = new Hono()

projectRoutes.use('*', authMiddleware)

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
