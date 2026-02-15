'use client'

import { Rocket } from 'lucide-react'
import { useState } from 'react'
import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview'
import { DatabaseManager } from '@/components/supabase-manager/database'
import { Button } from '@/components/ui/button'

interface BuilderPreviewProps {
  projectId: string
  sandboxId?: string
  previewUrl?: string
  codeServerUrl?: string
  supabaseUrl?: string
  supabaseProjectId?: string
}

export function BuilderPreview({
  projectId,
  previewUrl,
  codeServerUrl,
  supabaseProjectId,
}: BuilderPreviewProps) {
  const [activeTab, setActiveTab] = useState('preview')
  // Track which tabs have been visited — lazy mount, then keep mounted
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['preview']))

  const switchTab = (tab: string) => {
    setActiveTab(tab)
    setMountedTabs((prev) => {
      if (prev.has(tab)) return prev
      return new Set(prev).add(tab)
    })
  }

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
      {/* Header with Deploy button */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium">Preview</h2>
        <Button size="sm" onClick={handleDeploy}>
          <Rocket className="mr-2 size-4" />
          Deploy
        </Button>
      </div>

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
              <WebPreviewBody src={previewUrl} className="h-full" />
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
