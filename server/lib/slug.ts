import slugify from 'slugify'

/**
 * Shared slug builder for app naming across deploy URLs and GitHub repos.
 * Uses first 12 chars of projectId (UUID) for uniqueness — 16^12 = 2.8 trillion combos.
 */
export function buildAppSlug(appName: string, projectId: string): string {
  const slug = slugify(appName, { lower: true, strict: true })
  const shortId = projectId.replace(/-/g, '').slice(0, 12)
  return `${slug}-${shortId}`
}
