import type { SchemaContract, TableDef } from '../schema-contract'
import type { Capability, PageDef, NavEntry, ComponentDef, DesignHints } from './types'

export interface AssemblyResult {
  contract: SchemaContract
  pages: PageDef[]
  components: ComponentDef[]
  navEntries: NavEntry[]
  npmDependencies: Record<string, string>
  designHints: DesignHints
  capabilityManifest: string[]
  hasAuth: boolean
}

export function assembleCapabilities(capabilities: Capability[]): AssemblyResult {
  const tableMap = new Map<string, TableDef>()
  const pages: PageDef[] = []
  const routeSet = new Set<string>()
  const components: ComponentDef[] = []
  const allNavEntries: NavEntry[] = []
  const npmDeps: Record<string, string> = {}
  const mergedHints: DesignHints = {}
  const manifest: string[] = []

  for (const cap of capabilities) {
    manifest.push(cap.name)

    for (const table of cap.schema) {
      if (!tableMap.has(table.name)) {
        tableMap.set(table.name, table as TableDef)
      }
    }

    for (const page of cap.pages) {
      if (routeSet.has(page.path)) {
        throw new Error(`Route conflict: "${page.path}" is defined by both "${cap.name}" and a previous capability`)
      }
      routeSet.add(page.path)
      pages.push(page)
    }

    components.push(...cap.components)
    allNavEntries.push(...cap.navEntries)
    Object.assign(npmDeps, cap.dependencies.npm)
    Object.assign(mergedHints, cap.designHints)
  }

  allNavEntries.sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.label.localeCompare(b.label))

  const contract: SchemaContract = {
    tables: [...tableMap.values()],
  }

  return {
    contract,
    pages,
    components,
    navEntries: allNavEntries,
    npmDependencies: npmDeps,
    designHints: mergedHints,
    capabilityManifest: manifest,
    hasAuth: manifest.includes('auth'),
  }
}
