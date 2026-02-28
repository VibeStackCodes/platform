import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'

import { Label } from './label'
import { RadioGroup, RadioGroupItem } from './radio-group'

const meta = {
  title: 'UI/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onValueChange: fn(),
  },
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <RadioGroup {...args}>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-a" id="option-a" />
        <Label htmlFor="option-a">Option A</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-b" id="option-b" />
        <Label htmlFor="option-b">Option B</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-c" id="option-c" />
        <Label htmlFor="option-c">Option C</Label>
      </div>
    </RadioGroup>
  ),
}

export const WithDefaultValue: Story = {
  render: (args) => (
    <RadioGroup defaultValue="option-b" {...args}>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-a" id="dv-option-a" />
        <Label htmlFor="dv-option-a">Option A</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-b" id="dv-option-b" />
        <Label htmlFor="dv-option-b">Option B (selected)</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-c" id="dv-option-c" />
        <Label htmlFor="dv-option-c">Option C</Label>
      </div>
    </RadioGroup>
  ),
}

export const WithDisabledItem: Story = {
  render: (args) => (
    <RadioGroup defaultValue="option-a" {...args}>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-a" id="dis-option-a" />
        <Label htmlFor="dis-option-a">Option A</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-b" id="dis-option-b" disabled />
        <Label htmlFor="dis-option-b">Option B (disabled)</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="option-c" id="dis-option-c" />
        <Label htmlFor="dis-option-c">Option C</Label>
      </div>
    </RadioGroup>
  ),
}

export const Horizontal: Story = {
  render: (args) => (
    <RadioGroup orientation="horizontal" className="flex flex-row gap-6" {...args}>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="yes" id="h-yes" />
        <Label htmlFor="h-yes">Yes</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="no" id="h-no" />
        <Label htmlFor="h-no">No</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="maybe" id="h-maybe" />
        <Label htmlFor="h-maybe">Maybe</Label>
      </div>
    </RadioGroup>
  ),
}
