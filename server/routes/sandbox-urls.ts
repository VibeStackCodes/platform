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

  // Clone the project's GitHub repo, replacing the template scaffold entirely.
  // The snapshot ships a template repo at /workspace with a dev server running in tmux.
  // We must: stop dev server → wipe → clone → install → restart dev server.
  const token = await getInstallationToken()
  // Strip any existing embedded credentials from the stored URL before adding fresh token
  const cleanUrl = githubRepoUrl.replace(/https:\/\/[^@]+@/, 'https://')
  const authedUrl = cleanUrl.replace('https://', `https://x-access-token:${token}@`)

  // 1. Kill the tmux dev session so it doesn't auto-restart on a half-cloned workspace
  await runCommand(sandbox, 'tmux kill-session -t dev 2>/dev/null || true', 'sandbox-restore-stop', {
    timeout: 10,
  })

  // 2. Wipe workspace and clone the user's repo
  const cloneResult = await runCommand(
    sandbox,
    `rm -rf /workspace/.git /workspace/* /workspace/.[!.]* 2>/dev/null; git clone ${authedUrl} /workspace`,
    'sandbox-restore-clone',
    { timeout: 120 },
  )
  if (cloneResult.exitCode !== 0) {
    console.error(
      `[sandbox-recreation] Git clone failed for project ${projectId}:`,
      cloneResult.stderr || cloneResult.stdout,
    )
    return
  }
  console.log(`[sandbox-recreation] Repo cloned into sandbox ${sandbox.id}`)

  // 3. Install deps (project may have added packages beyond the snapshot template)
  const installResult = await runCommand(
    sandbox,
    'cd /workspace && bun install',
    'sandbox-restore-install',
    { timeout: 120 },
  )
  if (installResult.exitCode !== 0) {
    console.error(
      `[sandbox-recreation] bun install failed for project ${projectId}:`,
      installResult.stderr || installResult.stdout,
    )
  }

  // 4. Restart the dev server in tmux (same command as snapshot entrypoint)
  await runCommand(
    sandbox,
    `tmux new-session -d -s dev -c /workspace 'while true; do bun run dev --host 0.0.0.0 2>&1 | tee /tmp/dev.log; echo "[entrypoint] dev server exited, restarting in 2s..."; sleep 2; done'`,
    'sandbox-restore-devserver',
    { timeout: 10 },
  )
  console.log(`[sandbox-recreation] Dev server restarted, sandbox ${sandbox.id} ready`)
}
