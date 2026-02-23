import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ProjectLayout } from '@/components/project-layout'
import { apiFetch } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/project/$id')({
  component: ProjectPage,
})

function ProjectPage() {
  const { id } = Route.useParams()

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${id}`)
      if (!res.ok) throw new Error('Project not found')
      return res.json() as Promise<{
        id: string
        name: string
        prompt: string | null
        status: string
        sandboxId: string | null
      }>
    },
  })

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  return (
    <ProjectLayout
      projectId={id}
      initialPrompt={project.status === 'pending' ? (project.prompt ?? undefined) : undefined}
      initialSandboxId={project.sandboxId ?? undefined}
    />
  )
}
