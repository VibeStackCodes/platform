import { useCallback, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved'

interface UseDebouncedSaveOptions {
  /** Delay in ms before triggering save after last edit (default: 2000) */
  delay?: number
  /** Called with the current content when the debounce fires */
  onSave?: (content: string) => void
}

/**
 * Manages a debounced auto-save indicator.
 *
 * Call `trigger(content)` on every edit. The status transitions:
 *   idle → saving (immediately on first edit)
 *   saving → saved (after `delay` ms of inactivity, fires onSave)
 *   saved → saving (on next edit)
 */
export function useDebouncedSave({ delay = 2000, onSave }: UseDebouncedSaveOptions = {}) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trigger = useCallback(
    (content: string) => {
      setStatus('saving')

      if (timerRef.current) clearTimeout(timerRef.current)

      timerRef.current = setTimeout(() => {
        onSave?.(content)
        setStatus('saved')
        timerRef.current = null
      }, delay)
    },
    [delay, onSave],
  )

  return { status, trigger } as const
}
