/**
 * Shared slug builder for app naming across deploy URLs and GitHub repos.
 */
export function buildAppSlug(appName: string, projectId: string): string {
  const slug = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const shortId = projectId.slice(0, 8);
  return `${slug}-${shortId}`;
}
