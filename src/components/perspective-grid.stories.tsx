import type { Meta, StoryObj } from '@storybook/react'
import { PerspectiveGrid } from './perspective-grid'

const meta = {
  title: 'VibeStack/PerspectiveGrid',
  component: PerspectiveGrid,
  tags: ['autodocs'],
  parameters: {
    // Fullscreen to appreciate the full-bleed background animation
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PerspectiveGrid>

export default meta
type Story = StoryObj<typeof meta>

/**
 * PerspectiveGrid renders as an absolutely-positioned overlay (`inset-0`),
 * so it needs a positioned parent with explicit dimensions to be visible.
 * The render decorator wraps it in a relative container.
 */
export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="relative h-screen w-full overflow-hidden bg-black">
        <Story />
        <div className="relative z-10 flex h-full items-center justify-center">
          <p className="text-white text-2xl font-semibold">Content above the grid</p>
        </div>
      </div>
    ),
  ],
}

export const DarkBackground: Story = {
  decorators: [
    (Story) => (
      <div
        className="relative h-screen w-full overflow-hidden"
        style={{ background: 'oklch(0.1448 0 0)' }}
      >
        <Story />
      </div>
    ),
  ],
}

export const SmallViewport: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div className="relative h-screen w-full overflow-hidden bg-neutral-900">
        <Story />
      </div>
    ),
  ],
}
