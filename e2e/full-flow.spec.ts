import { expect, type Page, test } from '@playwright/test'

/**
 * VibeStack Full E2E Test Suite
 *
 * Tests the complete user journey in MOCK_MODE:
 * 1. Landing page & hero prompt
 * 2. Auth UI (sign-in/sign-up form rendering, toggles, validation)
 * 3. Middleware (blocks unauthenticated access)
 * 4. Builder chat → plan → generate (mock flow, no real auth needed)
 *
 * Requires: NEXT_PUBLIC_MOCK_MODE=true in .env.local
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for React hydration — Next.js App Router finishes loading JS chunks */
async function waitForHydration(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
}

async function _fillPromptAndSubmit(page: Page, prompt: string) {
  await page.evaluate((val) => {
    const textarea = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement
    const descriptor = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )
    const setter = descriptor?.set
    if (!setter) throw new Error('Could not find textarea value setter')
    setter.call(textarea, val)
    textarea.closest('form')?.requestSubmit()
  }, prompt)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('VibeStack E2E', () => {
  // =========================================================================
  // 1. Landing Page
  // =========================================================================

  test.describe('Landing Page', () => {
    test('renders hero section with prompt input', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByText('Build apps with AI')).toBeVisible()
      await expect(page.locator('textarea[name="message"]')).toBeVisible()
    })

    test('shows feature cards', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByText('AI Generation')).toBeVisible()
      await expect(page.getByText('Live Preview')).toBeVisible()
      await expect(page.getByText('One-Click Deploy')).toBeVisible()
    })
  })

  // =========================================================================
  // 2. Auth UI (no real sign-in — just form rendering)
  // =========================================================================

  test.describe('Auth UI', () => {
    test('renders login page with email and password', async ({ page }) => {
      await page.goto('/auth/login')
      await expect(page.getByText('Welcome Back')).toBeVisible()
      await expect(page.locator('#email')).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()
    })

    test('toggles between sign-in and sign-up', async ({ page }) => {
      await page.goto('/auth/login')
      await waitForHydration(page)
      await expect(page.getByText('Welcome Back')).toBeVisible()

      await page.locator('button', { hasText: /^Sign Up$/ }).click({ force: true })
      await expect(page.getByText('Create Account')).toBeVisible({ timeout: 10_000 })

      await page.locator('button', { hasText: /^Sign In$/ }).click({ force: true })
      await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 10_000 })
    })

    test('shows error for invalid credentials', async ({ page }) => {
      await page.goto('/auth/login')
      await waitForHydration(page)
      await page.locator('#email').fill('nonexistent@test.com')
      await page.locator('#password').fill('wrongpassword123')
      await page.locator('button[type="submit"]').click()

      await expect(page.locator('p.text-red-400')).toBeVisible({ timeout: 10_000 })
    })
  })

  // =========================================================================
  // 3. Middleware (auth redirects)
  // =========================================================================

  test.describe('Middleware', () => {
    test('mock mode allows direct access to /dashboard', async ({ page }) => {
      await page.goto('/dashboard')
      // In mock mode, middleware is bypassed — page should load
      await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible({
        timeout: 10_000,
      })
    })

    test('mock mode allows direct access to /project/:id', async ({ page }) => {
      await page.goto('/project/mock-test-id')
      // In mock mode, project page renders with stub data
      await expect(page.locator('textarea[name="message"]')).toBeVisible({ timeout: 10_000 })
    })
  })

  // =========================================================================
  // 4. Dashboard (mock mode — no auth needed)
  // =========================================================================

  test.describe('Dashboard', () => {
    test('shows projects heading', async ({ page }) => {
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
      await expect(page.getByText('Manage and build')).toBeVisible()
    })

    test('has New Project button linking to landing', async ({ page }) => {
      await page.goto('/dashboard')
      const newBtn = page.getByRole('link', { name: /New Project/i })
      await expect(newBtn).toBeVisible()
      await expect(newBtn).toHaveAttribute('href', '/')
    })

    test('empty state shows when no projects', async ({ page }) => {
      await page.goto('/dashboard')
      // Mock user has no real projects, so empty state should show
      await expect(page.getByText('No projects yet')).toBeVisible({ timeout: 10_000 })
    })
  })

  // =========================================================================
  // 5. Builder: Chat → Plan → Generate (mock flow)
  // =========================================================================

  test.describe('Builder: Chat → Plan → Generate', () => {
    test('renders builder with chat input', async ({ page }) => {
      await page.goto('/project/mock-builder-test')
      await expect(page.locator('textarea[name="message"]')).toBeVisible({ timeout: 10_000 })
    })

    test('chat sends message and receives mock clarifying question', async ({ page }) => {
      await page.goto('/project/mock-chat-test')
      await waitForHydration(page)

      // The page auto-submits "Mock project" as initial prompt
      // Wait for the mock AI response — clarifying question
      await expect(page.getByText(/What kind of tasks/i).first()).toBeVisible({ timeout: 15_000 })

      // Options should be visible
      await expect(page.getByText('Personal task list')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText('Team collaboration')).toBeVisible()
    })

    test('clicking option triggers thinking steps then plan', async ({ page }) => {
      await page.goto('/project/mock-plan-test')
      await waitForHydration(page)

      // Wait for clarifying question (turn 1)
      await expect(page.getByText(/What kind of tasks/i).first()).toBeVisible({ timeout: 15_000 })

      // Click an option → turn 2 = thinking_steps
      await page.getByText('Team collaboration').click()

      // Wait for ChainOfThought planning steps
      await expect(page.getByText('Analyzing requirements')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Designing database schema')).toBeVisible()

      // Answer again to trigger turn 3 = show_plan
      const textarea = page.locator('textarea[name="message"]')
      await textarea.fill('Looks good, proceed')
      await textarea.press('Enter')

      // Wait for plan card to appear
      await expect(page.getByText('TaskFlow', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('button', { name: /Approve & Generate/i })).toBeVisible()
    })

    test('plan card shows requirements, files, and confirmation actions', async ({ page }) => {
      await page.goto('/project/mock-plan-detail-test')
      await waitForHydration(page)

      // Get past clarifying question → thinking steps → plan
      await expect(page.getByText(/What kind of tasks/i).first()).toBeVisible({ timeout: 15_000 })
      await page.getByText('Team collaboration').click()
      await expect(page.getByText('Analyzing requirements')).toBeVisible({ timeout: 15_000 })
      const textarea = page.locator('textarea[name="message"]')
      await textarea.fill('Looks good')
      await textarea.press('Enter')

      // Wait for plan
      await expect(page.getByText('TaskFlow', { exact: true })).toBeVisible({ timeout: 15_000 })

      // Plan details — features list (template pipeline replaced requirements/files)
      await expect(page.getByText(/Features \(/i)).toBeVisible()

      // Confirmation actions
      await expect(page.getByRole('button', { name: /Request Changes/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /Approve & Generate/i })).toBeVisible()
    })

    test('approve triggers generation pipeline', async ({ page }) => {
      await page.goto('/project/mock-gen-test')
      await waitForHydration(page)

      // Get past clarifying question → thinking steps → plan
      await expect(page.getByText(/What kind of tasks/i).first()).toBeVisible({ timeout: 15_000 })
      await page.getByText('Team collaboration').click()
      await expect(page.getByText('Analyzing requirements')).toBeVisible({ timeout: 15_000 })
      const textarea = page.locator('textarea[name="message"]')
      await textarea.fill('Proceed')
      await textarea.press('Enter')
      await expect(page.getByText('TaskFlow', { exact: true })).toBeVisible({ timeout: 15_000 })

      // Click approve via Confirmation component
      await page.getByRole('button', { name: /Approve & Generate/i }).click()

      // ConfirmationAccepted shows after approval
      await expect(
        page.getByText(/Plan approved|Generating|Generation Complete/i).first(),
      ).toBeVisible({ timeout: 30_000 })
    })
  })

  // =========================================================================
  // 6. Builder Preview Panels
  // =========================================================================

  test.describe('Builder Preview Panels', () => {
    test('preview, code, and database tabs are interactive', async ({ page }) => {
      await page.goto('/project/mock-preview-test')
      await waitForHydration(page)

      const previewTab = page.getByRole('tab', { name: 'Preview' })
      await expect(previewTab).toBeVisible({ timeout: 10_000 })

      const codeTab = page.getByRole('tab', { name: 'Code' })
      await codeTab.click()

      const dbTab = page.getByRole('tab', { name: 'Database' })
      await dbTab.click()

      await previewTab.click()
    })

    test('shows empty state when no sandbox is provisioned', async ({ page }) => {
      await page.goto('/project/mock-placeholder-test')
      await waitForHydration(page)

      // Preview tab — no previewUrl means no iframe rendered
      await expect(page.getByRole('tab', { name: 'Preview' })).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('iframe')).not.toBeVisible()

      // Code tab — no codeServerUrl means no iframe
      await page.getByRole('tab', { name: 'Code' }).click()
      await expect(page.locator('iframe[title="Code Editor"]')).not.toBeVisible()
    })
  })

  // =========================================================================
  // 7. Deploy (mock)
  // =========================================================================

  test.describe('Deploy (mock)', () => {
    test('deploy button calls API and handles success', async ({ page }) => {
      // Intercept deploy API with mock response
      await page.route('**/api/projects/deploy', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            deployUrl: 'https://mock-app-12345678.vibestack.site',
            projectId: 'mock-deploy-test',
          }),
        })
      })

      await page.goto('/project/mock-deploy-test')
      await waitForHydration(page)

      // Click deploy button
      const deployBtn = page.getByRole('button', { name: /Deploy/i })
      await expect(deployBtn).toBeVisible({ timeout: 10_000 })

      // Listen for the API call
      const deployPromise = page.waitForResponse('**/api/projects/deploy')
      await deployBtn.click()

      const response = await deployPromise
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.deployUrl).toMatch(/\.vibestack\.site$/)
    })
  })

  // =========================================================================
  // 8. Edit/Iterate (mock)
  // =========================================================================

  test.describe('Edit/Iterate (mock)', () => {
    test('post-generation edit returns mock response', async ({ page }) => {
      // Mock the generation API to return a quick SSE "complete" event
      // so that generationStatus transitions to "complete" and textarea is re-enabled
      await page.route('**/api/projects/generate', async (route) => {
        const sseBody =
          'data: {"type":"file_start","path":"src/App.tsx"}\n\ndata: {"type":"file_complete","path":"src/App.tsx","linesOfCode":10}\n\ndata: {"type":"complete"}\n\n'
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseBody,
        })
      })

      await page.goto('/project/mock-edit-test')
      await waitForHydration(page)

      // Navigate through mock flow: question → thinking → plan → approve → edit
      // Turn 1: clarifying question
      await expect(page.getByText(/What kind of tasks/i).first()).toBeVisible({ timeout: 15_000 })
      await page.getByText('Team collaboration').click()

      // Turn 2: thinking steps
      await expect(page.getByText('Analyzing requirements')).toBeVisible({ timeout: 15_000 })

      // Turn 3: trigger plan
      const textarea = page.locator('textarea[name="message"]')
      await textarea.fill('Proceed')
      await textarea.press('Enter')
      await expect(page.getByText('TaskFlow', { exact: true })).toBeVisible({ timeout: 15_000 })

      // Turn 4: approve → start_generation (triggers /api/projects/generate mock)
      await page.getByRole('button', { name: /Approve & Generate/i }).click()
      await expect(
        page.getByText(/Plan approved|Generating|Generation Complete/i).first(),
      ).toBeVisible({ timeout: 30_000 })

      // Wait for mock generation to complete (textarea re-enabled)
      await expect(textarea).toBeEnabled({ timeout: 15_000 })

      // Turn 5: send edit instruction
      await textarea.fill('Add a dark mode toggle to the header')
      await textarea.press('Enter')

      // Should get mock edit_code tool response — shows reasoning and search queries
      await expect(page.getByText(/Editing code/i).first()).toBeVisible({ timeout: 15_000 })
    })
  })
})
