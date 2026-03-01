import type { Meta, StoryObj } from '@storybook/react'
import { CreditDisplay } from './credit-display'

const meta = {
  title: 'VibeStack/CreditDisplay',
  component: CreditDisplay,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CreditDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    remaining: 800,
    monthly: 1000,
    plan: 'pro',
    resetAt: '2026-03-01T00:00:00Z',
  },
}

export const LowCredits: Story = {
  args: {
    remaining: 150,
    monthly: 1000,
    plan: 'pro',
    resetAt: '2026-03-01T00:00:00Z',
  },
}

export const Empty: Story = {
  args: {
    remaining: 0,
    monthly: 1000,
    plan: 'pro',
    resetAt: '2026-03-01T00:00:00Z',
  },
}

export const FreePlan: Story = {
  args: {
    remaining: 50,
    monthly: 200,
    plan: 'free',
    resetAt: null,
  },
}

export const FreePlanLow: Story = {
  args: {
    remaining: 30,
    monthly: 200,
    plan: 'free',
    resetAt: null,
  },
}
