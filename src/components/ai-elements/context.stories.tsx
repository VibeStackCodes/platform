import type { LanguageModelUsage } from 'ai'
import type { Meta, StoryObj } from '@storybook/react'
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from './context'

const meta = {
  title: 'AI/Context',
  component: Context,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Context>

export default meta
type Story = StoryObj<typeof meta>

function makeUsage(partial: Partial<LanguageModelUsage>): LanguageModelUsage {
  const inputTokens = partial.inputTokens ?? 0
  const outputTokens = partial.outputTokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
    ...partial,
  }
}

export const LowUsage: Story = {
  args: {
    usedTokens: 8000,
    maxTokens: 200000,
    usage: makeUsage({ inputTokens: 6000, outputTokens: 2000 }),
    modelId: 'gpt-4o',
  },
  render: (args) => (
    <Context {...args}>
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  ),
}

export const HighUsage: Story = {
  args: {
    usedTokens: 160000,
    maxTokens: 200000,
    usage: makeUsage({ inputTokens: 120000, outputTokens: 40000 }),
    modelId: 'claude-opus-4-6',
  },
  render: (args) => (
    <Context {...args}>
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  ),
}

export const WithReasoningAndCache: Story = {
  args: {
    usedTokens: 95000,
    maxTokens: 200000,
    usage: makeUsage({
      inputTokens: 60000,
      outputTokens: 15000,
      reasoningTokens: 12000,
      cachedInputTokens: 8000,
    }),
    modelId: 'claude-sonnet-4-6',
  },
  render: (args) => (
    <Context {...args}>
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
          <ContextReasoningUsage />
          <ContextCacheUsage />
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  ),
}

export const NoModel: Story = {
  args: {
    usedTokens: 40000,
    maxTokens: 128000,
    usage: makeUsage({ inputTokens: 30000, outputTokens: 10000 }),
  },
  render: (args) => (
    <Context {...args}>
      <ContextTrigger />
      <ContextContent>
        <ContextContentHeader />
        <ContextContentBody>
          <ContextInputUsage />
          <ContextOutputUsage />
        </ContextContentBody>
      </ContextContent>
    </Context>
  ),
}
