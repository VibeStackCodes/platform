/**
 * Theme Route Generators
 *
 * Unified entry point for all theme-specific route generators.
 * Each theme produces 1:1 visual clones with public + admin routes.
 */

import type { FeatureSchema } from '../feature-schema'
import { CanapeRoutes } from './canape'

export type ThemeName = 'canape' | 'quomi' | 'clune' | 'default'

export interface ThemeRouteContext {
  appName: string
  allPublicMeta: FeatureSchema['publicMeta']
  siteEmail?: string
  heroImages: string[]
}

/**
 * Get theme-specific route generators
 * Falls back to canape for now until other themes are implemented
 */
export function getThemeRoutes(themeName: ThemeName) {
  switch (themeName) {
    case 'canape':
      return CanapeRoutes
    case 'quomi':
    case 'clune':
    case 'default':
      // Fall back to Canape for now
      return CanapeRoutes
    default:
      return CanapeRoutes
  }
}

/**
 * Dispatch to theme-specific homepage generator
 */
export function renderThemeHomepage(
  themeName: ThemeName,
  meta: FeatureSchema['publicMeta'][0],
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.homepage(meta, context)
}

/**
 * Dispatch to theme-specific menu archive generator
 */
export function renderThemeMenuArchive(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.menuArchive(context)
}

/**
 * Dispatch to theme-specific menu category generator
 */
export function renderThemeMenuCategory(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.menuCategory(context)
}

/**
 * Dispatch to theme-specific news archive generator
 */
export function renderThemeNewsArchive(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.newsArchive(context)
}

/**
 * Dispatch to theme-specific post generator
 */
export function renderThemePost(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.post(context)
}

/**
 * Dispatch to theme-specific page generator
 */
export function renderThemePage(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.page(context)
}

/**
 * Dispatch to theme-specific reservations page generator
 */
export function renderThemeReservations(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.reservations(context)
}

/**
 * Dispatch to theme-specific admin entities generator
 */
export function renderThemeAdminEntities(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.adminEntities(context)
}

/**
 * Dispatch to theme-specific admin menu items generator
 */
export function renderThemeAdminMenuItems(
  themeName: ThemeName,
  context: ThemeRouteContext
): string {
  const routes = getThemeRoutes(themeName)
  return routes.adminMenuItems(context)
}

export { CanapeRoutes }
