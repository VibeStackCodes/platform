/**
 * Tests for server/lib/env.ts
 *
 * env.ts runs `validateEnv()` at import time, so each scenario needs a
 * fresh dynamic import with different `process.env` state.
 *
 * Strategy:
 *   1. Snapshot and restore process.env around every test via beforeEach/afterEach.
 *   2. Use `vi.resetModules()` before every dynamic import so Node's module
 *      cache is cleared and the side-effectful `validateEnv()` re-runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Full set of required env vars (from envSchema in env.ts)
const REQUIRED_VARS: Record<string, string> = {
  DATABASE_URL: 'postgres://localhost/test',
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  OPENAI_API_KEY: 'sk-openai',
  DAYTONA_API_KEY: 'daytona-key',
  DAYTONA_SNAPSHOT_ID: 'snap-123',
  VERCEL_TOKEN: 'vercel-token',
  VERCEL_WILDCARD_PROJECT_ID: 'proj-id',
  GITHUB_APP_ID: 'gh-app-id',
  GITHUB_APP_PRIVATE_KEY: 'gh-private-key',
  GITHUB_APP_INSTALLATION_ID: 'gh-install-id',
  GITHUB_ORG: 'my-org',
  STRIPE_SECRET_KEY: 'sk_test_stripe',
  STRIPE_WEBHOOK_SECRET: 'whsec_stripe',
}

let originalEnv: NodeJS.ProcessEnv

beforeEach(() => {
  // Deep-clone the current env so we can restore it afterwards
  originalEnv = { ...process.env }
})

afterEach(() => {
  // Restore exactly what was there before the test
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, originalEnv)

  vi.resetModules()
})

// Helper: wipe every known env key from process.env
function clearRequiredVars() {
  for (const key of Object.keys(REQUIRED_VARS)) {
    delete process.env[key]
  }
}

// Helper: populate all required env vars
function setAllRequiredVars() {
  Object.assign(process.env, REQUIRED_VARS)
}

describe('env.ts — import-time validation', () => {
  it('skips validation when VITEST env var is set', async () => {
    clearRequiredVars()
    // VITEST is already set by the test runner, but be explicit
    process.env.VITEST = 'true'
    delete process.env.NODE_ENV

    // Should NOT throw even with missing required vars
    await expect(import('@server/lib/env')).resolves.not.toThrow()
  })

  it('skips validation when NODE_ENV=test', async () => {
    clearRequiredVars()
    delete process.env.VITEST
    process.env.NODE_ENV = 'test'

    await expect(import('@server/lib/env')).resolves.not.toThrow()
  })

  it('throws in production when a required var is missing', async () => {
    clearRequiredVars()
    delete process.env.VITEST
    process.env.NODE_ENV = 'production'
    // Leave required vars absent — validation must throw

    await expect(import('@server/lib/env')).rejects.toThrow(
      'Server startup aborted — invalid environment configuration',
    )
  })

  it('logs a warning in development when a required var is missing but does not throw', async () => {
    clearRequiredVars()
    delete process.env.VITEST
    process.env.NODE_ENV = 'development'

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Should resolve (no throw) even with missing vars in dev
    await expect(import('@server/lib/env')).resolves.not.toThrow()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[env] Missing or invalid environment variables:'),
    )

    consoleErrorSpy.mockRestore()
  })

  it('does not throw or warn when all required vars are present', async () => {
    setAllRequiredVars()
    delete process.env.VITEST
    process.env.NODE_ENV = 'development'

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(import('@server/lib/env')).resolves.not.toThrow()

    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('is valid when optional vars are absent', async () => {
    setAllRequiredVars()
    delete process.env.VITEST
    process.env.NODE_ENV = 'development'

    // Explicitly remove all optional vars
    const optionalVars = [
      'ANTHROPIC_API_KEY',
      'LANGFUSE_PUBLIC_KEY',
      'LANGFUSE_SECRET_KEY',
      'LANGFUSE_BASEURL',
      'SENTRY_DSN',
      'VITE_SENTRY_DSN',
      'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_ORG_ID',
      'ADMIN_USER_IDS',
    ]
    for (const key of optionalVars) {
      delete process.env[key]
    }

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(import('@server/lib/env')).resolves.not.toThrow()
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('throws in production when VITE_SUPABASE_URL is not a valid URL', async () => {
    setAllRequiredVars()
    delete process.env.VITEST
    process.env.NODE_ENV = 'production'
    process.env.VITE_SUPABASE_URL = 'not-a-url'

    await expect(import('@server/lib/env')).rejects.toThrow(
      'Server startup aborted — invalid environment configuration',
    )
  })
})
