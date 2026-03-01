import { cn } from '@/lib/utils'
import type { SaveStatus } from '@/hooks/use-debounced-save'

interface SaveIndicatorProps {
  status: SaveStatus
  className?: string
}

/**
 * Auto-save status indicator matching the agentic-flow prototype.
 *
 * Three states:
 * - `idle`   — hidden
 * - `saving` — spinning arc (partial circle)
 * - `saved`  — green checkmark
 */
export function SaveIndicator({ status, className }: SaveIndicatorProps) {
  if (status === 'idle') return null

  return (
    <span
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        className,
      )}
      aria-label={status === 'saving' ? 'Saving…' : 'Saved'}
    >
      {status === 'saving' && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 animate-spin text-muted-foreground"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {status === 'saved' && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 text-green-500"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </span>
  )
}
