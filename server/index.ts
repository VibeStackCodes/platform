// server/index.ts — must import sentry first for instrumentation
import './sentry'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sentry } from '@hono/sentry'
import { handle } from 'hono/vercel'

import { agentRoutes } from './routes/agent'
import { projectRoutes } from './routes/projects'
import { projectDeployRoutes } from './routes/projects-deploy'
import { sandboxUrlRoutes } from './routes/sandbox-urls'
import { stripeCheckoutRoutes } from './routes/stripe-checkout'
import { stripeWebhookRoutes } from './routes/stripe-webhook'
import { supabaseProxyRoutes } from './routes/supabase-proxy'
import { authCallbackRoutes } from './routes/auth-callback'

const app = new Hono().basePath('/api')

// Global middleware
app.use('*', cors())
if (process.env.SENTRY_DSN) {
  app.use('*', sentry({ dsn: process.env.SENTRY_DSN }))
}

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
