import type { Meta, StoryObj } from '@storybook/react'

import { Textarea } from './textarea'

const meta = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithPlaceholder: Story = {
  args: { placeholder: 'Type your message here…' },
}

export const WithValue: Story = {
  args: {
    defaultValue: 'This textarea has some pre-filled content that spans multiple lines.\n\nA second paragraph.',
    readOnly: true,
  },
}

export const Disabled: Story = {
  args: { placeholder: 'Disabled textarea', disabled: true },
}

export const WithRows: Story = {
  args: { placeholder: 'Tall textarea', rows: 8 },
}

export const Invalid: Story = {
  args: {
    placeholder: 'Required field',
    'aria-invalid': true,
  },
}
