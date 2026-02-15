// server/lib/db/relations.ts
import { relations } from 'drizzle-orm'
import { profiles, projects, chatMessages, usageEvents } from './schema'

export const profilesRelations = relations(profiles, ({ many }) => ({
  projects: many(projects),
  usageEvents: many(usageEvents),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(profiles, { fields: [projects.userId], references: [profiles.id] }),
  chatMessages: many(chatMessages),
  usageEvents: many(usageEvents),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  project: one(projects, { fields: [chatMessages.projectId], references: [projects.id] }),
}))

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(profiles, { fields: [usageEvents.userId], references: [profiles.id] }),
  project: one(projects, { fields: [usageEvents.projectId], references: [projects.id] }),
}))
