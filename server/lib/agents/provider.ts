/**
 * Helicone-proxied OpenAI provider factory
 *
 * ALL OpenAI calls (LLM + embeddings) route through Helicone for full
 * observability: per-user, per-project, per-session, per-agent cost tracking.
 * Falls back to direct OpenAI if HELICONE_API_KEY is not set.
 *
 * Helicone headers used:
 *   Helicone-Auth            — API key authentication
 *   Helicone-User-Id         — Per-user cost tracking (Supabase auth UUID)
 *   Helicone-Session-Id      — Groups all LLM calls in one generation session
 *   Helicone-Session-Name    — Human-readable session label
 *   Helicone-Session-Path    — Parent/child trace path (e.g. "supervisor/dba")
 *   Helicone-Property-*      — Custom filterable dimensions in Helicone dashboard
 *
 * @see https://docs.helicone.ai/helicone-headers/header-directory
 */
import { createOpenAI } from '@ai-sdk/openai'
import type { MastraModelConfig } from '@mastra/core/llm'

const HELICONE_GATEWAY = 'https://oai.helicone.ai/v1'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeliconeContext {
  /** Supabase user UUID (required) */
  userId: string
  /** Project UUID — enables per-project cost breakdowns */
  projectId?: string
  /** Session/generation ID — groups all calls in one user interaction */
  sessionId?: string
  /** Agent name — tracks which agent made the call (e.g. "dba", "frontend") */
  agentName?: string
  /** Parent agent for trace hierarchy (e.g. "supervisor") */
  parentAgent?: string
  /** Environment label */
  environment?: string
}

// ---------------------------------------------------------------------------
// Header builders
// ---------------------------------------------------------------------------

/** Build the full set of Helicone headers from context */
export function getHeliconeHeaders(ctx: HeliconeContext | string): Record<string, string> {
  const apiKey = process.env.HELICONE_API_KEY
  if (!apiKey) return {}

  // Legacy: accept a plain userId string
  const context: HeliconeContext = typeof ctx === 'string' ? { userId: ctx } : ctx

  const headers: Record<string, string> = {
    'Helicone-Auth': `Bearer ${apiKey}`,
    'Helicone-User-Id': context.userId,
  }

  // Session tracking — groups all LLM calls in one generation
  if (context.sessionId) {
    headers['Helicone-Session-Id'] = context.sessionId
  }
  if (context.projectId) {
    headers['Helicone-Session-Name'] = `project:${context.projectId}`
  }

  // Trace hierarchy — shows parent→child agent delegation
  if (context.agentName) {
    const path = context.parentAgent
      ? `${context.parentAgent}/${context.agentName}`
      : context.agentName
    headers['Helicone-Session-Path'] = path
  }

  // Custom properties — filterable dimensions in Helicone dashboard
  if (context.projectId) {
    headers['Helicone-Property-ProjectId'] = context.projectId
  }
  if (context.agentName) {
    headers['Helicone-Property-Agent'] = context.agentName
  }
  headers['Helicone-Property-Environment'] =
    context.environment ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')
  headers['Helicone-Property-App'] = 'vibestack'

  return headers
}

/** Helicone gateway URL (or undefined to use direct OpenAI) */
export function getHeliconeBaseURL(): string | undefined {
  return process.env.HELICONE_API_KEY ? HELICONE_GATEWAY : undefined
}

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

/**
 * Creates an OpenAI provider instance routed through Helicone.
 * Accepts either a simple userId string or a full HeliconeContext.
 */
export function createHeliconeProvider(ctx: HeliconeContext | string) {
  const apiKey = process.env.HELICONE_API_KEY

  if (!apiKey) {
    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  const context: HeliconeContext = typeof ctx === 'string' ? { userId: ctx } : ctx

  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: HELICONE_GATEWAY,
    headers: getHeliconeHeaders(context),
  })
}

// ---------------------------------------------------------------------------
// Per-agent model allocation
// ---------------------------------------------------------------------------

/**
 * Role-based model routing — each pipeline stage uses the optimal model.
 *
 * - orchestrator (analyst, PM): gpt-5.2 — best reasoning for requirement extraction
 * - codegen (frontend, backend): gpt-5.2-codex — agentic coding, context compaction
 * - review: gpt-5.1 — configurable reasoning, sufficient for code review
 * - repair: gpt-5.2-codex — agentic coding for targeted error fixes
 * - edit: gpt-5.2-codex — agentic coding for single-file edits
 */
export const PIPELINE_MODELS = {
  orchestrator: 'gpt-5.2',
  codegen: 'gpt-5.2-codex',
  review: 'gpt-5.2',
  repair: 'gpt-5.2-codex',
  edit: 'gpt-5.2-codex',
  seed: 'gpt-5-mini',
  composer: 'gpt-5.2',
  creativeDirector: 'gpt-5.2',
  pageGen: 'gpt-5.2-codex',
} as const

export type PipelineRole = keyof typeof PIPELINE_MODELS

/**
 * Creates a Mastra-compatible model resolver for a specific pipeline role.
 * Reads Helicone context from RequestContext for per-user observability.
 * Falls back to global context (for scripts/tests) or 'studio' context.
 */

// Global context for scripts that run outside Hono request scope
let _globalHeliconeContext: HeliconeContext | null = null

/** Set a global Helicone context for E2E scripts and tests */
export function setGlobalHeliconeContext(ctx: HeliconeContext) {
  _globalHeliconeContext = ctx
}

export function createAgentModelResolver(role: PipelineRole) {
  const modelId = PIPELINE_MODELS[role]
  return function resolveModel({
    requestContext,
  }: {
    requestContext: { has: (key: string) => boolean; get: (key: string) => unknown }
  }): MastraModelConfig {
    if (requestContext?.has('heliconeContext')) {
      const ctx = requestContext.get('heliconeContext') as HeliconeContext
      return createHeliconeProvider({ ...ctx, agentName: role })(modelId)
    }
    // Fallback: global context (E2E scripts) or 'studio' (Mastra Studio)
    const fallbackCtx = _globalHeliconeContext
      ? { ..._globalHeliconeContext, agentName: role }
      : { userId: 'studio' } as HeliconeContext
    return createHeliconeProvider(fallbackCtx)(modelId)
  }
}

// ---------------------------------------------------------------------------
// Model allowlist (client-facing — validates the "tier" the user selects)
// ---------------------------------------------------------------------------

/** Allowed models the client can request */
export const ALLOWED_MODELS = ['gpt-5.2'] as const
export type AllowedModel = (typeof ALLOWED_MODELS)[number]

/** Validate that a model string is allowed */
export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model)
}
