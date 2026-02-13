# E2E Deploy + Edit Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add E2E tests for deploy-to-Vercel and edit/iterate flows in both mock and real modes.

**Architecture:** Extend existing test files with new steps. Mock tests use Playwright route interception to stub API responses. Real tests hit live APIs. Playwright config gets named projects (`mock`/`real`) with separate `testMatch` patterns. Package.json gets convenience scripts.

**Tech Stack:** Playwright, Next.js, Vercel API, Anthropic API, Daytona SDK

---

### Task 1: Add Playwright projects and npm scripts

**Files:**
- Modify: `playwright.config.ts`
- Modify: `package.json` (scripts section)

**Step 1: Update playwright.config.ts**

Replace the single `projects` array with named projects:

```ts
projects: [
  {
    name: 'mock',
    testMatch: /full-flow/,
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'real',
    testMatch: /real-generation/,
    use: { ...devices['Desktop Chrome'] },
  },
],
```

**Step 2: Add npm scripts to package.json**

Add to the `"scripts"` section:

```json
"test:e2e": "playwright test",
"test:e2e:mock": "playwright test --project=mock",
"test:e2e:real": "playwright test --project=real"
```

**Step 3: Commit**

```bash
git add playwright.config.ts package.json
git commit -m "chore: add Playwright mock/real projects and e2e scripts"
```

---

### Task 2: Extend mock chat to handle post-generation turns

**Files:**
- Modify: `app/api/chat/route.ts` — `buildMockChatResponse` function (around line 109)

**Step 1: Update the mock response handler**

In `buildMockChatResponse`, change the `else` block (turn 4+) to differentiate between turn 4 (start_generation) and turn 5+ (edit response):

```ts
} else if (turnNumber === 4) {
  streamResult = toolCallStreamResult('mock-gen', 'start_generation', { approved: true });
} else {
  // Turn 5+: simulate edit response as plain text
  const mockModel = new MockLanguageModelV3({
    doStream: {
      stream: new ReadableStream({
        async start(controller) {
          const text = "I've updated 2 files based on your instruction: `src/components/header.tsx` and `src/index.css`. The changes have been applied and the build verified successfully.";
          controller.enqueue({ type: 'text-delta', textDelta: text });
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0 } });
          controller.close();
        },
      }),
    },
  });

  const result = streamText({
    model: mockModel,
    messages: [{ role: 'user', content: 'mock' }],
    tools: chatTools,
    maxOutputTokens: 4096,
  });

  return result.toUIMessageStreamResponse();
}
```

**Step 2: Verify mock mode still works**

Run: `pnpm build` (ensure no type errors)

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: extend mock chat to handle post-generation edit turns"
```

---

### Task 3: Add mock deploy + edit tests to full-flow.spec.ts

**Files:**
- Modify: `e2e/full-flow.spec.ts`

**Step 1: Add deploy button mock test**

Add a new test section after "Builder Preview Panels":

```ts
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
      });
    });

    await page.goto('/project/mock-deploy-test');
    await waitForHydration(page);

    // Click deploy button
    const deployBtn = page.getByRole('button', { name: /Deploy/i });
    await expect(deployBtn).toBeVisible({ timeout: 10_000 });

    // Listen for the API call
    const deployPromise = page.waitForResponse('**/api/projects/deploy');
    await deployBtn.click();

    const response = await deployPromise;
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.deployUrl).toMatch(/\.vibestack\.site$/);
  });
});
```

**Step 2: Add edit flow mock test**

```ts
// =========================================================================
// 8. Edit/Iterate (mock)
// =========================================================================

test.describe('Edit/Iterate (mock)', () => {
  test('post-generation edit returns mock response', async ({ page }) => {
    await page.goto('/project/mock-edit-test');
    await waitForHydration(page);

    // Navigate through mock flow: question → thinking → plan → approve → edit
    // Turn 1: clarifying question
    await expect(page.getByText(/What kind of tasks/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText('Team collaboration').click();

    // Turn 2: thinking steps
    await expect(page.getByText('Analyzing requirements')).toBeVisible({ timeout: 15_000 });

    // Turn 3: trigger plan
    const textarea = page.locator('textarea[name="message"]');
    await textarea.fill('Proceed');
    await textarea.press('Enter');
    await expect(page.getByText('TaskFlow', { exact: true })).toBeVisible({ timeout: 15_000 });

    // Turn 4: approve → start_generation
    await page.getByRole('button', { name: /Approve & Generate/i }).click();
    await expect(
      page.getByText(/Plan approved|Generating|Generation Complete/i).first()
    ).toBeVisible({ timeout: 30_000 });

    // Turn 5: send edit instruction
    await textarea.fill('Add a dark mode toggle to the header');
    await textarea.press('Enter');

    // Should get mock edit response
    await expect(
      page.getByText(/updated 2 files/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
```

**Step 3: Run mock tests**

Run: `pnpm exec playwright test --project=mock`
Expected: All existing + new tests pass

**Step 4: Commit**

```bash
git add e2e/full-flow.spec.ts
git commit -m "test: add mock deploy button and edit flow E2E tests"
```

---

### Task 4: Add real deploy + edit + dashboard tests to real-generation.spec.ts

**Files:**
- Modify: `e2e/real-generation.spec.ts`

**Step 1: Add Step 10 — Deploy to Vercel**

After the existing "Verify final state" step (step 9), add:

```ts
// ================================================================
// Step 10: Deploy to Vercel with custom domain
// ================================================================
await test.step('Deploy to Vercel', async () => {
  // Capture the deploy API response
  const deployResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/projects/deploy') && resp.status() === 200
  );

  // Click Deploy button
  const deployBtn = page.getByRole('button', { name: /Deploy/i });
  await expect(deployBtn).toBeVisible({ timeout: 10_000 });
  await deployBtn.click();

  console.log('Deploy triggered, waiting for completion...');

  // Wait for deploy response (up to 5 minutes)
  const deployResponse = await deployResponsePromise;
  const deployData = await deployResponse.json();

  console.log('Deploy response:', deployData);
  expect(deployData.success).toBe(true);
  expect(deployData.deployUrl).toBeTruthy();

  // Verify custom domain pattern
  expect(deployData.deployUrl).toMatch(/https:\/\/[\w-]+\.vibestack\.site/);

  // Verify deployed site is reachable
  const siteResponse = await fetch(deployData.deployUrl);
  console.log(`Deployed site status: ${siteResponse.status}`);
  expect(siteResponse.status).toBe(200);

  await page.screenshot({ path: 'test-results/deployed.png', fullPage: true });
  console.log(`Deployed successfully: ${deployData.deployUrl}`);
});
```

**Step 2: Add Step 11 — Edit/Iterate**

```ts
// ================================================================
// Step 11: Edit/Iterate on generated code
// ================================================================
await test.step('Edit generated code', async () => {
  const textarea = page.locator('textarea[name="message"]');
  await textarea.fill('Change the primary color scheme to use green instead of blue');
  await textarea.press('Enter');

  console.log('Edit instruction sent, waiting for AI response...');

  // Wait for assistant response mentioning file modifications
  await expect(
    page.locator('.is-assistant').last()
  ).toBeVisible({ timeout: 300_000 });

  // Wait for the response to finish streaming
  await page.waitForTimeout(5000);

  const lastMessage = await page.locator('.is-assistant').last().textContent();
  console.log('Edit response:', lastMessage?.slice(0, 200));

  await page.screenshot({ path: 'test-results/post-edit.png', fullPage: true });
  console.log('Edit completed');
});
```

**Step 3: Add Step 12 — Verify Dashboard**

```ts
// ================================================================
// Step 12: Verify project on dashboard
// ================================================================
await test.step('Verify project on dashboard', async () => {
  await page.goto('/dashboard');

  // Wait for projects to load
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible({ timeout: 15_000 });

  // Should see at least one project card (not empty state)
  await expect(page.getByText('No projects yet')).not.toBeVisible({ timeout: 5_000 });

  // Verify a project card exists
  const projectCards = page.locator('[class*="card"], [class*="Card"]').filter({
    hasNot: page.getByText('No projects yet'),
  });
  const count = await projectCards.count();
  console.log(`Dashboard shows ${count} project(s)`);
  expect(count).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/dashboard-final.png', fullPage: true });
});
```

**Step 4: Commit**

```bash
git add e2e/real-generation.spec.ts
git commit -m "test: add real deploy, edit, and dashboard E2E tests"
```

---

### Task 5: Final verification and push

**Step 1: Type check**

Run: `pnpm build`
Expected: No errors

**Step 2: Run mock tests**

Run: `pnpm test:e2e:mock`
Expected: All mock tests pass

**Step 3: Commit any fixes**

If any fixes were needed, commit them.

**Step 4: Push**

```bash
git push origin main
```

Note: Real tests (`pnpm test:e2e:real`) require a running app with real API keys and take 15+ minutes. Run manually when ready.
