/**
 * SSE (Server-Sent Events) Stream Utilities
 *
 * Provides type-safe SSE response creation for streaming events to clients.
 */

import type { StreamEvent } from './types'

/**
 * Create an SSE response stream with abort signal support.
 * The callback receives an `emit` function to send events and an `AbortSignal`
 * that triggers when the client disconnects.
 *
 * @param handler - Async function that receives emit and signal
 * @returns Response with SSE headers and ReadableStream body
 */
export function createSSEStream(
  handler: (emit: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder()
  const abortController = new AbortController()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        if (!abortController.signal.aborted) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch {
            // Controller closed, ignore
          }
        }
      }

      // SSE keepalive: send comment ping every 15s to prevent proxy/server idle timeouts
      const keepalive = setInterval(() => {
        if (!abortController.signal.aborted) {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'))
          } catch {
            clearInterval(keepalive)
          }
        }
      }, 15_000)

      try {
        await handler(emit, abortController.signal)
      } finally {
        clearInterval(keepalive)
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }
    },
    cancel() {
      abortController.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
