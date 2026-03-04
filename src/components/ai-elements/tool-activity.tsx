import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FileEdit,
  FolderOpen,
  GitCommitHorizontal,
  Loader2,
  Package,
  Play,
  Search,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolStep } from '@/hooks/use-agent-stream'
import type { PanelContent } from '@/components/right-panel'

// ── Icon mapping for tool types ──────────────────────────────────────

function getToolIcon(tool: string) {
  switch (tool) {
    case 'writeFile':
    case 'editFile':
    case 'writeFiles':
      return FileEdit
    case 'readFile':
    case 'listFiles':
      return FolderOpen
    case 'runCommand':
    case 'runBuild':
      return Terminal
    case 'installPackage':
      return Package
    case 'webSearch':
    case 'web_search':
    case 'web_search_tool':
      return Search
    case 'createSandbox':
      return Play
    case 'getPreviewUrl':
      return Eye
    case 'commitAndPush':
      return GitCommitHorizontal
    default:
      return Wrench
  }
}

/** Extract just the filename from a path like "src/components/Foo.tsx" */
function basename(path: string): string {
  return path.split('/').pop() ?? path
}

/** Count added/removed lines by diffing old vs new content line-by-line */
function getLineCount(step: ToolStep): string | null {
  if (step.newContent) {
    if (step.oldContent) {
      // Count actual additions and deletions via simple line set diff
      const oldLines = new Set(step.oldContent.split('\n'))
      const newLines = new Set(step.newContent.split('\n'))
      let added = 0
      let removed = 0
      for (const line of newLines) {
        if (!oldLines.has(line)) added++
      }
      for (const line of oldLines) {
        if (!newLines.has(line)) removed++
      }
      if (added === 0 && removed === 0) return null
      const parts: string[] = []
      if (added > 0) parts.push(`+${added}`)
      if (removed > 0) parts.push(`-${removed}`)
      return parts.join(' ')
    }
    return `+${step.newContent.split('\n').length}`
  }
  // Fall back to byte estimate from result summary
  if (!step.result) return null
  const bytesMatch = step.result.match(/\((\d+)\s*bytes?\)/)
  if (bytesMatch) {
    const bytes = Number.parseInt(bytesMatch[1], 10)
    const lines = Math.round(bytes / 30)
    return `+${lines}`
  }
  return null
}

// ── ToolActivity component ──────────────────────────────────────────

interface ToolActivityProps {
  steps: ToolStep[]
  onPanelOpen?: (content: PanelContent) => void
  className?: string
}

export function ToolActivity({ steps, onPanelOpen, className }: ToolActivityProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (steps.length === 0) return null

  const completedCount = steps.filter((s) => s.status === 'complete').length
  const hasRunning = steps.some((s) => s.status === 'running')
  const allDone = !hasRunning && completedCount === steps.length

  const headerLabel = hasRunning
    ? `Working on ${steps.length} task${steps.length !== 1 ? 's' : ''}…`
    : `Completed ${completedCount} task${completedCount !== 1 ? 's' : ''}`

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {hasRunning ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0 text-green-500" />
        )}
        <span className="text-sm font-medium text-muted-foreground">{headerLabel}</span>
        <ChevronDown
          className={cn(
            'ml-auto size-4 text-muted-foreground transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      </button>

      {/* Steps list */}
      {!collapsed && (
        <div className="border-t px-3 py-2">
          <div className="space-y-0">
            {steps.map((step, i) => {
              const Icon = getToolIcon(step.tool)
              const isLast = i === steps.length - 1 && allDone
              const lineInfo = getLineCount(step)
              const file = step.filePath ? basename(step.filePath) : null

              return (
                <div key={step.id} className="relative flex items-start gap-2.5 py-1.5">
                  {/* Connecting line */}
                  {!isLast && i < steps.length - 1 && (
                    <div className="absolute left-[11px] top-8 h-[calc(100%-8px)] w-px bg-border" />
                  )}

                  {/* Step icon */}
                  <div className="flex size-6 shrink-0 items-center justify-center">
                    {step.status === 'complete' ? (
                      <CheckCircle2 className="size-4 text-green-500" />
                    ) : step.status === 'error' ? (
                      <XCircle className="size-4 text-red-500" />
                    ) : step.status === 'running' ? (
                      <Loader2 className="size-4 animate-spin text-blue-400" />
                    ) : (
                      <Icon className="size-4 text-muted-foreground/60" />
                    )}
                  </div>

                  {/* Step body */}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                    <span className="text-[13px] leading-tight text-muted-foreground">
                      {step.label}
                    </span>

                    {/* File badge */}
                    {file && step.filePath && (
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                          'bg-muted font-mono text-xs text-muted-foreground',
                          'transition-colors hover:bg-muted/80 hover:text-foreground',
                          onPanelOpen && 'cursor-pointer',
                        )}
                        onClick={() => {
                          if (onPanelOpen && step.filePath) {
                            if (step.newContent) {
                              onPanelOpen({
                                type: 'diff',
                                filename: step.filePath,
                                oldContent: step.oldContent,
                                newContent: step.newContent,
                              })
                            } else {
                              onPanelOpen({
                                type: 'code',
                                filename: step.filePath,
                                code: step.result ?? '// No content available',
                                language: step.filePath.split('.').pop(),
                              })
                            }
                          }
                        }}
                      >
                        {file}
                      </button>
                    )}

                    {/* Line count diff */}
                    {lineInfo && (
                      <span className="flex gap-1.5 font-mono text-xs font-medium">
                        {lineInfo.split(' ').map((part) => (
                          <span
                            key={part}
                            className={part.startsWith('+') ? 'text-green-500' : 'text-red-500'}
                          >
                            {part}
                          </span>
                        ))}
                      </span>
                    )}

                    {/* Duration */}
                    {step.status === 'complete' && step.durationMs != null && (
                      <span className="text-xs text-muted-foreground/50">
                        {step.durationMs >= 1000
                          ? `${(step.durationMs / 1000).toFixed(1)}s`
                          : `${step.durationMs}ms`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
