// server/lib/naming-utils.ts
//
// Shared naming convention utilities for code generation.
// Uses the npm `pluralize` package for correct English pluralization
// (handles already-plural words like "patients", "categories", "statuses").

import _pluralize from 'pluralize'

/**
 * Convert snake_case to PascalCase (no spaces).
 * Example: user_profile → UserProfile, bookmark_tag → BookmarkTag
 * Used for: React component names, TypeScript type names.
 */
export function snakeToPascal(str: string): string {
  return str.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

/**
 * Convert snake_case to camelCase.
 * Example: user_profile → userProfile, bookmark_tag → bookmarkTag
 * Used for: React hook variable names, object property names.
 */
export function snakeToCamel(str: string): string {
  const p = snakeToPascal(str)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

/**
 * Convert snake_case to kebab-case.
 * Example: bookmark_tag → bookmark-tag, user_profile → user-profile
 * Used for: URL route paths, CSS class names, file names.
 */
export function snakeToKebab(str: string): string {
  return str.replace(/_/g, '-')
}

/**
 * Convert snake_case to Title Case with spaces.
 * Example: recipe_ingredients → "Recipe Ingredients", menu_categories → "Menu Categories"
 * Used for: page headings (h1), navigation labels, dialog titles.
 */
export function snakeToTitle(str: string): string {
  return str.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Pluralize a snake_case name using the npm `pluralize` package.
 *
 * Strategy: pluralize only the LAST underscore-segment so compound words
 * like "menu_categories" or "recipe_ingredients" are handled correctly.
 *
 * Examples:
 *   task             → tasks
 *   category         → categories      (y → ies)
 *   status           → statuses        (sibilant ending)
 *   box              → boxes           (x → xes)
 *   patients         → patients        (already plural — unchanged ✓)
 *   menu_categories  → menu_categories (last segment "categories" already plural ✓)
 *   recipe_ingredient→ recipe_ingredients
 */
export function pluralize(str: string): string {
  const parts = str.split('_')
  parts[parts.length - 1] = _pluralize(parts[parts.length - 1])
  return parts.join('_')
}

/**
 * Singularize a snake_case name (last segment only).
 * Example: patients → patient, menu_categories → menu_category
 * Used for: singular form labels like "New Patient", "Delete Category".
 */
export function singularize(str: string): string {
  const parts = str.split('_')
  parts[parts.length - 1] = _pluralize.singular(parts[parts.length - 1])
  return parts.join('_')
}
