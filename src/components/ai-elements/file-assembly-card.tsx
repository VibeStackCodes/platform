'use client'

import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface AssemblyEntry {
  path: string
  category: 'config' | 'ui-kit' | 'route' | 'migration' | 'style' | 'wiring'
}

export interface FileAssemblyCardProps {
  files: AssemblyEntry[]
  className?: string
}

const categoryColors: Record<string, string> = {
  config: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'ui-kit': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  route: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  migration: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  style: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  wiring: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
}

function FileRow({ file }: { file: AssemblyEntry }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{file.path}</span>
      <Badge
        variant="secondary"
        className={cn('shrink-0 text-[10px] font-medium', categoryColors[file.category])}
      >
        {file.category}
      </Badge>
    </div>
  )
}

export function FileAssemblyCard({ files, className }: FileAssemblyCardProps) {
  const total = files.length

  return (
    <Card className={cn('shadow-none', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Files Assembled</CardTitle>

        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{total} files</span>
            <span>100%</span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={100}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-2 rounded-full bg-primary transition-all duration-300"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="divide-y divide-border pt-0">
        {files.map((file) => (
          <FileRow key={file.path} file={file} />
        ))}
      </CardContent>
    </Card>
  )
}
