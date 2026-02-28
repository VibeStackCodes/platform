import type { Meta, StoryObj } from '@storybook/react'
import {
  OpenIn,
  OpenInChatGPT,
  OpenInClaude,
  OpenInContent,
  OpenInCursor,
  OpenInScira,
  OpenInSeparator,
  OpenInT3,
  OpenInTrigger,
  OpenInv0,
} from './open-in-chat'

const meta = {
  title: 'AI/OpenInChat',
  component: OpenIn,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OpenIn>

export default meta
type Story = StoryObj<typeof meta>

const sampleQuery = 'Build me a React dashboard with authentication and real-time metrics'

export const AllProviders: Story = {
  args: {
    query: sampleQuery,
  },
  render: (args) => (
    <OpenIn {...args}>
      <OpenInTrigger />
      <OpenInContent>
        <OpenInChatGPT />
        <OpenInClaude />
        <OpenInSeparator />
        <OpenInT3 />
        <OpenInScira />
        <OpenInSeparator />
        <OpenInCursor />
        <OpenInv0 />
      </OpenInContent>
    </OpenIn>
  ),
}

export const AIAssistantsOnly: Story = {
  args: {
    query: sampleQuery,
  },
  render: (args) => (
    <OpenIn {...args}>
      <OpenInTrigger />
      <OpenInContent>
        <OpenInChatGPT />
        <OpenInClaude />
      </OpenInContent>
    </OpenIn>
  ),
}

export const DevToolsOnly: Story = {
  args: {
    query: 'Refactor this component to use the new React 19 use() hook',
  },
  render: (args) => (
    <OpenIn {...args}>
      <OpenInTrigger />
      <OpenInContent>
        <OpenInCursor />
        <OpenInv0 />
      </OpenInContent>
    </OpenIn>
  ),
}

export const LongQuery: Story = {
  args: {
    query:
      'Create a full-stack e-commerce application with React, TypeScript, Supabase, Stripe payments, product catalog, shopping cart, order management, user authentication, and an admin dashboard',
  },
  render: (args) => (
    <OpenIn {...args}>
      <OpenInTrigger />
      <OpenInContent>
        <OpenInChatGPT />
        <OpenInClaude />
        <OpenInSeparator />
        <OpenInT3 />
        <OpenInScira />
      </OpenInContent>
    </OpenIn>
  ),
}
