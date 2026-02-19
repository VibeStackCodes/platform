import { CapabilityRegistry } from '../registry'
import { auth } from './auth'
import { publicWebsite } from './public-website'
import { blog } from './blog'
import { recipes } from './recipes'
import { portfolio } from './portfolio'

export function loadCoreRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(auth)
  registry.register(publicWebsite)
  registry.register(blog)
  registry.register(recipes)
  registry.register(portfolio)
  return registry
}
