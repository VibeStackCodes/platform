import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { UIMessage } from 'ai';
import { resolveModel } from '@/lib/models';
import { chatTools } from '@/lib/chat-tools';
import { BUILDER_SYSTEM_PROMPT } from '@/lib/system-prompt';
import { createClient } from '@/lib/supabase-server';
import { MOCK_CHAT_PLAN } from '@/lib/mock-data';

/**
 * Architecture Note: Chat route uses AI SDK (not direct OpenAI SDK) for useChat compatibility.
 * The generation pipeline (planner, generator, verifier) uses OpenAI SDK directly
 * to access features like structured outputs, parallel function calls, and predicted outputs.
 */

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!MOCK_MODE) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const { messages, projectId: _projectId, model: modelId = 'claude-sonnet-4-5-20250929' } =
    (await req.json()) as {
      messages: UIMessage[];
      projectId: string;
      model?: string;
    };

  if (MOCK_MODE) {
    return buildMockChatResponse(messages);
  }

  // On first user message, kick off early provisioning (fire-and-forget)
  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length === 1 && _projectId) {
    const supabase = await createClient();
    const firstMessage = userMessages[0];
    const textParts = firstMessage.parts.filter((p) => p.type === 'text');
    const promptText = textParts.length > 0 && 'text' in textParts[0]
      ? textParts[0].text
      : 'New Project';
    import('@/lib/sandbox').then(({ provisionProject }) => {
      // Use projectId as temp name — the plan's appName isn't known yet at this point.
      // The generate route will use chatPlan.appName for the real Supabase project.
      provisionProject(_projectId, `vibestack-${_projectId.slice(0, 8)}`, supabase).catch(console.error);
    });
  }

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: resolveModel(modelId),
    system: BUILDER_SYSTEM_PROMPT,
    messages: modelMessages,
    tools: chatTools,
    stopWhen: stepCountIs(10),
    maxOutputTokens: 16384,
  });

  return result.toUIMessageStreamResponse();
}

/**
 * Build V3 stream result for a tool call.
 * Uses tool-input-start → tool-input-delta → tool-input-end → finish parts.
 */
function toolCallStreamResult(toolCallId: string, toolName: string, args: unknown) {
  const argsStr = JSON.stringify(args);
  const parts = [
    { type: 'tool-input-start' as const, id: toolCallId, toolName },
    { type: 'tool-input-delta' as const, id: toolCallId, delta: argsStr },
    { type: 'tool-input-end' as const, id: toolCallId },
    { type: 'tool-call' as const, toolCallId, toolName, input: argsStr },
    { type: 'finish' as const, finishReason: 'tool-calls' as const, usage: { inputTokens: 0, outputTokens: 0 } },
  ];

  return {
    stream: new ReadableStream({
      async start(controller) {
        for (const part of parts) {
          await new Promise((r) => setTimeout(r, 50));
          controller.enqueue(part);
        }
        controller.close();
      },
    }),
  };
}

/**
 * Mock chat response that simulates brainstorm → plan flow.
 *
 * Turn 1: clarifying question
 * Turn 2: thinking_steps showing planning process
 * Turn 3: show_plan with full fixture plan
 * Turn 4: start_generation
 * Turn 5+: edit response as plain text
 */
function buildMockChatResponse(messages: UIMessage[]) {
  const userMessages = messages.filter((m) => m.role === 'user');
  const turnNumber = userMessages.length;

  let streamResult: ReturnType<typeof toolCallStreamResult>;

  if (turnNumber <= 1) {
    streamResult = toolCallStreamResult('mock-q1', 'ask_clarifying_question', {
      question: 'What kind of tasks will users manage? Are these personal tasks or team-based with collaboration?',
      options: ['Personal task list', 'Team collaboration', 'Both personal and team'],
    });
  } else if (turnNumber === 2) {
    streamResult = toolCallStreamResult('mock-thinking', 'thinking_steps', {
      steps: [
        { label: 'Analyzing requirements', description: 'Identifying core features and constraints' },
        { label: 'Designing database schema', description: 'Planning tables, RLS policies, and relations' },
        { label: 'Planning file architecture', description: 'Organizing files by dependency layers' },
        { label: 'Selecting dependencies', description: 'Choosing npm packages and versions' },
      ],
    });
  } else if (turnNumber === 3) {
    streamResult = toolCallStreamResult('mock-plan', 'show_plan', MOCK_CHAT_PLAN);
  } else {
    // Turn 4+: simulate edit response — reuse toolCallStreamResult pattern
    // but emit a simple text-delta instead of tool-input parts
    const editText = "I've updated 2 files based on your instruction: `src/components/header.tsx` and `src/index.css`. The changes have been applied and the build verified successfully.";
    streamResult = {
      stream: new ReadableStream({
        async start(controller) {
          controller.enqueue({ type: 'text-start' as const, id: 'edit-delta' });
          controller.enqueue({ type: 'text-delta' as const, id: 'edit-delta', delta: editText });
          controller.enqueue({ type: 'finish' as const, finishReason: 'stop' as const, usage: { inputTokens: 0, outputTokens: 0 } });
          controller.close();
        },
      }),
    };

  }

  const mockModel = new MockLanguageModelV3({
    doStream: streamResult as any,
  });

  const result = streamText({
    model: mockModel,
    messages: [{ role: 'user', content: 'mock' }],
    tools: chatTools,
    maxOutputTokens: 4096,
  });

  return result.toUIMessageStreamResponse();
}
