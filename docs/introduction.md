# VibeStack Platform

AI-powered app builder — users describe an app in natural language and get a full Vite + React project with live preview, deployed to production in minutes.

## What is VibeStack?

VibeStack lets users describe an application in natural language. A single AI orchestrator agent generates a complete, working Vite + React application with:

- Full source code (React 19, Tailwind v4, shadcn/ui)
- Live preview in a Daytona sandbox
- One-click deployment to Vercel
- Git repository with commit history
- Credit-based billing via Stripe

## Architecture Overview

The platform consists of:

- **Client**: Vite 7 SPA with React 19, TanStack Router, and Tailwind CSS v4
- **Server**: Hono API framework with 13 endpoints + interactive API reference
- **AI Agent**: Single Mastra orchestrator with 11 tools + provider-native web search
- **Database**: Drizzle ORM on Supabase PostgreSQL (Auth + Realtime subscriptions)
- **Sandbox**: Daytona SDK for isolated ephemeral build environments
- **Code Editing**: Relace Instant Apply for efficient file modifications
- **Payments**: Stripe checkout + webhooks for credit-based billing
- **Deployment**: Vercel (app hosting) + GitHub App (repo creation)
- **Observability**: Sentry (errors + performance + structured logs + cron monitoring), Langfuse (LLM traces) — all optional

### Model Routing

Users select their LLM provider per generation:

| Model | Provider |
|-------|----------|
| GPT-5.2 Codex | OpenAI |
| Claude Opus 4.6 | Anthropic |
| Claude Sonnet 4.6 | Anthropic |

Adding a new model requires one entry in `MODEL_CONFIGS`. Adding a new provider requires one `PROVIDER_REGISTRY` entry + `bun add @ai-sdk/<provider>`.

## Quick Links

- [Architecture](/backend/architecture) — System overview and request lifecycle
- [AI Agent](/backend/agents) — Orchestrator, tools, memory, and model routing
- [API Routes](/backend/api-routes) — All 13 endpoints with request/response schemas
- [Data Model](/backend/data-model) — Database schema and relationships
- [Infrastructure](/backend/infrastructure) — Sandbox, GitHub, Stripe, rate limiting
- [Mastra Studio](/backend/mastra-studio) — Agent dev UI and tool playground
- [API Reference](/references/api-reference) — Interactive Scalar API docs (also available at `/api/reference` when running locally)
