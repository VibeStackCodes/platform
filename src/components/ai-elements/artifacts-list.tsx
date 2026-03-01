import type { ReactNode } from 'react'
import { Code2, FileText, Paintbrush } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ArtifactListItem {
  id: string
  name: string
  agent?: string
  variant?: 'doc' | 'design' | 'code' | 'default'
  onClick?: () => void
}

export interface ArtifactsListProps {
  title?: string
  items: ArtifactListItem[]
  className?: string
}

const VARIANT_STYLES: Record<
  NonNullable<ArtifactListItem['variant']>,
  { wrapper: string; icon: string; Icon: ReactNode }
> = {
  doc: {
    wrapper: 'bg-blue-100 dark:bg-blue-950',
    icon: 'text-blue-600 dark:text-blue-400',
    Icon: <FileText size={14} />,
  },
  design: {
    wrapper: 'bg-orange-100 dark:bg-orange-950',
    icon: 'text-orange-600 dark:text-orange-400',
    Icon: <Paintbrush size={14} />,
  },
  code: {
    wrapper: 'bg-purple-100 dark:bg-purple-950',
    icon: 'text-purple-600 dark:text-purple-400',
    Icon: <Code2 size={14} />,
  },
  default: {
    wrapper: 'bg-muted',
    icon: 'text-muted-foreground',
    Icon: <FileText size={14} />,
  },
}

function ArtifactItem({ item }: { item: ArtifactListItem }) {
  const variant = item.variant ?? 'default'
  const { wrapper, icon, Icon } = VARIANT_STYLES[variant]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={item.onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') item.onClick?.()
      }}
      className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors hover:bg-background/50 border-b border-border/50 last:border-b-0"
    >
      <span className={cn('size-7 rounded-md flex items-center justify-center shrink-0', wrapper)}>
        <span className={icon}>{Icon}</span>
      </span>

      <span className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-foreground block truncate">{item.name}</span>
      </span>

      {item.agent && (
        <span className="text-[11px] text-muted-foreground/50 shrink-0">{item.agent}</span>
      )}
    </div>
  )
}

export function ArtifactsList({ title = 'Artifacts', items, className }: ArtifactsListProps) {
  return (
    <div className={cn('bg-secondary border border-border rounded-xl overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-foreground border-b border-border">
        <FileText size={15} className="text-muted-foreground" />
        {title}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          No artifacts yet
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <ArtifactItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
