import type { VercelRequest, VercelResponse } from '@vercel/node'
import { searchUnsplash, triggerDownload } from './_lib/unsplash'
import { generateFallbackSVG } from './_lib/fallback-svg'

// Lazy-init Redis to avoid module-level crash if env vars missing
let redis: any = null
async function getRedis() {
  if (redis) return redis
  try {
    const { Redis } = await import('@upstash/redis')
    redis = Redis.fromEnv()
    return redis
  } catch {
    return null
  }
}

const CACHE_TTL = 86400

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = (req.url ?? '').replace(/^\/s\//, '').split('/')

  if (segments.length < 3) {
    return res.status(400).json({ error: 'Format: /s/{query}/{width}/{height}' })
  }

  const query = decodeURIComponent(segments[0])
  const width = Math.min(Math.max(parseInt(segments[1], 10) || 800, 100), 2400)
  const height = Math.min(Math.max(parseInt(segments[2], 10) || 600, 100), 2400)

  const cacheKey = `img:${query}:${width}:${height}`
  const r = await getRedis()

  // Check cache
  if (r) {
    try {
      const cached = await r.get(cacheKey)
      if (cached) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
        res.setHeader('X-Cache', 'HIT')
        return res.redirect(302, cached as string)
      }
    } catch { /* skip cache */ }
  }

  const result = await searchUnsplash(query, width, height)

  if (!result) {
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('X-Cache', 'MISS')
    return res.send(generateFallbackSVG(width, height, query))
  }

  // Cache result
  if (r) {
    try { await r.setex(cacheKey, CACHE_TTL, result.imageUrl) } catch { /* skip */ }
  }

  triggerDownload(result.downloadLocation)

  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  res.setHeader('X-Cache', 'MISS')
  return res.redirect(302, result.imageUrl)
}
