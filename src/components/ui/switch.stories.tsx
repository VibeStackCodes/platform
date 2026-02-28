import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'

import { Label } from './label'
import { Switch } from './switch'

const meta = {
  title: 'UI/Switch',
  component: Switch,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof Switch>

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

export const SizeDefault: Story = {
  name: 'Size / Default',
  args: { size: 'default' },
}

export const SizeSm: Story = {
  name: 'Size / SM',
  args: { size: 'sm' },
}

export const SizeSmChecked: Story = {
  name: 'Size / SM Checked',
  args: { size: 'sm', defaultChecked: true },
}

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch id="notifications" {...args} />
      <Label htmlFor="notifications">Enable notifications</Label>
    </div>
  ),
}
