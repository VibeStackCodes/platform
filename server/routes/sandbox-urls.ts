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

    // Route preview through our edge proxy to skip Daytona's warning interstitial.
    // The proxy sends X-Daytona-Skip-Preview-Warning: true and injects <base href>
    // so sub-resources load from Daytona directly (Daytona only warns on page navigations,
    // not sub-resource requests per their docs).
    const PREVIEW_PROXY_BASE = process.env.PREVIEW_PROXY_URL ?? 'https://preview.vibestack.codes'
    const proxyPreviewUrl = `${PREVIEW_PROXY_BASE}/p/${encodeURIComponent(preview.url)}`

    return c.json({
      sandboxId: sandbox.id,
      previewUrl: proxyPreviewUrl,
      codeServerUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    })
  } catch {
    return c.json({ sandboxId: sandbox.id, previewUrl: null, codeServerUrl: null, expiresAt: null })
  }
})
