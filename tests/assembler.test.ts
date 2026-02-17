import { describe, expect, it } from 'vitest'
import { assembleListPage } from '@server/lib/agents/assembler'
import type { PageFeatureSpec } from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

const testContract: SchemaContract = {
  tables: [
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'status', type: 'text', nullable: false, default: "'pending'" },
        { name: 'due_date', type: 'timestamptz', nullable: true },
        { name: 'is_complete', type: 'boolean', nullable: false, default: 'false' },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
        { name: 'updated_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

const taskSpec: PageFeatureSpec = {
  entityName: 'task',
  listPage: {
    columns: [
      { field: 'title', label: 'Title', format: 'text' },
      { field: 'status', label: 'Status', format: 'badge' },
      { field: 'due_date', label: 'Due Date', format: 'date' },
      { field: 'is_complete', label: 'Done', format: 'boolean' },
    ],
    searchFields: ['title'],
    sortDefault: 'created_at',
    sortDirection: 'desc',
    createFormFields: [
      { field: 'title', label: 'Title', inputType: 'text', placeholder: 'Enter task title' },
      { field: 'status', label: 'Status', inputType: 'select', options: ['pending', 'in_progress', 'done'] },
    ],
    emptyStateMessage: 'No tasks yet. Create your first task!',
  },
  detailPage: {
    headerField: 'title',
    sections: [],
    editFormFields: [],
  },
}

describe('assembleListPage', () => {
  it('returns a complete React component string', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain("import { createFileRoute } from '@tanstack/react-router'")
    expect(result).toContain("import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'")
    expect(result).toContain("import { supabase } from '@/lib/supabase'")
  })

  it('does not contain SLOT markers', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).not.toContain('SLOT')
    expect(result).not.toContain('return null')
  })

  it('includes table headers from columns spec', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('Title')
    expect(result).toContain('Status')
    expect(result).toContain('Due Date')
  })

  it('uses Badge renderer for badge format', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('Badge')
  })

  it('includes create form with specified fields', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('Enter task title')
  })

  it('includes empty state message', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('No tasks yet. Create your first task!')
  })

  it('generates valid JSX (no syntax-level errors)', () => {
    const result = assembleListPage(taskSpec, testContract)
    // Check balanced braces
    const opens = (result.match(/{/g) || []).length
    const closes = (result.match(/}/g) || []).length
    expect(opens).toBe(closes)
  })

  it('defines the route with createFileRoute', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain("createFileRoute('/_authenticated/tasks')")
  })

  it('uses supabase.from() for list, create, and delete', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain("supabase.from('task')")
    expect(result).toContain('useQuery(')
    expect(result).toContain('useMutation(')
  })

  it('contains page-based pagination with Previous/Next buttons (E3)', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('Previous')
    expect(result).toContain('Next')
    expect(result).toContain('setPage(')
    expect(result).toContain('totalCount')
  })

  it('contains sort state and clickable headers (E5)', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('const [sortBy, setSortBy]')
    expect(result).toContain('const [sortOrder, setSortOrder]')
    expect(result).toContain('onClick={() => {')
    expect(result).toContain("sortBy === '")
  })

  it('does not contain any tRPC references', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).not.toContain('trpc')
    expect(result).not.toContain('tRPC')
    expect(result).not.toContain('useInfiniteQuery')
    expect(result).not.toContain('fetchNextPage')
    expect(result).not.toContain('hasNextPage')
  })

  it('uses isPending instead of isLoading for TanStack Query v5', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain('isPending')
    expect(result).not.toContain('.isLoading')
  })

  it('delete mutation uses supabase.from().delete().eq() pattern', () => {
    const result = assembleListPage(taskSpec, testContract)
    expect(result).toContain(".delete().eq('id', id)")
    // The delete mutate call should pass deleteTargetId directly, not { id: deleteTargetId }
    expect(result).not.toContain('mutate({ id: deleteTargetId })')
  })

  it('skips FK dropdown for columns with empty references (Bug 1 guard)', () => {
    const contractWithEmptyRefs: SchemaContract = {
      tables: [
        {
          name: 'user_profile',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
            { name: 'display_name', type: 'text', references: { table: '', column: '' } },
            { name: 'email', type: 'text', references: { table: '', column: 'id' } },
            { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
            { name: 'created_at', type: 'timestamptz', default: 'now()' },
          ],
        },
      ],
    }
    const spec: PageFeatureSpec = {
      entityName: 'user_profile',
      listPage: {
        columns: [
          { field: 'display_name', label: 'Display Name', format: 'text' },
          { field: 'email', label: 'Email', format: 'text' },
        ],
        searchFields: ['display_name'],
        sortDefault: 'created_at',
        sortDirection: 'desc',
        createFormFields: [
          { field: 'display_name', label: 'Display Name', inputType: 'text', placeholder: 'Enter name' },
        ],
        emptyStateMessage: 'No profiles yet.',
      },
      detailPage: {
        headerField: 'display_name',
        sections: [],
        editFormFields: [],
      },
    }
    const result = assembleListPage(spec, contractWithEmptyRefs)
    // Should NOT generate supabase.from('') (empty table name) for empty refs
    expect(result).not.toContain("supabase.from('')")
    expect(result).not.toContain("queryKey: ['', 'dropdown']")
    // Should still be valid-looking code (no parse errors)
    const opens = (result.match(/{/g) || []).length
    const closes = (result.match(/}/g) || []).length
    expect(opens).toBe(closes)
  })
})
