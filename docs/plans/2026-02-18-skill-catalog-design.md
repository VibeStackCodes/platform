# VibeStack Skill Catalog — Design Document

**Date:** 2026-02-18
**Status:** Approved

---

## Problem

VibeStack generates apps from user prompts, but capability selection is brittle:

- Layout skills (CardGrid, MagazineGrid, etc.) are selected by keyword rules — "dish" → MenuGrid
- Features like authentication, Stripe, and file uploads are hardcoded into every app
- Adding a new capability requires modifying the rule engine (if/else chains, keyword arrays)
- The user's actual intent ("I want a subscription SaaS with a magazine-style blog") is largely ignored

## Goal

The LLM reads a skill catalog and selects which capabilities to include in the generated app based on the user's prompt — no keyword rules, no hardcoded features. Adding a new capability = add one SKILL.md + one index.ts file. Zero changes to the orchestrator.

---

## Approach: Skill Catalog (agentskills.io open standard)

**Key insight:** Claude Code skills follow the [agentskills.io](https://agentskills.io/) open standard — a `SKILL.md` file with YAML frontmatter describing *when to use* the skill and markdown describing *what it does*. Skills.sh lists 18 agents that share this format, including Claude Code itself.

VibeStack's generation skills adopt the same format. The LLM already understands this format because it's what its own skills are written in.

```
Claude Code skills:    user prompt → Claude reads SKILL.md → invokes as command
VibeStack gen skills:  user prompt → analystAgent reads catalog → selects for generated app
```

Skills are self-describing capabilities — each skill knows what schema changes it makes, what routes it adds, what pages it generates, and what it requires from other skills.

---

## Skill File Structure

```
server/lib/skills/catalog/
  authentication/
    SKILL.md         ← LLM reads this (YAML frontmatter + markdown body)
    index.ts         ← Orchestrator executes this (applyToSchema, generateRoutes, etc.)
  stripe-payments/
    SKILL.md
    index.ts
  blog-cms/
    SKILL.md
    index.ts
  file-uploads/
    SKILL.md
    index.ts
  analytics-dashboard/
    SKILL.md
    index.ts
  magazine-layout/
    SKILL.md
    index.ts         ← existing UI skills migrate here
  kanban-board/
    SKILL.md
    index.ts
  card-grid/
    SKILL.md
    index.ts
  transaction-feed/
    SKILL.md
    index.ts
  ... (all existing list/detail skills)
```

---

## SKILL.md Format

Standard agentskills.io frontmatter + VibeStack-specific extension fields (`requires`, `provides`, `schema-contributions`, `env-vars`):

```yaml
---
name: authentication
description: >
  Adds user accounts, login/signup flows, and protected routes.
  Use when app mentions: users, accounts, members, login, passwords,
  profiles, or when any data should be user-owned.
requires: []
provides: [auth-routes, rls-policies, auth-schema]
schema-contributions:
  - Adds user_id uuid references auth.users on user-owned tables
  - Adds RLS policy auth.uid() = user_id for all CRUD operations
env-vars: []
---

## What this skill adds

### Database
- `user_id uuid references auth.users` on all user-owned tables
- RLS policies: `auth.uid() = user_id` for SELECT / INSERT / UPDATE / DELETE

### Routes
- `/auth/login` — Sign-in page
- `/auth/signup` — Sign-up page
- `_authenticated/route.tsx` — Protected route wrapper

### Notes
Foundational skill. Most apps with personal data need it.
stripe-payments requires this skill.
```

```yaml
---
name: stripe-payments
description: >
  Adds Stripe checkout, subscription plans, and billing management.
  Use when app mentions: payment, billing, subscribe, premium,
  pricing, checkout, plans, credits, purchase.
requires: [authentication]
provides: [checkout-route, webhook-route, billing-ui, payments-schema]
schema-contributions:
  - Adds stripe_customer_id text to profiles/users table
  - Adds subscriptions(id, user_id, plan, status, stripe_subscription_id, ...) table
  - Adds payments(id, user_id, amount_cents, currency, status, ...) table
env-vars:
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - VITE_STRIPE_PUBLISHABLE_KEY
---
```

The `description` field is what gets injected into the analyst's prompt as the catalog entry. The markdown body is implementation documentation that the TypeScript skill reads.

---

## Pipeline Change

```
Before:
  analyst(LLM) → SchemaContract
                      ↓
               keyword classifier (if/else on entity names + columns)
                      ↓
               assembler → pages (only UI skills, features hardcoded)

After:
  orchestrator: load catalog → build description string from all SKILL.md frontmatter
                      ↓
  analystAgent(LLM) reads: user prompt + skill catalog descriptions
  analystAgent outputs: SchemaContract + SkillSelection
                      ↓
  orchestrator: resolve dependency order (auth before stripe)
  orchestrator: call skill.applyToSchema(contract) for each selected skill
  → enriched SchemaContract (stripe tables, user_id FKs, etc. added)
                      ↓
  blueprint + assembler (deterministic)
  renders: selected skills' SQL + routes + pages + env var requirements
                      ↓
  validation → deploy
```

### SkillSelection Type

```typescript
interface SkillSelection {
  selectedSkills: string[]                          // ['authentication', 'blog-cms', 'magazine-layout']
  entityLayouts: Record<string, EntityLayout>       // LLM-chosen layout per entity
  skillConfigs?: Record<string, Record<string, unknown>> // optional per-skill config
}
```

This is added to the `submitRequirements` tool output alongside `SchemaContract`.

---

## TypeScript Skill Interface

Each skill's `index.ts` exports a `skill` object implementing this interface:

```typescript
interface VibeStackSkill {
  name: string

  // Modifies SchemaContract: adds tables, columns, RLS policies
  applyToSchema(contract: SchemaContract, config?: unknown): SchemaContract

  // Additional SQL not covered by contract-to-sql (e.g., stored procedures)
  generateSQL?(contract: SchemaContract, config?: unknown): string

  // File path → component code map for new routes/pages
  generateRoutes?(contract: SchemaContract, config?: unknown): Record<string, string>

  // Environment variable names this skill requires
  envVars: string[]
}
```

Example: `authentication/index.ts`
```typescript
export const skill: VibeStackSkill = {
  name: 'authentication',
  envVars: [],

  applyToSchema(contract) {
    // Add user_id FK to all tables that don't have it
    // Add RLS policies
    return enrichedContract
  },

  generateRoutes(contract) {
    return {
      'src/routes/auth/login.tsx': loginPageCode,
      'src/routes/auth/signup.tsx': signupPageCode,
      'src/routes/_authenticated/route.tsx': authGuardCode,
    }
  },
}
```

---

## Catalog Loading

At generation time, the orchestrator loads all `SKILL.md` frontmatter and builds a catalog string to inject into the analyst's instructions:

```typescript
// server/lib/skills/catalog-loader.ts
export async function buildSkillCatalog(): Promise<string> {
  // Read all SKILL.md files in catalog/*/SKILL.md
  // Extract name + description from frontmatter
  // Return formatted string for LLM injection
  return `Available skills:\n- authentication: Adds user accounts...\n- stripe-payments: ...`
}
```

The analyst instructions template includes a `{{SKILL_CATALOG}}` placeholder that gets replaced at request time. This means new skills appear automatically — no code changes needed.

---

## Initial Skill Set (Phase 1)

### Infrastructure skills
| Skill | Description |
|-------|-------------|
| `authentication` | Supabase Auth, login/signup, protected routes, RLS |
| `stripe-payments` | Checkout, subscriptions, billing, webhook handler |
| `file-uploads` | Supabase Storage, drag-drop upload, preview |

### Layout skills (migrated from Design Engine v2)
| Skill | Description |
|-------|-------------|
| `magazine-layout` | Editorial grid, featured hero, article-style list |
| `card-grid` | Image-first responsive card grid |
| `menu-grid` | Two-column food/product menu with prices |
| `transaction-feed` | Finance feed with amounts, running total |
| `kanban-board` | Drag-drop column swimlanes (Phase 2) |
| `author-profiles` | Avatar cards with bios |

### Enhancement skills
| Skill | Description |
|-------|-------------|
| `analytics-dashboard` | KPI cards, Recharts bar/line charts (Phase 2) |
| `blog-cms` | Rich text editor, publishing workflow (Phase 2) |

---

## Extensibility

Adding a new skill:
1. `mkdir server/lib/skills/catalog/realtime-chat`
2. Write `SKILL.md` with description covering "chat", "messaging", "real-time"
3. Write `index.ts` implementing `applyToSchema` (adds `messages` table) + `generateRoutes` (adds `/chat` page)
4. **Zero other changes.** The catalog loader picks it up. The analyst reads it. The orchestrator executes it.

Eventually: publish to `skills.sh` — the SKILL.md format is already compatible with the agentskills.io open standard.

---

## Backward Compatibility

- Existing skill TypeScript files (`skills/list.ts`, `skills/detail.ts`) are migrated to catalog entries
- The keyword classifier (`skill-classifier.ts`) is replaced by `entityLayouts` from the analyst's structured output
- Authentication and the existing blueprint generator are wrapped as skills — behavior unchanged, now opt-in
- Fallback: if analyst returns no `entityLayouts` for an entity, keyword classifier runs as last resort

---

## Success Criteria

1. User says "build a subscription blog" → analyst selects `authentication` + `stripe-payments` + `magazine-layout` — no keyword arrays
2. User says "I want a restaurant menu app" → analyst selects `menu-grid` — entity named `items` no longer misclassifies
3. Adding `realtime-chat` skill requires zero changes to orchestrator/analyst/assembler
4. `tsc --noEmit` passes
5. All existing tests pass
6. New tests cover: `buildSkillCatalog()`, `applyToSchema()` for auth and stripe, skill dependency ordering
