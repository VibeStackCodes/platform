// server/lib/db/schema.ts
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email'),
  plan: text('plan').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  creditsRemaining: integer('credits_remaining').notNull().default(200),
  creditsMonthly: integer('credits_monthly').notNull().default(200),
  creditsResetAt: timestamp('credits_reset_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prompt: text('prompt'),
  description: text('description'),
  status: text('status').notNull().default('pending'),
  plan: jsonb('plan'),
  model: text('model'),
  generationState: jsonb('generation_state').default({}),
  sandboxId: text('sandbox_id'),
  previewUrl: text('preview_url'),
  codeServerUrl: text('code_server_url'),
  deployUrl: text('deploy_url'),
  githubRepoUrl: text('github_repo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  type: text('type').notNull().default('message'),
  parts: jsonb('parts').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  model: text('model').notNull().default('gpt-5.2'),
  tokensInput: integer('tokens_input').notNull().default(0),
  tokensOutput: integer('tokens_output').notNull().default(0),
  tokensTotal: integer('tokens_total').notNull().default(0),
  creditsUsed: integer('credits_used').notNull().default(0),
  stripeMeterEventId: text('stripe_meter_event_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Type inference
export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ChatMessage = typeof chatMessages.$inferSelect
export type UsageEvent = typeof usageEvents.$inferSelect
