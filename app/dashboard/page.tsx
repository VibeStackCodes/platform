/**
 * Dashboard Page
 * Lists all projects for the authenticated user
 */

import { createClient, getUser } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, ExternalLink } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await getUser();

  if (!user) {
    redirect("/");
  }

  const supabase = await createClient();

  // Fetch user's projects
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
  }

  return (
    <div className="container mx-auto p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage and build your AI-powered applications
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/">
            <Plus className="mr-2 size-4" />
            New Project
          </Link>
        </Button>
      </div>

      {/* Projects Grid */}
      {projects && projects.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>
                  {project.description || project.prompt || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium">Status:</span>{" "}
                    <span className="capitalize">{project.status}</span>
                  </div>
                  <div>
                    <span className="font-medium">Created:</span>{" "}
                    {new Date(project.created_at).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button asChild variant="default" className="flex-1">
                  <Link href={`/project/${project.id}`}>
                    <ExternalLink className="mr-2 size-4" />
                    Open
                  </Link>
                </Button>
                {project.preview_url && (
                  <Button asChild variant="outline">
                    <a
                      href={project.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
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
                <Link href="/">
                  <Plus className="mr-2 size-4" />
                  Create Project
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
