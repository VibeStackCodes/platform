import { streamText, tool, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { getUser } from '@/lib/supabase-server';
import { z } from 'zod';

export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: `You are an AI app builder assistant. Help the user describe their app idea by asking clarifying questions about features, design, and functionality. Once you have enough information, present a structured plan using the show_plan tool.

Be concise and decisive. Default to modern, sensible choices:
- Style: modern, minimal
- Color: blue (#3b82f6)
- Font: Inter
- Auth: Supabase Auth
- Database: PostgreSQL with Supabase`,
    messages,
    tools: {
      thinking_steps: tool({
        description: 'Internal reasoning steps before presenting plan',
        inputSchema: z.object({
          steps: z.array(z.string()),
        }),
        execute: async ({ steps }) => ({ steps }),
      }),
      show_plan: tool({
        description: 'Present the app generation plan for user approval',
        inputSchema: z.object({
          appName: z.string(),
          appDescription: z.string(),
          features: z.array(z.object({
            description: z.string(),
            category: z.enum(['auth', 'crud', 'realtime', 'dashboard', 'messaging', 'ui']),
            entity: z.object({
              name: z.string(),
              fields: z.array(z.object({
                name: z.string(),
                type: z.enum(['text', 'number', 'boolean', 'enum', 'uuid', 'timestamp', 'json']),
                required: z.boolean(),
                enumValues: z.array(z.string()).optional(),
              })),
              belongsTo: z.array(z.string()).optional(),
            }).optional(),
          })),
          designTokens: z.object({
            primaryColor: z.string(),
            accentColor: z.string(),
            fontFamily: z.string(),
            spacing: z.enum(['compact', 'comfortable', 'spacious']),
            borderRadius: z.enum(['none', 'small', 'medium', 'large']),
          }),
          shadcnComponents: z.array(z.string()),
        }),
        execute: async (input) => input,
      }),
    },
    stopWhen: stepCountIs(10),
    maxOutputTokens: 16384,
  });

  return result.toUIMessageStreamResponse();
}
