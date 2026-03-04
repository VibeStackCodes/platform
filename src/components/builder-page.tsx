'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChatColumn, type ChatColumnHandle } from '@/components/chat-column'
import { RightPanel, type PanelContent } from '@/components/right-panel'
import { useResizablePanel } from '@/hooks/use-resizable-panel'
import { apiFetch } from '@/lib/utils'
import type { ElementContext } from '@/lib/types'

interface BuilderPageProps {
  projectId: string
  projectName?: string
  initialPrompt?: string
  initialSandboxId?: string
  initialDeployUrl?: string
  initialGenerationState?: {
    workflowRunId?: string | null
    pendingPlan?: {
      projectName: string
      features: Array<{ name: string; description: string }>
    } | null
  } | null
}

// Refresh signed URLs 10 min before 1h expiry
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000

export function BuilderPage({
  projectId,
  projectName,
  initialPrompt,
  initialSandboxId,
  initialDeployUrl,
  initialGenerationState,
}: BuilderPageProps) {
  const [panelContent, setPanelContent] = useState<PanelContent>(null)
  const [_sandboxId, setSandboxId] = useState(initialSandboxId)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [codeServerUrl, setCodeServerUrl] = useState<string>()
  const [expiresAt, setExpiresAt] = useState<string>()
  const [sandboxRecreating, setSandboxRecreating] = useState(false)
  const [selectedElement, setSelectedElement] = useState<ElementContext | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const chatHandleRef = useRef<ChatColumnHandle | null>(null)
  const panel = useResizablePanel()

  // Fetch sandbox URLs with automatic polling until available
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
        recreating?: boolean
      } | null>
    },
    refetchInterval: previewUrl ? false : sandboxRecreating ? 3000 : 2000,
    enabled: !previewUrl && !!projectId,
  })

  // Update local state when query data arrives + auto-open preview panel
  useEffect(() => {
    if (sandboxUrls?.recreating) {
      setSandboxRecreating(true)
      // Auto-open preview panel so user sees the "recreating" status
      if (!panelContent) {
        setPanelContent({ type: 'preview', previewUrl: '' })
        panel.open()
      }
    }
    if (sandboxUrls?.previewUrl) {
      setSandboxRecreating(false)
      setSandboxId(sandboxUrls.sandboxId)
      setPreviewUrl(sandboxUrls.previewUrl)
      setCodeServerUrl(sandboxUrls.codeServerUrl)
      setExpiresAt(sandboxUrls.expiresAt)
      // Auto-open preview if panel isn't already showing something
      if (!panelContent) {
        setPanelContent({ type: 'preview', previewUrl: '' })
        panel.open()
      }
    }
  }, [sandboxUrls, panelContent, panel])

  // Fetch sandbox URLs imperatively (for refresh and post-generation)
  const fetchSandboxUrls = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/sandbox-urls`)
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

  // Schedule URL refresh before expiry
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

  // Handle sandbox_ready SSE event
  const handleSandboxReady = useCallback(
    (newSandboxId: string) => {
      setSandboxId(newSandboxId)
      setPreviewUrl(undefined)
      setCodeServerUrl(undefined)
      setExpiresAt(undefined)
      apiFetch(`/api/projects/${projectId}/sandbox-urls`)
        .then(async (res) => {
          if (!res.ok) return
          const data = await res.json()
          if (data?.previewUrl) {
            setPreviewUrl(data.previewUrl)
            setCodeServerUrl(data.codeServerUrl)
            setExpiresAt(data.expiresAt)
          }
        })
        .catch(() => {
          // URL fetch will be retried by the polling query
        })
    },
    [projectId],
  )

  const handlePanelOpen = useCallback(
    (content: PanelContent) => {
      setPanelContent(content)
      panel.open()
    },
    [panel],
  )

  const [deployState, setDeployState] = useState<'idle' | 'deploying' | 'deployed' | 'error'>(
    initialDeployUrl ? 'deployed' : 'idle',
  )
  const [deployUrl, setDeployUrl] = useState<string | undefined>(initialDeployUrl)

  const handleDeploy = useCallback(async () => {
    setDeployState('deploying')
    chatHandleRef.current?.addSystemMessage('Deploying your app to production...')
    try {
      const res = await apiFetch('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) {
        setDeployState('error')
        chatHandleRef.current?.addSystemMessage('Deployment failed. Please try again.')
        return
      }
      const data = await res.json()
      setDeployUrl(data.deployUrl)
      setDeployState('deployed')
      chatHandleRef.current?.addSystemMessage(`Your app has been deployed! 🚀\n\n${data.deployUrl}`)
    } catch {
      setDeployState('error')
      chatHandleRef.current?.addSystemMessage('Deployment failed. Please try again.')
    }
  }, [projectId])

  return (
    <div ref={panel.containerRef} className="flex h-screen overflow-hidden">
      <ChatColumn
        projectId={projectId}
        initialPrompt={initialPrompt}
        initialGenerationState={initialGenerationState}
        onSandboxReady={handleSandboxReady}
        onPanelOpen={handlePanelOpen}
        onGenerationComplete={fetchSandboxUrls}
        selectedElement={selectedElement}
        onEditComplete={() => setSelectedElement(null)}
        onReady={(handle) => {
          chatHandleRef.current = handle
        }}
      />
      <RightPanel
        isOpen={panel.isOpen}
        width={panel.width}
        isDragging={panel.isDragging}
        content={panelContent}
        previewUrl={previewUrl}
        codeServerUrl={codeServerUrl}
        projectName={projectName}
        sandboxRecreating={sandboxRecreating}
        deployState={deployState}
        deployUrl={deployUrl}
        onDragStart={panel.handleDragStart}
        onClose={panel.close}
        onDeploy={handleDeploy}
      />
    </div>
  )
}
