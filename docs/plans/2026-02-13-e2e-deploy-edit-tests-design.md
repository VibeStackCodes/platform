# E2E Tests: Deploy + Edit Flows

## Date: 2026-02-13

## Summary

Add E2E tests for the two untested critical flows: **Deploy to Vercel with custom domain** and **Edit/iterate on generated code**. Each flow gets both a real-API test and a mock-mode test in separate Playwright projects — no `.env.local` toggling needed.

## Current Coverage

- `e2e/full-flow.spec.ts` — Mock mode: landing → auth UI → dashboard → chat → plan → generate
- `e2e/real-generation.spec.ts` — Real APIs: signup → chat → persistence → plan → approve → generate → verify

**Gap:** Neither test covers deploy or edit, which are the final steps of the user journey.

## Architecture: Two Playwright Projects

Instead of toggling `NEXT_PUBLIC_MOCK_MODE` in `.env.local`, use Playwright projects with `env` overrides:

```ts
// playwright.config.ts
projects: [
  {
    name: 'mock',
    testMatch: /full-flow/,
    use: { ...devices['Desktop Chrome'] },
    // Mock mode uses the default NEXT_PUBLIC_MOCK_MODE=true from .env.test
  },
  {
    name: 'real',
    testMatch: /real-generation/,
    use: { ...devices['Desktop Chrome'] },
    // Real mode reads from .env.local (NEXT_PUBLIC_MOCK_MODE=false)
  },
]
```

Run commands:
- `pnpm test:e2e:mock` → `playwright test --project=mock`
- `pnpm test:e2e:real` → `playwright test --project=real`
- `pnpm test:e2e` → runs both

Note: The mock mode flag is a build-time `NEXT_PUBLIC_` env var baked into the Next.js bundle, so the server must be started with the correct value. The `webServer` config can't switch per-project. Instead, mock tests use Playwright route interception to stub API responses regardless of server mode. Real tests hit the actual server (started with `NEXT_PUBLIC_MOCK_MODE=false`).

## Design

### 1. Real API Tests (extend `real-generation.spec.ts`)

Add steps after the existing Step 9 (verify final state):

**Step 10: Deploy to Vercel + Custom Domain**
- Click the Deploy button in the preview panel header
- Intercept the `/api/projects/deploy` response to capture `deployUrl`
- Wait for the deploy to complete (response returns)
- Assert `deployUrl` matches `https://{slug}.vibestack.site` pattern
- Fetch the deployed URL and verify it returns HTTP 200
- Screenshot the deployed state

**Step 11: Edit/Iterate**
- Type an edit instruction in the chat: "Add a dark mode toggle to the header"
- Wait for the AI to process (identifies affected files → regenerates → verifies build)
- Wait for a success indicator in the chat (assistant responds with modification summary)
- Screenshot the post-edit state

**Step 12: Verify Dashboard State**
- Navigate to `/dashboard`
- Find the project card with the generated app name
- Verify it shows "deployed" status
- Verify the deploy URL link is visible

### 2. Mock Mode Tests (extend `full-flow.spec.ts`)

**Deploy button test:**
- Navigate to project page with mock sandbox
- Click the Deploy button
- Use Playwright `page.route()` to intercept `/api/projects/deploy` and return `{ success: true, deployUrl: "https://mock-app.vibestack.site" }`
- Verify no error state in UI

**Edit flow mock test:**
- After mock generation approval, type an edit instruction in the chat
- The mock chat handler (turn 5+) returns a text response simulating edit completion
- Verify the chat displays the edit result message

### 3. Mock Chat Extension

Extend `buildMockChatResponse` in `app/api/chat/route.ts` to handle turn 5+:
- After `start_generation` (turn 4), subsequent user messages return a text stream:
  "I've updated 2 files based on your instruction: `src/components/header.tsx` and `src/index.css`. The changes have been applied and the build verified successfully."

### 4. Timeouts

| Step | Real API Timeout | Mock Timeout |
|------|-----------------|--------------|
| Deploy | 300s (5 min) | 10s |
| Edit | 300s (5 min) | 15s |
| Dashboard verify | 15s | 10s |

## Environment Requirements

Real API tests require all env vars in `.env.local`:
- `VERCEL_TOKEN`, `VERCEL_WILDCARD_PROJECT_ID`, `VERCEL_TEAM_ID`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DAYTONA_API_KEY`
- Supabase keys

Mock tests require no external API keys.

## Files to Modify

1. `e2e/real-generation.spec.ts` — Add steps 10-12
2. `e2e/full-flow.spec.ts` — Add deploy button + edit mock tests
3. `app/api/chat/route.ts` — Extend mock to handle post-generation edit turns
4. `playwright.config.ts` — Add named projects (mock/real)
5. `package.json` — Add `test:e2e:mock` and `test:e2e:real` scripts

## Out of Scope

- Stripe payment flow tests (separate effort)
- Auth callback/OAuth tests (separate effort)
- Middleware redirect tests in non-mock mode
