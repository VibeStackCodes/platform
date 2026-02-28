import type { Meta, StoryObj } from '@storybook/react'
import { PlanBlock } from './plan-block'

const meta = {
  title: 'AI/PlanBlock',
  component: PlanBlock,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PlanBlock>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Project Plan \u2014 TaskFlow',
    items: [
      {
        title: 'Authentication',
        description:
          'Implement sign-up, login, and session management using Supabase Auth with email and OAuth providers.',
      },
      {
        title: 'Kanban Board',
        description:
          'Build a drag-and-drop board with swim lanes for Backlog, In Progress, Review, and Done using @dnd-kit.',
      },
      {
        title: 'Task Management',
        description:
          'Create, edit, assign, and delete tasks with due dates, priority labels, and rich-text descriptions.',
      },
      {
        title: 'Realtime Sync',
        description:
          'Subscribe to Supabase Realtime channels so all board updates propagate instantly to connected users.',
      },
      {
        title: 'Notifications',
        description:
          'In-app toast alerts and an activity feed for task assignments, comments, and deadline reminders.',
      },
      {
        title: 'Responsive UI',
        description:
          'Ensure the board, sidebar, and modals adapt gracefully across mobile, tablet, and desktop breakpoints.',
      },
    ],
  },
}

export const ShortPlan: Story = {
  args: {
    title: 'Implementation Steps',
    items: [
      {
        title: 'Scaffold project',
        description: 'Initialise Vite + React with Tailwind v4 and shadcn/ui components pre-installed.',
      },
      {
        title: 'Build core UI',
        description: 'Create the landing page, navigation, and primary feature screens.',
      },
      {
        title: 'Wire up API',
        description: 'Connect the frontend to the Hono backend and validate data with Zod schemas.',
      },
    ],
  },
}

export const LongPlan: Story = {
  args: {
    title: 'Full Stack Architecture',
    items: [
      {
        title: 'Database schema',
        description: 'Design normalised Postgres tables with Drizzle ORM and generate type-safe query functions.',
      },
      {
        title: 'Auth layer',
        description: 'Configure Supabase Auth with RLS policies, row-level security, and JWT validation middleware.',
      },
      {
        title: 'API routes',
        description: 'Build Hono route handlers for CRUD operations, protected by the auth middleware.',
      },
      {
        title: 'React Query integration',
        description:
          'Set up TanStack Query with optimistic updates, infinite scroll, and background refetch strategies.',
      },
      {
        title: 'File uploads',
        description: 'Stream files directly to Supabase Storage using presigned URLs and track progress client-side.',
      },
      {
        title: 'Search & filtering',
        description: 'Add full-text search via Postgres tsvector columns with debounced client-side query params.',
      },
      {
        title: 'Email notifications',
        description: 'Trigger transactional emails through Resend using Supabase Edge Function webhooks.',
      },
      {
        title: 'CI/CD pipeline',
        description:
          'Configure GitHub Actions to run type-check, lint, and Playwright E2E tests before merging to main.',
      },
      {
        title: 'Observability',
        description: 'Instrument the Hono server with Sentry and export LLM traces to Langfuse for monitoring.',
      },
    ],
  },
}
