import type { Meta, StoryObj } from '@storybook/react'
import { Reasoning, ReasoningContent, ReasoningTrigger } from './reasoning'

const meta = {
  title: 'AI/Reasoning',
  component: Reasoning,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Reasoning>

export default meta
type Story = StoryObj<typeof meta>

const sampleReasoningText = `Let me think through this step by step.

The user is asking about building a real-time dashboard. I need to consider:

1. **Data freshness requirements** — How often does data need to update? Every second, every minute?
2. **Scale** — How many concurrent users? This affects WebSocket vs polling decisions.
3. **Tech stack** — They're using React 19, so I can leverage concurrent features.

For real-time updates, I'll use WebSockets via Supabase's realtime subscriptions. This avoids polling overhead and provides instant updates.

For the metrics grid, I'll use Recharts with a streaming data pattern. The useTransition hook will keep the UI responsive even when large datasets are being processed.

My plan:
- Connect to Supabase realtime channel on mount
- Update React state via subscription callbacks
- Wrap expensive re-renders in useTransition
- Add a loading skeleton for initial data fetch`

export const Idle: Story = {
  args: {
    isStreaming: false,
    defaultOpen: false,
    duration: 4,
  },
  render: (args) => (
    <Reasoning {...args}>
      <ReasoningTrigger />
      <ReasoningContent>{sampleReasoningText}</ReasoningContent>
    </Reasoning>
  ),
}

export const Streaming: Story = {
  args: {
    isStreaming: true,
    defaultOpen: true,
  },
  render: (args) => (
    <Reasoning {...args}>
      <ReasoningTrigger />
      <ReasoningContent>
        {`Let me think through this carefully...

The user wants a payment integration. I should consider Stripe since it's already in their stack.

First, I'll need to...`}
      </ReasoningContent>
    </Reasoning>
  ),
}

export const Expanded: Story = {
  args: {
    isStreaming: false,
    defaultOpen: true,
    duration: 7,
  },
  render: (args) => (
    <Reasoning {...args}>
      <ReasoningTrigger />
      <ReasoningContent>{sampleReasoningText}</ReasoningContent>
    </Reasoning>
  ),
}

export const NoContent: Story = {
  args: {
    isStreaming: false,
    defaultOpen: false,
    duration: 2,
  },
  render: (args) => (
    <Reasoning {...args}>
      <ReasoningTrigger />
      <ReasoningContent>{'Short reasoning step.'}</ReasoningContent>
    </Reasoning>
  ),
}

export const CustomMessage: Story = {
  args: {
    isStreaming: false,
    defaultOpen: false,
    duration: 12,
  },
  render: (args) => (
    <Reasoning {...args}>
      <ReasoningTrigger
        getThinkingMessage={(isStreaming, duration) =>
          isStreaming ? 'Deep thinking...' : `Reasoned for ${duration}s`
        }
      />
      <ReasoningContent>{sampleReasoningText}</ReasoningContent>
    </Reasoning>
  ),
}
