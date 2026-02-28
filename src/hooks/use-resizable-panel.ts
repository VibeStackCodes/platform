import { useCallback, useEffect, useRef, useState } from 'react'

interface UseResizablePanelOptions {
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
}

export function useResizablePanel(options?: UseResizablePanelOptions) {
  const { defaultWidth = 50, minWidth = 340, maxWidth = 75 } = options ?? {}
  const [isOpen, setIsOpen] = useState(false)
  const [width, setWidth] = useState(defaultWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newWidth = ((rect.right - e.clientX) / rect.width) * 100
      const clampedPx = Math.max(minWidth, (newWidth / 100) * rect.width)
      const clampedPct = Math.min(maxWidth, (clampedPx / rect.width) * 100)
      setWidth(clampedPct)
    }

    const handleMouseUp = () => setIsDragging(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, minWidth, maxWidth])

  return {
    isOpen,
    width,
    isDragging,
    containerRef,
    open,
    close,
    toggle,
    handleDragStart,
  }
}
