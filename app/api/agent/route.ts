/**
 * POST /api/agent
 * Unified agent route that bridges Mastra supervisor agent .network() to SSE streaming
 *
 * Request body:
 *   { message: string, projectId: string }
 *
 * Response:
 *   SSE stream with StreamEvent types from lib/types.ts
 */

import { NextRequest } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import type { StreamEvent } from '@/lib/types';
import { supervisorAgent } from '@/lib/agents/registry';
import { getUser } from '@/lib/supabase-server';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { message?: string; projectId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { message, projectId } = body;

  if (!message || !projectId) {
    return new Response(JSON.stringify({ error: 'Missing message or projectId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth check (getUser handles mock mode internally)
  const user = await getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return createSSEStream(async (emit: (event: StreamEvent) => void) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' });

      const result = await supervisorAgent.network(message, {
        memory: {
          thread: projectId,
          resource: user.id,
        },
      });

      for await (const chunk of result) {
        switch (chunk.type) {
          case 'agent-execution-start':
            emit({
              type: 'agent_start',
              agentId: chunk.payload?.agentId ?? 'unknown',
              agentName: chunk.payload?.agentName ?? 'Agent',
              phase: 0,
            });
            break;

          case 'agent-execution-event-text-delta':
            emit({
              type: 'agent_progress',
              agentId: chunk.payload?.agentId ?? 'unknown',
              message: chunk.payload?.textDelta ?? '',
            });
            break;

          case 'agent-execution-end':
            emit({
              type: 'agent_complete',
              agentId: chunk.payload?.agentId ?? 'unknown',
              tokensUsed: chunk.payload?.tokensUsed ?? 0,
              durationMs: chunk.payload?.durationMs ?? 0,
            });
            break;

          case 'tool-execution-end':
            if (chunk.payload?.toolName === 'write-file') {
              emit({
                type: 'file_complete',
                path: chunk.payload?.result?.path ?? '',
                linesOfCode: chunk.payload?.result?.bytesWritten ?? 0,
              });
            } else {
              emit({
                type: 'agent_artifact',
                agentId: chunk.payload?.agentId ?? 'unknown',
                artifactType: 'tool-result',
                artifactName: chunk.payload?.toolName ?? 'unknown',
              });
            }
            break;

          case 'network-execution-event-step-finish':
            emit({
              type: 'checkpoint',
              label: 'Network step complete',
              status: 'complete',
            });
            break;

          case 'workflow-execution-suspended':
            emit({
              type: 'plan_ready',
              plan: chunk.payload?.suspendPayload ?? {},
            });
            break;
        }
      }

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
