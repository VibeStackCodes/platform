import { type ReactNode, Suspense, useEffect, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'

export function ThinkingCard({
  startedAt,
  status,
  durationMs,
  children,
}: {
  startedAt: number
  status: 'thinking' | 'complete'
  durationMs?: number
  children?: ReactNode
}) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startedAt) / 1000))

  useEffect(() => {
    if (status !== 'thinking') return
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt, status])

  const displayTime =
    status === 'complete' && durationMs != null
      ? `${Math.round(durationMs / 1000)}s`
      : `${elapsed}s`

  const childText = children != null ? String(children) : null

  return (
    <div className="w-full rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm">
        <Lightbulb className="size-4 text-amber-500" />
        <span className="font-medium text-muted-foreground">
          {status === 'thinking' ? `Thinking... ${displayTime}` : `Thought for ${displayTime}`}
        </span>
      </div>
      {childText != null && (
        <div className="mt-3 text-sm">
          <Suspense fallback={<div className="text-muted-foreground">{childText}</div>}>
            <MessageResponse>{childText}</MessageResponse>
          </Suspense>
        </div>
      )}
    </div>
  )
}
