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

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { getUserCredits } from '../lib/db/queries';
import { db } from '../lib/db/client';
import { sql } from 'drizzle-orm';
import { createSSEStream } from '../lib/sse';
import type { StreamEvent } from '../../lib/types';
import { mastra } from '../../src/mastra/index';
import { RequestContext } from '../lib/agents/registry';
import { isAllowedModel, createHeliconeProvider } from '../lib/agents/provider';

export const agentRoutes = new Hono();

// Apply auth middleware to all routes
agentRoutes.use('*', authMiddleware);

/**
 * POST /api/agent
 * Stream agent execution via SSE
 */
agentRoutes.post('/', async (c) => {
  // Parse request body
  let body: { message?: string; projectId?: string; model?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const { message, projectId, model = 'gpt-5.2' } = body;

  // Validate required fields
  if (!message || !projectId) {
    return c.json({ error: 'Missing message or projectId' }, 400);
  }

  // Validate model
  if (!isAllowedModel(model)) {
    return c.json({ error: `Model "${model}" is not available` }, 400);
  }

  // Get authenticated user from middleware
  const user = c.var.user;

  // Credit check using Drizzle
  const credits = await getUserCredits(user.id);
  if (!credits || credits.creditsRemaining <= 0) {
    return c.json(
      {
        error: 'insufficient_credits',
        credits_remaining: credits?.creditsRemaining ?? 0,
        credits_reset_at: credits?.creditsResetAt ?? null,
      },
      402
    );
  }

  // Inject per-request Helicone-proxied model via RequestContext
  const requestContext = new RequestContext();
  requestContext.set('llm', createHeliconeProvider(user.id)(model));
  requestContext.set('userId', user.id);

  const supervisor = mastra.getAgent('supervisor');

  // Return SSE stream — createSSEStream returns a Response which Hono can return
  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    try {
      emit({ type: 'stage_update', stage: 'generating' });

      const execution = await supervisor.network(message, {
        memory: {
          thread: projectId,
          resource: user.id,
        },
        requestContext,
        maxSteps: 50,
      });

      for await (const chunk of execution) {
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
          // --- Routing agent events (supervisor analyzing/delegating) ---
          case 'routing-agent-start':
            emit({
              type: 'stage_update',
              stage: 'planning',
            });
            break;

          case 'routing-agent-end':
            emit({
              type: 'checkpoint',
              label: `Delegating to ${payload.selectedPrimitive ?? 'agent'}`,
              status: 'active',
            });
            break;

          // --- Delegated agent execution events ---
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

          // --- Tool execution events ---
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
            } else if (payload.toolName === 'ask-clarifying-questions') {
              // Extract questions from the tool's input (not output)
              const toolInput = payload.input as Record<string, unknown> | undefined;
              const questions = toolInput?.questions;
              if (Array.isArray(questions)) {
                emit({
                  type: 'clarification_request',
                  questions: questions as Array<{
                    question: string;
                    selectionMode: 'single' | 'multiple';
                    options: Array<{ label: string; description: string }>;
                  }>,
                });
              }
            } else {
              emit({
                type: 'agent_artifact',
                agentId: payload.agentId ?? payload.primitiveId ?? 'unknown',
                artifactType: 'tool-result',
                artifactName: payload.toolName ?? 'unknown',
              });
            }
            break;

          // --- Network lifecycle events ---
          case 'network-execution-event-step-finish':
            emit({
              type: 'checkpoint',
              label: 'Network step complete',
              status: 'complete',
            });
            break;

          case 'network-execution-event-finish':
            emit({
              type: 'checkpoint',
              label: 'Pipeline complete',
              status: 'complete',
            });
            break;

          // --- Workflow events (suspend/resume) ---
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

      // Use accurate token counts from network execution
      const tokenUsage = await execution.usage;
      const totalTokens = tokenUsage.totalTokens;

      // Deduct credits after successful completion
      if (totalTokens > 0) {
        const creditsUsed = Math.ceil(totalTokens / 1000);

        // Deduct credits via Postgres function (matches original RPC call)
        await db.execute(sql`SELECT deduct_credits(
          ${user.id}::uuid,
          ${creditsUsed}::int,
          ${projectId}::uuid,
          ${model}::text,
          ${'generation'}::text,
          ${tokenUsage.inputTokens}::int,
          ${tokenUsage.outputTokens}::int,
          ${totalTokens}::int
        )`);

        const updatedCredits = await getUserCredits(user.id);
        emit({
          type: 'credits_used',
          creditsUsed,
          creditsRemaining: updatedCredits?.creditsRemaining ?? 0,
          tokensTotal: totalTokens,
        });
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
});
