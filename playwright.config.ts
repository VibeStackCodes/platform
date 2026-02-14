import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential — tests share auth state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
  },
  projects: [
    {
      name: 'mock',
      testMatch: /full-flow/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3100' },
    },
    {
      name: 'real',
      testMatch: /real-generation/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
    },
  ],
  webServer: [
    {
      command: 'NEXT_PUBLIC_MOCK_MODE=true pnpm build && NEXT_PUBLIC_MOCK_MODE=true pnpm start -p 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_MOCK_MODE: 'true',
        SUPABASE_E2E_ORG_ID: 'zieajexturdwfcjjfolu',
      },
    },
    {
      command: 'pnpm build && pnpm start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_MOCK_MODE: 'false',
        SUPABASE_E2E_ORG_ID: 'zieajexturdwfcjjfolu',
      },
    },
  ],
});
