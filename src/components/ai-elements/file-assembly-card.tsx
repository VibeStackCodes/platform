'use client'

import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface AssemblyEntry {
  path: string
  category: 'config' | 'ui-kit' | 'route' | 'migration' | 'style' | 'wiring'
}

export interface FileAssemblyCardProps {
  files: AssemblyEntry[]
  className?: string
}

function FileRow({ file }: { file: AssemblyEntry }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{file.path}</span>
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
