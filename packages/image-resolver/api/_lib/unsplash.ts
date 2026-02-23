const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY!

export interface UnsplashResult {
  imageUrl: string
  downloadLocation: string
}

export async function searchUnsplash(
  query: string,
  width: number,
  height: number,
): Promise<UnsplashResult | null> {
  const ratio = width / height
  const orientation = ratio > 1.3 ? 'landscape' : ratio < 0.77 ? 'portrait' : 'squarish'

  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', query)
  url.searchParams.set('per_page', '3')
  url.searchParams.set('orientation', orientation)
  url.searchParams.set('content_filter', 'high')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  })

  if (!res.ok) return null

  const data = await res.json()
  if (!data.results?.length) return null

  const targetRatio = width / height
  const best = data.results.reduce(
    (prev: UnsplashPhoto, curr: UnsplashPhoto) => {
      const prevRatio = prev.width / prev.height
      const currRatio = curr.width / curr.height
      return Math.abs(currRatio - targetRatio) < Math.abs(prevRatio - targetRatio) ? curr : prev
    },
    data.results[0] as UnsplashPhoto,
  )

  return {
    imageUrl: `${best.urls.raw}&w=${width}&h=${height}&fit=crop&auto=format&q=80`,
    downloadLocation: best.links.download_location,
  }
}

export function triggerDownload(downloadLocation: string): void {
  fetch(`${downloadLocation}?client_id=${UNSPLASH_ACCESS_KEY}`).catch(() => {})
}

interface UnsplashPhoto {
  width: number
  height: number
  urls: { raw: string }
  links: { download_location: string }
}
