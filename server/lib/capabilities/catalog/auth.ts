import type { Capability } from '../types'

export const auth: Capability = {
  name: 'auth',
  version: 1,
  description: 'Authentication and user profile data',
  schema: [
    {
      name: 'profiles',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, references: { table: 'auth.users', column: 'id' } },
        { name: 'display_name', type: 'text', nullable: true },
        { name: 'avatar_url', type: 'text', nullable: true },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
  pages: [
    { path: '/auth/login', type: 'static', template: 'login' },
    { path: '/auth/signup', type: 'static', template: 'signup' },
  ],
  components: [],
  dependencies: { npm: {}, capabilities: [] },
  navEntries: [],
  designHints: {},
}
