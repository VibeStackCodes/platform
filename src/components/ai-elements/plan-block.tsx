import { cn } from '@/lib/utils'

export interface PlanItem {
  title: string
  description: string
}

export interface PlanBlockProps {
  title: string
  items: PlanItem[]
  className?: string
}

export function PlanBlock({ title, items, className }: PlanBlockProps) {
  return (
    <div
      className={cn(
        'bg-secondary border border-border rounded-xl px-5 py-4 max-w-[600px]',
        className,
      )}
    >
      <p className="text-sm font-semibold text-foreground mb-2.5">{title}</p>
      <ol className="list-decimal pl-5 space-y-1.5">
        {items.map((item) => (
          <li
            key={item.title}
            className="text-sm leading-[1.65] text-muted-foreground"
          >
            <span className="text-foreground font-semibold">{item.title}</span>
            {' \u2014 '}
            {item.description}
          </li>
        ))}
      </ol>
    </div>
  )
}
