/**
 * Retry Utility with Exponential Backoff
 *
 * Wraps async operations with automatic retry logic for rate limits
 * and transient failures. Based on OpenAI Cookbook best practices.
 *
 * Features:
 * - Exponential backoff with jitter
 * - Handles 429 (rate limit) and 5xx (server) errors
 * - Respects Retry-After headers
 * - Configurable max retries and base delay
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms before first retry (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in ms (default: 60000) */
  maxDelay?: number;
  /** Operation name for logging */
  operation?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 60000,
  operation: 'API call',
};

/**
 * Check if an error is retryable (rate limit or server error)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // OpenAI SDK wraps HTTP errors with status codes
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
      return true;
    }
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return true;
    }
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) {
      return true;
    }
  }
  // Check for OpenAI APIError shape
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 429 || status >= 500;
  }
  return false;
}

/**
 * Extract Retry-After header value from error if available
 */
function getRetryAfterMs(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'headers' in error) {
    const headers = (error as { headers: Record<string, string> }).headers;
    const retryAfter = headers?.['retry-after'];
    if (retryAfter) {
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds)) return seconds * 1000;
    }
  }
  return null;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Execute an async function with retry logic
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      // Use Retry-After if available, otherwise exponential backoff
      const retryAfterMs = getRetryAfterMs(error);
      const delay = retryAfterMs ?? calculateDelay(attempt, opts.baseDelay, opts.maxDelay);

      console.warn(
        `${opts.operation} failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), ` +
        `retrying in ${Math.round(delay)}ms: ${error instanceof Error ? error.message : String(error)}`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
