import { CapabilityRegistry } from '../registry'
import { auth } from './auth/contract'
import { publicWebsite } from './public-website/contract'
import { blog } from './blog/contract'
import { recipes } from './recipes/contract'
import { portfolio } from './portfolio/contract'

export function loadCoreRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(auth)
  registry.register(publicWebsite)
  registry.register(blog)
  registry.register(recipes)
  registry.register(portfolio)
  return registry
}

/** Absolute path to capability catalog — pass to Mastra Workspace skills config */
export function getCapabilitySkillsPath(): string {
  return import.meta.dirname
}
