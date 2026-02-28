import type { Meta, StoryObj } from '@storybook/react'

import { Skeleton } from './skeleton'

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

// ── Shapes ────────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: { className: 'h-4 w-[250px]' },
}

export const Avatar: Story = {
  name: 'Shape / Avatar',
  render: () => <Skeleton className="size-12 rounded-full" />,
}

export const Pill: Story = {
  name: 'Shape / Pill (Badge)',
  render: () => <Skeleton className="h-5 w-16 rounded-full" />,
}

export const Button: Story = {
  name: 'Shape / Button',
  render: () => <Skeleton className="h-9 w-24 rounded-md" />,
}

// ── Sizes ─────────────────────────────────────────────────────────────────────

export const Narrow: Story = {
  name: 'Size / Narrow',
  render: () => <Skeleton className="h-4 w-[120px]" />,
}

export const Wide: Story = {
  name: 'Size / Wide',
  render: () => <Skeleton className="h-4 w-[400px]" />,
}

export const Tall: Story = {
  name: 'Size / Tall (Image placeholder)',
  render: () => <Skeleton className="h-48 w-[360px] rounded-xl" />,
}

// ── Compositions ──────────────────────────────────────────────────────────────

export const CardSkeleton: Story = {
  name: 'Composition / Card',
  render: () => (
    <div className="flex w-[360px] flex-col gap-4 rounded-xl border p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[140px]" />
          <Skeleton className="h-3 w-[100px]" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[80%]" />
        <Skeleton className="h-4 w-[60%]" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  ),
}

export const ChatMessageSkeleton: Story = {
  name: 'Composition / Chat Message',
  render: () => (
    <div className="flex w-[420px] flex-col gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-[80px]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[70%]" />
          </div>
        </div>
      ))}
    </div>
  ),
}
