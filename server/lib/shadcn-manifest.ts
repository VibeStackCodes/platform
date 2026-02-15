import fs from 'node:fs'
import path from 'node:path'

export interface ComponentEntry {
  import: string
  exports: string[]
  components: string[] // PascalCase-only subset of exports
  deps: Record<string, string>
  requires?: string[]
}

export type ComponentManifest = Record<string, ComponentEntry>

const REGISTRY_DIR = path.join(process.cwd(), 'shadcn-registry')
const DEPS_FILE = path.join(REGISTRY_DIR, '_deps.json')

/**
 * Extract exported names from a .tsx file.
 * Handles three patterns:
 * 1. export function ComponentName
 * 2. export const ComponentName
 * 3. export { ComponentA, ComponentB, ... }
 */
function extractExports(source: string): string[] {
  const exports: string[] = []

  // Pattern 1: export function ComponentName
  for (const match of source.matchAll(/export\s+function\s+(\w+)/g)) {
    exports.push(match[1])
  }

  // Pattern 2: export const ComponentName
  for (const match of source.matchAll(/export\s+const\s+(\w+)/g)) {
    exports.push(match[1])
  }

  // Pattern 3: export { Foo, Bar, Baz } (the MOST COMMON pattern in shadcn)
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    const names = match[1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    exports.push(...names)
  }

  // Deduplicate (a name might appear in both export {} and export const)
  return [...new Set(exports)]
}

/**
 * Generate manifest of all shadcn components in the registry.
 * Used as context for the Frontend Engineer agent.
 */
export function generateShadcnManifest(): ComponentManifest {
  const depsData = JSON.parse(fs.readFileSync(DEPS_FILE, 'utf-8'))
  const manifest: ComponentManifest = {}
  const files = fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.tsx'))

  if (files.length === 0) {
    throw new Error(`No .tsx files found in ${REGISTRY_DIR}`)
  }

  for (const file of files) {
    const name = path.basename(file, '.tsx')
    const source = fs.readFileSync(path.join(REGISTRY_DIR, file), 'utf-8')
    const exports = extractExports(source)
    const components = exports.filter((name) => /^[A-Z]/.test(name))
    const depEntry = depsData[name] ?? { deps: {} }

    manifest[name] = {
      import: `@/components/ui/${name}`,
      exports,
      components,
      deps: depEntry.deps ?? {},
      ...(depEntry.requires ? { requires: depEntry.requires } : {}),
    }
  }

  return manifest
}
