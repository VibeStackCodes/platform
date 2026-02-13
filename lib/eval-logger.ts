/**
 * Evaluation Logger
 *
 * Captures generation pipeline outcomes for the evaluation flywheel.
 * Logs build success/failure patterns, requirement pass rates, and
 * fix cycle data to enable systematic prompt improvement.
 *
 * Based on OpenAI Cookbook: "Building resilient prompts using an evaluation flywheel"
 *
 * Data is written to .eval-logs/ directory as JSONL files for easy
 * ingestion into the OpenAI Evals API or custom analysis pipelines.
 */

import pino from 'pino';
import { join } from 'path';
import type { Plan, BuildError, RequirementResult } from './types';

// ============================================================================
// Types
// ============================================================================

export interface EvalEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Unique generation run ID */
  runId: string;
  /** Event type for filtering */
  event: EvalEventType;
  /** Model used */
  model: string;
  /** Event-specific payload */
  data: Record<string, unknown>;
}

export type EvalEventType =
  | 'plan_generated'
  | 'file_generated'
  | 'build_attempt'
  | 'build_fix'
  | 'requirement_check'
  | 'generation_complete';

// ============================================================================
// Logger
// ============================================================================

const EVAL_DIR = join(process.cwd(), '.eval-logs');

const logger = pino({
  level: 'info',
  formatters: {
    level: () => ({}), // Remove pino's default level field
  },
  timestamp: false, // We'll add our own timestamp field
  transport: {
    target: 'pino-roll',
    options: {
      file: join(EVAL_DIR, 'evals'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      extension: '.jsonl',
      mkdir: true,
    },
  },
});

/**
 * Append an eval entry to today's JSONL log
 */
function logEntry(entry: EvalEntry): void {
  try {
    // Structure pino output to match the original JSONL format
    logger.info({
      timestamp: entry.timestamp,
      runId: entry.runId,
      event: entry.event,
      model: entry.model,
      data: entry.data,
    });
  } catch (error) {
    // Eval logging should never break the pipeline
    console.warn('Eval log write failed:', error);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Log a plan generation event
 */
export function logPlanGenerated(
  runId: string,
  model: string,
  plan: Plan,
  durationMs: number
): void {
  logEntry({
    timestamp: new Date().toISOString(),
    runId,
    event: 'plan_generated',
    model,
    data: {
      appName: plan.appName,
      fileCount: plan.files.length,
      requirementCount: plan.requirements.length,
      layerCount: new Set(plan.files.map(f => f.layer)).size,
      categories: Array.from(new Set(plan.requirements.map(r => r.category))),
      durationMs,
    },
  });
}

/**
 * Log a file generation event
 */
export function logFileGenerated(
  runId: string,
  model: string,
  filePath: string,
  layer: number,
  linesOfCode: number,
  durationMs: number
): void {
  logEntry({
    timestamp: new Date().toISOString(),
    runId,
    event: 'file_generated',
    model,
    data: {
      filePath,
      layer,
      linesOfCode,
      durationMs,
    },
  });
}

/**
 * Log a build attempt (pass or fail)
 */
export function logBuildAttempt(
  runId: string,
  model: string,
  attempt: number,
  passed: boolean,
  errors: BuildError[],
  durationMs: number
): void {
  logEntry({
    timestamp: new Date().toISOString(),
    runId,
    event: 'build_attempt',
    model,
    data: {
      attempt,
      passed,
      errorCount: errors.length,
      errorTypes: errors.map(e => {
        if (e.message.includes('Cannot find module')) return 'module_not_found';
        if (e.message.includes('TS2')) return 'type_error';
        if (e.message.includes('has no exported')) return 'import_error';
        return 'other';
      }),
      // Top 5 error messages for pattern analysis (truncated)
      topErrors: errors.slice(0, 5).map(e => ({
        file: e.file,
        message: e.message.slice(0, 200),
      })),
      durationMs,
    },
  });
}

/**
 * Log a build fix attempt
 */
export function logBuildFix(
  runId: string,
  model: string,
  filePath: string,
  attempt: number,
  errorCount: number,
  durationMs: number
): void {
  logEntry({
    timestamp: new Date().toISOString(),
    runId,
    event: 'build_fix',
    model,
    data: {
      filePath,
      attempt,
      errorCount,
      durationMs,
    },
  });
}

/**
 * Log requirement check results
 */
export function logRequirementCheck(
  runId: string,
  model: string,
  results: RequirementResult[]
): void {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  logEntry({
    timestamp: new Date().toISOString(),
    runId,
    event: 'requirement_check',
    model,
    data: {
      passed,
      total,
      passRate: total > 0 ? passed / total : 0,
      failedRequirements: results
        .filter(r => !r.passed)
        .map(r => ({
          id: r.requirementId,
          evidence: r.evidence.slice(0, 200),
          fixAttempted: r.fixAttempted,
        })),
    },
  });
}

/**
 * Log overall generation completion
 */
export function logGenerationComplete(
  runId: string,
  model: string,
  plan: Plan,
  buildPassed: boolean,
  buildAttempts: number,
  requirementResults: RequirementResult[],
  totalDurationMs: number
): void {
  const reqPassed = requirementResults.filter(r => r.passed).length;

  logEntry({
    timestamp: new Date().toISOString(),
    runId,
    event: 'generation_complete',
    model,
    data: {
      appName: plan.appName,
      fileCount: plan.files.length,
      requirementCount: plan.requirements.length,
      buildPassed,
      buildAttempts,
      requirementPassRate: requirementResults.length > 0
        ? reqPassed / requirementResults.length
        : null,
      totalDurationMs,
      // Summary score: build pass + requirement pass rate
      qualityScore: (buildPassed ? 0.5 : 0) +
        (requirementResults.length > 0
          ? 0.5 * (reqPassed / requirementResults.length)
          : 0),
    },
  });
}
