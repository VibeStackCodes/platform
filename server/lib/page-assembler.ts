/**
 * Page Assembler
 *
 * Takes a validated PageCompositionPlan + entity metadata and produces a
 * map of file path → complete TanStack Router route file content.
 *
 * Each route file is assembled by:
 *   1. Resolving a TanStack Router file path from the route path string
 *   2. Building a SectionContext for every section slot (binding entity meta)
 *   3. Invoking each section's renderer to get a SectionOutput
 *   4. Deduplicating imports, collecting hooks, and composing the route file
 */

import type { ThemeTokens } from './themed-code-engine'
import type {
  EntityMeta,
  PageCompositionPlan,
  PageCompositionPlanV2,
  SectionContext,
  SectionOutput,
  SectionVisualSpec,
} from './sections/types'
import { getSectionRenderer } from './sections'

// ---------------------------------------------------------------------------
// Route path helpers
// ---------------------------------------------------------------------------

/**
 * Derive a React component name from a route path.
 *
 * Examples:
 *   /             → Homepage
 *   /recipes/     → RecipesPage
 *   /recipes/$id  → RecipeDetailPage
 */
export function routePathToComponentName(path: string): string {
  if (path === '/') return 'Homepage'

  // Strip leading/trailing slashes and split segments
  const segments = path.replace(/^\/|\/$/g, '').split('/')

  // If the last segment is a param ($id, $slug, etc.) → Detail page
  const lastSegment = segments[segments.length - 1] ?? ''
  if (lastSegment.startsWith('$')) {
    const entitySegment = segments[segments.length - 2] ?? segments[0] ?? 'item'
    const base = kebabToPascal(entitySegment)
    return `${base}DetailPage`
  }

  // Otherwise use the last non-param segment
  const base = kebabToPascal(lastSegment || (segments[0] ?? 'page'))
  return `${base}Page`
}

/**
 * Derive the TanStack Router fileRoute string for the createFileRoute() call.
 *
 * The fileRoute matches the URL path exactly.
 *   /             → '/'
 *   /recipes/     → '/recipes/'
 *   /recipes/$id  → '/recipes/$id'
 */
export function routePathToFileRoute(path: string): string {
  return path
}

/**
 * Derive the file system path for a route file.
 *
 * Examples:
 *   /             → src/routes/index.tsx
 *   /recipes/     → src/routes/recipes/index.tsx
 *   /recipes/$id  → src/routes/recipes/$id.tsx
 */
export function routePathToFilePath(path: string): string {
  if (path === '/') return 'src/routes/index.tsx'

  // Strip leading slash, normalise trailing slash
  const stripped = path.replace(/^\//, '').replace(/\/$/, '')
  const segments = stripped.split('/')

  const lastSegment = segments[segments.length - 1] ?? ''

  if (lastSegment.startsWith('$')) {
    // Param route: /recipes/$id → src/routes/recipes/$id.tsx
    return `src/routes/${segments.join('/')}.tsx`
  }

  // Directory index route: /recipes/ → src/routes/recipes/index.tsx
  return `src/routes/${segments.join('/')}/index.tsx`
}

// ---------------------------------------------------------------------------
// Entity resolution
// ---------------------------------------------------------------------------

/**
 * Build a SectionContext for a given section slot.
 *
 * When the slot has an entityBinding, the named EntityMeta is looked up and
 * all entity-specific fields (tableName, displayColumn, dataVar, itemVar …)
 * are populated.  Returns null when the entityBinding references an unknown
 * entity so the assembler can skip the slot.
 */
function buildSectionContext(
  slot: { sectionId: string; entityBinding?: string; config?: Record<string, unknown> },
  entities: EntityMeta[],
  tokens: ThemeTokens,
  appName: string,
): SectionContext | null {
  const base: SectionContext = {
    tokens,
    appName,
    heroImages: tokens.heroImages,
    hasAuth: tokens.authPosture !== 'public',
    config: slot.config ?? {},
    allEntities: entities,
  }

  if (!slot.entityBinding) return base

  const entity = entities.find((e) => e.tableName === slot.entityBinding)
  if (!entity) {
    console.warn(
      `[page-assembler] section "${slot.sectionId}" has entityBinding "${slot.entityBinding}" ` +
        `but no matching entity was found — skipping section`,
    )
    return null
  }

  const dataVar = kebabToCamel(entity.pluralKebab)
  const itemVar = singularVar(dataVar)

  return {
    ...base,
    entityName: entity.tableName,
    entitySlug: entity.pluralKebab,
    tableName: entity.tableName,
    displayColumn: entity.displayColumn ?? undefined,
    imageColumn: entity.imageColumn ?? undefined,
    metadataColumns: entity.metadataColumns,
    dataVar,
    itemVar,
  }
}

// ---------------------------------------------------------------------------
// Import merging
// ---------------------------------------------------------------------------

/**
 * Regex to match:  import { Foo, Bar } from 'some-module'
 * Groups: (1) named specifiers, (2) module path
 */
const NAMED_IMPORT_RE = /^import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"]\s*;?$/

/**
 * Merge import statements that share the same source module.
 *
 * When two sections both import from 'react' with different specifiers
 * (e.g. `import { useState } from 'react'` and
 *       `import { useState, useEffect } from 'react'`),
 * this produces a single merged import:
 *       `import { useEffect, useState } from 'react'`
 *
 * Non-named imports (default, namespace, side-effect) are kept as-is
 * and deduplicated by exact string match.
 */
function mergeImports(rawImports: string[]): string[] {
  // source module → Set of specifier names
  const namedByModule = new Map<string, Set<string>>()
  // Preserve insertion order of modules
  const moduleOrder: string[] = []
  // Non-named imports (deduplicated by exact match)
  const otherImports = new Set<string>()

  for (const imp of rawImports) {
    const match = imp.match(NAMED_IMPORT_RE)
    if (match) {
      const specifiers = match[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const modulePath = match[2]

      if (!namedByModule.has(modulePath)) {
        namedByModule.set(modulePath, new Set())
        moduleOrder.push(modulePath)
      }
      const set = namedByModule.get(modulePath)!
      for (const s of specifiers) set.add(s)
    } else {
      otherImports.add(imp)
    }
  }

  // Reconstruct merged named imports in insertion order
  const result: string[] = []
  for (const mod of moduleOrder) {
    const specifiers = [...namedByModule.get(mod)!].sort()
    result.push(`import { ${specifiers.join(', ')} } from '${mod}'`)
  }

  // Append other imports
  for (const imp of otherImports) {
    result.push(imp)
  }

  return result
}

// ---------------------------------------------------------------------------
// Route file builder
// ---------------------------------------------------------------------------

/**
 * Compose a complete TanStack Router route file from an ordered list of
 * SectionOutput values.
 */
function buildRouteFile(
  routePath: string,
  sections: SectionOutput[],
  routeId: string,
  componentName: string,
): string {
  // Collect all raw import strings from sections
  const rawImports: string[] = [
    "import { createFileRoute } from '@tanstack/react-router'",
  ]

  for (const s of sections) {
    for (const imp of s.imports ?? []) {
      rawImports.push(imp)
    }
  }

  // Smart import merging: group named imports by source module, merge specifiers
  const allImports = mergeImports(rawImports)

  // Collect hooks
  const allHooks = sections.flatMap((s) => s.hooks ?? [])

  const hooksBlock =
    allHooks.length > 0 ? `\n  ${allHooks.join('\n  ')}\n` : ''

  const jsxBody = sections.map((s) => s.jsx).join('\n      ')

  return `${allImports.join('\n')}

export const Route = createFileRoute('${routeId}')({
  component: ${componentName},
})

function ${componentName}() {${hooksBlock}
  return (
    <>
      ${jsxBody}
    </>
  )
}
`
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Assemble all pages in a PageCompositionPlan into complete route file
 * strings, keyed by their file system path (e.g. "src/routes/index.tsx").
 *
 * Sections whose renderer is not registered or whose entity binding cannot be
 * resolved are silently skipped (a warning is printed to stderr).
 */
export function assemblePages(
  plan: PageCompositionPlan,
  entities: EntityMeta[],
  tokens: ThemeTokens,
  appName: string,
): Record<string, string> {
  const output: Record<string, string> = {}

  for (const [routePath, slots] of Object.entries(plan.pages)) {
    const filePath = routePathToFilePath(routePath)
    const componentName = routePathToComponentName(routePath)
    const routeId = routePathToFileRoute(routePath)

    const renderedSections: SectionOutput[] = []

    for (const slot of slots) {
      const renderer = getSectionRenderer(slot.sectionId)
      if (!renderer) {
        console.warn(
          `[page-assembler] no renderer registered for section id "${slot.sectionId}" ` +
            `on route "${routePath}" — skipping`,
        )
        continue
      }

      const ctx = buildSectionContext(slot, entities, tokens, appName)
      if (ctx === null) {
        // buildSectionContext already logged the warning
        continue
      }

      renderedSections.push(renderer(ctx))
    }

    if (renderedSections.length === 0) {
      console.warn(
        `[page-assembler] route "${routePath}" produced zero sections after rendering — ` +
          `the route file will be an empty shell`,
      )
    }

    output[filePath] = buildRouteFile(routePath, renderedSections, routeId, componentName)
  }

  return output
}

/**
 * V2 page assembler — accepts PageCompositionPlanV2 with visual specs.
 *
 * Differences from V1:
 *   - Input is routes[] (not pages Record)
 *   - globalNav/globalFooter auto-prepended/appended
 *   - SectionVisualSpec fields spread into SectionContext.config
 */
export function assemblePagesV2(
  plan: PageCompositionPlanV2,
  entities: EntityMeta[],
  tokens: ThemeTokens,
  appName: string,
): Record<string, string> {
  const output: Record<string, string> = {}

  for (const route of plan.routes) {
    const filePath = routePathToFilePath(route.path)
    const componentName = routePathToComponentName(route.path)
    const routeId = routePathToFileRoute(route.path)

    // Build full section list: globalNav + route sections + globalFooter
    const allSpecs: SectionVisualSpec[] = []

    if (plan.globalNav) {
      allSpecs.push({
        sectionId: plan.globalNav as SectionVisualSpec['sectionId'],
        background: 'default',
        spacing: 'compact',
        showBadges: true,
        showMetadata: true,
      })
    }

    allSpecs.push(...route.sections)

    if (plan.globalFooter) {
      allSpecs.push({
        sectionId: plan.globalFooter as SectionVisualSpec['sectionId'],
        background: 'default',
        spacing: 'normal',
        showBadges: true,
        showMetadata: true,
      })
    }

    const renderedSections: SectionOutput[] = []

    for (const spec of allSpecs) {
      const renderer = getSectionRenderer(spec.sectionId)
      if (!renderer) {
        console.warn(
          `[page-assembler-v2] no renderer for section "${spec.sectionId}" on route "${route.path}" — skipping`,
        )
        continue
      }

      // Spread visual spec fields into config so renderers read them via resolvers
      const configFromSpec: Record<string, unknown> = {
        background: spec.background,
        spacing: spec.spacing,
        showBadges: spec.showBadges,
        showMetadata: spec.showMetadata,
      }
      if (spec.cardVariant) configFromSpec.cardVariant = spec.cardVariant
      if (spec.gridColumns) configFromSpec.gridColumns = spec.gridColumns
      if (spec.imageAspect) configFromSpec.imageAspect = spec.imageAspect
      if (spec.limit) configFromSpec.limit = spec.limit
      if (spec.text) {
        if (spec.text.headline) configFromSpec.headline = spec.text.headline
        if (spec.text.subtext) configFromSpec.subtext = spec.text.subtext
        if (spec.text.buttonLabel) configFromSpec.buttonLabel = spec.text.buttonLabel
        if (spec.text.emptyStateMessage) configFromSpec.emptyStateMessage = spec.text.emptyStateMessage
      }

      const ctx = buildSectionContext(
        { sectionId: spec.sectionId, entityBinding: spec.entityBinding, config: configFromSpec },
        entities,
        tokens,
        appName,
      )
      if (ctx === null) continue

      renderedSections.push(renderer(ctx))
    }

    if (renderedSections.length === 0) {
      console.warn(
        `[page-assembler-v2] route "${route.path}" produced zero sections — empty shell`,
      )
    }

    output[filePath] = buildRouteFile(route.path, renderedSections, routeId, componentName)
  }

  return output
}

// ---------------------------------------------------------------------------
// Private string utilities
// ---------------------------------------------------------------------------

/** "my-recipes" → "MyRecipes" */
function kebabToPascal(str: string): string {
  return str
    .split('-')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
}

/** "my-recipes" → "myRecipes" */
function kebabToCamel(str: string): string {
  const pascal = kebabToPascal(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

/**
 * Derive a singular variable name from a plural camelCase variable name.
 *
 * Uses very lightweight suffix heuristics — sufficient for generated code
 * where the pluralKebab is already a clean English plural from the naming
 * utilities (e.g. "recipes" → "recipe", "categories" → "category").
 */
function singularVar(plural: string): string {
  if (plural.endsWith('ies')) return plural.slice(0, -3) + 'y'
  if (plural.endsWith('ses') || plural.endsWith('xes') || plural.endsWith('zes')) {
    return plural.slice(0, -2)
  }
  if (plural.endsWith('s') && plural.length > 2) return plural.slice(0, -1)
  return plural
}
