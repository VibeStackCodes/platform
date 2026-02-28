import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { PromptBar } from './prompt-bar'

const meta = {
  title: 'Builder/PromptBar',
  component: PromptBar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onSubmit: fn(),
    onStop: fn(),
  },
} satisfies Meta<typeof PromptBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    status: 'ready',
    placeholder: 'Describe what you want to build...',
  },
}

export const Submitted: Story = {
  args: {
    status: 'submitted',
    placeholder: 'Describe what you want to build...',
  },
}

export const Streaming: Story = {
  args: {
    status: 'streaming',
    placeholder: 'Describe what you want to build...',
  },
}

export const Error: Story = {
  args: {
    status: 'error',
    placeholder: 'Describe what you want to build...',
  },
}

export const Disabled: Story = {
  args: {
    status: 'ready',
    disabled: true,
    placeholder: 'Generation in progress...',
  },
}

export const CustomPlaceholder: Story = {
  args: {
    status: 'ready',
    placeholder: 'Ask me to modify the app...',
  },
}
