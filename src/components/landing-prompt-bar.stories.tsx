import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { LandingPromptBar } from './landing-prompt-bar'

const meta = {
  title: 'VibeStack/LandingPromptBar',
  component: LandingPromptBar,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof LandingPromptBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'Describe the app you want to build...',
  },
}

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'What kind of app should I build for you?',
  },
}

export const NarrowContainer: Story = {
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  args: {
    placeholder: 'Describe the app you want to build...',
  },
}

export const WideContainer: Story = {
  decorators: [
    (Story) => (
      <div className="w-full max-w-3xl">
        <Story />
      </div>
    ),
  ],
  args: {
    placeholder: 'Describe the app you want to build...',
  },
}
