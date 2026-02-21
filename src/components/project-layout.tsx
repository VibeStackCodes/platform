'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/utils'
import { BuilderChat } from '@/components/builder-chat'
import { BuilderPreview } from '@/components/builder-preview'

interface ProjectLayoutProps {
  projectId: string
  initialPrompt?: string
  initialMessages?: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    parts: Array<Record<string, unknown>>
  }>
}

// TODO: Phase 2 — replace polling with *.preview.vibestack.app Cloudflare proxy (no expiry)
// See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000 // refresh 10 min before expiry

export function ProjectLayout({
  projectId,
  initialPrompt,
  initialMessages,
}: ProjectLayoutProps) {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [codeServerUrl, setCodeServerUrl] = useState<string | undefined>()
  const [expiresAt, setExpiresAt] = useState<string | undefined>()
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Fetch sandbox URLs using TanStack Query with automatic polling
  const { data: sandboxUrls } = useQuery({
    queryKey: ['sandbox-urls', projectId],
    queryFn: async () => {
      const res = await apiFetch(`/api/projects/${projectId}/sandbox-urls`)
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
      setPreviewUrl(sandboxUrls.previewUrl)
      setCodeServerUrl(sandboxUrls.codeServerUrl)
      setExpiresAt(sandboxUrls.expiresAt)
    }
  }, [sandboxUrls])

  // Fetch sandbox URLs imperatively when generation completes
  const fetchSandboxUrls = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/sandbox-urls`)
      if (!res.ok) return false
      const data = await res.json()
      if (!data.previewUrl) return false

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

  return (
    <div className="flex h-screen">
      <div className="w-2/5 border-r">
        <BuilderChat
          projectId={projectId}
          initialPrompt={initialPrompt}
          initialMessages={initialMessages}
          onGenerationComplete={fetchSandboxUrls}
        />
      </div>
      <div className="w-3/5">
        <BuilderPreview
          projectId={projectId}
          previewUrl={previewUrl}
          codeServerUrl={codeServerUrl}
        />
      </div>
    </div>
  )
}
