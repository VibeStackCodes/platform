import type { Capability } from './types'

export class CapabilityRegistry {
  private caps = new Map<string, Capability>()

  register(cap: Capability): void {
    this.caps.set(cap.name, cap)
  }

  get(name: string): Capability | undefined {
    return this.caps.get(name)
  }

  list(): Capability[] {
    return [...this.caps.values()]
  }

  resolve(requested: string[]): Capability[] {
    const resolved: Capability[] = []
    const resolvedNames = new Set<string>()
    const visiting = new Set<string>()

    const visit = (name: string, path: string[]) => {
      if (resolvedNames.has(name)) return
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${[...path, name].join(' -> ')}`)
      }

      const cap = this.caps.get(name)
      if (!cap) {
        throw new Error(`Missing capability dependency: "${name}" (required by ${path.at(-1) ?? 'root'})`)
      }

      visiting.add(name)
      for (const dep of cap.dependencies.capabilities) {
        visit(dep, [...path, name])
      }
      visiting.delete(name)

      resolvedNames.add(name)
      resolved.push(cap)
    }

    for (const name of requested) {
      visit(name, [])
    }

    return resolved
  }
}
