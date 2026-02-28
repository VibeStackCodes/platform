import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { Button } from '@/components/ui/button'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorTrigger,
} from './model-selector'

const meta = {
  title: 'AI/ModelSelector',
  component: ModelSelector,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ModelSelector>

export default meta
type Story = StoryObj<typeof meta>

const models = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' as const },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' as const },
  { id: 'gpt-5-2-codex', name: 'GPT-5.2 Codex', provider: 'openai' as const },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' as const },
  { id: 'gemini-2-flash', name: 'Gemini 2.0 Flash', provider: 'google' as const },
  { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek' as const },
]

export const WithTrigger: Story = {
  render: () => (
    <ModelSelector>
      <ModelSelectorTrigger asChild>
        <Button variant="outline" size="sm">
          <ModelSelectorLogoGroup>
            <ModelSelectorLogo provider="anthropic" />
          </ModelSelectorLogoGroup>
          Claude Opus 4.6
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          <ModelSelectorGroup heading="Anthropic">
            {models
              .filter((m) => m.provider === 'anthropic')
              .map((model) => (
                <ModelSelectorItem key={model.id} value={model.id} onSelect={fn()}>
                  <ModelSelectorLogo provider={model.provider} />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                </ModelSelectorItem>
              ))}
          </ModelSelectorGroup>
          <ModelSelectorSeparator />
          <ModelSelectorGroup heading="OpenAI">
            {models
              .filter((m) => m.provider === 'openai')
              .map((model) => (
                <ModelSelectorItem key={model.id} value={model.id} onSelect={fn()}>
                  <ModelSelectorLogo provider={model.provider} />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                </ModelSelectorItem>
              ))}
          </ModelSelectorGroup>
          <ModelSelectorSeparator />
          <ModelSelectorGroup heading="Other">
            {models
              .filter((m) => m.provider !== 'anthropic' && m.provider !== 'openai')
              .map((model) => (
                <ModelSelectorItem key={model.id} value={model.id} onSelect={fn()}>
                  <ModelSelectorLogo provider={model.provider} />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                </ModelSelectorItem>
              ))}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  ),
}

export const LogoGroup: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <ModelSelectorLogo provider="anthropic" />
        <span className="text-sm">Anthropic</span>
      </div>
      <div className="flex items-center gap-2">
        <ModelSelectorLogo provider="openai" />
        <span className="text-sm">OpenAI</span>
      </div>
      <div className="flex items-center gap-2">
        <ModelSelectorLogo provider="google" />
        <span className="text-sm">Google</span>
      </div>
      <div className="flex items-center gap-2">
        <ModelSelectorLogo provider="deepseek" />
        <span className="text-sm">DeepSeek</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Logo group (stacked)</span>
        <ModelSelectorLogoGroup>
          <ModelSelectorLogo provider="anthropic" />
          <ModelSelectorLogo provider="openai" />
          <ModelSelectorLogo provider="google" />
        </ModelSelectorLogoGroup>
      </div>
    </div>
  ),
}
