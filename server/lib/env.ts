// Import this file at the top of server/index.ts: import './lib/env'

import { z } from 'zod'

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  DAYTONA_API_KEY: z.string().min(1),
  DAYTONA_SNAPSHOT_ID: z.string().min(1),
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_WILDCARD_PROJECT_ID: z.string().min(1),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_APP_INSTALLATION_ID: z.string().min(1),
  GITHUB_ORG: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Optional
  ANTHROPIC_API_KEY: z.string().optional(),
  HELICONE_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  VITE_SENTRY_DSN: z.string().optional(),
  SUPABASE_ACCESS_TOKEN: z.string().optional(),
  SUPABASE_ORG_ID: z.string().optional(),
  ADMIN_USER_IDS: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
})

// Validate at import time — fail fast if env vars are missing
function validateEnv() {
  // Skip validation in test environment
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return

  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map(
      (i) => `  ${i.path.join('.')}: ${i.message}`
    )
    console.error(
      `[env] Missing or invalid environment variables:\n${missing.join('\n')}`
    )
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Server startup aborted — invalid environment configuration')
    }
  }
}

validateEnv()
