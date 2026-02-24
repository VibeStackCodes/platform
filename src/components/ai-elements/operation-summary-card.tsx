import { CheckCircle2, Link2 } from 'lucide-react'
import { ActionCard, ActionCardHeader, ActionCardTabs, ActionCardContent } from './action-card'

interface FileEntry {
  path: string
  category: string
}

interface OperationSummaryCardProps {
  files: FileEntry[]
  packages?: string[]
  status: 'running' | 'complete'
  durationMs?: number
}

export function OperationSummaryCard({ files, packages = [], status, durationMs }: OperationSummaryCardProps) {
  const parts: string[] = []
  if (files.length > 0) parts.push(`${files.length} files`)
  if (packages.length > 0) parts.push(`${packages.length} packages`)
  const summary = parts.join(', ')

  const label = status === 'running' ? 'Assembling files...' : `Assembled ${summary}`

  return (
    <ActionCard>
      <ActionCardHeader icon="package" label={label} status={status} durationMs={durationMs} />
      <ActionCardTabs>
        <ActionCardContent tab="details">
          <div className="space-y-3">
            {packages.length > 0 && (
              <div className="space-y-1">
                {packages.map((pkg) => (
                  <div key={pkg} className="flex items-center gap-2 text-sm">
                    <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">Installed</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{pkg}</code>
                  </div>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                    <span className="font-mono text-xs text-muted-foreground">{f.path}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ActionCardContent>
      </ActionCardTabs>
    </ActionCard>
  )
}
