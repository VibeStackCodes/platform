// server/index.ts — must import sentry first for instrumentation
import './sentry'
import { sentry } from '@hono/sentry'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'
import { handle } from 'hono/vercel'

import { agentRoutes } from './routes/agent'
import { authCallbackRoutes } from './routes/auth-callback'
import { projectRoutes } from './routes/projects'
import { projectDeployRoutes } from './routes/projects-deploy'
import { sandboxUrlRoutes } from './routes/sandbox-urls'
import { stripeCheckoutRoutes } from './routes/stripe-checkout'
import { stripeWebhookRoutes } from './routes/stripe-webhook'
import { supabaseProxyRoutes } from './routes/supabase-proxy'

/**
 * Simple in-memory rate limiter
 * Tracks requests per user/IP within a sliding window
 */
function createRateLimiter(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  // Cleanup expired entries every minute
  setInterval(() => {
    const now = Date.now()
    for (const [key, val] of hits) {
      if (val.resetAt <= now) hits.delete(key)
    }
  }, 60_000)

  return createMiddleware(async (c, next) => {
    const key = c.get('user')?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous'
    const now = Date.now()
    const entry = hits.get(key)

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs })
      return next()
    }

    entry.count++
    if (entry.count > opts.max) {
      return c.json(
        { error: 'rate_limit_exceeded', retryAfter: Math.ceil((entry.resetAt - now) / 1000) },
        429,
      )
    }
    return next()
  })
}

const app = new Hono().basePath('/api')

// Global middleware — applied in order
app.use('*', cors())
if (process.env.SENTRY_DSN) {
  app.use('*', sentry({ dsn: process.env.SENTRY_DSN }))
}

// Security headers (all routes)
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
      frameSrc: ["'self'", 'https://*.daytona.io'],
    },
  }),
)

// Body size limit (10MB for all API routes)
app.use('/api/*', bodyLimit({ maxSize: 10 * 1024 * 1024 }))

// Rate limiting on agent endpoint (5 requests per minute per user)
app.use('/api/agent', createRateLimiter({ windowMs: 60_000, max: 5 }))
// More generous limit on other API routes (60 requests per minute)
app.use('/api/*', createRateLimiter({ windowMs: 60_000, max: 60 }))

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

// Mount routes
app.route('/agent', agentRoutes)
app.route('/projects', projectRoutes)
app.route('/projects', sandboxUrlRoutes)
app.route('/projects/deploy', projectDeployRoutes)
app.route('/stripe/checkout', stripeCheckoutRoutes)
app.route('/stripe/webhook', stripeWebhookRoutes)
app.route('/supabase-proxy', supabaseProxyRoutes)
app.route('/auth/callback', authCallbackRoutes)

// Vercel adapter for production (serverless)
export default handle(app)

// Named export for dev server (used by Vite proxy)
export { app }
