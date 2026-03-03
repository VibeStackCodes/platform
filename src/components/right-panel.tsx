import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import {
  Check,
  Code,
  Code2,
  ExternalLink,
  Eye,
  FileText,
  GitCompareArrows,
  Loader2,
  Pencil,
  Rocket,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DiffViewer } from '@/components/ai-elements/diff-viewer'
import { SaveIndicator } from '@/components/save-indicator'
import { useDebouncedSave } from '@/hooks/use-debounced-save'
import { useEditorBridge } from '@/hooks/use-editor-bridge'
import { useEditorStore } from '@/lib/editor-store'
import { GestureScreen } from '@/components/editor/gesture-screen'
import { EditorOverlay } from '@/components/editor/editor-overlay'

export type PanelContent =
  | { type: 'preview'; previewUrl: string }
  | { type: 'code'; filename: string; code: string; language?: string }
  | { type: 'diff'; filename: string; oldContent?: string; newContent: string }
  | { type: 'artifact'; title: string; content: string }
  | null

type DeployState = 'idle' | 'deploying' | 'deployed' | 'error'

interface RightPanelProps {
  isOpen: boolean
  width: number // percentage
  isDragging: boolean
  content: PanelContent
  previewUrl?: string
  codeServerUrl?: string
  projectName?: string
  sandboxRecreating?: boolean
  deployState?: DeployState
  deployUrl?: string
  onDragStart: (e: React.MouseEvent) => void
  onClose: () => void
  onSave?: (content: string) => void
  onDeploy?: () => void
}

// ── Helpers for non-preview content types ────────────────────────────

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
    default:
      return null
  }
}

function isEditable(content: PanelContent): boolean {
  return content?.type === 'artifact' || content?.type === 'code'
}

// ── Editable body components ─────────────────────────────────────────

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

// ── Preview with tabs (eye/code toggle) ──────────────────────────────

function PreviewWithTabs({
  previewUrl,
  codeServerUrl,
  projectName,
  sandboxRecreating,
  deployState = 'idle',
  deployUrl,
  onDeploy,
  onClose,
}: {
  previewUrl?: string
  codeServerUrl?: string
  projectName?: string
  sandboxRecreating?: boolean
  deployState?: DeployState
  deployUrl?: string
  onDeploy?: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview')
  const previewIframeRef = useRef<HTMLIFrameElement>(null)
  const editorMode = useEditorStore((s) => s.mode)
  const toggleEditMode = useEditorStore((s) => s.toggleEditMode)

  const { child, isConnected } = useEditorBridge({
    iframeRef: previewIframeRef,
    editMode: editorMode !== 'off',
  })

  return (
    <>
      {/* Header with tab toggle */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={cn(
                'rounded-md px-2 py-1 transition-colors',
                activeTab === 'preview'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Preview"
            >
              <Eye size={14} />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={cn(
                'rounded-md px-2 py-1 transition-colors',
                activeTab === 'code'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                !codeServerUrl && 'pointer-events-none opacity-40',
              )}
              aria-label="Code"
              disabled={!codeServerUrl}
            >
              <Code2 size={14} />
            </button>
          </div>
          {/* Project name */}
          {projectName && <span className="text-sm font-medium">{projectName}</span>}
          <span className="text-xs text-muted-foreground">React</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit mode toggle */}
          {activeTab === 'preview' && previewUrl && (
            <button
              type="button"
              onClick={toggleEditMode}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                editorMode !== 'off'
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
              title={editorMode !== 'off' ? 'Exit edit mode' : 'Enter edit mode'}
            >
              <Pencil size={12} />
              {editorMode !== 'off' ? 'Editing' : 'Edit'}
            </button>
          )}
          {deployState === 'deployed' && deployUrl ? (
            <a
              href={deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
            >
              <Check size={12} />
              Live
              <ExternalLink size={10} />
            </a>
          ) : onDeploy ? (
            <button
              type="button"
              onClick={onDeploy}
              disabled={deployState === 'deploying'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                deployState === 'deploying'
                  ? 'bg-primary/70 text-primary-foreground cursor-wait'
                  : deployState === 'error'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {deployState === 'deploying' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Rocket size={12} />
              )}
              {deployState === 'deploying'
                ? 'Deploying...'
                : deployState === 'error'
                  ? 'Retry Deploy'
                  : 'Deploy'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md',
              'text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground',
            )}
            aria-label="Close panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content — both iframes stay mounted; CSS toggles visibility to avoid reload lag */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Preview layer */}
        <div className={cn('absolute inset-0', activeTab !== 'preview' && 'invisible')}>
          {previewUrl ? (
            <>
              <iframe
                ref={previewIframeRef}
                key={previewUrl}
                src={previewUrl}
                className="h-full w-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
              <GestureScreen
                iframeRef={previewIframeRef}
                child={child}
                isConnected={isConnected}
              />
              <EditorOverlay iframeRef={previewIframeRef} />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              {sandboxRecreating && <Loader2 className="h-5 w-5 animate-spin" />}
              {sandboxRecreating
                ? 'Recreating sandbox — your app will appear shortly...'
                : 'Waiting for preview...'}
            </div>
          )}
        </div>

        {/* Code layer */}
        <div className={cn('absolute inset-0', activeTab !== 'code' && 'invisible')}>
          {codeServerUrl ? (
            <iframe
              key={codeServerUrl}
              src={codeServerUrl}
              className="h-full w-full border-0"
              title="Code Editor"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Code editor not available
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Non-preview body renderer ────────────────────────────────────────

function NonPreviewBody({
  content,
  onInput,
}: {
  content: PanelContent
  onInput: (text: string) => void
}) {
  if (!content) return null

  switch (content.type) {
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
    default:
      return null
  }
}

// ── Main RightPanel ──────────────────────────────────────────────────

export function RightPanel({
  isOpen,
  width,
  isDragging,
  content,
  previewUrl,
  codeServerUrl,
  projectName,
  sandboxRecreating,
  deployState,
  deployUrl,
  onDragStart,
  onClose,
  onSave,
  onDeploy,
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

  const isPreviewMode = content?.type === 'preview'
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

      {isPreviewMode ? (
        /* Preview mode: tab toggle header + iframe body */
        <PreviewWithTabs
          previewUrl={content.previewUrl?.trim() || previewUrl}
          codeServerUrl={codeServerUrl}
          projectName={projectName}
          sandboxRecreating={sandboxRecreating}
          deployState={deployState}
          deployUrl={deployUrl}
          onDeploy={onDeploy}
          onClose={onClose}
        />
      ) : (
        <>
          {/* Non-preview header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {getContentTitle(content)}
              </span>
              {getContentBadge(content)}
            </div>

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

          {/* Non-preview body */}
          <div className="min-h-0 flex-1">
            <NonPreviewBody content={content} onInput={triggerSave} />
          </div>
        </>
      )}
    </div>
  )
}
