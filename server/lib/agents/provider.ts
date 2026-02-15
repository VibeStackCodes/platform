/**
 * Helicone-proxied OpenAI provider factory
 *
 * All LLM calls route through Helicone for observability and per-user tracking.
 * Falls back to direct OpenAI if HELICONE_API_KEY is not set (local dev).
 */
import { createOpenAI } from '@ai-sdk/openai';

const HELICONE_GATEWAY = 'https://oai.helicone.ai/v1';

/**
 * Creates an OpenAI provider instance routed through Helicone.
 * Each request is tagged with the user ID for per-user cost tracking.
 */
export function createHeliconeProvider(userId: string) {
  const apiKey = process.env.HELICONE_API_KEY;

  if (!apiKey) {
    // Fall back to direct OpenAI (local dev without Helicone)
    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: HELICONE_GATEWAY,
    headers: {
      'Helicone-Auth': `Bearer ${apiKey}`,
      'Helicone-User-Id': userId,
    },
  });
}

/** Allowed models — only gpt-5.2 is enabled for now */
export const ALLOWED_MODELS = ['gpt-5.2'] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/** Validate that a model string is allowed */
export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}
