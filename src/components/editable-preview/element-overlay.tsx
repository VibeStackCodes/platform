import { useEffect, useState } from 'react'
import { useFloating, offset, shift, autoUpdate } from '@floating-ui/react'
import type { ElementInfo } from '@/hooks/use-element-interaction'

interface ElementOverlayProps {
  hoveredElement: ElementInfo | null
  selectedElement: ElementInfo | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

interface OverlayRect {
  top: number
  left: number
  width: number
  height: number
}

function getRelativeRect(el: HTMLElement, container: HTMLElement): OverlayRect {
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return {
    top: elRect.top - containerRect.top + container.scrollTop,
    left: elRect.left - containerRect.left + container.scrollLeft,
    width: elRect.width,
    height: elRect.height,
  }
}

function TagLabel({
  element,
  containerRef,
}: {
  element: ElementInfo
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { refs, floatingStyles } = useFloating({
    placement: 'top-start',
    middleware: [offset(4), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  useEffect(() => {
    refs.setReference(element.element)
  }, [element.element, refs])

  const tag = element.tagName
  const cls = element.element.classList[0]
  const label = cls ? `<${tag}.${cls}>` : `<${tag}>`

  // Only render if container is available
  if (!containerRef.current) return null

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="pointer-events-none z-50 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-mono leading-tight text-white"
    >
      {label}
    </div>
  )
}

export function ElementOverlay({
  hoveredElement,
  selectedElement,
  containerRef,
}: ElementOverlayProps) {
  const [hoverRect, setHoverRect] = useState<OverlayRect | null>(null)
  const [selectRect, setSelectRect] = useState<OverlayRect | null>(null)

  // Update hover rect
  useEffect(() => {
    if (!hoveredElement || !containerRef.current) {
      setHoverRect(null)
      return
    }
    // Don't show hover outline on the selected element
    if (selectedElement && hoveredElement.element === selectedElement.element) {
      setHoverRect(null)
      return
    }
    const rect = getRelativeRect(hoveredElement.element, containerRef.current)
    setHoverRect(rect)
  }, [hoveredElement, selectedElement, containerRef])

  // Update select rect — keep in sync with scroll/resize
  useEffect(() => {
    if (!selectedElement || !containerRef.current) {
      setSelectRect(null)
      return
    }
    const container = containerRef.current
    const el = selectedElement.element
    const updateRect = () => {
      setSelectRect(getRelativeRect(el, container))
    }
    updateRect()

    // Watch for resize of the selected element
    const ro = new ResizeObserver(updateRect)
    ro.observe(el)
    // Watch for scroll in the container
    container.addEventListener('scroll', updateRect, { passive: true })
    // Watch for window resize
    window.addEventListener('resize', updateRect)

    return () => {
      ro.disconnect()
      container.removeEventListener('scroll', updateRect)
      window.removeEventListener('resize', updateRect)
    }
  }, [selectedElement, containerRef])

  return (
    <>
      {/* Hover outline — blue dashed */}
      {hoverRect && (
        <div
          className="pointer-events-none absolute z-40 border-2 border-dashed border-blue-400 transition-all duration-75"
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}

      {/* Hover tag label */}
      {hoveredElement &&
        (!selectedElement || hoveredElement.element !== selectedElement.element) && (
          <TagLabel element={hoveredElement} containerRef={containerRef} />
        )}

      {/* Selected outline — blue solid */}
      {selectRect && (
        <div
          className="pointer-events-none absolute z-40 border-2 border-blue-500 transition-all duration-75"
          style={{
            top: selectRect.top,
            left: selectRect.left,
            width: selectRect.width,
            height: selectRect.height,
          }}
        />
      )}
    </>
  )
}
