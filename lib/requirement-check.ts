import { generateText } from 'ai';
import type { Sandbox } from '@daytonaio/sdk';
import type { Plan, RequirementResult, StreamEvent } from './types';
import { runCommand, uploadFile } from './sandbox';
import { resolveModel } from './models';
import { getOpenAIClient, FAST_MODEL, FIX_MODEL, REASONING_PRESETS, isOpenAIModel } from './openai-client';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { PlaywrightTestSchema } from './schemas';

/**
 * Playwright Requirement Checker Module
 *
 * Verifies that generated apps meet all specified requirements using Playwright E2E tests.
 * - Generates Playwright test from plan
 * - Installs Playwright and runs tests in sandbox
 * - Parses test results and attempts fixes
 */

// ============================================================================
// Test Generation
// ============================================================================

/**
 * Generate a Playwright test file from the plan
 *
 * Creates an E2E test that verifies each verifiable requirement in the plan.
 * Uses role-based locators and follows Playwright best practices.
 */
export async function generatePlaywrightTest(plan: Plan, model: string): Promise<string> {
  const verifiableRequirements = plan.requirements.filter(req => req.verifiable);

  const prompt = `Generate a Playwright E2E test file to verify the following requirements for "${plan.appName}".

APP DESCRIPTION: ${plan.appDescription}

REQUIREMENTS TO VERIFY:
${verifiableRequirements.map((req, i) => `${i + 1}. [${req.category}] ${req.description}`).join('\n')}

DESIGN CONTEXT:
- App has ${plan.files.length} files
- Primary color: ${plan.designTokens.primaryColor}
- Uses shadcn/ui components
- Supabase auth and data
- Next.js 16 App Router

INSTRUCTIONS:
1. Create a single test file that verifies ALL requirements
2. Use role-based locators (getByRole, getByLabel, getByText)
3. Test user-visible behavior, not implementation details
4. Include auth setup if needed (assume test@example.com / testpass123)
5. Use auto-waiting assertions (expect().toBeVisible(), etc.)
6. Group related tests in describe blocks by category
7. Base URL will be http://localhost:3000
8. Do NOT use CSS selectors or XPath
9. Include proper error messages for failures

OUTPUT:
- Return ONLY the TypeScript test file content
- No markdown fences, no explanations
- Use @playwright/test imports
- Follow Playwright best practices from the skill

TEST FILE CONTENT:`;

  try {
    // Use OpenAI structured outputs when available
    if (isOpenAIModel(model)) {
      const client = getOpenAIClient();
      const response = await client.responses.parse({
        model: FAST_MODEL,
        instructions: 'Generate a Playwright E2E test file. Return the complete TypeScript test file content.',
        input: [{ role: 'user', content: prompt }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAI SDK types don't expose zodTextFormat format shape
        text: { format: zodTextFormat(PlaywrightTestSchema, 'playwright_test') } as any,
        reasoning: { effort: REASONING_PRESETS.testgen },
      });

      const parsed = response.output_parsed as z.infer<typeof PlaywrightTestSchema> | null;
      if (parsed) {
        console.log(`✓ Generated Playwright test: ${parsed.testCount} tests covering ${parsed.requirementsCovered.length} requirements`);
        return parsed.testFileContent;
      }

      // Fallback if parsing failed
      console.warn('Structured output parsing failed, falling back to text extraction');
      const textOutput = response.output.find(item => item.type === 'message');
      if (textOutput && textOutput.type === 'message') {
        const textContent = textOutput.content.find(c => c.type === 'output_text');
        if (textContent && textContent.type === 'output_text') {
          return textContent.text;
        }
      }
      throw new Error('No text output found in response');
    }

    // Fallback to AI SDK for non-OpenAI models
    const { text } = await generateText({
      model: resolveModel(model),
      prompt,
      maxOutputTokens: 8000,
      temperature: 0.5,
    });

    let testContent = text.trim();

    // Strip markdown fences if present
    if (testContent.startsWith('```')) {
      testContent = testContent.replace(/^```(?:typescript|ts)?\s*\n/, '');
      testContent = testContent.replace(/\n```\s*$/, '');
    }

    console.log('✓ Generated Playwright test file');
    return testContent;
  } catch (error) {
    throw new Error(`Failed to generate test: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Test Execution
// ============================================================================

/**
 * Run Playwright requirement checks in the sandbox
 *
 * Process:
 * 1. Install Playwright with dependencies
 * 2. Upload generated test file
 * 3. Create minimal playwright.config.ts
 * 4. Run tests with JSON reporter
 * 5. Parse results and return requirement status
 */
export async function runPlaywrightCheck(
  sandbox: Sandbox,
  plan: Plan,
  model: string,
  emit: (event: StreamEvent) => void
): Promise<RequirementResult[]> {
  try {
    console.log('\n=== Playwright Requirement Check ===');

    // 1. Generate test file
    emit({ type: 'stage_update', stage: 'verifying_requirements' });
    const testContent = await generatePlaywrightTest(plan, model);

    // 2. Install Playwright
    console.log('Installing Playwright...');
    await runCommand(
      sandbox,
      'bun install -D @playwright/test && bunx playwright install chromium --with-deps',
      'playwright-install',
      { cwd: '/workspace', timeout: 300 }
    );

    // 3. Upload test file
    await uploadFile(sandbox, testContent, '/workspace/e2e/requirements.spec.ts');
    console.log('✓ Uploaded test file');

    // 4. Create Playwright config
    const config = createPlaywrightConfig();
    await uploadFile(sandbox, config, '/workspace/playwright.config.ts');
    console.log('✓ Created Playwright config');

    // 5. Run tests with JSON reporter
    console.log('Running Playwright tests...');
    const testResult = await runCommand(
      sandbox,
      'npx playwright test --reporter=json > test-results.json || true',
      'playwright-test',
      { cwd: '/workspace', timeout: 180 }
    );

    // 6. Download and parse results
    const resultsBuffer = await sandbox.fs.downloadFile('/workspace/test-results.json');
    const resultsJson = resultsBuffer.toString();
    const results = parsePlaywrightResults(resultsJson, plan);

    // Emit individual results
    results.forEach(result => {
      emit({ type: 'requirement_result', result });
    });

    const passCount = results.filter(r => r.passed).length;
    console.log(`\n✓ Requirements check complete: ${passCount}/${results.length} passed`);

    return results;
  } catch (error) {
    console.error('Playwright check failed:', error);
    // Return all requirements as failed with error
    return plan.requirements
      .filter(req => req.verifiable)
      .map(req => ({
        requirementId: req.id,
        passed: false,
        evidence: `Playwright check failed: ${error instanceof Error ? error.message : String(error)}`,
        fixAttempted: false,
      }));
  }
}

// ============================================================================
// Requirement Fixing
// ============================================================================

/**
 * Attempt to fix files based on requirement test failures
 *
 * Uses Claude to regenerate files that may be causing requirement failures.
 * Includes test failure evidence in the prompt.
 */
export async function attemptRequirementFix(
  sandbox: Sandbox,
  plan: Plan,
  generatedContents: Map<string, string>,
  failedResults: RequirementResult[],
  model: string,
  emit: (event: StreamEvent) => void
): Promise<void> {
  // Group failed requirements by likely file
  const failuresByFile = groupFailuresByFile(plan, failedResults);

  for (const [filePath, failures] of Object.entries(failuresByFile)) {
    const originalContent = generatedContents.get(filePath);
    if (!originalContent) {
      console.warn(`Cannot fix ${filePath}: original content not found`);
      continue;
    }

    try {
      console.log(`Fixing ${filePath} for requirement failures...`);

      const failureSummary = failures
        .map(f => `  - ${f.description}: ${f.evidence}`)
        .join('\n');

      const prompt = `Fix the following file to satisfy failed requirements.

FILE: ${filePath}

FAILED REQUIREMENTS:
${failureSummary}

CURRENT FILE CONTENT:
\`\`\`typescript
${originalContent}
\`\`\`

INSTRUCTIONS:
1. Analyze the failed requirements and test evidence
2. Fix the file to satisfy ALL failed requirements
3. Do NOT break existing functionality
4. Preserve code style and structure
5. Return ONLY the fixed file content (no markdown fences, no explanations)

FIXED FILE CONTENT:`;

      let fixedContent: string;

      // Use OpenAI API when available for better reasoning
      if (isOpenAIModel(model)) {
        const client = getOpenAIClient();
        const response = await client.responses.create({
          model: FIX_MODEL,
          instructions: 'Fix the file to satisfy failed requirements. Return ONLY the fixed file content.',
          input: [{ role: 'user', content: prompt }],
          reasoning: { effort: REASONING_PRESETS.fixing },
        });

        // Extract text from response
        const rawText = response.output_text;
        if (!rawText || rawText.trim().length === 0) {
          throw new Error('No text content found in requirement fix response');
        }
        fixedContent = rawText.trim();
      } else {
        // Fallback to AI SDK for non-OpenAI models
        const { text } = await generateText({
          model: resolveModel(model),
          prompt,
          maxOutputTokens: 8000,
          temperature: 0.3,
        });

        fixedContent = text.trim();

        // Strip markdown fences if present
        if (fixedContent.startsWith('```')) {
          fixedContent = fixedContent.replace(/^```(?:typescript|tsx|jsx|javascript)?\s*\n/, '');
          fixedContent = fixedContent.replace(/\n```\s*$/, '');
        }
      }

      // Update and upload
      generatedContents.set(filePath, fixedContent);
      await sandbox.fs.uploadFile(Buffer.from(fixedContent), `/workspace/${filePath}`);

      console.log(`✓ Fixed ${filePath}`);

      // Mark requirement fixes as attempted
      failures.forEach(failure => {
        const result = failedResults.find(r => r.requirementId === failure.id);
        if (result) {
          result.fixAttempted = true;
        }
      });
    } catch (error) {
      console.error(`Failed to fix ${filePath}:`, error);
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create Playwright configuration
 */
function createPlaywrightConfig(): string {
  return `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'json',
  timeout: 30000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {},
    },
  ],

  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
`;
}

// Playwright JSON report types (subset)
interface PlaywrightTestEntry { status: string; error?: { message?: string } }
interface PlaywrightSpec { title: string; tests: PlaywrightTestEntry[] }
interface PlaywrightSuite { specs: PlaywrightSpec[] }
interface PlaywrightReport { suites?: PlaywrightSuite[] }

/**
 * Parse Playwright JSON results
 */
function parsePlaywrightResults(jsonOutput: string, plan: Plan): RequirementResult[] {
  try {
    const results: PlaywrightReport = JSON.parse(jsonOutput);
    const testResults: RequirementResult[] = [];

    // Map test titles to requirement IDs
    const requirementMap = new Map(
      plan.requirements.map(req => [req.description, req.id])
    );

    // Parse test results
    if (results.suites && results.suites.length > 0) {
      results.suites.forEach((suite) => {
        suite.specs.forEach((spec) => {
          const testTitle = spec.title;
          const passed = spec.tests.every((test) => test.status === 'passed');

          // Try to match test title to requirement
          let requirementId = '';
          for (const [reqDesc, reqId] of requirementMap) {
            if (testTitle.toLowerCase().includes(reqDesc.toLowerCase().substring(0, 20))) {
              requirementId = reqId;
              break;
            }
          }

          if (!requirementId) {
            // Use generic ID if no match
            requirementId = `req-${testResults.length + 1}`;
          }

          const evidence = passed
            ? 'Test passed'
            : spec.tests
                .filter((test) => test.status === 'failed')
                .map((test) => test.error?.message || 'Test failed')
                .join('; ');

          testResults.push({
            requirementId,
            passed,
            evidence,
            fixAttempted: false,
          });
        });
      });
    }

    return testResults;
  } catch (error) {
    console.error('Failed to parse Playwright results:', error);
    return [];
  }
}

/**
 * Group failed requirements by likely file
 *
 * Maps requirement categories to likely file patterns.
 */
function groupFailuresByFile(
  plan: Plan,
  failedResults: RequirementResult[]
): Record<string, Array<{ id: string; description: string; evidence: string }>> {
  const grouped: Record<string, Array<{ id: string; description: string; evidence: string }>> = {};

  failedResults.forEach(result => {
    const requirement = plan.requirements.find(r => r.id === result.requirementId);
    if (!requirement) return;

    // Find files that address this requirement
    const relatedFiles = plan.files.filter(file =>
      file.requirements.includes(result.requirementId)
    );

    // Add to each related file
    relatedFiles.forEach(file => {
      if (!grouped[file.path]) {
        grouped[file.path] = [];
      }
      grouped[file.path].push({
        id: result.requirementId,
        description: requirement.description,
        evidence: result.evidence,
      });
    });
  });

  return grouped;
}
