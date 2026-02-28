import type { Meta, StoryObj } from '@storybook/react'
import { HitlActions } from './hitl-actions'

const meta = {
  title: 'AI/HitlActions',
  component: HitlActions,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HitlActions>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    onApprove: () => console.log('Approved'),
    onRequestChanges: () => console.log('Request changes'),
  },
}

export const Approved: Story = {
  args: {
    approved: true,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    onApprove: () => console.log('Approved'),
    onRequestChanges: () => console.log('Request changes'),
  },
}
