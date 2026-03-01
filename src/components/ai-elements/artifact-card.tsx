import type { ReactNode } from 'react'
import { ChevronRight, Code2, Download, File, FileText, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ArtifactVariant = 'doc' | 'design' | 'code' | 'default'

export interface ArtifactCardProps {
  title: string
  meta: string
  variant?: ArtifactVariant
  icon?: ReactNode
  size?: 'default' | 'lg'
  onClick?: () => void
  onDownload?: () => void
  className?: string
}

const VARIANT_ICON_CLASSES: Record<ArtifactVariant, string> = {
  doc: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  design: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  code: 'bg-purple-500/12 text-purple-600 dark:text-purple-400',
  default: 'bg-muted text-muted-foreground',
}

function DefaultIcon({ variant, size }: { variant: ArtifactVariant; size: number }) {
  const props = { size, strokeWidth: 1.75 }
  switch (variant) {
    case 'doc':
      return <FileText {...props} />
    case 'design':
      return <Palette {...props} />
    case 'code':
      return <Code2 {...props} />
    default:
      return <File {...props} />
  }
}

export function ArtifactCard({
  title,
  meta,
  variant = 'default',
  icon,
  size = 'default',
  onClick,
  onDownload,
  className,
}: ArtifactCardProps) {
  const isLarge = size === 'lg'

  if (isLarge) {
    return (
      <div
        className={cn(
          'flex items-center gap-3.5 px-4 py-3.5 bg-background border border-border rounded-2xl max-w-[520px]',
          className,
        )}
      >
        {/* Icon wrapper */}
        <div
          className={cn(
            'size-12 rounded-lg flex items-center justify-center shrink-0',
            VARIANT_ICON_CLASSES[variant],
          )}
        >
          {icon ?? <DefaultIcon variant={variant} size={22} />}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          <p className="text-xs text-muted-foreground/50 mt-0.5">{meta}</p>
        </div>

        {/* Download button */}
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="px-4 py-1.5 border border-border rounded-lg bg-background text-foreground text-[13px] font-medium hover:bg-muted transition-colors shrink-0"
          >
            <Download size={14} className="inline-block mr-1.5 -mt-px" />
            Download
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-3 p-3 bg-secondary border border-border rounded-xl transition-all max-w-[400px]',
        onClick && 'cursor-pointer hover:border-primary hover:shadow-md',
        className,
      )}
    >
      {/* Icon wrapper */}
      <div
        className={cn(
          'size-9 rounded-lg flex items-center justify-center shrink-0',
          VARIANT_ICON_CLASSES[variant],
        )}
      >
        {icon ?? <DefaultIcon variant={variant} size={18} />}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-foreground truncate">{title}</p>
        <p className="text-[11.5px] text-muted-foreground/50 mt-0.5">{meta}</p>
      </div>

      {/* Right arrow */}
      <ChevronRight size={14} className="text-muted-foreground/50 shrink-0" />
    </div>
  )
}
