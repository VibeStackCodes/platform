// server/routes/sandbox-urls.ts
/**
 * GET /api/projects/[id]/sandbox-urls
 *
 * Returns sandbox preview + code server URLs.
 * Preview URL routes through our reverse proxy (preview.vibestack.site)
 * which adds Daytona auth headers and supports WebSocket (Vite HMR).
 *
 * Proxy uses subdomain routing: {port}-{sandboxId}-preview.vibestack.site
 * See packages/preview-proxy/ for the proxy implementation.
 */

import { describeRoute, resolver } from 'hono-openapi'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  buildProxyUrl,
  findSandboxByProject,
  getPreviewUrl,
  waitForCodeServer,
  waitForDevServer,
} from '../lib/sandbox'
import { getProject } from '../lib/db/queries'
import { authMiddleware } from '../middleware/auth'

// ---------------------------------------------------------------------------
// Zod schemas for OpenAPI metadata
// ---------------------------------------------------------------------------

const SandboxUrlsResponseSchema = z.object({
  sandboxId: z.string(),
  previewUrl: z.string().nullable(),
  previewToken: z.string().nullable(),
  codeServerUrl: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
})

const ErrorSchema = z.object({ error: z.string() })

const UuidPathParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' },
  description: 'Project UUID',
}

export const sandboxUrlRoutes = new Hono()

sandboxUrlRoutes.use('*', authMiddleware)

/**
 * GET /api/projects/:id/sandbox-urls
 */
sandboxUrlRoutes.get(
  '/:id/sandbox-urls',
  describeRoute({
    summary: 'Get sandbox preview and code server URLs',
    description: 'Returns signed preview and code server URLs for a project sandbox. URLs expire after 1 hour.',
    tags: ['sandbox'],
    security: [{ bearerAuth: [] }],
    parameters: [UuidPathParam],
    responses: {
      200: {
        description: 'Sandbox URLs (previewUrl, codeServerUrl, expiresAt)',
        content: {
          'application/json': {
            schema: resolver(SandboxUrlsResponseSchema),
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
  const id = c.req.param('id')
  const user = c.var.user

  // Verify project ownership before exposing sandbox URLs
  const project = await getProject(id, user.id)
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const sandbox = await findSandboxByProject(id)
  if (!sandbox) {
    return c.json({ previewUrl: null, codeServerUrl: null, expiresAt: null })
  }

  try {
    const expiresInSeconds = 3600 // 1 hour

    // Wait for both servers to be ready before returning URLs
    const [, , preview] = await Promise.all([
      waitForDevServer(sandbox),
      waitForCodeServer(sandbox),
      getPreviewUrl(sandbox, 3000),
    ])

    // Route all Daytona URLs through our Cloudflare Worker reverse proxy.
    // buildProxyUrl() centralizes the format: https://{port}-{sandboxId}-preview.vibestack.site
    return c.json({
      sandboxId: sandbox.id,
      previewUrl: buildProxyUrl(sandbox.id, preview.port),
      previewToken: preview.token,
      codeServerUrl: buildProxyUrl(sandbox.id, 13337),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    })
  } catch {
    return c.json({ sandboxId: sandbox.id, previewUrl: null, codeServerUrl: null, expiresAt: null })
  }
  },
)
