import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Terminal } from './terminal'
import {
  buildOutput,
  errorOutput,
  installOutput,
  streamingOutput,
  longOutput,
} from './terminal.fixtures'

const meta = {
  title: 'AI/Terminal',
  component: Terminal,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Terminal>

export default meta
type Story = StoryObj<typeof meta>

export const BuildSuccess: Story = {
  args: {
    output: buildOutput,
    isStreaming: false,
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <Terminal {...args} />
    </div>
  ),
}

export const BuildError: Story = {
  args: {
    output: errorOutput,
    isStreaming: false,
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <Terminal {...args} />
    </div>
  ),
}

export const PackageInstall: Story = {
  args: {
    output: installOutput,
    isStreaming: false,
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <Terminal {...args} />
    </div>
  ),
}

export const Streaming: Story = {
  args: {
    output: streamingOutput,
    isStreaming: true,
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <Terminal {...args} />
    </div>
  ),
}

export const WithClearButton: Story = {
  args: {
    output: buildOutput,
    isStreaming: false,
    onClear: fn(),
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <Terminal {...args} />
    </div>
  ),
}

export const LongOutput: Story = {
  args: {
    output: longOutput,
    isStreaming: false,
    autoScroll: true,
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <Terminal {...args} />
    </div>
  ),
}

export const Empty: Story = {
  args: {
    output: '',
    isStreaming: false,
  },
  render: (args) => (
    <div className="w-full max-w-2xl">
      <Terminal {...args} />
    </div>
  ),
}
