/**
 * Fetch wrapper with timeout using native AbortSignal.timeout()
 *
 * Prevents hanging requests to external services (Vercel, GitHub, Supabase).
 * Default 30s timeout matches Vercel serverless function limits.
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 30_000, ...fetchOptions } = options
  return fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeout),
  })
}
