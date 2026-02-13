/**
 * Project Builder Page
 * Dynamic route for building projects with AI
 * 40/60 split: BuilderChat (left) and BuilderPreview (right)
 */

import { ProjectLayout } from "@/components/project-layout";
import { createClient, getUser } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

interface ProjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/");
  }

  if (MOCK_MODE) {
    return <ProjectLayout projectId={id} initialPrompt="Mock project" />;
  }

  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !project) {
    redirect("/dashboard");
  }

  // Load persisted chat messages
  const { data: chatRows } = await supabase
    .from("chat_messages")
    .select("id, role, parts, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  const initialMessages = chatRows?.map((row) => ({
    id: row.id as string,
    role: row.role as "user" | "assistant" | "system",
    parts: (typeof row.parts === "string" ? JSON.parse(row.parts) : row.parts) as Array<Record<string, unknown>>,
  }));

  return (
    <ProjectLayout
      projectId={id}
      initialPrompt={project.status === "pending" ? project.prompt : undefined}
      initialMessages={initialMessages}
      initialSandboxId={project.sandbox_id}
      initialPreviewUrl={project.preview_url}
      initialCodeServerUrl={project.code_server_url}
      initialSupabaseUrl={project.supabase_url}
    />
  );
}
