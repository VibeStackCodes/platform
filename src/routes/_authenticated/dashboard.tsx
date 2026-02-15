import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ExternalLink, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error('Failed to fetch projects')
      return res.json() as Promise<
        Array<{
          id: string
          name: string
          description: string | null
          prompt: string | null
          status: string
          previewUrl: string | null
          createdAt: string
        }>
      >
    },
  })

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage and build your AI-powered applications</p>
        </div>
        <Button asChild size="lg">
          <Link to="/">
            <Plus className="mr-2 size-4" />
            New Project
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-muted-foreground">Loading projects...</p>
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>
                  {project.description || project.prompt || 'No description'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium">Status:</span>{' '}
                    <span className="capitalize">{project.status}</span>
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>{' '}
                    {new Date(project.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button asChild variant="default" className="flex-1">
                  <Link to="/project/$id" params={{ id: project.id }}>
                    <ExternalLink className="mr-2 size-4" />
                    Open
                  </Link>
                </Button>
                {project.previewUrl && (
                  <Button asChild variant="outline">
                    <a href={project.previewUrl} target="_blank" rel="noopener noreferrer">
                      Preview
                    </a>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex min-h-[400px] flex-col items-center justify-center">
            <div className="text-center">
              <h3 className="mb-2 text-lg font-semibold">No projects yet</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Get started by creating your first AI-powered application
              </p>
              <Button asChild>
                <Link to="/">
                  <Plus className="mr-2 size-4" />
                  Create Project
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
