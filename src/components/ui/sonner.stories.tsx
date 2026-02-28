import type { Meta, StoryObj } from '@storybook/react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'

const meta = {
  title: 'UI/Sonner',
  component: Toaster,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <ThemeProvider defaultTheme="system">
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <>
      <Toaster />
      <Button
        onClick={() =>
          toast('Event has been created', {
            description: 'Sunday, December 03, 2023 at 9:00 AM',
          })
        }
      >
        Show Toast
      </Button>
    </>
  ),
}

export const Success: Story = {
  render: () => (
    <>
      <Toaster />
      <Button
        variant="outline"
        onClick={() =>
          toast.success('Project saved successfully', {
            description: 'Your changes have been saved.',
          })
        }
      >
        Success Toast
      </Button>
    </>
  ),
}

export const Error: Story = {
  render: () => (
    <>
      <Toaster />
      <Button
        variant="destructive"
        onClick={() =>
          toast.error('Something went wrong', {
            description: 'There was a problem with your request.',
          })
        }
      >
        Error Toast
      </Button>
    </>
  ),
}

export const Warning: Story = {
  render: () => (
    <>
      <Toaster />
      <Button
        variant="outline"
        onClick={() =>
          toast.warning('Credits running low', {
            description: 'You have less than 100 credits remaining.',
          })
        }
      >
        Warning Toast
      </Button>
    </>
  ),
}

export const Info: Story = {
  render: () => (
    <>
      <Toaster />
      <Button
        variant="secondary"
        onClick={() =>
          toast.info('New update available', {
            description: 'Version 2.0.0 is ready to install.',
          })
        }
      >
        Info Toast
      </Button>
    </>
  ),
}

export const Loading: Story = {
  render: () => (
    <>
      <Toaster />
      <Button
        variant="outline"
        onClick={() => {
          const id = toast.loading('Deploying your app...')
          setTimeout(() => {
            toast.success('Deployed successfully!', { id })
          }, 2000)
        }}
      >
        Loading Toast (resolves in 2s)
      </Button>
    </>
  ),
}

export const AllVariants: Story = {
  render: () => (
    <>
      <Toaster />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => toast('Default message')}>Default</Button>
        <Button variant="outline" onClick={() => toast.success('Success!')}>
          Success
        </Button>
        <Button variant="destructive" onClick={() => toast.error('Error!')}>
          Error
        </Button>
        <Button variant="secondary" onClick={() => toast.warning('Warning!')}>
          Warning
        </Button>
        <Button variant="ghost" onClick={() => toast.info('Info!')}>
          Info
        </Button>
      </div>
    </>
  ),
}
