import type { Meta, StoryObj } from '@storybook/react'

import { Button } from './button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'

const meta = {
  title: 'UI/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Sheet>

export default meta
type Story = StoryObj<typeof meta>

// ── Side variants ─────────────────────────────────────────────────────────────

export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Right</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Manage your account settings and preferences.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <p className="text-sm text-muted-foreground">
            Settings content appears here. Slides in from the right.
          </p>
        </div>
        <SheetFooter>
          <Button size="sm">Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}

export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Browse your projects and workspaces.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          <p className="text-sm font-medium">Projects</p>
          <p className="text-sm text-muted-foreground">My App</p>
          <p className="text-sm text-muted-foreground">Dashboard</p>
          <p className="text-sm text-muted-foreground">Analytics</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const Top: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Announcement</SheetTitle>
          <SheetDescription>
            New features are available — update your workspace to get started.
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
}

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Share Project</SheetTitle>
          <SheetDescription>
            Invite collaborators by email or generate a shareable link.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <p className="text-sm text-muted-foreground">
            Share options would appear here.
          </p>
        </div>
        <SheetFooter>
          <Button size="sm">Copy link</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
}
