import type { Meta, StoryObj } from '@storybook/react'

import { Button } from './button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'

const meta = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

// ── Compositions ──────────────────────────────────────────────────────────────

export const Default: Story = {
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Project Overview</CardTitle>
        <CardDescription>A summary of your current project status.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Your project has 12 open tasks, 3 in review, and 5 completed this sprint.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">View Details</Button>
      </CardFooter>
    </Card>
  ),
}

export const WithAction: Story = {
  name: 'With Action',
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>You have 4 unread messages.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Mark all read
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Check your inbox for the latest updates from your team.
        </p>
      </CardContent>
    </Card>
  ),
}

export const HeaderOnly: Story = {
  name: 'Header Only',
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Quick Stats</CardTitle>
        <CardDescription>Last updated 5 minutes ago.</CardDescription>
      </CardHeader>
    </Card>
  ),
}

export const ContentOnly: Story = {
  name: 'Content Only',
  render: () => (
    <Card className="w-[360px]">
      <CardContent>
        <p className="text-sm">
          This card contains only a content section with no header or footer.
        </p>
      </CardContent>
    </Card>
  ),
}

export const WithFooterActions: Story = {
  name: 'With Footer Actions',
  render: () => (
    <Card className="w-[360px]">
      <CardHeader>
        <CardTitle>Delete Account</CardTitle>
        <CardDescription>
          This action is permanent and cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          All your data, projects, and settings will be permanently removed from our servers.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" size="sm">
          Cancel
        </Button>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </CardFooter>
    </Card>
  ),
}
