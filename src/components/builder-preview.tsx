'use client'

import { Rocket } from 'lucide-react'
import { useCallback } from 'react'
import {
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
} from '@/components/ai-elements/sandbox'
import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/utils'

interface BuilderPreviewProps {
  projectId: string
  previewUrl?: string
  codeServerUrl?: string
}

export function BuilderPreview({ projectId, previewUrl, codeServerUrl }: BuilderPreviewProps) {
  const handleDeploy = useCallback(async () => {
    try {
      const response = await apiFetch('/api/projects/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Deployment failed')
      await response.json()
    } catch (error) {
      console.error('Deployment error:', error)
    }
  }, [projectId])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Preview</span>
          {previewUrl ? (
            <Badge variant="secondary" className="gap-1.5 rounded-full text-xs">
              <span className="size-2 rounded-full bg-green-500" />
              Ready
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5 rounded-full text-xs">
              <span className="size-2 animate-pulse rounded-full bg-yellow-500" />
              Building
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={handleDeploy}>
          <Rocket className="mr-2 size-4" />
          Deploy
        </Button>
      </div>

      {/* Tabs */}
      <SandboxTabs defaultValue="preview" className="flex flex-1 flex-col gap-0">
        <SandboxTabsBar>
          <SandboxTabsList>
            <SandboxTabsTrigger value="preview">Preview</SandboxTabsTrigger>
            <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
          </SandboxTabsList>
        </SandboxTabsBar>

        <SandboxTabContent value="preview" className="flex-1">
          {previewUrl ? (
            <WebPreview key={previewUrl} defaultUrl={previewUrl} className="h-full">
              <WebPreviewBody src={previewUrl} className="h-full" />
            </WebPreview>
          ) : (
            <div className="h-full" />
          )}
        </SandboxTabContent>

        {/* forceMount keeps VS Code server alive across tab switches */}
        <SandboxTabContent
          value="code"
          forceMount
          className="flex-1 data-[state=inactive]:hidden"
        >
          {codeServerUrl ? (
            <iframe
              src={codeServerUrl}
              className="h-full w-full border-0"
              title="Code Editor"
              allow="clipboard-read; clipboard-write; cross-origin-isolated"
              // oxlint-disable-next-line eslint-plugin-react(iframe-missing-sandbox)
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          ) : (
            <div className="h-full" />
          )}
        </SandboxTabContent>
      </SandboxTabs>
    </div>
  )
}
