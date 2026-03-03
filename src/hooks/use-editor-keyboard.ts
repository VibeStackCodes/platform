import { useEffect } from 'react'
import { useEditorStore } from '@/lib/editor-store'
import { apiFetch } from '@/lib/utils'

interface UseEditorKeyboardOptions {
  projectId: string
  sandboxId?: string
  enabled?: boolean
}

/**
 * Wires Ctrl+Z / Cmd+Z (undo) and Ctrl+Shift+Z / Cmd+Shift+Z (redo) to the
 * editor store. When the store returns a command the full file content is
 * written back to the sandbox via POST /api/editor/write so that Vite HMR
 * picks up the change automatically.
 *
 * The listener is only active when:
 *  - `enabled` is true (defaults to true)
 *  - `sandboxId` is provided
 *  - the editor store mode is not 'off'
 */
export function useEditorKeyboard({
  projectId,
  sandboxId,
  enabled = true,
}: UseEditorKeyboardOptions) {
  useEffect(() => {
    if (!enabled || !sandboxId) return

    const handler = async (e: KeyboardEvent) => {
      const isUndo = (e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey
      const isRedo = (e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey

      if (!isUndo && !isRedo) return

      const store = useEditorStore.getState()
      if (store.mode === 'off') return

      e.preventDefault()

      const cmd = isUndo ? store.undo() : store.redo()
      if (!cmd) return

      // undo → restore previousContent; redo → restore newContent
      const content = isUndo ? cmd.previousContent : cmd.newContent

      try {
        store.setPatchInFlight(true)
        await apiFetch('/api/editor/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sandboxId,
            projectId,
            file: cmd.file,
            content,
          }),
        })
      } finally {
        store.setPatchInFlight(false)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [projectId, sandboxId, enabled])
}
