// server/index.ts — must import sentry first for instrumentation
import './sentry'
import './lib/env'
import { sentry } from '@hono/sentry'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { handle } from 'hono/vercel'

import { db } from './lib/db/client'
import { createRateLimiter } from './lib/rate-limit'
import { agentRoutes } from './routes/agent'
import { authCallbackRoutes } from './routes/auth-callback'
import { projectRoutes } from './routes/projects'
import { projectDeployRoutes } from './routes/projects-deploy'
import { sandboxUrlRoutes } from './routes/sandbox-urls'
import { stripeCheckoutRoutes } from './routes/stripe-checkout'
import { stripeWebhookRoutes } from './routes/stripe-webhook'
import { supabaseProxyRoutes } from './routes/supabase-proxy'
import { adminRoutes } from './routes/admin'

const app = new Hono().basePath('/api')

// Global middleware — applied in order
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://vibestack.com',
      'https://www.vibestack.com',
      'https://app.vibestack.com',
    ]
    if (process.env.NODE_ENV !== 'production') {
      allowed.push('http://localhost:3000', 'http://localhost:5173')
    }
    // Only allow our own Vercel deployments (vibestack-*.vercel.app)
    const isAllowedVercel = (origin ?? '').match(/^https:\/\/vibestack-[a-z0-9-]+\.vercel\.app$/)
    return allowed.includes(origin ?? '') || isAllowedVercel
      ? origin!
      : allowed[0]
  },
  credentials: true,
  maxAge: 86400,
}))
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
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      geolocation: [],
      microphone: [],
      camera: [],
    },
  }),
)

// Body size limit (10MB for all API routes)
// Note: basePath is '/api', so '/*' matches '/api/*' in the actual URL
app.use('/*', bodyLimit({ maxSize: 10 * 1024 * 1024 }))

// Rate limiting on agent endpoint (5 requests per minute per user)
app.use('/agent', createRateLimiter({ windowMs: 60_000, max: 5, prefix: 'agent' }))
// More generous limit on other API routes (60 requests per minute)
app.use('/*', createRateLimiter({ windowMs: 60_000, max: 60, prefix: 'api' }))

// Health check with DB connectivity verification
app.get('/health', async (c) => {
  try {
    // Quick DB check
    const result = await db.execute(sql`SELECT 1 as ok`)
    return c.json({
      status: 'ok',
      db: result.rows.length > 0 ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    })
  } catch {
    return c.json({ status: 'degraded', db: 'error', timestamp: new Date().toISOString() }, 503)
  }
})

// Mount routes
app.route('/agent', agentRoutes)
app.route('/projects', projectRoutes)
app.route('/projects', sandboxUrlRoutes)
app.route('/projects/deploy', projectDeployRoutes)
app.route('/stripe/checkout', stripeCheckoutRoutes)
app.route('/stripe/webhook', stripeWebhookRoutes)
app.route('/supabase-proxy', supabaseProxyRoutes)
app.route('/auth/callback', authCallbackRoutes)
app.route('/admin', adminRoutes)

// Vercel adapter for production (serverless)
export default handle(app)

// Named export for dev server (used by Vite proxy)
export { app }
