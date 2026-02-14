/**
 * Generation API Route v2 (Agent Pipeline)
 *
 * SSE streaming endpoint using the 4-agent Mastra pipeline with plan approval
 */

import { NextRequest } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import type { StreamEvent } from '@/lib/types';
import { runGenerationWorkflow, TraceCollector } from '@/lib/agents';
import type { AgentEvent } from '@/lib/agents';

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
    const collector = new TraceCollector(projectId);

    // Bridge AgentEvent to StreamEvent
    const emitAgentEvent = (event: AgentEvent) => {
      collector.record(event);
      // AgentEvent types match StreamEvent types we added
      emit(event as StreamEvent);
    };

    try {
      emit({ type: 'stage_update', stage: 'generating' });

      const workflow = runGenerationWorkflow(prompt, emitAgentEvent);

      // Step through the async generator
      let result = await workflow.next();

      while (!result.done) {
        const state = result.value;

        if (state.phase === 'awaiting-approval') {
          // Emit plan for client display
          emit({
            type: 'plan_ready',
            plan: state.plan as Record<string, unknown>,
          } as StreamEvent);

          // Auto-approve for now (future: suspend and wait for user)
          result = await workflow.next(true);
        } else {
          result = await workflow.next();
        }
      }

      // Emit summary
      const summary = collector.getSummary();
      emit({
        type: 'checkpoint',
        label: `Agent pipeline complete: ${summary.completedAgents} agents, ${summary.totalTokens} tokens`,
        status: 'complete',
      });

      emit({ type: 'stage_update', stage: 'complete' });

    } catch (error) {
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent pipeline failed',
        stage: 'error',
      });
    }
  });
}
