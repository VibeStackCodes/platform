import type { Meta, StoryObj } from '@storybook/react'

import { Progress } from './progress'

const meta = {
  title: 'UI/Progress',
  component: Progress,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    className: 'w-[360px]',
  },
} satisfies Meta<typeof Progress>

export default meta
type Story = StoryObj<typeof meta>

// ── Values ────────────────────────────────────────────────────────────────────

export const Zero: Story = {
  name: 'Value / 0%',
  args: { value: 0 },
}

export const TwentyFive: Story = {
  name: 'Value / 25%',
  args: { value: 25 },
}

export const Fifty: Story = {
  name: 'Value / 50%',
  args: { value: 50 },
}

export const SeventyFive: Story = {
  name: 'Value / 75%',
  args: { value: 75 },
}

export const Complete: Story = {
  name: 'Value / 100%',
  args: { value: 100 },
}

// ── Contextual examples ───────────────────────────────────────────────────────

export const BuildProgress: Story = {
  name: 'Build Progress',
  render: () => (
    <div className="w-[360px] space-y-3">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Build in progress…</span>
        <span className="font-medium">68%</span>
      </div>
      <Progress value={68} />
    </div>
  ),
}

export const CreditUsage: Story = {
  name: 'Credit Usage',
  render: () => (
    <div className="w-[360px] space-y-3">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Credits used</span>
        <span className="font-medium">340 / 1000</span>
      </div>
      <Progress value={34} />
    </div>
  ),
}

export const AllValues: Story = {
  name: 'All Values',
  render: () => (
    <div className="w-[360px] space-y-4">
      {[0, 25, 50, 75, 100].map((v) => (
        <div key={v} className="space-y-1">
          <p className="text-xs text-muted-foreground">{v}%</p>
          <Progress value={v} />
        </div>
      ))}
    </div>
  ),
}
