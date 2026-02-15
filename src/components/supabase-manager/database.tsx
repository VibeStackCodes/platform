'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Table as TableIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { type ZodTypeAny, z } from 'zod'
import { DynamicForm } from '@/components/dynamic-form'
import { ResultsTable } from '@/components/results-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { runQuery, useRunQuery } from '@/hooks/use-run-query'
import { useListTables } from '@/hooks/use-tables'

// Type definitions for pg-meta table/column objects
interface PgColumn {
  name: string
  data_type: string
  is_nullable: boolean
  is_updatable: boolean
  is_generated: boolean
  enums?: string[]
  default_value?: string | null
  is_identity?: boolean
}

interface PgPrimaryKey {
  name: string
}

interface PgTable {
  id: string
  name: string
  columns: PgColumn[]
  primary_keys?: PgPrimaryKey[]
  live_rows_estimate?: number
}

// Helper to generate a Zod schema from the table's column definitions
export function generateZodSchema(table: PgTable): z.ZodObject<Record<string, ZodTypeAny>> {
  if (!table || !table.columns) {
    return z.object({})
  }

  const shape: Record<string, ZodTypeAny> = {}
  for (const column of table.columns) {
    if (!column.is_updatable || column.is_generated) continue

    let fieldSchema: ZodTypeAny
    const dataType = column.data_type.toLowerCase()

    if (dataType.includes('array')) {
      fieldSchema = z.array(z.any())
    } else if (dataType.includes('int') || dataType.includes('numeric')) {
      fieldSchema = z.number()
    } else if (dataType.includes('bool')) {
      fieldSchema = z.boolean()
    } else if (
      dataType === 'user-defined' &&
      column.enums &&
      Array.isArray(column.enums) &&
      column.enums.length > 0
    ) {
      fieldSchema = z.enum(column.enums as [string, ...string[]])
    } else {
      fieldSchema = z.string()
    }

    if (column.is_nullable) {
      fieldSchema = fieldSchema.nullish()
    }

    shape[column.name] = fieldSchema
  }
  return z.object(shape)
}

export const getPrimaryKeys = (table: PgTable): string[] => {
  if (!table || !table.primary_keys) return []
  return table.primary_keys.map((pk) => pk.name)
}

function EditRowView({
  projectRef,
  table,
  row,
  onSuccess,
  onBack,
}: {
  projectRef: string
  table: PgTable
  row: Record<string, unknown>
  onSuccess: () => void
  onBack: () => void
}) {
  const { mutate: runUpdateQuery, isPending: isUpdatePending } = useRunQuery()
  const formSchema = useMemo(() => generateZodSchema(table), [table])

  const columnInfo = useMemo(() => {
    if (!table || !table.columns) return {}
    const info: Record<string, { data_type: string; is_nullable: boolean }> = {}
    for (const column of table.columns) {
      if (!column.is_updatable || column.is_generated) continue
      const dataType = column.data_type.toLowerCase()
      const displayType =
        dataType === 'user-defined' && column.enums && column.enums.length > 0 ? 'enum' : dataType
      info[column.name] = { data_type: displayType, is_nullable: column.is_nullable }
    }
    return info
  }, [table])

  const handleFormSubmit = useCallback(
    (formData: Record<string, unknown>) => {
      const pks = getPrimaryKeys(table)
      if (pks.length === 0) {
        toast.error('Cannot update row: no primary key.')
        return
      }

      const setClauses = Object.entries(formData)
        .map(([key, value]) => {
          if (JSON.stringify(row[key]) === JSON.stringify(value)) return null
          const column = table.columns.find((col) => col.name === key)
          const dataType = column?.data_type?.toLowerCase() || ''
          const isNullable = column?.is_nullable || false

          let formattedValue
          if (
            value === null ||
            value === undefined ||
            (typeof value === 'string' && value.trim() === '')
          ) {
            formattedValue = isNullable ? 'NULL' : "''"
          } else if (dataType.includes('array')) {
            const jsonObj = JSON.stringify({ [key]: Array.isArray(value) ? value : [] })
            formattedValue = `(select ${key} from json_populate_record(null::public."${table.name}", '${jsonObj.replace(/'/g, "''")}'))`
          } else if (dataType === 'user-defined' && column?.enums) {
            formattedValue = `'${String(value).replace(/'/g, "''")}'`
          } else if (typeof value === 'string') {
            formattedValue = `'${value.replace(/'/g, "''")}'`
          } else {
            formattedValue = value
          }
          return `"${key}" = ${formattedValue}`
        })
        .filter(Boolean)
        .join(', ')

      if (!setClauses) {
        toast.error('No changes to save')
        onSuccess()
        return
      }

      const whereClauses = pks
        .map((pk) => {
          const v = row[pk]
          return `"${pk}" = ${typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v}`
        })
        .join(' AND ')

      runUpdateQuery(
        {
          projectRef,
          query: `UPDATE public."${table.name}" SET ${setClauses} WHERE ${whereClauses};`,
          readOnly: false,
        },
        { onSuccess },
      )
    },
    [projectRef, table, row, runUpdateQuery, onSuccess],
  )

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ChevronLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <h2 className="text-lg font-semibold mb-4">Editing row in {table.name}</h2>
      <DynamicForm
        schema={formSchema}
        initialValues={row}
        onSubmit={handleFormSubmit}
        isLoading={isUpdatePending}
        columnInfo={columnInfo}
      />
    </div>
  )
}

function TableRecordsView({
  projectRef,
  table,
  onBack,
}: {
  projectRef: string
  table: PgTable
  onBack: () => void
}) {
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  const { data: rows, isLoading } = useQuery<unknown, Error, Record<string, unknown>[]>({
    queryKey: ['table-records', projectRef, table.name, refetchKey],
    queryFn: async () => {
      const result = await runQuery({
        projectRef,
        query: `SELECT * FROM public."${table.name}" LIMIT 100;`,
        readOnly: true,
      })
      // runQuery returns unknown, we assert it's an array of records
      return (result ?? []) as Record<string, unknown>[]
    },
    enabled: !!projectRef && !!table.name,
  })

  if (editingRow) {
    return (
      <EditRowView
        projectRef={projectRef}
        table={table}
        row={editingRow}
        onSuccess={() => {
          setEditingRow(null)
          setRefetchKey((k) => k + 1)
        }}
        onBack={() => setEditingRow(null)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 p-4 border-b">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h2 className="text-sm font-semibold font-mono">{table.name}</h2>
        <span className="text-xs text-muted-foreground">({table.live_rows_estimate} rows)</span>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <ResultsTable data={rows || []} onRowClick={setEditingRow} />
      )}
    </div>
  )
}

export function DatabaseManager({ projectRef }: { projectRef: string }) {
  const [selectedTable, setSelectedTable] = useState<PgTable | null>(null)
  const { data: tablesData, isLoading, isError } = useListTables(projectRef, ['public'])
  // useListTables returns unknown, we assert it's an array of PgTable
  const tables = (tablesData ?? []) as PgTable[]

  if (selectedTable) {
    return (
      <TableRecordsView
        projectRef={projectRef}
        table={selectedTable}
        onBack={() => setSelectedTable(null)}
      />
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Database</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage the data stored in your app.
        </p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error loading tables</AlertTitle>
          <AlertDescription>There was a problem loading your database tables.</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {tables && tables.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {tables.map((table) => (
            <Button
              variant="outline"
              key={table.id}
              size="lg"
              className="flex-row justify-between text-left"
              onClick={() => setSelectedTable(table)}
            >
              <TableIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium font-mono truncate flex-1">{table.name}</h2>
              <div className="text-sm text-muted-foreground font-mono shrink-0">
                {table.live_rows_estimate} rows
              </div>
            </Button>
          ))}
        </div>
      ) : !isLoading ? (
        <Alert>
          <TableIcon className="h-4 w-4" />
          <AlertTitle>No database tables</AlertTitle>
          <AlertDescription>Tables will appear here after your app is generated.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
