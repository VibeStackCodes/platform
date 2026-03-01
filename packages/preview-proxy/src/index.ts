/**
 * VibeStack Preview Proxy — Cloudflare Worker
 *
 * Full reverse proxy for Daytona sandbox previews.
 * Follows https://www.daytona.io/docs/en/custom-domain-authentication/
 *
 * Subdomain routing: {port}-{sandboxId}-preview.vibestack.site
 *   → resolves Daytona target URL via API
 *   → proxies HTTP + WebSocket with auth headers
 *
 * Uses single-level wildcard (*.vibestack.site) to stay on free Universal SSL.
 * Two-level wildcards (*.preview.vibestack.site) require Advanced Certificate Manager ($10/mo).
 *
 * Headers injected on every proxied request:
 *   X-Daytona-Preview-Token: {token}
 *   X-Daytona-Skip-Preview-Warning: true
 *   X-Daytona-Disable-CORS: true
 *
 * Cloudflare Workers WebSocket optimization: once the Worker arranges
 * the proxy via fetch(), it exits — Cloudflare streams bytes at infra level
 * with zero duration charges.
 */

export interface Env {
  DAYTONA_API_KEY: string
  DAYTONA_API_URL: string // e.g. "https://app.daytona.io/api"
  TOKEN_CACHE: KVNamespace // Cloudflare KV for token caching
}

interface DaytonaPreviewResponse {
  sandboxId: string
  url: string
  token: string
}

// ---------------------------------------------------------------------------
// Subdomain parsing
// ---------------------------------------------------------------------------

/**
 * Parse subdomain to extract sandboxId and port.
 * Format: {port}-{sandboxId}-preview.vibestack.site
 *
 * The subdomain (before first dot) is "{port}-{sandboxId}-preview".
 * We strip the trailing "-preview" suffix, then split on the first dash
 * to get port and sandboxId.
 */
function parseSandboxFromHost(host: string): { sandboxId: string; port: number } | null {
  const hostname = host.split(':')[0]
  const parts = hostname.split('.')
  if (parts.length < 3) return null

  const subdomain = parts[0]

  // Strip "-preview" suffix
  if (!subdomain.endsWith('-preview')) return null
  const withoutSuffix = subdomain.slice(0, -'-preview'.length)

  const dashIndex = withoutSuffix.indexOf('-')
  if (dashIndex === -1) return null

  const portStr = withoutSuffix.slice(0, dashIndex)
  const sandboxId = withoutSuffix.slice(dashIndex + 1)

  const port = Number(portStr)
  if (!port || port < 1 || port > 65535) return null
  if (!sandboxId) return null

  return { sandboxId, port }
}

// ---------------------------------------------------------------------------
// Daytona API — get preview URL + token (with KV caching)
// ---------------------------------------------------------------------------

const TOKEN_CACHE_TTL = 300 // 5 minutes

async function getPreviewToken(
  sandboxId: string,
  port: number,
  env: Env,
): Promise<DaytonaPreviewResponse> {
  const cacheKey = `preview:${sandboxId}:${port}`

  // Check KV cache first
  const cached = await env.TOKEN_CACHE.get(cacheKey, 'json')
  if (cached) return cached as DaytonaPreviewResponse

  // Call Daytona API
  const apiUrl = `${env.DAYTONA_API_URL}/sandbox/${encodeURIComponent(sandboxId)}/ports/${port}/preview-url`
  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${env.DAYTONA_API_KEY}`,
      'X-Daytona-Source': 'vibestack-preview-proxy',
    },
  })

  if (!res.ok) {
    throw new Error(`Daytona API error: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as DaytonaPreviewResponse

  // Cache in KV with TTL
  await env.TOKEN_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: TOKEN_CACHE_TTL })

  return data
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Health check (no subdomain needed)
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' })
    }

    // Parse subdomain
    const host = request.headers.get('Host')
    if (!host) {
      return new Response('Missing Host header', { status: 400 })
    }

    const parsed = parseSandboxFromHost(host)
    if (!parsed) {
      return new Response(
        'Invalid subdomain. Expected: {port}-{sandboxId}-preview.vibestack.site',
        {
          status: 400,
        },
      )
    }

    const { sandboxId, port } = parsed

    // Get Daytona target URL + auth token
    let preview: DaytonaPreviewResponse
    try {
      preview = await getPreviewToken(sandboxId, port, env)
    } catch (err) {
      return new Response(`Failed to resolve sandbox: ${(err as Error).message}`, { status: 502 })
    }

    // Build proxied request to Daytona's actual URL
    const targetUrl = new URL(url.pathname + url.search, preview.url)

    const headers = new Headers(request.headers)
    headers.set('X-Daytona-Preview-Token', preview.token)
    headers.set('X-Daytona-Skip-Preview-Warning', 'true')
    headers.set('X-Daytona-Disable-CORS', 'true')
    // Set Host to the Daytona origin so it routes correctly
    headers.set('Host', new URL(preview.url).host)

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    })

    // fetch() handles both HTTP and WebSocket transparently.
    // For WebSocket upgrades, Cloudflare proxies the connection at infra level
    // — the Worker exits immediately with zero duration charges.
    const response = await fetch(proxyRequest)

    // Return response with permissive CORS for iframe embedding
    const proxyResponse = new Response(response.body, response)
    proxyResponse.headers.set('Access-Control-Allow-Origin', '*')
    proxyResponse.headers.delete('X-Frame-Options')
    proxyResponse.headers.set('Cache-Control', 'no-store')

    return proxyResponse
  },
}
