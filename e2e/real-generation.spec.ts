import { test, expect } from '@playwright/test';

/**
 * Real E2E Generation Test
 *
 * Full pipeline: sign up → chat (GPT-5.2) → plan → approve → generate
 * Uses real APIs: OpenAI GPT-5.2, Daytona sandbox, Supabase provisioning
 *
 * Requirements:
 * - NEXT_PUBLIC_MOCK_MODE=false
 * - All API keys set in .env.local
 * - Supabase staging has auto-confirm enabled
 */

// 15 minute timeout — real generation takes several minutes
test.setTimeout(900_000);

const MODEL = 'gpt-5.2';

const HOSPITAL_PROMPT = `Build a hospital bed management dashboard with 3 user roles: Administrator, Nurse, and Physician. Administrators can see all wards, manage staff assignments, and view hospital-wide analytics. Nurses can only see their assigned ward, update bed status (available, occupied, cleaning, maintenance), and chat with other nurses in real-time. Physicians can see their patients across wards, add clinical notes, and receive emergency alert banners when bed capacity drops below 20%. Include: user authentication with role selection at signup, a real-time presence indicator showing who's currently online, a live bed occupancy grid that updates instantly when any user changes a bed status, private real-time messaging between staff, and a notification bell for urgent alerts. Use a clean, professional healthcare aesthetic — think soft blues, clear data hierarchy, proper spacing. Make it responsive for tablets since nurses use iPads at bedside.`;

test.describe('Real Generation Pipeline', () => {
  test('full flow: sign up → chat → plan → generate', async ({ page }) => {
    const testEmail = `e2e-${Date.now()}@test.vibestack.dev`;
    const testPassword = 'TestPass123!';

    // Intercept ALL /api/chat and /api/projects/generate calls to force GPT-5.2
    await page.route('**/api/chat', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        body.model = MODEL;
        await route.continue({ postData: JSON.stringify(body) });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/projects/generate', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = JSON.parse(request.postData() || '{}');
        body.model = MODEL;
        await route.continue({ postData: JSON.stringify(body) });
      } else {
        await route.continue();
      }
    });

    // Collect console errors for debugging
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // ================================================================
    // Step 1: Landing page — enter prompt
    // ================================================================
    await test.step('Enter prompt on landing page', async () => {
      await page.goto('/');
      await expect(page.getByText('Build apps with AI')).toBeVisible();

      const textarea = page.locator('textarea[name="message"]');
      await expect(textarea).toBeVisible();
      await textarea.fill(HOSPITAL_PROMPT);
      await textarea.press('Enter');

      // Should redirect to auth/login (not logged in)
      await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
    });

    // ================================================================
    // Step 2: Sign up with auto-confirm
    // ================================================================
    await test.step('Sign up new user', async () => {
      await page.locator('button', { hasText: /^Sign Up$/ }).click();
      await expect(page.getByText('Create Account')).toBeVisible();

      await page.locator('#email').fill(testEmail);
      await page.locator('#password').fill(testPassword);
      await page.locator('button[type="submit"]').click();

      // Auto-confirm → redirect to /project/:id
      await expect(page).toHaveURL(/\/project\//, { timeout: 15_000 });
      console.log('Signed up and redirected to project page');
    });

    // ================================================================
    // Step 3: Wait for AI response (clarifying question)
    // ================================================================
    await test.step('Wait for AI clarifying question (GPT-5.2)', async () => {
      // Auto-submit fires on mount. Route intercept forces model=gpt-5.2.
      // Wait for either: chat error div OR an assistant message (class .is-assistant)
      const chatError = page.locator('[data-testid="chat-error"]');
      const assistantMsg = page.locator('.is-assistant').first();

      await expect(chatError.or(assistantMsg)).toBeVisible({ timeout: 120_000 });

      if (await chatError.isVisible()) {
        const errorText = await chatError.textContent();
        console.error('Chat error:', errorText);
        console.error('Console errors:', consoleErrors);
        throw new Error(`Chat API failed: ${errorText}`);
      }

      console.log('AI responded');
      await page.screenshot({ path: 'test-results/ai-response.png', fullPage: true });
    });

    // ================================================================
    // Step 3.5: Verify chat persistence across reload
    // ================================================================
    await test.step('Verify chat persistence survives reload', async () => {
      // Count messages before reload
      const msgCountBefore = await page.locator('.is-assistant, .is-user').count();
      console.log(`Messages before reload: ${msgCountBefore}`);
      expect(msgCountBefore).toBeGreaterThan(0);

      // Wait for persistence POST to complete (fires on status transition)
      await page.waitForTimeout(2000);

      // Reload the page
      await page.reload({ waitUntil: 'networkidle' });

      // Messages should be restored from DB
      const restoredMessages = page.locator('.is-assistant, .is-user');
      await expect(restoredMessages.first()).toBeVisible({ timeout: 15_000 });

      const msgCountAfter = await restoredMessages.count();
      console.log(`Messages after reload: ${msgCountAfter}`);
      expect(msgCountAfter).toBe(msgCountBefore);

      await page.screenshot({ path: 'test-results/after-reload-persistence.png', fullPage: true });
      console.log('Chat persistence verified!');
    });

    // ================================================================
    // Step 4: Answer clarifying question → trigger plan
    // ================================================================
    await test.step('Answer questions until plan appears', async () => {
      // GPT-5.2 should skip questions for detailed prompts and go straight to plan.
      // Strategy: wait for either the Approve button (plan ready) or suggestion buttons
      // (clarifying question). If neither appears within 120s, the AI is probably
      // generating thinking_steps → show_plan which takes time for complex prompts.

      const approveBtn = page.getByRole('button', { name: /Approve & Generate/i }).last();
      const suggestionBtn = page.locator('[data-testid="suggestion-button"]').first();

      // First, wait for either plan or a suggestion button (clarifying question)
      console.log('Waiting for plan or clarifying question...');

      // Take periodic screenshots while waiting
      const screenshotInterval = setInterval(async () => {
        const ts = Date.now();
        await page.screenshot({ path: `test-results/waiting-${ts}.png`, fullPage: true }).catch(() => {});
        const pageText = await page.locator('.is-assistant').last().textContent().catch(() => 'N/A');
        console.log(`[${new Date().toISOString()}] Page state: ${pageText?.slice(0, 100)}...`);
      }, 15_000);

      try {
        await expect(approveBtn.or(suggestionBtn)).toBeVisible({ timeout: 180_000 });
      } finally {
        clearInterval(screenshotInterval);
      }

      if (await approveBtn.isVisible().catch(() => false)) {
        console.log('Plan appeared without clarifying questions');
      } else {
        // Got a clarifying question — answer it, then wait for plan
        const text = await suggestionBtn.textContent();
        console.log(`Answering clarifying question: clicking "${text?.slice(0, 60)}..."`);
        await suggestionBtn.click();

        // Now wait for the plan (AI will go through thinking_steps → show_plan)
        console.log('Waiting for plan after answering question...');
        await expect(approveBtn).toBeVisible({ timeout: 180_000 });
      }

      console.log('Plan card visible');
    });

    // ================================================================
    // Step 5: Verify plan card content
    // ================================================================
    await test.step('Verify plan card', async () => {
      await expect(page.getByText(/Features \(/)).toBeVisible({ timeout: 30_000 });

      await page.screenshot({ path: 'test-results/plan-card.png', fullPage: true });
    });

    // ================================================================
    // Step 6: Approve plan → trigger generation
    // ================================================================
    await test.step('Approve and generate', async () => {
      await page.getByRole('button', { name: /Approve & Generate/i }).last().click();

      // ConfirmationAccepted shows approval state
      await expect(
        page.getByText(/Plan approved|generating/i).first()
      ).toBeVisible({ timeout: 10_000 });

      console.log('Generation started');
    });

    // ================================================================
    // Step 7: Watch generation queue
    // ================================================================
    await test.step('Watch generation queue', async () => {
      // Wait for at least one file to show in the queue
      // Queue items show file paths — wait for any path-like text in the queue area
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'test-results/generation-started.png', fullPage: true });

      // Wait for first file to complete (shows line count)
      await expect(
        page.getByText(/\(\d+ lines\)/).first()
      ).toBeVisible({ timeout: 300_000 });

      console.log('First file completed');
      await page.screenshot({ path: 'test-results/generation-progress.png', fullPage: true });
    });

    // ================================================================
    // Step 8: Wait for completion
    // ================================================================
    await test.step('Wait for generation complete', async () => {
      // The pipeline emits checkpoints + layer commits. Wait for the git commit message
      // which appears at the end of the pipeline, or "Build verification" checkpoint.
      await expect(
        page.getByText(/feat: generate app from templates|Build verification/i).first()
      ).toBeVisible({ timeout: 600_000 });

      console.log('Generation complete!');
    });

    // ================================================================
    // Step 9: Final assertions
    // ================================================================
    await test.step('Verify final state', async () => {
      const completedFiles = page.getByText(/\(\d+ lines\)/);
      const count = await completedFiles.count();
      console.log(`Completed files: ${count}`);
      expect(count).toBeGreaterThan(0);

      await page.screenshot({ path: 'test-results/generation-complete.png', fullPage: true });

      if (consoleErrors.length > 0) {
        console.warn('Console errors during test:', consoleErrors);
      }
    });
  });
});
