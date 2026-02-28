import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { PlanApprovalCard } from './plan-approval-card'

const meta = {
  title: 'AI/PlanApprovalCard',
  component: PlanApprovalCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PlanApprovalCard>

export default meta
type Story = StoryObj<typeof meta>

const detailedPlan = {
  appName: 'TodoFlow',
  appDescription:
    'A modern, real-time task management app with authentication, drag-and-drop reordering, and dark mode support.',
  prd: `## Product Requirements

### Core Features
- **Authentication**: Email/password via Supabase Auth
- **Todo CRUD**: Create, read, update, delete todos
- **Real-time sync**: Live updates via Supabase Realtime
- **Drag-and-drop**: Reorder todos with @dnd-kit
- **Dark mode**: System preference + manual toggle

### Tech Stack
- React 19 + TanStack Router
- Supabase (Auth + Realtime + PostgreSQL)
- Tailwind CSS v4 + shadcn/ui
- @dnd-kit for drag-and-drop

### Database Schema
\`\`\`sql
create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text not null,
  completed boolean default false,
  order_index integer default 0,
  created_at timestamptz default now()
);
\`\`\``,
}

export const Pending: Story = {
  args: {
    plan: detailedPlan,
    onApprove: fn(),
    status: 'pending',
  },
}

export const Approved: Story = {
  args: {
    plan: detailedPlan,
    onApprove: fn(),
    status: 'approved',
  },
}

export const MinimalPlan: Story = {
  args: {
    plan: {
      appName: 'My App',
    },
    onApprove: fn(),
    status: 'pending',
  },
}

export const NoAppName: Story = {
  args: {
    plan: {
      appDescription: 'A simple todo app with React and Tailwind CSS.',
    },
    onApprove: fn(),
    status: 'pending',
  },
}
