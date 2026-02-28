import type { Meta, StoryObj } from '@storybook/react'

import { Separator } from './separator'

const meta = {
  title: 'UI/Separator',
  component: Separator,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Separator>

export default meta
type Story = StoryObj<typeof meta>

// ── Orientations ──────────────────────────────────────────────────────────────

export const Horizontal: Story = {
  name: 'Orientation / Horizontal',
  render: () => (
    <div className="w-[360px] space-y-4">
      <p className="text-sm font-medium">Section A</p>
      <Separator orientation="horizontal" />
      <p className="text-sm font-medium">Section B</p>
    </div>
  ),
}

export const Vertical: Story = {
  name: 'Orientation / Vertical',
  render: () => (
    <div className="flex h-8 items-center gap-4">
      <span className="text-sm">Home</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Projects</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Settings</span>
    </div>
  ),
}

// ── Contextual examples ───────────────────────────────────────────────────────

export const BetweenCardSections: Story = {
  name: 'Between Card Sections',
  render: () => (
    <div className="w-[360px] rounded-xl border p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold">Account</p>
        <p className="text-xs text-muted-foreground">ammishra@example.com</p>
      </div>
      <Separator />
      <div>
        <p className="text-sm font-semibold">Plan</p>
        <p className="text-xs text-muted-foreground">Pro — 1,000 credits remaining</p>
      </div>
      <Separator />
      <div>
        <p className="text-sm font-semibold">Workspace</p>
        <p className="text-xs text-muted-foreground">VibeStack / platform</p>
      </div>
    </div>
  ),
}

export const ToolbarDivider: Story = {
  name: 'Toolbar Divider',
  render: () => (
    <div className="flex h-10 items-center gap-2 rounded-md border px-3">
      <button className="text-sm text-muted-foreground hover:text-foreground">
        File
      </button>
      <Separator orientation="vertical" />
      <button className="text-sm text-muted-foreground hover:text-foreground">
        Edit
      </button>
      <Separator orientation="vertical" />
      <button className="text-sm text-muted-foreground hover:text-foreground">
        View
      </button>
    </div>
  ),
}

export const NonDecorativeAccessible: Story = {
  name: 'Non-Decorative (accessible)',
  render: () => (
    <div className="w-[360px] space-y-4">
      <p className="text-sm font-medium">Published</p>
      <Separator orientation="horizontal" decorative={false} />
      <p className="text-sm font-medium">Drafts</p>
    </div>
  ),
}
