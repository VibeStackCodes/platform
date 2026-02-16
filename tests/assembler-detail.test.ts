import { describe, expect, it } from 'vitest'
import { assembleDetailPage } from '@server/lib/agents/assembler'
import type { PageFeatureSpec } from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

const testContract: SchemaContract = {
  tables: [
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'title', type: 'text', nullable: false },
        { name: 'status', type: 'text', nullable: false },
        { name: 'due_date', type: 'timestamptz', nullable: true },
        { name: 'is_complete', type: 'boolean', nullable: false },
        { name: 'created_at', type: 'timestamptz' },
      ],
    },
  ],
}

const taskSpec: PageFeatureSpec = {
  entityName: 'task',
  listPage: {
    columns: [],
    searchFields: [],
    sortDefault: 'id',
    sortDirection: 'asc',
    createFormFields: [],
    emptyStateMessage: 'Empty',
  },
  detailPage: {
    headerField: 'title',
    sections: [
      {
        title: 'Details',
        fields: [
          { field: 'status', label: 'Status', format: 'badge' },
          { field: 'due_date', label: 'Due Date', format: 'date' },
          { field: 'is_complete', label: 'Complete', format: 'boolean' },
        ],
      },
    ],
    editFormFields: [
      { field: 'title', label: 'Title', inputType: 'text' },
      { field: 'status', label: 'Status', inputType: 'select' },
    ],
  },
}

describe('assembleDetailPage', () => {
  it('returns a complete React component', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain("import { createFileRoute, Link } from '@tanstack/react-router'")
    expect(result).toContain("import { trpc } from '@/lib/trpc'")
  })

  it('does not contain SLOT markers', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).not.toContain('SLOT')
    expect(result).not.toContain('return null')
  })

  it('defines route with $id param', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain("createFileRoute('/_authenticated/tasks/$id')")
  })

  it('uses Route.useParams for id', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('const { id } = Route.useParams()')
  })

  it('uses tRPC getById query', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('trpc.task.getById.useQuery({ id })')
  })

  it('uses tRPC update mutation', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('trpc.task.update.useMutation')
  })

  it('renders detail sections', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('Details')
    expect(result).toContain('Status')
    expect(result).toContain('Due Date')
  })

  it('includes back navigation link', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('Link')
    expect(result).toContain('/tasks')
  })

  it('includes editing state toggle', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('isEditing')
    expect(result).toContain('setIsEditing')
  })
})
