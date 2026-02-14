import type { Sandbox } from '@daytonaio/sdk';
import type { StreamEvent } from './types';
import type { LayerDiagnosticResult } from './layer-diagnostics';
import { getOpenAIClient, FIX_MODEL, REASONING_PRESETS, isOpenAIModel } from './openai-client';
import { resolveModel } from './models';
import { generateText } from 'ai';
import { stripCodeFences } from './utils';

/**
 * Per-Layer AI Fixer
 *
 * Takes diagnostic errors from layer-diagnostics and fixes them using AI.
 * One-shot fix per file — the build verifier handles persistent errors later.
 * Same pattern as LiveFixer._fixFile() but batch-oriented.
 */

/**
 * Fix all files with errors in a single layer.
 *
 * @param sandbox - Daytona sandbox instance
 * @param diagnostics - Results from runLayerDiagnostics()
 * @param fileContents - Current contents of generated files
 * @param model - AI model to use for fixing
 * @param emit - Event emitter for UI updates
 * @returns Files that were fixed and count of remaining errors
 */
export async function fixLayerErrors(
  sandbox: Sandbox,
  diagnostics: LayerDiagnosticResult,
  fileContents: Map<string, string>,
  model: string,
  emit: (event: StreamEvent) => void,
): Promise<{ fixedFiles: string[]; remainingErrors: number }> {
  const fixedFiles: string[] = [];
  let remainingErrors = 0;

  // Fix all files with errors in parallel
  const fixPromises = Array.from(diagnostics.errorsByFile.entries()).map(
    async ([filePath, errors]) => {
      const content = fileContents.get(filePath);
      if (!content) {
        console.warn(`[layer-fixer] No content for ${filePath}, skipping`);
        remainingErrors += errors.length;
        return;
      }

      emit({ type: 'build_fix', file: filePath, attempt: 0 });

      try {
        const fixed = await fixFile(filePath, content, errors, model);
        if (fixed !== content) {
          // Upload fix to sandbox (triggers HMR)
          await sandbox.fs.uploadFile(
            Buffer.from(fixed),
            `/workspace/${filePath}`,
          );
          fixedFiles.push(filePath);
          console.log(`[layer-fixer] Fixed ${filePath}`);
        }
      } catch (err) {
        console.warn(`[layer-fixer] Failed to fix ${filePath}:`, err);
        remainingErrors += errors.length;
      }
    },
  );

  await Promise.all(fixPromises);

  return { fixedFiles, remainingErrors };
}

// ============================================================================
// File Fix (reuses LiveFixer._fixFile pattern)
// ============================================================================

async function fixFile(
  filePath: string,
  content: string,
  errors: Array<{ line: number; code: string; message: string; source: string }>,
  model: string,
): Promise<string> {
  const errorSummary = errors
    .map(
      (e) =>
        `  Line ${e.line}: [${e.source}] ${e.code} — ${e.message}`,
    )
    .join('\n');

  const prompt = `Fix the TypeScript errors in this file. Return ONLY the fixed file content, no markdown fences.

FILE: ${filePath}

ERRORS:
${errorSummary}

CURRENT CONTENT:
\`\`\`typescript
${content}
\`\`\`

FIXED CONTENT:`;

  if (isOpenAIModel(model)) {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: FIX_MODEL,
      instructions:
        'Fix TypeScript errors. Return ONLY the fixed file, no fences.',
      input: [{ role: 'user', content: prompt }],
      reasoning: { effort: REASONING_PRESETS.fixing },
    });
    let text = response.output_text?.trim() || '';
    text = stripCodeFences(text);
    return text;
  }

  const { text } = await generateText({
    model: resolveModel(model),
    prompt,
    maxOutputTokens: 8000,
    temperature: 0.3,
  });
  let fixed = text.trim();
  fixed = stripCodeFences(fixed);
  return fixed;
}
