'use client'

import { createClient } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BuilderChat } from '@/components/builder-chat'
import { BuilderPreview } from '@/components/builder-preview'
import type { ElementContext } from '@/lib/types'

interface ProjectLayoutProps {
  projectId: string
  initialPrompt?: string
  initialMessages?: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    parts: Array<Record<string, unknown>>
  }>
  initialSandboxId?: string
  initialSupabaseUrl?: string
  initialSupabaseProjectId?: string
}

/**
 * Custom hook to subscribe to realtime project updates from Supabase.
 * Only subscribes when enabled to avoid unnecessary WebSocket connections.
 */
function useProjectRealtime(projectId: string, enabled: boolean) {
  const [realtimeData, setRealtimeData] = useState<{
    supabaseUrl?: string
    supabaseProjectId?: string
  }>({})

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    )

    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const updates: { supabaseUrl?: string; supabaseProjectId?: string } = {}
          if (row.supabase_url) updates.supabaseUrl = row.supabase_url as string
          if (row.supabase_project_id) updates.supabaseProjectId = row.supabase_project_id as string
          setRealtimeData((prev) => ({ ...prev, ...updates }))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, enabled])

  return realtimeData
}

// TODO: Phase 2 — replace polling with *.preview.vibestack.app Cloudflare proxy (no expiry)
// See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000 // refresh 10 min before expiry

export function ProjectLayout({
  projectId,
  initialPrompt,
  initialMessages,
  initialSandboxId,
  initialSupabaseUrl,
  initialSupabaseProjectId,
}: ProjectLayoutProps) {
  const [sandboxId, setSandboxId] = useState(initialSandboxId)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [codeServerUrl, setCodeServerUrl] = useState<string | undefined>()
  const [supabaseUrl, setSupabaseUrl] = useState(initialSupabaseUrl)
  const [supabaseProjectId, setSupabaseProjectId] = useState(initialSupabaseProjectId)
  const [expiresAt, setExpiresAt] = useState<string | undefined>()
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [selectedElement, setSelectedElement] = useState<ElementContext | null>(null)

  // Fetch sandbox URLs using TanStack Query with automatic polling
  const { data: sandboxUrls } = useQuery({
    queryKey: ['sandbox-urls', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/sandbox-urls`)
      if (!res.ok) return null
      return res.json() as Promise<{
        sandboxId: string
        previewUrl: string
        codeServerUrl: string
        expiresAt: string
      } | null>
    },
    refetchInterval: previewUrl ? false : 2000,
    enabled: !previewUrl && !!projectId,
  })

  // Update local state when query data changes
  useEffect(() => {
    if (sandboxUrls?.previewUrl) {
      setSandboxId(sandboxUrls.sandboxId)
      setPreviewUrl(sandboxUrls.previewUrl)
      setCodeServerUrl(sandboxUrls.codeServerUrl)
      setExpiresAt(sandboxUrls.expiresAt)
    }
  }, [sandboxUrls])

  // Fetch sandbox URLs imperatively when generation completes
  const fetchSandboxUrls = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sandbox-urls`)
      if (!res.ok) return false
      const data = await res.json()
      if (!data.previewUrl) return false

      setSandboxId(data.sandboxId)
      setPreviewUrl(data.previewUrl)
      setCodeServerUrl(data.codeServerUrl)
      setExpiresAt(data.expiresAt)

      return true
    } catch {
      return false
    }
  }, [projectId])

  // Schedule refresh before expiry
  useEffect(() => {
    if (!expiresAt) return

    const expiresAtMs = new Date(expiresAt).getTime()
    const refreshIn = Math.max(expiresAtMs - Date.now() - REFRESH_BEFORE_EXPIRY_MS, 60_000)

    clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      fetchSandboxUrls()
    }, refreshIn)

    return () => {
      clearTimeout(refreshTimerRef.current)
    }
  }, [expiresAt, fetchSandboxUrls])

  // Supabase realtime for non-sandbox fields (supabase project, etc.)
  // Only subscribe when we still need the supabase project ID — avoid connecting
  // a WebSocket that immediately gets torn down (causes console WS error noise).
  const needsRealtimeSub = !supabaseProjectId
  const realtimeData = useProjectRealtime(projectId, needsRealtimeSub)

  // Update local state from realtime subscription
  useEffect(() => {
    if (realtimeData.supabaseUrl) setSupabaseUrl(realtimeData.supabaseUrl)
    if (realtimeData.supabaseProjectId) setSupabaseProjectId(realtimeData.supabaseProjectId)
  }, [realtimeData])

  return (
    <div className="flex h-screen">
      <div className="w-2/5 border-r">
        <BuilderChat
          projectId={projectId}
          initialPrompt={initialPrompt}
          initialMessages={initialMessages}
          onGenerationComplete={fetchSandboxUrls}
          selectedElement={selectedElement}
          onEditComplete={() => setSelectedElement(null)}
        />
      </div>
      <div className="w-3/5">
        <BuilderPreview
          projectId={projectId}
          sandboxId={sandboxId}
          previewUrl={previewUrl}
          codeServerUrl={codeServerUrl}
          supabaseUrl={supabaseUrl}
          supabaseProjectId={supabaseProjectId}
          onElementSelected={setSelectedElement}
        />
      </div>
    </div>
  )
}
