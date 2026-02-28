import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Loader2Icon, SearchIcon, TrashIcon } from 'lucide-react'

import { Button } from './button'

const meta = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

// ── Variants ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  args: { children: 'Button' },
}

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete' },
}

export const Outline: Story = {
  args: { variant: 'outline', children: 'Outline' },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
}

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost' },
}

export const Link: Story = {
  args: { variant: 'link', children: 'Link button' },
}

// ── Sizes ─────────────────────────────────────────────────────────────────────

export const SizeDefault: Story = {
  name: 'Size / Default',
  args: { size: 'default', children: 'Default size' },
}

export const SizeXs: Story = {
  name: 'Size / XS',
  args: { size: 'xs', children: 'Extra small' },
}

export const SizeSm: Story = {
  name: 'Size / SM',
  args: { size: 'sm', children: 'Small' },
}

export const SizeLg: Story = {
  name: 'Size / LG',
  args: { size: 'lg', children: 'Large' },
}

export const SizeIcon: Story = {
  name: 'Size / Icon',
  args: {
    size: 'icon',
    'aria-label': 'Search',
    children: <SearchIcon />,
  },
}

export const SizeIconXs: Story = {
  name: 'Size / Icon XS',
  args: {
    size: 'icon-xs',
    'aria-label': 'Delete',
    children: <TrashIcon />,
  },
}

export const SizeIconSm: Story = {
  name: 'Size / Icon SM',
  args: {
    size: 'icon-sm',
    'aria-label': 'Search',
    children: <SearchIcon />,
  },
}

export const SizeIconLg: Story = {
  name: 'Size / Icon LG',
  args: {
    size: 'icon-lg',
    'aria-label': 'Search',
    children: <SearchIcon />,
  },
}

// ── States ────────────────────────────────────────────────────────────────────

export const Disabled: Story = {
  args: { children: 'Disabled', disabled: true },
}

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <SearchIcon />
        Search
      </>
    ),
  },
}

export const Loading: Story = {
  args: {
    children: (
      <>
        <Loader2Icon className="animate-spin" />
        Loading…
      </>
    ),
    disabled: true,
  },
}

export const DestructiveWithIcon: Story = {
  name: 'Destructive with Icon',
  args: {
    variant: 'destructive',
    children: (
      <>
        <TrashIcon />
        Delete
      </>
    ),
  },
}
