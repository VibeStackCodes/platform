#!/usr/bin/env tsx
/**
 * AppBench Evaluation Script
 *
 * Benchmarks the generation pipeline against 6 standard application types.
 * Measures plan quality, build success rate, and requirement coverage.
 */

import { generatePlan } from '../lib/planner';
import { generateFiles } from '../lib/generator';
import { verifyAndFix } from '../lib/verifier';
import { runPlaywrightCheck } from '../lib/requirement-check';
import { createSandbox, destroySandbox } from '../lib/sandbox';
import { createSupabaseProject, deleteSupabaseProject, setupSchema } from '../lib/supabase-mgmt';
import type { Plan, RequirementResult, StreamEvent } from '../lib/types';

// ============================================================================
// Benchmark Prompts
// ============================================================================

const BENCHMARK_PROMPTS = [
  {
    id: 'financial-dashboard',
    name: 'Financial Dashboard',
    prompt:
      'Build a personal finance dashboard with transaction tracking, budget management, and expense analytics. Users should be able to add transactions, categorize expenses, set budgets per category, and view spending charts over time.',
  },
  {
    id: 'social-media',
    name: 'Social Media App',
    prompt:
      'Create a social media platform where users can create profiles, post updates with images, follow other users, like and comment on posts, and see a personalized feed of content from people they follow.',
  },
  {
    id: 'project-management',
    name: 'Project Management Tool',
    prompt:
      'Build a project management tool with kanban boards, task assignments, due dates, and team collaboration. Users should be able to create projects, add tasks to columns, assign tasks to team members, set priorities, and track progress.',
  },
  {
    id: 'ecommerce',
    name: 'E-commerce Store',
    prompt:
      'Create an online store for selling products with shopping cart, checkout, and order management. Include product browsing with search and filters, product details pages, cart functionality, Stripe payment integration, and order history.',
  },
  {
    id: 'blog-platform',
    name: 'Blog Platform',
    prompt:
      'Build a blogging platform where users can write and publish articles with markdown support, add tags and categories, and allow readers to comment. Include a homepage feed, author profiles, article search, and admin content moderation.',
  },
  {
    id: 'weather-app',
    name: 'Weather App',
    prompt:
      'Create a weather forecast application that shows current conditions and 7-day forecasts for saved locations. Users should be able to search for cities, save favorite locations, view detailed weather metrics (temperature, humidity, wind), and see weather alerts.',
  },
];

// ============================================================================
// Benchmark Result Types
// ============================================================================

interface BenchmarkResult {
  promptId: string;
  promptName: string;
  planQuality: {
    fileCount: number;
    requirementCount: number;
    layerCount: number;
    allRequirementsCovered: boolean;
    validationPassed: boolean;
  };
  buildSuccess: boolean;
  requirementCoverage: {
    totalRequirements: number;
    passedRequirements: number;
    coveragePercent: number;
  };
  metrics: {
    planTime: number; // ms
    generationTime: number; // ms
    verificationTime: number; // ms
    totalTime: number; // ms
  };
  error?: string;
}

// ============================================================================
// Benchmark Execution
// ============================================================================

/**
 * Run benchmark for a single prompt
 */
async function runBenchmark(
  promptId: string,
  promptName: string,
  prompt: string,
  model: string = 'gpt-5.2'
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  let plan: Plan | null = null;
  let buildSuccess = false;
  let requirementResults: RequirementResult[] = [];

  // Event collector (for debugging)
  const events: StreamEvent[] = [];
  const emit = (event: StreamEvent) => events.push(event);

  try {
    // Stage 1: Planning
    console.log(`\n[$${promptId}] Stage 1: Planning...`);
    const planStartTime = Date.now();
    plan = await generatePlan(prompt, model);
    const planTime = Date.now() - planStartTime;

    const maxLayer = Math.max(...plan.files.map(f => f.layer));

    // Check if all requirements are covered
    const coveredRequirements = new Set<string>();
    plan.files.forEach(file => {
      file.requirements.forEach(reqId => coveredRequirements.add(reqId));
    });
    const allRequirementsCovered = plan.requirements.every(req =>
      coveredRequirements.has(req.id)
    );

    console.log(`  ✓ Plan generated: ${plan.files.length} files, ${plan.requirements.length} requirements`);

    // Stage 2: Provisioning
    console.log(`\n[${promptId}] Stage 2: Provisioning...`);
    const [supabaseProject, sandbox] = await Promise.all([
      createSupabaseProject(plan.appName),
      createSandbox({
        language: 'typescript',
        labels: {
          app: plan.appName,
          type: 'appbench-eval',
        },
      }),
    ]);

    console.log(`  ✓ Provisioned: Supabase ${supabaseProject.id}, Sandbox ${sandbox.id}`);

    try {
      // Stage 3: Setup
      console.log(`\n[${promptId}] Stage 3: Setup...`);
      const packageJson = {
        name: plan.appName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        version: '0.1.0',
        private: true,
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
        dependencies: plan.packageDeps,
      };

      const { initGeneratedApp } = await import('../lib/sandbox');
      await Promise.all([
        setupSchema(supabaseProject.id, plan.supabase),
        initGeneratedApp(
          sandbox,
          [
            {
              content: JSON.stringify(packageJson, null, 2),
              path: '/workspace/package.json',
            },
            {
              content: `NEXT_PUBLIC_SUPABASE_URL=${supabaseProject.url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseProject.anonKey}`,
              path: '/workspace/.env.local',
            },
          ],
          '/workspace'
        ),
      ]);

      console.log(`  ✓ Setup complete`);

      // Stage 4: Generation
      console.log(`\n[${promptId}] Stage 4: Generating files...`);
      const genStartTime = Date.now();
      const generatedFiles = await generateFiles(
        plan,
        sandbox,
        supabaseProject.url,
        supabaseProject.anonKey,
        model,
        emit
      );
      const generationTime = Date.now() - genStartTime;

      console.log(`  ✓ Generated ${generatedFiles.size} files`);

      // Stage 5: Build Verification
      console.log(`\n[${promptId}] Stage 5: Verifying build...`);
      const verifyStartTime = Date.now();
      buildSuccess = await verifyAndFix(sandbox, generatedFiles, model, emit);
      const verificationTime = Date.now() - verifyStartTime;

      console.log(`  ${buildSuccess ? '✓' : '✗'} Build ${buildSuccess ? 'passed' : 'failed'}`);

      // Stage 6: Requirement Verification (only if build succeeded)
      if (buildSuccess) {
        console.log(`\n[${promptId}] Stage 6: Verifying requirements...`);
        requirementResults = await runPlaywrightCheck(sandbox, plan, model, emit);
        console.log(`  ✓ ${requirementResults.filter(r => r.passed).length}/${requirementResults.length} requirements passed`);
      }

      const totalTime = Date.now() - startTime;

      // Clean up resources
      console.log(`\n[${promptId}] Cleaning up...`);
      await Promise.all([
        destroySandbox(sandbox),
        deleteSupabaseProject(supabaseProject.id),
      ]);

      return {
        promptId,
        promptName,
        planQuality: {
          fileCount: plan.files.length,
          requirementCount: plan.requirements.length,
          layerCount: maxLayer + 1,
          allRequirementsCovered,
          validationPassed: true,
        },
        buildSuccess,
        requirementCoverage: {
          totalRequirements: requirementResults.length,
          passedRequirements: requirementResults.filter(r => r.passed).length,
          coveragePercent: requirementResults.length > 0
            ? Math.round((requirementResults.filter(r => r.passed).length / requirementResults.length) * 100)
            : 0,
        },
        metrics: {
          planTime,
          generationTime,
          verificationTime,
          totalTime,
        },
      };
    } catch (error) {
      // Clean up on error
      console.error(`\n[${promptId}] Error during execution:`, error);
      await Promise.all([
        destroySandbox(sandbox).catch(() => {}),
        deleteSupabaseProject(supabaseProject.id).catch(() => {}),
      ]);
      throw error;
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    return {
      promptId,
      promptName,
      planQuality: plan
        ? {
            fileCount: plan.files.length,
            requirementCount: plan.requirements.length,
            layerCount: Math.max(...plan.files.map(f => f.layer)) + 1,
            allRequirementsCovered: false,
            validationPassed: false,
          }
        : {
            fileCount: 0,
            requirementCount: 0,
            layerCount: 0,
            allRequirementsCovered: false,
            validationPassed: false,
          },
      buildSuccess: false,
      requirementCoverage: {
        totalRequirements: requirementResults.length,
        passedRequirements: 0,
        coveragePercent: 0,
      },
      metrics: {
        planTime: 0,
        generationTime: 0,
        verificationTime: 0,
        totalTime,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Summary Table Generation
// ============================================================================

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function printSummaryTable(results: BenchmarkResult[]) {
  console.log('\n');
  console.log('═'.repeat(120));
  console.log('AppBench Evaluation Summary');
  console.log('═'.repeat(120));
  console.log('');

  // Table header
  console.log(
    '| ' +
      'App Type'.padEnd(20) +
      ' | ' +
      'Files'.padEnd(6) +
      ' | ' +
      'Reqs'.padEnd(5) +
      ' | ' +
      'Layers'.padEnd(7) +
      ' | ' +
      'Build'.padEnd(6) +
      ' | ' +
      'Coverage'.padEnd(9) +
      ' | ' +
      'Total Time'.padEnd(11) +
      ' |'
  );
  console.log('|' + '─'.repeat(118) + '|');

  // Table rows
  for (const result of results) {
    const buildStatus = result.buildSuccess ? '✓ Pass' : '✗ Fail';
    const coverage = result.buildSuccess
      ? `${result.requirementCoverage.passedRequirements}/${result.requirementCoverage.totalRequirements} (${result.requirementCoverage.coveragePercent}%)`
      : 'N/A';

    console.log(
      '| ' +
        result.promptName.padEnd(20) +
        ' | ' +
        String(result.planQuality.fileCount).padEnd(6) +
        ' | ' +
        String(result.planQuality.requirementCount).padEnd(5) +
        ' | ' +
        String(result.planQuality.layerCount).padEnd(7) +
        ' | ' +
        buildStatus.padEnd(6) +
        ' | ' +
        coverage.padEnd(9) +
        ' | ' +
        formatTime(result.metrics.totalTime).padEnd(11) +
        ' |'
    );

    if (result.error) {
      console.log('|   Error: ' + result.error.slice(0, 100) + '...');
    }
  }

  console.log('|' + '─'.repeat(118) + '|');
  console.log('');

  // Aggregate metrics
  const successRate = (results.filter(r => r.buildSuccess).length / results.length) * 100;
  const avgCoverage =
    results
      .filter(r => r.buildSuccess)
      .reduce((sum, r) => sum + r.requirementCoverage.coveragePercent, 0) /
    (results.filter(r => r.buildSuccess).length || 1);
  const avgTime =
    results.reduce((sum, r) => sum + r.metrics.totalTime, 0) / results.length;

  console.log('Aggregate Metrics:');
  console.log(`  • Build Success Rate: ${successRate.toFixed(1)}% (${results.filter(r => r.buildSuccess).length}/${results.length})`);
  console.log(`  • Average Requirement Coverage: ${avgCoverage.toFixed(1)}%`);
  console.log(`  • Average Total Time: ${formatTime(avgTime)}`);
  console.log('');
  console.log('═'.repeat(120));
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('Starting AppBench Evaluation...\n');
  console.log(`Benchmarking ${BENCHMARK_PROMPTS.length} application types\n`);

  const results: BenchmarkResult[] = [];

  for (const benchmark of BENCHMARK_PROMPTS) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Running benchmark: ${benchmark.name}`);
    console.log('='.repeat(80));

    const result = await runBenchmark(
      benchmark.id,
      benchmark.name,
      benchmark.prompt
    );
    results.push(result);

    console.log(`\n✓ Benchmark "${benchmark.name}" complete`);
  }

  // Print summary
  printSummaryTable(results);

  // Exit with appropriate code
  const allPassed = results.every(r => r.buildSuccess);
  process.exit(allPassed ? 0 : 1);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
