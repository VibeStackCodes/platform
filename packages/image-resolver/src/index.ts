/**
 * VibeStack Image Resolver — Cloudflare Worker
 *
 * Resolves image search queries to Unsplash URLs with edge caching.
 *
 * URL format: /s/{query}/{width}/{height}
 *   → searches Unsplash, picks best aspect-ratio match
 *   → caches result URL in KV (24h TTL)
 *   → returns 302 redirect to optimized Unsplash URL
 *   → falls back to gradient SVG if no results
 *
 * Previously: Vercel serverless + Upstash Redis
 * Now: Cloudflare Worker + KV (free, edge-cached, 0 external deps)
 */

export interface Env {
  UNSPLASH_ACCESS_KEY: string
  IMAGE_CACHE: KVNamespace
}

// ---------------------------------------------------------------------------
// Unsplash search
// ---------------------------------------------------------------------------

interface UnsplashPhoto {
  width: number
  height: number
  urls: { raw: string }
  links: { download_location: string }
}

interface UnsplashResult {
  imageUrl: string
  downloadLocation: string
}

async function searchUnsplash(
  query: string,
  width: number,
  height: number,
  accessKey: string,
): Promise<UnsplashResult | null> {
  const ratio = width / height
  const orientation = ratio > 1.3 ? 'landscape' : ratio < 0.77 ? 'portrait' : 'squarish'

  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', query)
  url.searchParams.set('per_page', '3')
  url.searchParams.set('orientation', orientation)
  url.searchParams.set('content_filter', 'high')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${accessKey}` },
  })

  if (!res.ok) return null

  const data = (await res.json()) as { results?: UnsplashPhoto[] }
  if (!data.results?.length) return null

  const targetRatio = width / height
  const best = data.results.reduce((prev, curr) => {
    const prevRatio = prev.width / prev.height
    const currRatio = curr.width / curr.height
    return Math.abs(currRatio - targetRatio) < Math.abs(prevRatio - targetRatio) ? curr : prev
  })

  return {
    imageUrl: `${best.urls.raw}&w=${width}&h=${height}&fit=crop&auto=format&q=80`,
    downloadLocation: best.links.download_location,
  }
}

// ---------------------------------------------------------------------------
// Fallback SVG
// ---------------------------------------------------------------------------

function generateFallbackSVG(w: number, h: number, query: string): string {
  const escaped = query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dy=".3em"
    font-family="system-ui" font-size="14" fill="#475569">${escaped}</text>
</svg>`
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

const CACHE_TTL = 86400 // 24 hours
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
  'Access-Control-Allow-Origin': '*',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' })
    }

    // Parse /s/{query}/{width}/{height}
    const match = url.pathname.match(/^\/s\/([^/]+)\/(\d+)\/(\d+)/)
    if (!match) {
      return Response.json({ error: 'Format: /s/{query}/{width}/{height}' }, { status: 400 })
    }

    const query = decodeURIComponent(match[1])
    const width = Math.min(Math.max(parseInt(match[2], 10) || 800, 100), 2400)
    const height = Math.min(Math.max(parseInt(match[3], 10) || 600, 100), 2400)

    const cacheKey = `img:${query}:${width}:${height}`

    // Check KV cache
    const cached = await env.IMAGE_CACHE.get(cacheKey)
    if (cached) {
      return Response.redirect(cached, 302)
    }

    // Search Unsplash
    const result = await searchUnsplash(query, width, height, env.UNSPLASH_ACCESS_KEY)

    if (!result) {
      return new Response(generateFallbackSVG(width, height, query), {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Cache in KV
    await env.IMAGE_CACHE.put(cacheKey, result.imageUrl, { expirationTtl: CACHE_TTL })

    // Fire-and-forget Unsplash download trigger (required by their API terms)
    const accessKey = env.UNSPLASH_ACCESS_KEY
    void fetch(`${result.downloadLocation}?client_id=${accessKey}`).catch(() => {})

    return Response.redirect(result.imageUrl, 302)
  },
}
