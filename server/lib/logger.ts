import * as Sentry from '@sentry/node'

/**
 * Structured Logger — Sentry Logs
 *
 * Wraps Sentry.logger with a pino-like API. When SENTRY_DSN is set and
 * enableLogs is true, logs are shipped to Sentry Logs (5 GB / 30-day free tier).
 * Always logs to console as well.
 *
 * Usage:
 *   import { log } from './logger'
 *   log.info('Pipeline started', { projectId, userId })
 *   log.error('Build failed', { projectId, errors })
 *   const child = log.child({ projectId: '123' })
 *   child.info('File generated', { path: 'src/App.tsx' })
 */

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

  function formatConsole(message: string, ctx: LogContext): string {
    const tag = ctx.module ? `[${ctx.module}]` : ''
    const extra =
      Object.keys(ctx).filter((k) => k !== 'module').length > 0
        ? ` ${JSON.stringify(Object.fromEntries(Object.entries(ctx).filter(([k]) => k !== 'module')))}`
        : ''
    return `${tag} ${message}${extra}`
  }

  return {
    info(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      console.log(formatConsole(message, ctx))
      Sentry.logger.info(message, ctx)
    },

    warn(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      console.warn(formatConsole(message, ctx))
      Sentry.logger.warn(message, ctx)
    },

    error(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      console.error(formatConsole(message, ctx))
      Sentry.logger.error(message, ctx)
    },

    debug(message: string, context?: LogContext) {
      const ctx = mergeContext(context)
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(formatConsole(message, ctx))
      }
      Sentry.logger.debug(message, ctx)
    },

    child(childContext: LogContext): Logger {
      return createLogger({ ...defaultContext, ...childContext })
    },

    async flush(): Promise<void> {
      await Sentry.flush(2000)
    },
  }
}

/** Root logger — import this everywhere */
export const log = createLogger()

/** Flush pending logs (call before process exit) */
export async function flushLogs(): Promise<void> {
  await log.flush()
}
