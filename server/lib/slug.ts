import slugify from 'slugify'

/**
 * Shared slug builder for app naming across deploy URLs and GitHub repos.
 */
export function buildAppSlug(appName: string, projectId: string): string {
  const slug = slugify(appName, { lower: true, strict: true })
  const shortId = projectId.slice(0, 8)
  return `${slug}-${shortId}`
}
