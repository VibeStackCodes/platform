// server/lib/db/queries.ts

import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from './client'
import { chatMessages, profiles, projects } from './schema'

// ── Project Queries ──────────────────────────────────────────────

/** Get all projects for a user, ordered by created_at desc */
export async function getUserProjects(userId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt))
}

/** Get a single project by ID + user ownership check */
export async function getProject(projectId: string, userId: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .then((rows) => rows[0] ?? null)
}

/** Update project fields by ID, optionally scoped to owner */
export async function updateProject(
  projectId: string,
  fields: Partial<typeof projects.$inferInsert>,
  userId?: string,
) {
  const conditions = userId
    ? and(eq(projects.id, projectId), eq(projects.userId, userId))
    : eq(projects.id, projectId)
  return db
    .update(projects)
    .set({ ...fields, updatedAt: new Date() })
    .where(conditions)
    .returning()
    .then((rows) => rows[0] ?? null)
}

/** Create a new project */
export async function createProject(data: typeof projects.$inferInsert) {
  return db
    .insert(projects)
    .values(data)
    .returning()
    .then((rows) => rows[0])
}

// ── Profile / Credit Queries ──────────────────────────────────────

/** Get user credit info for checking balance */
export async function getUserCredits(userId: string) {
  return db
    .select({
      creditsRemaining: profiles.creditsRemaining,
      creditsMonthly: profiles.creditsMonthly,
      creditsResetAt: profiles.creditsResetAt,
      plan: profiles.plan,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .then((rows) => rows[0] ?? null)
}

/** Get email and stripe_customer_id for checkout */
export async function getProfileForCheckout(userId: string) {
  return db
    .select({
      email: profiles.email,
      stripeCustomerId: profiles.stripeCustomerId,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .then((rows) => rows[0] ?? null)
}

/** Set stripe_customer_id on a profile */
export async function setStripeCustomerId(userId: string, stripeCustomerId: string) {
  return db.update(profiles).set({ stripeCustomerId }).where(eq(profiles.id, userId))
}

/** Update profile plan + credits (checkout.session.completed) */
export async function updateProfilePlan(
  userId: string,
  plan: string,
  creditsMonthly: number,
  creditsRemaining: number,
) {
  return db
    .update(profiles)
    .set({ plan, creditsMonthly, creditsRemaining })
    .where(eq(profiles.id, userId))
}

/** Find profile by Stripe customer ID (for webhooks) */
export async function getProfileByStripeId(stripeCustomerId: string) {
  return db
    .select({
      id: profiles.id,
      creditsMonthly: profiles.creditsMonthly,
    })
    .from(profiles)
    .where(eq(profiles.stripeCustomerId, stripeCustomerId))
    .then((rows) => rows[0] ?? null)
}

/** Update profile fields by Stripe customer ID (for webhooks) */
export async function updateProfileByStripeId(
  stripeCustomerId: string,
  fields: Partial<
    Pick<
      typeof profiles.$inferInsert,
      'plan' | 'creditsMonthly' | 'creditsRemaining' | 'creditsResetAt'
    >
  >,
) {
  return db.update(profiles).set(fields).where(eq(profiles.stripeCustomerId, stripeCustomerId))
}

/** Get stripe_customer_id for Stripe meter reporting */
export async function getStripeCustomerId(userId: string) {
  return db
    .select({ stripeCustomerId: profiles.stripeCustomerId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .then((rows) => rows[0]?.stripeCustomerId ?? null)
}

// ── Chat Message Queries ──────────────────────────────────────────

/** Get all conversation events for a project, ordered by created_at asc */
export async function getProjectMessages(projectId: string) {
  return db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      type: chatMessages.type,
      parts: chatMessages.parts,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.projectId, projectId))
    .orderBy(asc(chatMessages.createdAt))
}

/** Insert a chat message/event for a project. Uses ON CONFLICT DO NOTHING for dedup safety. */
export async function insertChatMessage(
  id: string,
  projectId: string,
  role: string,
  parts: unknown,
  type = 'message',
) {
  return db
    .insert(chatMessages)
    .values({ id, projectId, role, type, parts: Array.isArray(parts) ? parts : [parts] })
    .onConflictDoNothing({ target: chatMessages.id })
    .returning()
    .then((rows) => rows[0] ?? null)
}

// ── Relational Queries (using db.query) ──────────────────────────

/** Get project with its chat messages (relational) */
export async function getProjectWithMessages(projectId: string, userId: string) {
  return db.query.projects.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, projectId), eq(p.userId, userId)),
    with: { chatMessages: true },
  })
}
