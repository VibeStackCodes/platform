import OpenAI from 'openai';

/**
 * OpenAI SDK Client & Helpers
 *
 * Shared OpenAI client instance and utility functions for the generation pipeline.
 * Uses the Responses API (not Chat Completions) for access to all GPT-5.2 features:
 * - Structured outputs (zodTextFormat)
 * - Parallel function calls
 * - Reasoning effort tuning
 * - Predicted outputs
 * - Streaming
 */

// ============================================================================
// Client Singleton
// ============================================================================

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI();
  }
  return _client;
}

// ============================================================================
// Model Constants
// ============================================================================

/** Model used for planning — needs strong reasoning */
export const PLAN_MODEL = 'gpt-5.2';

/** Model used for file generation — best coding model */
export const CODEGEN_MODEL = 'gpt-5.1-codex-max';

/** Model used for build error fixing — needs reasoning + speed */
export const FIX_MODEL = 'gpt-5.2';

/** Model for lightweight tasks (test gen, error analysis) */
export const FAST_MODEL = 'gpt-5-mini';

// ============================================================================
// Reasoning Effort Presets
// ============================================================================

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export const REASONING_PRESETS = {
  /** Planning: high reasoning for architecture decisions */
  planning: 'high' as ReasoningEffort,
  /** File generation: medium reasoning for code writing */
  codegen: 'medium' as ReasoningEffort,
  /** Build fixing: high reasoning to diagnose errors */
  fixing: 'high' as ReasoningEffort,
  /** Test generation: low reasoning for straightforward tests */
  testgen: 'low' as ReasoningEffort,
  /** Validation/simple extraction: no reasoning needed */
  extraction: 'none' as ReasoningEffort,
};

// ============================================================================
// Provider Detection
// ============================================================================

/**
 * Check if a model ID is an OpenAI model (should use direct SDK)
 */
export function isOpenAIModel(modelId: string): boolean {
  return modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4');
}

/**
 * Check if a model ID is an Anthropic model (should use AI SDK)
 */
export function isAnthropicModel(modelId: string): boolean {
  return modelId.startsWith('claude-');
}

// ============================================================================
// Retry Utilities
// ============================================================================

import { withRetry, type RetryOptions } from './retry';

/**
 * Convenience wrapper for OpenAI API calls with retry logic
 */
export async function withOpenAIRetry<T>(
  fn: () => Promise<T>,
  operation: string,
  options?: Omit<RetryOptions, 'operation'>
): Promise<T> {
  return withRetry(fn, { ...options, operation });
}
