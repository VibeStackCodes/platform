import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { PreviewCard } from './preview-card'

const meta = {
  title: 'AI/PreviewCard',
  component: PreviewCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PreviewCard>

export default meta
type Story = StoryObj<typeof meta>

export const WithUrl: Story = {
  args: {
    url: 'https://example.com',
    onOpen: fn(),
  },
}

export const Placeholder: Story = {
  args: {
    // no url — shows the default Monitor icon placeholder
  },
}

export const CustomPlaceholder: Story = {
  args: {
    placeholder: (
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center text-xl">
          🚀
        </div>
        <span className="text-sm font-medium">Building your app...</span>
        <span className="text-xs text-muted-foreground/60">This may take a moment</span>
      </div>
    ),
  },
}
