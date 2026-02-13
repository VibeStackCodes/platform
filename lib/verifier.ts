import { generateText } from 'ai';
import type { Sandbox } from '@daytonaio/sdk';
import type { BuildError, StreamEvent } from './types';
import { runCommand } from './sandbox';
import { resolveModel } from './models';
import { getOpenAIClient, FIX_MODEL, REASONING_PRESETS, isOpenAIModel } from './openai-client';
import { zodTextFormat } from 'openai/helpers/zod';
import { ErrorAnalysisSchema, type ErrorAnalysis } from './schemas';
import { stripCodeFences } from './utils';

/**
 * Build Verifier Module
 *
 * Verifies Next.js builds in Daytona sandboxes and attempts to fix errors.
 * - Parses Turbopack errors, module-not-found, type errors
 * - Uses OpenAI Responses API with structured outputs for error analysis
 * - Leverages reasoning effort tuning for intelligent fixes
 * - Iteratively fixes broken files (max 5 retries)
 * - Emits events for UI tracking
 */

// ============================================================================
// Constants
// ============================================================================

const MAX_FIX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

// ============================================================================
// Error Extraction
// ============================================================================

/**
 * Extract relevant error lines from build output
 *
 * Intelligently filters build output to keep only error-related lines and context:
 * 1. Identifies lines containing error keywords
 * 2. Includes 2 lines of context above and below each error
 * 3. Deduplicates lines
 * 4. Truncates to maxChars if needed
 * 5. Falls back to simple slice if no errors found
 *
 * @param buildOutput - Raw build output
 * @param maxChars - Maximum characters to return
 * @returns Filtered and truncated build output
 */
function extractRelevantErrors(buildOutput: string, maxChars: number): string {
  const lines = buildOutput.split('\n');
  const errorKeywords = [
    'error', 'Error', 'ERROR',
    '✕', '×', 'failed',
    'Cannot find', 'Module',
    'TS2', 'TS7', 'Type',
    'not assignable',
    'has no exported'
  ];

  // Find all line indices that contain error keywords
  const errorLineIndices = new Set<number>();
  lines.forEach((line, index) => {
    if (errorKeywords.some(keyword => line.includes(keyword))) {
      errorLineIndices.add(index);
    }
  });

  // If no error lines found, fall back to simple truncation
  if (errorLineIndices.size === 0) {
    return buildOutput.slice(0, maxChars);
  }

  // Add context lines (2 above and below each error line)
  const relevantIndices = new Set<number>();
  errorLineIndices.forEach(index => {
    for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) {
      relevantIndices.add(i);
    }
  });

  // Sort indices and extract lines
  const sortedIndices = Array.from(relevantIndices).sort((a, b) => a - b);
  const relevantLines: string[] = [];

  sortedIndices.forEach((index, i) => {
    // Add separator if there's a gap in line numbers
    if (i > 0 && index > sortedIndices[i - 1] + 1) {
      relevantLines.push('...');
    }
    relevantLines.push(lines[index]);
  });

  let result = relevantLines.join('\n');

  // Truncate if still too long
  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '\n... (truncated)';
  }

  return result;
}

// ============================================================================
// Error Analysis
// ============================================================================

/**
 * Analyze build errors using OpenAI structured outputs
 *
 * Uses GPT-5.2 with high reasoning to:
 * - Parse and categorize errors
 * - Identify root cause
 * - Determine optimal fix order
 *
 * @param buildOutput - Raw build output from Next.js
 * @param model - Model ID to use
 * @returns Structured error analysis or null for non-OpenAI models
 */
async function analyzeErrors(buildOutput: string, model: string): Promise<ErrorAnalysis | null> {
  if (!isOpenAIModel(model)) {
    // fallback to existing parseBuildErrors
    return null;
  }

  try {
    const client = getOpenAIClient();
    const relevantErrors = extractRelevantErrors(buildOutput, 4000);
    const response = await client.responses.parse({
      model: FIX_MODEL,
      input: [{
        role: 'user',
        content: `Analyze these Next.js build errors and determine the optimal fix order:\n\n${relevantErrors}`
      }],
      text: { format: zodTextFormat(ErrorAnalysisSchema, 'error_analysis') },
      reasoning: { effort: REASONING_PRESETS.fixing },
    });

    return response.output_parsed;
  } catch (error) {
    console.error('Error analysis failed:', error);
    return null;
  }
}

// ============================================================================
// Error Parsing (Fallback)
// ============================================================================

/**
 * Parse build errors from tsc --noEmit and Next.js build output
 *
 * Handles TypeScript compiler diagnostic format as primary pattern:
 * - Standard tsc format: file(line,col): error TSxxxx: message
 * - Turbopack compilation errors
 * - Module not found errors
 * - Import errors
 *
 * Deduplicates errors by file+line+message to avoid redundant fixes.
 */
export function parseBuildErrors(output: string): BuildError[] {
  const errors: BuildError[] = [];
  const seen = new Set<string>();

  /**
   * Add error if not already seen (deduplication)
   */
  function addError(error: BuildError): void {
    const key = `${error.file}:${error.line || 0}:${error.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push(error);
    }
  }

  // Pattern 1 (PRIMARY): TypeScript compiler diagnostic format
  // file(line,col): error TSxxxx: message
  // This is the most reliable format from tsc --noEmit
  const tscPattern = /([\w\/.-]+)\((\d+),(\d+)\): error (TS\d+): ([^\n]+)/g;
  let match;

  while ((match = tscPattern.exec(output)) !== null) {
    addError({
      file: match[1],
      line: parseInt(match[2], 10),
      message: `${match[4]}: ${match[5]}`,
      raw: match[0],
    });
  }

  // Pattern 2: Turbopack errors (./app/page.tsx:10:5)
  // Only match if preceded by error indicators to avoid false positives
  const turbopackPattern = /(?:error|Error|✕|×|failed)[\s\S]{0,50}?\.\/([^\s:]+):(\d+):(\d+)\s*\n([^\n]+)/g;

  while ((match = turbopackPattern.exec(output)) !== null) {
    addError({
      file: match[1],
      line: parseInt(match[2], 10),
      message: match[4].trim(),
      raw: match[0],
    });
  }

  // Pattern 3: Module not found errors
  // Cannot find module 'X' or its corresponding type declarations
  const moduleNotFoundPattern = /Cannot find module ['"]([^'"]+)['"](?: or its corresponding type declarations)?/g;

  while ((match = moduleNotFoundPattern.exec(output)) !== null) {
    addError({
      file: 'unknown',
      message: `Cannot find module '${match[1]}'`,
      raw: match[0],
    });
  }

  // Pattern 4: Import/export errors
  // Module '"X"' has no exported member 'Y'
  const importErrorPattern = /Module ['"]([^'"]+)['"] has no exported member ['"]([^'"]+)['"]/g;

  while ((match = importErrorPattern.exec(output)) !== null) {
    addError({
      file: 'unknown',
      message: `Module '${match[1]}' has no exported member '${match[2]}'`,
      raw: match[0],
    });
  }

  return errors;
}

// ============================================================================
// Build Verification
// ============================================================================

/**
 * Verify build and iteratively fix errors
 *
 * Process:
 * 1. Run `tsc --noEmit` in sandbox
 * 2. Check exit code and parse errors
 * 3. For OpenAI models: use structured error analysis to determine fix order
 * 4. For other models: use regex parsing and group by file
 * 5. Apply fixes with reasoning effort tuning (OpenAI) or AI SDK (Anthropic)
 * 6. Retry build (max 5 attempts)
 * 7. Emit events for UI tracking
 *
 * @param sandbox - Daytona sandbox instance
 * @param generatedContents - Map of file paths to generated content
 * @param model - Model for fixing errors
 * @param emit - Event emitter for UI updates
 * @returns True if build passes, false if max retries exceeded
 */
export async function verifyAndFix(
  sandbox: Sandbox,
  generatedContents: Map<string, string>,
  model: string,
  emit: (event: StreamEvent) => void
): Promise<boolean> {
  let attempt = 0;
  const fixHistory: Array<{ file: string; errors: string; fix: string }> = [];

  emit({
    type: 'checkpoint',
    label: 'Build verification',
    status: 'active',
  });

  while (attempt < MAX_FIX_RETRIES) {
    attempt++;
    console.log(`\n=== Build Verification Attempt ${attempt}/${MAX_FIX_RETRIES} ===`);

    emit({
      type: 'checkpoint',
      label: `Build attempt ${attempt}/${MAX_FIX_RETRIES}`,
      status: 'active',
    });

    // Run build
    const buildResult = await runBuild(sandbox);

    // Check if build passed
    if (buildResult.exitCode === 0) {
      console.log('✓ Build passed!');
      emit({
        type: 'checkpoint',
        label: 'Build verification',
        status: 'complete',
      });
      return true;
    }

    // Parse errors from both stdout and stderr
    const fullOutput = buildResult.stdout + (buildResult.stderr || '');

    // Try structured error analysis for OpenAI models
    let filesToFix: string[] = [];
    let errorsByFile: Record<string, BuildError[]> = {};

    if (isOpenAIModel(model)) {
      const analysis = await analyzeErrors(fullOutput, model);
      if (analysis) {
        console.log(`Structured error analysis: ${analysis.errors.length} errors found`);
        console.log(`Root cause: ${analysis.rootCause}`);
        console.log(`Fix order: ${analysis.fixOrder.join(', ')}`);

        // Use the structured fix order
        filesToFix = analysis.fixOrder.filter(f => f !== 'unknown');

        // Convert structured errors to BuildError format
        const structuredErrors: BuildError[] = analysis.errors.map(err => ({
          file: err.file,
          line: err.line ?? undefined,
          message: `[${err.errorType}] ${err.message}\nSuggested fix: ${err.suggestedFix}`,
          raw: err.message,
        }));

        emit({
          type: 'build_error',
          errors: structuredErrors,
        });

        // Group by file for fixing
        errorsByFile = groupErrorsByFile(structuredErrors);
      }
    }

    // Fallback to regex parsing
    if (filesToFix.length === 0) {
      const errors = parseBuildErrors(fullOutput);

      if (errors.length === 0) {
        console.warn('Build failed but no parseable errors found');
        emit({
          type: 'build_error',
          errors: [{
            file: 'unknown',
            message: 'Build failed with unknown error',
            raw: buildResult.stdout.slice(0, 500),
          }],
        });
        return false;
      }

      console.log(`Found ${errors.length} errors`);
      emit({
        type: 'build_error',
        errors,
      });

      // Group errors by file
      errorsByFile = groupErrorsByFile(errors);
      filesToFix = Object.keys(errorsByFile).filter(f => f !== 'unknown');
    }

    // Fix each file with errors
    for (const filePath of filesToFix) {
      const fileErrors = errorsByFile[filePath];
      if (!fileErrors) continue;

      const originalContent = generatedContents.get(filePath);
      if (!originalContent) {
        console.warn(`Cannot fix ${filePath}: original content not found`);
        continue;
      }

      try {
        emit({
          type: 'build_fix',
          file: filePath,
          attempt,
        });

        const fixedContent = await fixFile(
          filePath,
          originalContent,
          fileErrors,
          fullOutput,
          model,
          fixHistory
        );

        // Update generated contents and upload fixed file
        generatedContents.set(filePath, fixedContent);
        await sandbox.fs.uploadFile(Buffer.from(fixedContent), `/workspace/${filePath}`);

        // Record fix history
        fixHistory.push({
          file: filePath,
          errors: fileErrors.map(e => e.message).join('\n'),
          fix: 'Applied fix',
        });

        console.log(`✓ Fixed ${filePath}`);
      } catch (error) {
        console.error(`Failed to fix ${filePath}:`, error);
      }
    }

    // Wait before retry
    if (attempt < MAX_FIX_RETRIES) {
      console.log(`Waiting ${RETRY_DELAY_MS}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  console.error(`✗ Build verification failed after ${MAX_FIX_RETRIES} attempts`);
  emit({
    type: 'checkpoint',
    label: 'Build verification failed',
    status: 'complete',
  });
  return false;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Run TypeScript type checking in sandbox and get output
 */
async function runBuild(sandbox: Sandbox): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  try {
    const result = await runCommand(
      sandbox,
      'tsc --noEmit',
      'build-verify',
      { cwd: '/workspace', timeout: 60 }
    );

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Group errors by file path
 */
function groupErrorsByFile(errors: BuildError[]): Record<string, BuildError[]> {
  const grouped: Record<string, BuildError[]> = {};

  for (const error of errors) {
    if (!grouped[error.file]) {
      grouped[error.file] = [];
    }
    grouped[error.file].push(error);
  }

  return grouped;
}

/**
 * Fix a single file using AI
 *
 * For OpenAI models:
 * - Uses Responses API with reasoning effort tuning
 * - Leverages GPT-5.2's reasoning capabilities for smarter fixes
 *
 * For Anthropic models:
 * - Falls back to AI SDK with generateText
 */
async function fixFile(
  filePath: string,
  originalContent: string,
  errors: BuildError[],
  buildOutput: string,
  model: string,
  fixHistory: Array<{ file: string; errors: string; fix: string }>
): Promise<string> {
  const errorSummary = errors
    .map(err => `  - Line ${err.line || '?'}: ${err.message}`)
    .join('\n');

  const relevantBuildOutput = extractRelevantErrors(buildOutput, 2000);

  // Build fix history context as structured sections
  let historyContext = '';
  if (fixHistory.length > 0) {
    historyContext = '\n\n=== PREVIOUS FIX ATTEMPTS IN THIS BUILD ITERATION ===\n' +
      fixHistory.map((h, i) =>
        `\nAttempt ${i + 1}:\n` +
        `  File: ${h.file}\n` +
        `  Errors that were present:\n${h.errors.split('\n').map(line => `    ${line}`).join('\n')}\n` +
        `  Result: Fix was insufficient, errors persisted\n` +
        `  Lesson: Try a different approach this time`
      ).join('\n---\n') +
      '\n=== END PREVIOUS ATTEMPTS ===\n';
  }

  const prompt = `Fix the following TypeScript/React file that has build errors.

FILE: ${filePath}

ERRORS:
${errorSummary}

BUILD OUTPUT (relevant excerpt):
${relevantBuildOutput}${historyContext}

CURRENT FILE CONTENT:
\`\`\`typescript
${originalContent}
\`\`\`

INSTRUCTIONS:
1. Analyze the errors and build output
2. Fix ALL errors in the file
3. Do NOT change functionality or logic unless necessary to fix errors
4. Preserve existing code style and structure
5. Return ONLY the fixed file content (no markdown fences, no explanations)

FIXED FILE CONTENT:`;

  try {
    // When using OpenAI, use Responses API with reasoning and predicted outputs
    if (isOpenAIModel(model)) {
      const client = getOpenAIClient();

      const response = await client.responses.create({
        model: FIX_MODEL,
        instructions: 'You are a code fixer. Fix the build errors in the file. Return ONLY the fixed file content, no markdown fences.',
        input: [{ role: 'user', content: prompt }],
        reasoning: { effort: REASONING_PRESETS.fixing },
        // Note: prediction parameter for speculative decoding will be added when SDK supports it
        // prediction: { type: 'content', content: originalContent },
      });

      // Extract output with null safety
      const rawText = response.output_text;
      let fixedContent: string;

      if (!rawText || rawText.trim().length === 0) {
        // Fall back to extracting from response.output items
        const textOutput = response.output.find(item => item.type === 'message');
        if (textOutput && textOutput.type === 'message') {
          const textContent = textOutput.content.find(c => c.type === 'output_text');
          if (textContent && textContent.type === 'output_text') {
            fixedContent = textContent.text.trim();
          } else {
            throw new Error('No text content found in fix response');
          }
        } else {
          throw new Error('No message output found in fix response');
        }
      } else {
        fixedContent = rawText.trim();
      }

      // Strip markdown fences if present
      fixedContent = stripCodeFences(fixedContent);

      return fixedContent;
    }

    // Fall back to AI SDK for Anthropic models
    const { text } = await generateText({
      model: resolveModel(model),
      prompt,
      maxOutputTokens: 8000,
      temperature: 0.3,
    });

    let fixedContent = text.trim();

    // Strip markdown fences if present
    fixedContent = stripCodeFences(fixedContent);

    return fixedContent;
  } catch (error) {
    throw new Error(`Failed to fix file: ${error instanceof Error ? error.message : String(error)}`);
  }
}
