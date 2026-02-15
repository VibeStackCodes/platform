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

  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' });

      const result = await supervisorAgent.network(message, {
        memory: {
          thread: projectId,
          resource: user.id,
        },
      });

      for await (const chunk of result) {
        // Break early if client disconnected
        if (signal.aborted) {
          console.log('[agent] Client disconnected, stopping stream');
          break;
        }

        // Cast payload for flexible access — Mastra's NetworkChunkType
        // has strict types but runtime payloads may include extra fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = (chunk as any).payload ?? {};

        switch (chunk.type) {
          case 'agent-execution-start':
            emit({
              type: 'agent_start',
              agentId: payload.agentId ?? 'unknown',
              agentName: payload.agentName ?? payload.agentId ?? 'Agent',
              phase: 0,
            });
            break;

          case 'agent-execution-event-text-delta':
            emit({
              type: 'agent_progress',
              agentId: payload.agentId ?? payload?.payload?.id ?? 'unknown',
              message: payload.text ?? payload?.payload?.text ?? payload.textDelta ?? '',
            });
            break;

          case 'agent-execution-end':
            emit({
              type: 'agent_complete',
              agentId: payload.agentId ?? 'unknown',
              tokensUsed: payload.usage?.totalTokens ?? payload.tokensUsed ?? 0,
              durationMs: payload.durationMs ?? 0,
            });
            break;

          case 'tool-execution-start':
            emit({
              type: 'agent_artifact',
              agentId: payload.agentId ?? payload.primitiveId ?? 'unknown',
              artifactType: 'tool-start',
              artifactName: payload.toolName ?? 'unknown',
            });
            break;

          case 'tool-execution-end':
            if (payload.toolName === 'write-file') {
              const toolResult = payload.result as Record<string, unknown> | undefined;
              emit({
                type: 'file_complete',
                path: (toolResult?.path as string) ?? '',
                linesOfCode: (toolResult?.bytesWritten as number) ?? 0,
              });
            } else {
              emit({
                type: 'agent_artifact',
                agentId: payload.agentId ?? payload.primitiveId ?? 'unknown',
                artifactType: 'tool-result',
                artifactName: payload.toolName ?? 'unknown',
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
              plan: payload.suspendPayload ?? {},
            });
            break;

          default:
            // Log unhandled chunk types for debugging (non-critical)
            if (process.env.NODE_ENV === 'development') {
              console.log(`[agent] Unhandled chunk type: ${chunk.type}`, JSON.stringify(payload).slice(0, 200));
            }
            break;
        }
      }

      emit({ type: 'stage_update', stage: 'complete' });
    } catch (error) {
      if (signal.aborted) {
        console.log('[agent] Stream aborted by client');
        return;
      }
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent pipeline failed',
        stage: 'error',
      });
    }
  });
}
