/**
 * Preview Proxy — Vercel Serverless Function
 *
 * Proxies the initial HTML page from Daytona sandbox previews,
 * sending X-Daytona-Skip-Preview-Warning: true to bypass the
 * browser warning interstitial.
 *
 * URL format: /p/{encoded-daytona-preview-url}
 * Example:    /p/https%3A%2F%2F3000-abc123.proxy.daytona.works
 *
 * Injects a <base href> tag so all sub-resources (JS, CSS, images,
 * WebSocket/HMR) resolve directly against the Daytona origin.
 * Only the initial HTML page load goes through this proxy.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

/** Only allow Daytona preview URLs */
const DAYTONA_PREVIEW_RE = /^https:\/\/\d+-[a-f0-9-]+\.proxy\.daytona\.works/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the Daytona URL from the path: /p/{encoded-url}
  const path = (req.url ?? '').replace(/^\/p\//, '')
  const targetUrl = decodeURIComponent(path)

  if (!targetUrl || !DAYTONA_PREVIEW_RE.test(targetUrl)) {
    return res.status(400).json({
      error: 'Invalid preview URL',
      format: '/p/{encoded-daytona-preview-url}',
    })
  }

  try {
    const response = await fetch(targetUrl, {
      headers: { 'X-Daytona-Skip-Preview-Warning': 'true' },
      redirect: 'follow',
    })

    const contentType = response.headers.get('content-type') ?? ''

    // Only inject <base> for HTML responses (the initial page load)
    if (!contentType.includes('text/html')) {
      const body = Buffer.from(await response.arrayBuffer())
      res.setHeader('Content-Type', contentType)
      return res.status(response.status).send(body)
    }

    let html = await response.text()

    // Inject <base> so all relative URLs (JS, CSS, images, WebSocket/HMR)
    // resolve against the Daytona origin. Only the initial HTML needs proxying.
    const origin = new URL(targetUrl).origin
    const baseTag = `<base href="${origin}/">`
    html = html.replace(/<head([^>]*)>/, `<head$1>\n    ${baseTag}`)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(html)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(502).json({ error: 'Failed to fetch preview', detail: message })
  }
}
