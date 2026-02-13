/**
 * Batch File Generator
 *
 * Uses OpenAI's Batch API for 50% cost reduction on non-interactive
 * file generation. Ideal for regeneration/edit flows where latency
 * is less critical.
 *
 * Based on OpenAI Cookbook: "Batch processing with the Batch API"
 *
 * Process:
 * 1. Create JSONL file with all file generation requests
 * 2. Upload to OpenAI Files API
 * 3. Create batch job
 * 4. Poll for completion
 * 5. Download and parse results
 */

import { getOpenAIClient, CODEGEN_MODEL, REASONING_PRESETS } from './openai-client';
import { buildFilePrompt } from './injector';
import type { Plan } from './types';

// ============================================================================
// Types
// ============================================================================

interface BatchRequest {
  custom_id: string;
  method: 'POST';
  url: '/v1/responses';
  body: {
    model: string;
    instructions: string;
    input: Array<{ role: string; content: string }>;
    reasoning?: { effort: string };
  };
}

export interface BatchResult {
  files: Map<string, string>;
  failedFiles: string[];
  batchId: string;
}

// ============================================================================
// Batch Generation
// ============================================================================

/**
 * Generate files using OpenAI Batch API (50% cost reduction)
 *
 * @param plan - Execution plan with file specs
 * @param generatedContents - Already-generated files (e.g., from earlier layers)
 * @param supabaseUrl - Supabase project URL
 * @param supabaseAnonKey - Supabase anonymous key
 * @param model - Model to use
 * @returns Batch result with generated file contents
 */
export async function generateFilesBatch(
  plan: Plan,
  generatedContents: Map<string, string>,
  supabaseUrl: string,
  supabaseAnonKey: string,
  model: string = CODEGEN_MODEL
): Promise<BatchResult> {
  const client = getOpenAIClient();

  const systemPrompt = `You are a code generator. Generate the requested source file. Return ONLY valid source code. Do NOT wrap code in markdown fences. Output ONLY the file content.`;

  // 1. Build JSONL requests
  const requests: BatchRequest[] = plan.files.map((fileSpec) => {
    const filePrompt = buildFilePrompt(
      fileSpec,
      generatedContents,
      plan.designTokens,
      supabaseUrl,
      supabaseAnonKey
    );

    return {
      custom_id: fileSpec.path,
      method: 'POST' as const,
      url: '/v1/responses' as const,
      body: {
        model,
        instructions: systemPrompt,
        input: [{ role: 'user', content: filePrompt }],
        reasoning: { effort: REASONING_PRESETS.codegen },
      },
    };
  });

  // 2. Create JSONL content
  const jsonlContent = requests.map(r => JSON.stringify(r)).join('\n');

  // 3. Upload file
  const file = await client.files.create({
    file: new File([jsonlContent], 'batch-codegen.jsonl', { type: 'application/jsonl' }),
    purpose: 'batch',
  });

  console.log(`Batch file uploaded: ${file.id}`);

  // 4. Create batch
  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/responses',
    completion_window: '24h',
    metadata: {
      app_name: plan.appName,
      file_count: String(plan.files.length),
    },
  });

  console.log(`Batch created: ${batch.id}`);

  // 5. Poll for completion
  const result = await pollBatchCompletion(client, batch.id);

  return result;
}

/**
 * Poll batch job until completion
 */
async function pollBatchCompletion(
  client: ReturnType<typeof getOpenAIClient>,
  batchId: string,
  pollIntervalMs: number = 30000,
  maxWaitMs: number = 3600000 // 1 hour
): Promise<BatchResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const batch = await client.batches.retrieve(batchId);

    console.log(`Batch ${batchId}: ${batch.status} (${batch.request_counts?.completed ?? 0}/${batch.request_counts?.total ?? 0})`);

    if (batch.status === 'completed' && batch.output_file_id) {
      return await downloadBatchResults(client, batch.output_file_id, batchId);
    }

    if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
      throw new Error(`Batch ${batchId} ${batch.status}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Batch ${batchId} timed out after ${maxWaitMs}ms`);
}

/**
 * Download and parse batch results
 */
async function downloadBatchResults(
  client: ReturnType<typeof getOpenAIClient>,
  outputFileId: string,
  batchId: string
): Promise<BatchResult> {
  const fileResponse = await client.files.content(outputFileId);
  const content = await fileResponse.text();

  const files = new Map<string, string>();
  const failedFiles: string[] = [];

  for (const line of content.split('\n').filter(Boolean)) {
    try {
      const result = JSON.parse(line);
      const filePath = result.custom_id;

      if (result.response?.status_code === 200) {
        // Extract text from response body
        const responseBody = result.response.body;
        let fileContent = responseBody?.output_text || '';

        // Strip markdown fences if present
        if (fileContent.startsWith('```')) {
          fileContent = fileContent.replace(/^```(?:typescript|tsx|jsx|javascript|ts|js)?\s*\n/, '');
          fileContent = fileContent.replace(/\n```\s*$/, '');
        }

        files.set(filePath, fileContent.trim());
      } else {
        console.error(`Batch file failed: ${filePath}`, result.error);
        failedFiles.push(filePath);
      }
    } catch (error) {
      console.error('Failed to parse batch result line:', error);
    }
  }

  console.log(`Batch complete: ${files.size} files generated, ${failedFiles.length} failed`);

  return { files, failedFiles, batchId };
}
