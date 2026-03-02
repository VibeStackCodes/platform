# README Update — Design Document

**Date**: 2026-03-02
**Goal**: Comprehensive README with architecture diagram, service inventory, and step-by-step onboarding for new contributors.

## Audience

Contributors and developers joining the team — need setup instructions, architecture overview, and service accounts to provision.

## README Structure

### 1. Hero
- Project name + one-liner description
- What it does (user describes app → full Vite+React project with live preview)

### 2. Architecture Diagram (Mermaid)
Flow: **Client (Vite SPA)** → **Hono API** → branches to:
- **AI**: OpenAI / Anthropic via Mastra agent framework
- **Sandbox**: Daytona ephemeral environments
- **Database**: Supabase (Auth + PostgreSQL + Realtime)
- **Payments**: Stripe
- **Deploy**: Vercel + GitHub App
- **Code Editing**: Relace Instant Apply

Monitoring layer underneath: Sentry (errors) + Langfuse (LLM traces) + BetterStack Logtail (structured logs)

### 3. Services Inventory
Grouped tables by category. Each row: **Service**, **Purpose**, **Tier**, **Dashboard/Docs link**, **Required env vars**.

Categories:
- AI / LLM (OpenAI, Anthropic, Mastra, Relace)
- Auth & Database (Supabase)
- Sandbox (Daytona)
- Payments (Stripe)
- Deployment (Vercel, GitHub App)
- Observability (Sentry, Langfuse, BetterStack Logtail)
- CI/CD & Testing (GitHub Actions, Chromatic)
- Documentation (Scalar)
- Code Quality (OxLint, Biome — local tools, no accounts needed)

### 4. Getting Started (step-by-step)
1. **Prerequisites**: Bun v1.3+, Node 22+ (for Playwright), Git
2. **Clone + install**: `git clone ... && bun install`
3. **Service accounts to create** (ordered by dependency):
   - Supabase project (Auth + DB) → get URL, anon key, DATABASE_URL
   - OpenAI API key
   - Anthropic API key
   - Daytona account → API key + create snapshot
   - Stripe account → secret key, publishable key, webhook secret
   - GitHub App → create app, get ID, private key, installation ID
   - Vercel account → token, wildcard project ID
   - Relace API key
   - Optional: Langfuse, Sentry, BetterStack Logtail
4. **Fill `.env.local`**: Copy template, fill in values
5. **Run migrations**: `bun run db:migrate`
6. **Start dev server**: `bun run dev`
7. **Verify**: Open localhost:5173, sign in, create a project

### 5. Commands
Table of `bun run *` commands from CLAUDE.md (dev, build, lint, test, etc.)

### 6. Tech Stack
Compact list: Vite 7, React 19, TanStack Router, Tailwind v4, shadcn/ui, Hono, Drizzle ORM, Mastra, TypeScript 5 strict.
Link to CLAUDE.md for full architecture docs.

## Services Catalog (reference for implementation)

### AI / LLM
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| OpenAI | LLM provider (GPT-5.2 Codex) | Paid | `OPENAI_API_KEY` |
| Anthropic | LLM provider (Claude Opus/Sonnet 4.6) | Paid | `ANTHROPIC_API_KEY` |
| Mastra | Agent framework (orchestration, memory, tools) | OSS | — |
| Relace | Instant Apply code editing API | Paid | `RELACE_API_KEY` |

### Auth & Database
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| Supabase | Auth + PostgreSQL + Realtime subscriptions | Free tier | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID` |

### Sandbox
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| Daytona | Ephemeral sandbox environments from Docker snapshots | Paid | `DAYTONA_API_KEY`, `DAYTONA_SNAPSHOT_ID` |

### Payments
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| Stripe | Checkout, subscriptions, webhooks | Free tier | `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |

### Deployment
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| Vercel | Deploys generated apps | Free tier | `VERCEL_TOKEN`, `VERCEL_WILDCARD_PROJECT_ID` |
| GitHub App | Creates repos for generated apps | Free | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_ORG` |

### Observability (all optional)
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| Sentry | Error tracking + performance (client + server + AI) | Free tier | `VITE_SENTRY_DSN`, `SENTRY_DSN` |
| Langfuse | LLM observability (traces, token costs) | Free tier | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASEURL` |
| BetterStack Logtail | Structured log aggregation | Free tier | `LOGTAIL_SOURCE_TOKEN` |

### CI/CD & Testing
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| GitHub Actions | CI/CD automation | Free tier | — |
| Chromatic | Visual regression testing for Storybook | Free tier | `CHROMATIC_PROJECT_TOKEN` (GH secret) |

### Documentation
| Service | Purpose | Tier | Env Vars |
|---------|---------|------|----------|
| Scalar | API reference hosting | Free tier | — (config in `scalar.config.json`) |

### Code Quality (local only, no accounts)
- OxLint: Linter (670+ rules, 50-100x faster than ESLint)
- Biome: Formatter (single quotes, no semicolons, trailing commas)
