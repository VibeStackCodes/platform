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
    expect(result).toContain("import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'")
    expect(result).toContain("import { supabase } from '@/lib/supabase'")
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

  it('uses supabase.from().select().eq().single() for getById', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain("supabase.from('task').select('*').eq('id', id).single()")
    expect(result).toContain('useQuery(')
  })

  it('uses supabase.from().update() mutation', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain("supabase.from('task').update(values).eq('id', id)")
    expect(result).toContain('useMutation(')
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

  it('does not contain any tRPC references', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).not.toContain('trpc')
    expect(result).not.toContain('tRPC')
    expect(result).not.toContain('getById.useQuery')
    expect(result).not.toContain('update.useMutation')
  })

  it('uses isPending instead of isLoading for TanStack Query v5', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    expect(result).toContain('isPending')
    expect(result).not.toContain('.isLoading')
  })

  it('update mutation does not pass id as argument (id captured in closure)', () => {
    const result = assembleDetailPage(taskSpec, testContract)
    // The mutation payload should NOT include { id, ... } — id is in the closure
    expect(result).not.toContain('mutate({ id,')
    expect(result).not.toContain('update.mutate({ id')
  })
})
