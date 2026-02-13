import type { ChatPlan } from './types';

/**
 * Mock fixture data for testing the UI without burning LLM tokens.
 * Activated by NEXT_PUBLIC_MOCK_MODE=true in .env.local
 */

export const MOCK_CHAT_PLAN: ChatPlan = {
  appName: 'TaskFlow',
  appDescription: 'A collaborative task management app with real-time updates and team workspaces',
  features: [
    {
      description: 'Email/password authentication with Supabase Auth',
      category: 'auth',
    },
    {
      description: 'Create, read, update, delete tasks with status tracking',
      category: 'crud',
      entity: {
        name: 'task',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'description', type: 'text', required: false },
          { name: 'status', type: 'enum', required: true, enumValues: ['todo', 'in_progress', 'done'] },
          { name: 'priority', type: 'enum', required: true, enumValues: ['low', 'medium', 'high'] },
        ],
        belongsTo: ['team'],
      },
    },
    {
      description: 'Team workspace with member management',
      category: 'crud',
      entity: {
        name: 'team',
        fields: [
          { name: 'name', type: 'text', required: true },
        ],
      },
    },
    {
      description: 'Real-time task updates across team members',
      category: 'realtime',
      entity: {
        name: 'task',
        fields: [],
      },
    },
    {
      description: 'Dashboard with task statistics and filters',
      category: 'dashboard',
    },
  ],
  designTokens: {
    primaryColor: '#6366f1',
    accentColor: '#f59e0b',
    fontFamily: 'Inter',
    spacing: 'comfortable',
    borderRadius: 'medium',
  },
  shadcnComponents: ['dialog', 'badge', 'avatar', 'tabs', 'select', 'textarea'],
};

// Keep backward-compat alias
export const MOCK_PLAN = MOCK_CHAT_PLAN;

/**
 * Mock file contents for simulating file generation.
 * Each file gets a realistic-looking stub.
 */
export function getMockFileContent(path: string): string {
  const stubs: Record<string, string> = {
    'lib/types/task.ts': `import { z } from 'zod';

export const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(['todo', 'in_progress', 'done']),
  priority: z.enum(['low', 'medium', 'high']),
  teamId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Task = z.infer<typeof taskSchema>;
`,
  };

  return stubs[path] || `// Generated: ${path}\nexport {};\n`;
}
