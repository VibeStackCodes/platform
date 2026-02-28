import type { Meta, StoryObj } from '@storybook/react'
import { ThinkingCard } from './thinking-card'

const meta = {
  title: 'AI/ThinkingCard',
  component: ThinkingCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ThinkingCard>

export default meta
type Story = StoryObj<typeof meta>

export const Thinking: Story = {
  args: {
    startedAt: Date.now() - 5000,
    status: 'thinking',
  },
}

export const Complete: Story = {
  args: {
    startedAt: Date.now() - 8000,
    status: 'complete',
    durationMs: 8432,
  },
}

export const WithContent: Story = {
  args: {
    startedAt: Date.now() - 12000,
    status: 'complete',
    durationMs: 12100,
    children:
      'I need to analyze the user request carefully. They want a React dashboard with real-time data updates. The best approach would be to use React Query for server state management combined with WebSocket subscriptions for live updates.',
  },
}
