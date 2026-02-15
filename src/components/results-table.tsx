'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useCallback, useMemo } from 'react'

interface ResultsTableProps {
  data: Record<string, unknown>[]
  onRowClick?: (row: Record<string, unknown>) => void
}

export function ResultsTable({ data, onRowClick }: ResultsTableProps) {
  if (!data || data.length === 0) {
    return <p className="p-4 text-center text-muted-foreground">No results.</p>
  }

  const headers = useMemo(() => (data.length > 0 ? Object.keys(data[0]) : []), [data])

  const formatCell = useCallback((value: unknown) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }, [])

  // Generate stable keys for all rows upfront to avoid array-index-key warning
  const rowsWithKeys = useMemo(
    () =>
      data.map((row, index) => {
        // Try common ID fields first
        if ('id' in row && (typeof row.id === 'string' || typeof row.id === 'number')) {
          return { row, key: `row-${row.id}` }
        }
        // Fallback to content hash for stable key
        return { row, key: `row-${index}-${JSON.stringify(row).slice(0, 50)}` }
      }),
    [data],
  )

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {headers.map((header) => (
              <TableHead className="first:pl-6 lg:first:pl-8 last:pr-6 lg:last:pr-8" key={header}>
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowsWithKeys.map(({ row, key }) => (
            <TableRow
              key={key}
              onClick={() => onRowClick?.(row)}
              className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50 group')}
            >
              {headers.map((header) => (
                <TableCell
                  className="first:pl-6 lg:first:pl-8 last:pr-6 lg:last:pr-8 text-xs text-muted-foreground group-hover:text-foreground min-w-[8rem]"
                  key={`${key}-${header}`}
                >
                  <div className="text-xs font-mono w-fit max-w-96 truncate">
                    {formatCell(row[header])}
                  </div>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
