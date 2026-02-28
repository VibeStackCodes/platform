import type { Meta, StoryObj } from '@storybook/react'
import { Shimmer } from './shimmer'

const meta = {
  title: 'AI/Shimmer',
  component: Shimmer,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Shimmer>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Analyzing your request...',
  },
}

export const Heading: Story = {
  args: {
    children: 'Build a Todo Application',
    as: 'h2',
    className: 'text-2xl font-bold',
  },
}

export const SlowAnimation: Story = {
  args: {
    children: 'Generating your app, please wait...',
    duration: 4,
  },
}

export const FastAnimation: Story = {
  args: {
    children: 'Processing...',
    duration: 1,
  },
}

export const WideSpread: Story = {
  args: {
    children: 'Planning architecture and implementation steps',
    spread: 5,
    duration: 3,
  },
}

export const NarrowSpread: Story = {
  args: {
    children: 'Thinking carefully about the best approach',
    spread: 1,
  },
}

export const Span: Story = {
  args: {
    children: 'inline shimmer text',
    as: 'span',
    className: 'text-sm',
  },
  render: (args) => (
    <p className="text-muted-foreground">
      The agent is currently <Shimmer {...args} /> for this operation.
    </p>
  ),
}
