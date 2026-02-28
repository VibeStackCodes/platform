import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Snippet, SnippetAddon, SnippetCopyButton, SnippetInput, SnippetText } from './snippet'

const meta = {
  title: 'AI/Snippet',
  component: Snippet,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Snippet>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    code: 'npm install @anthropic-ai/sdk',
  },
  render: (args) => (
    <Snippet {...args}>
      <SnippetInput />
      <SnippetCopyButton onCopy={fn()} />
    </Snippet>
  ),
}

export const WithPrefix: Story = {
  args: {
    code: 'bun add framer-motion',
  },
  render: (args) => (
    <Snippet {...args}>
      <SnippetAddon>
        <SnippetText>$</SnippetText>
      </SnippetAddon>
      <SnippetInput />
      <SnippetCopyButton onCopy={fn()} />
    </Snippet>
  ),
}

export const EnvVariable: Story = {
  args: {
    code: 'ANTHROPIC_API_KEY=sk-ant-...',
  },
  render: (args) => (
    <Snippet {...args}>
      <SnippetAddon>
        <SnippetText>.env</SnippetText>
      </SnippetAddon>
      <SnippetInput />
      <SnippetCopyButton onCopy={fn()} />
    </Snippet>
  ),
}

export const LongCommand: Story = {
  args: {
    code: 'npx create-next-app@latest my-app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"',
  },
  render: (args) => (
    <Snippet {...args}>
      <SnippetInput />
      <SnippetCopyButton onCopy={fn()} />
    </Snippet>
  ),
}

export const WithError: Story = {
  args: {
    code: 'bun install',
  },
  render: (args) => (
    <Snippet {...args}>
      <SnippetInput />
      <SnippetCopyButton onCopy={fn()} onError={fn()} />
    </Snippet>
  ),
}

export const URL: Story = {
  args: {
    code: 'https://platform.vibestack.ai/dashboard',
  },
  render: (args) => (
    <Snippet {...args}>
      <SnippetInput />
      <SnippetCopyButton onCopy={fn()} />
    </Snippet>
  ),
}
