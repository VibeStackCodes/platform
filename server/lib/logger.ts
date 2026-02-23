import { Logtail } from '@logtail/node'

/**
 * Structured Logger — BetterStack Logtail
 *
 * Wraps @logtail/node with a pino-like API. When LOGTAIL_SOURCE_TOKEN is set,
 * logs are shipped to BetterStack. Always logs to console as well.
 *
 * Usage:
 *   import { log } from './logger'
 *   log.info('Pipeline started', { projectId, userId })
 *   log.error('Build failed', { projectId, errors })
 *   const child = log.child({ projectId: '123' })
 *   child.info('File generated', { path: 'src/App.tsx' })
 */

// Singleton Logtail client (null when token not configured)
let logtail: Logtail | null = null

function getLogtail(): Logtail | null {
  if (logtail) return logtail
  const token = process.env.LOGTAIL_SOURCE_TOKEN
  if (!token) return null
  logtail = new Logtail(token)
  return logtail
}

type LogContext = Record<string, unknown>

interface Logger {
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  debug(message: string, context?: LogContext): void
  child(defaultContext: LogContext): Logger
  flush(): Promise<void>
}

function createLogger(defaultContext: LogContext = {}): Logger {
  function mergeContext(context?: LogContext): LogContext {
    return { ...defaultContext, ...context }
  }

  function formatConsole(level: string, message: string, ctx: LogContext): string {
    const tag = ctx.module ? `[${ctx.module}]` : ''
    const extra = Object.keys(ctx).filter(k => k !== 'module').length > 0
      ? ` ${JSON.stringify(Object.fromEntries(Object.entries(ctx).filter(([k]) => k !== 'module')))}`
      : ''
    return `${tag} ${message}${extra}`
  }

  return {
    info(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      console.log(formatConsole('info', message, ctx))
      getLogtail()?.info(message, ctx)
    },

    warn(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      console.warn(formatConsole('warn', message, ctx))
      getLogtail()?.warn(message, ctx)
    },

    error(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      console.error(formatConsole('error', message, ctx))
      getLogtail()?.error(message, ctx)
    },

    debug(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(formatConsole('debug', message, ctx))
      }
      getLogtail()?.debug(message, ctx)
    },

    child(childContext: LogContext): Logger {
      return createLogger({ ...defaultContext, ...childContext })
    },

    async flush(): Promise<void> {
      await getLogtail()?.flush()
    },
  }
}

/** Root logger — import this everywhere */
export const log = createLogger()

/** Flush pending logs (call before process exit) */
export async function flushLogs(): Promise<void> {
  await log.flush()
}
