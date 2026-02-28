import type { Meta, StoryObj } from '@storybook/react'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from '@/components/ui/button-group'

const meta = {
  title: 'UI/ButtonGroup',
  component: ButtonGroup,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ButtonGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">First</Button>
      <Button variant="outline">Second</Button>
      <Button variant="outline">Third</Button>
    </ButtonGroup>
  ),
}

export const TextAlignment: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline" size="icon">
        <AlignLeftIcon />
        <span className="sr-only">Align left</span>
      </Button>
      <Button variant="outline" size="icon">
        <AlignCenterIcon />
        <span className="sr-only">Align center</span>
      </Button>
      <Button variant="outline" size="icon">
        <AlignRightIcon />
        <span className="sr-only">Align right</span>
      </Button>
    </ButtonGroup>
  ),
}

export const TextFormatting: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline" size="icon">
        <BoldIcon />
        <span className="sr-only">Bold</span>
      </Button>
      <Button variant="outline" size="icon">
        <ItalicIcon />
        <span className="sr-only">Italic</span>
      </Button>
      <Button variant="outline" size="icon">
        <UnderlineIcon />
        <span className="sr-only">Underline</span>
      </Button>
    </ButtonGroup>
  ),
}

export const Vertical: Story = {
  render: () => (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Top</Button>
      <Button variant="outline">Middle</Button>
      <Button variant="outline">Bottom</Button>
    </ButtonGroup>
  ),
}

export const WithPrefixText: Story = {
  render: () => (
    <ButtonGroup>
      <ButtonGroupText>https://</ButtonGroupText>
      <Button variant="outline">example.com</Button>
    </ButtonGroup>
  ),
}

export const WithSuffix: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Save</Button>
      <ButtonGroupSeparator />
      <Button variant="outline" size="icon" aria-label="More options">
        ▾
      </Button>
    </ButtonGroup>
  ),
}

export const MixedVariants: Story = {
  render: () => (
    <ButtonGroup>
      <Button>Primary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
    </ButtonGroup>
  ),
}

export const WithDangerAction: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">Edit</Button>
      <Button variant="outline">Duplicate</Button>
      <ButtonGroupSeparator />
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
      >
        Delete
      </Button>
    </ButtonGroup>
  ),
}
