import type { Meta, StoryObj } from '@storybook/react'
import { MessageResponse } from './message-response'

const meta = {
  title: 'AI/MessageResponse',
  component: MessageResponse,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MessageResponse>

export default meta
type Story = StoryObj<typeof meta>

export const SimpleText: Story = {
  args: {
    children: 'Hello! How can I help you today?',
  },
}

export const Markdown: Story = {
  args: {
    children: `# Getting Started

Here is a quick overview of what I can do:

- **Generate** full React applications from a description
- **Edit** existing code intelligently
- **Debug** build errors automatically

## Next Steps

1. Describe your app idea
2. I'll generate the scaffold
3. We iterate together

> The best apps are built collaboratively.

Let me know what you'd like to build!`,
  },
}

export const WithCode: Story = {
  args: {
    children: `I've updated the \`Button\` component to support a new \`loading\` prop:

\`\`\`tsx
interface ButtonProps {
  loading?: boolean
  children: React.ReactNode
}

export function Button({ loading, children }: ButtonProps) {
  return (
    <button disabled={loading}>
      {loading ? <Spinner /> : children}
    </button>
  )
}
\`\`\`

You can now use it like this:

\`\`\`tsx
<Button loading={isSubmitting}>Save Changes</Button>
\`\`\``,
  },
}

export const ShortResponse: Story = {
  args: {
    children: 'Done! I\'ve added the authentication middleware.',
  },
}

export const LongResponse: Story = {
  args: {
    children: `I've analyzed your request and here's my plan:

## Architecture Overview

The app will follow a **feature-first** architecture with the following structure:

### Core Features

1. **Authentication** — Supabase Auth with email/password and Google OAuth
2. **Dashboard** — Real-time metrics with Recharts
3. **Settings** — User preferences, billing, notifications

### Database Schema

\`\`\`sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TanStack Router |
| Styling | Tailwind CSS v4 |
| Backend | Hono, Drizzle ORM |
| Auth | Supabase |
| Payments | Stripe |

Starting with the scaffold now...`,
  },
}
