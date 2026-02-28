import type { Meta, StoryObj } from '@storybook/react'

import { Input } from './input'
import { Label } from './label'

const meta = {
  title: 'UI/Label',
  component: Label,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: 'Email address' },
}

export const WithHtmlFor: Story = {
  name: 'With htmlFor',
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="email-field">Email address</Label>
      <Input id="email-field" type="email" placeholder="you@example.com" />
    </div>
  ),
}

export const RequiredField: Story = {
  name: 'Required Field',
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="required-field">
        Username <span className="text-destructive">*</span>
      </Label>
      <Input id="required-field" placeholder="johndoe" />
    </div>
  ),
}
