// server/lib/naming-utils.ts
//
// Shared naming convention utilities for code generation.
// Backed by lodash (case transforms) + pluralize (English inflection).

import { camelCase, kebabCase, startCase, upperFirst } from 'lodash'
import _pluralize from 'pluralize'

// ── Case transforms (lodash) ─────────────────────────────────────────────────

/** snake_case → PascalCase.  user_profile → UserProfile */
export const snakeToPascal = (str: string): string => upperFirst(camelCase(str))

/** snake_case → camelCase.  user_profile → userProfile */
export const snakeToCamel = (str: string): string => camelCase(str)

/** snake_case → kebab-case.  user_profile → user-profile */
export const snakeToKebab = (str: string): string => kebabCase(str)

/** snake_case → Title Case with spaces.  recipe_ingredients → "Recipe Ingredients" */
export const snakeToTitle = (str: string): string => startCase(str)

// ── English inflection (pluralize) ──────────────────────────────────────────
//
// Strategy: apply inflection to the LAST underscore-segment only so compound
// snake_case words work correctly:
//   menu_categories  → last="categories"  → plural unchanged → "menu_categories" ✓
//   recipe_ingredient→ last="ingredient"  → plural "ingredients"→ "recipe_ingredients" ✓
//   patients         → already plural     → unchanged → "patients" ✓

/** Pluralize a snake_case name (last segment only). */
export function pluralize(str: string): string {
  const parts = str.split('_')
  parts[parts.length - 1] = _pluralize(parts[parts.length - 1])
  return parts.join('_')
}

/** Singularize a snake_case name (last segment only). */
export function singularize(str: string): string {
  const parts = str.split('_')
  parts[parts.length - 1] = _pluralize.singular(parts[parts.length - 1])
  return parts.join('_')
}
