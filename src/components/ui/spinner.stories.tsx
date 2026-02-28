import type { Meta, StoryObj } from '@storybook/react'

import { Spinner } from './spinner'

const meta = {
  title: 'UI/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

// ── Sizes ─────────────────────────────────────────────────────────────────────

export const Default: Story = {}

export const Small: Story = {
  name: 'Size / Small',
  args: { className: 'size-3' },
}

export const Medium: Story = {
  name: 'Size / Medium',
  args: { className: 'size-5' },
}

export const Large: Story = {
  name: 'Size / Large',
  args: { className: 'size-8' },
}

export const ExtraLarge: Story = {
  name: 'Size / XL',
  args: { className: 'size-12' },
}

// ── Colors ────────────────────────────────────────────────────────────────────

export const Muted: Story = {
  name: 'Color / Muted',
  args: { className: 'text-muted-foreground' },
}

export const Primary: Story = {
  name: 'Color / Primary',
  args: { className: 'text-primary size-6' },
}

export const Destructive: Story = {
  name: 'Color / Destructive',
  args: { className: 'text-destructive size-6' },
}

// ── Contextual examples ───────────────────────────────────────────────────────

export const InlineWithLabel: Story = {
  name: 'Inline with Label',
  render: () => (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-4" />
      <span>Generating your app…</span>
    </div>
  ),
}

export const CenteredFullPage: Story = {
  name: 'Centered (full-page loading)',
  render: () => (
    <div className="flex h-32 w-64 items-center justify-center">
      <Spinner className="size-8 text-primary" />
    </div>
  ),
}
