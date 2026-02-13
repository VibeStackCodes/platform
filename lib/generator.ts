import { streamText } from 'ai';
import type { Sandbox } from '@daytonaio/sdk';
import type { Plan, FileSpec, StreamEvent } from './types';
import { uploadFile, runCommand } from './sandbox';
import { buildFilePrompt } from './injector';
import { resolveModel } from './models';
import { getOpenAIClient, CODEGEN_MODEL, REASONING_PRESETS, isOpenAIModel } from './openai-client';

/** Descriptive labels for each generation layer */
const LAYER_LABELS: Record<number, string> = {
  0: 'config and type definitions',
  1: 'utility and library modules',
  2: 'UI components',
  3: 'page routes and layouts',
  4: 'API routes and server actions',
  5: 'tests and documentation',
};

/**
 * Parallel File Generator Module
 *
 * Generates files using two strategies:
 * - OpenAI models: ONE API call per layer with parallel function calls for all files in that layer
 * - Other models: Per-file streaming using AI SDK (fallback)
 *
 * Architecture:
 * - Groups files by dependency layer
 * - Generates each layer sequentially (layers 0 → N)
 * - Within each layer, OpenAI generates all files in parallel via function calls
 * - Streams file content with real-time events
 * - Uploads generated files to sandbox
 */

// ============================================================================
// File Generation
// ============================================================================

/**
 * Generate all files from plan in parallel by layer
 *
 * Process:
 * 1. Group files by dependency layer
 * 2. For each layer (starting with 0):
 *    - OpenAI: Single API call with parallel function calls for all files
 *    - Others: Generate all files concurrently using Promise.all()
 *    - Stream content and emit events
 *    - Upload to sandbox
 * 3. Return map of file paths to contents
 *
 * @param plan - Execution plan with file specifications
 * @param sandbox - Daytona sandbox instance
 * @param supabaseUrl - Supabase project URL
 * @param supabaseAnonKey - Supabase anonymous key
 * @param model - Model to use (e.g., 'gpt-5.2', 'claude-sonnet-4-5')
 * @param emit - Event emitter for UI updates
 * @returns Map of file paths to generated content
 */
export async function generateFiles(
  plan: Plan,
  sandbox: Sandbox,
  supabaseUrl: string,
  supabaseAnonKey: string,
  model: string,
  emit: (event: StreamEvent) => void
): Promise<Map<string, string>> {
  const generatedContents = new Map<string, string>();

  // Group files by layer
  const filesByLayer = groupFilesByLayer(plan);
  const maxLayer = Math.max(...Array.from(filesByLayer.keys()));

  console.log(`\n=== Generating ${plan.files.length} files across ${maxLayer + 1} layers ===`);

  // Determine if we should use OpenAI parallel function call approach
  const useOpenAIParallel = isOpenAIModel(model);

  // Generate each layer sequentially (layers must be done in order)
  for (let layer = 0; layer <= maxLayer; layer++) {
    const layerFiles = filesByLayer.get(layer) || [];
    if (layerFiles.length === 0) continue;

    console.log(`\n--- Layer ${layer}: ${layerFiles.length} files ---`);

    emit({
      type: 'checkpoint',
      label: `Layer ${layer}: ${LAYER_LABELS[layer] || 'files'}`,
      status: 'active',
    });

    if (useOpenAIParallel) {
      // Approach B: ONE API call per layer with parallel function calls
      await generateLayerWithOpenAI(
        layer,
        layerFiles,
        generatedContents,
        plan,
        sandbox,
        supabaseUrl,
        supabaseAnonKey,
        emit
      );
    } else {
      // Fallback: Per-file streaming (existing approach)
      await generateLayerWithStreaming(
        layer,
        layerFiles,
        generatedContents,
        plan,
        sandbox,
        supabaseUrl,
        supabaseAnonKey,
        model,
        emit
      );
    }

    // Verify all files in this layer were generated before proceeding
    const missingFiles = layerFiles.filter(f => !generatedContents.has(f.path));
    if (missingFiles.length > 0) {
      const missingPaths = missingFiles.map(f => f.path).join(', ');
      throw new Error(`Layer ${layer} incomplete: failed to generate ${missingFiles.length} file(s): ${missingPaths}`);
    }

    // Git commit this layer's files
    const label = LAYER_LABELS[layer] || `layer ${layer} files`;
    const filePaths = layerFiles.map(f => f.path).join(' ');
    try {
      const commitResult = await runCommand(
        sandbox,
        `cd /workspace && git add ${filePaths} && git commit -m "feat: add ${label}" && git rev-parse --short HEAD`,
        `git-layer-${layer}`,
        { cwd: '/workspace', timeout: 30 }
      );
      const hash = commitResult.stdout.trim().split('\n').pop() || 'unknown';
      console.log(`✓ Committed layer ${layer}: ${label} (${hash})`);

      emit({
        type: 'layer_commit',
        layer,
        hash,
        message: `feat: add ${label}`,
        files: layerFiles.map(f => f.path),
      });
    } catch (error) {
      console.warn(`Git commit for layer ${layer} failed (non-fatal):`, error);
    }

    emit({
      type: 'checkpoint',
      label: `Layer ${layer}: ${LAYER_LABELS[layer] || 'files'}`,
      status: 'complete',
    });
  }

  console.log(`\n✓ Generated ${generatedContents.size}/${plan.files.length} files`);
  return generatedContents;
}

// ============================================================================
// OpenAI Parallel Generation (Approach B)
// ============================================================================

/**
 * Generate all files in a layer using OpenAI parallel function calls
 *
 * Makes ONE API call with parallel function calls for all files in the layer.
 * Each file is generated via the write_file function tool.
 */
async function generateLayerWithOpenAI(
  layer: number,
  layerFiles: FileSpec[],
  generatedContents: Map<string, string>,
  plan: Plan,
  sandbox: Sandbox,
  supabaseUrl: string,
  supabaseAnonKey: string,
  emit: (event: StreamEvent) => void
): Promise<void> {
  // Define the write_file function tool
  const writeFileTool = {
    type: 'function' as const,
    name: 'write_file',
    description: 'Write a generated source file',
    parameters: {
      type: 'object' as const,
      properties: {
        path: { type: 'string' as const, description: 'File path relative to project root' },
        content: { type: 'string' as const, description: 'Complete file content' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    strict: true,
  };

  // Build a single prompt containing ALL file specs for this layer
  const layerPrompt = layerFiles.map(fileSpec => {
    const filePrompt = buildFilePrompt(
      fileSpec,
      generatedContents,
      plan.designTokens,
      supabaseUrl,
      supabaseAnonKey
    );
    return `## FILE: ${fileSpec.path}\n\n${filePrompt}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `You are a code generator. For each file described below, call the write_file function with the file path and complete file content. Generate ALL files as parallel function calls in a single response. Do NOT wrap code in markdown fences. Output ONLY valid source code in the content field.`;

  // Emit file_start events for all files
  for (const fileSpec of layerFiles) {
    emit({
      type: 'file_start',
      path: fileSpec.path,
      layer: fileSpec.layer,
    });
  }

  try {
    // Make the OpenAI API call with parallel function calling using streaming
    const client = getOpenAIClient();
    const stream = client.responses.stream({
      model: CODEGEN_MODEL,
      instructions: systemPrompt,
      input: [{ role: 'user', content: layerPrompt }],
      tools: [writeFileTool],
      tool_choice: 'required',
      parallel_tool_calls: true,
      reasoning: { effort: REASONING_PRESETS.codegen },
    });

    // Process stream events to handle completed function calls
    for await (const event of stream) {
      if (event.type === 'response.function_call_arguments.done') {
        const args = JSON.parse(event.arguments);
        const filePath = args.path as string;
        const content = args.content as string;

        // Store generated content
        generatedContents.set(filePath, content);

        // Upload to sandbox
        await uploadFile(sandbox, content, `/workspace/${filePath}`);

        // Calculate lines of code
        const linesOfCode = content.split('\n').length;

        // Emit the complete content as a single chunk then complete
        emit({
          type: 'file_chunk',
          path: filePath,
          chunk: content,
        });

        emit({
          type: 'file_complete',
          path: filePath,
          linesOfCode,
        });

        console.log(`✓ Generated ${filePath} (${linesOfCode} lines)`);
      }
    }

    // Wait for the stream to fully complete and verify all files were generated
    const finalResponse = await stream.finalResponse();

    // Verify all files were generated by checking the final response outputs
    for (const output of finalResponse.output) {
      if (output.type === 'function_call' && output.name === 'write_file') {
        const args = JSON.parse(output.arguments);
        const filePath = args.path as string;

        // If we somehow missed this file during streaming, handle it now
        if (!generatedContents.has(filePath)) {
          const content = args.content as string;
          generatedContents.set(filePath, content);
          await uploadFile(sandbox, content, `/workspace/${filePath}`);

          const linesOfCode = content.split('\n').length;
          emit({ type: 'file_chunk', path: filePath, chunk: content });
          emit({ type: 'file_complete', path: filePath, linesOfCode });
          console.log(`✓ Generated ${filePath} (${linesOfCode} lines) [from final response]`);
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`✗ Failed to generate layer ${layer}:`, errorMessage);

    // Emit error events for all files in layer
    for (const fileSpec of layerFiles) {
      emit({
        type: 'file_error',
        path: fileSpec.path,
        error: errorMessage,
      });
    }

    throw error; // Re-throw to trigger layer verification failure
  }
}

// ============================================================================
// Streaming Generation (Fallback for non-OpenAI models)
// ============================================================================

/**
 * Generate all files in a layer using per-file streaming (original approach)
 *
 * Used for non-OpenAI models that don't support parallel function calls.
 */
async function generateLayerWithStreaming(
  layer: number,
  layerFiles: FileSpec[],
  generatedContents: Map<string, string>,
  plan: Plan,
  sandbox: Sandbox,
  supabaseUrl: string,
  supabaseAnonKey: string,
  model: string,
  emit: (event: StreamEvent) => void
): Promise<void> {
  // Generate all files in this layer concurrently
  await Promise.all(
    layerFiles.map(async (fileSpec) => {
      try {
        emit({
          type: 'file_start',
          path: fileSpec.path,
          layer: fileSpec.layer,
        });

        // Build prompt with all context
        const prompt = buildFilePrompt(
          fileSpec,
          generatedContents, // Dependencies from previous layers
          plan.designTokens,
          supabaseUrl,
          supabaseAnonKey
        );

        // Stream file generation
        let content = '';

        const result = streamText({
          model: resolveModel(model),
          prompt,
          maxOutputTokens: 8000,
          temperature: 0.7,
        });

        // Handle stream events
        for await (const chunk of result.textStream) {
          content += chunk;
          emit({
            type: 'file_chunk',
            path: fileSpec.path,
            chunk,
          });
        }

        // Strip markdown fences if present
        content = stripMarkdownFences(content);

        // Store generated content
        generatedContents.set(fileSpec.path, content);

        // Upload to sandbox
        await uploadFile(sandbox, content, `/workspace/${fileSpec.path}`);

        // Calculate lines of code
        const linesOfCode = content.split('\n').length;

        emit({
          type: 'file_complete',
          path: fileSpec.path,
          linesOfCode,
        });

        console.log(`✓ Generated ${fileSpec.path} (${linesOfCode} lines)`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to generate ${fileSpec.path}:`, errorMessage);

        emit({
          type: 'file_error',
          path: fileSpec.path,
          error: errorMessage,
        });
      }
    })
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group files by dependency layer
 */
function groupFilesByLayer(plan: Plan): Map<number, typeof plan.files> {
  const grouped = new Map<number, typeof plan.files>();

  for (const file of plan.files) {
    if (!grouped.has(file.layer)) {
      grouped.set(file.layer, []);
    }
    grouped.get(file.layer)!.push(file);
  }

  return grouped;
}

/**
 * Strip markdown fences from generated content
 */
function stripMarkdownFences(content: string): string {
  let cleaned = content.trim();

  // Remove opening fence with optional language
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:typescript|tsx|jsx|javascript|ts|js)?\s*\n/, '');
  }

  // Remove closing fence
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\n```\s*$/, '');
  }

  return cleaned;
}
