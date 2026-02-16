// lib/contract-to-pages.ts
import type { SchemaContract } from './schema-contract'

/**
 * Helper: snake_case → PascalCase
 * Example: user_profile → UserProfile
 */
function snakeToPascal(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

/**
 * Helper: snake_case → camelCase
 * Example: user_profile → userProfile
 */
function snakeToCamel(str: string): string {
  const pascal = snakeToPascal(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

/**
 * Helper: snake_case → kebab-case
 * Example: user_profile → user-profile
 */
function snakeToKebab(str: string): string {
  return str.replace(/_/g, '-')
}

/**
 * Helper: simple pluralization
 * Example: task → tasks, category → categories, status → statuses, box → boxes
 */
function snakeToPlural(str: string): string {
  // Handle common irregular plurals
  if (str.endsWith('y')) {
    return str.slice(0, -1) + 'ies'
  }
  if (str.endsWith('s') || str.endsWith('sh') || str.endsWith('ch') || str.endsWith('x')) {
    return str + 'es'
  }
  return str + 's'
}

export interface PageFile {
  fileName: string
  routePath: string
  content: string
}

/**
 * Deterministically generates page skeleton files from a SchemaContract.
 * For each table, generates a list page and detail page with all deterministic imports,
 * hooks, and state pre-wired. LLM only fills the {/* SLOT: COMPONENT_BODY *\/} JSX sections.
 *
 * Returns array of { fileName, routePath, content } objects.
 */
export function contractToPages(contract: SchemaContract): PageFile[] {
  const pages: PageFile[] = []

  for (const table of contract.tables) {
    const tableName = table.name
    const camelName = snakeToCamel(tableName)
    const pascalName = snakeToPascal(tableName)
    const pluralName = snakeToPlural(tableName)
    const pluralCamel = snakeToCamel(pluralName)
    const pluralKebab = snakeToKebab(pluralName)

    // Generate list page skeleton
    const listPageContent = `// Auto-generated skeleton by VibeStack — LLM fills SLOT sections
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_authenticated/${pluralKebab}')({
  component: ${pascalName}ListPage,
})

function ${pascalName}ListPage() {
  const ${pluralCamel} = trpc.${camelName}.list.useQuery()
  const create${pascalName} = trpc.${camelName}.create.useMutation({
    onSuccess: () => ${pluralCamel}.refetch(),
  })
  const delete${pascalName} = trpc.${camelName}.delete.useMutation({
    onSuccess: () => ${pluralCamel}.refetch(),
  })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  {/* SLOT: COMPONENT_BODY — LLM fills the JSX return here */}
  return null
}
`

    pages.push({
      fileName: `${pluralKebab}.tsx`,
      routePath: `/_authenticated/${pluralKebab}`,
      content: listPageContent,
    })

    // Generate detail page skeleton
    const detailPageContent = `// Auto-generated skeleton by VibeStack — LLM fills SLOT sections
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export const Route = createFileRoute('/_authenticated/${pluralKebab}/$id')({
  component: ${pascalName}DetailPage,
})

function ${pascalName}DetailPage() {
  const { id } = Route.useParams()
  const ${camelName} = trpc.${camelName}.getById.useQuery({ id })
  const update${pascalName} = trpc.${camelName}.update.useMutation({
    onSuccess: () => ${camelName}.refetch(),
  })
  const [isEditing, setIsEditing] = useState(false)

  {/* SLOT: COMPONENT_BODY — LLM fills the JSX return here */}
  return null
}
`

    pages.push({
      fileName: `${pluralKebab}.$id.tsx`,
      routePath: `/_authenticated/${pluralKebab}/$id`,
      content: detailPageContent,
    })
  }

  return pages
}
