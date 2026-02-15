/**
 * Helicone-proxied OpenAI provider factory
 *
 * ALL OpenAI calls (LLM + embeddings) route through Helicone for observability
 * and per-user cost tracking. Falls back to direct OpenAI if HELICONE_API_KEY is not set.
 */
import { createOpenAI } from '@ai-sdk/openai';

const HELICONE_GATEWAY = 'https://oai.helicone.ai/v1';

/** Shared Helicone headers for a given user (or 'system' for non-user calls) */
export function getHeliconeHeaders(userId: string): Record<string, string> {
  const apiKey = process.env.HELICONE_API_KEY;
  if (!apiKey) return {};
  return {
    'Helicone-Auth': `Bearer ${apiKey}`,
    'Helicone-User-Id': userId,
  };
}

/** Helicone gateway URL (or undefined to use direct OpenAI) */
export function getHeliconeBaseURL(): string | undefined {
  return process.env.HELICONE_API_KEY ? HELICONE_GATEWAY : undefined;
}

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
