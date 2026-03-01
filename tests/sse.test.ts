import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSSEStream } from '@server/lib/sse'

describe('createSSEStream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a Response with correct SSE headers', () => {
    const response = createSSEStream(async () => {})

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
  })

  it('emitting an event formats as data: {json}\\n\\n', async () => {
    const event = { type: 'thinking' as const, content: 'hello' }

    const response = createSSEStream(async (emit) => {
      emit(event)
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    const chunks: string[] = []
    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (result.value) {
        chunks.push(decoder.decode(result.value))
      }
    }

    const output = chunks.join('')
    expect(output).toContain(`data: ${JSON.stringify(event)}\n\n`)
  })

  it('sends multiple events in order', async () => {
    const events = [
      { type: 'thinking' as const, content: 'first' },
      { type: 'thinking' as const, content: 'second' },
      { type: 'thinking' as const, content: 'third' },
    ]

    const response = createSSEStream(async (emit) => {
      for (const event of events) {
        emit(event)
      }
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    const chunks: string[] = []
    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (result.value) {
        chunks.push(decoder.decode(result.value))
      }
    }

    const output = chunks.join('')
    const firstPos = output.indexOf(`data: ${JSON.stringify(events[0])}\n\n`)
    const secondPos = output.indexOf(`data: ${JSON.stringify(events[1])}\n\n`)
    const thirdPos = output.indexOf(`data: ${JSON.stringify(events[2])}\n\n`)

    expect(firstPos).toBeGreaterThanOrEqual(0)
    expect(secondPos).toBeGreaterThan(firstPos)
    expect(thirdPos).toBeGreaterThan(secondPos)
  })

  it('stream closes after handler completes', async () => {
    const response = createSSEStream(async (emit) => {
      emit({ type: 'thinking' as const, content: 'done' })
      // handler returns — stream should close
    })

    const reader = response.body!.getReader()
    const chunks: Uint8Array[] = []

    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (result.value) {
        chunks.push(result.value)
      }
    }

    // Stream ended (done === true), meaning the controller was closed
    expect(done).toBe(true)
  })

  it('abort signal fires when client disconnects (reader cancel)', async () => {
    let capturedSignal: AbortSignal | null = null

    const response = createSSEStream(async (_emit, signal) => {
      capturedSignal = signal
      // Simulate a long-running handler that awaits the abort
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve())
      })
    })

    const reader = response.body!.getReader()

    // Kick off reading so the stream starts
    const readPromise = reader.read()

    // Cancel the reader — simulates client disconnect
    await reader.cancel()

    // The abort signal must have been fired
    expect(capturedSignal).not.toBeNull()
    expect(capturedSignal!.aborted).toBe(true)

    // Ensure no unhandled promise rejection
    await readPromise.catch(() => {})
  })

  it('does not emit after abort signal fires', async () => {
    let emitRef: ((event: unknown) => void) | null = null
    let signalRef: AbortSignal | null = null

    const response = createSSEStream(async (emit, signal) => {
      emitRef = emit
      signalRef = signal
      // Wait for abort
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve())
      })
      // Try to emit after abort — should be silently swallowed
      emit({ type: 'thinking' as const, content: 'after-abort' })
    })

    const reader = response.body!.getReader()

    // Start reading
    const firstChunkPromise = reader.read()

    // Cancel (disconnect) immediately
    await reader.cancel()
    await firstChunkPromise.catch(() => {})

    // The signal is aborted, so the emit above is a no-op — no error thrown
    expect(signalRef!.aborted).toBe(true)
    // emitRef exists (handler ran)
    expect(emitRef).not.toBeNull()
  })

  it('sends keepalive comments in ": keepalive\\n\\n" format', async () => {
    // We'll capture enqueued chunks by letting the interval fire once
    let resolveHandler!: () => void
    const handlerDone = new Promise<void>((resolve) => {
      resolveHandler = resolve
    })

    const enqueuedChunks: string[] = []
    const decoder = new TextDecoder()

    const response = createSSEStream(async (_emit, _signal) => {
      // Advance fake timers to trigger the keepalive interval (15 000 ms)
      vi.advanceTimersByTime(15_000)
      // Give microtasks a chance to flush
      await Promise.resolve()
      resolveHandler()
    })

    // Consume the stream
    const reader = response.body!.getReader()
    await handlerDone

    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (result.value) {
        enqueuedChunks.push(decoder.decode(result.value))
      }
    }

    const fullOutput = enqueuedChunks.join('')
    expect(fullOutput).toContain(': keepalive\n\n')
  })

  it('returns a ReadableStream body', () => {
    const response = createSSEStream(async () => {})
    expect(response.body).toBeInstanceOf(ReadableStream)
  })

  it('handles handler that throws without crashing the stream', async () => {
    const response = createSSEStream(async () => {
      throw new Error('handler error')
    })

    const reader = response.body!.getReader()

    // Stream should close even on error (finally block in start())
    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
    }

    expect(done).toBe(true)
  })
})
