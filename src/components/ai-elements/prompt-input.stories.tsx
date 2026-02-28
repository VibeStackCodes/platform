import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputButton,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputProvider,
} from './prompt-input'

const meta = {
  title: 'AI/PromptInput',
  component: PromptInput,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof PromptInput>

export default meta
type Story = StoryObj<typeof meta>

// Basic empty state — standalone (no provider)
export const Empty: Story = {
  render: (args) => (
    <div className="w-full max-w-2xl">
      <PromptInput {...args}>
        <PromptInputBody>
          <PromptInputTextarea placeholder="Ask anything..." />
        </PromptInputBody>
        <PromptInputFooter>
          <div />
          <PromptInputSubmit />
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
}

// With pre-filled text via provider
export const WithText: Story = {
  render: (args) => (
    <div className="w-full max-w-2xl">
      <PromptInputProvider initialInput="Build me a todo app with authentication and dark mode support">
        <PromptInput {...args}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask anything..." />
          </PromptInputBody>
          <PromptInputFooter>
            <div />
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
    </div>
  ),
}

// Streaming / stop button state
export const Streaming: Story = {
  render: (args) => (
    <div className="w-full max-w-2xl">
      <PromptInput {...args}>
        <PromptInputBody>
          <PromptInputTextarea placeholder="Ask anything..." />
        </PromptInputBody>
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status="streaming" onStop={fn()} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
}

// With action menu (+ button to add files)
export const WithActionMenu: Story = {
  render: (args) => (
    <div className="w-full max-w-2xl">
      <PromptInput {...args} accept="image/*">
        <PromptInputBody>
          <PromptInputTextarea placeholder="Ask anything or drop files..." />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionMenuItem>Upload file</PromptInputActionMenuItem>
              <PromptInputActionMenuItem>Add URL</PromptInputActionMenuItem>
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <PromptInputSubmit />
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
}

// Submit button states
export const SubmittedState: Story = {
  render: (args) => (
    <div className="w-full max-w-2xl">
      <PromptInput {...args}>
        <PromptInputBody>
          <PromptInputTextarea placeholder="Ask anything..." />
        </PromptInputBody>
        <PromptInputFooter>
          <div />
          <PromptInputSubmit status="submitted" />
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
}

// With a tooltip on a custom button
export const WithTooltipButton: Story = {
  render: (args) => (
    <div className="w-full max-w-2xl">
      <PromptInput {...args}>
        <PromptInputBody>
          <PromptInputTextarea placeholder="Ask anything..." />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputButton tooltip={{ content: 'Attach files', shortcut: 'Ctrl+U' }}>
            +
          </PromptInputButton>
          <PromptInputSubmit />
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
}
