'use client'

import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type PageStatus = 'pending' | 'generating' | 'complete' | 'error'

export interface PageEntry {
  fileName: string
  route: string
  componentName: string
  status: PageStatus
  lineCount?: number
  code?: string
}

export interface PageProgressCardProps {
  pages: PageEntry[]
  className?: string
}

function StatusIcon({ status }: { status: PageStatus }) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
    case 'generating':
      return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
    case 'error':
      return <XCircle className="size-4 shrink-0 text-destructive" />
    default:
      return <Circle className="size-4 shrink-0 text-muted-foreground" />
  }
}

function PageRow({ page }: { page: PageEntry }) {
  const [open, setOpen] = useState(false)
  const hasCodePreview = page.status === 'complete' && Boolean(page.code)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-start gap-3 py-2">
        <div className="mt-0.5">
          <StatusIcon status={page.status} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-mono text-sm">{page.fileName}</span>
            <span className="text-muted-foreground text-xs">{page.route}</span>
            {page.status === 'complete' && page.lineCount !== undefined && (
              <span className="text-muted-foreground text-xs">{page.lineCount} lines</span>
            )}
          </div>
        </div>

        {hasCodePreview && (
          <CollapsibleTrigger
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground',
            )}
          >
            <ChevronDown
              className={cn('size-3 transition-transform', open && 'rotate-180')}
            />
            <span className="sr-only">{open ? 'Collapse' : 'Expand'} code preview</span>
          </CollapsibleTrigger>
        )}
      </div>

      {hasCodePreview && (
        <CollapsibleContent>
          <pre className="mb-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
            {page.code}
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export function PageProgressCard({ pages, className }: PageProgressCardProps) {
  const total = pages.length
  const completed = pages.filter((p) => p.status === 'complete').length
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100)

  return (
    <Card className={cn('shadow-none', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Pages</CardTitle>

        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completed}/{total} complete
            </span>
            <span>{percentage}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-2 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="divide-y divide-border pt-0">
        {pages.map((page) => (
          <PageRow key={page.fileName} page={page} />
        ))}
      </CardContent>
    </Card>
  )
}
