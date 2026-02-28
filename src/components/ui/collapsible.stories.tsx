import type { Meta, StoryObj } from '@storybook/react'
import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from './button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './collapsible'

const meta = {
  title: 'UI/Collapsible',
  component: Collapsible,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Collapsible>

export default meta
type Story = StoryObj<typeof meta>

// ── Closed (default) ──────────────────────────────────────────────────────────

export const Closed: Story = {
  render: () => (
    <Collapsible className="w-[360px] space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Advanced options</p>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Toggle advanced options">
            <ChevronDownIcon className="size-4" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Custom build command
        </div>
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Environment variables
        </div>
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Output directory
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
}

// ── Open (default open) ───────────────────────────────────────────────────────

export const Open: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-[360px] space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Advanced options</p>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Toggle advanced options">
            <ChevronDownIcon className="size-4" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Custom build command
        </div>
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Environment variables
        </div>
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          Output directory
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
}

// ── Controlled ────────────────────────────────────────────────────────────────

function ControlledCollapsible() {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="w-[360px] space-y-2"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {open ? 'Hide' : 'Show'} build logs
        </p>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm">
            {open ? 'Collapse' : 'Expand'}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <pre className="rounded-md border bg-muted px-4 py-3 text-xs text-muted-foreground">
          {`vite build\n✓ 42 modules transformed.\ndist/index.html   0.45 kB\ndist/assets/index.js  142 kB\n✓ built in 1.23s`}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const Controlled: Story = {
  render: () => <ControlledCollapsible />,
}
