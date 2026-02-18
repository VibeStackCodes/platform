// server/lib/unsplash.ts
//
// Fetch hero images from Unsplash API.
// Gracefully no-ops when UNSPLASH_ACCESS_KEY is unset.

import type { HeroImage } from './design-spec'

interface UnsplashPhoto {
  id: string
  urls: { regular: string; small: string }
  alt_description: string | null
  user: { name: string }
}

interface UnsplashSearchResult {
  results: UnsplashPhoto[]
}

/**
 * Fetch hero images from Unsplash for use in full-bleed hero sections.
 * Returns empty array if UNSPLASH_ACCESS_KEY is not set.
 *
 * @param query - search query (e.g., "food photography recipes")
 * @param count - number of images to fetch (default: 3)
 */
export async function fetchHeroImages(query: string, count: number = 3): Promise<HeroImage[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) {
    console.log('[unsplash] UNSPLASH_ACCESS_KEY not set — skipping hero images')
    return []
  }

  try {
    const url = new URL('https://api.unsplash.com/search/photos')
    url.searchParams.set('query', query)
    url.searchParams.set('per_page', String(count))
    url.searchParams.set('orientation', 'landscape')

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    })

    if (!response.ok) {
      console.warn(`[unsplash] API error ${response.status} — skipping hero images`)
      return []
    }

    const data = (await response.json()) as UnsplashSearchResult

    return data.results.map((photo) => ({
      url: photo.urls.regular,
      alt: photo.alt_description ?? query,
      photographer: photo.user.name,
    }))
  } catch (error) {
    console.warn('[unsplash] Fetch failed — skipping hero images:', error)
    return []
  }
}
