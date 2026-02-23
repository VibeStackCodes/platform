'use client'

import { AppWindowIcon, CodeIcon, Pencil, Rocket, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/utils'
import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ElementContext } from '@/lib/types'

interface BuilderPreviewProps {
  projectId: string
  sandboxId?: string
  previewUrl?: string
  codeServerUrl?: string
  onElementSelected?: (element: ElementContext | null) => void
}

export function BuilderPreview({
  projectId,
  previewUrl,
  codeServerUrl,
  onElementSelected,
}: BuilderPreviewProps) {
  const [selectedElement, setSelectedElement] = useState<ElementContext | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const dismissSelection = useCallback(() => {
    setSelectedElement(null)
    onElementSelected?.(null)
  }, [onElementSelected])

  // Listen for element selection messages from iframe (validate origin)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
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
      const response = await apiFetch('/api/projects/deploy', {
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
      {/* Selected element badge */}
      {selectedElement && (
        <div className="border-b px-3 py-2">
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

      <Tabs defaultValue="preview" className="flex flex-1 flex-col gap-0">
        <div className="flex items-center gap-2 border-b px-3">
          <TabsList variant="line">
            <TabsTrigger value="preview">
              <AppWindowIcon />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code">
              <CodeIcon />
              Code
            </TabsTrigger>
          </TabsList>
          <div className="ml-auto">
            <Button size="sm" onClick={handleDeploy}>
              <Rocket className="mr-1.5 size-3.5" />
              Deploy
            </Button>
          </div>
        </div>

        <TabsContent value="preview" className="relative flex-1 mt-0">
          {previewUrl ? (
            <WebPreview key={previewUrl} defaultUrl={previewUrl} className="h-full">
              <WebPreviewBody ref={iframeRef} src={previewUrl} className="h-full" />
            </WebPreview>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
              <div className="relative">
                <div className="size-16 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                  <Rocket className="size-8 text-muted-foreground/40" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground/60">No preview yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Describe your app in the chat to start building
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="code" className="relative flex-1 mt-0">
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
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="size-12 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <Pencil className="size-5 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground/60">Code editor will appear here</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
