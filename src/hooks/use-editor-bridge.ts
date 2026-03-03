import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
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
  const isConnectedRef = useRef(false)

  // Keep ref in sync with state (ref for effect guards, state for re-renders)
  isConnectedRef.current = isConnected

  // Capture callbacks in refs so reconnect effect doesn't re-run on every render
  const onTextEditCommitRef = useRef(onTextEditCommit)
  const onElementClickedRef = useRef(onElementClicked)
  onTextEditCommitRef.current = onTextEditCommit
  onElementClickedRef.current = onElementClicked

  const startConnection = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return

    // Tear down any previous connection
    if (connectionRef.current) {
      connectionRef.current.destroy()
      connectionRef.current = null
    }

    setChild(null)
    setIsConnected(false)
    setError(null)

    const messenger = new WindowMessenger({
      remoteWindow: iframe.contentWindow,
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
      timeout: 30000,
    })

    connectionRef.current = connection

    connection.promise
      .then((childMethods) => {
        setChild(childMethods as unknown as PreloadChildMethods)
        setIsConnected(true)
        setError(null)
      })
      .catch((err: unknown) => {
        connectionRef.current = null
        setError(err instanceof Error ? err.message : 'Failed to connect to iframe')
        setIsConnected(false)
      })
  }, [iframeRef])

  // Listen for iframe load events to establish penpal connection.
  // The load event guarantees the preload script has executed and is
  // ready for the handshake. Uses refs for guards so this effect only
  // re-runs when the iframe element itself changes (via key={previewUrl}).
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      const currentSrc = iframe.src
      if (!currentSrc || currentSrc === 'about:blank') return
      // Already connected to this exact URL — skip
      if (isConnectedRef.current && connectionRef.current) return
      startConnection()
    }

    iframe.addEventListener('load', handleLoad)

    // If the iframe is already loaded (e.g., fast load beat our effect), connect now
    if (iframe.contentDocument?.readyState === 'complete' && iframe.src && iframe.src !== 'about:blank') {
      if (!isConnectedRef.current || !connectionRef.current) {
        startConnection()
      }
    }

    return () => {
      iframe.removeEventListener('load', handleLoad)
      if (connectionRef.current) {
        connectionRef.current.destroy()
        connectionRef.current = null
      }
      setChild(null)
      setIsConnected(false)
    }
    // Only iframeRef — startConnection is stable (deps: [iframeRef]).
    // Do NOT add isConnected here — that's the destroy-on-success bug.
  }, [iframeRef, startConnection]) // eslint-disable-line react-hooks/exhaustive-deps

  // Retry connection when user toggles editing on but bridge is dead
  useEffect(() => {
    if (editMode && !isConnectedRef.current && !connectionRef.current) {
      const iframe = iframeRef.current
      if (iframe?.src && iframe.src !== 'about:blank') {
        startConnection()
      }
    }
  }, [editMode, iframeRef, startConnection])

  // Sync edit mode to iframe
  useEffect(() => {
    if (child && isConnected) {
      try {
        child.setEditMode(editMode)
      } catch {
        // Connection was destroyed between the check and the call — ignore
      }
    }
  }, [child, isConnected, editMode])

  return { child, isConnected, error }
}
