import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { BookmarkIcon, GitBranchIcon, SaveIcon } from 'lucide-react'
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from './checkpoint'

const meta = {
  title: 'AI/Checkpoint',
  component: Checkpoint,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Checkpoint>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Checkpoint>
      <CheckpointIcon />
      <CheckpointTrigger onClick={fn()}>Save checkpoint</CheckpointTrigger>
    </Checkpoint>
  ),
}

export const WithTooltip: Story = {
  render: () => (
    <Checkpoint>
      <CheckpointIcon />
      <CheckpointTrigger tooltip="Save your progress at this point" onClick={fn()}>
        Checkpoint
      </CheckpointTrigger>
    </Checkpoint>
  ),
}

export const CustomIcon: Story = {
  render: () => (
    <Checkpoint>
      <CheckpointIcon>
        <GitBranchIcon className="size-4 shrink-0" />
      </CheckpointIcon>
      <CheckpointTrigger onClick={fn()}>Create branch</CheckpointTrigger>
    </Checkpoint>
  ),
}

export const SaveIcon_: Story = {
  name: 'Save Checkpoint',
  render: () => (
    <Checkpoint>
      <CheckpointIcon>
        <SaveIcon className="size-4 shrink-0" />
      </CheckpointIcon>
      <CheckpointTrigger tooltip="Save current state" onClick={fn()}>
        Save state
      </CheckpointTrigger>
    </Checkpoint>
  ),
}

export const MultipleActions: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Checkpoint>
        <CheckpointIcon />
        <CheckpointTrigger onClick={fn()}>Checkpoint v1</CheckpointTrigger>
        <CheckpointTrigger onClick={fn()}>Restore</CheckpointTrigger>
      </Checkpoint>
      <Checkpoint>
        <CheckpointIcon />
        <CheckpointTrigger onClick={fn()}>Checkpoint v2</CheckpointTrigger>
        <CheckpointTrigger onClick={fn()}>Restore</CheckpointTrigger>
      </Checkpoint>
    </div>
  ),
}
