import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { ToolActivity } from './tool-activity'
import { runningSteps, completeSteps, errorSteps } from './tool-activity.fixtures'

const meta = {
  title: 'AI/ToolActivity',
  component: ToolActivity,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onPanelOpen: fn(),
  },
} satisfies Meta<typeof ToolActivity>

export default meta
type Story = StoryObj<typeof meta>

export const InProgress: Story = {
  args: {
    steps: runningSteps,
  },
}

export const Complete: Story = {
  args: {
    steps: completeSteps,
  },
}

export const WithErrors: Story = {
  args: {
    steps: errorSteps,
  },
}

export const SingleStep: Story = {
  args: {
    steps: [
      {
        id: 'only-step',
        tool: 'createSandbox',
        label: 'Creating sandbox environment',
        status: 'running',
        startedAt: Date.now(),
      },
    ],
  },
}

export const WithoutPanelCallback: Story = {
  name: 'WithoutPanelOpenCallback',
  args: {
    steps: completeSteps,
    onPanelOpen: undefined,
  },
}
