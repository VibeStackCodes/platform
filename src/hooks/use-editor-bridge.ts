import { useEffect, useRef, useState, type RefObject } from 'react'
import { connect, WindowMessenger, type Connection, type Methods } from 'penpal'

// Inline types to avoid import issues during initial creation
interface SerializedRect {
  x: number
  y: number
  width: number
  height: number
}

interface EditorElementInfo {
  oid: string
  odid: string
  tagName: string
  textContent: string
  rect: SerializedRect
  tailwindClasses: string[]
  computedStyles: Record<string, string>
  elementType: 'text' | 'image' | 'button' | 'container'
  isEditable: boolean
  imageSrc?: string
  parentOid?: string
}

// penpal Methods requires [index: string]: Methods | Function — use intersection to satisfy constraint
type PreloadChildMethods = {
  getElementAtPoint(x: number, y: number): EditorElementInfo | null
  getElementByOid(oid: string): EditorElementInfo | null
  getAllElements(): EditorElementInfo[]
  startTextEditing(oid: string): void
  stopTextEditing(): { oid: string; newText: string } | null
  applyStylePreview(odid: string, styles: Record<string, string>): void
  clearStylePreviews(): void
  clearStylePreview(odid: string): void
  getComputedStyles(oid: string): Record<string, string>
  getTailwindClasses(oid: string): string[]
  scrollToElement(oid: string): void
  getViewportScroll(): { x: number; y: number }
  setEditMode(enabled: boolean): void
  highlightElement(oid: string): void
  unhighlightElement(): void
} & Methods

type ParentMethods = {
  onTextEditCommit(oid: string, newText: string): void
  onElementClicked(info: EditorElementInfo): void
} & Methods

interface UseEditorBridgeOptions {
  iframeRef: RefObject<HTMLIFrameElement | null>
  editMode: boolean
  onTextEditCommit?: (oid: string, newText: string) => void
  onElementClicked?: (info: EditorElementInfo) => void
}

interface UseEditorBridgeReturn {
  child: PreloadChildMethods | null
  isConnected: boolean
  error: string | null
}

export function useEditorBridge({
  iframeRef,
  editMode,
  onTextEditCommit,
  onElementClicked,
}: UseEditorBridgeOptions): UseEditorBridgeReturn {
  const [child, setChild] = useState<PreloadChildMethods | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connectionRef = useRef<Connection<PreloadChildMethods> | null>(null)

  // Capture callbacks in refs so reconnect effect doesn't re-run on every render
  const onTextEditCommitRef = useRef(onTextEditCommit)
  const onElementClickedRef = useRef(onElementClicked)
  onTextEditCommitRef.current = onTextEditCommit
  onElementClickedRef.current = onElementClicked

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    // Tear down any previous connection
    if (connectionRef.current) {
      connectionRef.current.destroy()
      connectionRef.current = null
      setChild(null)
      setIsConnected(false)
    }

    const messenger = new WindowMessenger({
      remoteWindow: iframe.contentWindow as Window,
      allowedOrigins: ['*'],
    })

    const methods: ParentMethods = {
      onTextEditCommit(oid: string, newText: string) {
        onTextEditCommitRef.current?.(oid, newText)
      },
      onElementClicked(info: EditorElementInfo) {
        onElementClickedRef.current?.(info)
      },
    }

    const connection = connect<PreloadChildMethods>({
      messenger,
      methods,
      timeout: 15000,
    })

    connectionRef.current = connection

    connection.promise
      .then((childMethods) => {
        setChild(childMethods as unknown as PreloadChildMethods)
        setIsConnected(true)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to connect to iframe')
        setIsConnected(false)
      })

    return () => {
      connection.destroy()
      connectionRef.current = null
      setChild(null)
      setIsConnected(false)
    }
  }, [iframeRef.current?.src]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync edit mode to iframe
  useEffect(() => {
    if (child && isConnected) {
      child.setEditMode(editMode)
    }
  }, [child, isConnected, editMode])

  return { child, isConnected, error }
}
