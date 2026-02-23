import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { searchUnsplash, triggerDownload } from '../_lib/unsplash.js'
import { generateFallbackSVG } from '../_lib/fallback-svg.js'

const redis = Redis.fromEnv()
const CACHE_TTL = 86400 // 24 hours

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url!, `https://${req.headers.host}`)
  const segments = url.pathname.replace('/api/s/', '').split('/')

  if (segments.length < 3) {
    return res.status(400).json({ error: 'Format: /s/{query}/{width}/{height}' })
  }

  const query = decodeURIComponent(segments[0])
  const width = Math.min(Math.max(parseInt(segments[1], 10) || 800, 100), 2400)
  const height = Math.min(Math.max(parseInt(segments[2], 10) || 600, 100), 2400)

  const cacheKey = `img:${query}:${width}:${height}`

  // Check Upstash Redis cache
  const cached = await redis.get<string>(cacheKey)
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
    res.setHeader('X-Cache', 'HIT')
    return res.redirect(302, cached)
  }

  // Query Unsplash
  const result = await searchUnsplash(query, width, height)

  if (!result) {
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.send(generateFallbackSVG(width, height, query))
  }

  // Cache in Upstash Redis
  await redis.setex(cacheKey, CACHE_TTL, result.imageUrl)

  // Trigger Unsplash download tracking (compliance)
  triggerDownload(result.downloadLocation)

  // Redirect to optimized Unsplash URL
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  res.setHeader('X-Cache', 'MISS')
  return res.redirect(302, result.imageUrl)
}
