import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { ArtifactsList } from './artifacts-list'

const meta = {
  title: 'AI/ArtifactsList',
  component: ArtifactsList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ArtifactsList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    items: [
      {
        id: 'strategy-playbook',
        name: 'Strategy Playbook',
        agent: 'PM',
        variant: 'doc',
        onClick: fn(),
      },
      {
        id: 'design-system',
        name: 'Design System',
        agent: 'Designer',
        variant: 'design',
        onClick: fn(),
      },
      {
        id: 'api-schema',
        name: 'API Schema',
        agent: 'Architect',
        variant: 'code',
        onClick: fn(),
      },
    ],
  },
}

export const Empty: Story = {
  args: {
    items: [],
  },
}

export const SingleItem: Story = {
  args: {
    items: [
      {
        id: 'requirements-doc',
        name: 'Requirements Doc',
        agent: 'Analyst',
        variant: 'doc',
        onClick: fn(),
      },
    ],
  },
}
