import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * Model ID → AI SDK Provider Resolver
 *
 * Maps user-facing model IDs to AI SDK provider instances.
 * This abstraction makes the entire pipeline model-agnostic —
 * swap providers by adding new entries here.
 */

export type ModelId =
  | 'claude-sonnet-4-5-20250929'
  | 'claude-opus-4-6'
  | 'gpt-5.2'
  | 'gpt-5.1-codex-max'
  | 'gpt-5-mini'
  | 'gpt-5-nano';

type Provider = 'anthropic' | 'openai';

interface ModelInfo {
  id: ModelId;
  name: string;
  provider: Provider;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai' },
  { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', provider: 'openai' },
];

/**
 * Resolve a model ID to an AI SDK provider instance
 */
export function resolveModel(modelId: string): LanguageModel {
  switch (modelId) {
    case 'claude-sonnet-4-5':
    case 'claude-sonnet-4-5-20250929':
      return anthropic('claude-sonnet-4-5-20250929');
    case 'claude-opus-4-6':
      return anthropic('claude-opus-4-6');
    case 'gpt-5.2':
      return openai.chat('gpt-5.2');
    case 'gpt-5.1-codex-max':
      return openai.chat('gpt-5.1-codex-max');
    case 'gpt-5-mini':
      return openai.chat('gpt-5-mini');
    case 'gpt-5-nano':
      return openai.chat('gpt-5-nano');
    default:
      // Fallback: try as an Anthropic model ID
      return anthropic(modelId);
  }
}
