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

import { Hono } from 'hono'
import {
  findSandboxByProject,
  getCodeServerLink,
  getPreviewUrl,
  waitForCodeServer,
  waitForDevServer,
} from '../lib/sandbox'
import { getProject } from '../lib/db/queries'
import { authMiddleware } from '../middleware/auth'

export const sandboxUrlRoutes = new Hono()

sandboxUrlRoutes.use('*', authMiddleware)

/**
 * GET /api/projects/:id/sandbox-urls
 */
sandboxUrlRoutes.get('/:id/sandbox-urls', async (c) => {
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
    const [, , preview, codeServerUrl] = await Promise.all([
      waitForDevServer(sandbox),
      waitForCodeServer(sandbox),
      getPreviewUrl(sandbox, 3000),
      getCodeServerLink(sandbox),
    ])

    // Route preview through our reverse proxy using subdomain routing.
    // Format: https://{port}-{sandboxId}-preview.vibestack.site
    // The proxy resolves the Daytona target URL, adds X-Daytona-Preview-Token
    // and X-Daytona-Skip-Preview-Warning headers, and proxies HTTP + WebSocket.
    // Uses single-level wildcard (*.vibestack.site) to stay on free Universal SSL.
    const PREVIEW_PROXY_BASE = process.env.PREVIEW_PROXY_BASE ?? 'vibestack.site'
    const proxyPreviewUrl = `https://${preview.port}-${sandbox.id}-preview.${PREVIEW_PROXY_BASE}`

    return c.json({
      sandboxId: sandbox.id,
      previewUrl: proxyPreviewUrl,
      previewToken: preview.token,
      codeServerUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    })
  } catch {
    return c.json({ sandboxId: sandbox.id, previewUrl: null, codeServerUrl: null, expiresAt: null })
  }
})
