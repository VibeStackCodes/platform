// tests/contract-to-pages.test.ts

import { contractToPages } from '@server/lib/contract-to-pages'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToPages', () => {
  const simpleContract: SchemaContract = {
    tables: [
      {
        name: 'task',
        columns: [
          { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
          { name: 'title', type: 'text', nullable: false },
        ],
      },
    ],
  }

  it('generates two pages per table (list + detail)', () => {
    const pages = contractToPages(simpleContract)

    expect(pages).toHaveLength(2)
    expect(pages[0].fileName).toBe('tasks.tsx')
    expect(pages[1].fileName).toBe('tasks.$id.tsx')
  })

  it('generates correct route paths', () => {
    const pages = contractToPages(simpleContract)

    expect(pages[0].routePath).toBe('/_authenticated/tasks')
    expect(pages[1].routePath).toBe('/_authenticated/tasks/$id')
  })

  it('includes auto-generated comment header', () => {
    const pages = contractToPages(simpleContract)

    expect(pages[0].content).toContain('// Auto-generated skeleton by VibeStack — LLM fills SLOT sections')
    expect(pages[1].content).toContain('// Auto-generated skeleton by VibeStack — LLM fills SLOT sections')
  })

  it('list page imports TanStack Router and React hooks', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain("import { createFileRoute } from '@tanstack/react-router'")
    expect(listPage).toContain("import { useState } from 'react'")
  })

  it('list page imports tRPC hooks', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain("import { trpc } from '@/lib/trpc'")
  })

  it('list page imports shadcn/ui components', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain("import { Button } from '@/components/ui/button'")
    expect(listPage).toContain("import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'")
    expect(listPage).toContain("import { Input } from '@/components/ui/input'")
  })

  it('list page defines correct route with createFileRoute', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain("export const Route = createFileRoute('/_authenticated/tasks')({")
    expect(listPage).toContain('component: TaskListPage,')
    expect(listPage).toContain('})')
  })

  it('list page defines component function', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('function TaskListPage() {')
  })

  it('list page uses tRPC list query hook', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('const tasks = trpc.task.list.useQuery()')
  })

  it('list page uses tRPC create mutation hook', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('const createTask = trpc.task.create.useMutation({')
    expect(listPage).toContain('onSuccess: () => tasks.refetch(),')
    expect(listPage).toContain('})')
  })

  it('list page uses tRPC delete mutation hook', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('const deleteTask = trpc.task.delete.useMutation({')
    expect(listPage).toContain('onSuccess: () => tasks.refetch(),')
    expect(listPage).toContain('})')
  })

  it('list page declares state for create dialog', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('const [isCreateOpen, setIsCreateOpen] = useState(false)')
  })

  it('list page declares state for delete target', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)')
  })

  it('list page includes SLOT marker for LLM', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('{/* SLOT: COMPONENT_BODY — LLM fills the JSX return here */}')
  })

  it('list page returns null placeholder', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    expect(listPage).toContain('return null')
  })

  it('detail page imports TanStack Router with Link', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain("import { createFileRoute, Link } from '@tanstack/react-router'")
  })

  it('detail page imports useState', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain("import { useState } from 'react'")
  })

  it('detail page imports tRPC', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain("import { trpc } from '@/lib/trpc'")
  })

  it('detail page imports shadcn/ui components', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain("import { Button } from '@/components/ui/button'")
    expect(detailPage).toContain("import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'")
    expect(detailPage).toContain("import { Input } from '@/components/ui/input'")
  })

  it('detail page defines correct route with id param', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain("export const Route = createFileRoute('/_authenticated/tasks/$id')({")
    expect(detailPage).toContain('component: TaskDetailPage,')
    expect(detailPage).toContain('})')
  })

  it('detail page defines component function', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain('function TaskDetailPage() {')
  })

  it('detail page uses Route.useParams to get id', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain('const { id } = Route.useParams()')
  })

  it('detail page uses tRPC getById query hook', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain('const task = trpc.task.getById.useQuery({ id })')
  })

  it('detail page uses tRPC update mutation hook', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain('const updateTask = trpc.task.update.useMutation({')
    expect(detailPage).toContain('onSuccess: () => task.refetch(),')
    expect(detailPage).toContain('})')
  })

  it('detail page declares editing state', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain('const [isEditing, setIsEditing] = useState(false)')
  })

  it('detail page includes SLOT marker for LLM', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain('{/* SLOT: COMPONENT_BODY — LLM fills the JSX return here */}')
  })

  it('detail page returns null placeholder', () => {
    const pages = contractToPages(simpleContract)
    const detailPage = pages[1].content

    expect(detailPage).toContain('return null')
  })

  it('handles snake_case table names with kebab-case conversion', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'user_profile',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
          ],
        },
      ],
    }
    const pages = contractToPages(contract)

    // File names use kebab-case plural
    expect(pages[0].fileName).toBe('user-profiles.tsx')
    expect(pages[1].fileName).toBe('user-profiles.$id.tsx')

    // Route paths use kebab-case plural
    expect(pages[0].routePath).toBe('/_authenticated/user-profiles')
    expect(pages[1].routePath).toBe('/_authenticated/user-profiles/$id')

    // Component names use PascalCase
    expect(pages[0].content).toContain('function UserProfileListPage() {')
    expect(pages[1].content).toContain('function UserProfileDetailPage() {')

    // tRPC uses camelCase
    expect(pages[0].content).toContain('const userProfiles = trpc.userProfile.list.useQuery()')
    expect(pages[0].content).toContain('const createUserProfile = trpc.userProfile.create.useMutation({')
    expect(pages[0].content).toContain('const deleteUserProfile = trpc.userProfile.delete.useMutation({')

    expect(pages[1].content).toContain('const userProfile = trpc.userProfile.getById.useQuery({ id })')
    expect(pages[1].content).toContain('const updateUserProfile = trpc.userProfile.update.useMutation({')
  })

  it('handles multiple tables', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'task',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
        {
          name: 'project',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }
    const pages = contractToPages(contract)

    expect(pages).toHaveLength(4) // 2 tables × 2 pages each

    // Task pages
    expect(pages[0].fileName).toBe('tasks.tsx')
    expect(pages[1].fileName).toBe('tasks.$id.tsx')
    expect(pages[0].content).toContain('function TaskListPage()')
    expect(pages[1].content).toContain('function TaskDetailPage()')

    // Project pages
    expect(pages[2].fileName).toBe('projects.tsx')
    expect(pages[3].fileName).toBe('projects.$id.tsx')
    expect(pages[2].content).toContain('function ProjectListPage()')
    expect(pages[3].content).toContain('function ProjectDetailPage()')
  })

  it('handles pluralization correctly', () => {
    const contract: SchemaContract = {
      tables: [
        {
          name: 'category',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
        {
          name: 'status',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
        {
          name: 'box',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }
    const pages = contractToPages(contract)

    // category → categories (y → ies)
    expect(pages[0].fileName).toBe('categories.tsx')
    expect(pages[0].content).toContain('const categories = trpc.category.list.useQuery()')

    // status → statuses (s → ses)
    expect(pages[2].fileName).toBe('statuses.tsx')
    expect(pages[2].content).toContain('const statuses = trpc.status.list.useQuery()')

    // box → boxes (x → xes)
    expect(pages[4].fileName).toBe('boxes.tsx')
    expect(pages[4].content).toContain('const boxes = trpc.box.list.useQuery()')
  })

  it('uses consistent variable naming throughout', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content
    const detailPage = pages[1].content

    // List page: plural variable names
    expect(listPage).toContain('const tasks = trpc.task.list.useQuery()')
    expect(listPage).toContain('onSuccess: () => tasks.refetch(),')

    // Detail page: singular variable names
    expect(detailPage).toContain('const task = trpc.task.getById.useQuery({ id })')
    expect(detailPage).toContain('onSuccess: () => task.refetch(),')
  })

  it('all imports are on separate lines for clarity', () => {
    const pages = contractToPages(simpleContract)
    const listPage = pages[0].content

    // Check imports are formatted consistently
    expect(listPage).toContain("import { createFileRoute } from '@tanstack/react-router'")
    expect(listPage).toContain("import { useState } from 'react'")
    expect(listPage).toContain("import { trpc } from '@/lib/trpc'")
    expect(listPage).toContain("import { Button } from '@/components/ui/button'")
    expect(listPage).toContain("import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'")
    expect(listPage).toContain("import { Input } from '@/components/ui/input'")
  })
})
