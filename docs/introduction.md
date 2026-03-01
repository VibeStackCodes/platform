# VibeStack Platform

AI-powered app builder — users describe an app, the platform generates a full Vite + React project with live preview.

## What is VibeStack?

VibeStack lets users describe an application in natural language. A single AI orchestrator agent generates a complete, working Vite + React application with:

- Full source code (React 19, Tailwind v4, shadcn/ui)
- Live preview in a Daytona sandbox
- One-click deployment to Vercel
- Git repository with commit history

## Architecture Overview

The platform consists of:

- **Client**: Vite 7 SPA with React 19, TanStack Router, and Tailwind CSS v4
- **Server**: Hono API framework with 13 endpoints
- **AI Agent**: Single Mastra orchestrator with 11 tools (sandbox, file I/O, build, deploy)
- **Database**: Drizzle ORM on Supabase PostgreSQL
- **Sandbox**: Daytona SDK for isolated build environments
- **Payments**: Stripe checkout + webhooks for credit-based billing

## Quick Links

- [Architecture](/backend/architecture) — System overview and request lifecycle
- [AI Agent](/backend/agents) — Orchestrator, tools, memory, and model routing
- [API Routes](/backend/api-routes) — All 13 endpoints with request/response schemas
- [Data Model](/backend/data-model) — Database schema and relationships
- [Infrastructure](/backend/infrastructure) — Sandbox, GitHub, Stripe, rate limiting
- [Mastra Studio](/backend/mastra-studio) — Agent dev UI and tool playground
- [API Reference](/references/api-reference) — Interactive Scalar API docs
