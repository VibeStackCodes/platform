import { loadCoreRegistry } from './catalog'
import { assembleCapabilities, type AssemblyResult } from './assembler'

export interface InjectAnalysis {
  /** Capabilities not yet installed that should be added */
  newCapabilities: string[]
  /** Full merged list (existing + new) */
  mergedManifest: string[]
  /** Assembly result for ONLY the new capabilities (additive) */
  additiveAssembly: AssemblyResult | null
  /** Assembly result for the full merged set */
  fullAssembly: AssemblyResult
  /** Whether there's actually anything new to add */
  hasChanges: boolean
}

/**
 * Given an existing project's capability manifest and the analyst's newly
 * selected capabilities, compute what needs to be added.
 *
 * @param existingManifest - Capabilities already installed (from generationState)
 * @param requestedCapabilities - Capabilities the analyst selected for this request
 * @returns InjectAnalysis with additive and full assembly results
 */
export function analyzeInjection(
  existingManifest: string[],
  requestedCapabilities: string[],
): InjectAnalysis {
  const registry = loadCoreRegistry()
  const existingSet = new Set(existingManifest)

  // Find capabilities that aren't already installed
  const newCapabilities = requestedCapabilities.filter(name => !existingSet.has(name))

  // Merged manifest = existing + new (deduplicated, preserving order)
  const mergedManifest = [...existingManifest]
  for (const name of newCapabilities) {
    if (!mergedManifest.includes(name)) {
      mergedManifest.push(name)
    }
  }

  // Resolve and assemble the full merged set
  const fullResolved = registry.resolve(mergedManifest)
  const fullAssembly = assembleCapabilities(fullResolved)

  // Resolve and assemble ONLY the new capabilities (for additive SQL migration)
  let additiveAssembly: AssemblyResult | null = null
  if (newCapabilities.length > 0) {
    const newResolved = registry.resolve(newCapabilities)
    additiveAssembly = assembleCapabilities(newResolved)
  }

  return {
    newCapabilities,
    mergedManifest,
    additiveAssembly,
    fullAssembly,
    hasChanges: newCapabilities.length > 0,
  }
}
