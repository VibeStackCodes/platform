// server/index.ts — must import sentry first for instrumentation
import './sentry'
import './lib/env'
import { flushLogs, log } from './lib/logger'
import { sentry } from '@hono/sentry'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { handle } from 'hono/vercel'
import { openAPIRouteHandler } from 'hono-openapi'
import { Scalar } from '@scalar/hono-api-reference'

import { db } from './lib/db/client'
import { createRateLimiter } from './lib/rate-limit'
import { authCallbackRoutes } from './routes/auth-callback'
import { projectRoutes } from './routes/projects'
import { projectDeployRoutes } from './routes/projects-deploy'
import { sandboxUrlRoutes } from './routes/sandbox-urls'
import { stripeCheckoutRoutes } from './routes/stripe-checkout'
import { stripeWebhookRoutes } from './routes/stripe-webhook'
import { adminRoutes } from './routes/admin'
import { agentRoutes } from './routes/agent'

declare const Bun: {
  serve: (options: {
    port: number
    fetch: (request: Request) => Response | Promise<Response>
    idleTimeout?: number
  }) => unknown
}

const app = new Hono().basePath('/api')

// Global middleware — applied in order
app.use(
  '*',
  cors({
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
      return allowed.includes(origin ?? '') || isAllowedVercel ? origin! : allowed[0]
    },
    credentials: true,
    maxAge: 86400,
  }),
)
if (process.env.SENTRY_DSN) {
  app.use('*', sentry({ dsn: process.env.SENTRY_DSN }))
}

// Security headers (all routes except /doc and /reference — Scalar needs its own CSP)
app.use('*', async (c, next) => {
  if (c.req.path === '/api/doc' || c.req.path === '/api/reference') return next()
  return secureHeaders({
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
  })(c, next)
})

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

// Mount routes — chained so TypeScript can infer the full AppType for Hono RPC
const routes = app
  .route('/projects', projectRoutes)
  .route('/projects', sandboxUrlRoutes)
  .route('/projects/deploy', projectDeployRoutes)
  .route('/stripe/checkout', stripeCheckoutRoutes)
  .route('/stripe/webhook', stripeWebhookRoutes)
  .route('/auth/callback', authCallbackRoutes)
  .route('/admin', adminRoutes)
  .route('/agent', agentRoutes)

// OpenAPI JSON spec — generated from describeRoute() metadata across all mounted routes
app.get(
  '/doc',
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'VibeStack API',
        version: '1.0.0',
        description:
          'AI-powered app builder — users describe an app, the platform generates a full Vite + React project with live preview.',
        contact: { name: 'VibeStack', url: 'https://vibestack.com' },
        license: { name: 'Proprietary' },
      },
      servers: [{ url: '/api', description: 'Current environment' }],
      tags: [
        { name: 'projects', description: 'Project CRUD operations' },
        { name: 'agent', description: 'AI generation pipeline (SSE stream)' },
        { name: 'deploy', description: 'Vercel deployment' },
        { name: 'sandbox', description: 'Daytona sandbox preview URLs' },
        { name: 'stripe', description: 'Stripe billing & webhooks' },
        { name: 'auth', description: 'OAuth callback flow' },
        { name: 'admin', description: 'System health & diagnostics' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Supabase JWT access token. Get from Supabase Auth login flow.',
          },
          stripeSignature: {
            type: 'apiKey',
            in: 'header',
            name: 'stripe-signature',
            description: 'Stripe webhook signature (v1 HMAC)',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  }),
)

// Scalar interactive API reference UI — served at /api/reference
// Uses a permissive CSP for this route only so the Scalar CDN scripts load
app.get(
  '/reference',
  (c, next) => {
    // Scalar loads assets from its CDN — set a permissive CSP for this route only
    // connect-src includes localhost and production origins so "Try it" requests work
    c.res.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://localhost:* https://vibestack.com https://app.vibestack.com",
    )
    return next()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  },
  Scalar({
    url: '/api/doc',
    pageTitle: 'VibeStack API Reference',
    theme: 'deepSpace',
    layout: 'modern',
    darkMode: true,
    _integration: 'hono',
    defaultHttpClient: { targetKey: 'node', clientKey: 'fetch' },
    baseServerURL: '/api',
    persistAuth: true,
    authentication: {
      preferredSecurityScheme: 'bearerAuth',
      http: {
        bearer: {
          token: '',
        },
      },
    },
    favicon: '/favicon.ico',
    metaData: {
      title: 'VibeStack API Reference',
      description: 'Interactive API docs for the VibeStack app builder platform',
      ogTitle: 'VibeStack API Reference',
      ogDescription: 'Explore and test VibeStack API endpoints',
    },
    defaultOpenAllTags: true,
    expandAllModelSections: true,
    searchHotKey: 'k',
    hideSearch: false,
    showSidebar: true,
    hideDarkModeToggle: false,
    hideModels: false,
    hideDownloadButton: false,
    hideClientButton: false,
    hideTestRequestButton: false,
    showOperationId: false,
    expandAllResponses: false,
    operationTitleSource: 'summary',
    operationsSorter: 'method',
    tagsSorter: 'alpha',
    orderSchemaPropertiesBy: 'alpha',
    orderRequiredPropertiesFirst: true,
    documentDownloadType: 'both',
    showDeveloperTools: 'localhost',
    showToolbar: 'localhost',
    pathRouting: { basePath: '/api/reference' },
    withDefaultFonts: true,
    customCss: `
    .dark-mode {
      --scalar-color-accent: #e36002;
      --scalar-background-1: #0f0f11;
    }
    .light-mode {
      --scalar-color-accent: #e36002;
    }
  `,
    hiddenClients: {
      c: true,
      clojure: true,
      csharp: true,
      dart: true,
      fsharp: true,
      go: true,
      java: true,
      kotlin: true,
      objc: true,
      ocaml: true,
      php: true,
      powershell: true,
      r: true,
      ruby: true,
      rust: true,
      swift: true,
    },
    telemetry: false,
  } as any),
)

// Type-only export consumed by src/lib/api-client.ts via `import type`
// The client NEVER imports the implementation — only the type shape
export type AppType = typeof routes

// Named export for type inference (used by app.ts `import type`)
export { app }

// Default export: Vercel serverless handler
// - Vercel: api/index.js imports this via esbuild bundle
// - Dev server: Bun.serve uses app.fetch directly below
export default handle(app)

// Dev server — Bun runtime (Vite proxies /api → localhost:8787)
if (typeof Bun !== 'undefined' && !process.env.VERCEL) {
  const port = Number(process.env.PORT) || 8787
  Bun.serve({ port, fetch: app.fetch, idleTimeout: 255 })
  log.info(`API running on http://localhost:${port}`, { module: 'server', port })

  // Flush logs on shutdown
  process.on('SIGINT', async () => {
    await flushLogs()
    process.exit(0)
  })
  process.on('SIGTERM', async () => {
    await flushLogs()
    process.exit(0)
  })
}
