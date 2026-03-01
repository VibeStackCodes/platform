import type { ReactNode } from 'react'
import { useRef } from 'react'
import { Code, Eye, FileText, GitCompareArrows, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DiffViewer } from '@/components/ai-elements/diff-viewer'
import { SaveIndicator } from '@/components/save-indicator'
import { useDebouncedSave } from '@/hooks/use-debounced-save'

export type PanelContent =
  | { type: 'preview'; previewUrl: string }
  | { type: 'code'; filename: string; code: string; language?: string }
  | { type: 'diff'; filename: string; oldContent?: string; newContent: string }
  | { type: 'artifact'; title: string; content: string }
  | null

interface RightPanelProps {
  isOpen: boolean
  width: number // percentage
  isDragging: boolean
  content: PanelContent
  previewUrl?: string
  codeServerUrl?: string
  onDragStart: (e: React.MouseEvent) => void
  onClose: () => void
  onSave?: (content: string) => void
}

function getContentTitle(content: PanelContent): string {
  if (!content) return ''
  switch (content.type) {
    case 'preview':
      return 'Preview'
    case 'code':
      return content.filename
    case 'diff':
      return content.filename
    case 'artifact':
      return content.title
  }
}

function getContentBadge(content: PanelContent): ReactNode {
  if (!content) return null
  switch (content.type) {
    case 'preview':
      return (
        <span className="flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
          <Eye className="h-3 w-3" />
          Preview
        </span>
      )
    case 'code':
      return (
        <span className="flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400">
          <Code className="h-3 w-3" />
          {content.language ?? 'Code'}
        </span>
      )
    case 'diff':
      return (
        <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-400">
          <GitCompareArrows className="h-3 w-3" />
          Diff
        </span>
      )
    case 'artifact':
      return (
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
          <FileText className="h-3 w-3" />
          Artifact
        </span>
      )
  }
}

function isEditable(content: PanelContent): boolean {
  return content?.type === 'artifact' || content?.type === 'code'
}

function EditableArtifactBody({
  content,
  onInput,
}: {
  content: string
  onInput: (text: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div className="h-full overflow-auto bg-muted/20 p-6">
      <div className="mx-auto max-w-2xl rounded-lg bg-background shadow-sm">
        <div className="h-1 rounded-t-lg bg-emerald-500" />
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={() => {
            if (ref.current) onInput(ref.current.textContent ?? '')
          }}
          className="min-h-[200px] p-8 text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap outline-none"
        >
          {content}
        </div>
      </div>
    </div>
  )
}

function EditableCodeBody({
  filename,
  code,
  onInput,
}: {
  filename: string
  code: string
  onInput: (text: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <Code className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">{filename}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={() => {
            if (ref.current) onInput(ref.current.textContent ?? '')
          }}
          className="h-full p-4 font-mono text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap outline-none"
        >
          {code}
        </div>
      </div>
    </div>
  )
}

function PanelBody({
  content,
  previewUrl,
  codeServerUrl: _codeServerUrl,
  onInput,
}: {
  content: PanelContent
  previewUrl?: string
  codeServerUrl?: string
  onInput: (text: string) => void
}) {
  if (!content) return null

  switch (content.type) {
    case 'preview': {
      const src = content.previewUrl || previewUrl
      if (!src) return null
      return (
        <iframe
          key={src}
          src={src}
          className="h-full w-full border-0"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )
    }
    case 'code':
      return <EditableCodeBody filename={content.filename} code={content.code} onInput={onInput} />
    case 'diff':
      return (
        <DiffViewer
          filename={content.filename}
          oldContent={content.oldContent}
          newContent={content.newContent}
          className="h-full"
        />
      )
    case 'artifact':
      return <EditableArtifactBody content={content.content} onInput={onInput} />
  }
}

export function RightPanel({
  isOpen,
  width,
  isDragging,
  content,
  previewUrl,
  codeServerUrl,
  onDragStart,
  onClose,
  onSave,
}: RightPanelProps) {
  const { status: saveStatus, trigger: triggerSave } = useDebouncedSave({ onSave })

  const panelStyle: React.CSSProperties = {
    width: isOpen ? `${width}%` : '0',
    minWidth: isOpen ? '340px' : '0',
    borderLeft: isOpen ? '1px solid var(--border)' : '0',
    opacity: isOpen ? 1 : 0,
    overflow: 'hidden',
    transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  }

  const title = getContentTitle(content)
  const badge = getContentBadge(content)
  const showCodeServerTab = content?.type === 'preview' && !!codeServerUrl
  const showSaveIndicator = isEditable(content)

  return (
    <div
      className="relative flex h-full flex-col bg-background"
      style={panelStyle}
      aria-hidden={!isOpen}
    >
      {/* Drag handle */}
      <div
        className={cn(
          'group absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize',
          'flex items-center justify-center',
        )}
        onMouseDown={onDragStart}
        aria-label="Resize panel"
        role="separator"
        aria-orientation="vertical"
      >
        <div
          className={cn(
            'h-full w-px bg-transparent transition-colors duration-150',
            'group-hover:bg-border',
            isDragging && 'bg-border',
          )}
        />
      </div>

      {/* Panel header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {badge}
        </div>

        {showCodeServerTab && codeServerUrl && (
          <a
            href={codeServerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
              'bg-muted text-muted-foreground transition-colors',
              'hover:bg-muted/80 hover:text-foreground',
            )}
          >
            <Code className="h-3 w-3" />
            Code
          </a>
        )}

        {showSaveIndicator && <SaveIndicator status={saveStatus} />}

        <button
          type="button"
          onClick={onClose}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            'text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Panel body */}
      <div className="min-h-0 flex-1">
        <PanelBody
          content={content}
          previewUrl={previewUrl}
          codeServerUrl={codeServerUrl}
          onInput={triggerSave}
        />
      </div>
    </div>
  )
}
