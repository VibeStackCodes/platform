/**
 * VibeStack Preview Proxy
 *
 * Full reverse proxy for Daytona sandbox previews.
 * Follows https://www.daytona.io/docs/en/custom-domain-authentication/
 * and https://github.com/daytonaio/daytona-proxy-samples/tree/main/typescript
 *
 * Subdomain routing: {port}-{sandboxId}.preview.vibestack.codes
 *   → proxies to Daytona sandbox with auth headers
 *   → supports HTTP + WebSocket (Vite HMR)
 *
 * Headers injected:
 *   X-Daytona-Preview-Token: {token}  — authenticates the request
 *   X-Daytona-Skip-Preview-Warning: true — bypasses warning interstitial
 *   X-Daytona-Disable-CORS: true — lets iframe embed the content
 */

import 'dotenv/config'
import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { Configuration, SandboxApi } from '@daytonaio/api-client'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3100)
const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY
const DAYTONA_API_URL = process.env.DAYTONA_API_URL ?? 'https://app.daytona.io/api'

if (!DAYTONA_API_KEY) {
  console.error('DAYTONA_API_KEY is required')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Daytona API client
// ---------------------------------------------------------------------------

const configuration = new Configuration({
  apiKey: DAYTONA_API_KEY,
  basePath: DAYTONA_API_URL,
})

const sandboxApi = new SandboxApi(configuration)

// ---------------------------------------------------------------------------
// Token cache — avoids hitting Daytona API on every request
// ---------------------------------------------------------------------------

interface CachedToken {
  url: string
  token: string
  expiresAt: number
}

const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const tokenCache = new Map<string, CachedToken>()

/**
 * Parse subdomain to extract sandboxId and port.
 * Format: {port}-{sandboxId}.preview.vibestack.codes
 *
 * sandboxId is a UUID like "abc123def456"
 * port is a number like "3000"
 */
function parseSandboxFromHost(host: string | undefined): { sandboxId: string; port: number } | null {
  if (!host) return null

  // Strip port number from host (e.g., "3000-abc123.preview.vibestack.codes:8080")
  const hostname = host.split(':')[0]

  // Extract first subdomain segment: "3000-abc123"
  const parts = hostname.split('.')
  if (parts.length < 3) return null

  const subdomain = parts[0]
  const dashIndex = subdomain.indexOf('-')
  if (dashIndex === -1) return null

  const portStr = subdomain.slice(0, dashIndex)
  const sandboxId = subdomain.slice(dashIndex + 1)

  const port = Number(portStr)
  if (!port || port < 1 || port > 65535) return null
  if (!sandboxId) return null

  return { sandboxId, port }
}

/**
 * Get preview URL and token for a sandbox:port, with caching.
 */
async function getPreviewToken(sandboxId: string, port: number): Promise<CachedToken> {
  const cacheKey = `${sandboxId}:${port}`
  const cached = tokenCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached
  }

  const response = await sandboxApi.getPortPreviewUrl(sandboxId, port)
  const entry: CachedToken = {
    url: response.data.url,
    token: response.data.token,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
  }

  tokenCache.set(cacheKey, entry)
  return entry
}

// ---------------------------------------------------------------------------
// Express app + proxy middleware
// ---------------------------------------------------------------------------

const app = express()

// Health check (no subdomain needed)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', cached: tokenCache.size })
})

// Proxy middleware — routes all requests through to Daytona
const proxyMiddleware = createProxyMiddleware({
  // Dynamic routing: resolve target URL per-request from Daytona API
  router: async (req) => {
    const parsed = parseSandboxFromHost(req.headers.host)
    if (!parsed) {
      throw new Error('Invalid subdomain format')
    }

    const { sandboxId, port } = parsed
    const preview = await getPreviewToken(sandboxId, port)

    // Stash token on request for header injection in proxyReq handler
    ;(req as any)._daytonaToken = preview.token
    return preview.url
  },

  changeOrigin: true,
  autoRewrite: true,
  ws: true,

  on: {
    // Inject auth headers on HTTP requests
    proxyReq: (proxyReq, req) => {
      const token = (req as any)._daytonaToken as string | undefined
      if (token) {
        proxyReq.setHeader('X-Daytona-Preview-Token', token)
      }
      proxyReq.setHeader('X-Daytona-Skip-Preview-Warning', 'true')
      proxyReq.setHeader('X-Daytona-Disable-CORS', 'true')
    },

    // Inject auth headers on WebSocket upgrade requests
    proxyReqWs: (proxyReq, req) => {
      const token = (req as any)._daytonaToken as string | undefined
      if (token) {
        proxyReq.setHeader('X-Daytona-Preview-Token', token)
      }
      proxyReq.setHeader('X-Daytona-Skip-Preview-Warning', 'true')
      proxyReq.setHeader('X-Daytona-Disable-CORS', 'true')
    },

    // Log errors for debugging
    error: (err, _req, res) => {
      console.error('[proxy error]', err.message)
      if (res && 'writeHead' in res) {
        ;(res as any).writeHead(502)
        ;(res as any).end('Proxy error')
      }
    },
  },
})

app.use(proxyMiddleware)

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`Preview proxy listening on :${PORT}`)
  console.log(`Daytona API: ${DAYTONA_API_URL}`)
  console.log(`Subdomain format: {port}-{sandboxId}.preview.vibestack.codes`)
})

// Handle WebSocket upgrades
server.on('upgrade', proxyMiddleware.upgrade!)
