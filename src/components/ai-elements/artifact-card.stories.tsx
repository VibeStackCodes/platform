import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { ArtifactCard } from './artifact-card'

const meta = {
  title: 'VibeStack/AI Elements/ArtifactCard',
  component: ArtifactCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onClick: fn(),
    onDownload: fn(),
    onAction: fn(),
  },
} satisfies Meta<typeof ArtifactCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Untitled Artifact',
    meta: 'No description',
  },
}

export const DocVariant: Story = {
  args: {
    variant: 'doc',
    title: 'Product Requirements',
    meta: '12 pages',
  },
}

export const DesignVariant: Story = {
  args: {
    variant: 'design',
    title: 'Design System',
    meta: '48 tokens',
  },
}

export const CodeVariant: Story = {
  args: {
    variant: 'code',
    title: 'KanbanBoard.tsx',
    meta: '156 lines',
  },
}

export const LargeSize: Story = {
  args: {
    variant: 'doc',
    title: 'Product Requirements Document',
    meta: 'PDF · 2.4 MB',
    size: 'lg',
    onDownload: fn(),
  },
}

export const WithAction: Story = {
  args: {
    variant: 'code',
    title: 'KanbanBoard.tsx',
    meta: '156 lines',
    actionLabel: 'Apply',
    onAction: fn(),
  },
}

export const Clickable: Story = {
  args: {
    variant: 'doc',
    title: 'Product Requirements',
    meta: '12 pages',
    onClick: fn(),
  },
}
