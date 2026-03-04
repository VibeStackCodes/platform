# Database — Drizzle ORM + Supabase

Platform database layer. 4 tables, type-safe queries via Drizzle.

## Files
- `schema.ts` — Drizzle schema: profiles, projects, usageEvents, warmSupabaseProjects
- `relations.ts` — profiles→projects (1:many), profiles→usageEvents (1:many)
- `client.ts` — pg Pool (max 1 conn, 30s idle, 5s connect timeout) + `drizzle(pool, { schema, relations })`
- `queries.ts` — ~25 type-safe query functions: project CRUD, credits, Stripe webhooks

## Key Patterns
- `db.query.*` for eager relations (`findFirst` with `with:`)
- `db.select().from().where()` for filtered queries (e.g., `getProject(id, userId)` for ownership)
- `warmSupabaseProjects` table: pre-provisioned instances (status: 'available'|'claimed'|'creating')

## Gotchas
- Pool max 1 connection per serverless instance — prevents connection exhaustion
- Error listener on pool prevents unhandled crash on disconnect
