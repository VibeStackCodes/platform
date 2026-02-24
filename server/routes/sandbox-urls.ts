// server/routes/sandbox-urls.ts
/**
 * GET /api/projects/[id]/sandbox-urls
 *
 * Returns sandbox preview + code server URLs.
 * Preview URL is a signed Daytona URL loaded directly in the iframe —
 * supports both HTTP and WebSocket (Vite HMR).
 *
 * TODO: Phase 2 — replace with Cloudflare proxy on *.preview.vibestack.app
 * See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
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
    // Preview uses signed URL (works in iframes); code server uses preview link
    // (signed URLs have a proxy bug that corrupts OpenVSCode HTML in browsers)
    const [, , preview, codeServerUrl] = await Promise.all([
      waitForDevServer(sandbox),
      waitForCodeServer(sandbox),
      getPreviewUrl(sandbox, 3000),
      getCodeServerLink(sandbox),
    ])

    // TODO: Daytona shows a "Preview URL Warning" interstitial for all requests.
    // The X-Daytona-Skip-Preview-Warning header can't be sent from iframes.
    // A <base href> proxy approach fails because Daytona warns on sub-resources too.
    // Options: Cloudflare Worker full proxy, or Daytona Tier 3 upgrade.
    // See packages/preview-proxy/ for the partial approach (HTML-only proxy).

    return c.json({
      sandboxId: sandbox.id,
      previewUrl: preview.url,
      codeServerUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    })
  } catch {
    return c.json({ sandboxId: sandbox.id, previewUrl: null, codeServerUrl: null, expiresAt: null })
  }
})
