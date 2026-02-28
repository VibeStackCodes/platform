import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { AtSignIcon, CopyIcon, SearchIcon } from 'lucide-react'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from './input-group'

const meta = {
  title: 'UI/InputGroup',
  component: InputGroup,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InputGroup>

export default meta
type Story = StoryObj<typeof meta>

// ── Inline addons ─────────────────────────────────────────────────────────────

export const Default: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>
          <SearchIcon />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Search…" />
    </InputGroup>
  ),
}

export const InlineStartText: Story = {
  name: 'Inline Start / Text',
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="yoursite.com" />
    </InputGroup>
  ),
}

export const InlineEndText: Story = {
  name: 'Inline End / Text',
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="0.00" type="number" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>USD</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const InlineStartIcon: Story = {
  name: 'Inline Start / Icon',
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>
          <AtSignIcon />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="username" />
    </InputGroup>
  ),
}

export const InlineEndButton: Story = {
  name: 'Inline End / Button',
  render: () => (
    <InputGroup>
      <InputGroupInput defaultValue="npm install vibestack" readOnly />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={fn()} aria-label="Copy">
          <CopyIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const BothSides: Story = {
  name: 'Both Sides',
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>
          <SearchIcon />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Search…" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={fn()} size="xs">
          Go
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

// ── Block addons ──────────────────────────────────────────────────────────────

export const BlockStart: Story = {
  name: 'Block Start / Label',
  render: () => (
    <InputGroup>
      <InputGroupAddon align="block-start">
        <InputGroupText>Label</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Enter value…" />
    </InputGroup>
  ),
}

export const BlockEnd: Story = {
  name: 'Block End / Hint',
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Enter value…" />
      <InputGroupAddon align="block-end">
        <InputGroupText>Hint text goes here</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
}

// ── With Textarea ─────────────────────────────────────────────────────────────

export const WithTextarea: Story = {
  name: 'With Textarea',
  render: () => (
    <InputGroup>
      <InputGroupAddon align="block-start">
        <InputGroupText>Message</InputGroupText>
      </InputGroupAddon>
      <InputGroupTextarea placeholder="Type your message here…" rows={4} />
    </InputGroup>
  ),
}
