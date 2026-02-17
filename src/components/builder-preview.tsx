'use client'

import { MousePointer, Pencil, Rocket, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview'
import { DatabaseManager } from '@/components/supabase-manager/database'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ElementContext } from '@/lib/types'

interface BuilderPreviewProps {
  projectId: string
  sandboxId?: string
  previewUrl?: string
  codeServerUrl?: string
  supabaseUrl?: string
  supabaseProjectId?: string
  onElementSelected?: (element: ElementContext | null) => void
}

export function BuilderPreview({
  projectId,
  previewUrl,
  codeServerUrl,
  supabaseProjectId,
  onElementSelected,
}: BuilderPreviewProps) {
  const [activeTab, setActiveTab] = useState('preview')
  // Track which tabs have been visited — lazy mount, then keep mounted
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['preview']))
  const [editMode, setEditMode] = useState(false)
  const [selectedElement, setSelectedElement] = useState<ElementContext | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const switchTab = (tab: string) => {
    setActiveTab(tab)
    setMountedTabs((prev) => {
      if (prev.has(tab)) return prev
      return new Set(prev).add(tab)
    })
  }

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev
      // Only send postMessage when we know the iframe origin (never use '*')
      if (previewUrl && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'VIBESTACK_EDIT_MODE', enabled: next },
          new URL(previewUrl).origin,
        )
      }
      if (!next) {
        setSelectedElement(null)
        onElementSelected?.(null)
      }
      return next
    })
  }, [onElementSelected])

  const dismissSelection = useCallback(() => {
    setSelectedElement(null)
    onElementSelected?.(null)
  }, [onElementSelected])

  // Listen for element selection messages from iframe (validate origin)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Only accept messages from our own origin or Daytona sandbox previews
      const isAllowedOrigin =
        event.origin === window.location.origin ||
        /^https:\/\/[a-z0-9-]+\.daytona\.io$/.test(event.origin)
      if (!isAllowedOrigin) return

      if (event.data?.type === 'VIBESTACK_ELEMENT_SELECTED') {
        const element = event.data.payload as ElementContext
        setSelectedElement(element)
        onElementSelected?.(element)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onElementSelected])

  const handleDeploy = async () => {
    try {
      const response = await fetch('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!response.ok) {
        throw new Error('Deployment failed')
      }

      const data = await response.json()
      console.log('Deployed:', data)
    } catch (error) {
      console.error('Deployment error:', error)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with Edit Mode toggle and Deploy button */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium">Preview</h2>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleEditMode}
            className={editMode ? 'ring-2 ring-indigo-500' : ''}
            title={editMode ? 'Exit edit mode' : 'Enter edit mode'}
          >
            {editMode ? <MousePointer className="size-4" /> : <Pencil className="size-4" />}
          </Button>
          <Button size="sm" onClick={handleDeploy}>
            <Rocket className="mr-2 size-4" />
            Deploy
          </Button>
        </div>
      </div>

      {/* Selected element badge */}
      {selectedElement && (
        <div className="border-b px-4 py-2">
          <Badge variant="secondary" className="inline-flex items-center gap-2">
            <span className="font-mono text-xs">
              {selectedElement.fileName.split('/').pop()}:{selectedElement.lineNumber}
            </span>
            {selectedElement.textContent && (
              <span className="max-w-xs truncate text-xs text-muted-foreground">
                {selectedElement.textContent}
              </span>
            )}
            <button
              type="button"
              onClick={dismissSelection}
              className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X className="size-3" />
            </button>
          </Badge>
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b px-4">
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          {(['preview', 'code', 'database'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow'
                  : 'hover:bg-background/50 hover:text-foreground'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Panels: lazy-mount on first visit, then keep mounted with CSS visibility */}
      <div className="relative flex-1">
        <div className={`absolute inset-0 ${activeTab === 'preview' ? '' : 'invisible'}`}>
          {previewUrl ? (
            <WebPreview key={previewUrl} defaultUrl={previewUrl} className="h-full">
              <WebPreviewBody ref={iframeRef} src={previewUrl} className="h-full" />
            </WebPreview>
          ) : (
            <div className="h-full" />
          )}
        </div>

        {mountedTabs.has('code') && (
          <div className={`absolute inset-0 ${activeTab === 'code' ? '' : 'invisible'}`}>
            {codeServerUrl ? (
              <iframe
                src={codeServerUrl}
                className="h-full w-full border-0"
                title="Code Editor"
                allow="clipboard-read; clipboard-write; cross-origin-isolated"
                // TODO: Phase 2 — Cloudflare proxy (*.preview.vibestack.app) will make this same-origin
                // See docs/plans/2026-02-14-sandbox-preview-architecture-design.md
                // oxlint-disable-next-line eslint-plugin-react(iframe-missing-sandbox)
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            ) : (
              <div className="h-full" />
            )}
          </div>
        )}

        {mountedTabs.has('database') && (
          <div className={`absolute inset-0 ${activeTab === 'database' ? '' : 'invisible'}`}>
            {supabaseProjectId ? (
              <DatabaseManager projectRef={supabaseProjectId} />
            ) : (
              <div className="h-full" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
