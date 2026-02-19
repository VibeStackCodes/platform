import type { Capability } from '../types'

export const publicWebsite: Capability = {
  name: 'public-website',
  version: 1,
  description: 'Public marketing pages and base navigation',
  schema: [],
  pages: [
    { path: '/', type: 'static', template: 'landing' },
    { path: '/about', type: 'static', template: 'about' },
    { path: '/contact', type: 'static', template: 'contact' },
  ],
  components: [],
  dependencies: { npm: {}, capabilities: [] },
  navEntries: [
    { label: 'Home', path: '/', position: 'main', order: 0 },
    { label: 'About', path: '/about', position: 'main', order: 99 },
  ],
  designHints: {
    heroType: 'text-centered',
  },
}
