import type { Capability } from '../types'

export const blog: Capability = {
  name: 'blog',
  version: 1,
  description: 'Blog with posts, categories, and editorial metadata',
  schema: [
    {
      name: 'posts',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'author_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'category_id', type: 'uuid', nullable: true, references: { table: 'categories', column: 'id' } },
        { name: 'title', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false, unique: true },
        { name: 'excerpt', type: 'text', nullable: true },
        { name: 'content', type: 'text', nullable: true },
        { name: 'cover_image_url', type: 'text', nullable: true },
        { name: 'published_at', type: 'timestamptz', nullable: true },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'categories',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false, unique: true },
        { name: 'slug', type: 'text', nullable: false, unique: true },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
  pages: [
    { path: '/blog', type: 'public-list', entity: 'posts' },
    { path: '/blog/$id', type: 'public-detail', entity: 'posts' },
    { path: '/admin/posts', type: 'crud-list', entity: 'posts' },
    { path: '/admin/posts/$id', type: 'crud-detail', entity: 'posts' },
  ],
  components: [],
  dependencies: {
    npm: {},
    capabilities: ['auth'],
  },
  navEntries: [
    { label: 'Blog', path: '/blog', position: 'main', order: 20 },
  ],
  designHints: {
    cardStyle: 'text-first',
    heroType: 'featured-item',
  },
}
