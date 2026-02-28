import type { Meta, StoryObj } from '@storybook/react'

import { Input } from './input'

const meta = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithPlaceholder: Story = {
  args: { placeholder: 'Enter text…' },
}

export const WithValue: Story = {
  args: { defaultValue: 'Hello, world!', readOnly: true },
}

export const Disabled: Story = {
  args: { placeholder: 'Disabled input', disabled: true },
}

export const EmailType: Story = {
  name: 'Type / Email',
  args: { type: 'email', placeholder: 'you@example.com' },
}

export const PasswordType: Story = {
  name: 'Type / Password',
  args: { type: 'password', placeholder: '••••••••' },
}

export const Invalid: Story = {
  args: {
    placeholder: 'Required field',
    'aria-invalid': true,
  },
}
