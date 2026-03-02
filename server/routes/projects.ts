// server/routes/projects.ts
import { describeRoute, resolver } from 'hono-openapi'
import { Hono } from 'hono'
import { z } from 'zod'
import { createProject, getProject, getProjectMessages, getUserProjects } from '../lib/db/queries'
import { authMiddleware } from '../middleware/auth'
import { TOOL_LABELS, INTERNAL_TOOLS } from '../lib/tool-labels'

// ---------------------------------------------------------------------------
// Shared Zod schemas — used in describeRoute() responses and request bodies
// ---------------------------------------------------------------------------

const ProjectStatusSchema = z.enum([
  'pending',
  'planning',
  'generating',
  'verifying',
  'complete',
  'error',
  'deploying',
  'deployed',
])

const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  prompt: z.string().nullable(),
  status: ProjectStatusSchema,
  previewUrl: z.string().nullable(),
  deployUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const CreateProjectBodySchema = z.object({
  name: z.string(),
  prompt: z.string().optional(),
})

const MessagePartSchema = z.object({
  text: z.string(),
})

const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  type: z.string(),
  parts: z.array(MessagePartSchema),
  createdAt: z.string().datetime(),
})

const ErrorSchema = z.object({ error: z.string() })

const UuidPathParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' },
  description: 'Project UUID',
}

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
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Array of projects belonging to the authenticated user',
        content: {
          'application/json': {
            schema: resolver(z.array(ProjectSchema)),
          },
        },
      },
      401: { description: 'Unauthorized' },
    },
  }),
  async (c) => {
    const user = c.var.user
    const projects = await getUserProjects(user.id)
    // Return only fields needed by dashboard (id, name, description, prompt, status, previewUrl, createdAt)
    return c.json(
      projects.map(
        ({ id, name, description, prompt, status, previewUrl, createdAt, updatedAt }) => ({
          id,
          name,
          description,
          prompt,
          status,
          previewUrl,
          createdAt,
          updatedAt,
        }),
      ),
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
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'Project display name' },
              prompt: { type: 'string', description: 'Initial generation prompt (optional)' },
            },
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Project created successfully',
        content: {
          'application/json': {
            schema: resolver(ProjectSchema),
          },
        },
      },
      400: {
        description: 'Missing project name',
        content: {
          'application/json': {
            schema: resolver(ErrorSchema),
          },
        },
      },
      401: { description: 'Unauthorized' },
      500: {
        description: 'Failed to create project',
        content: {
          'application/json': {
            schema: resolver(ErrorSchema),
          },
        },
      },
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
    security: [{ bearerAuth: [] }],
    parameters: [UuidPathParam],
    responses: {
      200: {
        description: 'Project details',
        content: {
          'application/json': {
            schema: resolver(ProjectSchema),
          },
        },
      },
      401: { description: 'Unauthorized' },
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(ErrorSchema),
          },
        },
      },
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
    security: [{ bearerAuth: [] }],
    parameters: [UuidPathParam],
    responses: {
      200: {
        description: 'Array of chat messages for the project',
        content: {
          'application/json': {
            schema: resolver(z.array(MessageSchema)),
          },
        },
      },
      401: { description: 'Unauthorized' },
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(ErrorSchema),
          },
        },
      },
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
        // Build a flat array of events: messages + tool_complete entries
        // biome-ignore lint/suspicious/noExplicitAny: Mastra message content type is opaque
        const events: any[] = []

        for (const msg of result.messages) {
          // Skip tool-role messages entirely (these are Mastra's tool result records)
          if ((msg.role as string) === 'tool') continue

          // biome-ignore lint/suspicious/noExplicitAny: Mastra content type is opaque
          const content = msg.content as any
          let textContent = ''
          // biome-ignore lint/suspicious/noExplicitAny: parts shape varies
          let parts: any[] | null = null

          // Extract parts array from content (string JSON or object)
          if (typeof content === 'string') {
            try {
              const parsed = JSON.parse(content)
              if (parsed?.parts && Array.isArray(parsed.parts)) {
                parts = parsed.parts
              } else if (typeof parsed?.summary === 'string') {
                textContent = parsed.summary
              } else {
                textContent = content
              }
            } catch {
              textContent = content
            }
          } else if (content && typeof content === 'object') {
            if (content.parts && Array.isArray(content.parts)) {
              parts = content.parts
            } else if (Array.isArray(content)) {
              parts = content
            }
          }

          // Process parts array: extract text and tool-invocations
          if (parts) {
            const textParts: string[] = []
            for (const part of parts) {
              if (part.type === 'text' && part.text) {
                textParts.push(part.text)
              } else if (part.type === 'tool-invocation' && part.toolInvocation) {
                const inv = part.toolInvocation
                const toolName = inv.toolName ?? inv.name ?? 'unknown'

                // Skip internal tools
                if (INTERNAL_TOOLS.has(toolName)) continue

                // Derive label from TOOL_LABELS
                const labelFn = TOOL_LABELS[toolName]
                const args = inv.args ?? {}
                const label = labelFn ? labelFn(args) : toolName

                // Extract file path from args
                const filePath = (args.path as string) ?? (args.filePath as string) ?? undefined

                // Strip large content fields (writeFile/editFile args contain full file content)
                const leanArgs =
                  toolName === 'writeFile' || toolName === 'editFile'
                    ? { path: args.path }
                    : args

                events.push({
                  id: `tool-${msg.id}-${toolName}-${events.length}`,
                  role: 'assistant',
                  type: 'tool_complete',
                  tool: toolName,
                  label,
                  filePath,
                  args: leanArgs,
                  createdAt: msg.createdAt,
                })
              }
            }
            textContent = textParts.join('')
          }

          // Second pass: extract summary from structured output JSON
          if (textContent.startsWith('{') && textContent.includes('"summary"')) {
            try {
              const parsed = JSON.parse(textContent)
              if (typeof parsed?.summary === 'string') {
                textContent = parsed.summary
              }
            } catch {
              // Not valid JSON, keep as-is
            }
          }

          // Only add text messages that have actual content
          if (msg.role === 'assistant' && !textContent.trim()) continue

          events.push({
            id: msg.id,
            role: msg.role,
            type: 'message',
            parts: [{ text: textContent }],
            createdAt: msg.createdAt,
          })
        }

        return c.json(events)
      }
    } catch {
      // Mastra memory unavailable, fall back to chatMessages
    }

    // Fall back to legacy chatMessages table
    const messages = await getProjectMessages(id)
    return c.json(messages)
  },
)
