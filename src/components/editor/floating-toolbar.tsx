import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Type, Code, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FloatingToolbarProps {
  rect: { left: number; top: number; width: number; height: number }
  elementType: 'text' | 'image' | 'button' | 'container'
  oid: string
  onAskAI?: (prompt: string) => void
  onTextEdit?: () => void
  onCodeView?: () => void
  onDelete?: () => void
}

const TOOLBAR_HEIGHT = 36

export function FloatingToolbar({
  rect,
  elementType,
  oid: _oid,
  onAskAI,
  onTextEdit,
  onCodeView,
  onDelete,
}: FloatingToolbarProps) {
  const [inputValue, setInputValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset delete-confirm state after 3s of inactivity
  useEffect(() => {
    if (deleteConfirm) {
      deleteTimerRef.current = setTimeout(() => setDeleteConfirm(false), 3000)
    }
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    }
  }, [deleteConfirm])

  // Reset delete confirm and input when the selected element changes position
  useEffect(() => {
    setDeleteConfirm(false)
    setInputValue('')
  }, [rect.left, rect.top])

  const wouldClipTop = rect.top - TOOLBAR_HEIGHT - 8 < 0

  const toolbarStyle: React.CSSProperties = wouldClipTop
    ? {
        position: 'absolute',
        left: rect.left + rect.width / 2,
        top: rect.top + rect.height + 8,
        transform: 'translate(-50%, 0)',
      }
    : {
        position: 'absolute',
        left: rect.left + rect.width / 2,
        top: rect.top - 8,
        transform: 'translate(-50%, -100%)',
      }

  function handleSend() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAskAI?.(trimmed)
    setInputValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    setDeleteConfirm(false)
    onDelete?.()
  }

  const isTextEditable = elementType === 'text' || elementType === 'button'

  return (
    <div
      className="pointer-events-auto z-30 flex h-9 min-w-[300px] items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-1.5 shadow-xl"
      style={toolbarStyle}
    >
      {/* AI prompt input */}
      <div className="flex flex-1 items-center gap-1 rounded-md bg-zinc-800 px-2 py-1">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask VibeStack..."
          className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder-zinc-400 outline-none"
          aria-label="Ask VibeStack AI about this element"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
            inputValue.trim()
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'cursor-not-allowed bg-zinc-700 text-zinc-500',
          )}
          aria-label="Send prompt"
          title="Send (Enter)"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Divider */}
      <div className="mx-0.5 h-5 w-px bg-zinc-700" aria-hidden="true" />

      {/* Text edit button */}
      <button
        type="button"
        onClick={onTextEdit}
        disabled={!isTextEditable}
        className={cn(
          'rounded p-1 transition-colors',
          isTextEditable
            ? 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            : 'cursor-not-allowed text-zinc-600',
        )}
        aria-label="Edit text inline"
        title={isTextEditable ? 'Edit text' : 'Text editing only available for text elements'}
      >
        <Type className="h-4 w-4" />
      </button>

      {/* Code view button */}
      <button
        type="button"
        onClick={onCodeView}
        className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        aria-label="View element source code"
        title="View source"
      >
        <Code className="h-4 w-4" />
      </button>

      {/* Delete button — two-click confirm pattern */}
      <button
        type="button"
        onClick={handleDelete}
        className={cn(
          'rounded p-1 transition-colors',
          deleteConfirm
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-red-400',
        )}
        aria-label={deleteConfirm ? 'Confirm delete' : 'Delete element'}
        title={deleteConfirm ? 'Click again to confirm delete' : 'Delete element'}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
