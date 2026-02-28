import type { Meta, StoryObj } from '@storybook/react'
import { InfoIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const meta = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>This is a tooltip</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const WithIcon: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <InfoIcon className="size-5" />
          <span className="sr-only">More information</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Additional context about this feature.</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const SideTop: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary">Tooltip on top</Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Appears above the trigger</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const SideBottom: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary">Tooltip on bottom</Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Appears below the trigger</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const SideLeft: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary">Tooltip on left</Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Appears to the left</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const SideRight: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary">Tooltip on right</Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>Appears to the right</p>
      </TooltipContent>
    </Tooltip>
  ),
}

export const MultipleTooltips: Story = {
  render: () => (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">A</Button>
        </TooltipTrigger>
        <TooltipContent>Action A</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">B</Button>
        </TooltipTrigger>
        <TooltipContent>Action B</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon">C</Button>
        </TooltipTrigger>
        <TooltipContent>Action C</TooltipContent>
      </Tooltip>
    </div>
  ),
}
