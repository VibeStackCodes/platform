import { useCallback, useRef, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/lib/editor-store'

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

interface PreloadChildMethods {
  getElementAtPoint(x: number, y: number): EditorElementInfo | null
  startTextEditing(oid: string): void
  getViewportScroll(): { x: number; y: number }
}

interface GestureScreenProps {
  iframeRef: RefObject<HTMLIFrameElement | null>
  child: PreloadChildMethods | null
  isConnected: boolean
  className?: string
}

export function GestureScreen({ iframeRef, child, isConnected, className }: GestureScreenProps) {
  const mode = useEditorStore((s) => s.mode)
  const setHoveredElement = useEditorStore((s) => s.setHoveredElement)
  const setSelectedElement = useEditorStore((s) => s.setSelectedElement)
  const startTextEditing = useEditorStore((s) => s.startTextEditing)
  const lastHoverRef = useRef<string | null>(null)
  const isActive = mode !== 'off' && isConnected && child !== null

  const translateCoords = useCallback(
    async (clientX: number, clientY: number) => {
      const iframe = iframeRef.current
      if (!iframe || !child) return null
      const iframeRect = iframe.getBoundingClientRect()
      const scroll = await child.getViewportScroll()
      const x = clientX - iframeRect.left + scroll.x
      const y = clientY - iframeRect.top + scroll.y
      return { x, y }
    },
    [iframeRef, child],
  )

  const handleMouseMove = useCallback(
    async (e: React.MouseEvent) => {
      if (!isActive || !child) return
      const coords = await translateCoords(e.clientX, e.clientY)
      if (!coords) return
      const el = await child.getElementAtPoint(coords.x, coords.y)
      if (el?.oid !== lastHoverRef.current) {
        lastHoverRef.current = el?.oid ?? null
        setHoveredElement(el)
      }
    },
    [isActive, child, translateCoords, setHoveredElement],
  )

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!isActive || !child) return
      e.preventDefault()
      e.stopPropagation()
      const coords = await translateCoords(e.clientX, e.clientY)
      if (!coords) return
      const el = await child.getElementAtPoint(coords.x, coords.y)
      setSelectedElement(el)
    },
    [isActive, child, translateCoords, setSelectedElement],
  )

  const handleDoubleClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!isActive || !child) return
      e.preventDefault()
      const selectedElement = useEditorStore.getState().selectedElement
      if (selectedElement?.isEditable) {
        await child.startTextEditing(selectedElement.oid)
        startTextEditing()
      }
    },
    [isActive, child, startTextEditing],
  )

  const handleMouseLeave = useCallback(() => {
    lastHoverRef.current = null
    setHoveredElement(null)
  }, [setHoveredElement])

  if (!isActive) return null

  return (
    <div
      className={cn(
        'absolute inset-0 z-10',
        isActive ? 'cursor-crosshair' : 'pointer-events-none',
        className,
      )}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseLeave={handleMouseLeave}
    />
  )
}
