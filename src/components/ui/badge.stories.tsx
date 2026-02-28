import type { Meta, StoryObj } from '@storybook/react'
import { ZapIcon } from 'lucide-react'

import { Badge } from './badge'

const meta = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    children: 'Badge',
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

// ── Variants ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: { variant: 'default', children: 'Default' },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
}

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Destructive' },
}

export const Outline: Story = {
  args: { variant: 'outline', children: 'Outline' },
}

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost' },
}

export const Link: Story = {
  args: { variant: 'link', children: 'Link' },
}

// ── With icon ─────────────────────────────────────────────────────────────────

export const WithIcon: Story = {
  name: 'With Icon',
  render: () => (
    <Badge>
      <ZapIcon />
      Pro
    </Badge>
  ),
}

// ── Contextual examples ───────────────────────────────────────────────────────

export const StatusExamples: Story = {
  name: 'Status Examples',
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Live</Badge>
      <Badge variant="secondary">Draft</Badge>
      <Badge variant="outline">Pending</Badge>
      <Badge variant="destructive">Failed</Badge>
      <Badge variant="ghost">Archived</Badge>
    </div>
  ),
}

export const ModelLabels: Story = {
  name: 'Model Labels',
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">GPT-5.2 Codex</Badge>
      <Badge variant="secondary">Claude Opus 4.6</Badge>
      <Badge variant="outline">Claude Sonnet 4.6</Badge>
    </div>
  ),
}
