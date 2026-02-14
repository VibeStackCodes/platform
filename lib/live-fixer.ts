import type { Sandbox } from '@daytonaio/sdk';
import type { StreamEvent } from './types';
import { runCommand } from './sandbox';
import { resolveModel } from './models';
import { generateText } from 'ai';
import { getOpenAIClient, FIX_MODEL, REASONING_PRESETS, isOpenAIModel } from './openai-client';
import { stripCodeFences } from './utils';

/**
 * Live Fixer — watches dev server for errors and fixes them in real-time.
 *
 * Runs as a parallel background process during the feature writing phase.
 * Since we know the full file manifest upfront, we can distinguish
 * "not yet written" errors from real errors in already-written files.
 */
export class LiveFixer {
  private sandbox: Sandbox;
  private model: string;
  private emit: (event: StreamEvent) => void;
  private writtenFiles: Set<string> = new Set();
  private pendingFiles: Set<string> = new Set();
  private fileContents: Map<string, string> = new Map();
  private running = false;
  private fixCount = 0;
  private pollIntervalMs = 3000;

  constructor(
    sandbox: Sandbox,
    model: string,
    emit: (event: StreamEvent) => void,
    allPendingPaths: string[],
  ) {
    this.sandbox = sandbox;
    this.model = model;
    this.emit = emit;
    for (const p of allPendingPaths) {
      this.pendingFiles.add(p);
    }
  }

  /** Call when a file has been written to the sandbox */
  markFileWritten(path: string, content: string): void {
    this.pendingFiles.delete(path);
    this.writtenFiles.add(path);
    this.fileContents.set(path, content);
  }

  /** Start the background error watching loop */
  start(): void {
    this.running = true;
    this._pollLoop().catch(err => {
      console.error('[live-fixer] Poll loop error:', err);
    });
  }

  /** Stop the background loop. Returns number of fixes applied. */
  stop(): number {
    this.running = false;
    return this.fixCount;
  }

  private async _pollLoop(): Promise<void> {
    while (this.running) {
      try {
        await this._checkForErrors();
      } catch (err) {
        console.warn('[live-fixer] Error check failed:', err);
      }
      await new Promise(r => setTimeout(r, this.pollIntervalMs));
    }
  }

  private async _checkForErrors(): Promise<void> {
    // Read recent dev server output (vite-plugin-checker writes to stderr)
    let output: string;
    try {
      const result = await runCommand(
        this.sandbox,
        'cat /tmp/checker-errors.log 2>/dev/null && > /tmp/checker-errors.log',
        'checker-read',
        { cwd: '/workspace', timeout: 10 }
      );
      output = result.stdout;
    } catch {
      return; // No errors file yet
    }

    if (!output || output.trim().length === 0) return;

    // Parse TypeScript errors: src/components/Foo.tsx(12,5): error TS2322: ...
    const errorPattern = /([\w\/.-]+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/g;
    const errorsByFile = new Map<string, Array<{ line: number; code: string; message: string }>>();

    let match;
    while ((match = errorPattern.exec(output)) !== null) {
      const filePath = match[1];

      // Skip errors in files not yet written — they'll resolve when written
      if (this.pendingFiles.has(filePath) || !this.writtenFiles.has(filePath)) {
        continue;
      }

      if (!errorsByFile.has(filePath)) {
        errorsByFile.set(filePath, []);
      }
      errorsByFile.get(filePath)!.push({
        line: parseInt(match[2], 10),
        code: match[4],
        message: match[5].trim(),
      });
    }

    // Fix all files with real errors in parallel
    const fixPromises = Array.from(errorsByFile.entries()).map(async ([filePath, errors]) => {
      const content = this.fileContents.get(filePath);
      if (!content) return;

      console.log(`[live-fixer] Fixing ${errors.length} errors in ${filePath}`);
      this.emit({ type: 'build_fix', file: filePath, attempt: 0 });

      try {
        const fixed = await this._fixFile(filePath, content, errors);
        if (fixed !== content) {
          // Upload fix to sandbox (triggers HMR)
          await this.sandbox.fs.uploadFile(Buffer.from(fixed), `/workspace/${filePath}`);
          this.fileContents.set(filePath, fixed);
          this.fixCount++;
          console.log(`[live-fixer] ✓ Fixed ${filePath}`);
        }
      } catch (err) {
        console.warn(`[live-fixer] Failed to fix ${filePath}:`, err);
      }
    });

    await Promise.all(fixPromises);
  }

  private async _fixFile(
    filePath: string,
    content: string,
    errors: Array<{ line: number; code: string; message: string }>,
  ): Promise<string> {
    const errorSummary = errors
      .map(e => `  Line ${e.line}: ${e.code} — ${e.message}`)
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

    if (isOpenAIModel(this.model)) {
      const client = getOpenAIClient();
      const response = await client.responses.create({
        model: FIX_MODEL,
        instructions: 'Fix TypeScript errors. Return ONLY the fixed file, no fences.',
        input: [{ role: 'user', content: prompt }],
        reasoning: { effort: REASONING_PRESETS.fixing },
      });
      let text = response.output_text?.trim() || '';
      text = stripCodeFences(text);
      return text;
    }

    const { text } = await generateText({
      model: resolveModel(this.model),
      prompt,
      maxOutputTokens: 8000,
      temperature: 0.3,
    });
    let fixed = text.trim();
    fixed = stripCodeFences(fixed);
    return fixed;
  }
}
