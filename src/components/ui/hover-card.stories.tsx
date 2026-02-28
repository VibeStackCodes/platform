import type { Meta, StoryObj } from '@storybook/react'
import { CalendarIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

const meta = {
  title: 'UI/HoverCard',
  component: HoverCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HoverCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <a
          href="#"
          className="text-sm font-medium underline underline-offset-4 hover:no-underline"
          onClick={(e) => e.preventDefault()}
        >
          @nextjs
        </a>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex justify-between space-x-4">
          <Avatar>
            <AvatarImage src="https://github.com/vercel.png" alt="@vercel" />
            <AvatarFallback>VC</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">@nextjs</h4>
            <p className="text-sm">
              The React Framework — created and maintained by @vercel.
            </p>
            <div className="flex items-center pt-2">
              <CalendarIcon className="mr-2 size-4 opacity-70" />
              <span className="text-xs text-muted-foreground">
                Joined December 2021
              </span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
}

export const UserProfile: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md text-sm hover:underline"
        >
          <Avatar size="sm">
            <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
          shadcn
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
              <AvatarFallback>SC</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold">shadcn</p>
              <p className="text-xs text-muted-foreground">@shadcn</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Building things with React and Tailwind CSS.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">1.2k</strong> Following
            </span>
            <span>
              <strong className="text-foreground">42k</strong> Followers
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
}

export const WithLongContent: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <a
          href="#"
          className="text-sm text-blue-600 underline dark:text-blue-400"
          onClick={(e) => e.preventDefault()}
        >
          React Documentation
        </a>
      </HoverCardTrigger>
      <HoverCardContent side="right">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">React</h4>
          <p className="text-sm">
            The library for web and native user interfaces. React lets you build
            user interfaces out of individual pieces called components.
          </p>
          <p className="text-xs text-muted-foreground">react.dev</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
}
