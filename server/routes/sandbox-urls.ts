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
  createSandbox,
  getPreviewUrl,
  getSandbox,
  runCommand,
  waitForCodeServer,
  waitForDevServer,
} from '../lib/sandbox'
import { getProject, updateProject } from '../lib/db/queries'
import { getInstallationToken } from '../lib/github'
import { authMiddleware } from '../middleware/auth'

// In-memory guard to prevent duplicate sandbox recreation from rapid polling
const recreatingProjects = new Set<string>()

// ---------------------------------------------------------------------------
// Zod schemas for OpenAPI metadata
// ---------------------------------------------------------------------------

const SandboxUrlsResponseSchema = z.object({
  sandboxId: z.string(),
  previewUrl: z.string().nullable(),
  previewToken: z.string().nullable(),
  codeServerUrl: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  recreating: z.boolean().optional(),
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
    description:
      'Returns signed preview and code server URLs for a project sandbox. URLs expire after 1 hour.',
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

    if (!project.sandboxId) {
      return c.json({ previewUrl: null, codeServerUrl: null, expiresAt: null })
    }

    let sandbox
    try {
      sandbox = await getSandbox(project.sandboxId)
    } catch {
      // Sandbox expired/deleted — attempt recreation if we have a GitHub repo
      if (project.githubRepoUrl && !recreatingProjects.has(id)) {
        recreatingProjects.add(id)
        // Fire-and-forget: create sandbox, clone repo, start dev server
        recreateSandbox(id, user.id, project.githubRepoUrl).finally(() => {
          recreatingProjects.delete(id)
        })
        return c.json({ previewUrl: null, codeServerUrl: null, expiresAt: null, recreating: true })
      }
      // Already recreating — tell client to keep waiting
      if (recreatingProjects.has(id)) {
        return c.json({ previewUrl: null, codeServerUrl: null, expiresAt: null, recreating: true })
      }
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
      return c.json({
        sandboxId: sandbox.id,
        previewUrl: null,
        codeServerUrl: null,
        expiresAt: null,
      })
    }
  },
)

// ---------------------------------------------------------------------------
// Sandbox Recreation
// ---------------------------------------------------------------------------

/**
 * Recreate a sandbox for a completed project whose original sandbox expired.
 *
 * 1. Create fresh sandbox from snapshot (entrypoint starts tmux + dev server)
 * 2. Clone the project's GitHub repo into /workspace
 * 3. Install dependencies (may differ from snapshot template)
 * 4. Dev server auto-restarts via Vite file watching
 * 5. Update project record with new sandboxId
 */
async function recreateSandbox(
  projectId: string,
  userId: string,
  githubRepoUrl: string,
): Promise<void> {
  console.log(`[sandbox-recreation] Starting for project ${projectId}`)

  const sandbox = await createSandbox({
    labels: { project: projectId, recreated: 'true' },
  })

  // Update project's sandboxId immediately so subsequent polls find this sandbox
  await updateProject(projectId, { sandboxId: sandbox.id }, userId)
  console.log(`[sandbox-recreation] Sandbox ${sandbox.id} created, DB updated`)

  // Clone the project's GitHub repo over the template scaffold
  const token = await getInstallationToken()
  const authedUrl = githubRepoUrl.replace('https://', `https://x-access-token:${token}@`)

  await runCommand(
    sandbox,
    `cd /workspace && git remote add github ${authedUrl} && git fetch github main && git reset --hard github/main`,
    'sandbox-restore',
    { timeout: 60 },
  )
  console.log(`[sandbox-recreation] Repo cloned into sandbox ${sandbox.id}`)

  // Reinstall deps in case the project added packages beyond the snapshot template
  await runCommand(sandbox, 'cd /workspace && bun install', 'sandbox-restore-install', {
    timeout: 120,
  })
  console.log(`[sandbox-recreation] Dependencies installed, sandbox ${sandbox.id} ready`)
}
