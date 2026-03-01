import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { PromptBar } from './prompt-bar'

const meta = {
  title: 'VibeStack/PromptBar',
  component: PromptBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
**PromptBar** is the chat input bar used in the builder.

Built-in features (visible in all stories):
- **Model selector** dropdown — GPT-5.2 Codex, Claude Opus 4.6, Claude Sonnet 4.6
- **Send / Stop button** — state-driven (ready → send, streaming → stop)
- **Attachment button** — paperclip icon (left of model selector)

The model selector is internal state — it's always present in the rendered output.
        `.trim(),
      },
    },
  },
  args: {
    onSubmit: fn(),
    onStop: fn(),
  },
} satisfies Meta<typeof PromptBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    status: 'ready',
    placeholder: 'Describe what you want to build...',
  },
}

export const Submitted: Story = {
  args: {
    status: 'submitted',
    placeholder: 'Describe what you want to build...',
  },
}

export const Streaming: Story = {
  args: {
    status: 'streaming',
    placeholder: 'Describe what you want to build...',
  },
}

export const Error: Story = {
  args: {
    status: 'error',
    placeholder: 'Describe what you want to build...',
  },
}

export const Disabled: Story = {
  args: {
    status: 'ready',
    disabled: true,
    placeholder: 'Generation in progress...',
  },
}

export const CustomPlaceholder: Story = {
  args: {
    status: 'ready',
    placeholder: 'Ask me to modify the app...',
  },
}

/**
 * Documents the attachment button area in PromptInputTools.
 *
 * The PromptBar renders a `PromptInputTools` section in the footer that sits
 * to the left of the model selector. This area is reserved for attachment
 * controls (paperclip icon). Currently the attachment button is a placeholder —
 * clicking it has no effect — but it is visually present in the footer toolbar
 * alongside the model selector and send button.
 *
 * To verify: render any story and inspect the footer row. Left side = attachment
 * area + model selector. Right side = send / stop button.
 */
export const WithAttachment: Story = {
  args: {
    status: 'ready',
    placeholder: 'Attach a file or describe what you want to build...',
  },
  parameters: {
    docs: {
      description: {
        story: `
The attachment button (paperclip icon) lives inside \`PromptInputTools\` in the
footer row, to the left of the model selector. It is a visual placeholder today —
no file picker is wired up yet. This story documents its presence and position
within the PromptBar layout.
        `.trim(),
      },
    },
  },
}
