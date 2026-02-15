import { contractToRoutes } from '@server/lib/contract-to-routes'
import type { SchemaContract } from '@server/lib/schema-contract'
import { describe, expect, it } from 'vitest'

describe('contractToRoutes', () => {
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

  it('generates FILE markers for list and detail routes', () => {
    const output = contractToRoutes(simpleContract)

    expect(output).toContain('// --- FILE: src/routes/_authenticated/task.tsx ---')
    expect(output).toContain('// --- FILE: src/routes/_authenticated/task.$id.tsx ---')
  })

  it('uses correct TanStack Router createFileRoute paths', () => {
    const output = contractToRoutes(simpleContract)

    expect(output).toContain("createFileRoute('/_authenticated/task')")
    expect(output).toContain("createFileRoute('/_authenticated/task/$id')")
  })

  it('generates correct component names', () => {
    const output = contractToRoutes(simpleContract)

    // List component
    expect(output).toContain('function TaskListPage()')
    expect(output).toContain('component: TaskListPage,')

    // Detail component
    expect(output).toContain('function TaskDetailPage()')
    expect(output).toContain('component: TaskDetailPage,')
  })

  it('imports the right hooks', () => {
    const output = contractToRoutes(simpleContract)

    // List hook (plural)
    expect(output).toContain("import { useTasks } from '@/hooks/use-tasks'")
    expect(output).toContain('const { data: items, isLoading } = useTasks()')

    // Detail hook (singular)
    expect(output).toContain("import { useTaskById } from '@/hooks/use-task'")
    expect(output).toContain('const { data: item, isLoading } = useTaskById(id)')
  })

  it('handles multiple tables', () => {
    const multiTableContract: SchemaContract = {
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

    const output = contractToRoutes(multiTableContract)

    // Task routes
    expect(output).toContain('// --- FILE: src/routes/_authenticated/task.tsx ---')
    expect(output).toContain('// --- FILE: src/routes/_authenticated/task.$id.tsx ---')

    // Project routes
    expect(output).toContain('// --- FILE: src/routes/_authenticated/project.tsx ---')
    expect(output).toContain('// --- FILE: src/routes/_authenticated/project.$id.tsx ---')
  })

  it('uses kebab-case for URL paths', () => {
    const snakeCaseContract: SchemaContract = {
      tables: [
        {
          name: 'user_profile',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }

    const output = contractToRoutes(snakeCaseContract)

    // File paths
    expect(output).toContain('// --- FILE: src/routes/_authenticated/user-profile.tsx ---')
    expect(output).toContain('// --- FILE: src/routes/_authenticated/user-profile.$id.tsx ---')

    // Route paths
    expect(output).toContain("createFileRoute('/_authenticated/user-profile')")
    expect(output).toContain("createFileRoute('/_authenticated/user-profile/$id')")

    // Hook imports
    expect(output).toContain("import { useUserProfiles } from '@/hooks/use-user-profiles'")
    expect(output).toContain("import { useUserProfileById } from '@/hooks/use-user-profile'")
  })

  it('handles pluralization correctly', () => {
    const pluralContract: SchemaContract = {
      tables: [
        {
          name: 'category',
          columns: [{ name: 'id', type: 'uuid', primaryKey: true }],
        },
      ],
    }

    const output = contractToRoutes(pluralContract)

    // Plural for list page
    expect(output).toContain('<h1 className="text-2xl font-bold mb-4">Categories</h1>')
    expect(output).toContain('import { useCategories }')
  })

  it('includes TanStack Router Route.useParams() for detail pages', () => {
    const output = contractToRoutes(simpleContract)

    expect(output).toContain('const { id } = Route.useParams()')
  })

  it('uses consistent component structure', () => {
    const output = contractToRoutes(simpleContract)

    // List page structure
    expect(output).toContain('if (isLoading) return <div>Loading...</div>')
    expect(output).toContain('<div className="container mx-auto py-6">')
    expect(output).toContain('{/* List items */}')

    // Detail page structure
    expect(output).toContain('{/* Show item details */}')
  })

  it('exports Route from createFileRoute', () => {
    const output = contractToRoutes(simpleContract)

    expect(output).toContain('export const Route = createFileRoute')
  })
})
