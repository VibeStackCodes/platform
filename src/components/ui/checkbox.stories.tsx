import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'

import { Checkbox } from './checkbox'
import { Label } from './label'

const meta = {
  title: 'UI/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Checked: Story = {
  args: { defaultChecked: true },
}

export const Disabled: Story = {
  args: { disabled: true },
}

export const DisabledChecked: Story = {
  name: 'Disabled / Checked',
  args: { disabled: true, defaultChecked: true },
}

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" {...args} />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
}

export const WithLabelDisabled: Story = {
  name: 'With Label / Disabled',
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms-disabled" disabled {...args} />
      <Label htmlFor="terms-disabled">Accept terms and conditions</Label>
    </div>
  ),
}
