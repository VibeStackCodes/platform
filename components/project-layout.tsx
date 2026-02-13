"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BuilderChat } from "@/components/builder-chat";
import { BuilderPreview } from "@/components/builder-preview";

interface ProjectLayoutProps {
  projectId: string;
  initialPrompt?: string;
  initialMessages?: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<Record<string, unknown>> }>;
  initialSandboxId?: string;
  initialPreviewUrl?: string;
  initialCodeServerUrl?: string;
  initialSupabaseUrl?: string;
}

export function ProjectLayout({
  projectId,
  initialPrompt,
  initialMessages,
  initialSandboxId,
  initialPreviewUrl,
  initialCodeServerUrl,
  initialSupabaseUrl,
}: ProjectLayoutProps) {
  const [sandboxId, setSandboxId] = useState(initialSandboxId);
  const [previewUrl, setPreviewUrl] = useState(initialPreviewUrl);
  const [codeServerUrl, setCodeServerUrl] = useState(initialCodeServerUrl);
  const [supabaseUrl, setSupabaseUrl] = useState(initialSupabaseUrl);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.sandbox_id) setSandboxId(row.sandbox_id as string);
          if (row.preview_url) setPreviewUrl(row.preview_url as string);
          if (row.code_server_url) setCodeServerUrl(row.code_server_url as string);
          if (row.supabase_url) setSupabaseUrl(row.supabase_url as string);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  return (
    <div className="flex h-screen">
      <div className="w-2/5 border-r">
        <BuilderChat projectId={projectId} initialPrompt={initialPrompt} initialMessages={initialMessages} />
      </div>
      <div className="w-3/5">
        <BuilderPreview
          projectId={projectId}
          sandboxId={sandboxId}
          previewUrl={previewUrl}
          codeServerUrl={codeServerUrl}
          supabaseUrl={supabaseUrl}
        />
      </div>
    </div>
  );
}
