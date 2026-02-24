'use client'

import { ChevronDownIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'

type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

const models = [
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'openai' as const, available: true },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' as const, available: true },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' as const, available: true },
]

interface PromptBarProps {
  onSubmit: (
    message: PromptInputMessage,
    options: { model: string },
  ) => void | Promise<void>
  onStop?: () => void
  placeholder?: string
  status?: ChatStatus
  disabled?: boolean
}

export function PromptBar({
  onSubmit,
  onStop,
  placeholder = 'Describe the app you want to build...',
  status,
  disabled,
}: PromptBarProps) {
  const [text, setText] = useState('')
  const [model, setModel] = useState(models[0].id)
  const [selectorOpen, setSelectorOpen] = useState(false)

  const selectedModel = useMemo(() => models.find((m) => m.id === model) ?? models[0], [model])

  function handleSubmit(message: PromptInputMessage) {
    const result = onSubmit(message, { model })
    setText('')
    return result
  }

  return (
    <PromptInput onSubmit={handleSubmit} multiple>
      <PromptInputBody>
        <PromptInputTextarea
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools>
          <ModelSelector open={selectorOpen} onOpenChange={setSelectorOpen}>
            <ModelSelectorTrigger asChild>
              <PromptInputButton tooltip={{ content: 'Select model' }}>
                <ModelSelectorLogo provider={selectedModel.provider} />
                <span>{selectedModel.name}</span>
                <ChevronDownIcon size={12} />
              </PromptInputButton>
            </ModelSelectorTrigger>
            <ModelSelectorContent>
              <ModelSelectorInput placeholder="Search models..." />
              <ModelSelectorList>
                <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                <ModelSelectorGroup heading="OpenAI">
                  {models
                    .filter((m) => m.provider === 'openai')
                    .map((m) => (
                      <ModelSelectorItem
                        key={m.id}
                        value={m.id}
                        onSelect={() => {
                          if (!m.available) return
                          setModel(m.id)
                          setSelectorOpen(false)
                        }}
                        className={!m.available ? 'opacity-50 cursor-not-allowed' : ''}
                      >
                        <ModelSelectorLogo provider={m.provider} />
                        <ModelSelectorName>{m.name}</ModelSelectorName>
                        {!m.available && (
                          <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
                        )}
                      </ModelSelectorItem>
                    ))}
                </ModelSelectorGroup>
                <ModelSelectorGroup heading="Anthropic">
                  {models
                    .filter((m) => m.provider === 'anthropic')
                    .map((m) => (
                      <ModelSelectorItem
                        key={m.id}
                        value={m.id}
                        onSelect={() => {
                          if (!m.available) return
                          setModel(m.id)
                          setSelectorOpen(false)
                        }}
                        className={!m.available ? 'opacity-50 cursor-not-allowed' : ''}
                      >
                        <ModelSelectorLogo provider={m.provider} />
                        <ModelSelectorName>{m.name}</ModelSelectorName>
                        {!m.available && (
                          <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
                        )}
                      </ModelSelectorItem>
                    ))}
                </ModelSelectorGroup>
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        </PromptInputTools>
        <PromptInputSubmit disabled={disabled || !text.trim()} status={status} onStop={onStop} />
      </PromptInputFooter>
    </PromptInput>
  )
}
