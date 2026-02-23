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
import { cn } from '@/lib/utils'

export type { PromptInputMessage }

const models = [
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'openai' as const, available: true },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' as const, available: false },
]

interface LandingPromptBarProps {
  onSubmit: (message: PromptInputMessage) => void | Promise<void>
  placeholder?: string
}

export function LandingPromptBar({
  onSubmit,
  placeholder = 'Describe the app you want to build...',
}: LandingPromptBarProps) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [model, setModel] = useState(models[0].id)
  const [selectorOpen, setSelectorOpen] = useState(false)

  const selectedModel = useMemo(() => models.find((m) => m.id === model) ?? models[0], [model])

  function handleSubmit(message: PromptInputMessage) {
    const result = onSubmit(message)
    setText('')
    return result
  }

  return (
    <div
      className={cn(
        'w-full rounded-xl bg-white transition-all duration-200',
        '[&>form>div]:!border-0 [&>form>div]:!ring-0 [&>form>div]:!shadow-none',
        focused
          ? 'shadow-[0_32px_80px_-8px_rgba(0,0,0,0.45)] -translate-y-1'
          : 'shadow-2xl',
      )}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
    <PromptInput onSubmit={handleSubmit} multiple>
      <PromptInputBody>
        <PromptInputTextarea
          className="min-h-24"
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
        <PromptInputSubmit
          className="rounded-full"
          disabled={!text.trim()}
        />
      </PromptInputFooter>
    </PromptInput>
    </div>
  )
}
