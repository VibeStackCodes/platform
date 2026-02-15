/**
 * POST /api/agent
 * Unified agent route that bridges Mastra supervisor agent .network() to SSE streaming
 *
 * Request body:
 *   { message: string, projectId: string, model?: string }
 *
 * Response:
 *   SSE stream with StreamEvent types from lib/types.ts
 *
 * Credit enforcement:
 *   - Checks credits_remaining before starting
 *   - Returns 402 if insufficient credits
 *   - Deducts credits after completion (1 credit = 1,000 tokens)
 *   - Emits credits_used event to client
 */

import { NextRequest } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import type { StreamEvent } from '@/lib/types';
import { createAgentNetwork } from '@/lib/agents/registry';
import { isAllowedModel } from '@/lib/agents/provider';
import { getUser, createClient } from '@/lib/supabase-server';
import { checkCredits, deductCredits } from '@/lib/credits';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { message?: string; projectId?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { message, projectId, model = 'gpt-5.2' } = body;

  if (!message || !projectId) {
    return new Response(JSON.stringify({ error: 'Missing message or projectId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isAllowedModel(model)) {
    return new Response(JSON.stringify({ error: `Model "${model}" is not available` }), {
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

  // Credit check
  const supabase = await createClient();
  const credits = await checkCredits(supabase, user.id);
  if (!credits || credits.credits_remaining <= 0) {
    return new Response(
      JSON.stringify({
        error: 'insufficient_credits',
        credits_remaining: credits?.credits_remaining ?? 0,
        credits_reset_at: credits?.credits_reset_at ?? null,
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create per-request agent network with user's model + Helicone tracking
  const { supervisor } = createAgentNetwork(model, user.id);

  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    let totalTokens = 0;

    try {
      emit({ type: 'stage_update', stage: 'generating' });

      const result = await supervisor.network(message, {
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

          case 'agent-execution-end': {
            const agentTokens = payload.usage?.totalTokens ?? payload.tokensUsed ?? 0;
            totalTokens += agentTokens;
            emit({
              type: 'agent_complete',
              agentId: payload.agentId ?? 'unknown',
              tokensUsed: agentTokens,
              durationMs: payload.durationMs ?? 0,
            });
            break;
          }

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

      // Deduct credits after successful completion
      if (totalTokens > 0) {
        const creditsUsed = await deductCredits(supabase, {
          userId: user.id,
          projectId,
          model,
          eventType: 'generation',
          tokensInput: Math.round(totalTokens * 0.7),
          tokensOutput: Math.round(totalTokens * 0.3),
          tokensTotal: totalTokens,
        });

        const updatedCredits = await checkCredits(supabase, user.id);
        emit({
          type: 'credits_used',
          creditsUsed,
          creditsRemaining: updatedCredits?.credits_remaining ?? 0,
          tokensTotal: totalTokens,
        });
      }

      emit({ type: 'stage_update', stage: 'complete' });
    } catch (error) {
      // Still deduct credits on error (tokens were consumed)
      if (totalTokens > 0) {
        await deductCredits(supabase, {
          userId: user.id,
          projectId,
          model,
          eventType: 'generation',
          tokensInput: Math.round(totalTokens * 0.7),
          tokensOutput: Math.round(totalTokens * 0.3),
          tokensTotal: totalTokens,
        }).catch(console.error);
      }

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
