import { z } from 'zod';
import { tool } from 'ai';
import {
  FeatureSpecSchema,
  DesignTokensSchema,
} from './schemas';

/**
 * Chat Tool Definitions
 *
 * Tools for the conversational builder flow:
 * 1. ask_clarifying_question — brainstorm phase
 * 2. thinking_steps — show planning thought process
 * 3. show_plan — present ChatPlan (features + entities) for approval
 * 4. start_generation — kick off the template pipeline
 * 5. edit_code — LSP-powered edit after generation (Phase 4)
 */

interface ChatToolContext {
  projectId?: string;
  model?: string;
}

export function createChatTools(context: ChatToolContext = {}) {
  return {
    ask_clarifying_question: tool({
      description:
        'Ask the user a clarifying question to better understand what they want to build. Use this during the brainstorming phase. Ask one question at a time.',
      inputSchema: z.object({
        question: z.string().describe('The clarifying question to ask'),
        options: z
          .array(z.string())
          .optional()
          .describe('Optional multiple-choice options to help the user answer'),
      }),
      execute: async ({ question, options }) => {
        return { question, options };
      },
    }),

    show_plan: tool({
      description:
        'Present the app plan with structured features and entities. Call this after gathering enough information. The plan will be shown with an approve button.',
      inputSchema: z.object({
        appName: z.string().describe('Short name for the app (2-4 words)'),
        appDescription: z.string().describe('2-3 sentence description of the app'),
        features: z.array(FeatureSpecSchema).describe('5-10 structured features with categories and entities'),
        designTokens: DesignTokensSchema.describe('Visual design tokens'),
        shadcnComponents: z.array(z.string()).describe('UI components needed from: accordion, alert, avatar, badge, checkbox, dialog, dropdown-menu, popover, progress, radio-group, scroll-area, select, separator, switch, table, tabs, textarea, tooltip'),
      }),
      execute: async (input) => {
        return input;
      },
    }),

    thinking_steps: tool({
      description:
        'Show the user what you are thinking about while planning. Call this BEFORE show_plan to make your reasoning visible. Each step represents a phase of your analysis.',
      inputSchema: z.object({
        steps: z.array(
          z.object({
            label: z.string().describe('Short step name, e.g. "Analyzing requirements"'),
            description: z.string().optional().describe('Brief detail about this step'),
          })
        ).describe('3-5 planning steps showing your thought process'),
      }),
      execute: async ({ steps }) => {
        return { steps };
      },
    }),

    start_generation: tool({
      description:
        'Start the code generation pipeline. Only call this AFTER the user has explicitly approved the plan.',
      inputSchema: z.object({
        approved: z.boolean().describe('Must be true — confirms user approved the plan'),
      }),
      execute: async ({ approved }) => {
        if (!approved) {
          return { status: 'error' as const, message: 'Plan must be approved before generation' };
        }
        return { status: 'started' as const };
      },
    }),

    edit_code: tool({
      description:
        'Edit the generated app based on user instructions. Use after the app has been generated and the user asks to change, fix, add, or modify something.',
      inputSchema: z.object({
        instruction: z.string().describe('What to change in the app'),
        searchQueries: z
          .array(z.string())
          .describe('1-3 symbol names or keywords to find relevant files (e.g. component names, function names)'),
        reasoning: z
          .string()
          .describe('Brief explanation of what needs to change and why'),
      }),
      execute: async ({ instruction, searchQueries, reasoning }) => {
        if (!context.projectId) {
          return { status: 'error', message: 'No project to edit' };
        }

        const { findSandboxByProject } = await import('@/lib/sandbox');
        const { executeEdit } = await import('@/lib/edit-executor');

        const sandbox = await findSandboxByProject(context.projectId);
        if (!sandbox) {
          return { status: 'error', message: 'No sandbox found for this project' };
        }

        return await executeEdit({
          sandbox,
          instruction,
          searchQueries,
          reasoning,
          model: context.model || 'gpt-5.2',
        });
      },
    }),
  };
}

/** Backwards-compatible export for code that doesn't need edit context */
export const chatTools = createChatTools();
