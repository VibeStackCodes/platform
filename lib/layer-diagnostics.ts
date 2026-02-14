import type { Sandbox } from '@daytonaio/sdk';
import { runCommand } from './sandbox';

/**
 * Per-Layer Diagnostics
 *
 * Runs `tsc --noEmit` + `oxlint` in the sandbox after each generation layer.
 * Filters out errors in not-yet-written files so only actionable errors
 * in already-generated code are surfaced.
 *
 * Note: Commands run in a remote Daytona sandbox (isolated container),
 * not on the local machine. runCommand() uses Daytona's session API.
 */

// ============================================================================
// Types
// ============================================================================

export interface DiagnosticError {
  file: string;
  line: number;
  column: number;
  code: string;       // "TS2322" or "oxlint/no-unused-vars"
  message: string;
  source: 'tsc' | 'oxlint';
  severity: 'error' | 'warning';
}

export interface LayerDiagnosticResult {
  errors: DiagnosticError[];
  errorsByFile: Map<string, DiagnosticError[]>;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
}

// ============================================================================
// Parsers
// ============================================================================

/** Parse tsc --noEmit output: file(line,col): error TSxxxx: message */
const TSC_PATTERN = /([\w\/.-]+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/g;

/** Parse oxlint --format unix output: file:line:col: message [rule] */
const OXLINT_PATTERN = /([\w\/.-]+):(\d+):(\d+):\s*(.+?)\s*\[(\S+)\]/g;

function parseTscOutput(output: string): DiagnosticError[] {
  const errors: DiagnosticError[] = [];
  let match;

  // Reset regex state
  TSC_PATTERN.lastIndex = 0;
  while ((match = TSC_PATTERN.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: match[4],
      message: match[5].trim(),
      source: 'tsc',
      severity: 'error',
    });
  }

  return errors;
}

function parseOxlintOutput(output: string): DiagnosticError[] {
  const errors: DiagnosticError[] = [];
  let match;

  OXLINT_PATTERN.lastIndex = 0;
  while ((match = OXLINT_PATTERN.exec(output)) !== null) {
    const message = match[4].trim();
    const isWarning = message.startsWith('warning:');

    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: `oxlint/${match[5]}`,
      message: isWarning ? message.replace(/^warning:\s*/, '') : message,
      source: 'oxlint',
      severity: isWarning ? 'warning' : 'error',
    });
  }

  return errors;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run tsc --noEmit + oxlint in the sandbox and return actionable errors.
 *
 * Only errors in `writtenFiles` that are NOT in `pendingFiles` are returned.
 * This prevents false positives from not-yet-generated files.
 */
export async function runLayerDiagnostics(
  sandbox: Sandbox,
  writtenFiles: Set<string>,
  pendingFiles: Set<string>,
): Promise<LayerDiagnosticResult> {
  const startTime = Date.now();
  const allErrors: DiagnosticError[] = [];

  // Run tsc and oxlint in parallel (commands execute in remote sandbox)
  const [tscResult, oxlintResult] = await Promise.all([
    runCommand(sandbox, 'tsc --noEmit 2>&1 || true', 'layer-tsc', {
      cwd: '/workspace',
      timeout: 60,
    }).catch(() => ({ exitCode: 1, stdout: '' })),
    runCommand(sandbox, 'oxlint src/ --format unix 2>&1 || true', 'layer-oxlint', {
      cwd: '/workspace',
      timeout: 30,
    }).catch(() => ({ exitCode: 0, stdout: '' })),
  ]);

  // Parse outputs
  const tscErrors = parseTscOutput(tscResult.stdout);
  const oxlintErrors = parseOxlintOutput(oxlintResult.stdout);
  allErrors.push(...tscErrors, ...oxlintErrors);

  // Filter: only keep errors in written files, exclude pending files
  const filteredErrors = allErrors.filter((err) => {
    const normalizedPath = err.file.replace(/^\.\//, '');
    return writtenFiles.has(normalizedPath) && !pendingFiles.has(normalizedPath);
  });

  // Deduplicate by file:line:message
  const seen = new Set<string>();
  const dedupedErrors = filteredErrors.filter((err) => {
    const key = `${err.file}:${err.line}:${err.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Group by file
  const errorsByFile = new Map<string, DiagnosticError[]>();
  for (const err of dedupedErrors) {
    const existing = errorsByFile.get(err.file) || [];
    existing.push(err);
    errorsByFile.set(err.file, existing);
  }

  const totalErrors = dedupedErrors.filter(e => e.severity === 'error').length;
  const totalWarnings = dedupedErrors.filter(e => e.severity === 'warning').length;
  const durationMs = Date.now() - startTime;

  console.log(
    `[layer-diagnostics] ${totalErrors} errors, ${totalWarnings} warnings ` +
    `(filtered from ${allErrors.length} total) in ${durationMs}ms`,
  );

  return {
    errors: dedupedErrors,
    errorsByFile,
    totalErrors,
    totalWarnings,
    durationMs,
  };
}
