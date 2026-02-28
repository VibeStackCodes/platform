import type React from 'react'

interface ArtifactCardProps {
  icon: React.ReactNode
  title: string
  meta: string
  actionLabel?: string
  onClick: () => void
  onAction?: () => void
}

export function ArtifactCard({
  icon,
  title,
  meta,
  actionLabel,
  onClick,
  onAction,
}: ArtifactCardProps) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-xl border bg-background p-3.5 max-w-lg cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      {/* Icon thumbnail */}
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{meta}</div>
      </div>

      {/* Action button */}
      {actionLabel && (
        <button
          className="shrink-0 rounded-md border px-4 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onAction?.()
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
