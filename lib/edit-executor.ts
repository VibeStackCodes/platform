import type { Sandbox } from '@daytonaio/sdk';
import type { EditResult } from './types';
import { searchSymbols, getMultiFileSymbols, formatSymbolIndex } from './lsp';
import { runLayerDiagnostics } from './layer-diagnostics';
import { fixLayerErrors } from './layer-fixer';
import { downloadFile, uploadFile, pushToOrigin, runCommand } from './sandbox';
import { getOpenAIClient, CODEGEN_MODEL, REASONING_PRESETS, isOpenAIModel } from './openai-client';
import { resolveModel } from './models';
import { stripCodeFences } from './utils';
import { generateText } from 'ai';

/**
 * LSP-Powered Edit Executor
 *
 * Orchestrates: LSP symbol search → download files → AI edit →
 * upload → verify → commit + push.
 *
 * Used by the edit_code chat tool for post-generation modifications.
 */

const MAX_FILES = 8;

/**
 * Execute an edit on the generated app in the sandbox.
 */
export async function executeEdit(options: {
  sandbox: Sandbox;
  instruction: string;
  searchQueries: string[];
  reasoning: string;
  model: string;
}): Promise<EditResult> {
  const { sandbox, instruction, searchQueries, reasoning, model } = options;

  try {
    // Step 1: Find relevant files via LSP symbol search
    const filePaths = new Set<string>();
    let totalSymbolsFound = 0;

    for (const query of searchQueries) {
      const symbols = await searchSymbols(sandbox, query);
      totalSymbolsFound += symbols.length;
      for (const sym of symbols) {
        // Normalize URI to relative path
        const relativePath = sym.filePath
          .replace(/^file:\/\//, '')
          .replace(/^\/workspace\//, '');
        filePaths.add(relativePath);
      }
    }

    // Fallback: if LSP found nothing, search filesystem
    if (filePaths.size === 0) {
      console.log('[edit-executor] LSP found no symbols, falling back to file search');
      const findResult = await runCommand(
        sandbox,
        'find /workspace/src -name "*.tsx" -o -name "*.ts" | head -20',
        'edit-find',
        { cwd: '/workspace', timeout: 10 },
      ).catch(() => ({ exitCode: 1, stdout: '', stderr: '' }));

      if (findResult.stdout) {
        const allFiles = findResult.stdout.trim().split('\n');
        // Match files containing any search query keyword
        const keywords = searchQueries.flatMap(q => q.toLowerCase().split(/\s+/));
        for (const f of allFiles) {
          const fileName = f.toLowerCase();
          if (keywords.some(kw => fileName.includes(kw))) {
            filePaths.add(f.replace('/workspace/', ''));
          }
        }
        // If still nothing, just take the first few files
        if (filePaths.size === 0) {
          for (const f of allFiles.slice(0, MAX_FILES)) {
            filePaths.add(f.replace('/workspace/', ''));
          }
        }
      }
    }

    // Cap at MAX_FILES
    const targetFiles = Array.from(filePaths).slice(0, MAX_FILES);
    console.log(`[edit-executor] Targeting ${targetFiles.length} files:`, targetFiles);

    if (targetFiles.length === 0) {
      return {
        filesModified: [],
        symbolsFound: totalSymbolsFound,
        buildPassed: true,
        error: 'No relevant files found for this edit',
      };
    }

    // Step 2: Download file contents
    const fileContents = new Map<string, string>();
    await Promise.all(
      targetFiles.map(async (path) => {
        try {
          const buf = await downloadFile(sandbox, `/workspace/${path}`);
          fileContents.set(path, buf.toString('utf-8'));
        } catch {
          console.warn(`[edit-executor] Could not download ${path}`);
        }
      }),
    );

    // Step 3: Get symbol context for each file
    const symbolIndex = await getMultiFileSymbols(sandbox, targetFiles);
    const symbolContext = formatSymbolIndex(symbolIndex);

    // Step 4: Generate edits via AI
    const modifiedFiles = await generateEdits(
      instruction,
      reasoning,
      fileContents,
      symbolContext,
      model,
    );

    if (modifiedFiles.size === 0) {
      return {
        filesModified: [],
        symbolsFound: totalSymbolsFound,
        buildPassed: true,
        error: 'AI determined no changes were needed',
      };
    }

    // Step 5: Upload modified files
    for (const [path, content] of modifiedFiles) {
      await uploadFile(sandbox, content, `/workspace/${path}`);
    }

    // Step 6: Run diagnostics on modified files
    const writtenFiles = new Set(modifiedFiles.keys());
    const diagnostics = await runLayerDiagnostics(sandbox, writtenFiles, new Set());

    let buildPassed = diagnostics.totalErrors === 0;

    // One-shot fix if errors found
    if (diagnostics.totalErrors > 0) {
      const allContents = new Map([...fileContents, ...modifiedFiles]);
      const { fixedFiles } = await fixLayerErrors(
        sandbox,
        diagnostics,
        allContents,
        model,
        () => {}, // No emit for edit fixes
      );
      // Update modifiedFiles with fixes
      for (const path of fixedFiles) {
        const buf = await downloadFile(sandbox, `/workspace/${path}`);
        modifiedFiles.set(path, buf.toString('utf-8'));
      }
      // Re-check
      const recheck = await runLayerDiagnostics(sandbox, writtenFiles, new Set());
      buildPassed = recheck.totalErrors === 0;
    }

    // Step 7: Commit + push
    try {
      const filePaths = Array.from(modifiedFiles.keys());
      await sandbox.git.add('/workspace', filePaths);
      await sandbox.git.commit(
        '/workspace',
        `edit: ${instruction.slice(0, 72)}`,
        'VibeStack',
        'vibestack@generated.app',
      );
      await pushToOrigin(sandbox);
    } catch (err) {
      console.warn('[edit-executor] Git commit/push failed (non-fatal):', err);
    }

    return {
      filesModified: Array.from(modifiedFiles.keys()),
      symbolsFound: totalSymbolsFound,
      buildPassed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[edit-executor] Error:', message);
    return {
      filesModified: [],
      symbolsFound: 0,
      buildPassed: false,
      error: message,
    };
  }
}

// ============================================================================
// AI Edit Generation
// ============================================================================

async function generateEdits(
  instruction: string,
  reasoning: string,
  fileContents: Map<string, string>,
  symbolContext: string,
  model: string,
): Promise<Map<string, string>> {
  const modifiedFiles = new Map<string, string>();

  // Build prompt with all file contents + symbol context
  const filesSection = Array.from(fileContents.entries())
    .map(
      ([path, content]) =>
        `### FILE: ${path}\n\`\`\`typescript\n${content}\n\`\`\``,
    )
    .join('\n\n');

  const systemPrompt = `You are editing an existing React + Vite + Supabase application. For each file that needs changes, call the write_file function with the complete updated file content. Only modify files that need changes — do not rewrite files unnecessarily.`;

  const userPrompt = `## Edit Instruction
${instruction}

## Reasoning
${reasoning}

## Symbol Index
${symbolContext}

## Files
${filesSection}

Modify the necessary files to implement the edit instruction. Call write_file for each file that needs changes.`;

  if (isOpenAIModel(model)) {
    const client = getOpenAIClient();

    const writeFileTool = {
      type: 'function' as const,
      name: 'write_file',
      description: 'Write an updated source file',
      parameters: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string' as const,
            description: 'File path relative to project root',
          },
          content: {
            type: 'string' as const,
            description: 'Complete updated file content',
          },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      strict: true,
    };

    const response = await client.responses.create({
      model: CODEGEN_MODEL,
      instructions: systemPrompt,
      input: [{ role: 'user', content: userPrompt }],
      tools: [writeFileTool],
      tool_choice: 'required',
      parallel_tool_calls: true,
      reasoning: { effort: REASONING_PRESETS.codegen },
    });

    for (const output of response.output) {
      if (output.type === 'function_call' && output.name === 'write_file') {
        const args = JSON.parse(output.arguments);
        modifiedFiles.set(args.path, args.content);
      }
    }
  } else {
    // Fallback for non-OpenAI models: edit files one at a time
    for (const [path, content] of fileContents) {
      const prompt = `${systemPrompt}\n\n${userPrompt}\n\nFocus on this file: ${path}\n\nReturn ONLY the complete updated file content if changes are needed, or return the exact original content if no changes are needed.`;

      const { text } = await generateText({
        model: resolveModel(model),
        prompt,
        maxOutputTokens: 8000,
        temperature: 0.3,
      });

      const cleaned = stripCodeFences(text.trim());
      if (cleaned !== content) {
        modifiedFiles.set(path, cleaned);
      }
    }
  }

  return modifiedFiles;
}
