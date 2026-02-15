// server/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sentry } from '@hono/sentry'
import { handle } from 'hono/vercel'

// Route modules (will be created in Tasks 10-14)
// import { agentRoutes } from './routes/agent'
// import { projectRoutes } from './routes/projects'
// import { projectDeployRoutes } from './routes/projects-deploy'
// import { sandboxUrlRoutes } from './routes/sandbox-urls'
// import { stripeCheckoutRoutes } from './routes/stripe-checkout'
// import { stripeWebhookRoutes } from './routes/stripe-webhook'
// import { supabaseProxyRoutes } from './routes/supabase-proxy'
// import { authCallbackRoutes } from './routes/auth-callback'

const app = new Hono().basePath('/api')

// Global middleware
if (process.env.SENTRY_DSN) {
  app.use('*', sentry({ dsn: process.env.SENTRY_DSN }))
}
app.use('*', cors())

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

// Route mounting (uncomment as routes are ported in Tasks 10-14)
// app.route('/agent', agentRoutes)
// app.route('/projects', projectRoutes)
// app.route('/projects/deploy', projectDeployRoutes)
// app.route('/stripe/checkout', stripeCheckoutRoutes)
// app.route('/stripe/webhook', stripeWebhookRoutes)
// app.route('/supabase-proxy', supabaseProxyRoutes)
// app.route('/auth/callback', authCallbackRoutes)

// Vercel adapter for production (serverless)
export default handle(app)

// Named export for dev server (used by Vite proxy)
export { app }
