"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BuilderChat } from "@/components/builder-chat";
import { BuilderPreview } from "@/components/builder-preview";

interface ProjectLayoutProps {
  projectId: string;
  initialPrompt?: string;
  initialMessages?: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<Record<string, unknown>> }>;
  initialSandboxId?: string;
  initialSupabaseUrl?: string;
  initialSupabaseProjectId?: string;
}

// TODO: Phase 2 — replace polling with *.preview.vibestack.app Cloudflare proxy (no expiry)
// See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000; // refresh 10 min before expiry

export function ProjectLayout({
  projectId,
  initialPrompt,
  initialMessages,
  initialSandboxId,
  initialSupabaseUrl,
  initialSupabaseProjectId,
}: ProjectLayoutProps) {
  const [sandboxId, setSandboxId] = useState(initialSandboxId);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [codeServerUrl, setCodeServerUrl] = useState<string | undefined>();
  const [supabaseUrl, setSupabaseUrl] = useState(initialSupabaseUrl);
  const [supabaseProjectId, setSupabaseProjectId] = useState(initialSupabaseProjectId);
  const [expiresAt, setExpiresAt] = useState<string | undefined>();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetch signed sandbox URLs from the API
  const fetchSandboxUrls = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sandbox-urls`);
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.previewUrl) return false;

      setSandboxId(data.sandboxId);
      setPreviewUrl(data.previewUrl);
      setCodeServerUrl(data.codeServerUrl);
      setExpiresAt(data.expiresAt);

      return true;
    } catch {
      return false;
    }
  }, [projectId]);

  // Poll for sandbox URLs on mount (sandbox may still be provisioning)
  useEffect(() => {
    if (previewUrl) return; // Already have it

    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 30 && !cancelled; i++) {
        const found = await fetchSandboxUrls();
        if (found || cancelled) return;
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(refreshTimerRef.current);
    };
  }, [projectId, previewUrl, fetchSandboxUrls]);

  // Schedule refresh before expiry
  useEffect(() => {
    if (!expiresAt) return;

    const expiresAtMs = new Date(expiresAt).getTime();
    const refreshIn = Math.max(expiresAtMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS, 60_000);

    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      fetchSandboxUrls();
    }, refreshIn);

    return () => {
      clearTimeout(refreshTimerRef.current);
    };
  }, [expiresAt, fetchSandboxUrls]);

  // Supabase realtime for non-sandbox fields (supabase project, etc.)
  // Only subscribe when we still need the supabase project ID — avoid connecting
  // a WebSocket that immediately gets torn down (causes console WS error noise).
  const needsRealtimeSub = !supabaseProjectId;
  useEffect(() => {
    if (!needsRealtimeSub) return;

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
          if (row.supabase_url) setSupabaseUrl(row.supabase_url as string);
          if (row.supabase_project_id) setSupabaseProjectId(row.supabase_project_id as string);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, needsRealtimeSub]);

  return (
    <div className="flex h-screen">
      <div className="w-2/5 border-r">
        <BuilderChat projectId={projectId} initialPrompt={initialPrompt} initialMessages={initialMessages} onGenerationComplete={fetchSandboxUrls} />
      </div>
      <div className="w-3/5">
        <BuilderPreview
          projectId={projectId}
          sandboxId={sandboxId}
          previewUrl={previewUrl}
          codeServerUrl={codeServerUrl}
          supabaseUrl={supabaseUrl}
          supabaseProjectId={supabaseProjectId}
        />
      </div>
    </div>
  );
}
