// server/lib/db/relations.ts
import { relations } from 'drizzle-orm'
import { profiles, projects, usageEvents } from './schema'

export const profilesRelations = relations(profiles, ({ many }) => ({
  projects: many(projects),
  usageEvents: many(usageEvents),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(profiles, { fields: [projects.userId], references: [profiles.id] }),
  usageEvents: many(usageEvents),
}))

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(profiles, { fields: [usageEvents.userId], references: [profiles.id] }),
  project: one(projects, { fields: [usageEvents.projectId], references: [projects.id] }),
}))
