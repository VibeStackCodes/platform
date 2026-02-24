/**
 * Helicone-proxied provider factory (OpenAI + Anthropic)
 *
 * ALL LLM calls route through Helicone for full observability: per-user,
 * per-project, per-session, per-agent cost tracking.
 * Falls back to direct provider if HELICONE_API_KEY is not set.
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
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { MastraModelConfig } from '@mastra/core/llm'

// ---------------------------------------------------------------------------
// Provider Registry — add new providers here
// ---------------------------------------------------------------------------

type ProviderType = 'openai' | 'anthropic'

interface ProviderEntry {
  heliconeGateway: string
  apiKeyEnv: string
  create: (opts: {
    baseURL?: string
    apiKey?: string
    headers?: Record<string, string>
  }) => ReturnType<typeof createOpenAI>
}

const PROVIDER_REGISTRY: Record<ProviderType, ProviderEntry> = {
  openai: {
    heliconeGateway: 'https://oai.helicone.ai/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    create: (opts) => createOpenAI(opts) as ReturnType<typeof createOpenAI>,
  },
  anthropic: {
    heliconeGateway: 'https://anthropic.helicone.ai/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    create: (opts) => createAnthropic(opts) as unknown as ReturnType<typeof createOpenAI>,
  },
}

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

/** Helicone gateway URL for OpenAI (or undefined to use direct OpenAI) */
export function getHeliconeBaseURL(): string | undefined {
  return process.env.HELICONE_API_KEY ? PROVIDER_REGISTRY.openai.heliconeGateway : undefined
}

// ---------------------------------------------------------------------------
// Provider factories
// ---------------------------------------------------------------------------

/**
 * Creates a provider instance routed through Helicone.
 * Accepts either a simple userId string or a full HeliconeContext.
 * Defaults to OpenAI; pass providerType to use Anthropic.
 */
export function createHeliconeProvider(
  ctx: HeliconeContext | string,
  providerType: ProviderType = 'openai',
) {
  const reg = PROVIDER_REGISTRY[providerType]
  const apiKey = process.env[reg.apiKeyEnv]

  if (!process.env.HELICONE_API_KEY) {
    return reg.create({ apiKey })
  }

  const context: HeliconeContext = typeof ctx === 'string' ? { userId: ctx } : ctx
  return reg.create({
    apiKey,
    baseURL: reg.heliconeGateway,
    headers: getHeliconeHeaders(context),
  })
}

// ---------------------------------------------------------------------------
// Per-agent model allocation
// ---------------------------------------------------------------------------

/**
 * Role-based model routing — all pipeline stages use gpt-5.2-codex.
 */
export const PIPELINE_MODELS = {
  orchestrator: 'gpt-5.2-codex',
  codegen: 'gpt-5.2-codex',
  review: 'gpt-5.2-codex',
  repair: 'gpt-5.2-codex',
  edit: 'gpt-5.2-codex',
  seed: 'gpt-5.2-codex',
  composer: 'gpt-5.2-codex',
  creativeDirector: 'gpt-5.2',
  pageGen: 'gpt-5.2-codex',
} as const

export type PipelineRole = keyof typeof PIPELINE_MODELS

// ---------------------------------------------------------------------------
// Model Configs — maps user-facing model IDs to provider + role overrides
// ---------------------------------------------------------------------------

export type { ProviderType }

export interface ModelConfig {
  provider: ProviderType
  modelId: string
  roleOverrides?: Partial<Record<PipelineRole, string>>
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt-5.2-codex': {
    provider: 'openai',
    modelId: 'gpt-5.2-codex',
    roleOverrides: { creativeDirector: 'gpt-5.2' },
  },
  'claude-opus-4-6': {
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
  },
}

/**
 * Creates a Mastra-compatible model resolver for a specific pipeline role.
 * Reads Helicone context and selectedModel from RequestContext for per-user observability.
 * Falls back to global context (for scripts/tests) or 'studio' context.
 */

// Global context for scripts that run outside Hono request scope
let _globalHeliconeContext: HeliconeContext | null = null

/** Set a global Helicone context for E2E scripts and tests */
export function setGlobalHeliconeContext(ctx: HeliconeContext) {
  _globalHeliconeContext = ctx
}

export function createAgentModelResolver(role: PipelineRole) {
  return function resolveModel({
    requestContext,
  }: {
    requestContext: { has: (key: string) => boolean; get: (key: string) => unknown }
  }): MastraModelConfig {
    // Determine model config from user selection or default
    const selectedModel = requestContext?.has('selectedModel')
      ? (requestContext.get('selectedModel') as string)
      : 'gpt-5.2-codex'
    const config = MODEL_CONFIGS[selectedModel] ?? MODEL_CONFIGS['gpt-5.2-codex']
    const modelId = config.roleOverrides?.[role] ?? config.modelId

    if (requestContext?.has('heliconeContext')) {
      const ctx = requestContext.get('heliconeContext') as HeliconeContext
      return createHeliconeProvider({ ...ctx, agentName: role }, config.provider)(modelId)
    }
    // Fallback: global context (E2E scripts) or 'studio' (Mastra Studio)
    const fallbackCtx = _globalHeliconeContext
      ? { ..._globalHeliconeContext, agentName: role }
      : ({ userId: 'studio' } as HeliconeContext)
    return createHeliconeProvider(fallbackCtx, config.provider)(modelId)
  }
}

// ---------------------------------------------------------------------------
// Model allowlist (client-facing — validates the "tier" the user selects)
// ---------------------------------------------------------------------------

/** Allowed models the client can request — derived from MODEL_CONFIGS */
export const ALLOWED_MODELS = Object.keys(MODEL_CONFIGS)
export type AllowedModel = string

/** Validate that a model string is allowed */
export function isAllowedModel(model: string): model is AllowedModel {
  return model in MODEL_CONFIGS
}
