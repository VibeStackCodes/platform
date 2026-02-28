import type { Meta, StoryObj } from '@storybook/react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

const meta = {
  title: 'UI/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Dimensions</PopoverTitle>
          <PopoverDescription>
            Set the dimensions for the layer.
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-3 items-center gap-4">
            <label className="text-sm font-medium" htmlFor="width">Width</label>
            <input
              id="width"
              defaultValue="100%"
              className="col-span-2 h-8 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <label className="text-sm font-medium" htmlFor="height">Height</label>
            <input
              id="height"
              defaultValue="25px"
              className="col-span-2 h-8 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
}

export const Simple: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          More info
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <p className="text-sm">
          This is a simple popover with just text content. It aligns to the
          start of the trigger element.
        </p>
      </PopoverContent>
    </Popover>
  ),
}

export const AlignEnd: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Align End</Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <PopoverHeader>
          <PopoverTitle>Notification settings</PopoverTitle>
          <PopoverDescription>
            Choose what notifications you receive.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
}

export const WithFooter: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Edit Profile</Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Edit Profile</PopoverTitle>
          <PopoverDescription>
            Make changes to your profile here. Click save when done.
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-medium" htmlFor="name">Name</label>
            <input
              id="name"
              defaultValue="John Doe"
              className="h-8 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium" htmlFor="username">Username</label>
            <input
              id="username"
              defaultValue="@johndoe"
              className="h-8 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm">Save changes</Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
}
