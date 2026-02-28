import type { Meta, StoryObj } from '@storybook/react'
import { AlertCircleIcon, InfoIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from './alert'

const meta = {
  title: 'UI/Alert',
  component: Alert,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Alert>

export default meta
type Story = StoryObj<typeof meta>

// ── variant: default ──────────────────────────────────────────────────────────

export const Default: Story = {
  render: () => (
    <Alert className="w-[420px]">
      <InfoIcon />
      <AlertTitle>Build completed</AlertTitle>
      <AlertDescription>
        Your project built successfully. The live preview has been updated.
      </AlertDescription>
    </Alert>
  ),
}

export const DefaultNoIcon: Story = {
  name: 'Default — No Icon',
  render: () => (
    <Alert className="w-[420px]">
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>
        Preview URLs from Daytona expire after 1 hour. A new signed URL will be
        generated automatically.
      </AlertDescription>
    </Alert>
  ),
}

// ── variant: destructive ──────────────────────────────────────────────────────

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-[420px]">
      <AlertCircleIcon />
      <AlertTitle>Build failed</AlertTitle>
      <AlertDescription>
        The agent attempted 3 repair cycles and was unable to resolve the TypeScript
        errors. Check the build log for details.
      </AlertDescription>
    </Alert>
  ),
}

export const DestructiveNoIcon: Story = {
  name: 'Destructive — No Icon',
  render: () => (
    <Alert variant="destructive" className="w-[420px]">
      <AlertTitle>Insufficient credits</AlertTitle>
      <AlertDescription>
        You have run out of credits. Add credits to continue generating apps.
      </AlertDescription>
    </Alert>
  ),
}

// ── Description only ─────────────────────────────────────────────────────────

export const DescriptionOnly: Story = {
  name: 'Description Only',
  render: () => (
    <Alert className="w-[420px]">
      <AlertDescription>
        Sandbox is warming up — this may take a few seconds on first use.
      </AlertDescription>
    </Alert>
  ),
}
