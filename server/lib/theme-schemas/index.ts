/**
 * Theme Base Schemas
 *
 * Each theme has a canonical base SchemaContract.
 * When Design Agent selects a theme, it loads the base schema
 * and merges it with user-requested features from the PRD.
 */

import type { SchemaContract } from '../schema-contract'
import { CANAPE_BASE_SCHEMA } from './canape'

/** Map theme names to their base schemas */
export const THEME_BASE_SCHEMAS: Record<string, SchemaContract> = {
  'theme-canape': CANAPE_BASE_SCHEMA,
  // 'theme-stratton': STRATTON_BASE_SCHEMA,
  // 'theme-quomi': QUOMI_BASE_SCHEMA,
  // ... more themes as they're defined
}

/**
 * Get base schema for a theme
 * Returns the theme's base schema if defined, otherwise undefined
 */
export function getThemeBaseSchema(themeName: string): SchemaContract | undefined {
  return THEME_BASE_SCHEMAS[themeName]
}

/**
 * Check if a theme has a defined base schema (theme-specific)
 */
export function isThemeSpecificSchema(themeName: string): boolean {
  return themeName in THEME_BASE_SCHEMAS
}

export { CANAPE_BASE_SCHEMA } from './canape'
