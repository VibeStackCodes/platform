import { useMemo } from 'react'
import { cn } from '@/lib/utils'

// ── Simple LCS-based diff ────────────────────────────────────────────

interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  oldNum?: number
  newNum?: number
  text: string
}

/**
 * Compute a unified diff between two strings using a simple LCS approach.
 * For new files (no oldContent), all lines are additions.
 */
function computeDiff(oldContent: string | undefined, newContent: string): DiffLine[] {
  const newLines = newContent.split('\n')

  // New file — everything is an addition
  if (!oldContent) {
    return newLines.map((text, i) => ({
      type: 'add' as const,
      newNum: i + 1,
      text,
    }))
  }

  const oldLines = oldContent.split('\n')

  // Build LCS table
  const m = oldLines.length
  const n = newLines.length

  // For very large files, fall back to simple approach
  if (m * n > 1_000_000) {
    return simpleDiff(oldLines, newLines)
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'ctx', oldNum: i, newNum: j, text: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', newNum: j, text: newLines[j - 1] })
      j--
    } else {
      result.push({ type: 'del', oldNum: i, text: oldLines[i - 1] })
      i--
    }
  }

  return result.reverse()
}

/** Fallback for huge files — just show all old as deleted, all new as added */
function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = []
  for (let i = 0; i < oldLines.length; i++) {
    result.push({ type: 'del', oldNum: i + 1, text: oldLines[i] })
  }
  for (let i = 0; i < newLines.length; i++) {
    result.push({ type: 'add', newNum: i + 1, text: newLines[i] })
  }
  return result
}

// ── DiffViewer component ─────────────────────────────────────────────

interface DiffViewerProps {
  filename: string
  oldContent?: string
  newContent: string
  className?: string
}

export function DiffViewer({ filename, oldContent, newContent, className }: DiffViewerProps) {
  const lines = useMemo(() => computeDiff(oldContent, newContent), [oldContent, newContent])
  const isNewFile = !oldContent

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {isNewFile ? 'Created' : 'Edited'}
        </span>
        <span className="font-mono text-xs text-foreground">{filename}</span>
      </div>

      {/* Diff lines */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[13px] leading-[1.5]">
          <tbody>
            {lines.map((line, i) => (
              <tr
                key={`${line.type}-${i}`}
                className={cn(
                  line.type === 'add' && 'bg-green-500/10',
                  line.type === 'del' && 'bg-red-500/10',
                )}
              >
                {/* Old line number */}
                <td className="w-[1px] select-none whitespace-nowrap px-2 text-right text-muted-foreground/40">
                  {line.type !== 'add' ? line.oldNum : ''}
                </td>
                {/* New line number */}
                <td className="w-[1px] select-none whitespace-nowrap px-2 text-right text-muted-foreground/40">
                  {line.type !== 'del' ? line.newNum : ''}
                </td>
                {/* +/- indicator */}
                <td
                  className={cn(
                    'w-[1px] select-none px-1 text-center',
                    line.type === 'add' && 'text-green-500',
                    line.type === 'del' && 'text-red-500',
                  )}
                >
                  {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                </td>
                {/* Code */}
                <td
                  className={cn(
                    'whitespace-pre-wrap break-all px-2',
                    line.type === 'add' && 'text-green-400',
                    line.type === 'del' && 'text-red-400',
                    line.type === 'ctx' && 'text-foreground/70',
                  )}
                >
                  {line.text || '\u00A0'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
