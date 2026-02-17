// server/lib/naming-utils.ts
//
// Shared naming convention utilities for code generation.
// Used by assembler and contract-to-pages.

/**
 * Convert snake_case to PascalCase.
 * Example: user_profile → UserProfile, bookmark_tag → BookmarkTag
 */
export function snakeToPascal(str: string): string {
  return str.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/**
 * Convert snake_case to camelCase.
 * Example: user_profile → userProfile, bookmark_tag → bookmarkTag
 */
export function snakeToCamel(str: string): string {
  const p = snakeToPascal(str)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

/**
 * Convert snake_case to kebab-case.
 * Example: bookmark_tag → bookmark-tag, user_profile → user-profile
 */
export function snakeToKebab(str: string): string {
  return str.replace(/_/g, '-')
}

/**
 * Simple pluralization helper.
 * Handles common English pluralization rules:
 * - Words ending in 'y' → 'ies' (category → categories)
 * - Words ending in 's', 'sh', 'ch', 'x', 'z' → '+es' (box → boxes)
 * - Default → '+s' (task → tasks)
 *
 * Example: task → tasks, category → categories, status → statuses, box → boxes
 */
export function pluralize(str: string): string {
  // Handle 'y' ending (but not 'ey', 'oy', 'ay')
  if (str.endsWith('y') && !str.endsWith('ey') && !str.endsWith('oy') && !str.endsWith('ay')) {
    return str.slice(0, -1) + 'ies'
  }
  // Handle sibilant endings
  if (str.endsWith('s') || str.endsWith('sh') || str.endsWith('ch') || str.endsWith('x') || str.endsWith('z')) {
    return str + 'es'
  }
  // Default: just add 's'
  return str + 's'
}
