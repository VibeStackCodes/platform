import type { Meta, StoryObj } from '@storybook/react'
import { ArtifactCard } from './artifact-card'

const meta = {
  title: 'AI/ArtifactCard',
  component: ArtifactCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ArtifactCard>

export default meta
type Story = StoryObj<typeof meta>

export const Document: Story = {
  args: {
    variant: 'doc',
    title: 'Strategy Playbook',
    meta: 'PDF • 12 pages',
    onClick: () => {},
  },
}

export const Design: Story = {
  args: {
    variant: 'design',
    title: 'Design System',
    meta: 'Figma • Updated 2m ago',
    onClick: () => {},
  },
}

export const Code: Story = {
  args: {
    variant: 'code',
    title: 'API Schema',
    meta: 'TypeScript • 245 lines',
    onClick: () => {},
  },
}

export const Large: Story = {
  args: {
    size: 'lg',
    variant: 'doc',
    title: 'Product Requirements Document',
    meta: 'PDF • 24 pages',
    onDownload: () => {},
  },
}

export const LargeDesign: Story = {
  args: {
    size: 'lg',
    variant: 'design',
    title: 'UI Mockups',
    meta: 'Figma • 8 frames',
    onDownload: () => {},
  },
}

export const AllVariants: Story = {
  args: { title: '', meta: '' },
  render: () => (
    <div className="flex flex-col gap-3">
      <ArtifactCard
        variant="doc"
        title="Strategy Playbook"
        meta="PDF • 12 pages"
        onClick={() => {}}
      />
      <ArtifactCard
        variant="design"
        title="Design System"
        meta="Figma • Updated 2m ago"
        onClick={() => {}}
      />
      <ArtifactCard
        variant="code"
        title="API Schema"
        meta="TypeScript • 245 lines"
        onClick={() => {}}
      />
      <ArtifactCard
        variant="default"
        title="Untitled Artifact"
        meta="Unknown • 1 item"
        onClick={() => {}}
      />
    </div>
  ),
}
