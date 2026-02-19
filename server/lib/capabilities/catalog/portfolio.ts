import type { Capability } from '../types'

export const portfolio: Capability = {
  name: 'portfolio',
  version: 1,
  description: 'Portfolio projects and case studies for creative professionals',
  schema: [
    {
      name: 'projects',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'owner_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'title', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false, unique: true },
        { name: 'client_name', type: 'text', nullable: true },
        { name: 'summary', type: 'text', nullable: true },
        { name: 'body', type: 'text', nullable: true },
        { name: 'cover_image_url', type: 'text', nullable: true },
        { name: 'project_url', type: 'text', nullable: true },
        { name: 'published_at', type: 'timestamptz', nullable: true },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
  pages: [
    { path: '/projects', type: 'public-list', entity: 'projects' },
    { path: '/projects/$id', type: 'public-detail', entity: 'projects' },
    { path: '/admin/projects', type: 'crud-list', entity: 'projects' },
    { path: '/admin/projects/$id', type: 'crud-detail', entity: 'projects' },
  ],
  components: [],
  dependencies: {
    npm: {},
    capabilities: ['auth'],
  },
  navEntries: [
    { label: 'Projects', path: '/projects', position: 'main', order: 15 },
  ],
  designHints: {
    cardStyle: 'media-heavy',
    heroType: 'featured-item',
  },
}
