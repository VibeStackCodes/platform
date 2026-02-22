'use client'

import { ChevronDownIcon, GlobeIcon } from 'lucide-react'
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
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
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
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai' as const, available: true },
  {
    id: 'gpt-5.1-codex-max',
    name: 'GPT-5.1 Codex Max',
    provider: 'openai' as const,
    available: false,
  },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' as const, available: false },
]

interface PromptBarProps {
  onSubmit: (
    message: PromptInputMessage,
    options: { model: string; webSearch: boolean },
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
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [selectorOpen, setSelectorOpen] = useState(false)

  const selectedModel = useMemo(() => models.find((m) => m.id === model) ?? models[0], [model])

  function handleSubmit(message: PromptInputMessage) {
    const result = onSubmit(message, { model, webSearch: useWebSearch })
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
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <PromptInputButton
            onClick={() => setUseWebSearch(!useWebSearch)}
            tooltip={{ content: 'Search the web', shortcut: '⌘K' }}
            variant={useWebSearch ? 'default' : 'ghost'}
          >
            <GlobeIcon size={16} />
            <span>Search</span>
          </PromptInputButton>
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
              </ModelSelectorList>
            </ModelSelectorContent>
          </ModelSelector>
        </PromptInputTools>
        <PromptInputSubmit disabled={disabled || !text.trim()} status={status} onStop={onStop} />
      </PromptInputFooter>
    </PromptInput>
  )
}
