# VibeStack: Capability Compositor Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Transform VibeStack from a monolithic code generator into a capability compositor that assembles production web applications from self-contained capability contracts, styled by an LLM-driven design layer, with additive post-generation evolution.

**Architecture:** Two-layer system — TypeScript capability contracts drive deterministic assembly (schema, routing, hooks), while SKILL.md design knowledge guides an LLM polish agent for unique visual output. New capabilities inject additively into existing deployed apps without regeneration.

**Tech Stack:** Mastra 1.4+ (agents + workspace), Daytona (sandbox), Supabase (DB/auth), Vite + React + TanStack Router (generated apps), XState (pipeline orchestration)

---

## 1. What VibeStack IS

VibeStack is a **capability compositor** — it assembles production web applications from a curated catalog of self-contained capabilities, styled by an LLM-driven design layer, deployed to real infrastructure.

It is NOT a code generator that produces monolithic apps from scratch each time.

### Value Proposition (all three required)

1. **Speed**: Prompt to live deployed app in under 5 minutes
2. **Production quality**: RLS, responsive, error handling, auth, build-verified, Lighthouse 90+
3. **Post-generation evolution**: Add capabilities to existing apps via natural language

### Competitive Position

| Feature | Claude/ChatGPT | Bolt/Lovable | WordPress | VibeStack |
|---------|---------------|-------------|-----------|-----------|
| AI generation | Yes | Yes | No | Yes |
| Deployed app | No | Yes | Manual | Yes |
| Production quality | No | Partial | Plugin-dependent | Yes |
| Post-gen evolution | No | No | Yes (plugins) | Yes |
| Managed AI runtime | No | No | No | Yes |

---

## 2. The Atomic Unit: Capability Contract

A capability is a self-contained feature declared as a TypeScript contract:

```typescript
interface Capability {
  name: string                          // e.g., 'ecommerce'
  version: number                       // contract version
  description: string                   // human-readable

  // What it needs
  schema: TableDef[]                    // database tables
  pages: PageDef[]                      // routes it creates
  components: ComponentDef[]            // shared UI components
  dependencies: {
    npm: Record<string, string>         // npm packages
    capabilities: string[]              // other capabilities required
  }

  // How it integrates
  navEntries: NavEntry[]                // navigation items
  designHints: DesignHints              // visual presentation hints

  // Where intelligence lives
  runtime?: RuntimeConfig               // VibeStack Cloud backend (optional)
}
```

### Examples

**Simple capability (fully generated, no runtime):**
```typescript
const recipes: Capability = {
  name: 'recipes',
  schema: [
    { table: 'recipes', columns: [/* title, description, image_url, cook_time, servings */] },
    { table: 'ingredients', columns: [/* name, quantity, unit */] },
    { table: 'recipe_ingredients', columns: [/* recipe_id, ingredient_id, amount */] },
  ],
  pages: [
    { path: '/{plural}', type: 'public-list' },
    { path: '/{plural}/$id', type: 'public-detail' },
  ],
  dependencies: { npm: {}, capabilities: [] },
  navEntries: [{ label: '{Plural}', path: '/{plural}', position: 'main' }],
  designHints: { cardStyle: 'media-heavy', heroType: 'featured-item' },
}
```

**Complex capability (needs managed runtime):**
```typescript
const aiChatbot: Capability = {
  name: 'ai-chatbot',
  schema: [
    { table: 'chat_sessions', columns: [/* user_id, created_at */] },
    { table: 'chat_messages', columns: [/* session_id, role, content, created_at */] },
  ],
  pages: [
    { path: '/chat', type: 'interactive', component: 'ChatWidget' },
  ],
  components: [
    { name: 'ChatWidget', type: 'floating' },  // floating chat bubble
  ],
  dependencies: {
    npm: { '@vibestack/sdk': '^1.0.0' },
    capabilities: ['auth'],
  },
  runtime: {
    type: 'managed',
    service: 'mastra-agent',
    config: { model: 'gpt-4o-mini', ragEnabled: true },
  },
  navEntries: [],  // floating widget, no nav entry
  designHints: { position: 'bottom-right', style: 'glass' },
}
```

---

## 3. Two-Layer System

### Layer 1: Capability Contracts (TypeScript) → Assembler

The assembler is deterministic code that:
1. Resolves the dependency graph between selected capabilities
2. Merges schemas into a single SchemaContract
3. Generates SQL migrations, TypeScript types, TanStack Query hooks
4. Creates the file-based routing structure
5. Wires navigation from all capabilities' navEntries
6. Generates `package.json` from merged npm dependencies

**The assembler never calls an LLM.** It produces a working but visually generic scaffold.

### Layer 2: Design Skills (SKILL.md) → LLM Polish Agent

The polish agent is a Mastra agent with a Workspace (Daytona sandbox) that:
1. Reads the scaffold files
2. Reads the relevant design skills (theme SKILL.md + design pattern skills)
3. Rewrites public-facing pages with unique, creative JSX
4. Customizes the design system (CSS variables, animations, custom utilities)
5. Creates new shared components (Hero, Card variants, Navigation, Footer)
6. Runs `tsc + vite build` to validate, self-repairs up to 3 times

**The polish agent is the only LLM call in the generation pipeline** (besides the analyst that interprets the user's prompt).

### What Each Layer Can/Cannot Touch

| File Category | Assembler | Polish Agent |
|--------------|-----------|-------------|
| SQL migrations | Generates | Cannot touch |
| TypeScript types | Generates | Cannot touch |
| TanStack Query hooks | Generates | Cannot touch |
| Supabase client config | Generates | Cannot touch |
| Auth plumbing | Generates | Cannot touch |
| Route exports (createFileRoute) | Generates | Cannot change export |
| Page JSX (public pages) | Generates scaffold | **Rewrites creatively** |
| `src/index.css` (design system) | Generates from tokens | **Can extend/customize** |
| `src/components/*.tsx` (shared UI) | None | **Can create new ones** |
| Private CRUD pages | Generates | Cannot touch |
| `package.json`, `vite.config.ts` | Generates | Cannot touch |

---

## 4. Generation Pipeline

### Initial Generation

```
User: "recipe website with blog"
  ↓
ANALYST (LLM call #1):
  - Interprets prompt
  - Selects capabilities: [recipes, blog, public-website, auth]
  - Extracts app name, description
  ↓
ASSEMBLER (deterministic):
  - Resolves deps: public-website requires auth ✓
  - Merges schemas: recipes + blog + auth tables
  - Generates: SQL, types, hooks, routing, nav, package.json
  - Produces: AppBlueprint (complete file tree)
  ↓
PROVISION (parallel, deterministic):
  - Daytona sandbox
  - Supabase project (from warm pool)
  - GitHub repo
  ↓
SCAFFOLD (deterministic):
  - Upload all blueprint files to sandbox
  - Run migrations on Supabase
  - Install dependencies
  ↓
POLISH (LLM call #2):
  - Mastra agent with Workspace (sandbox filesystem + command execution)
  - Reads scaffold pages + design skills
  - Rewrites public pages with creative, unique UI
  - Validates with tsc + vite build
  ↓
VALIDATE (deterministic):
  - tsc --noEmit
  - vite build
  - (repair loop if needed, max 3 attempts)
  ↓
DEPLOY (deterministic):
  - Push to GitHub
  - Deploy to Vercel
  - Return live URL
```

### Additive Evolution

```
User: "add e-commerce to my recipe app"
  ↓
ANALYST (LLM call #1):
  - Reads existing app's capability manifest
  - Identifies new capability: [ecommerce]
  - Checks compatibility: ecommerce requires auth ✓ (already present)
  ↓
INJECT (deterministic):
  - Generate new tables (products, orders, cart_items)
  - Generate new pages (/shop, /cart, /checkout)
  - Generate new hooks (useProducts, useCart, useCheckout)
  - Add nav entries to existing navigation
  - Merge new npm deps into package.json
  - Run additive SQL migration on existing Supabase
  ↓
POLISH (LLM call #2):
  - Reads existing app's design system (index.css)
  - Styles new pages to match existing aesthetic
  - Does NOT touch existing pages
  ↓
VALIDATE + DEPLOY
```

---

## 5. XState Machine Changes

New states in the pipeline machine:

```
Current: idle → preparing → blueprinting → generating → validating → reviewing → deploying
New:     idle → preparing → blueprinting → generating → polishing → validating → reviewing → deploying
```

New context field:
```typescript
interface MachineContext {
  // ... existing fields ...
  polishTokens: number           // tokens used by polish agent
  capabilityManifest: string[]   // list of active capability names
}
```

New actor:
```typescript
runPolishActor: fromPromise(async ({ input }) => {
  const { runPolish } = await import('./orchestrator')
  return runPolish(input)  // sandboxId, blueprint, tokens, designSkills
})
```

---

## 6. Capability Catalog (Initial)

### Core Capabilities (ship first)

| Capability | Schema | Pages | Runtime | Priority |
|-----------|--------|-------|---------|----------|
| `auth` | users, profiles | /auth/login, /auth/signup | No | P0 |
| `public-website` | (none) | /, /about, /contact | No | P0 |
| `blog` | posts, categories, tags | /blog, /blog/$slug | No | P0 |
| `recipes` | recipes, ingredients, recipe_ingredients, tags | /recipes, /recipes/$id | No | P1 |
| `ecommerce` | products, categories, orders, cart_items | /shop, /cart, /checkout | Stripe | P1 |
| `portfolio` | projects, skills, testimonials | /work, /work/$id | No | P1 |
| `dashboard` | (uses other capabilities' data) | /dashboard | No | P1 |
| `booking` | services, bookings, availability | /book, /bookings | No | P2 |
| `ai-chatbot` | chat_sessions, chat_messages | (floating widget) | Mastra | P2 |
| `analytics` | events, page_views | /analytics | VibeStack API | P2 |
| `newsletter` | subscribers, campaigns | (form component) | No | P2 |
| `gallery` | images, albums | /gallery, /gallery/$id | No | P2 |
| `forum` | threads, replies, categories | /community | No | P3 |
| `crm` | contacts, deals, activities | /crm | No | P3 |
| `inventory` | items, locations, transactions | /inventory | No | P3 |

### Feature Composition Matrix

Common app types and their capability sets:

| App Type | Capabilities |
|---------|-------------|
| Recipe website | auth, public-website, recipes |
| Blog | auth, public-website, blog |
| Portfolio | auth, public-website, portfolio |
| E-commerce store | auth, public-website, ecommerce |
| Restaurant site | auth, public-website, recipes, booking, gallery |
| SaaS dashboard | auth, dashboard, analytics |
| Community forum | auth, public-website, forum |
| Freelancer site | auth, public-website, portfolio, booking, blog |

---

## 7. Runtime Model (Hybrid)

### Simple capabilities: fully generated, zero VibeStack dependency
- All CRUD logic lives in the generated app (Supabase queries)
- Auth uses Supabase Auth directly
- No `@vibestack/sdk` needed
- App runs independently forever

### Complex capabilities: generated frontend + managed backend
- Frontend components generated in the app
- Backend logic runs on VibeStack Cloud
- Uses `@vibestack/sdk` for API calls
- Per-use billing (e.g., chatbot messages, AI queries)

### Managed Services (VibeStack Cloud)

| Service | Use Case | Billing |
|---------|----------|---------|
| Mastra Agent | AI chatbot, content generation | Per message |
| RAG Pipeline | Document Q&A, knowledge base | Per query |
| Webhook Relay | Stripe events, email events | Per event |
| Analytics Ingest | Page views, custom events | Per 1K events |

---

## 8. File Structure for Capabilities

Each capability lives in its own directory:

```
server/lib/capabilities/
  index.ts                    # Registry: loadCapability(), listCapabilities()
  types.ts                    # Capability, PageDef, ComponentDef interfaces
  assembler.ts                # Dependency resolution, schema merge, blueprint generation

  catalog/
    auth/
      contract.ts             # Capability contract
      components/             # Component templates (login form, signup form)
    public-website/
      contract.ts
      components/             # Hero, Nav, Footer templates
    blog/
      contract.ts
      components/             # PostCard, PostList, PostDetail templates
    ecommerce/
      contract.ts
      components/             # ProductCard, Cart, Checkout templates
    recipes/
      contract.ts
      components/             # RecipeCard, RecipeDetail templates
    ai-chatbot/
      contract.ts
      components/             # ChatWidget, ChatBubble templates
      runtime.ts              # Mastra agent configuration
```

Design skills remain in existing location:
```
server/lib/skills/catalog/
  restaurant-food/SKILL.md    # Visual knowledge for food apps
  portfolio-creative/SKILL.md # Visual knowledge for portfolios
  saas-dashboard/SKILL.md     # Visual knowledge for dashboards
  ...
```

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Polish agent produces broken code | Validation gate with 3 repair attempts. Fallback: serve scaffold without polish. |
| Capability conflicts (two capabilities want same route) | Assembler detects conflicts at contract resolution time, before any code generation. |
| Additive injection breaks existing pages | Injection only adds files/tables. Existing files are never modified. Nav is regenerated from manifest. |
| LLM cost unpredictable | Polish agent has token budget. If exceeded, serve scaffold. Monitor per-app cost. |
| Capability catalog too small initially | Start with 5 core capabilities (P0+P1). Each covers the most common app types. Expand based on user demand. |
| Design skills don't match capabilities | Each capability has designHints that guide the LLM. Skills provide the visual language, hints provide the structural guidance. |

---

## 10. Migration Path from Current Architecture

### What stays
- SchemaContract format (capabilities declare their schema using TableDef)
- contract-to-sql, contract-to-types, contract-to-hooks (assembler reuses these)
- Daytona sandbox lifecycle
- Supabase provisioning (warm pool)
- XState pipeline machine (add polishing state)
- GitHub push + Vercel deploy
- Design SKILL.md files

### What changes
- `themed-code-engine.ts` → replaced by assembler + polish agent
- `app-blueprint.ts` → refactored to use capability contracts
- `design-agent.ts` → evolves into polish agent with Workspace
- Theme archetypes → replaced by LLM creative output
- Hardcoded page generators → replaced by capability component templates + LLM polish

### What's new
- Capability contract type system (`types.ts`)
- Capability catalog (`catalog/`)
- Assembler (`assembler.ts`) — dependency resolution, schema merge
- Polish agent with Mastra Workspace
- Additive injection pipeline (for evolution)
- `@vibestack/sdk` (for managed runtime capabilities)
- Capability manifest stored per-project (tracks what's installed)
