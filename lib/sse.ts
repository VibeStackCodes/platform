/**
 * SSE (Server-Sent Events) Stream Utilities
 *
 * Provides type-safe SSE response creation for streaming events to clients.
 */

import type { StreamEvent } from './types';

/**
 * Create an SSE response stream. The callback receives an `emit` function
 * to send events. The stream closes automatically when the callback resolves.
 *
 * @param handler - Async function that receives an emit function to send StreamEvents
 * @returns Response with SSE headers and ReadableStream body
 *
 * @example
 * ```typescript
 * return createSSEStream(async (emit) => {
 *   emit({ type: 'stage_update', stage: 'provisioning' });
 *   await doWork();
 *   emit({ type: 'complete', projectId: '123', urls: {}, requirementResults: [] });
 * });
 * ```
 */
export function createSSEStream(
  handler: (emit: (event: StreamEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        await handler(emit);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
