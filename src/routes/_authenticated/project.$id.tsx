import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ProjectLayout } from '@/components/project-layout'

export const Route = createFileRoute('/_authenticated/project/$id')({
  component: ProjectPage,
})

function ProjectPage() {
  const { id } = Route.useParams()

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) throw new Error('Project not found')
      return res.json() as Promise<{
        id: string
        name: string
        prompt: string | null
        status: string
        sandboxId: string | null
        supabaseUrl: string | null
        supabaseProjectId: string | null
      }>
    },
  })

  const { data: messages } = useQuery({
    queryKey: ['project-messages', id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}/messages`)
      if (!res.ok) return []
      return res.json() as Promise<
        Array<{
          id: string
          role: string
          parts: unknown
          createdAt: string
        }>
      >
    },
    enabled: !!project,
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

  const initialMessages = messages?.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant' | 'system',
    parts: (typeof m.parts === 'string' ? JSON.parse(m.parts) : m.parts) as Array<
      Record<string, unknown>
    >,
  }))

  return (
    <ProjectLayout
      projectId={id}
      initialPrompt={project.status === 'pending' ? (project.prompt ?? undefined) : undefined}
      initialMessages={initialMessages}
      initialSandboxId={project.sandboxId ?? undefined}
      initialSupabaseUrl={project.supabaseUrl ?? undefined}
      initialSupabaseProjectId={project.supabaseProjectId ?? undefined}
    />
  )
}
