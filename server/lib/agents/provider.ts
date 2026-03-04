/**
 * Direct provider factory (OpenAI + Anthropic)
 *
 * All LLM calls go directly to the provider. Observability is handled
 * by Langfuse instrumentation in mastra.ts.
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { MastraModelConfig } from '@mastra/core/llm'

// ---------------------------------------------------------------------------
// Provider Registry — add new providers here
// ---------------------------------------------------------------------------

type ProviderType = 'openai' | 'anthropic'

interface ProviderEntry {
  apiKeyEnv: string
  create: (opts: { apiKey?: string }) => ReturnType<typeof createOpenAI>
}

const PROVIDER_REGISTRY: Record<ProviderType, ProviderEntry> = {
  openai: {
    apiKeyEnv: 'OPENAI_API_KEY',
    create: (opts) => createOpenAI(opts) as ReturnType<typeof createOpenAI>,
  },
  anthropic: {
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    create: (opts) => createAnthropic(opts) as unknown as ReturnType<typeof createOpenAI>,
  },
}

/** Creates a direct provider (no proxy) with API key only */
export function createDirectProvider(providerType: ProviderType) {
  const reg = PROVIDER_REGISTRY[providerType]
  const apiKey = process.env[reg.apiKeyEnv]
  return reg.create({ apiKey })
}

// ---------------------------------------------------------------------------
// Per-agent model allocation
// ---------------------------------------------------------------------------

/**
 * Role-based model routing — all pipeline stages use gpt-5.2-codex.
 */
export const PIPELINE_MODELS = {
  orchestrator: 'gpt-5.2-codex',
  analyst: 'gpt-5.2-codex',
  designer: 'gpt-5.2-codex',
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
 * Reads selectedModel from RequestContext for multi-provider routing.
 */
export function createAgentModelResolver(role: PipelineRole) {
  return function resolveModel({
    requestContext,
  }: {
    requestContext: { has: (key: string) => boolean; get: (key: string) => unknown }
  }): MastraModelConfig {
    const selectedModel = requestContext?.has('selectedModel')
      ? (requestContext.get('selectedModel') as string)
      : 'gpt-5.2-codex'
    const config = MODEL_CONFIGS[selectedModel] ?? MODEL_CONFIGS['gpt-5.2-codex']
    const modelId = config.roleOverrides?.[role] ?? config.modelId
    return createDirectProvider(config.provider)(modelId)
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
