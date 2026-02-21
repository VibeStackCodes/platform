import { useState } from 'react'
import { cn } from '@/lib/utils'
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
  const [focused, setFocused] = useState(false)

  function handleSubmit(message: PromptInputMessage) {
    const result = onSubmit(message)
    setText('')
    return result
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-white transition-all duration-200',
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
    </div>
  )
}
