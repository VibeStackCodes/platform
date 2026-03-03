import { useMemo, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/lib/editor-store'
import { ChevronUp, ChevronDown, MousePointer, Type } from 'lucide-react'

interface EditorOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>
  className?: string
}

function useOverlayRect(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  elementRect: { x: number; y: number; width: number; height: number } | null,
) {
  return useMemo(() => {
    if (!elementRect || !iframeRef.current) return null
    const iframeRect = iframeRef.current.getBoundingClientRect()
    return {
      left: iframeRect.left + elementRect.x,
      top: iframeRect.top + elementRect.y,
      width: elementRect.width,
      height: elementRect.height,
    }
  }, [elementRect, iframeRef])
}

export function EditorOverlay({ iframeRef, className }: EditorOverlayProps) {
  const mode = useEditorStore((s) => s.mode)
  const hoveredElement = useEditorStore((s) => s.hoveredElement)
  const selectedElement = useEditorStore((s) => s.selectedElement)

  const hoverRect = useOverlayRect(iframeRef, hoveredElement?.rect ?? null)
  const selectRect = useOverlayRect(iframeRef, selectedElement?.rect ?? null)

  if (mode === 'off') return null

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-20', className)}>
      {/* Hover outline */}
      {hoverRect && (!selectedElement || hoveredElement?.oid !== selectedElement?.oid) && (
        <div
          className="absolute border-2 border-dashed border-blue-400 transition-all duration-75"
          style={{
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        >
          {/* Tag label */}
          <span className="absolute -top-6 left-0 rounded bg-blue-400 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {hoveredElement?.tagName}
          </span>
        </div>
      )}

      {/* Select outline */}
      {selectRect && selectedElement && (
        <div
          className="absolute border-2 border-blue-500"
          style={{
            left: selectRect.left,
            top: selectRect.top,
            width: selectRect.width,
            height: selectRect.height,
          }}
        >
          {/* Tag label */}
          <span className="absolute -top-6 left-0 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {selectedElement.tagName}
            {selectedElement.oid && (
              <span className="ml-1 opacity-60">#{selectedElement.oid.slice(0, 4)}</span>
            )}
          </span>

          {/* Element type indicator */}
          <span className="absolute -top-6 right-0 flex items-center gap-1 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {selectedElement.elementType === 'text' && <Type className="h-3 w-3" />}
            {selectedElement.elementType === 'container' && <MousePointer className="h-3 w-3" />}
            {selectedElement.elementType}
          </span>

          {/* Section move buttons */}
          {selectedElement.elementType === 'container' && (
            <div className="pointer-events-auto absolute -right-8 top-0 flex flex-col gap-1">
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600"
                title="Move up"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600"
                title="Move down"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Resize handles (corners) */}
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => (
            <div
              key={pos}
              className={cn(
                'pointer-events-auto absolute h-2.5 w-2.5 rounded-full border-2 border-blue-500 bg-white',
                pos === 'top-left' && '-left-1 -top-1 cursor-nwse-resize',
                pos === 'top-right' && '-right-1 -top-1 cursor-nesw-resize',
                pos === 'bottom-left' && '-bottom-1 -left-1 cursor-nesw-resize',
                pos === 'bottom-right' && '-bottom-1 -right-1 cursor-nwse-resize',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
