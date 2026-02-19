import type { Capability } from '../types'

export const recipes: Capability = {
  name: 'recipes',
  version: 1,
  description: 'Recipe catalog with ingredients, difficulty, and prep timings',
  schema: [
    {
      name: 'recipes',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'author_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'title', type: 'text', nullable: false },
        { name: 'slug', type: 'text', nullable: false, unique: true },
        { name: 'description', type: 'text', nullable: true },
        { name: 'ingredients', type: 'text', nullable: true },
        { name: 'instructions', type: 'text', nullable: true },
        { name: 'prep_time_minutes', type: 'integer', nullable: true },
        { name: 'cook_time_minutes', type: 'integer', nullable: true },
        { name: 'servings', type: 'integer', nullable: true },
        { name: 'difficulty', type: 'text', nullable: true },
        { name: 'image_url', type: 'text', nullable: true },
        { name: 'is_published', type: 'boolean', nullable: false, default: 'false' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
  pages: [
    { path: '/recipes', type: 'public-list', entity: 'recipes' },
    { path: '/recipes/$id', type: 'public-detail', entity: 'recipes' },
    { path: '/admin/recipes', type: 'crud-list', entity: 'recipes' },
    { path: '/admin/recipes/$id', type: 'crud-detail', entity: 'recipes' },
  ],
  components: [],
  dependencies: {
    npm: {},
    capabilities: ['auth'],
  },
  navEntries: [
    { label: 'Recipes', path: '/recipes', position: 'main', order: 10 },
  ],
  designHints: {
    cardStyle: 'media-heavy',
    heroType: 'image-split',
  },
}
