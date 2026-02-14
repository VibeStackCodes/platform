/**
 * Generation API Route v2 (Agent Pipeline)
 *
 * SSE streaming endpoint using Mastra createWorkflow pipeline
 */

import { NextRequest } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import type { StreamEvent } from '@/lib/types';
import { createGenerationWorkflow } from '@/lib/agents';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, projectId } = body;

  if (!prompt || !projectId) {
    return new Response(JSON.stringify({ error: 'Missing prompt or projectId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return createSSEStream(async (emit: (event: StreamEvent) => void) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' });

      // Create workflow with SSE emitter bound to steps
      // TODO: pass sandbox instance when integrated with Daytona lifecycle
      const workflow = createGenerationWorkflow(emit);
      const run = await workflow.createRun();

      const result = await run.start({
        inputData: { prompt, projectId },
      });

      if (result.status === 'success') {
        emit({
          type: 'checkpoint',
          label: 'Agent pipeline complete',
          status: 'complete',
        });
        emit({ type: 'stage_update', stage: 'complete' });
      } else {
        emit({
          type: 'error',
          message: `Workflow ${result.status}`,
          stage: 'error',
        });
      }
    } catch (error) {
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent pipeline failed',
        stage: 'error',
      });
    }
  });
}
