import { useState } from 'react'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'

export type { PromptInputMessage }

interface LandingPromptBarProps {
  onSubmit: (message: PromptInputMessage) => void | Promise<void>
  placeholder?: string
}

export function LandingPromptBar({
  onSubmit,
  placeholder = 'Describe the app you want to build...',
}: LandingPromptBarProps) {
  const [text, setText] = useState('')

  function handleSubmit(message: PromptInputMessage) {
    const result = onSubmit(message)
    setText('')
    return result
  }

  return (
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
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
        </PromptInputTools>
        <PromptInputSubmit
          className="rounded-full"
          disabled={!text.trim()}
        />
      </PromptInputFooter>
    </PromptInput>
  )
}
